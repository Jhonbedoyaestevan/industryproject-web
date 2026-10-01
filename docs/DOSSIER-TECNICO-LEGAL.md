# Dossier Técnico-Legal de Evidencia y Cumplimiento

**Proyecto:** Sitio web corporativo — Industry Project · industryproject.net (v1.1)
**Fecha:** 1 de octubre de 2026
**Arquitectura:** Eleventy 3 + Decap CMS 3 · GitHub Pages · Cloudflare Worker / Turnstile / Web Analytics · Brevo
**Jurisdicciones:** España/UE (principal) · EE. UU. – Florida · Colombia · Chile

> ⚠️ **Validación previa obligatoria.** Los textos legales son plantillas técnicas. Antes de publicar el sitio deben completarse los datos marcados como `[PENDIENTE]` en *Ajustes del sitio* y revisarse por un abogado colegiado en cada jurisdicción donde se capten clientes. El diseño también requiere validación comercial de marca (nombre, logotipo y colores) antes de su difusión externa.

---

## 1. Guía de uso técnica

### 1.1 Arquitectura

```text
                 ┌──────────────── Navegador del visitante ─────────────────┐
                 │  HTML/CSS/JS estático (CSP estricta, sin cookies propias)│
                 └───┬───────────────┬─────────────────┬───────────────────┘
                     │ GET           │ POST /contact   │ (solo con consentimiento)
                     ▼               ▼                 ▼
          ┌──────────────────┐  ┌──────────────────────────┐  ┌─────────────────────────┐
          │  GitHub Pages     │  │ Cloudflare Worker         │  │ Cloudflare Web Analytics│
          │  (_site compilado)│  │ bufete-edge               │  │ (sin cookies)           │
          └────────▲─────────┘  │  /contact → Turnstile ✓   │  └─────────────────────────┘
                   │ deploy      │           → Brevo (UE) ✉  │
          ┌────────┴─────────┐  │  /auth + /callback → OAuth│
          │  GitHub Actions   │  └──────▲────────────────────┘
          │  check-secrets    │         │ popup OAuth
          │  tests · build    │  ┌──────┴──────────────┐
          └────────▲─────────┘  │ /admin/ Decap CMS   │── commit .md ──► repositorio (main)
                   └────────────┤ (titular autenticado)│
                                └──────────────────────┘
```

**Flujo editorial.** Usted publica una noticia en `/admin/`. Decap hace un *commit* del archivo Markdown en `src/content/noticias/`. GitHub Actions recompila el sitio y lo publica en Pages en uno o dos minutos. No hay servidor ni base de datos que mantener.

### 1.2 Decisiones de arquitectura y por qué

| Requisito | Decisión | Justificación |
|---|---|---|
| Generador estático | **Eleventy 3** | Sin framework en cliente, salida HTML pura y compilación en menos de 1 s. Se integra de forma natural con Decap (Markdown + JSON). |
| Login del CMS en GitHub Pages | **Worker OAuth propio** | Decap con `backend: github` necesita un intercambio OAuth con secreto. Pages no ejecuta código de servidor, y `git-gateway` depende de Netlify Identity. |
| Formulario + captcha | **Worker + Turnstile + Brevo** | El plan gratuito de Web3Forms **bloquea envíos desde servidores o proxies**, lo que impide verificar Turnstile en servidor y reenviar después. Formspree no garantiza Turnstile en su plan gratuito. El Worker mantiene todos los secretos en servidor. Brevo trata los datos en la UE (Francia). |
| Analítica | **Cloudflare Web Analytics** | Gratuita y sin cookies ni *fingerprinting*. Plausible es de pago y Matomo requiere servidor propio. GA4 "sin cookies" sigue enviando pings y transfiere datos a Google. |
| Fuentes | **Fuentes del sistema** | Evita transferir la IP del visitante a Google Fonts (LG München, 20/01/2022, 3 O 17493/20). |
| Decap CMS | **Auto-alojado** (copiado desde `node_modules`) | Sin CDN de terceros en ejecución, lo que elimina un vector de cadena de suministro. La versión queda fijada por `package-lock.json`. |

### 1.3 Archivos principales

