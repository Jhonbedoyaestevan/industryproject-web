// Pruebas del Worker sin red: `npm test`
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { safeFirstName, purgeExpiredLeads } from "../src/brevo.js";

const ORIGIN = "https://industryproject.net";
const baseEnv = {
  ALLOWED_ORIGINS: `${ORIGIN},https://www.industryproject.net`,
  ALLOWED_HOSTNAMES: "industryproject.net,www.industryproject.net",
  GITHUB_SCOPE: "public_repo", GITHUB_CLIENT_ID: "cid", GITHUB_CLIENT_SECRET: "csecret",
  TURNSTILE_SECRET: "tsecret", BREVO_API_KEY: "bkey",
  MAIL_TO: "contacto@industryproject.net", MAIL_FROM: "no-responder@industryproject.net", MAIL_FROM_NAME: "Industry Project",
  BREVO_LIST_LEADS: "7", BREVO_LIST_NEWSLETTER: "8", BREVO_DOI_TEMPLATE_ID: "12", BREVO_TEMPLATE_CONFIRMACION: "0",
  DOI_REDIRECT_URL: `${ORIGIN}/suscripcion-confirmada/`,
};

let calls = [];
function mockFetch(opts = {}) {
  const {
    turnstile = { success: true, hostname: "industryproject.net", action: "contact" },
    smtpStatus = 201, contactStatus = 201, contactAttrFail = false, doiStatus = 201,
    gh = { access_token: "gho_test" }, listContacts = [],
  } = opts;
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method || "GET", body: init.body && typeof init.body === "string" ? JSON.parse(init.body) : init.body });
    if (u.includes("siteverify")) return new Response(JSON.stringify(turnstile));
    if (u.endsWith("/v3/smtp/email")) return new Response("{}", { status: smtpStatus });
    if (u.endsWith("/v3/contacts/doubleOptinConfirmation")) return new Response(null, { status: doiStatus === 204 ? 204 : doiStatus });
    if (u.endsWith("/v3/contacts") && init.method === "POST") {
      const b = JSON.parse(init.body);
      if (contactAttrFail && b.attributes) return new Response(JSON.stringify({ code: "invalid_parameter" }), { status: 400 });
      return new Response("{}", { status: contactStatus });
    }
    if (u.includes("/v3/contacts/lists/") && u.includes("/contacts?")) return new Response(JSON.stringify({ contacts: listContacts, count: listContacts.length }));
    if (u.includes("/v3/contacts/") && init.method === "DELETE") return new Response(null, { status: 204 });
    if (u.includes("access_token")) return new Response(JSON.stringify(gh));
    throw new Error("unexpected " + u);
  };
}
const valid = { nombre: "Ana Pérez Gil", empresa: "ACME", email: "Ana@Empresa.es", servicio: "Peritajes técnicos", mensaje: "Necesito un peritaje de una máquina.", privacidad: true, comercial: false, policyVersion: "1.1", token: "tok_1234567890", web: "" };
const post = (body, headers = {}) => new Request("https://api.industryproject.net/contact", {
  method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body),
});
const smtp = () => calls.filter((c) => c.url.endsWith("/v3/smtp/email"));

