# Industry Project — industryproject.net

Sitio estático (Eleventy 3) alojado gratis en **GitHub Pages** tras **Cloudflare** (dominio `industryproject.net`), con gestión de **Noticias, Proyectos y Ajustes** desde **Decap CMS** en `/admin/`, formulario protegido con **Cloudflare Turnstile** y analítica **Cloudflare Web Analytics sin cookies** activada solo con consentimiento.

```text
industryproject-web/
├── .github/workflows/deploy.yml   # Compila y publica en Pages (CI con escaneo de secretos y tests)
├── .github/workflows/deploy-worker.yml  # Tests + despliegue del Worker (opcional)
├── docs/                          # GUIA-DESPLIEGUE.md · DOSSIER-TECNICO-LEGAL.md
├── infra/cloudflare/apply.mjs     # Ajustes de zona + reglas de cabeceras de seguridad (API)
├── eleventy.config.js             # Configuración del generador (autoescape, markdown sin HTML)
├── package.json / package-lock.json
├── scripts/check-secrets.mjs      # Escáner de credenciales (bloquea el despliegue si encuentra una)
├── src/
│   ├── _data/
│   │   ├── env.js                 # Variables de entorno públicas (sitekey, worker, analítica)
│   │   └── site.json              # Perfil, servicios, redes y datos legales (editable desde el CMS)
│   ├── _includes/
│   │   ├── layouts/               # base.njk (CSP), post.njk, legal.njk
│   │   └── partials/              # header, footer, banner de cookies, formulario, tarjetas, iconos
│   ├── admin/
│   │   ├── index.njk              # Panel Decap CMS (auto-alojado, CSP propia)
│   │   └── config.yml.njk         # → /admin/config.yml (configuración del CMS)
│   ├── assets/{css,js,img,uploads}
│   ├── content/{noticias,proyectos}/*.md   # Contenido que crea el CMS
│   ├── legal/                     # Aviso legal, privacidad, cookies, términos
│   ├── pages/                     # Listados paginados de noticias y proyectos
│   ├── index.njk  404.njk  robots.njk  sitemap.njk
└── worker/                        # Worker en api.industryproject.net: OAuth Decap + /contact + cron
    ├── src/index.js               # Router, validación, Turnstile, OAuth
    ├── src/brevo.js               # Lista de contactos, doble opt-in, acuse, purga por retención
    ├── scripts/brevo-setup.mjs    # Crea listas y atributos en Brevo
    ├── test/worker.test.js
    └── wrangler.toml
```

## Uso diario

1. Entre en `https://SU-SITIO/admin/` y pulse **Login with GitHub**.
2. Abra **Noticias**, pulse **Nueva Noticia**, rellene los campos y pulse **Publicar**.
3. En 1–2 minutos GitHub Actions recompila y la noticia aparece publicada.

Su foto, titular, servicios y redes se editan en **Ajustes del sitio**.

## Desarrollo local

```bash
npm ci
npm start              # http://localhost:8080
npx decap-server       # (otra terminal) CMS local sin GitHub en http://localhost:8080/admin/
npm test && npm run check:secrets
```

**Despliegue paso a paso:** `docs/GUIA-DESPLIEGUE.md` · **Cumplimiento:** `docs/DOSSIER-TECNICO-LEGAL.md`.
