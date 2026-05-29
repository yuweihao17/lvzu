const { parseBody, saveWebhookOrder, send, verifyAfdianApiResponse } = require("../_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ec: 200, em: "" })
  if (req.method !== "POST" && req.method !== "GET") return send(res, 405, { ec: 405, em: "method not allowed" })
  try {
    const body = parseBody(req)
    if (req.method === "POST" && body.sign && !verifyAfdianApiResponse(body)) {
      return send(res, 403, { ec: 403, em: "bad sign" })
    }
    if (req.method === "POST") await saveWebhookOrder(body)
    return send(res, 200, { ec: 200, em: "" })
  } catch (err) {
    return send(res, 200, { ec: 200, em: "" })
  }
}
