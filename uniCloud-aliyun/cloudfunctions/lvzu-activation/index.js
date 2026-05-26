const crypto = require("crypto")

let localConfig = {}
try {
  localConfig = require("./config.js")
} catch (e) {
  localConfig = {}
}

const CONFIG = {
  afdianUserId: localConfig.afdianUserId || "1b9cd46856a311f1b71e52540025c377",
  afdianApiToken: localConfig.afdianApiToken || "",
  adminSecret: localConfig.adminSecret || "",
  activationSalt: localConfig.activationSalt || "lvzu-lingqian-change-before-release"
}

const db = uniCloud.database()

function json(statusCode, data) {
  return {
    mpserverlessComposedResponse: true,
    isBase64Encoded: false,
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-headers": "content-type,x-admin-secret",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(data)
  }
}

function parseBody(event) {
  if (!event.body) return {}
  if (typeof event.body === "object") return event.body
  try {
    return JSON.parse(event.body)
  } catch (e) {
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

function makeActivationCode(deviceCode) {
  const source = CONFIG.activationSalt + ":" + normalizeDeviceCode(deviceCode) + ":" + CONFIG.afdianUserId
  let hash = 0
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 131 + source.charCodeAt(i)) % 1000000007
  }
  return ("00000000" + (hash % 100000000)).slice(-8)
}

function getPath(event) {
  return event.path || event.url || event.requestContext && event.requestContext.path || ""
}

function getHeader(event, name) {
  const headers = event.headers || event.header || {}
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : ""
}

function md5(value) {
  return crypto.createHash("md5").update(value).digest("hex")
}

