const assert = require("assert")
const {
  hashSecret,
  verifySecret,
  parseCookies,
  sessionTokenHash,
  validateNewSecret
} = require("../lib/admin-auth")

const encoded = hashSecret("a-strong-admin-secret")
assert.match(encoded, /^scrypt\$/)
assert.strictEqual(verifySecret("a-strong-admin-secret", encoded), true)
assert.strictEqual(verifySecret("wrong-secret", encoded), false)
assert.strictEqual(verifySecret("a-strong-admin-secret", "invalid"), false)

assert.deepStrictEqual(parseCookies("admin_session=abc123; theme=light"), {
  admin_session: "abc123",
  theme: "light"
})
assert.deepStrictEqual(parseCookies(""), {})
assert.strictEqual(sessionTokenHash("token"), sessionTokenHash("token"))
assert.notStrictEqual(sessionTokenHash("token"), sessionTokenHash("other"))

assert.strictEqual(validateNewSecret("short"), "新密钥至少需要 12 个字符")
assert.strictEqual(validateNewSecret("same-secret-value", "same-secret-value"), "新密钥不能与当前密钥相同")
assert.strictEqual(validateNewSecret("a-valid-secret-2026", "old-secret-value"), "")

console.log("admin auth tests passed")