test("válido: notifica, da de alta en lista de contactos y envía acuse sin contenido del usuario", async () => {
  mockFetch();
  const res = await worker.fetch(post(valid), baseEnv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  const contact = calls.find((c) => c.url.endsWith("/v3/contacts")).body;
  assert.equal(contact.email, "ana@empresa.es");
  assert.deepEqual(contact.listIds, [7]);
  assert.equal(contact.updateEnabled, true);
  assert.equal(contact.attributes.NOMBRE, "Ana");
  assert.equal(contact.attributes.APELLIDOS, "Pérez Gil");
  assert.equal(contact.attributes.PRIVACIDAD_VERSION, "1.1");
  assert.equal(contact.attributes.MENSAJE, undefined, "el mensaje no se guarda en Brevo");
  const [notify, confirm] = [smtp().find((c) => c.body.to[0].email === baseEnv.MAIL_TO), smtp().find((c) => c.body.to[0].email === "ana@empresa.es")];
  assert.ok(notify.body.textContent.includes("Necesito un peritaje"));
  assert.ok(confirm, "acuse enviado al usuario");
  assert.ok(!confirm.body.htmlContent.includes("peritaje") && !confirm.body.htmlContent.includes("ACME"));
  assert.ok(confirm.body.htmlContent.includes("Hola, Ana:"));
  assert.ok(!calls.some((c) => c.url.endsWith("doubleOptinConfirmation")), "sin newsletter si no la marca");
});

test("newsletter marcada → doble opt-in a la lista 8, nunca alta directa", async () => {
  mockFetch();
  const res = await worker.fetch(post({ ...valid, comercial: true }), baseEnv);
  assert.equal(res.status, 200);
  const doi = calls.find((c) => c.url.endsWith("doubleOptinConfirmation")).body;
  assert.deepEqual(doi.includeListIds, [8]);
  assert.equal(doi.templateId, 12);
  const contact = calls.find((c) => c.url.endsWith("/v3/contacts")).body;
  assert.ok(!contact.listIds.includes(8));
});

test("newsletter marcada sin plantilla DOI configurada → no se suscribe", async () => {
  mockFetch();
  await worker.fetch(post({ ...valid, comercial: true }), { ...baseEnv, BREVO_DOI_TEMPLATE_ID: "0" });
  assert.ok(!calls.some((c) => c.url.endsWith("doubleOptinConfirmation")));
});

test("con plantilla de acuse propia se envían solo params saneados", async () => {
  mockFetch();
  await worker.fetch(post({ ...valid, nombre: "www.spam-casino.com Bonus" }), { ...baseEnv, BREVO_TEMPLATE_CONFIRMACION: "21" });
  const confirm = smtp().find((c) => c.body.templateId === 21);
  assert.deepEqual(confirm.body.params, { NOMBRE: "" });
});

test("falla la notificación pero el contacto se guarda → 200 (lead no perdido)", async () => {
  mockFetch({ smtpStatus: 500 });
  const res = await worker.fetch(post(valid), baseEnv);
  assert.equal(res.status, 200);
});

test("fallan notificación y alta → 502", async () => {
  mockFetch({ smtpStatus: 500, contactStatus: 500 });
  const res = await worker.fetch(post(valid), baseEnv);
  assert.equal(res.status, 502);
});

test("atributo inexistente en Brevo → reintento sin atributos", async () => {
  mockFetch({ contactAttrFail: true });
  const res = await worker.fetch(post(valid), baseEnv);
  assert.equal(res.status, 200);
  const attempts = calls.filter((c) => c.url.endsWith("/v3/contacts"));
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].body.attributes, undefined);
});

test("www.industryproject.net también es origen permitido", async () => {
  mockFetch();
  const res = await worker.fetch(post(valid, { Origin: "https://www.industryproject.net" }), baseEnv);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://www.industryproject.net");
});

