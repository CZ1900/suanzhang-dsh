/**
 * suanzhang-dsh Host half
 *
 * 算账 (suanzhang) — DeepSeek Harness 计费插件 Host 侧。
 * 提供三个浏览器端 RPC 端点（通过 Connection 逻辑通道 `/suanzhang` 暴露）：
 *   - balance : 查询当前 API Key 的账户余额（GET {baseURL}/user/balance）
 *   - pricing : 抓取 DeepSeek 官方中文计价页并解析（CNY，6 小时缓存，失败回退内置价）
 *   - summary  : 跨会话 / 跨天 / 跨模型 / 跨工具费用汇总（扫描最近 60 个会话日志）
 *   - today    : 今日（本地 0 点起）消费合计
 *
 * 传输：Host 沙箱无全局 fetch，且沙箱内 curl 有 TLS 问题，故使用 subprocess + node fetch。
 * Key 经子进程环境变量传入，不进入命令行。
 *
 * @module suanzhang-dsh
 */
import { Context } from "@deepseek-ai/cordis";

/** Cordis 插件名（loader 诊断用）。 */
export const name = "suanzhang";

/** 插件依赖的服务（缺一不可，声明后 cordis 会等待其可用）。 */
export const inject = [
  "connection",
  "credentials",
  "settings",
  "subprocess",
  "sandboxPolicy",
  "sessionQuery",
];

/**
 * 峰谷计价：高峰时段为北京时间 9:00–12:00、14:00–18:00（官方定价页注明），
 * 其余为空闲时段。getHours() 取本地时区，用户处于 UTC+8，等同北京时间。
 */
function isPeakHour(hour) {
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** 内置计价表（官方抓取失败时的回退；元/百万 tokens）。 */
const BUILTIN = {
  "deepseek-v4-flash": { peak: { hit: 0.1, miss: 3.0, out: 9.0 }, offpeak: { hit: 0.05, miss: 1.5, out: 4.5 } },
  "deepseek-v4-pro": { peak: { hit: 0.3, miss: 9.0, out: 27.0 }, offpeak: { hit: 0.15, miss: 4.5, out: 13.5 } },
  "deepseek-chat": { miss: 2.0, hit: 0.5, out: 8.0 },
  "deepseek-reasoner": { miss: 4.0, hit: 1.0, out: 16.0 },
};

/**
 * 官方计价页缓存（进程级）。
 * 官方页仅列出 v4-flash / v4-pro 两个模型，因此只保存解析到的 officialTable，
 * 实际计价时与 BUILTIN 合并，避免 chat / reasoner 等未被官方页覆盖的模型丢失计价。
 */
let pricingCache = null; // { fetchedAt, source, officialTable }
const PRICING_TTL = 6 * 3600 * 1000; // 6 小时

/** 会话扫描结果缓存（进程级，短 TTL），summary 与 today 共享，避免重复扫描 60 个会话。 */
let scanCache = null;
const SCAN_TTL = 10000; // 10 秒

/** 合并官方价与内置价：官方页仅含 v4-flash/v4-pro，其余模型（chat/reasoner）保留内置价。 */
function mergePricing(officialTable) {
  const merged = {};
  for (const k of Object.keys(BUILTIN)) merged[k] = BUILTIN[k];
  if (officialTable) {
    for (const k of Object.keys(officialTable)) merged[k] = officialTable[k];
  }
  return merged;
}

/** 当前生效计价表：官方同步成功则用官方价覆盖对应模型（合并后），否则回退内置价。 */
function activeTable() {
  if (pricingCache !== null && Date.now() - pricingCache.fetchedAt < PRICING_TTL && pricingCache.officialTable) {
    return mergePricing(pricingCache.officialTable);
  }
  return BUILTIN;
}

/** 构造 RpcResult 成功分支。 */
function ok(value) {
  return { ok: true, value };
}

/** 构造 RpcResult 失败分支。 */
function err(message, code = "internal") {
  return { ok: false, error: { code, message, details: {} } };
}

/** 通过 subprocess + node 执行一段脚本并返回 stdout（沙箱内唯一可靠的外网通道）。 */
async function spawnNode(ctx, script, env) {
  const subprocess = ctx.get("subprocess");
  if (subprocess === undefined) throw new Error("subprocess 服务不可用");
  let node;
  try {
    node = await subprocess.resolveExecutable("node");
  } catch (e) {
    throw new Error("未找到 node：" + String((e && e.message) || e));
  }
  let cwd = ".";
  try {
    const sp = ctx.get("sandboxPolicy");
    if (sp && typeof sp.workspaceRoot === "string") cwd = sp.workspaceRoot;
  } catch (_) {}
  const handle = subprocess.spawn({
    argv: [node, "-e", script],
    cwd,
    ...(env ? { env } : {}),
    stdio: { stdin: "ignore", stdout: { maxBytes: 1 << 20 }, stderr: { maxBytes: 1 << 16 } },
    graceMs: 15000,
  });
  const outcome = await handle.done;
  const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : "";
  const errText = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : "";
  if (outcome.exitCode !== 0) {
    throw new Error("node 退出码 " + String(outcome.exitCode) + (errText ? "：" + errText.slice(0, 200) : ""));
  }
  return out.trim();
}

/** 解析 API Key 引用与 baseURL（跟随 llm-deepseek 设置；默认 DEEPSEEK_API_KEY / https://api.deepseek.com）。 */
async function resolveKey(ctx) {
  const settings = ctx.get("settings");
  let apiKeyEnv = "DEEPSEEK_API_KEY";
  let baseURL = "https://api.deepseek.com";
  if (settings !== undefined) {
    try {
      const cfg = settings.get("llm-deepseek");
      if (cfg && typeof cfg === "object") {
        if (typeof cfg.apiKeyEnv === "string" && cfg.apiKeyEnv) apiKeyEnv = cfg.apiKeyEnv;
        if (typeof cfg.baseURL === "string" && cfg.baseURL) baseURL = cfg.baseURL;
      }
    } catch (_) {}
  }
  const credentials = ctx.get("credentials");
  let apiKey;
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(apiKeyEnv);
      apiKey = resolved && typeof resolved.value === "string" && resolved.value ? resolved.value : undefined;
    } catch (_) {}
  }
  return { apiKeyEnv, baseURL, apiKey };
}

