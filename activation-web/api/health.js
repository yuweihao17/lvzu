const { config, send, supabaseReady } = require("./_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  const cfg = config()
  return send(res, 200, {
    ok: true,
    supabaseReady: supabaseReady(),
    hasSupabaseUrl: Boolean(cfg.supabaseUrl),
    hasSupabaseKey: Boolean(cfg.supabaseKey),
    supabaseUrlHost: cfg.supabaseUrl ? new URL(cfg.supabaseUrl).host : "",
    hasAdminSecret: Boolean(cfg.adminSecret),
    defaultProductId: cfg.defaultProductId
  })
}