test("origen no autorizado → 403 sin llamadas externas", async () => {
  mockFetch();
  const res = await worker.fetch(post(valid, { Origin: "https://evil.example" }), baseEnv);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("sin consentimiento de privacidad → 400 sin llamadas", async () => {
  mockFetch();
  const res = await worker.fetch(post({ ...valid, privacidad: false }), baseEnv);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("Turnstile fallido o de otro hostname → 400 y nada llega a Brevo", async () => {
  mockFetch({ turnstile: { success: true, hostname: "otro.com", action: "contact" } });
  assert.equal((await worker.fetch(post(valid), baseEnv)).status, 400);
  mockFetch({ turnstile: { success: false } });
  assert.equal((await worker.fetch(post(valid), baseEnv)).status, 400);
  assert.ok(!calls.some((c) => c.url.includes("brevo")));
});

test("honeypot relleno → 200 aparente sin procesar", async () => {
  mockFetch();
  const res = await worker.fetch(post({ ...valid, web: "http://spam" }), baseEnv);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test("payload > 10 KB → 413; Content-Type no JSON → 415", async () => {
  mockFetch();
  assert.equal((await worker.fetch(post({ ...valid, mensaje: "x".repeat(12000) }), baseEnv)).status, 413);
  assert.equal((await worker.fetch(post("a=b", { "Content-Type": "application/x-www-form-urlencoded" }), baseEnv)).status, 415);
});

test("inyección CRLF en nombre neutralizada en el asunto", async () => {
  mockFetch();
  await worker.fetch(post({ ...valid, nombre: "Ana\r\nBcc: victima@x.com" }), baseEnv);
  const notify = smtp().find((c) => c.body.to[0].email === baseEnv.MAIL_TO);
  assert.ok(!/[\r\n]/.test(notify.body.subject));
});

test("safeFirstName acepta nombres reales y rechaza URLs o símbolos", () => {
  assert.equal(safeFirstName("José María"), "José");
  assert.equal(safeFirstName("O'Neill"), "O'Neill");
  assert.equal(safeFirstName("http://x.com"), "");
  assert.equal(safeFirstName("<script>"), "");
});

test("purga: dry-run no borra; real borra solo contactos caducados, solo-lista y no excluidos", async () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  const old = "2025-01-01T00:00:00Z", recent = "2026-09-01T00:00:00Z";
  const listContacts = [
    { email: "a@x.com", listIds: [7], emailBlacklisted: false, attributes: { PRIVACIDAD_FECHA: old } },   // borrar
    { email: "b@x.com", listIds: [7, 8], emailBlacklisted: false, attributes: { PRIVACIDAD_FECHA: old } }, // suscriptor: conservar
    { email: "c@x.com", listIds: [7], emailBlacklisted: true, attributes: { PRIVACIDAD_FECHA: old } },     // baja: conservar
    { email: "d@x.com", listIds: [7], emailBlacklisted: false, attributes: { PRIVACIDAD_FECHA: recent } }, // reciente
  ];
  mockFetch({ listContacts });
  let r = await purgeExpiredLeads({ ...baseEnv, RETENTION_DRY_RUN: "true" }, now);
  assert.deepEqual(r, { dryRun: true, candidates: 1, deleted: 0 });
  assert.ok(!calls.some((c) => c.method === "DELETE"));
  mockFetch({ listContacts });
  r = await purgeExpiredLeads({ ...baseEnv, RETENTION_DRY_RUN: "false" }, now);
  assert.deepEqual(r, { dryRun: false, candidates: 1, deleted: 1 });
  assert.ok(calls.find((c) => c.method === "DELETE").url.endsWith("/contacts/a%40x.com"));
});

test("/auth redirige a GitHub con scope forzado y cookie state __Host-", async () => {
  const res = await worker.fetch(new Request("https://api.industryproject.net/auth?provider=github&scope=repo,admin:org"), baseEnv);
  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("Location"));
  assert.equal(loc.searchParams.get("scope"), "public_repo");
  assert.equal(loc.searchParams.get("redirect_uri"), "https://api.industryproject.net/callback");
  const state = loc.searchParams.get("state");
  assert.match(res.headers.get("Set-Cookie"), new RegExp(`^__Host-decap_oauth_state=${state};.*Secure; HttpOnly; SameSite=Lax`));
});

test("/callback con state incorrecto → error sin canje de token", async () => {
  mockFetch();
  const res = await worker.fetch(new Request("https://api.industryproject.net/callback?code=c&state=AAA", { headers: { Cookie: "__Host-decap_oauth_state=BBB" } }), baseEnv);
  assert.ok((await res.text()).includes("invalid_state"));
  assert.equal(calls.length, 0);
});

test("/callback válido → postMessage solo al origen principal, CSP con nonce", async () => {
  mockFetch();
  const res = await worker.fetch(new Request("https://api.industryproject.net/callback?code=c&state=XYZ", { headers: { Cookie: "__Host-decap_oauth_state=XYZ" } }), baseEnv);
  const html = await res.text();
  assert.ok(html.includes("gho_test"));
  assert.ok(html.includes('var target = "https://industryproject.net"'));
  assert.ok(!html.includes('"*"'));
  assert.match(res.headers.get("Content-Security-Policy"), /script-src 'nonce-/);
});
