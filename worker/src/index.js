/**
 * =============================================================================
 * industryproject-edge — Cloudflare Worker (plan gratuito) · api.industryproject.net
 *
 * Endpoints:
 *   GET  /auth      → inicia OAuth de GitHub para Decap CMS (popup)
 *   GET  /callback  → canjea el code por token y lo entrega a Decap vía postMessage
 *   POST /contact   → valida, verifica Turnstile y procesa el lead en Brevo:
 *                      notificación interna + alta en lista + acuse al usuario
 *                      + doble opt-in de newsletter (si lo marcó)
 *   GET  /health    → comprobación de estado
 *   cron diario     → purga de contactos caducados (art. 5.1.e RGPD)
 *
 * SECRETOS CIFRADOS (`wrangler secret put`): GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
 *                                           TURNSTILE_SECRET, BREVO_API_KEY
 * VARIABLES: ver wrangler.toml [vars]
 *
 * Controles OWASP: validación estricta (A03), CORS/Origin en lista blanca (A01/A05),
 * CSRF OAuth con state + cookie __Host- (A01), postMessage con origen exacto (A01),
 * cabeceras de seguridad y CSP con nonce (A05), sin datos personales en logs (A09),
 * límites de tamaño (A04), secretos fuera del código (A02/A07), URLs de salida fijas (A10).
 * =============================================================================
 */
import { upsertLead, requestNewsletterDOI, sendConfirmation, sendOwnerNotification, purgeExpiredLeads } from "./brevo.js";

const MAX_BODY_BYTES = 10 * 1024;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;
const PHONE_RE = /^[0-9+()\s.\-]{6,30}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/auth":     return handleAuth(request, env, url);
        case "/callback": return await handleCallback(request, env, url);
        case "/contact":  return await handleContact(request, env, ctx);
        case "/health":   return secure(new Response("ok", { status: 200 }));
        default:          return secure(new Response("Not found", { status: 404 }));
      }
    } catch (err) {
      console.error("unhandled", err && err.name);
      return secure(json({ ok: false, error: "server" }, 500));
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(purgeExpiredLeads(env).catch((e) => console.error("retention_error", e && e.name)));
  },
};

/* ----------------------------------------------------------------- utilidades */

export function listFrom(value) {
  return String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
}
function allowedOrigins(env) {
  return listFrom(env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN);
}
function allowedHostnames(env) {
  return listFrom(env.ALLOWED_HOSTNAMES || env.ALLOWED_HOSTNAME);
}

function secure(res, extra = {}) {
  const h = new Headers(res.headers);
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "no-referrer");
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  h.set("Cache-Control", "no-store");
  h.set("Cross-Origin-Opener-Policy", "unsafe-none"); // el popup OAuth necesita window.opener
  if (!h.has("Content-Security-Policy")) {
    h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  }
  h.set("X-Frame-Options", "DENY");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]));
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** Comparación en tiempo constante (evita ataques de temporización sobre `state`). */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Limpia texto: quita caracteres de control (salvo \n en mensaje) y recorta. */
function clean(value, max, { multiline = false } = {}) {
  if (typeof value !== "string") return "";
  const re = multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return value.replace(re, " ").trim().slice(0, max);
}

/* ----------------------------------------------------------- OAuth (Decap CMS) */

const STATE_COOKIE = "__Host-decap_oauth_state";

function handleAuth(request, env, url) {
  if (request.method !== "GET") return secure(new Response("Method not allowed", { status: 405 }));
  if (!env.GITHUB_CLIENT_ID) return secure(new Response("OAuth no configurado", { status: 500 }));
  if (url.searchParams.get("provider") && url.searchParams.get("provider") !== "github") {
    return secure(new Response("Proveedor no soportado", { status: 400 }));
  }
  const state = randomToken(24);
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/callback`);
  authorize.searchParams.set("scope", env.GITHUB_SCOPE || "public_repo"); // ámbito mínimo forzado en servidor
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("allow_signup", "false");

  return secure(new Response(null, { status: 302, headers: { Location: authorize.toString() } }), {
    "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`,
  });
}

async function handleCallback(request, env, url) {
  if (request.method !== "GET") return secure(new Response("Method not allowed", { status: 405 }));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = getCookie(request, STATE_COOKIE);
  const clearCookie = `${STATE_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
    return oauthResult(env, "error", { error: "invalid_state" }, clearCookie);
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "industryproject-edge" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/callback`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return oauthResult(env, "error", { error: "token_exchange_failed" }, clearCookie);
  }
  return oauthResult(env, "success", { token: data.access_token, provider: "github" }, clearCookie);
}

/**
 * Página del popup: handshake de Decap CMS. El token se envía SOLO al origen
 * principal (primer valor de ALLOWED_ORIGINS), nunca con targetOrigin "*".
 */
