/**
 * suanzhang-dsh Host half
 *
 * 算账 (suanzhang) — DeepSeek Harness 计费插件 Host 侧。
 * 通过 Connection 逻辑通道 `/suanzhang` 暴露若干 RPC 端点：
 *   - balance     : 查询当前 API Key 的账户余额（GET {baseURL}/user/balance）
 *   - pricing     : 抓取 DeepSeek 官方中文计价页并解析（CNY，6 小时缓存，失败回退内置价）
 *   - summary     : 跨会话 / 跨天 / 跨模型 / 跨工具 / 跨「会话=交付物」费用汇总（扫描最近 60 个会话）
 *   - today       : 今日（本地 0 点起）消费合计
 *   - capabilities: 探测各功能依赖的服务是否就绪（供前端优雅降级）
 *
 * 纯计费逻辑见 ./pricing.js（无外部依赖，可单测）。
 *
 * 传输：Host 沙箱无全局 fetch，且沙箱内 curl 有 TLS 问题，故使用 subprocess + node fetch。
 * API Key 仅经子进程**环境变量**传入，不进入命令行参数；任何返回前端的错误信息都会被
 * redactKey 剔除 Key，确保密钥不出现在日志 / 错误 / UI 中。
 *
 * 兼容性：仅把 connection 设为必需依赖，其余 dsh 内部服务（credentials / sessionQuery /
 * subprocess / sandboxPolicy / settings）在调用时惰性获取。某服务改名或缺失时，对应功能
 * 返回 code:"unavailable"（前端显示「该功能暂不可用」），而不是让整个插件加载失败、整页报错。
 *
 * @module suanzhang-dsh
 */
import { Context } from "@deepseek-ai/cordis";
import { BUILTIN, isPeakHour, mergePricing, priceFor, tokenCost, computeSummary } from "./pricing.js";

/** Cordis 插件名（loader 诊断用）。 */
export const name = "suanzhang";

/**
 * 仅声明真正必须的依赖 connection。其余服务惰性获取并优雅降级，
 * 避免某个内部服务改名/缺失导致整个插件加载失败（整页报错）。
 */
export const inject = ["connection"];

/** 进程级官方计价缓存（官方页仅含 v4-flash/v4-pro，实际与 BUILTIN 合并）。 */
let pricingCache = null; // { fetchedAt, source, officialTable }
const PRICING_TTL = 6 * 3600 * 1000; // 6 小时

/** 会话扫描结果缓存（进程级，短 TTL），summary 与 today 共享，避免重复扫描 60 个会话。 */
let scanCache = null;
const SCAN_TTL = 10000; // 10 秒

/** 构造 RpcResult 成功分支。 */
function ok(value) {
  return { ok: true, value };
}

/** 构造 RpcResult 失败分支。 */
function err(message, code = "internal") {
  return { ok: false, error: { code, message, details: {} } };
}

/** 安全获取服务：未注册/抛错时返回 undefined，不让缺失的服务中断插件加载。 */
function safeGet(ctx, name) {
  try {
    return ctx.get(name);
  } catch (_) {
    return undefined;
  }
}

/** 脱敏：把可能出现的 API Key 从任意字符串中替换为 ***，防止密钥泄露到日志/错误/UI。 */
function redactKey(text, apiKey) {
  if (!apiKey || !text) return text;
  try {
    return String(text).split(String(apiKey)).join("***");
  } catch (_) {
    return text;
  }
}

/**
 * 通过 subprocess + node 执行一段脚本并返回 stdout（沙箱内唯一可靠的外网通道）。
 * @param {object} ctx
 * @param {string} script
 * @param {object} [env] 子进程环境变量（API Key 只能放这里，绝不能放命令行）
 * @param {string} [apiKey] 用于错误脱敏（可选）
 */
async function spawnNode(ctx, script, env, apiKey) {
  const subprocess = safeGet(ctx, "subprocess");
  if (subprocess === undefined) throw Object.assign(new Error("subprocess 服务不可用"), { code: "unavailable" });
  let node;
  try {
    node = await subprocess.resolveExecutable("node");
  } catch (e) {
    throw Object.assign(new Error("未找到 node：" + String((e && e.message) || e)), { code: "unavailable" });
  }
  let cwd = ".";
  try {
    const sp = safeGet(ctx, "sandboxPolicy");
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
    throw Object.assign(new Error("node 退出码 " + String(outcome.exitCode) + (errText ? "：" + redactKey(errText.slice(0, 200), apiKey) : "")), { code: "unavailable" });
  }
  return out.trim();
}

