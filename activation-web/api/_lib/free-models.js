const { sb } = require("./activation")

const PRODUCT_ID = "the_wow"
const DEFAULT_PROXY_BASE_URL = process.env.FREE_MODEL_PROXY_BASE_URL || "/api/free-model-proxy"

function normalizeText(value) {
  return String(value || "").trim()
}

function normalizeModelId(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, "-")
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, "")
}

function normalizeBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value
  if (value === 0 || value === "0" || value === "false") return false
  if (value === 1 || value === "1" || value === "true") return true
  return fallback
}

function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeRow(row = {}) {
  const modelId = normalizeModelId(row.model_id || row.modelId || row.id)
  const name = normalizeText(row.name)
  if (!modelId || !name) return null

  return {
    product_id: normalizeText(row.product_id || PRODUCT_ID) || PRODUCT_ID,
    model_id: modelId,
    name,
    description: normalizeText(row.description),
    name_en: normalizeText(row.name_en || row.nameEn),
    description_en: normalizeText(row.description_en || row.descriptionEn),
    supports_multimodal: normalizeBoolean(row.supports_multimodal ?? row.supportsMultimodal, false),
    enabled: normalizeBoolean(row.enabled, true),
    priority: normalizeNumber(row.priority, 0),
    provider: normalizeText(row.provider) || "free",
    base_url: normalizeBaseUrl(row.base_url || row.baseUrl),
    api_key: normalizeText(row.api_key || row.apiKey),
    stream: normalizeBoolean(row.stream, true),
    created_at: row.created_at || row.createdAt || null,
    updated_at: row.updated_at || row.updatedAt || null
  }
}

function sanitizePublicRow(row, proxyBaseUrl) {
  const result = {
    id: row.model_id,
    name: row.name,
    description: row.description,
    supportsMultimodal: !!row.supports_multimodal,
    enabled: !!row.enabled,
    priority: normalizeNumber(row.priority, 0),
    provider: "free",
    baseUrl: normalizeBaseUrl(proxyBaseUrl || DEFAULT_PROXY_BASE_URL),
    stream: true
  }
  if (row.name_en) result.nameEn = row.name_en
  if (row.description_en) result.descriptionEn = row.description_en
  return result
}

