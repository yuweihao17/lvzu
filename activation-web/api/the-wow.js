const { parseBody, publicErrorMessage, requireAdmin, send } = require("./_lib/activation")
const { createFreeModelService } = require("./_lib/free-models")
const { createWowLicenseService } = require("./_lib/the-wow-license")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  if (req.method !== "POST") return send(res, 405, { ok: false, message: "只支持 POST" })

  const body = parseBody(req)
  const action = String(body.action || "").trim().toLowerCase()
  const service = createWowLicenseService()
  const freeModelService = createFreeModelService()

  try {
    if (action === "redeem") {
      const result = await service.redeem(body)
      return send(res, result.status, result.data)
    }

    if (action === "status") {
      const result = await service.status(body)
      return send(res, result.status, result.data)
    }

    if (action === "consume") {
      const result = await service.consume(body)
      return send(res, result.status, result.data)
    }

    if (action === "generate-cards") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await service.generateCards(body)
      return send(res, result.status, result.data)
    }

    if (action === "grant-entitlement" || action === "upgrade-card") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await service.grantEntitlement(body)
      return send(res, result.status, result.data)
    }

    if (action === "search-license") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await service.searchLicense(body)
      return send(res, result.status, result.data)
    }

    if (action === "list-free-models") {
      const adminView = String(body.adminView || body.admin_view || "").toLowerCase() === "true"
      if (adminView) {
        const authError = requireAdmin(req, body)
        if (authError) return send(res, 401, { ok: false, message: authError })
      }
      const result = await freeModelService.listCatalog({
        ...body,
        adminView,
        proxyBaseUrl: body.proxyBaseUrl || body.proxy_base_url || "/api/free-model-proxy"
      })
      return send(res, result.status, result.data)
    }

    if (action === "upsert-free-model") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await freeModelService.upsertModel(body)
      return send(res, result.status, result.data)
    }

    if (action === "set-free-model-enabled") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await freeModelService.setModelEnabled(body)
      return send(res, result.status, result.data)
    }

    if (action === "delete-free-model") {
      const authError = requireAdmin(req, body)
      if (authError) return send(res, 401, { ok: false, message: authError })
      const result = await freeModelService.deleteModel(body)
      return send(res, result.status, result.data)
    }

    return send(res, 400, { ok: false, message: "未知操作" })
  } catch (err) {
    console.error("[the-wow]", err)
    return send(res, err.status || 500, {
      ok: false,
      message: publicErrorMessage(err, "the_wow 授权服务异常，请稍后重试")
    })
  }
}
