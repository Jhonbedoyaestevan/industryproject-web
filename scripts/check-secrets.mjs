// Escáner de secretos previo a commit/CI: `npm run check:secrets`
// Busca patrones de credenciales conocidas en el código fuente versionado.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "worker", "infra", "scripts", ".github", "eleventy.config.js", "README.md", "docs"];
const SKIP = /node_modules|_site|\.git\/|\.wasm$|\.(png|jpe?g|webp|gif|ico)$/i;
const PATTERNS = [
  ["GitHub token", /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ["Turnstile secret real", /\b0x4[A-Za-z0-9_-]{30,}\b/],
  ["Brevo API key", /\bxkeysib-[a-f0-9]{40,}/i],
  ["Clave privada", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Secreto asignado", /(client_secret|api[_-]?key|secret)\s*[:=]\s*["'][A-Za-z0-9_\-]{24,}["']/i],
];

function* walk(p) {
  let st; try { st = statSync(p); } catch { return; }
  if (SKIP.test(p)) return;
  if (st.isDirectory()) for (const f of readdirSync(p)) yield* walk(join(p, f));
  else yield p;
}

let findings = 0;
for (const root of ROOTS) for (const file of walk(root)) {
  if (file.endsWith(".dev.vars.example") || file.includes("worker/test/") || file.endsWith("check-secrets.mjs")) continue;
  const text = readFileSync(file, "utf8");
  for (const [name, re] of PATTERNS) if (re.test(text)) { console.error(`✗ ${name} en ${file}`); findings++; }
}
if (findings) { console.error(`\n${findings} posible(s) secreto(s). Abortando.`); process.exit(1); }
console.log("✓ Sin secretos detectados en el código fuente.");
