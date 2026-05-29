const { importCards, parseBody, requireAdmin, send } = require("../_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "只支持 POST" })
  const body = parseBody(req)
  const authError = requireAdmin(req, body)
  if (authError) return send(res, 401, { ok: false, message: authError })
  try {
    const result = await importCards(body)
    return send(res, result.status, result.data)
  } catch (err) {
    return send(res, 500, { ok: false, message: "导入失败，请稍后重试" })
  }
}
