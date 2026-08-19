const crypto = require("crypto")
const fs = require("fs")
const { Client } = require("pg")

const sourceUrl = process.env.SOURCE_DATABASE_URL
const sourceExportFile = process.env.SOURCE_EXPORT_FILE
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL
const sourceProject = process.env.SOURCE_PROJECT || "unknown-supabase-project"
const sourceSchema = process.env.SOURCE_SCHEMA || "public"
const dryRun = process.env.IMPORT_DRY_RUN === "1"

if ((!sourceUrl && !sourceExportFile) || !targetUrl) {
  console.error("SOURCE_DATABASE_URL or SOURCE_EXPORT_FILE, plus TARGET_DATABASE_URL, are required")
  process.exit(1)
}

const source = sourceUrl ? new Client({ connectionString: sourceUrl }) : null
const target = new Client({ connectionString: targetUrl })
const knownProducts = new Set()
const quote = (value) => `"${String(value).replace(/"/g, '""')}"`
const rowId = (row) => String(row.id || row.code || row.order_no || crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex"))
const normalCard = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "")
const asDate = (value) => {
  if (!value) return null
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const number = Number(value)
    return new Date(number > 100000000000 ? number : number * 1000)
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function preserve(table, row) {
  await target.query(
    "insert into legacy_rows(source_project,source_table,source_row_id,row_data) values($1,$2,$3,$4::jsonb) on conflict(source_project,source_table,source_row_id) do update set row_data=excluded.row_data, imported_at=now()",
    [sourceProject, table, rowId(row), JSON.stringify(row)]
  )
}

async function ensureLegacyProduct() {
  if (!dryRun) {
    await target.query(
      "insert into app_products(id,name,category,description,status,sort_order) values('thewow_legacy','TheWow 历史订单','历史数据','为保留原业务订单而建立的隐藏产品记录。','hidden',999) on conflict(id) do nothing"
    )
  }
  knownProducts.add("thewow_legacy")
  const products = await target.query("select id from app_products")
  for (const product of products.rows) knownProducts.add(product.id)
}

function resolveProductId(value) {
  const candidate = String(value || "lvzu_lingqian")
  return knownProducts.has(candidate) ? candidate : null
}

async function mapProfile(row) {
  if (!row.id) return
  await target.query(
    "insert into app_users(source_project,source_user_id,email,display_name,metadata) values($1,$2,$3,$4,$5::jsonb) on conflict(source_project,source_user_id) do update set email=excluded.email,display_name=excluded.display_name,metadata=excluded.metadata,updated_at=now()",
    [sourceProject, String(row.id), row.email || null, row.display_name || null, JSON.stringify(row)]
  )
}

async function mapCard(row) {
  const cardCode = normalCard(row.card_code || row.code)
  if (!cardCode) return false
  const product = resolveProductId(row.product_id)
  if (!product) return false
  const status = ["new", "used", "disabled"].includes(row.status) ? row.status : (row.bound_device_code ? "used" : "new")
  await target.query(
    "insert into app_cards(product_id,card_code,status,bound_device_code,activation_code,activated_at,created_at,updated_at) values($1,$2,$3,$4,$5,$6,coalesce($7,now()),coalesce($8,now())) on conflict(card_code) do nothing",
    [product, cardCode, status, row.bound_device_code || "", row.activation_code || "", asDate(row.activated_at), asDate(row.created_at), asDate(row.updated_at)]
  )
  return true
}

async function mapAfdianOrder(row) {
  const product = resolveProductId(row.product_id)
  if (!product) return false
  const cardCode = normalCard(row.card_code || row.redeem_code || row.order_no)
  if (cardCode) await mapCard({ ...row, product_id: product, card_code: cardCode })
  const orderNo = String(row.order_no || row.out_trade_no || "")
  if (!orderNo) return false
  await target.query(
    "insert into app_orders(product_id,provider,external_order_no,card_code,amount_cents,currency,status,metadata,created_at,updated_at) values($1,'afdian',$2,$3,$4,'CNY',$5,$6::jsonb,coalesce($7,now()),coalesce($8,now())) on conflict(provider,external_order_no) do nothing",
    [product, orderNo, cardCode || null, Number.isFinite(Number(row.total_amount)) ? Math.round(Number(row.total_amount) * 100) : null, row.status || "pending", JSON.stringify(row), asDate(row.created_at), asDate(row.updated_at)]
  )
  return true
}

async function mapActivation(row) {
  const product = resolveProductId(row.product_id)
  if (!product) return false
  const device = String(row.device_code || row.bound_device_code || "")
  const cardCode = normalCard(row.card_code)
  if (!device || !cardCode || !row.activation_code) return false
  const card = await target.query("select id from app_cards where card_code=$1", [cardCode])
  await target.query(
    "insert into app_activations(product_id,card_id,card_code,device_code,activation_code,created_at) values($1,$2,$3,$4,$5,coalesce($6,now())) on conflict(product_id,device_code) do nothing",
    [product, card.rows[0]?.id || null, cardCode, device, row.activation_code, asDate(row.created_at)]
  )
  return true
}

async function mapTheWowOrder(row) {
  const sourceUserId = row.user_id ? String(row.user_id) : null
  let userId = null
  if (sourceUserId) {
    const user = await target.query("select id from app_users where source_project=$1 and source_user_id=$2", [sourceProject, sourceUserId])
    userId = user.rows[0]?.id || null
  }
  await target.query(
    "insert into app_orders(product_id,user_id,provider,external_order_no,amount_cents,currency,status,metadata,created_at,updated_at) values('thewow_legacy',$1,$2,$3,$4,$5,$6,$7::jsonb,coalesce($8,now()),coalesce($9,now())) on conflict(provider,external_order_no) do nothing",
    [userId, row.provider || "thewow", row.external_order_id || row.id || null, row.amount_cents || null, row.currency || "CNY", row.status || "pending", JSON.stringify(row), asDate(row.created_at), asDate(row.updated_at)]
  )
  return true
}

async function main() {
  if (source) await source.connect()
  await target.connect()
  try {
    if (!dryRun) await target.query("begin")
    await ensureLegacyProduct()
    const exported = sourceExportFile ? JSON.parse(fs.readFileSync(sourceExportFile, "utf8")) : null
    if (exported && exported.sourceProject !== sourceProject) throw new Error("SOURCE_PROJECT does not match export file")
    const tableNames = exported
      ? Object.keys(exported.tables).sort()
      : (await source.query("select table_name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' order by table_name", [sourceSchema])).rows.map((row) => row.table_name)
    const summary = {}
    for (const table of tableNames) {
      if (dryRun) {
        const count = exported ? exported.tables[table].length : (await source.query(`select count(*)::int as count from ${quote(sourceSchema)}.${quote(table)}`)).rows[0].count
        summary[table] = { read: count, preserved: 0, mapped: 0 }
        continue
      }
      const rows = exported ? exported.tables[table] : (await source.query(`select to_jsonb(t) as row from ${quote(sourceSchema)}.${quote(table)} t`)).rows.map((result) => result.row)
      summary[table] = { read: rows.length, preserved: 0, mapped: 0 }
      for (const row of rows) {
        await preserve(table, row)
        summary[table].preserved += 1
        if (table === "profiles") { await mapProfile(row); summary[table].mapped += 1 }
        if (table === "lvzu_cards" && await mapCard(row)) summary[table].mapped += 1
        if (table === "lvzu_afdian_orders" && await mapAfdianOrder(row)) summary[table].mapped += 1
        if (table === "lvzu_activations" && await mapActivation(row)) summary[table].mapped += 1
        if (table === "orders" && await mapTheWowOrder(row)) summary[table].mapped += 1
      }
    }
    if (!dryRun) await target.query("commit")
    console.log(JSON.stringify({ sourceProject, dryRun, tables: summary }, null, 2))
  } catch (error) {
    if (!dryRun) await target.query("rollback").catch(() => {})
    throw error
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => { if (source) await source.end().catch(() => {}); await target.end().catch(() => {}) })
