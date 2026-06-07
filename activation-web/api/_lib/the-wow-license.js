const crypto = require("crypto")
const { sb } = require("./activation")

const PRODUCT_ID = "the_wow"
const TIERS = ["standard", "ultra", "max"]
const TIER_LEVELS = {
  standard: 1,
  ultra: 2,
  max: 3
}

function normalizeTier(value) {
  const tier = String(value || "standard").trim().toLowerCase()
  return TIERS.includes(tier) ? tier : "standard"
}

function tierAllows(currentTier, requiredTier) {
  return TIER_LEVELS[normalizeTier(currentTier)] >= TIER_LEVELS[normalizeTier(requiredTier)]
}

function normalizeWowCard(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizeActivationCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizeWowSku(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_")
  const match = raw.match(/^(standard|ultra|max)_(perm|permanent|forever|[1-9]|10)$/)
  if (!match) {
    throw new Error("SKU 格式不正确，请使用 standard_1 到 max_10 或 max_perm")
  }

  const tier = normalizeTier(match[1])
  const permanent = ["perm", "permanent", "forever"].includes(match[2])
  const calls = permanent ? 0 : Number(match[2])
  return {
    sku: `${tier}_${permanent ? "perm" : calls}`,
    tier,
    calls,
    permanent
  }
}

function nowMs() {
  return Date.now()
}

function randomActivationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(12)
  let text = "WOW"
  for (let i = 0; i < bytes.length; i++) {
    if (i % 4 === 0) text += "-"
    text += alphabet[bytes[i] % alphabet.length]
  }
  return text
}

function randomCardCode(prefix = "WOW") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = crypto.randomBytes(12)
  let text = normalizeWowCard(prefix || "WOW")
  for (let i = 0; i < bytes.length; i++) {
    if (i % 4 === 0) text += "-"
    text += alphabet[bytes[i] % alphabet.length]
  }
  return text
}

function sortEntitlementsForUse(entitlements, requiredTier) {
  const requiredLevel = TIER_LEVELS[normalizeTier(requiredTier)]
  return (entitlements || [])
    .filter((item) => TIER_LEVELS[normalizeTier(item.tier)] >= requiredLevel)
    .sort((a, b) => {
      const tierDelta = TIER_LEVELS[normalizeTier(a.tier)] - TIER_LEVELS[normalizeTier(b.tier)]
      if (tierDelta) return tierDelta
      const timeDelta = Number(a.created_at || 0) - Number(b.created_at || 0)
      if (timeDelta) return timeDelta
      return Number(a.id || 0) - Number(b.id || 0)
    })
}

