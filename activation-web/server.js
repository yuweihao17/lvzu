const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const PORT = Number(process.env.PORT || 3100)
const ROOT = __dirname
const PRODUCTS = {
  lvzu_lingqian: {
    id: "lvzu_lingqian",
    name: "吕祖灵签",
    category: "心灵与生活",
    description: "在小米手环上随时抽取灵签，获得简洁、安静的每日指引。",
    price: "免费激活",
    prefix: "LZ",
    accent: "saffron",
    buyUrl: "https://www.ifdian.net/item/3f67aea8590111f1bb3652540025c377",
    status: "available"
  },
  focus_timer: {
    id: "focus_timer",
    name: "专注计时器",
    category: "效率工具",
    description: "为小米手环设计的轻量番茄钟，抬腕即可开始、暂停和查看进度。",
    price: "即将上线",
    prefix: "FT",
    accent: "blue",
    buyUrl: "#",
    status: "coming_soon"
  },
  habit_ring: {
    id: "habit_ring",
    name: "习惯环",
    category: "健康管理",
    description: "用清晰的环形进度追踪每日习惯，让坚持变成一眼可见的反馈。",
    price: "即将上线",
    prefix: "HR",
    accent: "mint",
    buyUrl: "#",
    status: "coming_soon"
  }
}

let pool = null
try {
  const { Pool } = require("pg")
  if (process.env.DATABASE_URL) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })
} catch (_) {
  pool = null
}

function json(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-secret"
  })
  res.end(body)
}

function productList() {
  return Object.values(PRODUCTS)
}

function normalizeCard(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizeDevice(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 8)
}

function productOf(value) {
  return PRODUCTS[String(value || "lvzu_lingqian")] || PRODUCTS.lvzu_lingqian
}

function activationCode(product, device) {
  const salt = process.env.ACTIVATION_SALT || "xiaomi-app-store-change-before-release"
  return crypto.createHash("sha256").update(`${salt}:${product.id}:${device}`).digest("hex").slice(0, 8).toUpperCase()
}

function randomCardCode(prefix) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(10)
  let code = normalizeCard(prefix || "APP")
  for (let index = 0; index < bytes.length; index += 1) code += alphabet[bytes[index] % alphabet.length]
  return code
}

async function query(text, values) {
  if (!pool) throw new Error("DATABASE_URL 未配置")
  return pool.query(text, values)
}

async function body(req) {
  let raw = ""
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try { return JSON.parse(raw) } catch (_) { return {} }
}

function adminOk(req, data) {
  const configured = process.env.ADMIN_SECRET || ""
  return Boolean(configured && ((req.headers["x-admin-secret"] || "") === configured || data.adminSecret === configured))
}

async function activate(data, recoverOnly) {
  const product = productOf(data.productId)
  const device = normalizeDevice(data.deviceCode)
  if (device.length !== 8) return { status: 400, data: { ok: false, message: "请输入 8 位设备码" } }
  const cardCode = normalizeCard(data.cardCode)
  if (!recoverOnly && !cardCode) return { status: 400, data: { ok: false, message: "请输入卡密" } }

  if (!pool) return { status: 503, data: { ok: false, message: "激活服务正在配置数据库，请稍后重试" } }
  const params = recoverOnly ? [product.id, device] : [product.id, cardCode, device]
  const sql = recoverOnly
    ? "select * from app_activations where product_id=$1 and device_code=$2 order by created_at desc limit 1"
    : "select c.*, p.name as product_name from app_cards c join app_products p on p.id=c.product_id where c.product_id=$1 and c.card_code=$2 limit 1"
  const found = await query(sql, params)
  if (!found.rows.length) return { status: 404, data: { ok: false, message: recoverOnly ? "没有找到这台设备的激活记录" : "卡密不存在，请确认购买后收到的卡密" } }
  const current = found.rows[0]
  if (!recoverOnly && current.bound_device_code && current.bound_device_code !== device) {
    return { status: 403, data: { ok: false, message: "卡密已绑定其他设备" } }
  }
  const code = current.activation_code || activationCode(product, device)
  if (!recoverOnly) {
    await query("update app_cards set status='used', bound_device_code=$1, activation_code=$2, activated_at=coalesce(activated_at, now()), updated_at=now() where id=$3", [device, code, current.id])
    await query("insert into app_activations(product_id, card_id, card_code, device_code, activation_code) values ($1,$2,$3,$4,$5) on conflict do nothing", [product.id, current.id, cardCode, device, code])
  }
  return { status: 200, data: { ok: true, activationCode: code, recovered: recoverOnly || Boolean(current.bound_device_code), message: recoverOnly ? "已找回当前设备激活码" : "激活码生成成功" } }
}

