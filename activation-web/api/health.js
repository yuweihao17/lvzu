const { config, probeSupabase, send, supabaseReady } = require("./_lib/activation")

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 200, { ok: true })
  const cfg = config()
  const data = {
    ok: true,
    supabaseReady: supabaseReady(),
    hasSupabaseUrl: Boolean(cfg.supabaseUrl),
    hasSupabaseKey: Boolean(cfg.supabaseKey),
    supabaseUrlHost: cfg.supabaseUrl ? new URL(cfg.supabaseUrl).host : "",
    hasAdminSecret: Boolean(cfg.adminSecret),
    defaultProductId: cfg.defaultProductId
  }
  if (req.query && req.query.probe === "1") {
    data.supabaseProbe = await probeSupabase()
  }
  return send(res, 200, data)
}