| Archivo | Función |
|---|---|
| `src/_includes/layouts/base.njk` | Plantilla maestra: **CSP**, metadatos SEO/OG, carga de JS externo. |
| `src/index.njk` | Portada: Hero/Perfil, Servicios, Proyectos, Noticias, Contacto. |
| `src/assets/css/style.css` | Diseño completo y adaptable a móvil. Sin estilos inline. |
| `src/assets/js/consent.js` | Gestor de consentimiento: bloqueo previo, GPC, caducidad a 12 meses y revocación. |
| `src/assets/js/contact.js` | Formulario: Turnstile diferido y envío JSON al Worker. |
| `src/admin/config.yml.njk` | **Configuración de Decap CMS**, generada como `/admin/config.yml`. |
| `worker/src/index.js` | Worker: OAuth para Decap, validación, verificación Turnstile y envío de correo. |
| `.github/workflows/deploy.yml` | CI/CD: escaneo de secretos, tests, compilación y publicación. |

### 1.4 Despliegue paso a paso

El despliegue completo lleva unos 45 minutos y todo se hace con planes gratuitos.

**A. Repositorio y GitHub Pages**
1. Cree un repositorio **público** en GitHub, por ejemplo `bufete-web`. El plan gratuito de Pages exige que sea público.
2. Suba el contenido de la carpeta:
   ```bash
   git init && git add . && git commit -m "Sitio v1.0"
   git branch -M main
   git remote add origin https://github.com/USUARIO/bufete-web.git
   git push -u origin main
   ```
3. En **Settings → Pages → Source**, elija **GitHub Actions**.
4. Active la **autenticación de doble factor** en su cuenta de GitHub. Es obligatoria en la práctica: esa cuenta es la llave del CMS.

**B. Cloudflare: Turnstile y analítica**
1. Cree una cuenta gratuita en Cloudflare.
2. En **Turnstile → Add widget**:
   - Modo **Managed**.
   - Dominios: `USUARIO.github.io` y, si lo usa, su dominio propio.
   - Copie la **Site Key** (pública) y la **Secret Key** (secreta).
   - *La restricción por dominio es la que protege la clave pública: no funciona en otros sitios.*
3. En **Web Analytics → Add a site**, introduzca su dominio, elija la instalación manual por JS y copie solo el **token** (32 caracteres hexadecimales).

**C. Brevo (correo transaccional, UE)**
1. Cree una cuenta gratuita (300 correos al día).
2. En **Senders & Domains**, verifique el remitente.
   - Se recomienda **un dominio propio** con SPF, DKIM y DMARC configurados.
   - Un remitente `@outlook.es` enviado a través de Brevo fallará la alineación DMARC y acabará en spam.
3. En **SMTP & API → API Keys**, genere una clave. Es **secreta**.

**D. GitHub OAuth App (login del CMS)**
1. Vaya a **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Configure:
   - Homepage URL: la URL del sitio.
   - **Authorization callback URL:** `https://bufete-edge.SU-SUBDOMINIO.workers.dev/callback`
3. Copie el **Client ID** y genere un **Client Secret**.

**E. Desplegar el Worker**
1. Edite `[vars]` en `worker/wrangler.toml`:
   - `ALLOWED_ORIGIN`
   - `ALLOWED_HOSTNAME`
   - `MAIL_TO`
   - `MAIL_FROM`
2. Despliegue y cargue los secretos:
   ```bash
   cd worker
   npx wrangler login
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put BREVO_API_KEY
   npx wrangler deploy
   ```
3. Compruebe que `https://bufete-edge.SU-SUBDOMINIO.workers.dev/health` responde `ok`.

**F. Variables públicas del sitio**
En GitHub → **Settings → Secrets and variables → Actions → pestaña *Variables*** (no *Secrets*: son valores públicos por diseño):

| Variable | Ejemplo |
|---|---|
| `SITE_URL` | `https://usuario.github.io/bufete-web` (o `https://sudominio.com`) |
| `PATH_PREFIX` | `/bufete-web/` (vacío si usa dominio propio o `usuario.github.io`) |
| `WORKER_URL` | `https://bufete-edge.su-subdominio.workers.dev` |
| `TURNSTILE_SITEKEY` | Site Key de Turnstile |
| `CF_ANALYTICS_TOKEN` | Token de Web Analytics |

Lance **Actions → Desplegar sitio → Run workflow**. A partir de ese momento, el panel queda disponible en `/admin/`.

**G. Dominio propio (recomendado)**
Configure un dominio en *Settings → Pages → Custom domain*. Con el DNS gestionado por Cloudflare en modo *proxied* y una **Transform Rule → Modify Response Header**, podrá añadir las cabeceras que Pages no permite: `Content-Security-Policy` con `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Permissions-Policy` y `Strict-Transport-Security`. Además, `robots.txt` solo es efectivo en la raíz de un dominio.

