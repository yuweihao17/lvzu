const http = require("http")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { Pool } = require("pg")
const { DEFAULT_AFDIAN_USER_ID, makeActivationCode, normalizeDevice } = require("./lib/activation-code")
const { hashSecret, verifySecret, parseCookies, sessionTokenHash, validateNewSecret } = require("./lib/admin-auth")
const { normalizeProductInput, normalizePlanInput, cardPrefix } = require("./lib/catalog-model")

const PORT = Number(process.env.PORT || 3100)
const ROOT = __dirname
const SESSION_COOKIE = "admin_session"
const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 8 }) : null

function requestIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim().slice(0, 96)
}

function json(res, status, data, headers = {}) {
  const payload = JSON.stringify(data)
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers
  })
  res.end(payload)
}

async function body(req) {
  let raw = ""
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 1024 * 1024) throw new Error("请求内容过大")
  }
  if (!raw) return {}
  try { return JSON.parse(raw) } catch (_) { throw new Error("请求格式无效") }
}

async function query(text, values) {
  if (!pool) throw new Error("DATABASE_URL 未配置")
  return pool.query(text, values)
}

function normalizeCard(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "")
}

function productDto(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    buyUrl: row.purchase_url,
    price: row.price_label,
    prefix: row.prefix,
    accent: row.accent,
    status: row.status,
    sortOrder: row.sort_order
  }
}

async function products(includeHidden = false) {
  const result = await query(`select * from app_products ${includeHidden ? "" : "where status <> 'hidden'"} order by sort_order, created_at`)
  return result.rows.map(productDto)
}

async function productOf(id) {
  const result = await query("select * from app_products where id=$1 limit 1", [String(id || "")])
  return result.rows[0] ? productDto(result.rows[0]) : null
}

function activationCode(product, device) {
  const salt = process.env.ACTIVATION_SALT || (process.env.NODE_ENV === "production" ? "" : "xiaomi-app-store-local-development")
  return makeActivationCode({
    salt,
    productId: product.id,
    deviceCode: device,
    userId: process.env.AFDIAN_USER_ID || DEFAULT_AFDIAN_USER_ID
  })
}

function randomCardCode(prefix) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(10)
  let code = cardPrefix(prefix)
  for (const byte of bytes) code += alphabet[byte % alphabet.length]
  return code
}

async function audit(req, action, targetType = "", targetId = "", metadata = {}) {
  await query("insert into admin_audit_logs(action,target_type,target_id,ip_address,metadata) values($1,$2,$3,$4,$5)", [action, targetType, String(targetId || ""), requestIp(req), JSON.stringify(metadata)])
}

async function credential() {
  const result = await query("select * from admin_credentials where id=1")
  return result.rows[0] || null
}

async function bootstrapCredential() {
  let current = await credential()
  if (current) return current
  const secret = process.env.ADMIN_SECRET || ""
  if (!secret) return null
  await query("insert into admin_credentials(id,secret_hash,secret_version) values(1,$1,1) on conflict(id) do nothing", [hashSecret(secret)])
  current = await credential()
  return current
}

