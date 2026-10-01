#!/usr/bin/env node
/**
 * =============================================================================
 * infra/cloudflare/apply.mjs — Configuración de la zona industryproject.net
 *
 * 1) Ajustes de seguridad de la zona (SSL estricto, HTTPS obligatorio, TLS ≥1.2,
 *    sin Rocket Loader ni ofuscación de email, que reescriben el HTML y rompen la CSP).
 * 2) Reglas de transformación de cabeceras de respuesta (Response Header Transform Rules):
 *    añaden las cabeceras HTTP que GitHub Pages no permite (CSP con frame-ancestors,
 *    X-Frame-Options, HSTS, Permissions-Policy…).
 *
 * Uso (credenciales SOLO por variables de entorno; no se guardan en disco):
 *   PowerShell:  $env:CF_API_TOKEN="..."; $env:CF_ZONE_ID="..."; node infra/cloudflare/apply.mjs
 *   macOS/Linux: CF_API_TOKEN=... CF_ZONE_ID=... node infra/cloudflare/apply.mjs
 *   Añada --dry-run para ver qué se aplicaría sin cambiar nada.
 *
 * Token de API mínimo (My Profile → API Tokens → Custom token), zona industryproject.net:
 *   Zone → Zone Settings → Edit · Zone → Transform Rules → Edit
 *
 * ⚠ Ejecútelo DESPUÉS de que GitHub Pages haya emitido el certificado y activado
 *   «Enforce HTTPS» (Guía §4). La regla PUT sustituye todas las reglas de cabeceras
 *   de respuesta existentes en la zona.
 * =============================================================================
 */
const TOKEN = process.env.CF_API_TOKEN;
const ZONE = process.env.CF_ZONE_ID;
const DRY = process.argv.includes("--dry-run");
if (!DRY && (!TOKEN || !ZONE)) { console.error("Defina CF_API_TOKEN y CF_ZONE_ID (o use --dry-run)."); process.exit(1); }

const DOMAIN = "industryproject.net";
const API_ORIGIN = `https://api.${DOMAIN}`;
const HOSTS = `{"${DOMAIN}" "www.${DOMAIN}"}`;

const CSP_PUBLIC = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' https://cloudflareinsights.com ${API_ORIGIN}`,
  "frame-src https://challenges.cloudflare.com",
  `form-action 'self' ${API_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "manifest-src 'self'",
  "worker-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const CSP_ADMIN = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://raw.githubusercontent.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://api.github.com https://raw.githubusercontent.com ${API_ORIGIN}`,
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const set = (value) => ({ operation: "set", value });
const COMMON = {
  "Strict-Transport-Security": set("max-age=31536000; includeSubDomains"),
  "X-Content-Type-Options": set("nosniff"),
  "X-Frame-Options": set("DENY"),
  "Permissions-Policy": set("accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()"),
};

const RULESET = {
  description: "Cabeceras de seguridad industryproject.net",
  rules: [
    {
      description: "Sitio público: CSP estricta + cabeceras de seguridad",
      expression: `(http.host in ${HOSTS} and not starts_with(http.request.uri.path, "/admin"))`,
      action: "rewrite",
      action_parameters: {
        headers: {
          ...COMMON,
          "Content-Security-Policy": set(CSP_PUBLIC),
          "Referrer-Policy": set("strict-origin-when-cross-origin"),
          "Cross-Origin-Opener-Policy": set("same-origin"),
        },
      },
      enabled: true,
    },
    {
      description: "Panel /admin: CSP de Decap + noindex (sin COOP: el login OAuth usa window.opener)",
      expression: `(http.host in ${HOSTS} and starts_with(http.request.uri.path, "/admin"))`,
      action: "rewrite",
      action_parameters: {
        headers: {
          ...COMMON,
          "Content-Security-Policy": set(CSP_ADMIN),
          "Referrer-Policy": set("no-referrer"),
          "X-Robots-Tag": set("noindex, nofollow"),
        },
      },
      enabled: true,
    },
  ],
};

const SETTINGS = {
  ssl: "strict",                    // Full (strict): valida el certificado de GitHub Pages
  always_use_https: "on",
  min_tls_version: "1.2",
  tls_1_3: "on",
  automatic_https_rewrites: "on",
  rocket_loader: "off",             // reescribe <script> → rompe la CSP
  email_obfuscation: "off",         // inyecta scripts y reescribe mailto
  browser_check: "on",
};

async function cf(path, method, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = (data.errors || []).map((e) => `${e.code} ${e.message}`).join("; ");
    throw new Error(`${method} ${path} → ${res.status} ${msg}`);
  }
  return data;
}

async function main() {
  if (DRY) {
    console.log("== Ajustes de zona ==\n", SETTINGS);
    console.log("\n== Ruleset http_response_headers_transform ==\n", JSON.stringify(RULESET, null, 2));
    return;
  }
  for (const [name, value] of Object.entries(SETTINGS)) {
    try { await cf(`/settings/${name}`, "PATCH", { value }); console.log(`✓ ${name} = ${value}`); }
    catch (e) { console.error(`✗ ${name}: ${e.message}`); }
  }
  await cf("/rulesets/phases/http_response_headers_transform/entrypoint", "PUT", RULESET);
  console.log("✓ Reglas de cabeceras de respuesta aplicadas (2 reglas).");
  console.log("\nVerifique:  curl -sI https://industryproject.net | findstr /i \"content-security strict-transport x-frame\"");
  console.log("            (macOS/Linux: curl -sI https://industryproject.net | grep -iE 'content-security|strict-transport|x-frame')");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