### 1.5 Vinculación segura del formulario y el captcha (entregable 3)

| Elemento | Dónde vive | ¿Público? | Protección |
|---|---|---|---|
| Site Key de Turnstile | Variable de Actions → HTML | Sí, por diseño | Restricción de dominios en el panel de Turnstile. El Worker valida además `hostname` y `action`. |
| Secret Key de Turnstile | `wrangler secret` | **No** | Cifrada en Cloudflare. Nunca llega al navegador ni al repositorio. |
| API key de Brevo | `wrangler secret` | **No** | Ídem. Solo la usa el Worker. |
| Client Secret de GitHub OAuth | `wrangler secret` | **No** | Ídem. El token resultante se entrega solo al origen exacto del sitio. |
| Token de Web Analytics | Variable de Actions → HTML | Sí, por diseño | Solo permite enviar balizas, no leer datos. Validado por regex antes de inyectarse. |

**Flujo de un envío:**
1. El navegador obtiene un token de Turnstile.
2. Hace `POST` en JSON al Worker.
3. El Worker comprueba, en orden: `Origin` exacto, `Content-Type`, tamaño, honeypot, validación de campos y consentimiento.
4. Verifica Turnstile en servidor (`siteverify` con secreto, IP, `hostname` y `action`).
5. Envía un correo en texto plano por Brevo, con el registro del consentimiento incluido.

**Alternativa sin Worker** (no recomendada; solo si no desea Cloudflare): Web3Forms con su hCaptcha gratuito integrado en el cliente. Su *access key* es pública por diseño, pero no hay verificación propia en servidor y añade un encargado más.

### 1.6 Bucle de autocorrección: hallazgos y correcciones aplicadas

| # | Hallazgo durante la revisión | Corrección |
|---|---|---|
| 1 | GitHub Pages **no permite cabeceras HTTP**, y `frame-ancestors`/`report-uri` son ignorados en `<meta>`. | CSP estricta vía `<meta>`. Cabeceras completas documentadas para el dominio propio vía Cloudflare (§1.4 G). Riesgo residual de *clickjacking* bajo: el sitio no tiene acciones autenticadas. |
| 2 | Decap con `backend: github` **no funciona solo** en Pages: necesita un intercambio OAuth con secreto. | Worker OAuth con `state` anti-CSRF (cookie `__Host-`, comparación en tiempo constante), *scope* `public_repo` **forzado en servidor** y `postMessage` al **origen exacto** (nunca `"*"`). |
| 3 | El plan gratuito de Web3Forms bloquea envíos desde servidor, lo que hacía inviable la verificación de Turnstile en servidor. | Worker propio con Brevo (UE). Sin claves en el cliente. |
| 4 | Cargar Decap desde `unpkg` supone riesgo de cadena de suministro. Decap usa `new Function` y wasm. | Decap auto-alojado. CSP relajada (`unsafe-eval`, `wasm-unsafe-eval`) **solo en `/admin/`**. El sitio público mantiene una CSP sin `unsafe-*`. |
| 5 | El Markdown de Eleventy admite HTML crudo y se procesaba con Nunjucks (riesgo de XSS e inyección de plantillas). | `markdown-it` con `html:false`, `markdownTemplateEngine:false` y `autoescape:true` en Nunjucks. |
| 6 | Las fuentes externas transferían la IP del visitante a Google. | Fuentes del sistema. |
| 7 | Los botones con `hidden` se mostraban porque `.btn{display:…}` anulaba el atributo. | Regla global `[hidden]{display:none!important}`. Verificado en navegador. |
| 8 | Los `permalink` de los datos de directorio no se interpolaban (`{{ page.fileSlug }}` aparecía literal en la URL). | Archivos `*.11tydata.js` con función. |
| 9 | El formulario podía filtrar datos en la URL si fallaba JS (envío GET por defecto). | Sin `action` ni `method`. El envío solo se realiza por `fetch` POST. |
| 10 | Inyección de cabeceras de correo (CRLF) a través del nombre. | Saneado de caracteres de control y asunto en una sola línea. Cubierto por test. |
| 11 | `robots.txt` solo es efectivo en la raíz de un dominio. | `<meta name="robots" content="noindex">` en `/admin/` y recomendación de dominio propio. |

