const crypto = require("crypto")

const DEFAULT_PRODUCT_ID = "lvzu_lingqian"
const DEFAULT_AFDIAN_USER_ID = "1b9cd46856a311f1b71e52540025c377"
const DEFAULT_SALT = "lvzu-lingqian-change-before-release"

const PRODUCTS = {
  lvzu_lingqian: {
    id: "lvzu_lingqian",
    name: "吕祖灵签",
    prefix: "LZ",
    buyUrl: "https://www.ifdian.net/item/3f67aea8590111f1bb3652540025c377",
    activationSalt: process.env.LVZU_LINGQIAN_SALT || process.env.ACTIVATION_SALT || DEFAULT_SALT
  }
}

function config() {
  return {
    afdianUserId: process.env.AFDIAN_USER_ID || DEFAULT_AFDIAN_USER_ID,
    afdianApiToken: process.env.AFDIAN_API_TOKEN || "",
    adminSecret: process.env.ADMIN_SECRET || "",
    defaultProductId: process.env.DEFAULT_PRODUCT_ID || DEFAULT_PRODUCT_ID,
    supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL || ""),
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ""
  }
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "")
  if (!raw) return ""
  return raw.replace(/\/rest\/v1$/i, "")
}

function send(res, statusCode, data) {
  res.setHeader("content-type", "application/json; charset=utf-8")
  res.setHeader("access-control-allow-origin", "*")
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS")
  res.setHeader("access-control-allow-headers", "content-type,x-admin-secret")
  res.status(statusCode).json(data)
}

function parseBody(req) {
  if (!req.body) return {}
  if (typeof req.body === "object") return req.body
  try {
    return JSON.parse(req.body)
  } catch (err) {
    return {}
  }
}

function now() {
  return Date.now()
}

function normalizeCard(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizeDeviceCode(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 8)
}

function normalizeProductId(value) {
  const fallback = config().defaultProductId || DEFAULT_PRODUCT_ID
  return String(value || fallback).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || DEFAULT_PRODUCT_ID
}

function getProduct(productId) {
  const id = normalizeProductId(productId)
  return PRODUCTS[id] || PRODUCTS[config().defaultProductId] || PRODUCTS[DEFAULT_PRODUCT_ID]
}

function makeActivationCode(productId, deviceCode) {
  const product = getProduct(productId)
  const source = product.activationSalt + ":" + product.id + ":" + normalizeDeviceCode(deviceCode) + ":" + config().afdianUserId
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 131 + source.charCodeAt(i)) % 1000000007
  }
  return ("00000000" + (hash % 100000000)).slice(-8)
}

function requireAdmin(req, body) {
  const adminSecret = config().adminSecret
  if (!adminSecret) return "未配置 ADMIN_SECRET"
  const secret = req.headers["x-admin-secret"] || body.adminSecret || ""
  if (secret !== adminSecret) return "管理员密码错误"
  return ""
}

function randomCardCode(prefix) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(10)
  let text = normalizeCard(prefix || "LZ")
  for (let i = 0; i < 10; i++) {
    text += alphabet[bytes[i] % alphabet.length]
  }
  return text
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex")
}

function verifyAfdianApiResponse(response) {
  const token = config().afdianApiToken
  if (!token || !response || !response.data || !response.sign) return false
  return md5(token + "params" + JSON.stringify(response.data)) === response.sign
}

function supabaseReady() {
  const cfg = config()
  return Boolean(cfg.supabaseUrl && cfg.supabaseKey)
}

function describeError(err) {
  if (!err) return null
  const cause = err.cause || null
  const info = {
    name: err.name || "",
    message: err.message || "",
    status: err.status || "",
    code: err.code || "",
    data: err.data || null
  }
  if (cause) {
    info.cause = {
      name: cause.name || "",
      message: cause.message || "",
      code: cause.code || "",
      errno: cause.errno || "",
      syscall: cause.syscall || "",
      hostname: cause.hostname || ""
    }
  }
  return info
}

function isFetchNetworkError(err) {
  return Boolean(err && (err.message === "fetch failed" || err.cause))
}

