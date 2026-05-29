const { parseBody, requireAdmin, send } = require("../_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  const body = parseBody(req)
  const authError = requireAdmin(req, body)
  if (authError) return send(res, 401, { ok: false, message: authError })
  return send(res, 200, { ok: true, message: "管理员验证成功" })
}
