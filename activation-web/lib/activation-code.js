const DEFAULT_AFDIAN_USER_ID = "1b9cd46856a311f1b71e52540025c377"

function normalizeDevice(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 8)
}

function makeActivationCode({ salt, productId, deviceCode, userId }) {
  if (!salt) throw new Error("ACTIVATION_SALT 未配置")
  const source = `${salt}:${productId}:${normalizeDevice(deviceCode)}:${userId || DEFAULT_AFDIAN_USER_ID}`
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 131 + source.charCodeAt(index)) % 1000000007
  }
  return String(hash % 100000000).padStart(8, "0")
}

module.exports = { DEFAULT_AFDIAN_USER_ID, makeActivationCode, normalizeDevice }
