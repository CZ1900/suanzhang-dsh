window.__ModuleLoader__.load({
  id: "suanzhang-dsh",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var name = "suanzhang";
var inject = ["connection", "sessions", "slots", "timer"];
var EMPTY_TRAJECTORY = { requests: [], eventNodes: [] };
function isPeakHour(hour) {
  return hour >= 9 && hour < 12 || hour >= 14 && hour < 18;
}
var BUILTIN = {
  "deepseek-v4-flash": { peak: { hit: 0.1, miss: 3, out: 9 }, offpeak: { hit: 0.05, miss: 1.5, out: 4.5 } },
  "deepseek-v4-pro": { peak: { hit: 0.3, miss: 9, out: 27 }, offpeak: { hit: 0.15, miss: 4.5, out: 13.5 } },
  "deepseek-chat": { miss: 2, hit: 0.5, out: 8 },
  "deepseek-reasoner": { miss: 4, hit: 1, out: 16 }
};
function priceFor(model, startedAt, table) {
  const entry = table[model];
  if (!entry) return null;
  if (entry.peak && entry.offpeak) {
    const hour = startedAt ? new Date(startedAt).getHours() : 0;
    return {
      price: isPeakHour(hour) ? entry.peak : entry.offpeak,
      mode: isPeakHour(hour) ? "peak" : "offpeak"
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
    reasoning: Number(u.reasoningTokens) || 0
  };
}
function fmtYuan(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "\u2014";
  if (v === 0) return "\xA50";
  return "\xA5" + v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
function fmtTok(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "\u2014";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}
function fmtTime(ms) {
  if (!ms || !Number.isFinite(ms)) return "\u2014";
  const d = new Date(ms);
  const p = (x) => String(x).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
var h = import_react.default.createElement;
var CSS = `
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
.sz-warn{color:#f59e0b;font-size:11px}
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
function apply(ctx) {
  const connection = ctx.get("connection");
  const slots = ctx.get("slots");
  const sessions = ctx.get("sessions");
  const timer = ctx.get("timer");
  if (connection === void 0 || slots === void 0 || sessions === void 0 || timer === void 0) return;
  const disposeStyles = ctx.effect(() => stylesInsert(CSS));
  function stylesInsert(css) {
    const tag = document.createElement("style");
    tag.dataset.plugin = "suanzhang-dsh";
    tag.textContent = css;
    document.head.appendChild(tag);
    return () => tag.remove();
  }
  async function rpc(endpoint, payload) {
    const result = await connection.rpc.call("/suanzhang", endpoint, payload || {});
    return result;
  }
  function makeHub() {
    const state = { value: null, listeners: /* @__PURE__ */ new Set() };
    return {
      get: () => state.value,
      set: (v) => {
        state.value = v;
        for (const fn of [...state.listeners]) fn(v);
      },
      subscribe: (fn) => {
        state.listeners.add(fn);
        return () => state.listeners.delete(fn);
      }
    };
  }
  const balanceHub = makeHub();
  const todayHub = makeHub();
  const pricingHub = makeHub();
  const capabilitiesHub = makeHub();
  let balanceInflight = false;
  let todayInflight = false;
  let pricingInflight = false;
  let capsInflight = false;
  function fetchBalance() {
    if (balanceInflight) return;
    balanceInflight = true;
    rpc("balance", {}).then(
      (res) => {
        balanceHub.set(res && res.ok ? res.value : { ok: false, error: res && res.error && res.error.message || "\u672A\u77E5\u9519\u8BEF" });
        balanceInflight = false;
      },
      (err) => {
        balanceHub.set({ ok: false, error: String(err && err.message || err) });
        balanceInflight = false;
      }
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
      }
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
      }
    );
  }
  function fetchCapabilities() {
    if (capsInflight) return;
    capsInflight = true;
    rpc("capabilities", {}).then(
      (res) => {
        capabilitiesHub.set(res && res.ok ? res.value : null);
        capsInflight = false;
      },
      () => {
        capabilitiesHub.set(null);
        capsInflight = false;
      }
    );
  }
  function refreshAll() {
    fetchBalance();
    fetchToday();
  }
  function useHub(hub) {
    const [value, setValue] = import_react.default.useState(hub.get());
    import_react.default.useEffect(() => hub.subscribe(setValue), [hub]);
    return value;
  }
  timer.interval(() => {
    fetchBalance();
    fetchToday();
  }, 6e4);
  let chatStore;
  try {
    const entries = slots.entriesOfSlot("conversation.view");
    const chatEntry = entries && entries.find((e) => e && e.options && e.options.id === "chat");
    chatStore = chatEntry && chatEntry.store;
  } catch (_) {
  }
  function BarList({ entries, max }) {
    if (entries.length === 0) return null;
    return h(
      "div",
      { className: "sz-bars" },
      entries.map(
        ([name2, value]) => h(
          "div",
          { className: "sz-bar-row", key: name2 },
          h("span", { className: "sz-bar-name", title: name2 }, name2),
          h("div", { className: "sz-bar-track" }, h("div", { className: "sz-bar-fill", style: { width: max > 0 ? Math.max(2, value / max * 100) + "%" : "2%" } })),
          h("span", { className: "sz-bar-val" }, fmtYuan(value))
        )
      )
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
        h("circle", { cx: 38, cy: 38, r, fill: "none", stroke: "#38bdf8", strokeWidth: 6, strokeDasharray: dash + " " + c, transform: "rotate(-90 38 38)", style: { transition: "stroke-dasharray 160ms cubic-bezier(.2,0,0,1)" } })
      ),
      h("div", { className: "sz-ring-label" }, h("div", { className: "v" }, value), h("div", { className: "k" }, label))
    );
  }
  function SuanzhangView(props) {
    const useSession = props.useSession;
    const actions = props.actions;
    const balance = useHub(balanceHub);
    const today = useHub(todayHub);
    const pricing = useHub(pricingHub);
    const capabilities = useHub(capabilitiesHub);
    const [balanceError, setBalanceError] = import_react.default.useState(null);
    const [loading, setLoading] = import_react.default.useState(false);
    const [sortMode, setSortMode] = import_react.default.useState("time-asc");
    const [copied, setCopied] = import_react.default.useState(false);
    const [predictSteps, setPredictSteps] = import_react.default.useState(10);
    const [summary, setSummary] = import_react.default.useState(null);
    const [summaryLoading, setSummaryLoading] = import_react.default.useState(false);
    const [summaryOpen, setSummaryOpen] = import_react.default.useState(false);
    const inspection = useSession((snapshot) => snapshot.views && snapshot.views.get("trajectory") || EMPTY_TRAJECTORY);
    const requests = inspection && Array.isArray(inspection.requests) ? inspection.requests : [];
    const nodes = inspection && Array.isArray(inspection.eventNodes) ? inspection.eventNodes : [];
    const load = () => {
      setLoading(true);
      setBalanceError(null);
      refreshAll();
      timer.timeout(() => setLoading(false), 400);
    };
    import_react.default.useEffect(() => {
      refreshAll();
      fetchPricing();
      fetchCapabilities();
      setLoading(false);
    }, []);
    const table = pricing && pricing.table ? pricing.table : BUILTIN;
    const pricingTag = capabilities && capabilities.pricing === false ? "\u8BA1\u4EF7\u529F\u80FD\u6682\u4E0D\u53EF\u7528" : pricing && pricing.source === "official" ? "\u5B98\u65B9\u4EF7 \xB7 \u81EA\u52A8\u540C\u6B65 " + (pricing.fetchedAt ? fmtTime(pricing.fetchedAt) : "") : "\u5185\u7F6E\u4EF7";
    const stepMeta = import_react.default.useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      for (const node of nodes) {
        if (!node || node.kind !== "assistant" || node.turn == null || node.step == null) continue;
        const key = String(node.turn) + "\0" + String(node.step);
        let entry = map.get(key);
        if (!entry) {
          entry = { callId: void 0, tools: [] };
          map.set(key, entry);
        }
        const blocks = node.blocks || [];
        for (const b of blocks) {
          if (b && b.kind === "tool-call") {
            if (b.callId && entry.callId === void 0) entry.callId = b.callId;
            if (b.name && entry.tools.indexOf(b.name) === -1) entry.tools.push(b.name);
          }
        }
      }
      return map;
    }, [nodes]);
    const allRows = import_react.default.useMemo(() => {
      const rows = [];
      let fallback = 0;
      for (const request of requests) {
        const usage = usageOf(request);
        if (!usage) continue;
        const isCompaction = request.purpose === "compaction";
        const model = request.provenance && request.provenance.model || request.requestConfig && request.requestConfig.model || "\u672A\u77E5";
        const priced = priceFor(model, request.startedAt, table);
        const p = priced ? priced.price : null;
        const cost = p ? (usage.input + usage.cacheWrite) / 1e6 * p.miss + usage.cacheRead / 1e6 * p.hit + usage.output / 1e6 * p.out : null;
        const saved = p ? usage.cacheRead / 1e6 * Math.max(0, p.miss - p.hit) : 0;
        const stepKey = String(request.turn != null ? request.turn : 0) + "\0" + String(request.step != null ? request.step : 0);
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
          callId: isCompaction ? void 0 : meta && meta.callId,
          tools: isCompaction ? [] : meta ? meta.tools : []
        });
      }
      return rows;
    }, [requests, stepMeta, table]);
    const displayed = import_react.default.useMemo(() => {
      if (sortMode === "cost-asc" || sortMode === "cost-desc") {
        const sign = sortMode === "cost-asc" ? 1 : -1;
        const known = allRows.filter((r) => r.cost !== null);
        const unknown = allRows.filter((r) => r.cost === null);
        known.sort((a, b) => (a.cost - b.cost) * sign);
        return { flat: [...known, ...unknown], groups: null };
      }
      const asc = sortMode !== "time-desc";
      const sorted = [...allRows].sort((a, b) => asc ? a.seq - b.seq : b.seq - a.seq);
      const groups = [];
      let cur = null;
      for (const row of sorted) {
        const gkey = row.isCompaction && row.turn == null ? "__compaction__" : String(row.turn != null ? row.turn : 0);
        if (cur === null || cur.key !== gkey) {
          cur = { key: gkey, label: gkey === "__compaction__" ? "\u538B\u7F29" : "Turn " + gkey, rows: [] };
          groups.push(cur);
        }
        cur.rows.push(row);
      }
      return { flat: sorted, groups };
    }, [allRows, sortMode]);
    let total = 0;
    let savedTotal = 0;
    let pricedCount = 0;
    const byModel = /* @__PURE__ */ new Map();
    const byTool = /* @__PURE__ */ new Map();
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
      const lines = ["\u65F6\u95F4|\u6B65\u9AA4|\u6A21\u578B|\u8F93\u5165|\u7F13\u5B58\u8BFB|\u7F13\u5B58\u5199|\u8F93\u51FA|\u601D\u8003|\u8D39\u7528(\u5143)"];
      const push = (row) => lines.push(
        [
          fmtTime(row.startedAt),
          row.isCompaction ? "\u538B\u7F29" : "step" + String(row.step != null ? row.step : ""),
          row.model,
          String(row.usage.input),
          String(row.usage.cacheRead),
          String(row.usage.cacheWrite),
          String(row.usage.output),
          String(row.usage.reasoning),
          row.cost === null ? "" : row.cost.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
        ].join("	")
      );
      if (displayed.groups) {
        for (const g of displayed.groups) for (const row of g.rows) push(row);
      } else {
        for (const row of displayed.flat) push(row);
      }
      lines.push("\u7D2F\u8BA1	" + total.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
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
      } catch (_) {
      }
    };
    const loadSummary = () => {
      if (summaryLoading) return;
      setSummaryLoading(true);
      rpc("summary", {}).then(
        (res) => {
          setSummary(res && res.ok ? res.value : { ok: false, error: res && res.error || { code: "internal", message: "\u672A\u77E5\u9519\u8BEF" } });
          setSummaryLoading(false);
        },
        (err) => {
          setSummary({ ok: false, error: { code: "internal", message: String(err && err.message || err) } });
          setSummaryLoading(false);
        }
      );
    };
    const headCells = [
      h("th", { key: "t" }, "\u65F6\u95F4"),
      h("th", { key: "s" }, "\u6B65\u9AA4"),
      h("th", { key: "m" }, "\u6A21\u578B"),
      h("th", { key: "i" }, "\u8F93\u5165"),
      h("th", { key: "cr" }, "\u7F13\u5B58\u8BFB"),
      h("th", { key: "cw" }, "\u7F13\u5B58\u5199"),
      h("th", { key: "o" }, "\u8F93\u51FA"),
      h("th", { key: "r" }, "\u601D\u8003"),
      h("th", { key: "c" }, "\u8D39\u7528")
    ];
    const rowCells = (row) => [
      h("td", { key: "t" }, fmtTime(row.startedAt)),
      h("td", { key: "s" }, row.isCompaction ? "\u538B\u7F29" : "step" + String(row.step != null ? row.step : "")),
      h(
        "td",
        { key: "m" },
        row.model,
        row.known ? null : h("span", { className: "sz-tag", style: { marginLeft: 6 } }, "\u672A\u8BA1\u4EF7"),
        row.mode === "peak" ? h("span", { className: "sz-tag sz-peak", style: { marginLeft: 6 } }, "\u9AD8\u5CF0") : row.mode === "offpeak" ? h("span", { className: "sz-tag sz-offpeak", style: { marginLeft: 6 } }, "\u7A7A\u95F2") : null
      ),
      h("td", { key: "i" }, fmtTok(row.usage.input)),
      h("td", { key: "cr" }, fmtTok(row.usage.cacheRead)),
      h("td", { key: "cw" }, fmtTok(row.usage.cacheWrite)),
      h("td", { key: "o" }, fmtTok(row.usage.output)),
      h("td", { key: "r" }, fmtTok(row.usage.reasoning)),
      h("td", { key: "c" }, fmtYuan(row.cost))
    ];
    let body;
    if (displayed.flat.length === 0) {
      body = h("div", { className: "sz-empty" }, "\u6682\u65E0\u5DF2\u5B8C\u6210\u7684\u6A21\u578B\u8BF7\u6C42\uFF08\u8F68\u8FF9\u89C6\u56FE\u4E3A\u7A7A\uFF09");
    } else if (displayed.groups) {
      const tableRows = [];
      for (const g of displayed.groups) {
        tableRows.push(h("tr", { key: g.key, className: "sz-turn" }, h("td", { colSpan: 9 }, g.label)));
        for (const row of g.rows) {
          tableRows.push(
            h("tr", { key: row.key, className: "sz-row", onClick: () => jump(row), title: row.callId ? "\u8DF3\u8F6C\u5230\u8F68\u8FF9\u5E76\u9AD8\u4EAE\u6B64\u6B65\u9AA4" : "\u8DF3\u8F6C\u5230\u8F68\u8FF9" }, rowCells(row))
          );
        }
      }
      body = h(
        "table",
        { className: "sz-table" },
        h("thead", null, h("tr", null, headCells)),
        h("tbody", null, tableRows),
        h("tfoot", null, h("tr", null, h("td", { colSpan: 8 }, "\u672C\u4F1A\u8BDD\u7D2F\u8BA1\uFF08\u5DF2\u8BA1\u4EF7 " + pricedCount + " \u6B65\uFF09"), h("td", null, fmtYuan(total))))
      );
    } else {
      body = h(
        "table",
        { className: "sz-table" },
        h("thead", null, h("tr", null, headCells)),
        h(
          "tbody",
          null,
          displayed.flat.map(
            (row) => h("tr", { key: row.key, className: "sz-row", onClick: () => jump(row), title: row.callId ? "\u8DF3\u8F6C\u5230\u8F68\u8FF9\u5E76\u9AD8\u4EAE\u6B64\u6B65\u9AA4" : "\u8DF3\u8F6C\u5230\u8F68\u8FF9" }, rowCells(row))
          )
        ),
        h("tfoot", null, h("tr", null, h("td", { colSpan: 8 }, "\u672C\u4F1A\u8BDD\u7D2F\u8BA1\uFF08\u5DF2\u8BA1\u4EF7 " + pricedCount + " \u6B65\uFF09"), h("td", null, fmtYuan(total))))
      );
    }
    const modelEntries = [...byModel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const modelMax = modelEntries.length > 0 ? modelEntries[0][1] : 0;
    const toolEntries = [...byTool.entries()].sort((a, b) => b[1].cost - a[1].cost).slice(0, 8);
    const toolMax = toolEntries.length > 0 ? toolEntries[0][1].cost : 0;
    const balanceOk = balance && balance.ok;
    const balanceVal = balanceOk && typeof balance.totalBalance === "number" && Number.isFinite(balance.totalBalance) ? balance.totalBalance : null;
    const balanceLow = balanceVal != null && balanceVal < 20;
    const todayVal = today && typeof today.cost === "number" ? today.cost : null;
    const errorText = balanceError ? "\u4F59\u989D\u67E5\u8BE2\u5931\u8D25\uFF1A" + balanceError : balance && !balance.ok ? "\u4F59\u989D\u67E5\u8BE2\u5931\u8D25\uFF1A" + String(balance.error || "\u672A\u77E5\u9519\u8BEF") : null;
    const quoteCells = [
      h(
        "div",
        { className: "cell", key: "balance" },
        h("span", { className: "sz-cell-label" }, "\u5F53\u524D\u4F59\u989D"),
        h("span", { className: "sz-cell-value" + (balanceLow ? " warn" : "") }, balanceVal != null ? h("span", null, h("span", { className: "cur" }, "\xA5"), balanceVal.toFixed(2)) : "\u2014"),
        balanceOk ? h("span", { className: "sz-cell-sub" }, h("b", null, balance.currency), " \xB7 " + (balance.isAvailable ? "\u53EF\u7528" : "\u4E0D\u53EF\u7528") + (balanceLow ? " \xB7 \u4F59\u989D\u504F\u4F4E" : "")) : null,
        balanceOk ? h(
          "span",
          { className: "sz-cell-sub" },
          "\u5145\u503C ",
          h("b", null, Number.isFinite(balance.toppedUpBalance) ? balance.toppedUpBalance.toFixed(2) : "\u2014"),
          " \xB7 \u8D60\u9001 ",
          h("b", null, Number.isFinite(balance.grantedBalance) ? balance.grantedBalance.toFixed(2) : "\u2014")
        ) : null
      ),
      h(
        "div",
        { className: "cell", key: "today" },
        h("span", { className: "sz-cell-label" }, "\u4ECA\u5929\u7528\u4E86"),
        h("span", { className: "sz-cell-value" }, todayVal != null ? h("span", null, h("span", { className: "cur" }, "\xA5"), todayVal.toFixed(2)) : "\u2014"),
        today && typeof today.steps === "number" ? h("span", { className: "sz-cell-sub" }, today.steps + " \u6B65") : null
      ),
      h(
        "div",
        { className: "cell", key: "total" },
        h("span", { className: "sz-cell-label" }, "\u7D2F\u8BA1"),
        h(
          "span",
          { className: "sz-cell-value" },
          fmtYuan(total).startsWith("\xA5") ? h("span", null, h("span", { className: "cur" }, "\xA5"), fmtYuan(total).slice(1)) : fmtYuan(total)
        ),
        h("span", { className: "sz-cell-sub" }, "\u5DF2\u8BA1\u4EF7 ", h("b", null, pricedCount + " / " + allRows.length), " \u6B65")
      ),
      h(
        "div",
        { className: "cell", key: "saved" },
        h("span", { className: "sz-cell-label" }, "\u7F13\u5B58\u547D\u4E2D\u8282\u7701"),
        h(
          "span",
          { className: "sz-cell-value" },
          fmtYuan(savedTotal).startsWith("\xA5") ? h("span", null, h("span", { className: "cur" }, "\xA5"), fmtYuan(savedTotal).slice(1)) : fmtYuan(savedTotal)
        )
      )
    ];
    let summaryView;
    if (capabilities && capabilities.summary === false) {
      summaryView = h("div", { className: "sz-err" }, "\u8DE8\u4F1A\u8BDD\u6C47\u603B\u6682\u4E0D\u53EF\u7528\uFF1AsessionQuery \u670D\u52A1\u672A\u5C31\u7EEA");
    } else {
      summaryView = h(
        "div",
        { className: "sz-meta" },
        h("button", { className: "sz-btn", disabled: summaryLoading, onClick: loadSummary }, summaryLoading ? "\u6C47\u603B\u4E2D\u2026" : "\u52A0\u8F7D\u8DE8\u4F1A\u8BDD / \u8DE8\u5929\u6C47\u603B")
      );
    }
    if (summaryOpen && summary !== null) {
      if (!summary.ok) {
        const code = summary.error && summary.error.code;
        const msg = summary.error && summary.error.message || "\u672A\u77E5\u9519\u8BEF";
        summaryView = h("div", { className: code === "unavailable" ? "sz-warn" : "sz-err" }, code === "unavailable" ? "\u8DE8\u4F1A\u8BDD\u6C47\u603B\u6682\u4E0D\u53EF\u7528\uFF1A" + msg : "\u6C47\u603B\u5931\u8D25\uFF1A" + msg);
      } else {
        const days = summary.byDay || [];
        const dayMax = days.reduce((m, d) => Math.max(m, d.cost || 0), 0);
        const dayBars = days.length > 0 ? h(
          "div",
          { className: "sz-days" },
          days.map(
            (d) => h(
              "div",
              { className: "sz-day", key: d.day },
              h("div", { className: "sz-day-value" }, fmtYuan(d.cost)),
              h("div", { className: "sz-day-track" }, h("div", { className: "sz-day-fill", style: { height: dayMax > 0 ? Math.max(4, d.cost / dayMax * 100) + "%" : "4%" } })),
              h("div", { className: "sz-day-label" }, d.day.slice(5))
            )
          )
        ) : null;
        const dayRows = days.map(
          (d) => h("tr", { key: d.day }, h("td", null, d.day), h("td", null, d.steps + " \u6B65"), h("td", null, fmtYuan(d.cost)), h("td", null, fmtYuan(d.costPer ? d.costPer : 0)))
        );
        const modelRows = (summary.byModel || []).map(
          (m) => h("tr", { key: m.model }, h("td", null, m.model), h("td", null, m.steps + " \u6B65"), h("td", null, fmtYuan(m.cost)))
        );
        const toolRows = (summary.byTool || []).map(
          (t) => h("tr", { key: t.tool }, h("td", null, t.tool), h("td", null, t.calls + " \u6B21"), h("td", null, fmtYuan(t.cost)))
        );
        summaryView = h(
          "div",
          null,
          h(
            "div",
            { className: "sz-meta", style: { marginTop: 4 } },
            h("span", { className: "sz-cell-sub" }, "\u4F1A\u8BDD ", h("b", null, String(summary.sessions || 0))),
            h("span", { className: "sz-cell-sub" }, "\u603B\u6B65\u9AA4 ", h("b", null, String(summary.total ? summary.total.steps : 0))),
            h("span", { className: "sz-cell-sub" }, "\u7D2F\u8BA1 ", h("b", null, fmtYuan(summary.total ? summary.total.cost : 0)))
          ),
          h("h3", { style: { marginTop: 14 } }, "\u6309\u5929"),
          dayBars,
          h(
            "table",
            { className: "sz-sumtable", style: { marginTop: 8 } },
            h("thead", null, h("tr", null, h("th", null, "\u65E5\u671F"), h("th", null, "\u6B65\u9AA4"), h("th", null, "\u8D39\u7528"), h("th", null, "\u5E73\u5747/\u6B65"))),
            h("tbody", null, dayRows)
          ),
          h("h3", { style: { marginTop: 14 } }, "\u6309\u6A21\u578B"),
          h(
            "table",
            { className: "sz-sumtable" },
            h("thead", null, h("tr", null, h("th", null, "\u6A21\u578B"), h("th", null, "\u6B65\u9AA4"), h("th", null, "\u8D39\u7528"))),
            h("tbody", null, modelRows)
          ),
          h("h3", { style: { marginTop: 14 } }, "\u6309\u5DE5\u5177"),
          h(
            "table",
            { className: "sz-sumtable" },
            h("thead", null, h("tr", null, h("th", null, "\u5DE5\u5177"), h("th", null, "\u8C03\u7528"), h("th", null, "\u8D39\u7528"))),
            h("tbody", null, toolRows)
          ),
          h("h3", { style: { marginTop: 14 } }, "\u6309\u4F1A\u8BDD\uFF08\u6210\u672C \u2248 \u4EA4\u4ED8\u7269\uFF09"),
          h(
            "table",
            { className: "sz-sumtable" },
            h("thead", null, h("tr", null, h("th", null, "\u4F1A\u8BDD"), h("th", null, "\u6B65\u9AA4"), h("th", null, "\u8D39\u7528"))),
            h("tbody", null, (summary.bySession || []).map((s) => h("tr", { key: s.sessionId }, h("td", null, s.sessionId), h("td", null, s.steps + " \u6B65"), h("td", null, fmtYuan(s.cost)))))
          )
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
        h("button", { className: "sz-btn", disabled: loading, onClick: load }, loading ? "\u67E5\u8BE2\u4E2D\u2026" : "\u5237\u65B0\u4F59\u989D"),
        h("button", { className: "sz-btn" + (sortMode === "time-asc" ? " on" : ""), onClick: () => setSortMode("time-asc") }, "\u65F6\u95F4\u2191"),
        h("button", { className: "sz-btn" + (sortMode === "time-desc" ? " on" : ""), onClick: () => setSortMode("time-desc") }, "\u65F6\u95F4\u2193"),
        h("button", { className: "sz-btn" + (sortMode === "cost-asc" ? " on" : ""), onClick: () => setSortMode("cost-asc") }, "\u8D39\u7528\u2191"),
        h("button", { className: "sz-btn" + (sortMode === "cost-desc" ? " on" : ""), onClick: () => setSortMode("cost-desc") }, "\u8D39\u7528\u2193"),
        h("button", { className: "sz-btn", onClick: copyDetail }, copied ? "\u5DF2\u590D\u5236" : "\u590D\u5236\u660E\u7EC6"),
        h("span", { className: "sz-tag" }, pricingTag),
        balance && balance.ok ? h("span", { className: "sz-ok" }, "\u5DF2\u66F4\u65B0") : null
      ),
      h(
        "div",
        { className: "sz-card" },
        h("h3", null, "\u6309\u6B65\u9AA4\u8D39\u7528\uFF08\u4EBA\u6C11\u5E01 \xB7 \u70B9\u51FB\u884C\u8DF3\u8F6C\u8F68\u8FF9\uFF09"),
        body
      ),
      h(
        "div",
        { className: "sz-card" },
        h("h3", null, "\u5206\u6790"),
        h("div", { className: "sz-foot", style: { marginBottom: 8 } }, "\u6309\u6A21\u578B"),
        h(BarList, { entries: modelEntries, max: modelMax }),
        h("div", { className: "sz-foot", style: { marginTop: 12, marginBottom: 8 } }, "\u6309\u5DE5\u5177\uFF08\u6B65\u9AA4\u8D39\u7528\u5747\u644A\uFF09"),
        byTool.size === 0 ? h("span", { className: "sz-empty" }, "\u672C\u4F1A\u8BDD\u6682\u65E0\u5DE5\u5177\u8C03\u7528") : h(BarList, { entries: toolEntries.map(([t, v]) => [t, v.cost]), max: toolMax }),
        h("div", { className: "sz-foot", style: { marginTop: 12, marginBottom: 8 } }, "\u6210\u672C\u9884\u6D4B"),
        h(
          "div",
          { className: "sz-predict" },
          h(Ring, { fraction: predictFractionClamped, label: "\u5E73\u5747\u6BCF\u6B65", value: fmtYuan(avgPerStep) }),
          h(
            "div",
            { className: "sz-predict-meta" },
            h("div", { className: "sz-predict-meter" }, h("div", { className: "f", style: { width: predictFractionClamped * 100 + "%" } })),
            h("div", null, "\u5E73\u5747\u6BCF\u6B65 ", h("b", null, fmtYuan(avgPerStep))),
            h(
              "div",
              null,
              "\u518D\u804A",
              h("input", { type: "number", min: 0, value: predictSteps, onChange: (e) => setPredictSteps(e.target.value) }),
              "\u6B65\u7EA6 ",
              h("b", null, fmtYuan(predicted))
            )
          )
        )
      ),
      h(
        "div",
        { className: "sz-card" },
        h(
          "div",
          { className: "sz-meta", style: { justifyContent: "space-between" } },
          h("h3", { style: { margin: 0 } }, "\u8DE8\u4F1A\u8BDD / \u8DE8\u5929\u6C47\u603B"),
          h(
            "button",
            {
              className: "sz-btn" + (summaryOpen ? " on" : ""),
              onClick: () => {
                setSummaryOpen(!summaryOpen);
                if (!summaryOpen && summary === null) loadSummary();
              }
            },
            summaryOpen ? "\u6536\u8D77" : "\u5C55\u5F00"
          )
        ),
        summaryOpen ? summaryView : null
      )
    );
  }
  function SidebarBalance(props) {
    const wide = props && props.wide;
    const useSessions = props && props.useSessions;
    const balance = useHub(balanceHub);
    const today = useHub(todayHub);
    const capabilities = useHub(capabilitiesHub);
    const [error, setError] = import_react.default.useState(null);
    const currentSessionId = useSessions ? useSessions((s) => s && s.current) : void 0;
    import_react.default.useEffect(() => {
      refreshAll();
      fetchCapabilities();
      return balanceHub.subscribe((v) => setError(v && !v.ok ? String(v.error || "") : ""));
    }, []);
    const balanceDown = capabilities && capabilities.balance === false;
    const value = balance ? balance.totalBalance : null;
    const todayCost = today && typeof today.cost === "number" ? today.cost : null;
    const low = value != null && value < 20;
    const goToTab = () => {
      refreshAll();
      if (currentSessionId && chatStore) {
        try {
          const instance = slots.resolveStore(chatStore, currentSessionId);
          if (instance && instance.actions) instance.actions.setView("suanzhang");
        } catch (_) {
        }
      }
    };
    return h(
      "div",
      {
        className: "sz-sb" + (wide ? "" : " rail"),
        title: "suanzhang \xB7 \u8DF3\u8F6C\u5230\u7B97\u8D26",
        onClick: goToTab
      },
      wide ? [
        h("span", { className: "sz-sb-detail" }, "\u5F53\u524D\u4F59\u989D\uFF1A"),
        balanceDown ? h("span", { className: "sz-sb-val warn" }, "\u529F\u80FD\u6682\u4E0D\u53EF\u7528") : h("span", { className: "sz-sb-val" + (low ? " warn" : "") }, value != null ? "\xA5" + value.toFixed(2) : "\u2014"),
        h("span", { className: "sz-sb-detail" }, "\uFF0C\u4ECA\u5929\u7528\u4E86\uFF1A"),
        h("span", { className: "sz-sb-val" }, todayCost != null ? "\xA5" + todayCost.toFixed(2) : "\u2014")
      ] : h("span", { className: "sz-sb-val" + (balanceDown || low ? " warn" : "") }, balanceDown ? "\u6682\u4E0D\u53EF\u7528" : value != null ? "\xA5" + value.toFixed(2) : "\u2014")
    );
  }
  slots.inject(
    "conversation.view",
    () => slots.register(
      {
        name: "conversation.view",
        id: "suanzhang",
        order: 20,
        label: "\u7B97\u8D26",
        ...chatStore !== void 0 ? { store: chatStore } : {}
      },
      (props) => h(SuanzhangView, props)
    )
  );
  slots.inject(
    "sidebar.footer.action",
    () => slots.register(
      {
        name: "sidebar.footer.action",
        id: "suanzhang",
        order: 10
      },
      (props) => h(SidebarBalance, props)
    )
  );
  ctx.effect(() => disposeStyles, "suanzhang styles");
}

    return module.exports;
  }
});