**Verificación ejecutada:**
- 11/11 tests del Worker superados: origen, consentimiento, Turnstile (incluido hostname ajeno), honeypot, 413, 415, CRLF, OAuth `state` y `scope`, CSP con nonce.
- Escáner de secretos sin hallazgos.
- Compilación de producción con prefijo de ruta.
- Navegador sin cabeza (escritorio 1366 px y móvil 390 px): **0 violaciones de CSP**, banner visible antes de cualquier carga de analítica, registro `consent.v1` correcto y sin desbordamiento horizontal.

### 1.7 Matriz de seguridad OWASP Top 10 (2021)

| Riesgo | Control implementado |
|---|---|
| A01 Control de acceso | Panel `/admin/` solo accesible con OAuth de GitHub y permiso de escritura en el repositorio. CORS y `Origin` en lista blanca. `postMessage` con origen exacto. |
| A02 Fallos criptográficos | HTTPS obligatorio (Pages + `upgrade-insecure-requests`, HSTS en el Worker). Secretos cifrados en Cloudflare. |
| A03 Inyección / XSS | CSP sin `unsafe-inline`. Autoescape. Markdown sin HTML. `textContent` en JS. Correo en texto plano. Saneado CRLF. |
| A04 Diseño inseguro | Límite de 10 KB por envío. Honeypot. Turnstile. *Rate limiting* opcional en el Worker. |
| A05 Configuración | Cabeceras de seguridad en el Worker. CSP aislada en `/admin/`. `object-src 'none'`, `base-uri 'self'`. |
| A06 Componentes vulnerables | `npm ci` con lockfile. Ejecute `npm audit` y actualice Decap/Eleventy trimestralmente. Recomendado: Dependabot y fijar las *actions* por SHA. |
| A07 Autenticación | Delegada en GitHub (2FA recomendado). Sin contraseñas propias. |
| A08 Integridad | CI bloquea el despliegue si detecta secretos o fallan los tests. Decap auto-alojado. |
| A09 Registro | El Worker solo registra códigos de error, **nunca datos personales ni tokens**. |
| A10 SSRF | El Worker solo llama a tres URL fijas (GitHub, Turnstile, Brevo). Nunca a URL suministradas por el usuario. |

**Riesgos residuales aceptados:**
- El token de GitHub de Decap se guarda en el `localStorage` del navegador del administrador. Use solo dispositivos propios y cierre sesión en equipos compartidos.
- Sin dominio propio no es posible aplicar `frame-ancestors`.

---

## 2. Matriz de cumplimiento legal (Privacy & Legal Compliance Audit)

### 2.1 Jurisdicciones aplicadas y alcance

| Jurisdicción | Norma | ¿Aplica? | Fundamento |
|---|---|---|---|
| **España / UE** | RGPD (UE) 2016/679; LOPDGDD 3/2018; LSSI-CE 34/2002 | **Sí, plenamente** | Responsable establecido en España (art. 3.1 RGPD). |
| **EE. UU. – Florida** | Florida Digital Bill of Rights (Fla. Stat. §501.701 y ss.) | **Previsiblemente no** | Solo obliga a responsables con más de 1.000 M USD de ingresos anuales y criterios adicionales (§501.702). Se aplican sus buenas prácticas igualmente: GPC, no venta, no publicidad dirigida. |
| | FTC Act §5 (15 U.S.C. §45) | Sí | Prohíbe prácticas engañosas: las políticas describen fielmente el tratamiento real. |
| | FIPA (Fla. Stat. §501.171) | Sí | Notificación de brechas a residentes en Florida en 30 días. |
| | CAN-SPAM (15 U.S.C. §7701 y ss.) | Sí, si envía correo comercial | Remitente identificado, dirección postal y baja operativa. |
| | COPPA (15 U.S.C. §6501; 16 CFR 312) | No | Sitio no dirigido a menores de 13 años. Declarado en la política. |
| | TCPA / FTSA (Fla. Stat. §501.059) | **No en esta versión** | El sitio no realiza llamadas ni SMS automatizados. Será crítico si se añade WhatsApp Business automatizado o marcación. |
| **Colombia** | Ley 1581/2012; Decreto 1074/2015 (compila el Decreto 1377/2013) | Sí, para titulares en Colombia | Autorización previa, expresa e informada (arts. 9 y 12). Derechos del art. 8. Plazos de los arts. 14 y 15. Inscripción en el RNBD solo si existe establecimiento en Colombia que supere los umbrales. |
| **Chile** | Ley 19.628; **Ley 21.719** | Sí, para titulares en Chile | La reforma entra en vigor el 1 de diciembre de 2026: el sistema ya incorpora consentimiento, portabilidad y bloqueo. |

