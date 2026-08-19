/**
 * suanzhang-dsh Client half
 *
 * 算账 (suanzhang) — DeepSeek Harness 计费插件浏览器侧。
 *   - 侧边栏底部（sidebar.footer.action）：当前余额：¥X，今天用了：¥Y；点击跳转算账页签
 *   - 会话视图「算账」页签（conversation.view）：
 *       · 顶部四格行情栏（当前余额 / 今天用了 / 累计 / 缓存命中节省）
 *       · 按步骤费用表（时间/步骤/模型/输入/缓存读/缓存写/输出/思考/费用）
 *       · Turn 分组、时间↑↓ / 费用↑↓ 排序、点击行跳转轨迹并高亮
 *       · 分析：按模型/按工具条形图、成本预测环形图
 *       · 跨会话 / 跨天汇总（柱状图 + 表格）、复制明细（TSV）
 * 视觉：OpenDesign「trading-terminal」交易终端风格（近黑深蓝 / 天空蓝 / 等宽数字 / 直角）。
 *
 * @module suanzhang-dsh/client
 */
import { React } from "react";

/** Cordis 插件名（loader 诊断用）。 */
export const name = "suanzhang";

/** 浏览器侧依赖的服务。 */
export const inject = ["connection", "sessions", "slots", "timer"];

