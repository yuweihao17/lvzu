const fs = require("fs")

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const sourceProject = process.env.SOURCE_PROJECT
const outputFile = process.env.SOURCE_EXPORT_FILE
const sourceSchema = process.env.SOURCE_SCHEMA || "public"

if (!accessToken || !sourceProject || !outputFile) {
  console.error("SUPABASE_ACCESS_TOKEN, SOURCE_PROJECT and SOURCE_EXPORT_FILE are required")
  process.exit(1)
}

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`

async function query(sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${sourceProject}/database/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Supabase query failed (${response.status}): ${text}`)
  return text ? JSON.parse(text) : []
}

async function main() {
  const tableRows = await query(
    `select table_name from information_schema.tables where table_schema='${sourceSchema.replace(/'/g, "''")}' and table_type='BASE TABLE' order by table_name`
  )
  const tables = {}
  const summary = {}
  for (const { table_name: table } of tableRows) {
    const rows = await query(`select to_jsonb(t) as row from ${quote(sourceSchema)}.${quote(table)} t`)
    tables[table] = rows.map((item) => item.row)
    summary[table] = tables[table].length
  }
  fs.writeFileSync(outputFile, JSON.stringify({ sourceProject, sourceSchema, exportedAt: new Date().toISOString(), tables }))
  console.log(JSON.stringify({ sourceProject, outputFile, tables: summary }, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