### 2.2 Mecanismos de captura del consentimiento

| Tratamiento | Mecanismo | Prueba (art. 7.1 RGPD) |
|---|---|---|
| Analítica | Banner con **Aceptar y Rechazar de igual peso visual**, sin casillas premarcadas, sin muro de cookies. El script **no se descarga** hasta aceptar. GPC se trata como rechazo. Revocable desde «Configurar cookies». Caduca a los 12 meses o al cambiar `version_politicas`. | Registro `consent.v1` (versión, marca temporal y origen de la decisión) en el dispositivo del usuario. |
| Formulario | Casilla obligatoria **no premarcada**, con enlace a la política y primera capa informativa junto al formulario (art. 11 LOPDGDD). El Worker **rechaza** cualquier envío sin `privacidad:true`. | Cada correo recibido incluye fecha UTC, versión de la política aceptada y estado de cada consentimiento. **Archive estos correos** durante el plazo de conservación. |
| Comunicaciones comerciales | Casilla **separada, opcional y no premarcada** (art. 21 LSSI-CE; consentimiento granular, cons. 32 y 43 RGPD). | Ídem: «Consentimiento comunicaciones: SÍ/NO». |

### 2.3 Mapeo de datos (Registro de Actividades del Tratamiento, art. 30 RGPD — base)

| Actividad | Categorías de datos | Interesados | Finalidad explícita | Base legal | Encargados | Transferencia internacional | Conservación |
|---|---|---|---|---|---|---|---|
| Contacto web | Identificativos, contacto, profesionales, contenido del mensaje | Potenciales clientes | Responder la consulta y preparar una propuesta | Art. 6.1.a y 6.1.b RGPD | Cloudflare (Worker), Brevo, proveedor de buzón | Cloudflare (EE. UU., DPF + CCT) | 12 meses / plazos legales si hay encargo |
| Comunicaciones | Nombre y correo | Contactos que optan por recibirlas | Envío de novedades profesionales | Art. 6.1.a RGPD; art. 21 LSSI | Brevo (si se usa para campañas) | No (UE) | Hasta la baja |
| Anti-spam | IP y señales del navegador | Usuarios del formulario | Seguridad | Art. 6.1.f RGPD (cons. 49) | Cloudflare | EE. UU. (DPF) | No conservado por el responsable |
| Analítica | Datos de navegación agregados | Visitantes que consienten | Medición de audiencia | Art. 6.1.a RGPD; art. 22.2 LSSI | Cloudflare | EE. UU. (DPF) | Agregado |
| Alojamiento | IP en registros del servidor | Visitantes | Servir el sitio | Art. 6.1.f RGPD | GitHub | EE. UU. (DPF) | Según GitHub |

**Minimización (art. 5.1.c RGPD).** El formulario solo exige nombre, correo, servicio y mensaje. Empresa y teléfono son opcionales. **No se recoge la IP** en el registro del consentimiento: no es necesaria para la prueba. **No hay base de datos propia**, lo que reduce la superficie de brecha.

### 2.4 Evidencia normativa (artículo ↔ implementación)