function requireAdmin(event, body) {
  if (!CONFIG.adminSecret) return "云函数未配置 adminSecret"
  const secret = getHeader(event, "x-admin-secret") || body && body.adminSecret || ""
  if (secret !== CONFIG.adminSecret) return "管理员密码错误"
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

function verifyAfdianApiResponse(response) {
  if (!CONFIG.afdianApiToken || !response || !response.data || !response.sign) return false
  const text = JSON.stringify(response.data)
  return md5(CONFIG.afdianApiToken + "params" + text) === response.sign
}

async function saveWebhookOrder(body) {
  const data = body.data || body
  const orderNo = normalizeCard(data.out_trade_no || data.order_no || data.trade_no)
  if (!orderNo) return

  const cardCode = normalizeCard(data.card_code || data.redeem_code || data.redeem_id || orderNo)
  const record = {
    order_no: orderNo,
    card_code: cardCode,
    user_id: data.user_id || "",
    plan_id: data.plan_id || "",
    product_type: data.product_type || "",
    total_amount: data.total_amount || "",
    raw: data,
    updated_at: now(),
    created_at: now()
  }

  const exists = await db.collection("lvzu_afdian_orders").where({ order_no: orderNo }).limit(1).get()
  if (exists.data && exists.data.length) {
    await db.collection("lvzu_afdian_orders").doc(exists.data[0]._id).update({
      card_code: cardCode,
      raw: data,
      updated_at: now()
    })
    return
  }
  await db.collection("lvzu_afdian_orders").add(record)
}

async function findCard(cardCode) {
  const cards = await db.collection("lvzu_cards").where({ card_code: cardCode }).limit(1).get()
  if (cards.data && cards.data.length) return { type: "card", data: cards.data[0] }

  const orders = await db.collection("lvzu_afdian_orders").where({ card_code: cardCode }).limit(1).get()
  if (orders.data && orders.data.length) return { type: "order", data: orders.data[0] }

  return null
}

async function activate(body) {
  const cardCode = normalizeCard(body.cardCode || body.card_code)
  const deviceCode = normalizeDeviceCode(body.deviceCode || body.device_code)
  if (!cardCode) return json(400, { ok: false, message: "请输入卡密" })
  if (deviceCode.length !== 8) return json(400, { ok: false, message: "请输入 8 位设备码" })

  const card = await findCard(cardCode)
  if (!card) return json(404, { ok: false, message: "卡密不存在，请确认购买后收到的卡密" })

  const current = card.data
  if (current.bound_device_code && current.bound_device_code !== deviceCode) {
    return json(403, { ok: false, message: "卡密已绑定其他设备" })
  }

  const activationCode = makeActivationCode(deviceCode)
  const collection = card.type === "card" ? "lvzu_cards" : "lvzu_afdian_orders"
  await db.collection(collection).doc(current._id).update({
    status: "used",
    bound_device_code: deviceCode,
    activation_code: activationCode,
    activated_at: current.activated_at || now(),
    updated_at: now()
  })

  await db.collection("lvzu_activations").add({
    card_code: cardCode,
    source_type: card.type,
    source_id: current._id,
    device_code: deviceCode,
    activation_code: activationCode,
    created_at: now()
  })

  return json(200, {
    ok: true,
    activationCode,
    message: current.bound_device_code ? "同一设备可重新取回激活码" : "激活码生成成功"
  })
}

async function importCards(event, body) {
  const authError = requireAdmin(event, body)
  if (authError) return json(401, { ok: false, message: authError })

  const cards = Array.isArray(body.cards) ? body.cards.map(normalizeCard).filter(Boolean) : []
  if (!cards.length) return json(400, { ok: false, message: "请输入 cards 数组" })

  let created = 0
  for (let i = 0; i < cards.length; i++) {
    const cardCode = cards[i]
    const exists = await db.collection("lvzu_cards").where({ card_code: cardCode }).limit(1).get()
    if (exists.data && exists.data.length) continue
    await db.collection("lvzu_cards").add({
      card_code: cardCode,
      status: "new",
      created_at: now(),
      updated_at: now()
    })
    created += 1
  }
  return json(200, { ok: true, created })
}

async function generateCards(event, body) {
  const authError = requireAdmin(event, body)
  if (authError) return json(401, { ok: false, message: authError })

  const count = Math.max(1, Math.min(parseInt(body.count, 10) || 1, 500))
  const prefix = normalizeCard(body.prefix || "LZ")
  const cards = []
  let attempts = 0

  while (cards.length < count && attempts < count * 8) {
    attempts += 1
    const cardCode = randomCardCode(prefix)
    if (cards.indexOf(cardCode) >= 0) continue

    const exists = await db.collection("lvzu_cards").where({ card_code: cardCode }).limit(1).get()
    if (exists.data && exists.data.length) continue

    await db.collection("lvzu_cards").add({
      card_code: cardCode,
      status: "new",
      created_at: now(),
      updated_at: now()
    })
    cards.push(cardCode)
  }

  return json(200, { ok: true, cards, text: cards.join("\n") })
}

async function adminSearch(event, body) {
  const authError = requireAdmin(event, body)
  if (authError) return json(401, { ok: false, message: authError })

  const rawKeyword = String(body.keyword || "").trim()
  const cardKeyword = normalizeCard(rawKeyword)
  const deviceKeyword = normalizeDeviceCode(rawKeyword)
  const results = {
    cards: [],
    orders: [],
    activations: []
  }

  if (!rawKeyword) return json(400, { ok: false, message: "请输入要查询的卡密、设备码、订单号或激活码" })

  const seen = {}
  async function collect(collection, field, value, target) {
    if (!value) return
    const res = await db.collection(collection).where({ [field]: value }).limit(30).get()
    const rows = res.data || []
    for (let i = 0; i < rows.length; i++) {
      const key = collection + ":" + rows[i]._id
      if (seen[key]) continue
      seen[key] = true
      target.push(rows[i])
    }
  }

  await collect("lvzu_cards", "card_code", cardKeyword, results.cards)
  await collect("lvzu_cards", "bound_device_code", deviceKeyword, results.cards)
  await collect("lvzu_cards", "activation_code", deviceKeyword, results.cards)
  await collect("lvzu_afdian_orders", "card_code", cardKeyword, results.orders)
  await collect("lvzu_afdian_orders", "order_no", cardKeyword, results.orders)
  await collect("lvzu_afdian_orders", "bound_device_code", deviceKeyword, results.orders)
  await collect("lvzu_afdian_orders", "activation_code", deviceKeyword, results.orders)
  await collect("lvzu_activations", "card_code", cardKeyword, results.activations)
  await collect("lvzu_activations", "device_code", deviceKeyword, results.activations)
  await collect("lvzu_activations", "activation_code", deviceKeyword, results.activations)

  return json(200, { ok: true, results })
}

async function resetCard(event, body) {
  const authError = requireAdmin(event, body)
  if (authError) return json(401, { ok: false, message: authError })

  const cardCode = normalizeCard(body.cardCode || body.card_code)
  if (!cardCode) return json(400, { ok: false, message: "请输入卡密" })

  let updated = 0
  const collections = ["lvzu_cards", "lvzu_afdian_orders"]
  for (let i = 0; i < collections.length; i++) {
    const res = await db.collection(collections[i]).where({ card_code: cardCode }).limit(10).get()
    const rows = res.data || []
    for (let j = 0; j < rows.length; j++) {
      await db.collection(collections[i]).doc(rows[j]._id).update({
        status: "new",
        bound_device_code: "",
        activation_code: "",
        activated_at: null,
        updated_at: now()
      })
      updated += 1
    }
  }

  if (!updated) return json(404, { ok: false, message: "没有找到这张卡密" })
  return json(200, { ok: true, updated })
}

async function adminPing(event, body) {
  const authError = requireAdmin(event, body)
  if (authError) return json(401, { ok: false, message: authError })
  return json(200, { ok: true, message: "管理员验证成功" })
}

exports.main = async (event) => {
  if (event.httpMethod === "OPTIONS" || event.method === "OPTIONS") {
    return json(204, {})
  }

  const path = getPath(event)
  const body = parseBody(event)

  if (path.indexOf("/afdian/webhook") >= 0) {
    await saveWebhookOrder(body)
    return json(200, { ec: 200, em: "" })
  }

  if (path.indexOf("/admin/import-cards") >= 0) {
    return importCards(event, body)
  }

  if (path.indexOf("/admin/ping") >= 0) {
    return adminPing(event, body)
  }

  if (path.indexOf("/admin/generate-cards") >= 0) {
    return generateCards(event, body)
  }

  if (path.indexOf("/admin/search") >= 0) {
    return adminSearch(event, body)
  }

  if (path.indexOf("/admin/reset-card") >= 0) {
    return resetCard(event, body)
  }

  if (path.indexOf("/activate") >= 0) {
    return activate(body)
  }

  return json(200, {
    ok: true,
    name: "lvzu-activation",
    apiTokenConfigured: Boolean(CONFIG.afdianApiToken),
    apiSignCheckReady: verifyAfdianApiResponse({}),
    adminConfigured: Boolean(CONFIG.adminSecret),
    routes: [
      "/activate",
      "/afdian/webhook",
      "/admin/ping",
      "/admin/import-cards",
      "/admin/generate-cards",
      "/admin/search",
      "/admin/reset-card"
    ]
  })
}
