/**
 * suanzhang-dsh 计费逻辑单测（原生 node:assert，无测试框架依赖）。
 * 运行：node tests/pricing.test.mjs   或   npm test
 *
 * 仅覆盖 lib/pricing.js 的纯函数，无需 dsh / cordis 运行时。
 */
import assert from "node:assert/strict";
import {
  BUILTIN,
  isPeakHour,
  mergePricing,
  priceFor,
  tokenCost,
  computeSummary,
} from "../lib/pricing.js";

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log("  ✓ " + name);
}

// ── 峰谷时段边界 ───────────────────────────────────────────────
test("isPeakHour 双窗口边界正确", () => {
  assert.equal(isPeakHour(8), false); // 空闲
  assert.equal(isPeakHour(9), true); // 高峰起点
  assert.equal(isPeakHour(11), true);
  assert.equal(isPeakHour(12), false); // 午间空闲
  assert.equal(isPeakHour(13), false);
  assert.equal(isPeakHour(14), true); // 下午高峰
  assert.equal(isPeakHour(17), true);
  assert.equal(isPeakHour(18), false); // 晚间空闲
});

// ── 合并计价保留内置模型 ───────────────────────────────────────
test("mergePricing 不被官方价覆盖 chat/reasoner", () => {
  const official = { "deepseek-v4-flash": BUILTIN["deepseek-v4-flash"] };
  const merged = mergePricing(official);
  assert.ok(merged["deepseek-chat"], "chat 应保留");
  assert.ok(merged["deepseek-reasoner"], "reasoner 应保留");
  assert.ok(merged["deepseek-v4-flash"], "官方 flash 应存在");
  assert.equal(merged["deepseek-chat"].miss, 2.0, "chat 内置价不变");
});

test("mergePricing 无官方价时等同于内置", () => {
  const merged = mergePricing(null);
  assert.deepEqual(merged, BUILTIN);
});

// ── priceFor 峰谷/平价/未知 ────────────────────────────────────
test("priceFor 区分高峰/空闲/平价/未知", () => {
  const table = BUILTIN;
  const peak = priceFor("deepseek-v4-flash", new Date(2026, 0, 1, 10, 0).getTime(), table); // 10 点高峰
  const off = priceFor("deepseek-v4-flash", new Date(2026, 0, 1, 20, 0).getTime(), table); // 20 点空闲
  assert.equal(peak.miss, 3.0);
  assert.equal(off.miss, 1.5);
  const chat = priceFor("deepseek-chat", new Date(2026, 0, 1, 10, 0).getTime(), table);
  assert.equal(chat.miss, 2.0, "chat 无峰谷，返回整表");
  assert.equal(priceFor("不存在的模型", Date.now(), table), null, "未知模型返回 null");
});

// ── tokenCost 计算正确 ─────────────────────────────────────────
test("tokenCost 按单价计费（含缓存命中价差）", () => {
  // flash 空闲价：hit 0.05, miss 1.5, out 4.5（元/百万）
  const price = { hit: 0.05, miss: 1.5, out: 4.5 };
  const u = { input: 1_000_000, cacheRead: 2_000_000, cacheWrite: 0, output: 1_000_000, reasoning: 300_000 };
  // miss 部分 = input+write = 1M → 1.5 元；hit = 2M → 0.1 元；out = 1M → 4.5 元
  const expect = 1.5 + 0.1 + 4.5;
  assert.ok(Math.abs(tokenCost(u, price) - expect) < 1e-9, "应为 " + expect + " 元，实得 " + tokenCost(u, price));
});

test("tokenCost 不重复计入 reasoning（output 已含）", () => {
  // 仅 output 计费；reasoning 是 output 子集，不应额外相加
  const price = { hit: 0, miss: 0, out: 10 };
  const u = { input: 0, cacheRead: 0, cacheWrite: 0, output: 1_000_000, reasoning: 500_000 };
  assert.equal(tokenCost(u, price), 10, "只按 output 1M×10 = 10 元，不叠加 reasoning");
});