| Norma y artículo | Exigencia | Dónde se cumple |
|---|---|---|
| RGPD art. 5.1.c, 25 | Minimización y privacidad desde el diseño y por defecto | Campos mínimos, analítica desactivada por defecto, Turnstile diferido, sin base de datos. |
| RGPD art. 6.1.a/b/f | Base jurídica por tratamiento | `/privacidad/` §2, primera capa del formulario. |
| RGPD art. 7.1 y 7.3 | Prueba del consentimiento y revocación tan fácil como otorgarlo | Registro en correo y en `consent.v1`. Botón «Configurar cookies» en el pie. |
| RGPD art. 12.3, 13 | Información transparente y plazos de respuesta | `/privacidad/` completa. |
| RGPD art. 15–22 | Derechos ARSOPL | `/privacidad/` §5, con correo dedicado. |
| RGPD art. 28 | Contratos de encargo | **Acción:** aceptar los DPA de Cloudflare, Brevo y GitHub (son estándar, en sus paneles o términos). |
| RGPD art. 30 | Registro de actividades | Tabla §2.3 como base del RAT. |
| RGPD art. 32 | Seguridad | Matriz OWASP §1.7. |
| RGPD art. 44–46 | Transferencias | Decisión (UE) 2023/1795 (DPF) y Decisión (UE) 2021/914 (CCT). |
| LOPDGDD art. 7 | Edad mínima de 14 años | `/privacidad/` §7. |
| LOPDGDD art. 11 | Información por capas | Tabla «Información básica» junto al formulario. |
| LSSI-CE art. 10 | Datos del prestador (incluido el colegio profesional si es profesión regulada) | `/aviso-legal/`, alimentado desde *Ajustes del sitio*. |
| LSSI-CE art. 21 | Comunicaciones comerciales solo con autorización | Casilla opcional separada. |
| LSSI-CE art. 22.2 | Consentimiento para dispositivos de almacenamiento no exentos | Banner con bloqueo previo. `/cookies/`. |
| Guía AEPD cookies (2023) / Directrices CEPD 03/2022 | Rechazar al mismo nivel que aceptar, sin patrones oscuros | Botones idénticos (clase `.btn-consent`). |
| Ley 1581 arts. 8, 9, 12, 14, 15, 26 | Autorización, derechos, plazos y transferencias | `/privacidad/` Anexo II y casilla de autorización. |
| Ley 21.719 (Chile) | Consentimiento, portabilidad, bloqueo, Agencia | `/privacidad/` Anexo III. |
| Fla. Stat. §501.171 (FIPA) | Notificación de brechas en 30 días | `/privacidad/` Anexo I. |
| FDBR (buenas prácticas) / GPC | Opt-out universal | `consent.js`: `navigator.globalPrivacyControl`. |
| CAN-SPAM §7704 | Identificación y baja | Anexo I y cláusula C (§2.5). |
| FTC Act §5 | Veracidad de las declaraciones de privacidad | Las políticas describen exactamente lo que hace el código. **Mantenga esta coherencia si añade herramientas.** |

### 2.5 Cláusulas listas para desplegar

Las políticas completas ya están desplegadas en `/aviso-legal/`, `/privacidad/`, `/cookies/` y `/terminos/`, alimentadas desde *Ajustes del sitio*. Cláusulas complementarias para otros canales:

**A. Pie de correo de respuesta a consultas (RGPD art. 13 / LOPDGDD art. 11)**
> Responsable: [Titular], [NIF]. Finalidad: atender su consulta y, en su caso, la relación profesional. Legitimación: consentimiento y medidas precontractuales. Destinatarios: no se ceden datos salvo obligación legal. Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad en [correo de privacidad]. Información adicional: [URL]/privacidad/

**B. Cláusula de autorización para hojas de encargo con clientes de Colombia (Ley 1581, art. 9)**
> Autorizo de manera previa, expresa e informada a [Titular] para tratar mis datos personales con la finalidad de ejecutar el encargo profesional, facturar y cumplir obligaciones legales, conforme a su Política de Tratamiento disponible en [URL]/privacidad/. Conozco mis derechos de conocer, actualizar, rectificar, suprimir mis datos y revocar esta autorización (art. 8 Ley 1581 de 2012), que puedo ejercer en [correo].

**C. Pie obligatorio de correo comercial (art. 21 LSSI-CE / CAN-SPAM §7704)**
> Recibe este correo porque aceptó recibir comunicaciones de [Marca] el [fecha]. [Titular] · [Domicilio postal]. Si no desea recibir más mensajes, responda «BAJA» o pulse aquí: [enlace de baja operativo]. Atenderemos su solicitud en un máximo de 10 días hábiles.

**D. Autorización de publicación de un proyecto (cliente)**
> [Cliente] autoriza a [Titular] a publicar en su web y redes profesionales una descripción del proyecto «[nombre]», [con/sin] mención de su denominación social y [con/sin] imágenes, excluyendo información confidencial, datos personales de trabajadores y planos. Esta autorización puede revocarse por escrito en cualquier momento, con retirada del contenido en un plazo de 15 días.

### 2.6 Acciones pendientes antes de la puesta en producción

