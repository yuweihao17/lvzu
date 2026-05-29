const { parseBody, requireAdmin, send } = require("../_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  const body = parseBody(req)
  const authError = requireAdmin(req, body)
  if (authError) return send(res, 401, { ok: false, message: authError })
  try {
    return send(res, 200, { ok: true, message: "管理员验证成功" })
  } catch (err) {
    console.error("[admin/ping]", err)
    return send(res, 500, { ok: false, message: err.message || "服务器异常，请稍后重试" })
  }
}
