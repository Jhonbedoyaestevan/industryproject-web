// =============================================================================
// Variables de entorno inyectadas en tiempo de compilación.
// - En GitHub: Settings → Secrets and variables → Actions → pestaña "Variables".
// - Todas son IDENTIFICADORES PÚBLICOS (acaban en el HTML por diseño).
// - Los SECRETOS reales viven SOLO en el Cloudflare Worker (wrangler secret put).
// - En producción, si no se definen, se usan los valores del dominio industryproject.net.
// =============================================================================
const isProd = process.env.ELEVENTY_ENV === "production";
const clean = (v) => (v || "").trim().replace(/\/+$/, "");

const PROD_DEFAULTS = {
  siteUrl: "https://industryproject.net",
  workerUrl: "https://api.industryproject.net",
};
// Clave de PRUEBA oficial de Cloudflare (siempre supera el reto). Solo en local.
const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";

export default {
  isProd,
  siteUrl: clean(process.env.SITE_URL) || (isProd ? PROD_DEFAULTS.siteUrl : "http://localhost:8080"),
  workerUrl: clean(process.env.WORKER_URL) || (isProd ? PROD_DEFAULTS.workerUrl : ""),
  turnstileSiteKey: clean(process.env.TURNSTILE_SITEKEY) || (isProd ? "" : TURNSTILE_TEST_SITEKEY),
  cfAnalyticsToken: clean(process.env.CF_ANALYTICS_TOKEN),
  // GITHUB_REPOSITORY lo define GitHub Actions automáticamente (usuario/repo)
  githubRepo: clean(process.env.GITHUB_REPOSITORY) || "USUARIO/REPOSITORIO",
  cmsBranch: clean(process.env.CMS_BRANCH) || "main",
  buildDate: new Date().toISOString(),
};