| Prioridad | Acción |
|---|---|
| 🔴 | Completar en *Ajustes del sitio*: **NIF**, **domicilio**, forma jurídica y, si procede, **colegio profesional y título con su Estado de expedición u homologación** (art. 10.1.e LSSI-CE). Para el servicio de **peritajes**, el perito que firme ante tribunales debe poseer titulación oficial en la materia (art. 340 LEC). Conviene definir en la web qué profesional del bufete firma cada tipo de informe. |
| 🔴 | Aceptar los **DPA** de Cloudflare, Brevo y GitHub, y archivarlos. |
| 🔴 | Revisión jurídica de los textos por un abogado colegiado. Especialmente los anexos de Colombia y Chile si se captan clientes allí. |
| 🟠 | Configurar un dominio propio con proxy de Cloudflare y cabeceras completas (§1.4 G). Usar un remitente de correo del dominio propio. |
| 🟠 | Activar el *rate limiting* del Worker (bloque comentado en `wrangler.toml`). |
| 🟠 | Si el bufete es una sociedad: actualizar el titular, el registro mercantil y la forma jurídica. Valorar si procede un DPD (art. 37 RGPD; art. 34 LOPDGDD). Con este volumen y tipo de datos, previsiblemente no procede. |
| 🟢 | Activar Dependabot y fijar las GitHub Actions por SHA. Revisar dependencias cada trimestre. |
| 🟢 | Subir la foto profesional y sustituir los contenidos de ejemplo desde `/admin/`. |
| 🟢 | Si en el futuro se añaden píxeles publicitarios, chat de IA o WhatsApp automatizado, **antes de activarlos** deben actualizarse la política, el banner (nueva categoría) y el análisis TCPA/FTSA. |

---

## 3. Adenda v1.1 — Dominio industryproject.net e integración con Brevo

> La guía operativa completa está en `docs/GUIA-DESPLIEGUE.md`. Esta adenda **sustituye** a los §1.4 y §1.5 en lo relativo a URLs (`api.industryproject.net` en lugar de `*.workers.dev`) y al flujo de Brevo.

### 3.1 Cambios técnicos

| Componente | v1.0 | v1.1 |
|---|---|---|
| Dominio | `usuario.github.io` | `industryproject.net` (Pages + proxy de Cloudflare). Worker en `api.industryproject.net` (dominio personalizado). |
| Cabeceras HTTP | Solo CSP en `<meta>` | **Response Header Transform Rules** aplicadas por `infra/cloudflare/apply.mjs`: CSP con `frame-ancestors 'none'`, HSTS, X-Frame-Options, Permissions-Policy, COOP y `X-Robots-Tag` en `/admin`. |
| Ajustes de zona | — | SSL Full (strict), Always HTTPS, TLS ≥1.2, sin Rocket Loader ni ofuscación de email. |
| Brevo | Solo notificación interna | 1) Notificación interna. 2) **Alta/actualización en la lista «Web · Contactos»**. 3) **Acuse transaccional** al remitente. 4) **Doble opt-in** a «Web · Newsletter» si se marca la casilla. 5) **Purga automática** diaria por plazo de conservación. |
| Resiliencia | Fallo de correo = lead perdido | Basta con que funcione la notificación **o** el alta en la lista. Acuse y doble opt-in se ejecutan tras responder (`ctx.waitUntil`). |
| Orígenes | Uno | Lista (`ALLOWED_ORIGINS`, `ALLOWED_HOSTNAMES`). El token OAuth solo se entrega al **primer** origen. |
| CI | Sitio | + `deploy-worker.yml` (tests y despliegue del Worker; secretos de aplicación fuera de GitHub). |
| Tests | 11 | **19/19**: alta en lista, doble opt-in, acuse sin contenido del usuario, resiliencia, reintento sin atributos, `www`, purga (simulación y real), saneado del nombre. |

### 3.2 Bucle de autocorrección v1.1

