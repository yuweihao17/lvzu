const { activate, parseBody, publicErrorMessage, send } = require("./_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "只支持 POST" })
  try {
    const result = await activate(parseBody(req))
    return send(res, result.status, result.data)
  } catch (err) {
    console.error("[activate]", err)
    return send(res, err.status || 500, {
      ok: false,
      message: publicErrorMessage(err)
    })
  }
}
