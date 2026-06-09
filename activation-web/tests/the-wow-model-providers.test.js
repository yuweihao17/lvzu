const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

function loadModelProvidersModule() {
  try {
    return require("../api/_lib/model-providers")
  } catch (error) {
    return {}
  }
}

test("model provider catalog exposes public provider metadata without user API keys", async () => {
  const {
    createModelProviderService,
    createMemoryModelProviderStore
  } = loadModelProvidersModule()

  assert.equal(typeof createModelProviderService, "function")
  assert.equal(typeof createMemoryModelProviderStore, "function")

  const store = createMemoryModelProviderStore({
    providers: [
      {
        provider_id: "deepseek",
        name: "DeepSeek AI",
        description: "官方 OpenAI 兼容接口",
        base_url: "https://api.deepseek.com/",
        api_key_header: "authorization-bearer",
        supports_multimodal: false,
        enabled: true,
        priority: 20,
        stream: true,
        created_at: 1,
        updated_at: 1
      }
    ]
  })
  const service = createModelProviderService({ store })

  const result = await service.listCatalog()

  assert.equal(result.status, 200)
  assert.equal(result.data.ok, true)
  assert.deepEqual(result.data.providers[0], {
    id: "deepseek",
    name: "DeepSeek AI",
    description: "官方 OpenAI 兼容接口",
    baseUrl: "https://api.deepseek.com",
    apiKeyHeader: "authorization-bearer",
    supportsMultimodal: false,
    enabled: true,
    priority: 20,
    stream: true
  })
  assert.equal(Object.prototype.hasOwnProperty.call(result.data.providers[0], "apiKey"), false)
  assert.doesNotMatch(JSON.stringify(result.data), /sk-live|sk-test|secret-provider-key/i)
})

test("model provider admin can upsert disable and delete catalog entries", async () => {
  const {
    createModelProviderService,
    createMemoryModelProviderStore
  } = loadModelProvidersModule()

  const store = createMemoryModelProviderStore()
  const service = createModelProviderService({
    store,
    now: () => 1000
  })

  const saved = await service.upsertProvider({
    id: "xiaomimimo",
    name: "XiaoMiMiMo AI",
    description: "小米大模型开放平台",
    baseUrl: "https://api.xiaomimimo.com/v1/",
    apiKeyHeader: "api-key",
    supportsMultimodal: true,
    enabled: true,
    priority: 9,
    stream: true
  })

  assert.equal(saved.status, 200)
  assert.equal(saved.data.provider.id, "xiaomimimo")
  assert.equal(saved.data.provider.baseUrl, "https://api.xiaomimimo.com/v1")
  assert.equal(saved.data.provider.apiKeyHeader, "api-key")

  const disabled = await service.setProviderEnabled({ id: "xiaomimimo", enabled: false })
  assert.equal(disabled.status, 200)
  assert.equal(disabled.data.provider.enabled, false)

  const publicCatalog = await service.listCatalog()
  assert.deepEqual(publicCatalog.data.providers, [])

  const deleted = await service.deleteProvider({ id: "xiaomimimo" })
  assert.equal(deleted.status, 200)
})

test("model provider database schema and admin page include provider catalog management", () => {
  const root = path.join(__dirname, "..")
  const schema = fs.readFileSync(path.join(root, "schema-the-wow-vercel-single.sql"), "utf8")
  const page = fs.readFileSync(path.join(root, "the-wow.html"), "utf8")
  const apiSource = fs.readFileSync(path.join(root, "api", "the-wow.js"), "utf8")

  assert.match(schema, /create table if not exists public\.wow_model_providers/)
  assert.match(schema, /api_key_header text not null default 'authorization-bearer'/)
  assert.match(schema, /create unique index if not exists idx_wow_model_providers_provider_id/)
  assert.match(page, /APP 大模型提供商管理/)
  assert.match(page, /modelProviderForm/)
  assert.match(page, /list-model-providers/)
  assert.match(page, /upsert-model-provider/)
  assert.match(apiSource, /createModelProviderService/)
})
