/**
 * =============================================================================
 * brevo.js — Integración con la API v3 de Brevo (Sendinblue SAS, UE)
 *
 *  1. upsertLead()            → alta/actualización del contacto en la lista «Web · Contactos»
 *  2. requestNewsletterDOI()  → suscripción a newsletter SOLO por doble opt-in
 *  3. sendConfirmation()      → correo transaccional de acuse de recibo al remitente
 *  4. sendOwnerNotification() → aviso interno con el mensaje y el registro del consentimiento
 *  5. purgeExpiredLeads()     → borrado automático al vencer el plazo de conservación
 *
 * Decisiones de privacidad y seguridad:
 *  - La newsletter NUNCA se añade directamente: exige doble opt-in. Esto impide
 *    suscribir a terceros y aporta la prueba del consentimiento (art. 7.1 RGPD; art. 21 LSSI-CE).
 *  - El acuse NO reproduce contenido del usuario (mensaje, servicio, empresa): evita
 *    que el formulario se use para enviar spam a terceros con texto arbitrario.
 *    Solo incluye el nombre de pila saneado (letras, máx. 30 caracteres).
 *  - El mensaje de la consulta NO se guarda en Brevo como atributo (minimización):
 *    solo viaja en la notificación interna.
 * =============================================================================
 */

const API = "https://api.brevo.com/v3";

export function toId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function brevo(env, path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  if (res.status !== 204) { try { data = await res.json(); } catch { data = null; } }
  return { ok: res.ok, status: res.status, data };
}