/** 解析 API Key 引用与 baseURL（跟随 llm-deepseek 设置；默认 DEEPSEEK_API_KEY / https://api.deepseek.com）。 */
async function resolveKey(ctx) {
  const settings = safeGet(ctx, "settings");
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
  const credentials = safeGet(ctx, "credentials");
  let apiKey;
  if (credentials !== undefined) {
    try {
      const resolved = await credentials.resolve(apiKeyEnv);
      apiKey = resolved && typeof resolved.value === "string" && resolved.value ? resolved.value : undefined;
    } catch (_) {}
  }
  return { apiKeyEnv, baseURL, apiKey, credentialsAvailable: credentials !== undefined };
}

/** 当前生效计价表：官方同步成功则用官方价覆盖对应模型（合并后），否则回退内置价。 */
function activeTable() {
  if (pricingCache !== null && Date.now() - pricingCache.fetchedAt < PRICING_TTL && pricingCache.officialTable) {
    return mergePricing(pricingCache.officialTable);
  }
  return BUILTIN;
}

/**
 * 扫描最近 60 个会话，归一化为统一的用量事件列表（带 sessionId）。
 * 结果带短 TTL 缓存，summary 与 today 共用。
 * @returns {{ events: Array, sessions: number }}
 */
async function getNormalizedEvents(ctx) {
  const now = Date.now();
  if (scanCache !== null && now - scanCache.fetchedAt < SCAN_TTL) return scanCache;
  const sq = safeGet(ctx, "sessionQuery");
  if (sq === undefined) throw Object.assign(new Error("sessionQuery 服务不可用"), { code: "unavailable" });
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
        sessionId: id,
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
 * @param ctx - 插件上下文（connection 已可用；其余服务惰性获取）
 * @param config - cordis.patch.yml 中该行 config（当前未使用，保持硬编码）
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
      const { apiKeyEnv, baseURL, apiKey, credentialsAvailable } = await resolveKey(ctx);
      if (!apiKey) {
        return credentialsAvailable
          ? err("未配置 API Key（" + apiKeyEnv + "）", "missing-credential")
          : err("余额查询暂不可用：credentials 服务未就绪", "unavailable");
      }
      try {
        const out = await spawnNode(
          ctx,
          BALANCE_SCRIPT,
          {
            SZ_BASE: baseURL.replace(/\/+$/, ""),
            SZ_KEY: apiKey,
          },
          apiKey,
        );
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
        const code = (e && e.code) === "unavailable" ? "unavailable" : "internal";
        return err(redactKey(String((e && e.message) || e), apiKey), code);
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

  // summary（跨会话 / 跨天 / 跨模型 / 跨工具 / 跨「会话=交付物」汇总）
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
        const agg = computeSummary(scan.events, table);
        return ok({
          sessions: scan.sessions,
          total: agg.total,
          byDay: agg.byDay,
          byModel: agg.byModel,
          byTool: agg.byTool,
          bySession: agg.bySession,
          pricingSource: source,
        });
      } catch (e) {
        const code = (e && e.code) === "unavailable" ? "unavailable" : "internal";
        return err(redactKey(String((e && e.message) || e), undefined), code);
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
        const code = (e && e.code) === "unavailable" ? "unavailable" : "internal";
        return err(redactKey(String((e && e.message) || e), undefined), code);
      }
    },
    { authority: "trusted-host" },
  );

  // capabilities（探测各功能依赖的服务是否就绪，供前端优雅降级）
  channel.handle(
    "/suanzhang",
    async (endpoint, payload, signal) => {
      void payload;
      void signal;
      if (endpoint !== "capabilities") return err("未知端点：" + endpoint, "bad-request");
      const cred = safeGet(ctx, "credentials");
      const sub = safeGet(ctx, "subprocess");
      const sp = safeGet(ctx, "sandboxPolicy");
      const sq = safeGet(ctx, "sessionQuery");
      return ok({
        balance: !!(cred && sub && sp),
        summary: !!sq,
        pricing: !!(sub && sp),
      });
    },
    { authority: "trusted-host" },
  );
}