/** 依据模型与时间选价（峰谷自动判定）。 */
function priceFor(model, time, table) {
  const entry = table[model];
  if (!entry) return null;
  if (entry.peak && entry.offpeak) {
    const hour = time ? new Date(time).getHours() : 0;
    return isPeakHour(hour) ? entry.peak : entry.offpeak;
  }
  return entry;
}

/**
 * 一次用量 → 费用（元）。
 *
 * 注意：dsh 的 usage.outputTokens 已包含 reasoningTokens（思考 token 是输出的子集，
 * 轨迹 UI 以 Output = Reasoning + Content 展示）。DeepSeek 按输出单价对全部输出计费，
 * 因此只需用 u.output 计费，切勿再把 reasoning 单独相加，否则会重复计费。
 */
function tokenCost(u, price) {
  return ((u.input + u.cacheWrite) / 1e6) * price.miss + (u.cacheRead / 1e6) * price.hit + (u.output / 1e6) * price.out;
}

/**
 * 扫描最近 60 个会话，归一化为统一的用量事件列表。
 * 结果带短 TTL 缓存，summary 与 today 共用，避免两次独立全量扫描。
 * @returns {{ events: Array, sessions: number }}
 */
async function getNormalizedEvents(ctx) {
  const now = Date.now();
  if (scanCache !== null && now - scanCache.fetchedAt < SCAN_TTL) return scanCache;
  const sq = ctx.get("sessionQuery");
  if (sq === undefined) throw new Error("sessionQuery 服务不可用");
  const records = await sq.listSessions();
  const capped = (Array.isArray(records) ? records : []).slice(0, 60);
  const events = [];
  let sessions = 0;
  for (const rec of capped) {
    const id = rec && rec.header ? rec.header.id : undefined;
    if (!id) continue;
    let snap;
    try {
      snap = await sq.readSession(id);
    } catch (_) {
      continue;
    }
    sessions += 1;
    const evs = snap && Array.isArray(snap.events) ? snap.events : [];
    for (const ev of evs) {
      if (!ev || ev.type !== "assistant/message" || !ev.data || !ev.data.usage) continue;
      const usage = ev.data.usage;
      const blocks = ev.data.message && Array.isArray(ev.data.message.content) ? ev.data.message.content : [];
      const tools = [];
      for (const b of blocks) {
        if (b && b.type === "tool-call" && b.name && tools.indexOf(b.name) === -1) tools.push(b.name);
      }
      events.push({
        time: typeof ev.time === "number" ? ev.time : Date.now(),
        model: ev.data.message && ev.data.message.source ? String(ev.data.message.source.model) : "未知",
        usage: {
          input: Number(usage.inputTokens) || 0,
          cacheRead: Number(usage.cacheReadTokens) || 0,
          cacheWrite: Number(usage.cacheWriteTokens) || 0,
          output: Number(usage.outputTokens) || 0,
          reasoning: Number(usage.reasoningTokens) || 0,
        },
        tools,
      });
    }
  }
  scanCache = { fetchedAt: now, events, sessions };
  return scanCache;
}