/** Nombre de pila apto para un saludo: solo letras (incl. acentos), guion y apóstrofo. */
export function safeFirstName(nombre) {
  const first = String(nombre || "").trim().split(/\s+/)[0] || "";
  return /^[\p{L}][\p{L}'\-]{0,29}$/u.test(first) ? first : "";
}

function splitName(nombre) {
  const parts = String(nombre || "").trim().split(/\s+/);
  return { first: parts.shift() || "", last: parts.join(" ") };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function siteUrl(env) {
  return (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "").split(",")[0].trim();
}

/* -------------------------------------------------------------- 1. Contacto */

export async function upsertLead(env, d, stamp) {
  const leads = toId(env.BREVO_LIST_LEADS);
  const { first, last } = splitName(d.nombre);
  const attributes = {
    NOMBRE: first.slice(0, 50),
    APELLIDOS: last.slice(0, 100),
    EMPRESA: d.empresa || "",
    TELEFONO: d.telefono || "",
    SERVICIO: d.servicio,
    ORIGEN: "web-contacto",
    PRIVACIDAD_VERSION: d.policyVersion,
    PRIVACIDAD_FECHA: stamp,
    COMERCIAL_SOLICITADO: d.comercial ? "SI" : "NO",
  };
  const payload = { email: d.email, attributes, listIds: leads ? [leads] : [], updateEnabled: true };
  let res = await brevo(env, "/contacts", "POST", payload);

  // Si algún atributo no existe en la cuenta, se reintenta sin atributos para no perder el lead
  if (!res.ok && res.status === 400) {
    console.error("brevo_contact_attr_fallback", res.data && res.data.code);
    res = await brevo(env, "/contacts", "POST", { email: d.email, listIds: payload.listIds, updateEnabled: true });
  }
  if (!res.ok) console.error("brevo_contact_status", res.status);
  return res;
}

/* --------------------------------------------- 2. Newsletter (doble opt-in) */

export async function requestNewsletterDOI(env, d, stamp) {
  const list = toId(env.BREVO_LIST_NEWSLETTER);
  const tpl = toId(env.BREVO_DOI_TEMPLATE_ID);
  if (!list || !tpl || !env.DOI_REDIRECT_URL) {
    console.error("brevo_doi_not_configured");
    return { ok: false, skipped: true };
  }
  const res = await brevo(env, "/contacts/doubleOptinConfirmation", "POST", {
    email: d.email,
    includeListIds: [list],
    templateId: tpl,
    redirectionUrl: env.DOI_REDIRECT_URL,
    attributes: { COMERCIAL_SOLICITADO: "SI", COMERCIAL_FECHA: stamp },
  });
  if (!res.ok) console.error("brevo_doi_status", res.status);
  return res;
}

/* -------------------------------------- 3. Acuse de recibo (transaccional) */

export async function sendConfirmation(env, d) {
  const nombre = safeFirstName(d.nombre);
  const site = siteUrl(env);
  const base = {
    sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || "Industry Project" },
    to: [{ email: d.email }],
    replyTo: { email: env.MAIL_REPLY_TO || env.MAIL_TO },
    tags: ["web-confirmacion"],
  };
  const tpl = toId(env.BREVO_TEMPLATE_CONFIRMACION);
  let body;
  if (tpl) {
    body = { ...base, templateId: tpl, params: { NOMBRE: nombre } };
  } else {
    const saludo = nombre ? `Hola, ${nombre}:` : "Hola:";
    const marca = env.MAIL_FROM_NAME || "Industry Project";
    const text = [
      saludo,
      "",
      "Hemos recibido su consulta a través de nuestra web. Un miembro del equipo le responderá en un plazo máximo de 48 horas laborables.",
      "",
      "Si no ha enviado usted esta consulta, ignore este mensaje: no recibirá más correos.",
      "",
      `${marca} · ${site}`,
      `Política de privacidad: ${site}/privacidad/`,
    ].join("\n");
    const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;color:#1b2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0e2a47;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold">${escapeHtml(marca)}</td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">${escapeHtml(saludo)}</p>
<p style="margin:0 0 14px">Hemos recibido su consulta a través de nuestra web. Un miembro del equipo le responderá en un plazo máximo de <strong>48 horas laborables</strong>.</p>
<p style="margin:0 0 14px;color:#5b6676;font-size:13px">Si no ha enviado usted esta consulta, ignore este mensaje: no recibirá más correos.</p>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #dde3ea;font-size:12px;color:#5b6676">
${escapeHtml(marca)} · <a href="${escapeHtml(site)}" style="color:#2f6690">${escapeHtml(site.replace(/^https?:\/\//, ""))}</a> · <a href="${escapeHtml(site)}/privacidad/" style="color:#2f6690">Política de privacidad</a>
</td></tr></table></body></html>`;
    body = { ...base, subject: `Hemos recibido su consulta — ${marca}`, textContent: text, htmlContent: html };
  }
  const res = await brevo(env, "/smtp/email", "POST", body);
  if (!res.ok) console.error("brevo_confirm_status", res.status);
  return res;
}

/* ------------------------------------------------ 4. Notificación interna */

export async function sendOwnerNotification(env, d, stamp) {
  if (!env.MAIL_TO || !env.MAIL_FROM) return { ok: false };
  const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ");
  const text = [
    "Nueva consulta desde la web",
    "",
    `Nombre:    ${d.nombre}`,
    `Empresa:   ${d.empresa || "-"}`,
    `Email:     ${d.email}`,
    `Teléfono:  ${d.telefono || "-"}`,
    `Servicio:  ${d.servicio}`,
    "",
    "Mensaje:",
    d.mensaje,
    "",
    "---- Registro de consentimiento (art. 7.1 RGPD) ----",
    `Fecha/hora (UTC):                ${stamp}`,
    `Política de privacidad aceptada: v${d.policyVersion}`,
    "Consentimiento tratamiento:      SÍ",
    `Newsletter solicitada:           ${d.comercial ? "SÍ (pendiente de doble opt-in)" : "NO"}`,
    "Conserve este correo como evidencia del consentimiento mientras dure el tratamiento.",
  ].join("\n");
  const res = await brevo(env, "/smtp/email", "POST", {
    sender: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || "Web" },
    to: [{ email: env.MAIL_TO }],
    replyTo: { email: d.email, name: oneLine(d.nombre).slice(0, 100) },
    subject: oneLine(`[Web] ${d.servicio} — ${d.nombre}`).slice(0, 150),
    textContent: text,
    tags: ["web-contacto"],
  });
  if (!res.ok) console.error("brevo_notify_status", res.status);
  return res;
}

/* ------------------------------------------- 5. Purga por conservación */

/**
 * Borra de Brevo los contactos que:
 *  - pertenecen ÚNICAMENTE a la lista «Web · Contactos» (no son clientes ni suscriptores),
 *  - superan RETENTION_DAYS desde su último registro de privacidad,
 *  - NO están en lista de exclusión (las bajas se conservan para respetar la oposición).
 * Límite por ejecución acorde con el máximo de 50 subpeticiones del plan Free.
 * Con RETENTION_DRY_RUN != "false" solo registra cuántos borraría.
 */
export async function purgeExpiredLeads(env, now = Date.now()) {
  const leads = toId(env.BREVO_LIST_LEADS);
  if (!leads || !env.BREVO_API_KEY) return { skipped: true };
  const days = Number(env.RETENTION_DAYS) > 0 ? Number(env.RETENTION_DAYS) : 365;
  const cutoff = now - days * 86400000;
  const dryRun = env.RETENTION_DRY_RUN !== "false";
  const MAX_DELETES = 40;

  const candidates = [];
  for (let offset = 0, page = 0; page < 3 && candidates.length < MAX_DELETES; page++, offset += 500) {
    const res = await brevo(env, `/contacts/lists/${leads}/contacts?limit=500&offset=${offset}`);
    const contacts = (res.ok && res.data && res.data.contacts) || [];
    for (const c of contacts) {
      const ref = Date.parse((c.attributes && c.attributes.PRIVACIDAD_FECHA) || c.modifiedAt || c.createdAt || "");
      const onlyLeads = Array.isArray(c.listIds) && c.listIds.length === 1 && c.listIds[0] === leads;
      if (onlyLeads && !c.emailBlacklisted && Number.isFinite(ref) && ref < cutoff) candidates.push(c.email);
      if (candidates.length >= MAX_DELETES) break;
    }
    if (contacts.length < 500) break;
  }

  let deleted = 0;
  if (!dryRun) {
    for (const email of candidates) {
      const r = await brevo(env, `/contacts/${encodeURIComponent(email)}`, "DELETE");
      if (r.ok) deleted++;
    }
  }
  console.log("retention", JSON.stringify({ dryRun, candidates: candidates.length, deleted }));
  return { dryRun, candidates: candidates.length, deleted };
}