function publicErrorMessage(err, fallback) {
  if (isFetchNetworkError(err)) {
    return "服务器无法连接数据库，请稍后重试；如果一直失败，请检查 Vercel 与 Supabase 连接"
  }
  if (err && err.message === "Supabase 请求失败") {
    return "数据库请求失败，请检查 Supabase 表结构、密钥和权限"
  }
  return (err && err.message) || fallback || "服务器异常，请稍后重试"
}

async function probeSupabase() {
  const start = now()
  if (!supabaseReady()) {
    return {
      ok: false,
      latencyMs: 0,
      message: "Supabase 未配置"
    }
  }

  try {
    const rows = await sb("lvzu_cards", {
      query: {
        select: "id",
        limit: "1"
      }
    })
    return {
      ok: true,
      latencyMs: now() - start,
      rows: Array.isArray(rows) ? rows.length : 0
    }
  } catch (err) {
    return {
      ok: false,
      latencyMs: now() - start,
      message: publicErrorMessage(err),
      error: describeError(err)
    }
  }
}

async function sb(path, options) {
  const cfg = config()
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    throw new Error("Supabase 未配置")
  }

  const url = new URL(cfg.supabaseUrl.replace(/\/+$/, "") + "/rest/v1/" + path.replace(/^\/+/, ""))
  const query = options && options.query ? options.query : {}
  Object.keys(query).forEach(key => {
    if (query[key] !== undefined && query[key] !== null && query[key] !== "") {
      url.searchParams.set(key, query[key])
    }
  })

  const res = await fetch(url.toString(), {
    method: (options && options.method) || "GET",
    headers: Object.assign(
      {
        apikey: cfg.supabaseKey,
        authorization: "Bearer " + cfg.supabaseKey,
        "content-type": "application/json",
        prefer: "return=representation"
      },
      options && options.headers ? options.headers : {}
    ),
    body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (err) {
    data = text
  }

  if (!res.ok) {
    const error = new Error("Supabase 请求失败")
    error.status = res.status
    error.data = data
    throw error
  }

  return data
}

async function selectRows(table, filters, limit) {
  const query = Object.assign({ select: "*" }, filters || {})
  if (limit) query.limit = String(limit)
  const data = await sb(table, { query })
  return Array.isArray(data) ? data : []
}

async function insertRow(table, row, conflictKey) {
  const query = {}
  const headers = {}
  if (conflictKey) {
    query.on_conflict = conflictKey
    headers.prefer = "resolution=merge-duplicates,return=representation"
  }
  return sb(table, { method: "POST", query, headers, body: row })
}

async function updateRows(table, filters, patch) {
  return sb(table, { method: "PATCH", query: filters, body: patch })
}

async function activate(body) {
  if (!supabaseReady()) return { status: 500, data: { ok: false, message: "数据库未配置" } }

  const product = getProduct(body.productId || body.product_id)
  const cardCode = normalizeCard(body.cardCode || body.card_code)
  const deviceCode = normalizeDeviceCode(body.deviceCode || body.device_code)
  if (!cardCode) return { status: 400, data: { ok: false, message: "请输入卡密" } }
  if (deviceCode.length !== 8) return { status: 400, data: { ok: false, message: "请输入 8 位设备码" } }

  const cards = await selectRows("lvzu_cards", {
    card_code: "eq." + cardCode,
    limit: "5"
  }, 5)
  const card = cards.find(row => row.product_id === product.id || (!row.product_id && product.id === config().defaultProductId))
  let current = card
  let table = "lvzu_cards"
  let sourceType = "card"

  if (!current) {
    const orders = await selectRows("lvzu_afdian_orders", {
      card_code: "eq." + cardCode,
      limit: "5"
    }, 5)
    current = orders.find(row => row.product_id === product.id || (!row.product_id && product.id === config().defaultProductId))
    table = "lvzu_afdian_orders"
    sourceType = "order"
  }

  if (!current) return { status: 404, data: { ok: false, message: "卡密不存在，请确认购买后收到的卡密" } }
  if (current.bound_device_code && current.bound_device_code !== deviceCode) {
    return { status: 403, data: { ok: false, message: "卡密已绑定其他设备" } }
  }

  const isRecovery = Boolean(current.bound_device_code)
  const activationCode = current.activation_code || makeActivationCode(product.id, deviceCode)
  const time = now()

  await updateRows(
    table,
    {
      id: "eq." + current.id
    },
    {
      product_id: current.product_id || product.id,
      status: "used",
      bound_device_code: deviceCode,
      activation_code: activationCode,
      activated_at: current.activated_at || time,
      updated_at: time
    }
  )

  if (!isRecovery) {
    await insertRow("lvzu_activations", {
      product_id: product.id,
      card_code: cardCode,
      source_type: sourceType,
      source_id: String(current.id),
      device_code: deviceCode,
      activation_code: activationCode,
      created_at: time
    })
  }

  return {
    status: 200,
    data: {
      ok: true,
      activationCode,
      recovered: isRecovery,
      message: isRecovery ? "已为当前设备找回激活码" : "激活码生成成功"
    }
  }
}

async function importCards(body) {
  if (!supabaseReady()) return { status: 500, data: { ok: false, message: "数据库未配置" } }

  const product = getProduct(body.productId || body.product_id)
  const cards = Array.isArray(body.cards) ? body.cards.map(normalizeCard).filter(Boolean) : []
  if (!cards.length) return { status: 400, data: { ok: false, message: "请输入 cards 数组" } }

  let created = 0
  const time = now()
  for (let i = 0; i < cards.length; i++) {
    const cardCode = cards[i]
    const exists = await selectRows("lvzu_cards", {
      card_code: "eq." + cardCode
    }, 1)
    if (exists.length) continue
    await insertRow("lvzu_cards", {
      product_id: product.id,
      card_code: cardCode,
      status: "new",
      created_at: time,
      updated_at: time
    })
    created += 1
  }

  return { status: 200, data: { ok: true, created } }
}

async function generateCards(body) {
  if (!supabaseReady()) return { status: 500, data: { ok: false, message: "数据库未配置" } }

  const product = getProduct(body.productId || body.product_id)
  const count = Math.max(1, Math.min(parseInt(body.count, 10) || 1, 500))
  const prefix = normalizeCard(body.prefix || product.prefix || "LZ")
  const cards = []
  let guard = 0
  while (cards.length < count && guard < count * 20) {
    guard += 1
    const cardCode = randomCardCode(prefix)
    const exists = await selectRows("lvzu_cards", {
      card_code: "eq." + cardCode
    }, 1)
    if (exists.length) continue
    cards.push(cardCode)
  }

  await importCards({ productId: product.id, cards })
  return { status: 200, data: { ok: true, cards, text: cards.join("\n") } }
}

function mapRecord(row) {
  if (!row) return row
  return Object.assign({}, row, {
    _id: String(row.id),
    id: row.id
  })
}

async function adminSearch(body) {
  if (!supabaseReady()) return { status: 500, data: { ok: false, message: "数据库未配置" } }

  const rawKeyword = String(body.keyword || "").trim()
  const productId = normalizeProductId(body.productId || body.product_id)
  const cardKeyword = normalizeCard(rawKeyword)
  const deviceKeyword = normalizeDeviceCode(rawKeyword)
  if (!rawKeyword) return { status: 400, data: { ok: false, message: "请输入要查询的卡密、设备码、订单号或激活码" } }

  const cards = await selectRows("lvzu_cards", {
    product_id: "eq." + productId,
    card_code: "eq." + cardKeyword
  }, 30)
  const cardsByDevice = deviceKeyword ? await selectRows("lvzu_cards", {
    product_id: "eq." + productId,
    bound_device_code: "eq." + deviceKeyword
  }, 30) : []
  const cardsByActivation = deviceKeyword ? await selectRows("lvzu_cards", {
    product_id: "eq." + productId,
    activation_code: "eq." + deviceKeyword
  }, 30) : []

  const orders = await selectRows("lvzu_afdian_orders", {
    product_id: "eq." + productId,
    card_code: "eq." + cardKeyword
  }, 30)
  const ordersByNo = await selectRows("lvzu_afdian_orders", {
    product_id: "eq." + productId,
    order_no: "eq." + cardKeyword
  }, 30)
  const ordersByDevice = deviceKeyword ? await selectRows("lvzu_afdian_orders", {
    product_id: "eq." + productId,
    bound_device_code: "eq." + deviceKeyword
  }, 30) : []
  const ordersByActivation = deviceKeyword ? await selectRows("lvzu_afdian_orders", {
    product_id: "eq." + productId,
    activation_code: "eq." + deviceKeyword
  }, 30) : []

  const activations = await selectRows("lvzu_activations", {
    product_id: "eq." + productId,
    card_code: "eq." + cardKeyword
  }, 30)
  const activationsByDevice = deviceKeyword ? await selectRows("lvzu_activations", {
    product_id: "eq." + productId,
    device_code: "eq." + deviceKeyword
  }, 30) : []
  const activationsByActivation = deviceKeyword ? await selectRows("lvzu_activations", {
    product_id: "eq." + productId,
    activation_code: "eq." + deviceKeyword
  }, 30) : []

  return {
    status: 200,
    data: {
      ok: true,
      results: {
        cards: [].concat(cards, cardsByDevice, cardsByActivation).map(mapRecord),
        orders: [].concat(orders, ordersByNo, ordersByDevice, ordersByActivation).map(mapRecord),
        activations: [].concat(activations, activationsByDevice, activationsByActivation).map(mapRecord)
      }
    }
  }
}

async function resetCard(body) {
  if (!supabaseReady()) return { status: 500, data: { ok: false, message: "数据库未配置" } }

  const productId = normalizeProductId(body.productId || body.product_id)
  const cardCode = normalizeCard(body.cardCode || body.card_code)
  if (!cardCode) return { status: 400, data: { ok: false, message: "请输入卡密" } }

  const time = now()
  const cards = await selectRows("lvzu_cards", {
    product_id: "eq." + productId,
    card_code: "eq." + cardCode
  }, 10)
  const orders = await selectRows("lvzu_afdian_orders", {
    product_id: "eq." + productId,
    card_code: "eq." + cardCode
  }, 10)

  let updated = 0
  for (let i = 0; i < cards.length; i++) {
    await updateRows("lvzu_cards", { id: "eq." + cards[i].id }, {
      status: "new",
      bound_device_code: "",
      activation_code: "",
      activated_at: null,
      updated_at: time
    })
    updated += 1
  }
  for (let i = 0; i < orders.length; i++) {
    await updateRows("lvzu_afdian_orders", { id: "eq." + orders[i].id }, {
      status: "new",
      bound_device_code: "",
      activation_code: "",
      activated_at: null,
      updated_at: time
    })
    updated += 1
  }

  if (!updated) return { status: 404, data: { ok: false, message: "没有找到这张卡密" } }
  return { status: 200, data: { ok: true, updated } }
}

async function saveWebhookOrder(body) {
  if (!supabaseReady()) return
  const data = body.data || body
  const orderNo = normalizeCard(data.out_trade_no || data.order_no || data.trade_no)
  if (!orderNo) return

  const product = getProduct(data.product_id || data.productId || config().defaultProductId)
  const cardCode = normalizeCard(data.card_code || data.redeem_code || data.redeem_id || orderNo)
  const time = now()
  await sb("lvzu_afdian_orders", {
    method: "POST",
    query: { on_conflict: "order_no" },
    headers: { prefer: "resolution=merge-duplicates,return=representation" },
    body: {
      order_no: orderNo,
      product_id: product.id,
      card_code: cardCode,
      user_id: data.user_id || "",
      plan_id: data.plan_id || "",
      product_type: data.product_type || "",
      total_amount: String(data.total_amount || ""),
      raw: data,
      status: "new",
      updated_at: time,
      created_at: time
    }
  })
}

module.exports = {
  activate,
  adminSearch,
  config,
  generateCards,
  getProduct,
  importCards,
  now,
  normalizeCard,
  normalizeDeviceCode,
  normalizeProductId,
  parseBody,
  probeSupabase,
  publicErrorMessage,
  randomCardCode,
  requireAdmin,
  resetCard,
  sb,
  saveWebhookOrder,
  send,
  supabaseReady,
  verifyAfdianApiResponse
}