function oauthResult(env, status, content, setCookie) {
  const nonce = randomToken(16);
  const target = JSON.stringify(allowedOrigins(env)[0] || "");
  const message = JSON.stringify(`authorization:github:${status}:${JSON.stringify(content)}`)
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Autenticando…</title></head>
<body><p>Completando autenticación… puede cerrar esta ventana.</p>
<script nonce="${nonce}">
(function () {
  var target = ${target};
  var msg = ${message};
  if (!window.opener || !target) { document.body.textContent = "Error: abra el panel desde /admin/."; return; }
  function receive(e) {
    if (e.origin !== target) return;
    window.removeEventListener("message", receive, false);
    window.opener.postMessage(msg, target);
    setTimeout(function () { window.close(); }, 250);
  }
  window.addEventListener("message", receive, false);
  window.opener.postMessage("authorizing:github", target);
})();
</script></body></html>`;
  return secure(
    new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }),
    {
      "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
      "Set-Cookie": setCookie,
    }
  );
}

/* ------------------------------------------------------------- Formulario */

async function handleContact(request, env, ctx) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) {
    return secure(json({ ok: false, error: "forbidden" }, 403));
  }
  const cors = corsHeaders(origin);
  if (request.method === "OPTIONS") return secure(new Response(null, { status: 204, headers: cors }));
  if (request.method !== "POST") return secure(json({ ok: false, error: "method" }, 405, cors));

  const ctype = request.headers.get("Content-Type") || "";
  if (!ctype.toLowerCase().startsWith("application/json")) {
    return secure(json({ ok: false, error: "unsupported_media_type" }, 415, cors));
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (env.CONTACT_LIMITER) {
    const { success } = await env.CONTACT_LIMITER.limit({ key: ip || "anon" });
    if (!success) return secure(json({ ok: false, error: "rate_limited" }, 429, cors));
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return secure(json({ ok: false, error: "payload_too_large" }, 413, cors));
  }
  let body;
  try { body = JSON.parse(raw); } catch { return secure(json({ ok: false, error: "validation" }, 400, cors)); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return secure(json({ ok: false, error: "validation" }, 400, cors));
  }

  // Honeypot: éxito aparente sin procesar
  if (typeof body.web === "string" && body.web.length > 0) {
    return secure(json({ ok: true }, 200, cors));
  }

  const d = {
    nombre: clean(body.nombre, 100),
    empresa: clean(body.empresa, 120),
    email: clean(body.email, 254).toLowerCase(),
    telefono: clean(body.telefono, 30),
    servicio: clean(body.servicio, 120),
    mensaje: clean(body.mensaje, 3000, { multiline: true }),
    privacidad: body.privacidad === true,
    comercial: body.comercial === true,
    policyVersion: clean(body.policyVersion, 10),
  };
  const errors = [];
  if (d.nombre.length < 2) errors.push("nombre");
  if (!EMAIL_RE.test(d.email)) errors.push("email");
  if (d.telefono && !PHONE_RE.test(d.telefono)) errors.push("telefono");
  if (!d.servicio) errors.push("servicio");
  if (d.mensaje.length < 10) errors.push("mensaje");
  if (!d.privacidad) errors.push("privacidad"); // consentimiento obligatorio (art. 7.1 RGPD)
  if (!/^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$/.test(d.policyVersion)) errors.push("policyVersion");
  if (typeof body.token !== "string" || body.token.length < 10 || body.token.length > 4096) errors.push("token");
  if (errors.length) return secure(json({ ok: false, error: "validation" }, 400, cors));

  const verify = await verifyTurnstile(env, body.token, ip);
  if (!verify.ok) return secure(json({ ok: false, error: "captcha" }, 400, cors));

  if (!env.BREVO_API_KEY) return secure(json({ ok: false, error: "delivery" }, 502, cors));

  // 1) Críticos: notificación interna + alta en lista. Basta con que uno funcione
  //    para que el lead no se pierda.
  const stamp = new Date().toISOString();
  const [notify, lead] = await Promise.allSettled([
    sendOwnerNotification(env, d, stamp),
    upsertLead(env, d, stamp),
  ]);
  const notifyOk = notify.status === "fulfilled" && notify.value.ok;
  const leadOk = lead.status === "fulfilled" && lead.value.ok;
  if (!notifyOk && !leadOk) return secure(json({ ok: false, error: "delivery" }, 502, cors));

  // 2) No críticos, tras responder: acuse al usuario y doble opt-in de newsletter.
  const background = Promise.allSettled([
    sendConfirmation(env, d),
    d.comercial ? requestNewsletterDOI(env, d, stamp) : Promise.resolve({ skipped: true }),
  ]);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(background);
  else await background;

  return secure(json({ ok: true }, 200, cors));
}

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return { ok: false };
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  form.append("idempotency_key", crypto.randomUUID());
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = await res.json().catch(() => ({}));
  const hosts = allowedHostnames(env);
  const okHost = hosts.length === 0 || hosts.includes(out.hostname);
  const okAction = !out.action || out.action === "contact";
  return { ok: out.success === true && okHost && okAction };
}