async function route(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {})
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  if (req.method === "GET" && url.pathname === "/api/products") return json(res, 200, { ok: true, products: productList() })
  if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { ok: true, service: "xiaomi-app-store", databaseConfigured: Boolean(pool), products: productList().length })
  if (req.method === "POST") {
    const data = await body(req)
    try {
      if (url.pathname === "/api/activate") { const result = await activate(data, false); return json(res, result.status, result.data) }
      if (url.pathname === "/api/recover") { const result = await activate(data, true); return json(res, result.status, result.data) }
      if (url.pathname === "/api/admin/ping") return json(res, adminOk(req, data) ? 200 : 401, { ok: adminOk(req, data), message: adminOk(req, data) ? "管理员验证成功" : "管理员密码错误" })
      if (url.pathname === "/api/admin/search") {
        if (!adminOk(req, data)) return json(res, 401, { ok: false, message: "管理员密码错误" })
        const keyword = normalizeCard(data.keyword)
        const result = await query("select * from app_cards where card_code=$1 or bound_device_code=$1 or activation_code=$1 order by created_at desc limit 50", [keyword])
        return json(res, 200, { ok: true, results: { cards: result.rows, orders: [], activations: [] } })
      }
      if (url.pathname === "/api/admin/import-cards") {
        if (!adminOk(req, data)) return json(res, 401, { ok: false, message: "管理员密码错误" })
        const product = productOf(data.productId)
        const cards = Array.isArray(data.cards) ? data.cards.map(normalizeCard).filter(Boolean) : []
        if (!cards.length) return json(res, 400, { ok: false, message: "请提供 cards 数组" })
        let created = 0
        for (const cardCode of [...new Set(cards)]) {
          const result = await query("insert into app_cards(product_id,card_code,status) values($1,$2,'new') on conflict(card_code) do nothing", [product.id, cardCode])
          created += result.rowCount
        }
        return json(res, 200, { ok: true, created })
      }
      if (url.pathname === "/api/admin/generate-cards") {
        if (!adminOk(req, data)) return json(res, 401, { ok: false, message: "管理员密码错误" })
        const product = productOf(data.productId)
        const count = Math.max(1, Math.min(Number.parseInt(data.count, 10) || 1, 500))
        const cards = []
        let attempts = 0
        while (cards.length < count && attempts < count * 30) {
          attempts += 1
          const cardCode = randomCardCode(data.prefix || product.prefix)
          const result = await query("insert into app_cards(product_id,card_code,status) values($1,$2,'new') on conflict(card_code) do nothing returning card_code", [product.id, cardCode])
          if (result.rowCount) cards.push(cardCode)
        }
        return json(res, 200, { ok: true, cards, text: cards.join("\n") })
      }
      if (url.pathname === "/api/admin/reset-card") {
        if (!adminOk(req, data)) return json(res, 401, { ok: false, message: "管理员密码错误" })
        const cardCode = normalizeCard(data.cardCode)
        if (!cardCode) return json(res, 400, { ok: false, message: "请输入卡密" })
        const card = await query("select id from app_cards where card_code=$1", [cardCode])
        if (!card.rows.length) return json(res, 404, { ok: false, message: "没有找到这张卡密" })
        await query("delete from app_activations where card_id=$1", [card.rows[0].id])
        await query("update app_cards set status='new',bound_device_code='',activation_code='',activated_at=null,updated_at=now() where id=$1", [card.rows[0].id])
        return json(res, 200, { ok: true, updated: 1 })
      }
    } catch (error) {
      return json(res, 500, { ok: false, message: error.message || "服务器异常" })
    }
  }
  if (req.method === "GET") {
    const file = url.pathname === "/" ? path.join(ROOT, "index.html") : path.join(ROOT, url.pathname.replace(/^\//, ""))
    if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const type = file.endsWith(".html") ? "text/html; charset=utf-8" : file.endsWith(".js") ? "text/javascript; charset=utf-8" : "application/octet-stream"
      res.writeHead(200, { "content-type": type, "cache-control": file.endsWith(".html") ? "no-cache" : "public, max-age=86400, immutable" })
      return fs.createReadStream(file).pipe(res)
    }
  }
  return json(res, 404, { ok: false, message: "Not found" })
}

const server = http.createServer((req, res) => route(req, res).catch(error => json(res, 500, { ok: false, message: error.message || "服务器异常" })))
server.listen(PORT, "0.0.0.0", () => console.log(`xiaomi-app-store listening on ${PORT}`))