| # | Hallazgo | Corrección |
|---|---|---|
| 12 | Un acuse que reproduzca el mensaje o el servicio permite usar el formulario como **relé de spam** hacia terceros (se escribe el correo de la víctima y un texto publicitario). | El acuse no contiene datos del usuario salvo el nombre de pila validado (solo letras, máximo 30 caracteres). Turnstile y *rate limiting* limitan el volumen. |
| 13 | Añadir la newsletter directamente desde el formulario permitiría **suscribir a terceros** y no prueba la voluntad del titular. | La newsletter solo se activa por **doble opt-in**. Si no hay plantilla DOI configurada, no se suscribe a nadie. |
| 14 | Brevo rechaza atributos inexistentes, y un 400 haría perder el lead. | Script idempotente `brevo-setup.mjs` y **reintento automático sin atributos**. |
| 15 | La conservación indefinida en el CRM vulneraría el art. 5.1.e RGPD. | Cron diario que borra solo contactos que (a) están únicamente en «Web · Contactos», (b) superan `RETENTION_DAYS` y (c) **no** figuran como baja. Las bajas se conservan para respetar la oposición. Arranca en modo simulación. |
| 16 | Brevo puede bloquear IP desconocidas, y los Workers no tienen IP fija. | Instrucción explícita de desactivar el bloqueo, con mitigación compensatoria: clave solo cifrada en el Worker y rotación. |
| 17 | La inyección automática de Web Analytics o los scripts de Bot Fight Mode en una zona proxied **saltarían el banner** o romperían la CSP. | Advertencia en la guía (§7 y §9). La carga de la analítica sigue dependiendo exclusivamente de `consent.js`. |
| 18 | `COOP: same-origin` en `/admin` cortaría `window.opener` y rompería el login OAuth. | COOP solo en el sitio público. `/admin` sin COOP. |
| 19 | El correo `privacidad@industryproject.net` desbordaba la tabla informativa en móvil (398 px > 390 px). | `min-width: 0` en la cuadrícula y `overflow-wrap: anywhere` en las tablas. Verificado: 390 px en las 6 páginas. |
| 20 | Dos registros SPF (Email Routing + Brevo) invalidan ambos (RFC 7208 §3.2). | Instrucción de fusionarlos en un único registro. |

### 3.3 Matriz de cumplimiento — nuevos tratamientos

| Tratamiento | Base jurídica | Evidencia normativa | Implementación |
|---|---|---|---|
| Alta en «Web · Contactos» (CRM) | Art. 6.1.a y 6.1.b RGPD | Art. 5.1.c (minimización: el mensaje no se guarda en Brevo); art. 5.1.e (conservación de 12 meses con borrado automático); art. 28 (Brevo, encargado UE). Ley 1581: arts. 4.d y 17 | `upsertLead()`, `purgeExpiredLeads()` |
| Acuse de recibo | Art. 6.1.b RGPD (medida precontractual a petición del interesado) | Sin contenido comercial: no es comunicación comercial (art. 21 LSSI-CE no aplica) | `sendConfirmation()` |
| Newsletter | Art. 6.1.a RGPD; **art. 21.1 LSSI-CE** | Doble opt-in como prueba (art. 7.1 RGPD). Baja en cada envío (art. 21.2 LSSI-CE; CAN-SPAM §7704). Lista de exclusión conservada (art. 21.2 RGPD) | `requestNewsletterDOI()` + plantilla `optin` |
| Lista de exclusión | Art. 6.1.c y 6.1.f RGPD; art. 23 LOPDGDD | Conservación mínima necesaria para respetar la oposición | La purga excluye `emailBlacklisted` |
| Cabeceras HTTP | Art. 32 RGPD (seguridad del tratamiento) | OWASP A05; mitigación de *clickjacking* | `infra/cloudflare/apply.mjs` |

**Registro de actividades (art. 30 RGPD):** añadir al RAT del §2.3 la actividad «Gestión de contactos comerciales y newsletter» con los datos de esta tabla.

**Políticas actualizadas a v1.1** (al cambiar la versión, el banner vuelve a pedir el consentimiento):
- Privacidad: tratamientos de CRM, acuse y doble opt-in; borrado automático; lista de exclusión.
- Formulario: casilla de newsletter con aviso de doble opt-in y finalidad ampliada.
- Nueva página `/suscripcion-confirmada/`, con `noindex`.

### 3.4 Acciones pendientes añadidas

| Prioridad | Acción |
|---|---|
| 🔴 | Aceptar el DPA de Brevo y archivarlo. Desactivar el seguimiento de aperturas y clics en los correos transaccionales, o informar de él y obtener consentimiento. |
| 🔴 | Revisar los registros de la primera purga en modo simulación antes de activar `RETENTION_DRY_RUN="false"`. |
| 🟠 | Mover manualmente a una lista «Clientes» a quien formalice un encargo: la purga solo afecta a contactos que estén **únicamente** en «Web · Contactos». |
| 🟠 | Subir DMARC a `p=quarantine` tras dos semanas sin incidencias. |
| 🟢 | La marca «Industry Project» se ha tomado del dominio: valídela comercialmente y ajústela en *Ajustes del sitio* si procede. |

---
*Documento técnico generado como plantilla reutilizable para sitios estáticos con Decap CMS. Requiere validación comercial y de formato corporativo antes de su envío a terceros.*
