/**
 * suanzhang-dsh 纯计费逻辑（无外部依赖，可单测）。
 *
 * 把计费相关的「纯函数」集中在此，Host（lib/index.js）与单测均复用本文件，
 * 避免逻辑在两侧漂移。本文件不 import 任何 dsh/cordis 模块，
 * 因此可在 Node 下直接 `import` 与单元测试，无需 dsh 运行时。
 *
 * @module suanzhang-dsh/pricing
 */

/** 内置计价表（官方抓取失败时的回退；单位：元 / 百万 tokens）。 */
export const BUILTIN = {
  "deepseek-v4-flash": { peak: { hit: 0.1, miss: 3.0, out: 9.0 }, offpeak: { hit: 0.05, miss: 1.5, out: 4.5 } },
  "deepseek-v4-pro": { peak: { hit: 0.3, miss: 9.0, out: 27.0 }, offpeak: { hit: 0.15, miss: 4.5, out: 13.5 } },
  "deepseek-chat": { miss: 2.0, hit: 0.5, out: 8.0 },
  "deepseek-reasoner": { miss: 4.0, hit: 1.0, out: 16.0 },
};

/**
 * 峰谷计价：高峰时段为北京时间 9:00–12:00、14:00–18:00（官方定价页注明），
 * 其余为空闲时段。调用方传入 getHours()（本地时区，用户处于 UTC+8，等同北京时间）。
 */
export function isPeakHour(hour) {
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

/**
 * 合并官方价与内置价：官方页仅含 v4-flash / v4-pro，其余模型（chat/reasoner）
 * 保留内置价，避免被官方页覆盖导致丢价。
 */
export function mergePricing(officialTable) {
  const merged = {};
  for (const k of Object.keys(BUILTIN)) merged[k] = BUILTIN[k];
  if (officialTable) {
    for (const k of Object.keys(officialTable)) merged[k] = officialTable[k];
  }
  return merged;
}

/** 依据模型与时间选价（峰谷自动判定；无峰谷字段则平价为该模型整表）。 */
export function priceFor(model, time, table) {
  const entry = table && table[model];
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
export function tokenCost(u, price) {
  if (!u || !price) return 0;
  return ((u.input + u.cacheWrite) / 1e6) * price.miss + (u.cacheRead / 1e6) * price.hit + (u.output / 1e6) * price.out;
}

/**
 * 汇总一组用量事件，输出跨维度聚合。
 * @param {Array} events 形如
 *   [{ time, model, sessionId?, usage:{input,cacheRead,cacheWrite,output,reasoning}, tools?:string[] }]
 * @param {Object} table 当前生效计价表（来自 activeTable()）
 * @returns {{ total:{cost,steps}, byDay:Array, byModel:Array, byTool:Array, bySession:Array }}
 */
export function computeSummary(events, table) {
  const byDay = new Map();
  const byModel = new Map();
  const byTool = new Map();
  const bySession = new Map();
  const total = { cost: 0, steps: 0 };
  const list = Array.isArray(events) ? events : [];
  for (const ev of list) {
    if (!ev || !ev.usage) continue;
    const u = ev.usage;
    const model = ev.model || "未知";
    const time = ev.time;
    const price = priceFor(model, time, table);
    const cost = price ? tokenCost(u, price) : 0;
    total.cost += cost;
    total.steps += 1;
    const d = new Date(typeof time === "number" ? time : Date.now());
    const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const db = byDay.get(day) || { day, steps: 0, cost: 0 };
    db.steps += 1;
    db.cost += cost;
    byDay.set(day, db);
    const mb = byModel.get(model) || { model, steps: 0, cost: 0 };
    mb.steps += 1;
    mb.cost += cost;
    byModel.set(model, mb);
    const sid = ev.sessionId || "未知";
    const sb = bySession.get(sid) || { sessionId: sid, steps: 0, cost: 0 };
    sb.steps += 1;
    sb.cost += cost;
    bySession.set(sid, sb);
    if (ev.tools && ev.tools.length > 0 && cost > 0) {
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
  return {
    total,
    byDay: dayArr,
    byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost),
    byTool: [...byTool.values()].sort((a, b) => b.cost - a.cost),
    bySession: [...bySession.values()].sort((a, b) => b.cost - a.cost),
  };
}
