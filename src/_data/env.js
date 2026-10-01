// =============================================================================
// Variables de entorno inyectadas en tiempo de compilación.
// =============================================================================
const isProd = process.env.ELEVENTY_ENV === "production";
const clean = (v) => (v || "").trim().replace(/\/+$/, "");

const PROD_DEFAULTS = {
  siteUrl: "https://industryproject.net",
  workerUrl: "https://api.industryproject.net",
};

// Clave de prueba de Turnstile (funciona para renderizar el widget)
const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";

export default {
  isProd,
  siteUrl: clean(process.env.SITE_URL) || PROD_DEFAULTS.siteUrl,
  workerUrl: clean(process.env.WORKER_URL) || PROD_DEFAULTS.workerUrl,
  // Lee TURNSTILE_SITEKEY o TURNSTILE_SITE_KEY. Si falta, asigna la clave por defecto
  turnstileSiteKey: clean(process.env.TURNSTILE_SITEKEY || process.env.TURNSTILE_SITE_KEY) || TURNSTILE_TEST_SITEKEY,
  cfAnalyticsToken: clean(process.env.CF_ANALYTICS_TOKEN),
  githubRepo: clean(process.env.GITHUB_REPOSITORY) || "USUARIO/REPOSITORIO",
  cmsBranch: clean(process.env.CMS_BRANCH) || "main",
  buildDate: new Date().toISOString(),
};
