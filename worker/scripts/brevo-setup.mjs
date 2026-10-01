#!/usr/bin/env node
/**
 * brevo-setup.mjs — Prepara la cuenta de Brevo para el Worker (idempotente).
 * Crea, si no existen: carpeta, lista «Web · Contactos», lista «Web · Newsletter (doble opt-in)»
 * y los atributos de contacto que usa el Worker. Imprime los IDs para wrangler.toml.
 *
 * Uso (la clave se pasa por variable de entorno y NUNCA se guarda en disco):
 *   Windows PowerShell:  $env:BREVO_API_KEY="xkeysib-..."; node scripts/brevo-setup.mjs
 *   macOS / Linux:       BREVO_API_KEY="xkeysib-..." node scripts/brevo-setup.mjs
 */
const KEY = process.env.BREVO_API_KEY;
if (!KEY) { console.error("Defina la variable de entorno BREVO_API_KEY."); process.exit(1); }

const API = "https://api.brevo.com/v3";
const FOLDER = "Web industryproject.net";
const LISTS = { leads: "Web · Contactos", newsletter: "Web · Newsletter (doble opt-in)" };
const ATTRIBUTES = ["NOMBRE", "APELLIDOS", "EMPRESA", "TELEFONO", "SERVICIO", "ORIGEN",
  "PRIVACIDAD_VERSION", "PRIVACIDAD_FECHA", "COMERCIAL_SOLICITADO", "COMERCIAL_FECHA"];

async function call(path, method = "GET", body) {
  const res = await fetch(API + path, {
    method,
    headers: { "api-key": KEY, Accept: "application/json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data && (data.message || data.code)}`);
  return data;
}

async function main() {
  // Carpeta
  const folders = (await call("/contacts/folders?limit=50&offset=0")).folders || [];
  let folder = folders.find((f) => f.name === FOLDER);
  if (!folder) folder = { id: (await call("/contacts/folders", "POST", { name: FOLDER })).id };
  console.log(`✓ Carpeta «${FOLDER}» id=${folder.id}`);

  // Listas
  const lists = (await call("/contacts/lists?limit=50&offset=0")).lists || [];
  const ids = {};
  for (const [key, name] of Object.entries(LISTS)) {
    let list = lists.find((l) => l.name === name);
    if (!list) list = { id: (await call("/contacts/lists", "POST", { name, folderId: folder.id })).id };
    ids[key] = list.id;
    console.log(`✓ Lista «${name}» id=${list.id}`);
  }

  // Atributos (tipo texto, categoría normal)
  const existing = new Set(((await call("/contacts/attributes")).attributes || []).map((a) => a.name.toUpperCase()));
  for (const name of ATTRIBUTES) {
    if (existing.has(name)) { console.log(`· Atributo ${name} ya existe`); continue; }
    await call(`/contacts/attributes/normal/${name}`, "POST", { type: "text" });
    console.log(`✓ Atributo ${name} creado`);
  }

  console.log("\nCopie en worker/wrangler.toml [vars]:");
  console.log(`BREVO_LIST_LEADS      = "${ids.leads}"`);
  console.log(`BREVO_LIST_NEWSLETTER = "${ids.newsletter}"`);
  console.log("\nFalta crear manualmente en Brevo la plantilla de doble opt-in (etiqueta «optin»)");
  console.log("y copiar su ID en BREVO_DOI_TEMPLATE_ID. Ver docs/GUIA-DESPLIEGUE.md §6.");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
