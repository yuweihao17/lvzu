function clean(value) {
  return String(value || "").trim()
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(parsed, max))
}

function normalizeProductInput(data = {}) {
  const id = clean(data.id).toLowerCase()
  const name = clean(data.name)
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) throw new Error("产品 ID 只能使用 2-64 位小写字母、数字、下划线或连字符")
  if (!name) throw new Error("请输入产品名称")
  const status = ["available", "coming_soon", "hidden"].includes(data.status) ? data.status : "coming_soon"
  const activationSalt = clean(data.activationSalt)
  if (activationSalt && activationSalt.length < 8) throw new Error("激活盐至少 8 位，留空则使用全局 ACTIVATION_SALT")
  return {
    id,
    name,
    category: clean(data.category) || "其他",
    description: clean(data.description),
    purchaseUrl: clean(data.purchaseUrl),
    priceLabel: clean(data.priceLabel),
    accent: ["blue", "saffron", "mint", "coral"].includes(data.accent) ? data.accent : "blue",
    status,
    sortOrder: boundedInteger(data.sortOrder, 100, 0, 10000),
    activationSalt
  }
}

function normalizePlanInput(data = {}) {
  const productId = clean(data.productId).toLowerCase()
  const name = clean(data.name)
  const prefix = clean(data.prefix).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
  if (!productId) throw new Error("请选择产品")
  if (!name) throw new Error("请输入套餐名称")
  if (!prefix) throw new Error("请输入卡密前缀")
  return {
    productId,
    name,
    prefix,
    durationDays: boundedInteger(data.durationDays, 0, 0, 36500),
    maxDevices: boundedInteger(data.maxDevices, 1, 1, 100),
    maxActivations: boundedInteger(data.maxActivations, 1, 1, 1000),
    status: data.status === "disabled" ? "disabled" : "active"
  }
}

function cardPrefix(value, fallback = "APP") {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || fallback
}

module.exports = { normalizeProductInput, normalizePlanInput, cardPrefix }
