const assert = require("node:assert/strict")
const test = require("node:test")

function loadWowLicenseModule() {
  try {
    return require("../api/_lib/the-wow-license")
  } catch (error) {
    return {}
  }
}

test("the_wow card redemption creates one activation identity and later cards add entitlements", async () => {
  const {
    createMemoryWowStore,
    createWowLicenseService,
    normalizeWowSku
  } = loadWowLicenseModule()

  assert.equal(typeof normalizeWowSku, "function")
  assert.equal(typeof createMemoryWowStore, "function")
  assert.equal(typeof createWowLicenseService, "function")

  assert.deepEqual(normalizeWowSku("max_perm"), {
    sku: "max_perm",
    tier: "max",
    calls: 0,
    permanent: true
  })

  const store = createMemoryWowStore({
    cards: [
      { card_code: "WOW-STANDARD-3", sku: "standard_3", status: "new" },
      { card_code: "WOW-MAX-PERM", sku: "max_perm", status: "new" }
    ]
  })
  const service = createWowLicenseService({
    store,
    now: () => 1000,
    randomActivationCode: () => "WOW-ACT-123456"
  })

  const first = await service.redeem({ cardCode: " wow-standard-3 " })
  assert.equal(first.status, 200)
  assert.equal(first.data.ok, true)
  assert.equal(first.data.activationCode, "WOW-ACT-123456")
  assert.equal(first.data.effectiveTier, "standard")
  assert.equal(first.data.remainingCalls, 3)
  assert.equal(first.data.isPermanent, false)

  const second = await service.redeem({
    cardCode: "WOW-MAX-PERM",
    activationCode: first.data.activationCode
  })
  assert.equal(second.status, 200)
  assert.equal(second.data.activationCode, first.data.activationCode)
  assert.equal(second.data.effectiveTier, "max")
  assert.equal(second.data.isPermanent, true)

  const status = await service.status({ activationCode: first.data.activationCode })
  assert.equal(status.status, 200)
  assert.equal(status.data.entitlements.length, 2)
  assert.deepEqual(status.data.remainingByTier, {
    standard: 3,
    ultra: 0,
    max: 0
  })
})

test("the_wow consumption uses the lowest sufficient tier and enforces tier gates", async () => {
  const {
    createMemoryWowStore,
    createWowLicenseService
  } = loadWowLicenseModule()

  assert.equal(typeof createMemoryWowStore, "function")
  assert.equal(typeof createWowLicenseService, "function")

  const store = createMemoryWowStore({
    cards: [
      { card_code: "WOW-STANDARD-2", sku: "standard_2", status: "new" },
      { card_code: "WOW-ULTRA-2", sku: "ultra_2", status: "new" },
      { card_code: "WOW-MAX-1", sku: "max_1", status: "new" }
    ]
  })
  const service = createWowLicenseService({
    store,
    now: () => 2000,
    randomActivationCode: () => "WOW-ACT-CONSUME"
  })

  const first = await service.redeem({ cardCode: "WOW-STANDARD-2" })
  await service.redeem({ cardCode: "WOW-ULTRA-2", activationCode: first.data.activationCode })
  await service.redeem({ cardCode: "WOW-MAX-1", activationCode: first.data.activationCode })

  const standardUse = await service.consume({
    activationCode: first.data.activationCode,
    requiredTier: "standard"
  })
  assert.equal(standardUse.status, 200)
  assert.equal(standardUse.data.chargedTier, "standard")
  assert.equal(standardUse.data.remainingByTier.standard, 1)

  const ultraUse = await service.consume({
    activationCode: first.data.activationCode,
    requiredTier: "ultra"
  })
  assert.equal(ultraUse.status, 200)
  assert.equal(ultraUse.data.chargedTier, "ultra")
  assert.equal(ultraUse.data.remainingByTier.ultra, 1)

  const maxUse = await service.consume({
    activationCode: first.data.activationCode,
    requiredTier: "max"
  })
  assert.equal(maxUse.status, 200)
  assert.equal(maxUse.data.chargedTier, "max")
  assert.equal(maxUse.data.remainingByTier.max, 0)

  const secondStore = createMemoryWowStore({
    cards: [{ card_code: "WOW-STANDARD-1", sku: "standard_1", status: "new" }]
  })
  const secondService = createWowLicenseService({
    store: secondStore,
    now: () => 3000,
    randomActivationCode: () => "WOW-ACT-STANDARD"
  })
  const standardOnly = await secondService.redeem({ cardCode: "WOW-STANDARD-1" })
  const blocked = await secondService.consume({
    activationCode: standardOnly.data.activationCode,
    requiredTier: "ultra"
  })

  assert.equal(blocked.status, 402)
  assert.match(blocked.data.message, /Ultra|ultra|权限|版本/)
})

test("the_wow summary does not promote lower permanent licenses to expired higher tiers", async () => {
  const {
    createMemoryWowStore,
    createWowLicenseService
  } = loadWowLicenseModule()

  const store = createMemoryWowStore({
    licenses: [{
      activation_code: "WOW-ACT-MIXED",
      status: "active",
      created_at: 1,
      updated_at: 1
    }],
    entitlements: [
      {
        activation_code: "WOW-ACT-MIXED",
        tier: "standard",
        remaining_calls: 0,
        total_calls: 0,
        is_permanent: true,
        source_card_code: "WOW-STANDARD-PERM",
        created_at: 1,
        updated_at: 1
      },
      {
        activation_code: "WOW-ACT-MIXED",
        tier: "max",
        remaining_calls: 0,
        total_calls: 2,
        is_permanent: false,
        source_card_code: "WOW-MAX-2",
        created_at: 2,
        updated_at: 3
      }
    ]
  })
  const service = createWowLicenseService({ store })

  const status = await service.status({ activationCode: "WOW-ACT-MIXED" })
  assert.equal(status.status, 200)
  assert.equal(status.data.effectiveTier, "standard")
  assert.equal(status.data.isPermanent, true)
  assert.equal(status.data.permanentTier, "standard")

  const maxUse = await service.consume({ activationCode: "WOW-ACT-MIXED", requiredTier: "max" })
  assert.equal(maxUse.status, 402)
})
