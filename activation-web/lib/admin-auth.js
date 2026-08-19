const crypto = require("crypto")

const SCRYPT_COST = 16384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const KEY_LENGTH = 32

function hashSecret(secret) {
  const value = String(secret || "")
  if (!value) throw new Error("管理员密钥不能为空")
  const salt = crypto.randomBytes(16)
  const key = crypto.scryptSync(value, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024
  })
  return ["scrypt", SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION, salt.toString("base64url"), key.toString("base64url")].join("$")
}

function verifySecret(secret, encoded) {
  try {
    const [algorithm, cost, blockSize, parallelization, salt, expected] = String(encoded || "").split("$")
    if (algorithm !== "scrypt" || !salt || !expected) return false
    const expectedBuffer = Buffer.from(expected, "base64url")
    const actual = crypto.scryptSync(String(secret || ""), Buffer.from(salt, "base64url"), expectedBuffer.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024
    })
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer)
  } catch (_) {
    return false
  }
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=")
    if (separator < 1) return cookies
    const key = item.slice(0, separator).trim()
    const value = item.slice(separator + 1).trim()
    if (!key) return cookies
    try { cookies[key] = decodeURIComponent(value) } catch (_) { cookies[key] = value }
    return cookies
  }, {})
}

function sessionTokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex")
}

function validateNewSecret(next, current = "") {
  const value = String(next || "")
  if (value.length < 12) return "新密钥至少需要 12 个字符"
  if (value.length > 128) return "新密钥不能超过 128 个字符"
  if (current && value === String(current)) return "新密钥不能与当前密钥相同"
  return ""
}

module.exports = { hashSecret, verifySecret, parseCookies, sessionTokenHash, validateNewSecret }