/**
 * Cordis 插件入口。
 * @param ctx - 插件上下文（inject 声明的服务均已可用）。
 * @param config - cordis.patch.yml 中该行 config（当前未使用，保持硬编码）。
 */
export function apply(ctx, config) {
  void config;

  // ── 余额查询 ──────────────────────────────────────────────────────────
  const BALANCE_SCRIPT = `
const u = process.env.SZ_BASE + '/user/balance';
const k = process.env.SZ_KEY;
fetch(u, { headers: { Authorization: 'Bearer ' + k }, signal: AbortSignal.timeout(15000) })
  .then(r => r.text().then(t => console.log(JSON.stringify({ status: r.status, body: t }))))
  .catch(e => { console.log('ERR ' + String(e && e.message || e)); process.exit(1); });
`;

  // ── 官方计价页抓取解析 ────────────────────────────────────────────────
  const PRICING_SCRIPT = `
const u = process.env.SZ_PRICING_URL;
fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
  .then(r => r.text())
  .then(t => {
    const norm = t.replace(/<t[dh][^>]*>/g, '|').replace(/<\\/t[dh]>/g, '|').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').replace(/\\|\\s+/g, '|').replace(/\\s+\\|/g, '|');
    const m = norm.match(/<table[\\s\\S]*?<\\/table>/);
    const table = m ? m[0] : norm;
    const models = [];
    const re = /deepseek-[a-z0-9-]+/g;
    let mm;
    while ((mm = re.exec(table)) && models.length < 8) { if (models.indexOf(mm[0]) === -1) models.push(mm[0]); }
    function pricesFor(header) {
      const idx = table.indexOf(header);
      if (idx === -1) return null;
      const seg = table.slice(idx, idx + 500);
      const off = seg.match(/空闲时段\\|+([\\d.]+)元\\|+([\\d.]+)元/);
      const peak = seg.match(/高峰时段\\|+([\\d.]+)元\\|+([\\d.]+)元/);
      if (!off || !peak) return null;
      return { offpeak: [Number(off[1]), Number(off[2])], peak: [Number(peak[1]), Number(peak[2])] };
    }
    const hit = pricesFor('百万tokens输入（缓存命中）');
    const miss = pricesFor('百万tokens输入（缓存未命中）');
    const out = pricesFor('百万tokens输出');
    console.log(JSON.stringify({ models, hit, miss, out }));
  })
  .catch(e => { console.log('ERR ' + String(e && e.message || e)); process.exit(1); });
`;

  const channel = ctx.get("connection")?.rpc;
  if (channel === undefined) return;

  // balance
  channel.handle(
    "/suanzhang",
    async (endpoint, payload, signal) => {
      void payload;
      void signal;
      if (endpoint !== "balance") return err("未知端点：" + endpoint, "bad-request");
      const { apiKeyEnv, baseURL, apiKey } = await resolveKey(ctx);
      if (!apiKey) return err("未配置 API Key（" + apiKeyEnv + "）", "missing-credential");
      try {
        const out = await spawnNode(ctx, BALANCE_SCRIPT, {
          SZ_BASE: baseURL.replace(/\/+$/, ""),
          SZ_KEY: apiKey,
        });
        if (out.startsWith("ERR")) return err(out.slice(4));
        const parsed = JSON.parse(out);
        if (parsed.status < 200 || parsed.status >= 300) {
          let msg = parsed.body || "";
          try {
            const e = JSON.parse(parsed.body);
            if (e && e.error) msg = String(e.error.message || e.error.type || e.error);
          } catch (_) {}
          return err("HTTP " + parsed.status + "：" + msg.slice(0, 200));
        }
        const data = JSON.parse(parsed.body);
        const infos = Array.isArray(data.balance_infos) ? data.balance_infos : [];
        const info = infos.find((i) => i && i.currency === "CNY") || infos[0];
        if (!info) return err("响应中没有余额信息");
        return ok({
          isAvailable: data.is_available !== false,
          currency: info.currency || "CNY",
          totalBalance: Number(info.total_balance),
          grantedBalance: Number(info.granted_balance),
          toppedUpBalance: Number(info.topped_up_balance),
        });
      } catch (e) {
        return err(String((e && e.message) || e));
      }
    },
    { authority: "trusted-host" },
  );

  // pricing（官方价自动同步，与内置价合并）
  channel.handle(
    "/suanzhang",
    async (endpoint, payload, signal) => {
      void payload;
      void signal;
      if (endpoint !== "pricing") return err("未知端点：" + endpoint, "bad-request");
      if (pricingCache !== null && Date.now() - pricingCache.fetchedAt < PRICING_TTL) {
        return ok({ source: pricingCache.source, fetchedAt: pricingCache.fetchedAt, table: mergePricing(pricingCache.officialTable) });
      }
      try {
        const out = await spawnNode(ctx, PRICING_SCRIPT, {
          SZ_PRICING_URL: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
        });
        if (out.startsWith("ERR")) throw new Error(out.slice(4));
        const p = JSON.parse(out);
        // 防御性消费：仅当某模型的三段（命中/未命中/输出）价格都完整且为有效数字时才采用，
        // 否则该模型回退内置价（经 mergePricing）。避免解析错位导致错价或丢价。
        const officialTable = {};
        for (let i = 0; i < p.models.length; i++) {
          const id = p.models[i];
          const h = p.hit, mi = p.miss, o = p.out;
          if (!h || !mi || !o) continue;
          const hp = h.peak && h.peak[i], hoff = h.offpeak && h.offpeak[i];
          const mp = mi.peak && mi.peak[i], moff = mi.offpeak && mi.offpeak[i];
          const op = o.peak && o.peak[i], ooff = o.offpeak && o.offpeak[i];
          if ([hp, hoff, mp, moff, op, ooff].some((v) => typeof v !== "number" || !isFinite(v))) continue;
          officialTable[id] = {
            peak: { hit: hp, miss: mp, out: op },
            offpeak: { hit: hoff, miss: moff, out: ooff },
          };
        }
        if (Object.keys(officialTable).length === 0) throw new Error("官方价解析为空");
        pricingCache = { fetchedAt: Date.now(), source: "official", officialTable };
        return ok({ source: "official", fetchedAt: pricingCache.fetchedAt, table: mergePricing(officialTable) });
      } catch (e) {
        return ok({ source: "builtin", fetchedAt: 0, table: BUILTIN, warning: String((e && e.message) || e) });
      }
    },
    { authority: "trusted-host" },
  );

  // summary（跨会话 / 跨天汇总）
  channel.handle(
    "/suanzhang",
    async (endpoint, payload, signal) => {
      void payload;
      void signal;
      if (endpoint !== "summary") return err("未知端点：" + endpoint, "bad-request");
      const table = activeTable();
      const source = pricingCache && pricingCache.source === "official" ? "official" : "builtin";
      try {
        const scan = await getNormalizedEvents(ctx);
        const events = scan.events;
        const byDay = new Map();
        const byModel = new Map();
        const byTool = new Map();
        const total = { cost: 0, steps: 0 };
        for (const ev of events) {
          const u = ev.usage;
          const model = ev.model;
          const time = ev.time;
          const d = new Date(time);
          const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
          const price = priceFor(model, time, table);
          const cost = price ? tokenCost(u, price) : 0;
          total.cost += cost;
          total.steps += 1;
          const db = byDay.get(day) || { day, steps: 0, cost: 0 };
          db.steps += 1;
          db.cost += cost;
          byDay.set(day, db);
          const mb = byModel.get(model) || { model, steps: 0, cost: 0 };
          mb.steps += 1;
          mb.cost += cost;
          byModel.set(model, mb);
          if (ev.tools.length > 0 && cost > 0) {
            const share = cost / ev.tools.length;
            for (const t of ev.tools) {
              const cur = byTool.get(t) || { tool: t, calls: 0, cost: 0 };
              cur.calls += 1;
              cur.cost += share;
              byTool.set(t, cur);
            }
          }
        }
        const dayArr = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
        for (const d of dayArr) d.costPer = d.steps > 0 ? d.cost / d.steps : 0;
        return ok({
          sessions: scan.sessions,
          total,
          byDay: dayArr,
          byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost),
          byTool: [...byTool.values()].sort((a, b) => b.cost - a.cost),
          pricingSource: source,
        });
      } catch (e) {
        return err(String((e && e.message) || e));
      }
    },
    { authority: "trusted-host" },
  );

  // today（今日消费）
  channel.handle(
    "/suanzhang",
    async (endpoint, payload, signal) => {
      void payload;
      void signal;
      if (endpoint !== "today") return err("未知端点：" + endpoint, "bad-request");
      const table = activeTable();
      try {
        const scan = await getNormalizedEvents(ctx);
        const now = new Date();
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        let cost = 0;
        let steps = 0;
        for (const ev of scan.events) {
          const time = ev.time;
          if (time < dayStart) continue;
          const price = priceFor(ev.model, time, table);
          if (price) cost += tokenCost(ev.usage, price);
          steps += 1;
        }
        return ok({ cost, steps });
      } catch (e) {
        return err(String((e && e.message) || e));
      }
    },
    { authority: "trusted-host" },
  );
}