function mapCard(row) {
  return {
    id: String(row.id || ""),
    cardCode: row.card_code || "",
    sku: row.sku || "",
    tier: normalizeTier(row.tier),
    callCount: Math.max(0, Number(row.call_count || 0)),
    isPermanent: !!row.is_permanent,
    status: row.status || "",
    activationCode: row.activation_code || "",
    redeemedAt: row.redeemed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function mapRedemption(row) {
  return {
    id: String(row.id || ""),
    cardCode: row.card_code || "",
    activationCode: row.activation_code || "",
    sku: row.sku || "",
    tier: normalizeTier(row.tier),
    calls: Math.max(0, Number(row.calls || 0)),
    isPermanent: !!row.is_permanent,
    createdAt: row.created_at || null
  }
}

function mapConsumption(row) {
  return {
    id: String(row.id || ""),
    activationCode: row.activation_code || "",
    requiredTier: normalizeTier(row.required_tier),
    chargedTier: normalizeTier(row.charged_tier),
    amount: Math.max(0, Number(row.amount || 0)),
    createdAt: row.created_at || null
  }
}

function summarizeLicense(license, entitlements, extra = {}) {
  const rows = Array.isArray(entitlements) ? entitlements : []
  const remainingByTier = {
    standard: 0,
    ultra: 0,
    max: 0
  }
  let highestActiveLevel = 0
  let highestEverLevel = 0
  let highestActiveTier = ""
  let highestEverTier = "standard"
  let isPermanent = false
  let permanentTier = ""

  for (const row of rows) {
    const tier = normalizeTier(row.tier)
    const level = TIER_LEVELS[tier]
    const permanent = !!row.is_permanent
    const remaining = Math.max(0, Number(row.remaining_calls || 0))
    if (!permanent) remainingByTier[tier] += remaining
    if (level > highestEverLevel) {
      highestEverLevel = level
      highestEverTier = tier
    }
    if (permanent || remaining > 0) {
      if (level > highestActiveLevel) {
        highestActiveLevel = level
        highestActiveTier = tier
      }
    }
    if (permanent && (!permanentTier || level >= TIER_LEVELS[permanentTier])) {
      isPermanent = true
      permanentTier = tier
    }
  }
  const effectiveTier = highestActiveTier || highestEverTier

  return {
    ok: true,
    productId: PRODUCT_ID,
    activationCode: license.activation_code,
    licenseId: String(license.id || ""),
    effectiveTier,
    tier: effectiveTier,
    planType: effectiveTier,
    isPermanent,
    unlimited: isPermanent,
    permanentTier,
    remainingCalls: remainingByTier.standard + remainingByTier.ultra + remainingByTier.max,
    remainingByTier,
    entitlements: rows.map((row) => ({
      id: String(row.id || ""),
      tier: normalizeTier(row.tier),
      remainingCalls: Math.max(0, Number(row.remaining_calls || 0)),
      totalCalls: Math.max(0, Number(row.total_calls || 0)),
      isPermanent: !!row.is_permanent,
      sourceCardCode: row.source_card_code || "",
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    })),
    createdAt: license.created_at || null,
    updatedAt: license.updated_at || null,
    ...extra
  }
}

async function withUniqueActivationCode(store, makeActivationCode) {
  for (let i = 0; i < 20; i++) {
    const activationCode = normalizeActivationCode(makeActivationCode())
    if (!activationCode) continue
    const existing = await store.findLicense(activationCode)
    if (!existing) return activationCode
  }
  throw new Error("激活码生成失败，请重试")
}

function createWowLicenseService(options = {}) {
  const store = options.store || createSupabaseWowStore()
  const getNow = options.now || nowMs
  const makeActivationCode = options.randomActivationCode || randomActivationCode

  async function resolveLicenseByUserCode(body = {}) {
    const directActivationCode = normalizeActivationCode(body.activationCode || body.activation_code)
    const cardCode = normalizeWowCard(body.cardCode || body.card_code || body.licenseCode || body.license_code)
    const userCode = directActivationCode || cardCode
    if (!userCode) return { error: { status: 400, data: { ok: false, message: "请输入卡密" } } }

    const directLicense = await store.findLicense(userCode)
    if (directLicense) {
      return { activationCode: userCode, license: directLicense, card: cardCode ? await store.findCard(cardCode) : null }
    }

    const card = await store.findCard(userCode)
    if (card) {
      const boundActivationCode = normalizeActivationCode(card.activation_code)
      if (boundActivationCode) {
        const boundLicense = await store.findLicense(boundActivationCode)
        if (boundLicense) return { activationCode: boundActivationCode, license: boundLicense, card }
      }
      return { error: { status: 404, data: { ok: false, message: "这张卡密还未激活，请先在客户端输入卡密激活" } } }
    }

    return { error: { status: 404, data: { ok: false, message: "卡密不存在或尚未激活，请检查后重试" } } }
  }

  async function status(body = {}) {
    const resolved = await resolveLicenseByUserCode(body)
    if (resolved.error) return resolved.error
    const { activationCode, license } = resolved
    const entitlements = await store.listEntitlements(activationCode)
    return { status: 200, data: summarizeLicense(license, entitlements) }
  }

  async function redeem(body = {}) {
    const cardCode = normalizeWowCard(body.cardCode || body.card_code)
    const requestedActivationCode = normalizeActivationCode(body.activationCode || body.activation_code)
    if (!cardCode) return { status: 400, data: { ok: false, message: "请输入卡密" } }

    const card = await store.findCard(cardCode)
    if (!card) return { status: 404, data: { ok: false, message: "卡密不存在，请确认购买后收到的卡密" } }

    if (card.activation_code) {
      if (requestedActivationCode && requestedActivationCode !== card.activation_code) {
        return { status: 403, data: { ok: false, message: "这张卡密已绑定到其他激活码" } }
      }
      const existing = await status({ activationCode: card.activation_code })
      return {
        status: existing.status,
        data: {
          ...existing.data,
          redeemed: true,
          idempotent: true,
          message: "这张卡密已经兑换过，已返回对应激活码"
        }
      }
    }

    const sku = normalizeWowSku(card.sku || body.sku)
    const time = getNow()
    let license = null
    let activationCode = requestedActivationCode || cardCode

    if (requestedActivationCode) {
      license = await store.findLicense(activationCode)
      if (!license) return { status: 404, data: { ok: false, message: "激活码不存在，请检查后重试" } }
    } else {
      license = await store.findLicense(activationCode)
    }

    if (!license) {
      license = await store.createLicense({
        product_id: PRODUCT_ID,
        activation_code: activationCode,
        status: "active",
        created_at: time,
        updated_at: time,
        last_seen_at: time
      })
    }

    await store.insertEntitlement({
      product_id: PRODUCT_ID,
      activation_code: activationCode,
      tier: sku.tier,
      remaining_calls: sku.permanent ? 0 : sku.calls,
      total_calls: sku.permanent ? 0 : sku.calls,
      is_permanent: sku.permanent,
      source_card_code: cardCode,
      created_at: time,
      updated_at: time
    })
    await store.updateCard(cardCode, {
      status: "redeemed",
      activation_code: activationCode,
      redeemed_at: time,
      updated_at: time
    })
    await store.insertRedemption({
      product_id: PRODUCT_ID,
      card_code: cardCode,
      activation_code: activationCode,
      sku: sku.sku,
      tier: sku.tier,
      calls: sku.calls,
      is_permanent: sku.permanent,
      created_at: time
    })

    const entitlements = await store.listEntitlements(activationCode)
    return {
      status: 200,
      data: summarizeLicense(license, entitlements, {
        redeemed: true,
        message: requestedActivationCode ? "权益已叠加到当前卡密" : "卡密激活成功"
      })
    }
  }

  async function grantEntitlement(body = {}) {
    const resolved = await resolveLicenseByUserCode(body)
    if (resolved.error) return resolved.error

    const sku = normalizeWowSku(body.sku || `${body.tier || "standard"}_${body.permanent ? "perm" : body.calls || body.counts || 1}`)
    const time = getNow()
    const sourceCode = normalizeWowCard(body.sourceCardCode || body.source_card_code)
      || `ADMIN-${sku.sku.toUpperCase()}-${time}`

    await store.insertEntitlement({
      product_id: PRODUCT_ID,
      activation_code: resolved.activationCode,
      tier: sku.tier,
      remaining_calls: sku.permanent ? 0 : sku.calls,
      total_calls: sku.permanent ? 0 : sku.calls,
      is_permanent: sku.permanent,
      source_card_code: sourceCode,
      created_at: time,
      updated_at: time
    })
    await store.insertRedemption({
      product_id: PRODUCT_ID,
      card_code: sourceCode,
      activation_code: resolved.activationCode,
      sku: sku.sku,
      tier: sku.tier,
      calls: sku.calls,
      is_permanent: sku.permanent,
      created_at: time
    })

    const entitlements = await store.listEntitlements(resolved.activationCode)
    return {
      status: 200,
      data: summarizeLicense(resolved.license, entitlements, {
        granted: true,
        message: "已按用户原卡密升级/加次数"
      })
    }
  }

  async function searchLicense(body = {}) {
    const resolved = await resolveLicenseByUserCode({
      activationCode: body.activationCode || body.activation_code || body.keyword,
      cardCode: body.cardCode || body.card_code || body.keyword
    })
    if (resolved.error) return resolved.error

    const { activationCode, license } = resolved
    const [cards, entitlements, redemptions, consumptions] = await Promise.all([
      store.listCardsForActivation(activationCode),
      store.listEntitlements(activationCode),
      store.listRedemptions(activationCode),
      store.listConsumptions(activationCode)
    ])
    const summary = summarizeLicense(license, entitlements)

    return {
      status: 200,
      data: {
        ok: true,
        activationCode,
        summary,
        cards: cards.map(mapCard),
        entitlements: summary.entitlements,
        redemptions: redemptions.map(mapRedemption),
        consumptions: consumptions.map(mapConsumption)
      }
    }
  }

  async function consume(body = {}) {
    const activationCode = normalizeActivationCode(body.activationCode || body.activation_code)
    const requiredTier = normalizeTier(body.requiredTier || body.required_tier)
    const amount = Math.max(1, Math.min(1000, Number(body.amount || 1) || 1))
    if (!activationCode) return { status: 400, data: { ok: false, message: "请输入激活码" } }

    const license = await store.findLicense(activationCode)
    if (!license) return { status: 404, data: { ok: false, message: "激活码不存在，请先激活应用" } }
    const entitlements = await store.listEntitlements(activationCode)
    const eligible = sortEntitlementsForUse(entitlements, requiredTier)
    const permanent = eligible.find((item) => item.is_permanent)
    const time = getNow()

    if (permanent) {
      await store.insertConsumption({
        product_id: PRODUCT_ID,
        activation_code: activationCode,
        required_tier: requiredTier,
        charged_tier: normalizeTier(permanent.tier),
        amount: 0,
        created_at: time
      })
      return {
        status: 200,
        data: summarizeLicense(license, entitlements, {
          consumed: false,
          chargedTier: normalizeTier(permanent.tier),
          message: "永久版无需扣次数"
        })
      }
    }

    const counted = eligible.find((item) => Math.max(0, Number(item.remaining_calls || 0)) >= amount)
    if (!counted) {
      return {
        status: 402,
        data: summarizeLicense(license, entitlements, {
          ok: false,
          message: `${requiredTier} 版本权限或次数不足，请购买次数或升级版本`
        })
      }
    }

    await store.updateEntitlement(counted.id, {
      remaining_calls: Math.max(0, Number(counted.remaining_calls || 0)) - amount,
      updated_at: time
    })
    await store.insertConsumption({
      product_id: PRODUCT_ID,
      activation_code: activationCode,
      required_tier: requiredTier,
      charged_tier: normalizeTier(counted.tier),
      amount,
      created_at: time
    })

    const nextEntitlements = await store.listEntitlements(activationCode)
    return {
      status: 200,
      data: summarizeLicense(license, nextEntitlements, {
        consumed: true,
        chargedTier: normalizeTier(counted.tier),
        message: "已扣除 1 次"
      })
    }
  }

  async function generateCards(body = {}) {
    const sku = normalizeWowSku(body.sku || `${body.tier || "standard"}_${body.permanent ? "perm" : body.calls || body.counts || 1}`)
    const count = Math.max(1, Math.min(500, Number(body.count || 1) || 1))
    const prefix = normalizeWowCard(body.prefix || "WOW")
    const time = getNow()
    const rows = []

    while (rows.length < count) {
      const cardCode = randomCardCode(prefix)
      const exists = await store.findCard(cardCode)
      if (exists || rows.some((row) => row.card_code === cardCode)) continue
      rows.push({
        product_id: PRODUCT_ID,
        card_code: cardCode,
        sku: sku.sku,
        tier: sku.tier,
        call_count: sku.calls,
        is_permanent: sku.permanent,
        status: "new",
        created_at: time,
        updated_at: time
      })
    }

    await store.insertCards(rows)
    return {
      status: 200,
      data: {
        ok: true,
        sku: sku.sku,
        cards: rows.map((row) => row.card_code),
        text: rows.map((row) => row.card_code).join("\n")
      }
    }
  }

  return {
    consume,
    generateCards,
    grantEntitlement,
    redeem,
    searchLicense,
    status
  }
}

function createMemoryWowStore(seed = {}) {
  const data = {
    cards: (seed.cards || []).map((row, index) => ({ id: index + 1, product_id: PRODUCT_ID, ...row })),
    licenses: (seed.licenses || []).map((row, index) => ({ id: index + 1, product_id: PRODUCT_ID, ...row })),
    entitlements: (seed.entitlements || []).map((row, index) => ({ id: index + 1, product_id: PRODUCT_ID, ...row })),
    redemptions: [],
    consumptions: []
  }
  const counters = {
    cards: data.cards.length + 1,
    licenses: data.licenses.length + 1,
    entitlements: data.entitlements.length + 1,
    redemptions: 1,
    consumptions: 1
  }

  return {
    data,
    async findCard(cardCode) {
      return data.cards.find((row) => row.card_code === cardCode) || null
    },
    async updateCard(cardCode, patch) {
      const row = data.cards.find((item) => item.card_code === cardCode)
      if (row) Object.assign(row, patch)
      return row
    },
    async listCardsForActivation(activationCode) {
      return data.cards.filter((row) => row.activation_code === activationCode)
    },
    async insertCards(rows) {
      for (const row of rows) {
        data.cards.push({ id: counters.cards++, ...row })
      }
      return rows
    },
    async findLicense(activationCode) {
      return data.licenses.find((row) => row.activation_code === activationCode) || null
    },
    async createLicense(row) {
      const license = { id: counters.licenses++, ...row }
      data.licenses.push(license)
      return license
    },
    async listEntitlements(activationCode) {
      return data.entitlements.filter((row) => row.activation_code === activationCode)
    },
    async insertEntitlement(row) {
      const entitlement = { id: counters.entitlements++, ...row }
      data.entitlements.push(entitlement)
      return entitlement
    },
    async updateEntitlement(id, patch) {
      const row = data.entitlements.find((item) => String(item.id) === String(id))
      if (row) Object.assign(row, patch)
      return row
    },
    async insertRedemption(row) {
      const redemption = { id: counters.redemptions++, ...row }
      data.redemptions.push(redemption)
      return redemption
    },
    async listRedemptions(activationCode) {
      return data.redemptions.filter((row) => row.activation_code === activationCode)
    },
    async insertConsumption(row) {
      const consumption = { id: counters.consumptions++, ...row }
      data.consumptions.push(consumption)
      return consumption
    },
    async listConsumptions(activationCode) {
      return data.consumptions.filter((row) => row.activation_code === activationCode)
    }
  }
}

function firstRow(data) {
  return Array.isArray(data) && data.length ? data[0] : null
}

function createSupabaseWowStore() {
  return {
    async findCard(cardCode) {
      return firstRow(await sb("wow_cards", {
        query: { select: "*", card_code: "eq." + cardCode, limit: "1" }
      }))
    },
    async updateCard(cardCode, patch) {
      return firstRow(await sb("wow_cards", {
        method: "PATCH",
        query: { card_code: "eq." + cardCode },
        body: patch
      }))
    },
    async listCardsForActivation(activationCode) {
      const rows = await sb("wow_cards", {
        query: { select: "*", activation_code: "eq." + activationCode, order: "id.asc" }
      })
      return Array.isArray(rows) ? rows : []
    },
    async insertCards(rows) {
      return sb("wow_cards", { method: "POST", body: rows })
    },
    async findLicense(activationCode) {
      return firstRow(await sb("wow_licenses", {
        query: { select: "*", activation_code: "eq." + activationCode, limit: "1" }
      }))
    },
    async createLicense(row) {
      return firstRow(await sb("wow_licenses", { method: "POST", body: row }))
    },
    async listEntitlements(activationCode) {
      const rows = await sb("wow_license_entitlements", {
        query: { select: "*", activation_code: "eq." + activationCode, order: "id.asc" }
      })
      return Array.isArray(rows) ? rows : []
    },
    async insertEntitlement(row) {
      return firstRow(await sb("wow_license_entitlements", { method: "POST", body: row }))
    },
    async updateEntitlement(id, patch) {
      return firstRow(await sb("wow_license_entitlements", {
        method: "PATCH",
        query: { id: "eq." + id },
        body: patch
      }))
    },
    async insertRedemption(row) {
      return firstRow(await sb("wow_redemptions", { method: "POST", body: row }))
    },
    async listRedemptions(activationCode) {
      const rows = await sb("wow_redemptions", {
        query: { select: "*", activation_code: "eq." + activationCode, order: "id.asc" }
      })
      return Array.isArray(rows) ? rows : []
    },
    async insertConsumption(row) {
      return firstRow(await sb("wow_consumptions", { method: "POST", body: row }))
    },
    async listConsumptions(activationCode) {
      const rows = await sb("wow_consumptions", {
        query: { select: "*", activation_code: "eq." + activationCode, order: "id.asc" }
      })
      return Array.isArray(rows) ? rows : []
    }
  }
}

module.exports = {
  PRODUCT_ID,
  TIER_LEVELS,
  TIERS,
  createMemoryWowStore,
  createSupabaseWowStore,
  createWowLicenseService,
  normalizeActivationCode,
  normalizeTier,
  normalizeWowCard,
  normalizeWowSku,
  randomActivationCode,
  randomCardCode,
  tierAllows
}
