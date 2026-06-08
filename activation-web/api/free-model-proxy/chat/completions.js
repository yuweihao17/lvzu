const { Readable } = require("node:stream")
const { createFreeModelService } = require("../../_lib/free-models")
const { parseBody, publicErrorMessage, send } = require("../../_lib/activation")

function normalizeHeaders(headers = {}) {
  const output = {}
  Object.keys(headers).forEach((key) => {
    const value = headers[key]
    if (value !== undefined && value !== null && value !== "") {
      output[key.toLowerCase()] = String(value)
    }
  })
  return output
}

function toProxyUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "") + "/chat/completions"
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "只支持 POST" })

  const body = parseBody(req)
  const service = createFreeModelService()
  const target = await service.getProxyTarget(body)

  if (!target) {
    return send(res, 404, { ok: false, message: "未找到可用的免费模型" })
  }

  const payload = {
    ...body,
    model: body.model || body.modelId || body.model_id || target.model.model_id,
    stream: true
  }

  try {
    const response = await fetch(toProxyUrl(target.url), {
      method: "POST",
      headers: normalizeHeaders({
        authorization: target.apiKey ? `Bearer ${target.apiKey}` : "",
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(req.headers["x-request-id"] ? { "x-request-id": req.headers["x-request-id"] } : {})
      }),
      body: JSON.stringify(payload)
    })

    res.statusCode = response.status
    res.setHeader("content-type", response.headers.get("content-type") || "text/event-stream; charset=utf-8")
    res.setHeader("cache-control", "no-cache, no-transform")
    res.setHeader("connection", "keep-alive")
    res.setHeader("access-control-allow-origin", "*")

    if (!response.body) {
      const text = await response.text()
      return res.end(text)
    }

    const readable = Readable.fromWeb(response.body)
    readable.on("error", (error) => {
      console.error("[free-model-proxy]", error)
      if (!res.writableEnded) {
        res.end(`data: ${JSON.stringify({ error: publicErrorMessage(error, "免费模型代理失败") })}\n\n`)
      }
    })
    readable.pipe(res)
  } catch (error) {
    console.error("[free-model-proxy]", error)
    return send(res, 502, {
      ok: false,
      message: publicErrorMessage(error, "免费模型代理失败")
    })
  }
}