const EMPTY_TRAJECTORY = { requests: [], eventNodes: [] };
/** 高峰时段：北京时间 9:00–12:00、14:00–18:00（官方定价页注明），其余为空闲时段。 */
function isPeakHour(hour) {
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/** 内置计价表（官方价抓取失败时回退；元/百万 tokens）。 */
const BUILTIN = {
  "deepseek-v4-flash": { peak: { hit: 0.1, miss: 3.0, out: 9.0 }, offpeak: { hit: 0.05, miss: 1.5, out: 4.5 } },
  "deepseek-v4-pro": { peak: { hit: 0.3, miss: 9.0, out: 27.0 }, offpeak: { hit: 0.15, miss: 4.5, out: 13.5 } },
  "deepseek-chat": { miss: 2.0, hit: 0.5, out: 8.0 },
  "deepseek-reasoner": { miss: 4.0, hit: 1.0, out: 16.0 },
};

function priceFor(model, startedAt, table) {
  const entry = table[model];
  if (!entry) return null;
  if (entry.peak && entry.offpeak) {
    const hour = startedAt ? new Date(startedAt).getHours() : 0;
    return {
      price: isPeakHour(hour) ? entry.peak : entry.offpeak,
      mode: isPeakHour(hour) ? "peak" : "offpeak",
    };
  }
  return { price: entry, mode: "flat" };
}

function usageOf(request) {
  const u = request && request.usage;
  if (!u) return null;
  return {
    input: Number(u.inputTokens) || 0,
    cacheRead: Number(u.cacheReadTokens) || 0,
    cacheWrite: Number(u.cacheWriteTokens) || 0,
    output: Number(u.outputTokens) || 0,
    reasoning: Number(u.reasoningTokens) || 0,
  };
}

function fmtYuan(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (v === 0) return "¥0";
  return "¥" + v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtTok(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "—";
  if (n >= 1000000) return (n / 1000000).toFixed(2) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

const h = React.createElement;

const CSS = `
.sz-root{display:flex;flex-direction:column;gap:12px;padding:14px 18px 28px;min-height:0;height:100%;overflow:auto;font:400 13px/1.45 Inter,-apple-system,'Segoe UI',system-ui,sans-serif;color:#f8fafc;box-sizing:border-box;background:#070b12}
.sz-quote{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #263246;background:#101826}
.sz-quote .cell{padding:10px 14px;border-right:1px solid #263246;display:flex;flex-direction:column;gap:3px;min-width:0}
.sz-quote .cell:last-child{border-right:none}
.sz-cell-label{font-size:10px;font-weight:500;letter-spacing:.10em;text-transform:uppercase;color:#8492a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sz-cell-value{font-family:'Roboto Mono','SF Mono',ui-monospace,Menlo,monospace;font-size:21px;font-weight:500;letter-spacing:-.01em;line-height:1.1;color:#38bdf8;font-variant-numeric:tabular-nums;white-space:nowrap}
.sz-cell-value.warn{color:#f59e0b}
.sz-cell-value .cur{font-size:12px;font-weight:400;color:#8492a6;margin-right:2px}
.sz-cell-sub{font-size:10px;color:#8492a6;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sz-cell-sub b{color:#cbd5e1;font-weight:500}
.sz-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.sz-btn{background:transparent;color:#cbd5e1;border:1px solid #263246;border-radius:0;padding:4px 12px;font-size:11px;font-weight:500;letter-spacing:.03em;cursor:pointer;transition:background 90ms cubic-bezier(.2,0,0,1),color 90ms,border-color 90ms}
.sz-btn:hover:not(:disabled){color:#f8fafc;border-color:#38bdf8;background:#162238}
.sz-btn:disabled{opacity:.4;cursor:default}
.sz-btn.on{color:#38bdf8;border-color:#38bdf8;background:rgba(56,189,248,.10)}
.sz-err{color:#ef4444;font-size:11px}
.sz-ok{color:#22c55e;font-size:11px}
.sz-card{background:#101826;border:1px solid #263246;border-radius:0;padding:12px 14px;box-sizing:border-box}
.sz-card h3{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.10em;color:#8492a6;text-transform:uppercase}
.sz-table{width:100%;border-collapse:collapse;font-size:12px}
.sz-table th,.sz-table td{text-align:left;padding:6px 8px;white-space:nowrap;font-variant-numeric:tabular-nums}
.sz-table th{font-size:10px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#8492a6;border-bottom:1px solid #263246}
.sz-table td{border-bottom:1px solid #1c2638;vertical-align:top;color:#cbd5e1;font-family:'Roboto Mono','SF Mono',ui-monospace,Menlo,monospace;font-size:11.5px;transition:background 90ms}
.sz-table tr:last-child td{border-bottom:none}
.sz-table tfoot td{font-weight:500;border-top:1px solid #263246;color:#f8fafc;background:#101826}
.sz-turn td{font-weight:600;font-size:10px;letter-spacing:.10em;color:#8492a6;background:#0d1626;padding-top:9px;padding-bottom:4px;font-family:Inter,sans-serif;text-transform:uppercase}
.sz-turn td:first-child{box-shadow:inset 2px 0 0 #38bdf8}
.sz-row{cursor:pointer}
.sz-row:hover td{background:rgba(56,189,248,.06)}
.sz-tag{display:inline-block;padding:1px 6px;border-radius:0;font-size:9.5px;letter-spacing:.05em;font-family:Inter,sans-serif;background:#162238;color:#8492a6;vertical-align:middle;border:1px solid #263246}
.sz-peak{color:#f59e0b;border-color:rgba(245,158,11,.4);background:rgba(245,158,11,.08)}
.sz-offpeak{color:#22c55e;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.08)}
.sz-empty{color:#8492a6;font-size:12px;padding:10px 0;font-family:'Roboto Mono',monospace}
.sz-bars{display:flex;flex-direction:column;gap:8px;margin-top:2px}
.sz-bar-row{display:grid;grid-template-columns:minmax(0,150px) 1fr minmax(64px,auto);gap:12px;align-items:center}
.sz-bar-name{font-size:11px;color:#8492a6;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;font-family:'Roboto Mono',monospace}
.sz-bar-track{height:5px;border-radius:0;background:#0d1626;overflow:hidden;border:1px solid #1c2638}
.sz-bar-fill{height:100%;border-radius:0;background:#38bdf8;transition:width 160ms cubic-bezier(.2,0,0,1)}
.sz-bar-val{font-size:10.5px;color:#cbd5e1;font-variant-numeric:tabular-nums;text-align:right;font-family:'Roboto Mono',monospace}
.sz-predict{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:11.5px;color:#8492a6}
.sz-predict input{width:60px;background:#0d1626;color:#f8fafc;border:1px solid #263246;border-radius:0;padding:4px 8px;font-size:11.5px;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;text-align:center}
.sz-predict input:focus{outline:none;border-color:#38bdf8}
.sz-predict b{color:#f8fafc;font-variant-numeric:tabular-nums;font-weight:500;font-family:'Roboto Mono',monospace}
.sz-ring{flex:none;display:grid;place-items:center;width:76px;height:76px;position:relative}
.sz-ring svg{position:absolute;inset:0}
.sz-ring-label{text-align:center;line-height:1.1}
.sz-ring-label .v{font-size:13px;font-weight:500;color:#f8fafc;font-variant-numeric:tabular-nums;font-family:'Roboto Mono',monospace}
.sz-ring-label .k{font-size:8.5px;color:#8492a6;letter-spacing:.10em;text-transform:uppercase}
.sz-predict-meta{display:flex;flex-direction:column;gap:8px;min-width:0}
.sz-predict-meter{height:4px;border-radius:0;background:#0d1626;overflow:hidden;border:1px solid #1c2638}
.sz-predict-meter .f{height:100%;border-radius:0;background:#f59e0b;transition:width 160ms cubic-bezier(.2,0,0,1)}
.sz-foot{font-size:10px;color:#8492a6;letter-spacing:.06em;text-transform:uppercase}
.sz-sb{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#8492a6;cursor:pointer;padding:6px 12px;border-radius:0;white-space:nowrap;overflow:hidden;min-width:0;border:1px solid transparent;transition:background 90ms,border-color 90ms}
.sz-sb:hover{background:#101826;border-color:#263246}
.sz-sb.rail{justify-content:center;padding:6px 8px;border:none}
.sz-sb-val{font-weight:500;font-variant-numeric:tabular-nums;color:#38bdf8;flex:none;font-family:'Roboto Mono',monospace}
.sz-sb-val.warn{color:#f59e0b}
.sz-sb-detail{color:#8492a6;font-size:10.5px;text-overflow:ellipsis;overflow:hidden;min-width:0}
.sz-sumtable{width:100%;border-collapse:collapse;font-size:11px;margin-top:6px}
.sz-sumtable th,.sz-sumtable td{text-align:left;padding:5px 8px;white-space:nowrap;font-variant-numeric:tabular-nums;border-bottom:1px solid #1c2638}
.sz-sumtable th{font-size:9.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#8492a6}
.sz-sumtable td{color:#cbd5e1;font-family:'Roboto Mono',monospace;font-size:10.5px}
.sz-days{display:flex;align-items:flex-end;gap:6px;height:80px;padding:10px 2px 0;border-bottom:1px solid #263246;margin-top:8px}
.sz-day{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;min-width:0}
.sz-day-track{width:100%;max-width:34px;height:54px;border-radius:0;background:#0d1626;overflow:hidden;display:flex;align-items:flex-end;border:1px solid #1c2638}
.sz-day-fill{width:100%;border-radius:0;background:#38bdf8;transition:height 160ms cubic-bezier(.2,0,0,1);min-height:2px}
.sz-day-label{font-size:9px;color:#8492a6;font-variant-numeric:tabular-nums;letter-spacing:.04em;font-family:'Roboto Mono',monospace}
.sz-day-value{font-size:9px;color:#cbd5e1;font-variant-numeric:tabular-nums;font-family:'Roboto Mono',monospace}
`;

/**
 * Cordis 浏览器侧入口。
 * @param ctx - 插件上下文（inject 声明的服务均已可用）。
 */
export function apply(ctx) {
  const connection = ctx.get("connection");
  const slots = ctx.get("slots");
  const sessions = ctx.get("sessions");
  const timer = ctx.get("timer");
  if (connection === undefined || slots === undefined || sessions === undefined || timer === undefined) return;

  const disposeStyles = ctx.effect(() => stylesInsert(CSS));

  /** 注入样式（正式插件无动态 styles 全局，手动管理 style 标签）。 */
  function stylesInsert(css) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "suanzhang-dsh";
    tag.textContent = css;
    document.head.appendChild(tag);
    return () => tag.remove();
  }

  /** 跨端 RPC：返回 { ok, value|error }（Connection 通道已由 Host 端注册）。 */
  async function rpc(endpoint, payload) {
    const result = await connection.rpc.call("/suanzhang", endpoint, payload || {});
    return result;
  }

  // ── 共享数据中枢：余额 / 今日消费 / 计价表，一处刷新全局同步 ──────────
  function makeHub() {
    const state = { value: null, listeners: new Set() };
    return {
      get: () => state.value,
      set: (v) => {
        state.value = v;
        for (const fn of [...state.listeners]) fn(v);
      },
      subscribe: (fn) => {
        state.listeners.add(fn);
        return () => state.listeners.delete(fn);
      },
    };
  }
  const balanceHub = makeHub();
  const todayHub = makeHub();
  const pricingHub = makeHub();
  let balanceInflight = false;
  let todayInflight = false;
  let pricingInflight = false;
  function fetchBalance() {
    if (balanceInflight) return;
    balanceInflight = true;
    rpc("balance", {}).then(
      (res) => {
        balanceHub.set(res && res.ok ? res.value : { ok: false, error: (res && res.error && res.error.message) || "未知错误" });
        balanceInflight = false;
      },
      (err) => {
        balanceHub.set({ ok: false, error: String((err && err.message) || err) });
        balanceInflight = false;
      },
    );
  }
  function fetchToday() {
    if (todayInflight) return;
    todayInflight = true;
    rpc("today", {}).then(
      (res) => {
        todayHub.set(res && res.ok ? res.value : { ok: false });
        todayInflight = false;
      },
      () => {
        todayHub.set({ ok: false });
        todayInflight = false;
      },
    );
  }
  function fetchPricing() {
    if (pricingInflight) return;
    pricingInflight = true;
    rpc("pricing", {}).then(
      (res) => {
        pricingHub.set(res && res.ok ? res.value : null);
        pricingInflight = false;
      },
      () => {
        pricingHub.set(null);
        pricingInflight = false;
      },
    );
  }
  function refreshAll() {
    fetchBalance();
    fetchToday();
  }
  function useHub(hub) {
    const [value, setValue] = React.useState(hub.get());
    React.useEffect(() => hub.subscribe(setValue), [hub]);
    return value;
  }
  timer.interval(() => {
    fetchBalance();
    fetchToday();
  }, 60000);

  // ── 共享 chat store：切换页签 + inspect 高亮 ───────────────────────────
  let chatStore;
  try {
    const entries = slots.entriesOfSlot("conversation.view");
    const chatEntry = entries && entries.find((e) => e && e.options && e.options.id === "chat");
    chatStore = chatEntry && chatEntry.store;
  } catch (_) {}

  // ── 图形组件 ──────────────────────────────────────────────────────────
  function BarList({ entries, max }) {
    if (entries.length === 0) return null;
    return h(
      "div",
      { className: "sz-bars" },
      entries.map(([name, value]) =>
        h(
          "div",
          { className: "sz-bar-row", key: name },
          h("span", { className: "sz-bar-name", title: name }, name),
          h("div", { className: "sz-bar-track" }, h("div", { className: "sz-bar-fill", style: { width: max > 0 ? Math.max(2, (value / max) * 100) + "%" : "2%" } })),
          h("span", { className: "sz-bar-val" }, fmtYuan(value)),
        ),
      ),
    );
  }

  function Ring({ fraction, label, value }) {
    const r = 30;
    const c = 2 * Math.PI * r;
    const dash = Math.max(0, Math.min(1, fraction || 0)) * c;
    return h(
      "div",
      { className: "sz-ring" },
      h(
        "svg",
        { width: 76, height: 76, viewBox: "0 0 76 76" },
        h("circle", { cx: 38, cy: 38, r, fill: "none", stroke: "#0d1626", strokeWidth: 6 }),
        h("circle", { cx: 38, cy: 38, r, fill: "none", stroke: "#38bdf8", strokeWidth: 6, strokeDasharray: dash + " " + c, transform: "rotate(-90 38 38)", style: { transition: "stroke-dasharray 160ms cubic-bezier(.2,0,0,1)" } }),
      ),
      h("div", { className: "sz-ring-label" }, h("div", { className: "v" }, value), h("div", { className: "k" }, label)),
    );
  }

  // ── 算账页签 ──────────────────────────────────────────────────────────
  function SuanzhangView(props) {
    const useSession = props.useSession;
    const actions = props.actions;
    const balance = useHub(balanceHub);
    const today = useHub(todayHub);
    const pricing = useHub(pricingHub);
    const [balanceError, setBalanceError] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [sortMode, setSortMode] = React.useState("time-asc");
    const [copied, setCopied] = React.useState(false);
    const [predictSteps, setPredictSteps] = React.useState(10);
    const [summary, setSummary] = React.useState(null);
    const [summaryLoading, setSummaryLoading] = React.useState(false);
    const [summaryOpen, setSummaryOpen] = React.useState(false);
    const inspection = useSession((snapshot) => (snapshot.views && snapshot.views.get("trajectory")) || EMPTY_TRAJECTORY);
    const requests = inspection && Array.isArray(inspection.requests) ? inspection.requests : [];
    const nodes = inspection && Array.isArray(inspection.eventNodes) ? inspection.eventNodes : [];

    const load = () => {
      setLoading(true);
      setBalanceError(null);
      refreshAll();
      timer.timeout(() => setLoading(false), 400);
    };
    React.useEffect(() => {
      refreshAll();
      fetchPricing();
      setLoading(false);
    }, []);

    const table = pricing && pricing.table ? pricing.table : BUILTIN;
    const pricingTag = pricing && pricing.source === "official" ? "官方价 · 自动同步 " + (pricing.fetchedAt ? fmtTime(pricing.fetchedAt) : "") : "内置价";

    const stepMeta = React.useMemo(() => {
      const map = new Map();
      for (const node of nodes) {
        if (!node || node.kind !== "assistant" || node.turn == null || node.step == null) continue;
        const key = String(node.turn) + "\u0000" + String(node.step);
        let entry = map.get(key);
        if (!entry) {
          entry = { callId: undefined, tools: [] };
          map.set(key, entry);
        }
        const blocks = node.blocks || [];
        for (const b of blocks) {
          if (b && b.kind === "tool-call") {
            if (b.callId && entry.callId === undefined) entry.callId = b.callId;
            if (b.name && entry.tools.indexOf(b.name) === -1) entry.tools.push(b.name);
          }
        }
      }
      return map;
    }, [nodes]);

    const allRows = React.useMemo(() => {
      const rows = [];
      let fallback = 0;
      for (const request of requests) {
        const usage = usageOf(request);
        if (!usage) continue;
        const isCompaction = request.purpose === "compaction";
        const model = (request.provenance && request.provenance.model) || (request.requestConfig && request.requestConfig.model) || "未知";
        const priced = priceFor(model, request.startedAt, table);
        const p = priced ? priced.price : null;
        const cost = p ? ((usage.input + usage.cacheWrite) / 1e6) * p.miss + (usage.cacheRead / 1e6) * p.hit + (usage.output / 1e6) * p.out : null;
        const saved = p ? (usage.cacheRead / 1e6) * Math.max(0, p.miss - p.hit) : 0;
        const stepKey = String(request.turn != null ? request.turn : 0) + "\u0000" + String(request.step != null ? request.step : 0);
        const meta = stepMeta.get(stepKey);
        rows.push({
          key: String(request.startSeq || ++fallback),
          seq: request.startSeq || 0,
          turn: request.turn,
          step: request.step,
          isCompaction,
          startedAt: request.startedAt,
          model,
          known: p !== null,
          mode: priced ? priced.mode : "flat",
          usage,
          cost,
          saved,
          callId: isCompaction ? undefined : meta && meta.callId,
          tools: isCompaction ? [] : meta ? meta.tools : [],
        });
      }
      return rows;
    }, [requests, stepMeta, table]);

    const displayed = React.useMemo(() => {
      if (sortMode === "cost-asc" || sortMode === "cost-desc") {
        const sign = sortMode === "cost-asc" ? 1 : -1;
        const known = allRows.filter((r) => r.cost !== null);
        const unknown = allRows.filter((r) => r.cost === null);
        known.sort((a, b) => (a.cost - b.cost) * sign);
        return { flat: [...known, ...unknown], groups: null };
      }
      const asc = sortMode !== "time-desc";
      const sorted = [...allRows].sort((a, b) => (asc ? a.seq - b.seq : b.seq - a.seq));
      const groups = [];
      let cur = null;
      for (const row of sorted) {
        const gkey = row.isCompaction && row.turn == null ? "__compaction__" : String(row.turn != null ? row.turn : 0);
        if (cur === null || cur.key !== gkey) {
          cur = { key: gkey, label: gkey === "__compaction__" ? "压缩" : "Turn " + gkey, rows: [] };
          groups.push(cur);
        }
        cur.rows.push(row);
      }
      return { flat: sorted, groups };
    }, [allRows, sortMode]);

    let total = 0;
    let savedTotal = 0;
    let pricedCount = 0;
    const byModel = new Map();
    const byTool = new Map();
    for (const r of allRows) {
      if (r.cost !== null) {
        total += r.cost;
        pricedCount += 1;
      }
      savedTotal += r.saved || 0;
      if (r.cost !== null) byModel.set(r.model, (byModel.get(r.model) || 0) + r.cost);
      if (r.cost !== null && r.tools.length > 0) {
        const share = r.cost / r.tools.length;
        for (const t of r.tools) {
          const cur = byTool.get(t) || { cost: 0, calls: 0 };
          cur.cost += share;
          cur.calls += 1;
          byTool.set(t, cur);
        }
      }
    }
    const avgPerStep = pricedCount > 0 ? total / pricedCount : 0;
    const predicted = avgPerStep * (Number(predictSteps) || 0);
    const balanceValue = balance && balance.ok ? balance.totalBalance : null;
    const predictFraction = balanceValue && Number.isFinite(balanceValue) && balanceValue > 0 ? predicted / balanceValue : 0;
    const predictFractionClamped = Number.isFinite(predictFraction) ? Math.min(1, Math.max(0, predictFraction)) : 0;

    const jump = (row) => {
      if (!actions) return;
      if (row.callId) actions.setInspect({ callId: row.callId });
      actions.setView("trajectory");
    };

    const copyDetail = () => {
      const lines = ["时间|步骤|模型|输入|缓存读|缓存写|输出|思考|费用(元)"];
      const push = (row) =>
        lines.push(
          [
            fmtTime(row.startedAt),
            row.isCompaction ? "压缩" : "step" + String(row.step != null ? row.step : ""),
            row.model,
            String(row.usage.input),
            String(row.usage.cacheRead),
            String(row.usage.cacheWrite),
            String(row.usage.output),
            String(row.usage.reasoning),
            row.cost === null ? "" : row.cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""),
          ].join("\t"),
        );
      if (displayed.groups) {
        for (const g of displayed.groups) for (const row of g.rows) push(row);
      } else {
        for (const row of displayed.flat) push(row);
      }
      lines.push("累计\t" + total.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
      const text = lines.join("\n");
      const done = () => setCopied(true);
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
      } else {
        fallbackCopy(text, done);
      }
    };
    const fallbackCopy = (text, done) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        done();
      } catch (_) {}
    };

    const loadSummary = () => {
      if (summaryLoading) return;
      setSummaryLoading(true);
      rpc("summary", {}).then(
        (res) => {
          setSummary(res && res.ok ? res.value : { ok: false, error: (res && res.error && res.error.message) || "未知错误" });
          setSummaryLoading(false);
        },
        (err) => {
          setSummary({ ok: false, error: String((err && err.message) || err) });
          setSummaryLoading(false);
        },
      );
    };

    const headCells = [
      h("th", { key: "t" }, "时间"),
      h("th", { key: "s" }, "步骤"),
      h("th", { key: "m" }, "模型"),
      h("th", { key: "i" }, "输入"),
      h("th", { key: "cr" }, "缓存读"),
      h("th", { key: "cw" }, "缓存写"),
      h("th", { key: "o" }, "输出"),
      h("th", { key: "r" }, "思考"),
      h("th", { key: "c" }, "费用"),
    ];
    const rowCells = (row) => [
      h("td", { key: "t" }, fmtTime(row.startedAt)),
      h("td", { key: "s" }, row.isCompaction ? "压缩" : "step" + String(row.step != null ? row.step : "")),
      h(
        "td",
        { key: "m" },
        row.model,
        row.known ? null : h("span", { className: "sz-tag", style: { marginLeft: 6 } }, "未计价"),
        row.mode === "peak"
          ? h("span", { className: "sz-tag sz-peak", style: { marginLeft: 6 } }, "高峰")
          : row.mode === "offpeak"
            ? h("span", { className: "sz-tag sz-offpeak", style: { marginLeft: 6 } }, "空闲")
            : null,
      ),
      h("td", { key: "i" }, fmtTok(row.usage.input)),
      h("td", { key: "cr" }, fmtTok(row.usage.cacheRead)),
      h("td", { key: "cw" }, fmtTok(row.usage.cacheWrite)),
      h("td", { key: "o" }, fmtTok(row.usage.output)),
      h("td", { key: "r" }, fmtTok(row.usage.reasoning)),
      h("td", { key: "c" }, fmtYuan(row.cost)),
    ];

    let body;
    if (displayed.flat.length === 0) {
      body = h("div", { className: "sz-empty" }, "暂无已完成的模型请求（轨迹视图为空）");
    } else if (displayed.groups) {
      const tableRows = [];
      for (const g of displayed.groups) {
        tableRows.push(h("tr", { key: g.key, className: "sz-turn" }, h("td", { colSpan: 9 }, g.label)));
        for (const row of g.rows) {
          tableRows.push(
            h("tr", { key: row.key, className: "sz-row", onClick: () => jump(row), title: row.callId ? "跳转到轨迹并高亮此步骤" : "跳转到轨迹" }, rowCells(row)),
          );
        }
      }
      body = h(
        "table",
        { className: "sz-table" },
        h("thead", null, h("tr", null, headCells)),
        h("tbody", null, tableRows),
        h("tfoot", null, h("tr", null, h("td", { colSpan: 8 }, "本会话累计（已计价 " + pricedCount + " 步）"), h("td", null, fmtYuan(total)))),
      );
    } else {
      body = h(
        "table",
        { className: "sz-table" },
        h("thead", null, h("tr", null, headCells)),
        h(
          "tbody",
          null,
          displayed.flat.map((row) =>
            h("tr", { key: row.key, className: "sz-row", onClick: () => jump(row), title: row.callId ? "跳转到轨迹并高亮此步骤" : "跳转到轨迹" }, rowCells(row)),
          ),
        ),
        h("tfoot", null, h("tr", null, h("td", { colSpan: 8 }, "本会话累计（已计价 " + pricedCount + " 步）"), h("td", null, fmtYuan(total)))),
      );
    }

    const modelEntries = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const modelMax = modelEntries.length > 0 ? modelEntries[0][1] : 0;
    const toolEntries = [...byTool.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 8);
    const toolMax = toolEntries.length > 0 ? toolEntries[0][1].cost : 0;

    // 顶部行情栏
    const balanceOk = balance && balance.ok;
    const balanceVal = balanceOk && typeof balance.totalBalance === "number" && Number.isFinite(balance.totalBalance) ? balance.totalBalance : null;
    const balanceLow = balanceVal != null && balanceVal < 20;
    const todayVal = today && typeof today.cost === "number" ? today.cost : null;
    const errorText = balanceError
      ? "余额查询失败：" + balanceError
      : balance && !balance.ok
        ? "余额查询失败：" + String(balance.error || "未知错误")
        : null;
    const quoteCells = [
      h(
        "div",
        { className: "cell", key: "balance" },
        h("span", { className: "sz-cell-label" }, "当前余额"),
        h("span", { className: "sz-cell-value" + (balanceLow ? " warn" : "") }, balanceVal != null ? h("span", null, h("span", { className: "cur" }, "¥"), balanceVal.toFixed(2)) : "—"),
        balanceOk
          ? h("span", { className: "sz-cell-sub" }, h("b", null, balance.currency), " · " + (balance.isAvailable ? "可用" : "不可用") + (balanceLow ? " · 余额偏低" : ""))
          : null,
        balanceOk
          ? h(
              "span",
              { className: "sz-cell-sub" },
              "充值 ",
              h("b", null, Number.isFinite(balance.toppedUpBalance) ? balance.toppedUpBalance.toFixed(2) : "—"),
              " · 赠送 ",
              h("b", null, Number.isFinite(balance.grantedBalance) ? balance.grantedBalance.toFixed(2) : "—"),
            )
          : null,
      ),
      h(
        "div",
        { className: "cell", key: "today" },
        h("span", { className: "sz-cell-label" }, "今天用了"),
        h("span", { className: "sz-cell-value" }, todayVal != null ? h("span", null, h("span", { className: "cur" }, "¥"), todayVal.toFixed(2)) : "—"),
        today && typeof today.steps === "number" ? h("span", { className: "sz-cell-sub" }, today.steps + " 步") : null,
      ),
      h(
        "div",
        { className: "cell", key: "total" },
        h("span", { className: "sz-cell-label" }, "累计"),
        h(
          "span",
          { className: "sz-cell-value" },
          fmtYuan(total).startsWith("¥") ? h("span", null, h("span", { className: "cur" }, "¥"), fmtYuan(total).slice(1)) : fmtYuan(total),
        ),
        h("span", { className: "sz-cell-sub" }, "已计价 ", h("b", null, pricedCount + " / " + allRows.length), " 步"),
      ),
      h(
        "div",
        { className: "cell", key: "saved" },
        h("span", { className: "sz-cell-label" }, "缓存命中节省"),
        h(
          "span",
          { className: "sz-cell-value" },
          fmtYuan(savedTotal).startsWith("¥") ? h("span", null, h("span", { className: "cur" }, "¥"), fmtYuan(savedTotal).slice(1)) : fmtYuan(savedTotal),
        ),
      ),
    ];

    let summaryView = h(
      "div",
      { className: "sz-meta" },
      h("button", { className: "sz-btn", disabled: summaryLoading, onClick: loadSummary }, summaryLoading ? "汇总中…" : "加载跨会话 / 跨天汇总"),
    );
    if (summaryOpen && summary !== null) {
      if (!summary.ok) {
        summaryView = h("div", { className: "sz-err" }, "汇总失败：" + String(summary.error || "未知错误"));
      } else {
        const days = summary.byDay || [];
        const dayMax = days.reduce((m, d) => Math.max(m, d.cost || 0), 0);
        const dayBars =
          days.length > 0
            ? h(
                "div",
                { className: "sz-days" },
                days.map((d) =>
                  h(
                    "div",
                    { className: "sz-day", key: d.day },
                    h("div", { className: "sz-day-value" }, fmtYuan(d.cost)),
                    h("div", { className: "sz-day-track" }, h("div", { className: "sz-day-fill", style: { height: dayMax > 0 ? Math.max(4, (d.cost / dayMax) * 100) + "%" : "4%" } })),
                    h("div", { className: "sz-day-label" }, d.day.slice(5)),
                  ),
                ),
              )
            : null;
        const dayRows = days.map((d) =>
          h("tr", { key: d.day }, h("td", null, d.day), h("td", null, d.steps + " 步"), h("td", null, fmtYuan(d.cost)), h("td", null, fmtYuan(d.costPer ? d.costPer : 0))),
        );
        const modelRows = (summary.byModel || []).map((m) =>
          h("tr", { key: m.model }, h("td", null, m.model), h("td", null, m.steps + " 步"), h("td", null, fmtYuan(m.cost))),
        );
        const toolRows = (summary.byTool || []).map((t) =>
          h("tr", { key: t.tool }, h("td", null, t.tool), h("td", null, t.calls + " 次"), h("td", null, fmtYuan(t.cost))),
        );
        summaryView = h(
          "div",
          null,
          h(
            "div",
            { className: "sz-meta", style: { marginTop: 4 } },
            h("span", { className: "sz-cell-sub" }, "会话 ", h("b", null, String(summary.sessions || 0))),
            h("span", { className: "sz-cell-sub" }, "总步骤 ", h("b", null, String(summary.total ? summary.total.steps : 0))),
            h("span", { className: "sz-cell-sub" }, "累计 ", h("b", null, fmtYuan(summary.total ? summary.total.cost : 0))),
          ),
          h("h3", { style: { marginTop: 14 } }, "按天"),
          dayBars,
          h(
            "table",
            { className: "sz-sumtable", style: { marginTop: 8 } },
            h("thead", null, h("tr", null, h("th", null, "日期"), h("th", null, "步骤"), h("th", null, "费用"), h("th", null, "平均/步"))),
            h("tbody", null, dayRows),
          ),
          h("h3", { style: { marginTop: 14 } }, "按模型"),
          h(
            "table",
            { className: "sz-sumtable" },
            h("thead", null, h("tr", null, h("th", null, "模型"), h("th", null, "步骤"), h("th", null, "费用"))),
            h("tbody", null, modelRows),
          ),
          h("h3", { style: { marginTop: 14 } }, "按工具"),
          h(
            "table",
            { className: "sz-sumtable" },
            h("thead", null, h("tr", null, h("th", null, "工具"), h("th", null, "调用"), h("th", null, "费用"))),
            h("tbody", null, toolRows),
          ),
        );
      }
    }

    return h(
      "div",
      { className: "sz-root" },
      h("div", { className: "sz-quote" }, quoteCells),
      errorText ? h("div", { className: "sz-err" }, errorText) : null,
      h(
        "div",
        { className: "sz-meta" },
        h("button", { className: "sz-btn", disabled: loading, onClick: load }, loading ? "查询中…" : "刷新余额"),
        h("button", { className: "sz-btn" + (sortMode === "time-asc" ? " on" : ""), onClick: () => setSortMode("time-asc") }, "时间↑"),
        h("button", { className: "sz-btn" + (sortMode === "time-desc" ? " on" : ""), onClick: () => setSortMode("time-desc") }, "时间↓"),
        h("button", { className: "sz-btn" + (sortMode === "cost-asc" ? " on" : ""), onClick: () => setSortMode("cost-asc") }, "费用↑"),
        h("button", { className: "sz-btn" + (sortMode === "cost-desc" ? " on" : ""), onClick: () => setSortMode("cost-desc") }, "费用↓"),
        h("button", { className: "sz-btn", onClick: copyDetail }, copied ? "已复制" : "复制明细"),
        h("span", { className: "sz-tag" }, pricingTag),
        balance && balance.ok ? h("span", { className: "sz-ok" }, "已更新") : null,
      ),
      h(
        "div",
        { className: "sz-card" },
        h("h3", null, "按步骤费用（人民币 · 点击行跳转轨迹）"),
        body,
      ),
      h(
        "div",
        { className: "sz-card" },
        h("h3", null, "分析"),
        h("div", { className: "sz-foot", style: { marginBottom: 8 } }, "按模型"),
        h(BarList, { entries: modelEntries, max: modelMax }),
        h("div", { className: "sz-foot", style: { marginTop: 12, marginBottom: 8 } }, "按工具（步骤费用均摊）"),
        byTool.size === 0
          ? h("span", { className: "sz-empty" }, "本会话暂无工具调用")
          : h(BarList, { entries: toolEntries.map(([t, v]) => [t, v.cost]), max: toolMax }),
        h("div", { className: "sz-foot", style: { marginTop: 12, marginBottom: 8 } }, "成本预测"),
        h(
          "div",
          { className: "sz-predict" },
          h(Ring, { fraction: predictFractionClamped, label: "平均每步", value: fmtYuan(avgPerStep) }),
          h(
            "div",
            { className: "sz-predict-meta" },
            h("div", { className: "sz-predict-meter" }, h("div", { className: "f", style: { width: predictFractionClamped * 100 + "%" } })),
            h("div", null, "平均每步 ", h("b", null, fmtYuan(avgPerStep))),
            h(
              "div",
              null,
              "再聊",
              h("input", { type: "number", min: 0, value: predictSteps, onChange: (e) => setPredictSteps(e.target.value) }),
              "步约 ",
              h("b", null, fmtYuan(predicted)),
            ),
          ),
        ),
      ),
      h(
        "div",
        { className: "sz-card" },
        h(
          "div",
          { className: "sz-meta", style: { justifyContent: "space-between" } },
          h("h3", { style: { margin: 0 } }, "跨会话 / 跨天汇总"),
          h(
            "button",
            {
              className: "sz-btn" + (summaryOpen ? " on" : ""),
              onClick: () => {
                setSummaryOpen(!summaryOpen);
                if (!summaryOpen && summary === null) loadSummary();
              },
            },
            summaryOpen ? "收起" : "展开",
          ),
        ),
        summaryOpen ? summaryView : null,
      ),
    );
  }

  // ── 侧边栏：共享数据中枢；点击整条跳转到算账页签 ─────────────────────
  function SidebarBalance(props) {
    const wide = props && props.wide;
    const useSessions = props && props.useSessions;
    const balance = useHub(balanceHub);
    const today = useHub(todayHub);
    const [error, setError] = React.useState(null);
    const currentSessionId = useSessions ? useSessions((s) => s && s.current) : undefined;
    React.useEffect(() => {
      refreshAll();
      return balanceHub.subscribe((v) => setError(v && !v.ok ? String(v.error || "") : ""));
    }, []);
    const value = balance ? balance.totalBalance : null;
    const todayCost = today && typeof today.cost === "number" ? today.cost : null;
    const low = value != null && value < 20;
    const goToTab = () => {
      refreshAll();
      if (currentSessionId && chatStore) {
        try {
          const instance = slots.resolveStore(chatStore, currentSessionId);
          if (instance && instance.actions) instance.actions.setView("suanzhang");
        } catch (_) {}
      }
    };
    return h(
      "div",
      {
        className: "sz-sb" + (wide ? "" : " rail"),
        title: "suanzhang · 跳转到算账",
        onClick: goToTab,
      },
      wide
        ? [
            h("span", { className: "sz-sb-detail" }, "当前余额："),
            h("span", { className: "sz-sb-val" + (low ? " warn" : "") }, value != null ? "¥" + value.toFixed(2) : "—"),
            h("span", { className: "sz-sb-detail" }, "，今天用了："),
            h("span", { className: "sz-sb-val" }, todayCost != null ? "¥" + todayCost.toFixed(2) : "—"),
          ]
        : h("span", { className: "sz-sb-val" + (low ? " warn" : "") }, value != null ? "¥" + value.toFixed(2) : "—"),
    );
  }

  // ── 注册槽位 ──────────────────────────────────────────────────────────
  slots.inject("conversation.view", () =>
    slots.register(
      {
        name: "conversation.view",
        id: "suanzhang",
        order: 20,
        label: "算账",
        ...(chatStore !== undefined ? { store: chatStore } : {}),
      },
      (props) => h(SuanzhangView, props),
    ),
  );

  slots.inject("sidebar.footer.action", () =>
    slots.register(
      {
        name: "sidebar.footer.action",
        id: "cordis-panel",
        order: 0,
      },
      (props) => h(SidebarBalance, props),
    ),
  );

  // 插件卸载时移除样式
  ctx.effect(() => disposeStyles, "suanzhang styles");
}
