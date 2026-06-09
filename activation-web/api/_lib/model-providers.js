const { sb } = require("./activation")

const PRODUCT_ID = "the_wow"
const DEFAULT_AUTH_HEADER = "authorization-bearer"
const AUTH_HEADERS = new Set(["authorization-bearer", "api-key"])

function normalizeText(value) {
  return String(value || "").trim()
}

function normalizeProviderId(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
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

function normalizeAuthHeader(value) {
  const normalized = normalizeText(value).toLowerCase()
  return AUTH_HEADERS.has(normalized) ? normalized : DEFAULT_AUTH_HEADER
}

function normalizeRow(row = {}) {
  const providerId = normalizeProviderId(row.provider_id || row.providerId || row.id)
  const name = normalizeText(row.name)
  if (!providerId || !name) return null

  return {
    product_id: normalizeText(row.product_id || PRODUCT_ID) || PRODUCT_ID,
    provider_id: providerId,
    name,
    description: normalizeText(row.description),
    base_url: normalizeBaseUrl(row.base_url || row.baseUrl),
    api_key_header: normalizeAuthHeader(row.api_key_header || row.apiKeyHeader),
    supports_multimodal: normalizeBoolean(row.supports_multimodal ?? row.supportsMultimodal, true),
    enabled: normalizeBoolean(row.enabled, true),
    priority: normalizeNumber(row.priority, 0),
    stream: normalizeBoolean(row.stream, true),
    created_at: row.created_at || row.createdAt || null,
    updated_at: row.updated_at || row.updatedAt || null
  }
}

function sanitizePublicRow(row) {
  return {
    id: row.provider_id,
    name: row.name,
    description: row.description,
    baseUrl: normalizeBaseUrl(row.base_url),
    apiKeyHeader: normalizeAuthHeader(row.api_key_header),
    supportsMultimodal: !!row.supports_multimodal,
    enabled: !!row.enabled,
    priority: normalizeNumber(row.priority, 0),
    stream: row.stream !== false
  }
}

function sanitizeAdminRow(row) {
  return {
    ...sanitizePublicRow(row),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function sortProviders(rows = []) {
  return [...rows].sort((a, b) => {
    const priorityDelta = normalizeNumber(b.priority, 0) - normalizeNumber(a.priority, 0)
    if (priorityDelta) return priorityDelta
    return normalizeText(a.name).localeCompare(normalizeText(b.name), "zh-Hans-CN")
  })
}

function createMemoryModelProviderStore(seed = {}) {
  const data = {
    providers: (seed.providers || []).map(normalizeRow).filter(Boolean)
  }

  return {
    async listProviders() {
      return sortProviders(data.providers)
    },
    async findProvider(providerId) {
      const id = normalizeProviderId(providerId)
      if (!id) return null
      return data.providers.find((row) => row.provider_id === id) || null
    },
    async upsertProvider(provider) {
      const normalized = normalizeRow(provider)
      if (!normalized) return null
      const existing = data.providers.find((row) => row.provider_id === normalized.provider_id)
      if (existing) {
        Object.assign(existing, normalized)
        return existing
      }
      data.providers.push(normalized)
      return normalized
    },
    async setProviderEnabled(providerId, enabled) {
      const row = data.providers.find((item) => item.provider_id === normalizeProviderId(providerId))
      if (!row) return null
      row.enabled = !!enabled
      return row
    },
    async deleteProvider(providerId) {
      const id = normalizeProviderId(providerId)
      const index = data.providers.findIndex((row) => row.provider_id === id)
      if (index < 0) return false
      data.providers.splice(index, 1)
      return true
    }
  }
}

function createSupabaseModelProviderStore() {
  return {
    async listProviders() {
      const rows = await sb("wow_model_providers", {
        query: { select: "*", product_id: "eq." + PRODUCT_ID, order: "priority.desc,id.asc" }
      })
      return Array.isArray(rows) ? rows.map(normalizeRow).filter(Boolean) : []
    },
    async findProvider(providerId) {
      const rows = await sb("wow_model_providers", {
        query: { select: "*", product_id: "eq." + PRODUCT_ID, provider_id: "eq." + normalizeProviderId(providerId), limit: "1" }
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : null
    },
    async upsertProvider(provider) {
      const normalized = normalizeRow(provider)
      if (!normalized) return null
      const rows = await sb("wow_model_providers", {
        method: "POST",
        query: { on_conflict: "provider_id" },
        headers: { prefer: "resolution=merge-duplicates,return=representation" },
        body: normalized
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : normalized
    },
    async setProviderEnabled(providerId, enabled) {
      const rows = await sb("wow_model_providers", {
        method: "PATCH",
        query: {
          product_id: "eq." + PRODUCT_ID,
          provider_id: "eq." + normalizeProviderId(providerId)
        },
        body: { enabled: !!enabled, updated_at: Date.now() }
      })
      return Array.isArray(rows) && rows.length ? normalizeRow(rows[0]) : null
    },
    async deleteProvider(providerId) {
      await sb("wow_model_providers", {
        method: "DELETE",
        query: {
          product_id: "eq." + PRODUCT_ID,
          provider_id: "eq." + normalizeProviderId(providerId)
        }
      })
      return true
    }
  }
}

function createModelProviderService(options = {}) {
  const store = options.store || createSupabaseModelProviderStore()
  const getNow = options.now || (() => Date.now())

  async function listCatalog(body = {}) {
    const adminView = normalizeBoolean(body.adminView || body.admin_view || body.includeDisabled, false)
    const providers = await store.listProviders()
    const visible = providers.filter((row) => adminView ? true : row.enabled)

    return {
      status: 200,
      data: {
        ok: true,
        productId: PRODUCT_ID,
        providers: visible.map((row) => (
          adminView ? sanitizeAdminRow(row) : sanitizePublicRow(row)
        ))
      }
    }
  }

  async function upsertProvider(body = {}) {
    const existing = await store.findProvider(body.providerId || body.provider_id || body.id)
    const now = getNow()
    const provider = await store.upsertProvider({
      product_id: PRODUCT_ID,
      provider_id: body.providerId || body.provider_id || body.id,
      name: body.name,
      description: body.description,
      base_url: body.baseUrl || body.base_url,
      api_key_header: body.apiKeyHeader || body.api_key_header,
      supports_multimodal: body.supportsMultimodal ?? body.supports_multimodal,
      enabled: body.enabled,
      priority: body.priority,
      stream: body.stream,
      created_at: existing?.created_at || now,
      updated_at: now
    })

    if (!provider) {
      return { status: 400, data: { ok: false, message: "提供商ID和名称不能为空" } }
    }

    return {
      status: 200,
      data: {
        ok: true,
        provider: sanitizeAdminRow(provider)
      }
    }
  }

  async function setProviderEnabled(body = {}) {
    const providerId = body.providerId || body.provider_id || body.id
    if (!normalizeProviderId(providerId)) {
      return { status: 400, data: { ok: false, message: "请输入提供商ID" } }
    }
    const row = await store.setProviderEnabled(providerId, body.enabled)
    if (!row) {
      return { status: 404, data: { ok: false, message: "未找到该提供商" } }
    }
    return {
      status: 200,
      data: { ok: true, provider: sanitizeAdminRow(row) }
    }
  }

  async function deleteProvider(body = {}) {
    const providerId = body.providerId || body.provider_id || body.id
    if (!normalizeProviderId(providerId)) {
      return { status: 400, data: { ok: false, message: "请输入提供商ID" } }
    }
    await store.deleteProvider(providerId)
    return { status: 200, data: { ok: true } }
  }

  return {
    deleteProvider,
    listCatalog,
    setProviderEnabled,
    upsertProvider
  }
}

module.exports = {
  PRODUCT_ID,
  DEFAULT_AUTH_HEADER,
  createMemoryModelProviderStore,
  createModelProviderService,
  createSupabaseModelProviderStore,
  normalizeAuthHeader,
  normalizeBaseUrl,
  normalizeProviderId,
  normalizeRow,
  sanitizeAdminRow,
  sanitizePublicRow
}