function sanitizeAdminRow(row) {
  return {
    id: row.model_id,
    name: row.name,
    description: row.description,
    nameEn: row.name_en || undefined,
    descriptionEn: row.description_en || undefined,
    supportsMultimodal: !!row.supports_multimodal,
    enabled: !!row.enabled,
    priority: normalizeNumber(row.priority, 0),
    provider: row.provider || "free",
    baseUrl: normalizeBaseUrl(row.base_url),
    hasApiKey: Boolean(normalizeText(row.api_key)),
    stream: row.stream !== false,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function sortModels(rows = []) {
  return [...rows].sort((a, b) => {
    const priorityDelta = normalizeNumber(b.priority, 0) - normalizeNumber(a.priority, 0)
    if (priorityDelta) return priorityDelta
    return normalizeText(a.name).localeCompare(normalizeText(b.name), "zh-Hans-CN")
  })
}

function createMemoryFreeModelStore(seed = {}) {
  const data = {
    models: (seed.models || []).map(normalizeRow).filter(Boolean)
  }

  return {
    async listModels() {
      return sortModels(data.models)
    },
    async findModel(modelId) {
      const id = normalizeModelId(modelId)
      if (!id) return null
      return data.models.find((row) => row.model_id === id) || null
    },
    async upsertModel(model) {
      const normalized = normalizeRow(model)
      if (!normalized) return null
      const existing = data.models.find((row) => row.model_id === normalized.model_id)
      if (existing) {
        Object.assign(existing, normalized, {
          api_key: normalized.api_key || existing.api_key
        })
        return existing
      }
      data.models.push(normalized)
      return normalized
    },
    async setModelEnabled(modelId, enabled) {
      const row = data.models.find((item) => item.model_id === normalizeModelId(modelId))
      if (!row) return null
      row.enabled = !!enabled
      return row
    },
    async deleteModel(modelId) {
      const id = normalizeModelId(modelId)
      const index = data.models.findIndex((row) => row.model_id === id)
      if (index < 0) return false
      data.models.splice(index, 1)
      return true
    }
  }
}

function createSupabaseFreeModelStore() {
  return {
    async listModels() {
      const rows = await sb("wow_free_models", {
        query: { select: "*", product_id: "eq." + PRODUCT_ID, order: "priority.desc,id.asc" }
      })
      return Array.isArray(rows) ? rows.map(normalizeRow).filter(Boolean) : []
    },
    async findModel(modelId) {
      const rows = await sb("wow_free_models", {
        query: { select: "*", product_id: "eq." + PRODUCT_ID, model_id: "eq." + normalizeModelId(modelId), limit: "1" }
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : null
    },
    async upsertModel(model) {
      const normalized = normalizeRow(model)
      if (!normalized) return null
      const existing = await this.findModel(normalized.model_id)
      if (existing && !normalized.api_key) {
        normalized.api_key = existing.api_key
      }
      const rows = await sb("wow_free_models", {
        method: "POST",
        query: { on_conflict: "model_id" },
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: normalized
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : normalized
    },
    async setModelEnabled(modelId, enabled) {
      const rows = await sb("wow_free_models", {
        method: "PATCH",
        query: {
          product_id: "eq." + PRODUCT_ID,
          model_id: "eq." + normalizeModelId(modelId)
        },
        body: { enabled: !!enabled, updated_at: Date.now() }
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : null
    },
    async deleteModel(modelId) {
      await sb("wow_free_models", {
        method: "DELETE",
        query: {
          product_id: "eq." + PRODUCT_ID,
          model_id: "eq." + normalizeModelId(modelId)
        }
      })
      return true
    }
  }
}

function createFreeModelService(options = {}) {
  const store = options.store || createSupabaseFreeModelStore()
  const getNow = options.now || (() => Date.now())

  function resolveProxyBaseUrl(body = {}) {
    return normalizeBaseUrl(body.proxyBaseUrl || body.proxy_base_url || DEFAULT_PROXY_BASE_URL)
  }

  async function listCatalog(body = {}) {
    const models = await store.listModels()
    const proxyBaseUrl = resolveProxyBaseUrl(body)
    const adminView = normalizeBoolean(body.adminView || body.admin_view || body.includeDisabled, false)
    const visible = models.filter((row) => adminView ? true : row.enabled)

    return {
      status: 200,
      data: {
        ok: true,
        productId: PRODUCT_ID,
        proxyBaseUrl,
        models: visible.map((row) => (
          adminView ? sanitizeAdminRow(row) : sanitizePublicRow(row, proxyBaseUrl)
        ))
      }
    }
  }

  async function upsertModel(body = {}) {
    const existing = await store.findModel(body.modelId || body.model_id || body.id)
    const now = getNow()
    const model = await store.upsertModel({
      product_id: PRODUCT_ID,
      model_id: body.modelId || body.model_id || body.id,
      name: body.name,
      description: body.description,
      name_en: body.nameEn || body.name_en,
      description_en: body.descriptionEn || body.description_en,
      supports_multimodal: body.supportsMultimodal ?? body.supports_multimodal,
      enabled: body.enabled,
      priority: body.priority,
      provider: body.provider,
      base_url: body.baseUrl || body.base_url,
      api_key: body.apiKey || body.api_key || (existing && existing.api_key) || "",
      stream: body.stream,
      created_at: existing?.created_at || now,
      updated_at: now
    })

    if (!model) {
      return { status: 400, data: { ok: false, message: "模型ID和名称不能为空" } }
    }

    return {
      status: 200,
      data: {
        ok: true,
        model: sanitizeAdminRow(model)
      }
    }
  }

  async function setModelEnabled(body = {}) {
    const modelId = body.modelId || body.model_id || body.id
    if (!normalizeModelId(modelId)) {
      return { status: 400, data: { ok: false, message: "请输入模型ID" } }
    }
    const row = await store.setModelEnabled(modelId, body.enabled)
    if (!row) {
      return { status: 404, data: { ok: false, message: "未找到该模型" } }
    }
    return {
      status: 200,
      data: { ok: true, model: sanitizeAdminRow(row) }
    }
  }

  async function deleteModel(body = {}) {
    const modelId = body.modelId || body.model_id || body.id
    if (!normalizeModelId(modelId)) {
      return { status: 400, data: { ok: false, message: "请输入模型ID" } }
    }
    await store.deleteModel(modelId)
    return { status: 200, data: { ok: true } }
  }

  async function resolveModel(modelId) {
    const row = await store.findModel(modelId)
    if (!row || !row.enabled) {
      return null
    }
    return row
  }

  async function getProxyTarget(body = {}) {
    const modelId = normalizeModelId(body.modelId || body.model_id || body.model)
    const row = await resolveModel(modelId)
    if (!row) {
      return null
    }
    return {
      model: row,
      url: normalizeBaseUrl(row.base_url),
      apiKey: normalizeText(row.api_key)
    }
  }

  return {
    deleteModel,
    getProxyTarget,
    listCatalog,
    resolveProxyBaseUrl,
    setModelEnabled,
    upsertModel
  }
}

module.exports = {
  PRODUCT_ID,
  DEFAULT_PROXY_BASE_URL,
  createFreeModelService,
  createMemoryFreeModelStore,
  createSupabaseFreeModelStore,
  normalizeBaseUrl,
  normalizeModelId,
  normalizeRow,
  sanitizeAdminRow,
  sanitizePublicRow
}
