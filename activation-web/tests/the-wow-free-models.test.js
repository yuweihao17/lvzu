const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

function loadFreeModelsModule() {
  try {
    return require("../api/_lib/free-models")
  } catch (error) {
    return {}
  }
}

test("free model catalog exposes public metadata without leaking provider API keys", async () => {
  const {
    createFreeModelService,
    createMemoryFreeModelStore
  } = loadFreeModelsModule()

  assert.equal(typeof createFreeModelService, "function")
  assert.equal(typeof createMemoryFreeModelStore, "function")

  const store = createMemoryFreeModelStore({
    models: [
      {
        model_id: "agnes-2.0-flash",
        name: "Agnes-2.0-Flash",
        description: "platform model",
        supports_multimodal: true,
        enabled: true,
        priority: 50,
        provider: "agnes",
        base_url: "https://provider.example/v1",
        api_key: "secret-key",
        created_at: 1,
        updated_at: 1
      }
    ]
  })
  const service = createFreeModelService({ store })

  const result = await service.listCatalog({ proxyBaseUrl: "https://act.example/api/free-model-proxy" })

  assert.equal(result.status, 200)
  assert.equal(result.data.ok, true)
  assert.equal(result.data.models.length, 1)
  assert.deepEqual(result.data.models[0], {
    id: "agnes-2.0-flash",
    name: "Agnes-2.0-Flash",
    description: "platform model",
    supportsMultimodal: true,
    enabled: true,
    priority: 50,
    provider: "free",
    baseUrl: "https://act.example/api/free-model-proxy",
    stream: true
  })
  assert.doesNotMatch(JSON.stringify(result.data), /secret-key/)
  assert.doesNotMatch(JSON.stringify(result.data), /provider\.example/)
})

test("free model admin can upsert and disable catalog entries", async () => {
  const {
    createFreeModelService,
    createMemoryFreeModelStore
  } = loadFreeModelsModule()

  const store = createMemoryFreeModelStore()
  const service = createFreeModelService({
    store,
    now: () => 1000
  })

  const saved = await service.upsertModel({
    id: "text-demo",
    name: "Text Demo",
    description: "voice only",
    supportsMultimodal: false,
    provider: "openai-compatible",
    baseUrl: "https://provider.example/v1/",
    apiKey: "sk-test",
    enabled: true,
    priority: 3
  })

  assert.equal(saved.status, 200)
  assert.equal(saved.data.ok, true)
  assert.equal(saved.data.model.id, "text-demo")
  assert.equal(saved.data.model.hasApiKey, true)
  assert.equal(saved.data.model.baseUrl, "https://provider.example/v1")
  assert.doesNotMatch(JSON.stringify(saved.data), /sk-test/)

  const disabled = await service.setModelEnabled({ id: "text-demo", enabled: false })
  assert.equal(disabled.status, 200)
  assert.equal(disabled.data.model.enabled, false)

  const catalog = await service.listCatalog({ proxyBaseUrl: "https://act.example/api/free-model-proxy" })
  assert.equal(catalog.status, 200)
  assert.deepEqual(catalog.data.models, [])
})

test("free model database schema and admin page include catalog management", () => {
  const root = path.join(__dirname, "..")
  const schema = fs.readFileSync(path.join(root, "schema-the-wow-vercel-single.sql"), "utf8")
  const page = fs.readFileSync(path.join(root, "the-wow.html"), "utf8")
  const proxySource = fs.readFileSync(path.join(root, "api", "free-model-proxy", "chat", "completions.js"), "utf8")

  assert.match(schema, /create table if not exists public\.wow_free_models/)
  assert.match(schema, /api_key text not null default ''/)
  assert.match(schema, /create unique index if not exists idx_wow_free_models_model_id/)
  assert.match(page, /免费大模型/)
  assert.match(page, /freeModelForm/)
  assert.match(page, /list-free-models/)
  assert.match(page, /upsert-free-model/)
  assert.match(proxySource, /Readable\.fromWeb/)
  assert.match(proxySource, /stream:\s*true/)
})
