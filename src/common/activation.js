export const ACTIVATION_USER_ID = "1b9cd46856a311f1b71e52540025c377"
export const ACTIVATION_PRODUCT_ID = "lvzu_lingqian"
export const ACTIVATION_URL = "https://static-mp-0279179f-524d-41cf-bc86-3414f9c4a88a.next.bspapp.com/index.html"
export const ACTIVATION_SALT = "lvzu-lingqian-change-before-release"

export function normalizeCode(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 8)
}

export function makeDeviceCode(deviceId) {
  const source = String(deviceId || "lvzu-device")
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)
  }
  return ("00000000" + (Math.abs(hash) % 100000000)).slice(-8)
}

export function makeActivationCode(deviceCode) {
  const source = ACTIVATION_SALT + ":" + ACTIVATION_PRODUCT_ID + ":" + normalizeCode(deviceCode) + ":" + ACTIVATION_USER_ID
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 131 + source.charCodeAt(i)) % 1000000007
  }
  return ("00000000" + (hash % 100000000)).slice(-8)
}

export function getActivationQrValue(deviceCode) {
  return ACTIVATION_URL + "?product=" + ACTIVATION_PRODUCT_ID + "&device=" + normalizeCode(deviceCode)
}