function sessionCookie(token, maxAgeSeconds = Math.floor(SESSION_LIFETIME_MS / 1000)) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`
}

async function createSession(req, secret) {
  const current = await bootstrapCredential()
  if (!current || !verifySecret(secret, current.secret_hash)) return null
  const token = crypto.randomBytes(32).toString("base64url")
  await query("delete from admin_sessions where expires_at <= now()")
  await query("insert into admin_sessions(token_hash,secret_version,ip_address,user_agent,expires_at) values($1,$2,$3,$4,$5)", [sessionTokenHash(token), current.secret_version, requestIp(req), String(req.headers["user-agent"] || "").slice(0, 400), new Date(Date.now() + SESSION_LIFETIME_MS)])
  return token
}

async function adminSession(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) return null
  const result = await query(`select s.* from admin_sessions s join admin_credentials c on c.id=1 and c.secret_version=s.secret_version where s.token_hash=$1 and s.expires_at > now()`, [sessionTokenHash(token)])
  if (!result.rows.length) return null
  await query("update admin_sessions set last_seen_at=now() where id=$1", [result.rows[0].id])
  return result.rows[0]
}

async function requireAdmin(req, res) {
  const session = await adminSession(req)
  if (!session) {
    json(res, 401, { ok: false, message: "管理员会话已失效，请重新登录" }, { "set-cookie": sessionCookie("", 0) })
    return null
  }
  return session
}

async function activate(data, recoverOnly) {
  const product = await productOf(data.productId)
  if (!product || product.status === "hidden") return { status: 404, data: { ok: false, message: "应用不存在或已下架" } }
  const device = normalizeDevice(data.deviceCode)
  if (device.length !== 8) return { status: 400, data: { ok: false, message: "请输入 8 位设备码" } }
  const codeValue = normalizeCard(data.cardCode)
  if (!recoverOnly && !codeValue) return { status: 400, data: { ok: false, message: "请输入卡密" } }
  const found = await query(recoverOnly
    ? "select * from app_activations where product_id=$1 and device_code=$2 order by created_at desc limit 1"
    : "select c.*,p.max_devices,p.max_activations from app_cards c left join product_plans p on p.id=c.plan_id where c.product_id=$1 and c.card_code=$2 limit 1", [product.id, recoverOnly ? device : codeValue])
  if (!found.rows.length) return { status: 404, data: { ok: false, message: recoverOnly ? "没有找到这台设备的激活记录" : "卡密不存在或不属于当前应用" } }
  const current = found.rows[0]
  if (!recoverOnly && ["disabled", "revoked", "expired"].includes(current.status)) return { status: 403, data: { ok: false, message: "这张卡密当前不可使用" } }
  if (!recoverOnly && current.expires_at && new Date(current.expires_at) <= new Date()) return { status: 403, data: { ok: false, message: "这张卡密已经过期" } }
  if (!recoverOnly && current.bound_device_code && current.bound_device_code !== device) return { status: 403, data: { ok: false, message: "卡密已绑定其他设备" } }
  const generated = current.activation_code || activationCode(product, device)
  if (!recoverOnly) {
    await query("update app_cards set status='used',bound_device_code=$1,activation_code=$2,activated_at=coalesce(activated_at,now()),updated_at=now() where id=$3", [device, generated, current.id])
    await query("insert into app_activations(product_id,card_id,card_code,device_code,activation_code) values($1,$2,$3,$4,$5) on conflict(product_id,device_code) do update set card_id=excluded.card_id,card_code=excluded.card_code,activation_code=excluded.activation_code", [product.id, current.id, codeValue, device, generated])
  }
  return { status: 200, data: { ok: true, activationCode: generated, recovered: recoverOnly || Boolean(current.bound_device_code), message: recoverOnly ? "已找回当前设备激活码" : "激活码生成成功" } }
}

async function adminSummary() {
  const result = await query(`select (select count(*)::int from app_products where status <> 'hidden') products,(select count(*)::int from app_cards where status='new') available_cards,(select count(*)::int from app_cards where status='used') used_cards,(select count(*)::int from app_activations where created_at >= now()-interval '7 days') activations_7d,(select count(*)::int from app_orders) orders`)
  const activity = await query("select action,target_type,target_id,created_at from admin_audit_logs order by created_at desc limit 8")
  const inventory = await query("select p.id,p.name,count(c.id) filter(where c.status='new')::int available,count(c.id) filter(where c.status='used')::int used from app_products p left join app_cards c on c.product_id=p.id group by p.id,p.name,p.sort_order order by p.sort_order")
  return { ...result.rows[0], activity: activity.rows, inventory: inventory.rows }
}

async function adminRoute(req, res, url, data) {
  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    const token = await createSession(req, data.secret)
    if (!token) {
      await audit(req, "admin.login_failed")
      return json(res, 401, { ok: false, message: "管理员密钥错误" })
    }
    await audit(req, "admin.login")
    return json(res, 200, { ok: true, message: "登录成功" }, { "set-cookie": sessionCookie(token) })
  }
  const session = await requireAdmin(req, res)
  if (!session) return
  if (url.pathname === "/api/admin/session" && req.method === "GET") return json(res, 200, { ok: true })
  if (url.pathname === "/api/admin/logout" && req.method === "POST") {
    await query("delete from admin_sessions where id=$1", [session.id])
    await audit(req, "admin.logout")
    return json(res, 200, { ok: true }, { "set-cookie": sessionCookie("", 0) })
  }
  if (url.pathname === "/api/admin/summary" && req.method === "GET") return json(res, 200, { ok: true, summary: await adminSummary() })
  if (url.pathname === "/api/admin/products" && req.method === "GET") return json(res, 200, { ok: true, products: await products(true) })
  if (url.pathname === "/api/admin/products" && req.method === "POST") {
    const item = normalizeProductInput(data)
    await query(`insert into app_products(id,name,category,description,purchase_url,price_label,prefix,accent,status,sort_order) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,purchase_url=excluded.purchase_url,price_label=excluded.price_label,prefix=excluded.prefix,accent=excluded.accent,status=excluded.status,sort_order=excluded.sort_order,updated_at=now()`, [item.id, item.name, item.category, item.description, item.purchaseUrl, item.priceLabel, cardPrefix(data.prefix), item.accent, item.status, item.sortOrder])
    await audit(req, "product.saved", "product", item.id)
    return json(res, 200, { ok: true, product: item })
  }
  if (url.pathname === "/api/admin/plans" && req.method === "GET") {
    const result = await query("select pp.*,p.name product_name from product_plans pp join app_products p on p.id=pp.product_id order by p.sort_order,pp.created_at")
    return json(res, 200, { ok: true, plans: result.rows })
  }
  if (url.pathname === "/api/admin/plans" && req.method === "POST") {
    const item = normalizePlanInput(data)
    const result = await query(`insert into product_plans(product_id,name,prefix,duration_days,max_devices,max_activations,status) values($1,$2,$3,$4,$5,$6,$7) on conflict(product_id,name) do update set prefix=excluded.prefix,duration_days=excluded.duration_days,max_devices=excluded.max_devices,max_activations=excluded.max_activations,status=excluded.status,updated_at=now() returning *`, [item.productId, item.name, item.prefix, item.durationDays, item.maxDevices, item.maxActivations, item.status])
    await audit(req, "plan.saved", "plan", result.rows[0].id, { productId: item.productId })
    return json(res, 200, { ok: true, plan: result.rows[0] })
  }
  if (url.pathname === "/api/admin/cards" && req.method === "GET") {
    const productId = String(url.searchParams.get("productId") || "")
    const status = String(url.searchParams.get("status") || "")
    const keyword = normalizeCard(url.searchParams.get("keyword") || "")
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page"), 10) || 1)
    const result = await query("select c.*,p.name product_name,pp.name plan_name,cb.batch_name,count(*) over()::int total from app_cards c join app_products p on p.id=c.product_id left join product_plans pp on pp.id=c.plan_id left join card_batches cb on cb.id=c.batch_id where ($1='' or c.product_id=$1) and ($2='' or c.status=$2) and ($3='' or c.card_code=$3 or c.bound_device_code=$3 or c.activation_code=$3) order by c.created_at desc limit 40 offset $4", [productId, status, keyword, (page - 1) * 40])
    return json(res, 200, { ok: true, cards: result.rows, total: result.rows[0]?.total || 0, page })
  }
  if (url.pathname === "/api/admin/generate-cards" && req.method === "POST") return generateCards(req, res, data)
  if (url.pathname === "/api/admin/import-cards" && req.method === "POST") return importCards(req, res, data)
  if (url.pathname === "/api/admin/reset-card" && req.method === "POST") {
    const code = normalizeCard(data.cardCode)
    const card = await query("select id from app_cards where card_code=$1", [code])
    if (!card.rows.length) return json(res, 404, { ok: false, message: "没有找到这张卡密" })
    await query("update app_cards set status='new',bound_device_code='',activation_code='',activated_at=null,updated_at=now() where id=$1", [card.rows[0].id])
    await audit(req, "card.reset", "card", card.rows[0].id, { cardLast4: code.slice(-4) })
    return json(res, 200, { ok: true })
  }
  if (url.pathname === "/api/admin/card-status" && req.method === "POST") {
    const next = ["new", "revoked", "disabled"].includes(data.status) ? data.status : "disabled"
    const result = await query("update app_cards set status=$1,updated_at=now() where id=$2 returning id", [next, data.id])
    if (!result.rows.length) return json(res, 404, { ok: false, message: "卡密不存在" })
    await audit(req, "card.status_changed", "card", data.id, { status: next })
    return json(res, 200, { ok: true })
  }
  if (url.pathname === "/api/admin/activations" && req.method === "GET") {
    const result = await query("select a.*,p.name product_name from app_activations a join app_products p on p.id=a.product_id order by a.created_at desc limit 100")
    return json(res, 200, { ok: true, activations: result.rows })
  }
  if (url.pathname === "/api/admin/orders" && req.method === "GET") {
    const result = await query("select o.*,p.name product_name from app_orders o join app_products p on p.id=o.product_id order by o.created_at desc limit 100")
    return json(res, 200, { ok: true, orders: result.rows })
  }
  if (url.pathname === "/api/admin/audit" && req.method === "GET") {
    const result = await query("select * from admin_audit_logs order by created_at desc limit 100")
    return json(res, 200, { ok: true, logs: result.rows })
  }
  if (url.pathname === "/api/admin/change-secret" && req.method === "POST") {
    const current = await credential()
    if (!current || !verifySecret(data.currentSecret, current.secret_hash)) return json(res, 400, { ok: false, message: "当前密钥不正确" })
    const validation = validateNewSecret(data.newSecret, data.currentSecret)
    if (validation) return json(res, 400, { ok: false, message: validation })
    await query("update admin_credentials set secret_hash=$1,secret_version=secret_version+1,rotated_at=now(),updated_at=now() where id=1", [hashSecret(data.newSecret)])
    await audit(req, "admin.secret_changed", "admin", "1")
    await query("delete from admin_sessions")
    return json(res, 200, { ok: true, message: "管理员密钥已更新，请重新登录" }, { "set-cookie": sessionCookie("", 0) })
  }
  return json(res, 404, { ok: false, message: "Not found" })
}

async function generateCards(req, res, data) {
  const count = Math.max(1, Math.min(Number.parseInt(data.count, 10) || 1, 500))
  const found = await query("select pp.*,p.id product_id from product_plans pp join app_products p on p.id=pp.product_id where pp.id=$1 and pp.status='active'", [data.planId])
  if (!found.rows.length) return json(res, 404, { ok: false, message: "套餐不存在或已停用" })
  const item = found.rows[0]
  const client = await pool.connect()
  try {
    await client.query("begin")
    const batch = await client.query("insert into card_batches(plan_id,batch_name,quantity,source,expires_at,notes) values($1,$2,$3,'generated',$4,$5) returning *", [item.id, String(data.batchName || `批次 ${new Date().toLocaleDateString("zh-CN")}`).trim(), count, data.expiresAt || null, String(data.notes || "").trim()])
    const cards = []
    while (cards.length < count) {
      const code = randomCardCode(item.prefix)
      const saved = await client.query("insert into app_cards(product_id,plan_id,batch_id,card_code,status,expires_at) values($1,$2,$3,$4,'new',$5) on conflict(card_code) do nothing returning card_code", [item.product_id, item.id, batch.rows[0].id, code, data.expiresAt || null])
      if (saved.rowCount) cards.push(code)
    }
    await client.query("commit")
    await audit(req, "cards.generated", "batch", batch.rows[0].id, { count, productId: item.product_id })
    return json(res, 200, { ok: true, cards, batch: batch.rows[0] })
  } catch (error) {
    await client.query("rollback")
    throw error
  } finally { client.release() }
}

async function importCards(req, res, data) {
  const cards = [...new Set((Array.isArray(data.cards) ? data.cards : []).map(normalizeCard).filter(Boolean))]
  if (!cards.length) return json(res, 400, { ok: false, message: "请输入要导入的卡密" })
  const plan = await query("select pp.*,p.id product_id from product_plans pp join app_products p on p.id=pp.product_id where pp.id=$1", [data.planId])
  if (!plan.rows.length) return json(res, 404, { ok: false, message: "套餐不存在" })
  const item = plan.rows[0]
  const batch = await query("insert into card_batches(plan_id,batch_name,quantity,source,notes) values($1,$2,$3,'imported',$4) returning *", [item.id, String(data.batchName || "手工导入").trim(), cards.length, String(data.notes || "").trim()])
  let created = 0
  for (const code of cards) {
    const saved = await query("insert into app_cards(product_id,plan_id,batch_id,card_code,status) values($1,$2,$3,$4,'new') on conflict(card_code) do nothing", [item.product_id, item.id, batch.rows[0].id, code])
    created += saved.rowCount
  }
  await audit(req, "cards.imported", "batch", batch.rows[0].id, { requested: cards.length, created })
  return json(res, 200, { ok: true, created, skipped: cards.length - created })
}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" }

function staticFile(res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname
  const file = path.resolve(ROOT, `.${requested}`)
  if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false
  const extension = path.extname(file)
  const cacheControl = [".html", ".js", ".css"].includes(extension) ? "no-cache" : "public, max-age=86400"
  res.writeHead(200, { "content-type": MIME[extension] || "application/octet-stream", "cache-control": cacheControl, "x-content-type-options": "nosniff" })
  fs.createReadStream(file).pipe(res)
  return true
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`)
  if (url.pathname === "/api/products" && req.method === "GET") return json(res, 200, { ok: true, products: await products() })
  if (url.pathname === "/api/health" && req.method === "GET") {
    try {
      const count = await query("select count(*)::int products from app_products where status <> 'hidden'")
      return json(res, 200, { ok: true, service: "xiaomi-app-store", databaseConfigured: true, products: count.rows[0].products })
    } catch (_) { return json(res, 503, { ok: false, service: "xiaomi-app-store", databaseConfigured: Boolean(pool), message: "数据库暂时无法连接" }) }
  }
  if (url.pathname === "/api/activate" && req.method === "POST") {
    const result = await activate(await body(req), false)
    return json(res, result.status, result.data)
  }
  if (url.pathname === "/api/recover" && req.method === "POST") {
    const result = await activate(await body(req), true)
    return json(res, result.status, result.data)
  }
  if (url.pathname.startsWith("/api/admin/")) return adminRoute(req, res, url, req.method === "POST" ? await body(req) : {})
  if (req.method === "GET" && staticFile(res, url)) return
  return json(res, 404, { ok: false, message: "Not found" })
}

async function start() {
  if (pool) {
    await pool.query(fs.readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"))
    await bootstrapCredential()
  }
  return http.createServer((req, res) => route(req, res).catch(error => {
    console.error(error)
    json(res, 500, { ok: false, message: error.message || "服务器异常" })
  })).listen(PORT, "0.0.0.0", () => console.log(`xiaomi-app-store listening on ${PORT}`))
}

if (require.main === module) start().catch(error => { console.error(error); process.exit(1) })

module.exports = { start, route }
