const assert = require("assert")
const { makeActivationCode, normalizeDevice } = require("../lib/activation-code")

assert.strictEqual(normalizeDevice(" 12-3456-78 "), "12345678")
assert.strictEqual(makeActivationCode({
  salt: "lvzu-lingqian-change-before-release",
  productId: "lvzu_lingqian",
  deviceCode: "12345678",
  userId: "1b9cd46856a311f1b71e52540025c377"
}), "30279853")

console.log("activation code compatibility test passed")