// ── computeSummary 多维聚合 ────────────────────────────────────
test("computeSummary 跨天/跨模型/跨工具/跨会话聚合正确", () => {
  const table = {
    "deepseek-v4-flash": { hit: 0.05, miss: 1.5, out: 4.5 }, // 平价模型用于确定性
    "deepseek-chat": { hit: 0.5, miss: 2.0, out: 8.0 },
  };
  const flash = table["deepseek-v4-flash"];
  const cost = (u) => tokenCost(u, flash);
  const mk = (over) => Object.assign({ input: 0, cacheRead: 0, cacheWrite: 0, output: 1_000_000, reasoning: 0 }, over);

  const dayA = new Date(2026, 0, 5, 10, 0).getTime();
  const dayB = new Date(2026, 0, 6, 10, 0).getTime();
  const events = [
    { time: dayA, model: "deepseek-v4-flash", sessionId: "sess-1", usage: mk({}), tools: ["read", "edit"] },
    { time: dayA, model: "deepseek-chat", sessionId: "sess-1", usage: mk({}), tools: ["bash"] },
    { time: dayB, model: "deepseek-v4-flash", sessionId: "sess-2", usage: mk({}), tools: [] },
    { time: dayB, model: "未知模型", sessionId: "sess-2", usage: mk({}), tools: [] }, // 未计价
  ];
  const agg = computeSummary(events, table);
  const cFlash = tokenCost(mk({}), table["deepseek-v4-flash"]); // 4.5
  const cChat = tokenCost(mk({}), table["deepseek-chat"]); // 8.0

  // 总步骤 4，费用 = 2×flash + 1×chat + 1×未知模型(未计价=0)
  assert.equal(agg.total.steps, 4);
  assert.ok(Math.abs(agg.total.cost - (cFlash * 2 + cChat)) < 1e-9, "total.cost 应等于 2×flash + chat");

  // 按天：2 天
  assert.equal(agg.byDay.length, 2, "应聚合为 2 天");
  const d0 = agg.byDay[0];
  assert.ok(d0.day.startsWith("2026-01-05"));
  assert.equal(d0.steps, 2);
  assert.ok(Math.abs(d0.costPer - d0.cost / 2) < 1e-9, "costPer = cost/steps");

  // 按模型：flash 2 步，chat 1 步（未知模型 cost 0 但 steps 应计入 byModel? 不，未知模型 price=null → cost 0，仍计入 steps）
  const flashRow = agg.byModel.find((m) => m.model === "deepseek-v4-flash");
  const chatRow = agg.byModel.find((m) => m.model === "deepseek-chat");
  assert.equal(flashRow.steps, 2);
  assert.equal(chatRow.steps, 1);
  assert.ok(Math.abs(flashRow.cost - cost(mk({})) * 2) < 1e-9);

  // 按工具：read/edit 各摊 flash 那步的一半；bash 摊 chat 那步全额
  const readRow = agg.byTool.find((t) => t.tool === "read");
  const editRow = agg.byTool.find((t) => t.tool === "edit");
  const bashRow = agg.byTool.find((t) => t.tool === "bash");
  assert.ok(readRow && editRow, "read/edit 应出现");
  assert.ok(Math.abs(readRow.cost - cost(mk({})) / 2) < 1e-9, "read 摊一半");
  assert.ok(Math.abs(editRow.cost - cost(mk({})) / 2) < 1e-9, "edit 摊一半");
  assert.ok(Math.abs(bashRow.cost - cost(mk({})) * (8.0 / 4.5)) < 1e-9, "bash 用 chat 价全额");

  // 按会话：sess-1 两步，sess-2 两步（其中一步未计价）
  assert.equal(agg.bySession.length, 2);
  const s1 = agg.bySession.find((s) => s.sessionId === "sess-1");
  assert.equal(s1.steps, 2);
  assert.ok(Math.abs(s1.cost - (cost(mk({})) + cost(mk({})) * (8.0 / 4.5))) < 1e-9, "sess-1 含 flash+chat");
});

test("computeSummary 空输入安全", () => {
  const agg = computeSummary([], BUILTIN);
  assert.equal(agg.total.steps, 0);
  assert.equal(agg.byDay.length, 0);
  assert.equal(agg.bySession.length, 0);
});

console.log("\n通过 " + passed + " 项测试 ✅");
