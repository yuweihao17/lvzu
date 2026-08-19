const assert = require("assert")
const { normalizeProductInput, normalizePlanInput, cardPrefix } = require("../lib/catalog-model")

assert.deepStrictEqual(normalizeProductInput({
  id: " Focus_Timer ",
  name: " 专注计时器 ",
  status: "available",
  sortOrder: "12"
}), {
  id: "focus_timer",
  name: "专注计时器",
  category: "其他",
  description: "",
  purchaseUrl: "",
  priceLabel: "",
  accent: "blue",
  status: "available",
  sortOrder: 12
})

assert.throws(() => normalizeProductInput({ id: "坏 ID", name: "测试" }), /产品 ID/)
assert.throws(() => normalizeProductInput({ id: "test", name: "" }), /产品名称/)

assert.deepStrictEqual(normalizePlanInput({
  productId: "lvzu_lingqian",
  name: "永久版",
  prefix: " lz ",
  durationDays: "0",
  maxDevices: "1"
}), {
  productId: "lvzu_lingqian",
  name: "永久版",
  prefix: "LZ",
  durationDays: 0,
  maxDevices: 1,
  maxActivations: 1,
  status: "active"
})

assert.strictEqual(cardPrefix("吕祖-2026", "APP"), "2026")
assert.strictEqual(cardPrefix("", "APP"), "APP")

console.log("catalog model tests passed")
