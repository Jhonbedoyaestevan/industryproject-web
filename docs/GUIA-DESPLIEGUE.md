# Guía de despliegue paso a paso — industryproject.net

**Versión:** 1.1 · 1 de octubre de 2026
**Tiempo estimado:** 1,5–2 horas, más la propagación de DNS (de minutos a 24 h).
**Coste:** 0 €. Todo funciona con planes gratuitos; solo paga el dominio.

| Pieza | Dónde vive | URL |
|---|---|---|
| Sitio web | GitHub Pages detrás de Cloudflare | `https://industryproject.net` |
| Panel de contenidos | Decap CMS | `https://industryproject.net/admin/` |
| Backend (OAuth + formulario + Brevo) | Cloudflare Worker | `https://api.industryproject.net` |
| Correo entrante | Cloudflare Email Routing → su Outlook | `contacto@` / `privacidad@industryproject.net` |
| Correo saliente y contactos | Brevo (UE) | Remitente `no-responder@industryproject.net` |

> **Regla de oro de los secretos.** Las claves privadas (Brevo, Turnstile secret, GitHub client secret, tokens de Cloudflare) **nunca** se escriben en archivos del proyecto, en el chat ni en capturas de pantalla. Se introducen solo en los formularios cifrados de Cloudflare o GitHub y en la terminal cuando el comando las pide. Si alguna se expone por error, revóquela y genere otra.

---

## 0. Requisitos en su ordenador

**Windows (PowerShell):**
```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
# Cierre y vuelva a abrir PowerShell, y compruebe:
node -v     # v22 o superior
git --version
```

**macOS:** instale Node LTS desde nodejs.org y ejecute `xcode-select --install` para tener Git.

Necesitará además tres cuentas:
- **GitHub**, con la verificación en dos pasos activada (*Settings → Password and authentication*).
- **Cloudflare**.
- **Brevo**.

---

## 1. Subir el proyecto a GitHub

1. Descomprima `industryproject-web.zip`. Obtendrá la carpeta `industryproject-web`.
2. En github.com pulse **New repository** y configúrelo así:
   - Nombre: `industryproject-web`.
   - Visibilidad: **Public** (necesario para Pages gratuito).
   - **No** marque «Add a README»: el repositorio debe nacer vacío.
3. Abra PowerShell en la carpeta descomprimida y ejecute:
   ```powershell
   cd $HOME\Downloads\industryproject-web     # ajuste la ruta
   npm ci                                      # instala dependencias exactas (lockfile)
   npm test                                    # debe mostrar: pass 19, fail 0
   npm run check:secrets                       # debe mostrar: Sin secretos detectados
   git init
   git add .
   git commit -m "Sitio industryproject.net v1.1"
   git branch -M main
   git remote add origin https://github.com/SU-USUARIO/industryproject-web.git
   git push -u origin main
   ```
   La primera vez, Git abrirá el navegador para autenticarse en GitHub.

**Alternativa sin terminal:** con **GitHub Desktop**, use *File → Add local repository*, elija la carpeta y pulse *Publish repository*, desmarcando «Keep this code private».
*Evite subir los archivos arrastrándolos a la web de GitHub: el explorador puede omitir la carpeta oculta `.github`, y sin ella no hay despliegue automático.*

4. En el repositorio, vaya a **Settings → Pages → Build and deployment → Source** y elija **GitHub Actions**.

---

## 2. Llevar el dominio a Cloudflare

1. En Cloudflare, pulse **Add a domain**, escriba `industryproject.net` y elija el plan **Free**.
2. Cloudflare le mostrará **dos nameservers**. Sustituya los actuales por esos dos en el panel de su registrador (donde compró el dominio).
3. Espere a que el estado de la zona pase a **Active**. Cloudflare le avisará por correo.
4. Copie el **Zone ID** (página *Overview*, columna derecha). Lo necesitará en el paso 9.

---

## 3. Registros DNS del sitio

En **DNS → Records**, borre cualquier registro A, AAAA o CNAME heredado para `@` y `www`, y cree los siguientes. Durante la emisión del certificado deben estar en modo **DNS only (nube gris)**.

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |
| AAAA | `@` | `2606:50c0:8000::153` | DNS only |
| AAAA | `@` | `2606:50c0:8001::153` | DNS only |
| AAAA | `@` | `2606:50c0:8002::153` | DNS only |
| AAAA | `@` | `2606:50c0:8003::153` | DNS only |
| CNAME | `www` | `SU-USUARIO.github.io` | DNS only |

*El registro de `api` no se crea a mano: lo crea el Worker en el paso 8.*

---

## 4. Conectar el dominio en GitHub Pages

1. **Verifique el dominio** para impedir que otra cuenta lo secuestre:
   - En el **perfil** de GitHub, vaya a *Settings → Pages → Add a domain* y escriba `industryproject.net`.
   - Cree en Cloudflare el registro **TXT** que GitHub indica (`_github-pages-challenge-SU-USUARIO`).
   - Vuelva a GitHub y pulse **Verify**.
2. En el **repositorio**, vaya a *Settings → Pages → Custom domain*, escriba `industryproject.net` y pulse **Save**. Espere a que aparezca «DNS check successful».
3. Espere a que GitHub emita el certificado (de 15 minutos a unas horas). Después marque **Enforce HTTPS**.
4. En Cloudflare, cambie a **Proxied (nube naranja)** los 9 registros del paso 3.

GitHub redirige `www` a la raíz automáticamente.

---

## 5. Correo del dominio

### 5.1 Correo entrante (Cloudflare Email Routing)

1. En Cloudflare, vaya a **Email → Email Routing → Get started**. Acepte los registros MX y SPF que propone.
2. En **Destination addresses**, añada `jhon.ingeniero@outlook.es` y confírmelo desde su buzón.
3. En **Routing rules**, cree estas reglas:
   - `contacto@industryproject.net` → su Outlook.
   - `privacidad@industryproject.net` → su Outlook.

### 5.2 Correo saliente (Brevo)

1. En Brevo, vaya a **Senders, Domains & Dedicated IPs → Domains → Add a domain** y escriba `industryproject.net`.
2. Copie en Cloudflare DNS **exactamente** los registros que Brevo muestre (código de verificación TXT y registros DKIM), en modo **DNS only**.
3. **SPF: solo puede existir un registro.** Email Routing ya creó uno. Si Brevo pide incluir el suyo, **edite** el existente en lugar de crear otro, por ejemplo:
   `v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all`
4. **DMARC:** cree un registro TXT con nombre `_dmarc` y este contenido:
   `v=DMARC1; p=none; rua=mailto:privacidad@industryproject.net`
   Tras dos semanas sin incidencias en los informes, cambie `p=none` por `p=quarantine`.
5. Pulse **Authenticate** en Brevo hasta ver el dominio verificado.
6. En **Senders**, cree el remitente `no-responder@industryproject.net`, con nombre «Industry Project».

---

## 6. Preparar Brevo

### 6.1 Clave de API y seguridad de IP

1. Vaya a **SMTP & API → API Keys → Generate a new API key** y llámela `industryproject-worker`. **Cópiela una sola vez**: la usará en los pasos 6.2 y 8.
2. Vaya a **Security → Authorised IPs** y **desactive el bloqueo de IP desconocidas** para la API.
   - *Motivo:* los Workers de Cloudflare no tienen IP fija, y con el bloqueo activo Brevo rechazaría las llamadas con error 401.
   - *Mitigación:* la clave solo existe cifrada en el Worker y se rota si hay sospecha de fuga.
3. Acepte el **acuerdo de tratamiento de datos (DPA)** de Brevo en la sección legal o de seguridad de su cuenta, y archive una copia.

### 6.2 Crear listas y atributos automáticamente

Desde la carpeta del proyecto, ejecute:
```powershell
$env:BREVO_API_KEY = Read-Host "Pegue la clave de Brevo"   # no queda en el historial ni en disco
node worker/scripts/brevo-setup.mjs
Remove-Item Env:BREVO_API_KEY
```
El script crea la carpeta, las listas **«Web · Contactos»** y **«Web · Newsletter (doble opt-in)»** y los atributos `NOMBRE`, `APELLIDOS`, `EMPRESA`, `TELEFONO`, `SERVICIO`, `ORIGEN`, `PRIVACIDAD_VERSION`, `PRIVACIDAD_FECHA`, `COMERCIAL_SOLICITADO` y `COMERCIAL_FECHA`.

Al final **imprime los dos ID de lista**: anótelos para el paso 8.

### 6.3 Plantilla de doble opt-in (obligatoria para la newsletter)

1. En **Campaigns → Templates → Create a new template**, diseñe un correo breve: «Confirme su suscripción a Industry Project».
2. Añada un botón **Confirmar suscripción** cuyo enlace sea exactamente `{{ doubleoptin }}`.
3. En la configuración de la plantilla, añada la **etiqueta (tag) `optin`** y actívela.
4. Anote el **ID** de la plantilla (aparece en la URL o en el listado).

*Sin esta plantilla el Worker no suscribe a nadie a la newsletter. Es intencionado: así nunca se envían comunicaciones comerciales sin confirmación.*

### 6.4 Plantilla de acuse (opcional)

El Worker ya incluye un acuse de recibo en HTML y texto. Si prefiere diseñarlo en Brevo:
1. Cree una plantilla transaccional y use `{{ params.NOMBRE }}` para el saludo.
2. Anote su ID para `BREVO_TEMPLATE_CONFIRMACION`.

Por seguridad, el Worker solo envía el nombre de pila saneado.

### 6.5 Seguimiento de aperturas

En la configuración de correo transaccional de Brevo, desactive el **seguimiento de aperturas y clics** si su plan lo permite. Los píxeles de seguimiento en el correo requieren consentimiento (art. 22.2 LSSI-CE).

---

## 7. Cloudflare: Turnstile, analítica y OAuth de GitHub

**Turnstile**
1. Vaya a **Turnstile → Add widget**.
2. Configure:
   - Nombre: `industryproject`.
   - Hostnames: `industryproject.net` y `www.industryproject.net`.
   - Modo: **Managed**.
3. Copie la **Site Key** (pública) y la **Secret Key** (secreta, para el paso 8).

**Web Analytics**
1. Vaya a **Analytics & Logs → Web Analytics → Add a site** y escriba `industryproject.net`.
2. ⚠️ **No active la inyección automática** («Enable» / *automatic setup*) de la zona proxied. Inyectaría el script **sin pasar por el banner de consentimiento** y vulneraría el art. 22.2 LSSI-CE.
3. Elija la instalación manual por JS y copie **solo el token** (32 caracteres).

**GitHub OAuth App** (login del CMS)
1. En GitHub, vaya a *Settings → Developer settings → OAuth Apps → New OAuth App* y rellene:
   - Application name: `Industry Project CMS`.
   - Homepage URL: `https://industryproject.net`.
   - **Authorization callback URL:** `https://api.industryproject.net/callback`.
2. Copie el **Client ID** y pulse **Generate a new client secret**. Copie el secreto, que solo se muestra una vez.

---

## 8. Desplegar el Worker y cargar los secretos cifrados

1. Edite `worker/wrangler.toml`, sección `[vars]`, con los ID obtenidos:
   ```toml
   BREVO_LIST_LEADS      = "ID de «Web · Contactos»"
   BREVO_LIST_NEWSLETTER = "ID de «Web · Newsletter»"
   BREVO_DOI_TEMPLATE_ID = "ID de la plantilla optin"
   ```
   *Estos ID no son secretos: pueden quedar en el repositorio.*

2. Autentíquese en Cloudflare y cargue los **cuatro secretos**:
   ```powershell
   cd worker
   npx wrangler login                          # abre el navegador; autorice el acceso
   npx wrangler secret put GITHUB_CLIENT_ID     # pegue el valor cuando lo pida y pulse Enter
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put TURNSTILE_SECRET
   npx wrangler secret put BREVO_API_KEY
   npx wrangler deploy
   npx wrangler secret list                    # muestra solo los NOMBRES, nunca los valores
   ```
   Cómo funcionan los secretos:
   - Cada `secret put` cifra el valor en Cloudflare. Ni usted ni nadie puede volver a leerlo, ni desde el panel ni con la API.
   - Para **rotar** un secreto, ejecute de nuevo el mismo comando con el valor nuevo.
   - Si `wrangler secret put` indica que el Worker aún no existe, ejecute primero `npx wrangler deploy` y repita los comandos de secretos.

   **Alternativa desde el panel web:** en *Workers & Pages → industryproject-edge → Settings → Variables and Secrets → Add*, elija el tipo **Secret** (el valor queda cifrado y oculto). Use siempre el tipo *Secret*, nunca *Text*, para estas cuatro claves.

3. Compruebe que `https://api.industryproject.net/health` responde `ok`. El primer certificado puede tardar unos minutos.

4. **(Opcional) Despliegue automático del Worker desde GitHub.**
   - En el repositorio, vaya a *Settings → Secrets and variables → Actions → **Secrets** → New repository secret* y cree:
     - `CLOUDFLARE_API_TOKEN`: token con la plantilla «Edit Cloudflare Workers».
     - `CLOUDFLARE_ACCOUNT_ID`: ID de su cuenta, visible en el panel de Cloudflare.
   - A partir de ahí, cada cambio en `worker/` se prueba y despliega solo (`deploy-worker.yml`).
   - Los cuatro secretos del Worker no pasan por GitHub.

---

## 9. Aplicar las cabeceras de seguridad y los ajustes de zona

1. En Cloudflare, vaya a **My Profile → API Tokens → Create Token → Custom token**:
   - Permisos: **Zone → Zone Settings → Edit** y **Zone → Transform Rules → Edit**.
   - Recursos: *Specific zone → industryproject.net*.
   - TTL: un día (es un token de un solo uso).
2. Ejecute:
   ```powershell
   node infra/cloudflare/apply.mjs --dry-run              # revise qué se aplicará
   $env:CF_API_TOKEN = Read-Host "Token de Cloudflare"
   $env:CF_ZONE_ID   = "SU-ZONE-ID"
   node infra/cloudflare/apply.mjs
   Remove-Item Env:CF_API_TOKEN
   ```
   El script deja configurado:
   - **Cifrado:** SSL **Full (strict)**, HTTPS obligatorio, TLS 1.2 como mínimo y TLS 1.3 activo.
   - **Reescrituras desactivadas:** Rocket Loader y ofuscación de email, que reescriben el HTML y romperían la CSP.
   - **Dos reglas de cabeceras:** una para el sitio público y otra para `/admin`.
3. **Revoque el token** en *API Tokens* una vez aplicado.
4. Verifique el resultado:
   ```powershell
   curl.exe -sI https://industryproject.net | findstr /i "content-security strict-transport x-frame permissions"
   ```
   Para una auditoría externa, analice el dominio en securityheaders.com; el objetivo es la calificación A.

**No active** en esta zona *Bot Fight Mode* ni la inyección automática de *Web Analytics* o *Zaraz*: inyectan scripts inline que la CSP bloquea.

---

## 10. Variables públicas del sitio y primera publicación

1. En el repositorio, vaya a *Settings → Secrets and variables → Actions → pestaña **Variables*** y cree:

   | Variable | Valor |
   |---|---|
   | `TURNSTILE_SITEKEY` | Site Key del paso 7 |
   | `CF_ANALYTICS_TOKEN` | Token del paso 7 |

   `SITE_URL` y `WORKER_URL` ya toman por defecto `https://industryproject.net` y `https://api.industryproject.net`. No defina `PATH_PREFIX`.
2. Vaya a **Actions → Desplegar sitio → Run workflow**. Debe terminar en verde en uno o dos minutos.

---

## 11. Prueba de aceptación (lista de control)

| ✔ | Prueba | Resultado esperado |
|---|---|---|
| ☐ | Abrir `https://industryproject.net` en ventana privada | Banner de cookies visible. En DevTools → Network, **ninguna** petición a `cloudflareinsights.com` antes de aceptar. |
| ☐ | Pulsar «Aceptar» | Aparece la petición `beacon.min.js`. |
| ☐ | Enviar el formulario **sin** newsletter | Recibe en `contacto@` la notificación con el registro de consentimiento. El remitente recibe el acuse. El contacto aparece en «Web · Contactos». |
| ☐ | Enviar **con** newsletter | Llega el correo de doble opt-in. Tras confirmar, se abre `/suscripcion-confirmada/` y el contacto pasa a «Web · Newsletter». |
| ☐ | Correos recibidos | Sin marca de spam. En *Mostrar original*: SPF, DKIM y DMARC = PASS. |
| ☐ | `https://industryproject.net/admin/` → Login with GitHub | Se abre el popup, autoriza y entra al panel. Publique una noticia de prueba y compruebe que aparece en unos dos minutos. |
| ☐ | Consola del navegador en portada y `/admin/` | Sin errores de CSP. |
| ☐ | A las 24 h: *Workers → industryproject-edge → Logs* | Línea `retention {"dryRun":true,...}`. Si los números son coherentes, ponga `RETENTION_DRY_RUN = "false"` y vuelva a desplegar. |

---

## 12. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| El formulario responde «No se pudo enviar» y la consola muestra 403 | `ALLOWED_ORIGINS` no coincide con la URL real | Revise `wrangler.toml` (esquema `https`, sin barra final) y vuelva a desplegar. |
| «La verificación anti-spam no se completó» | El hostname no figura en el widget de Turnstile o en `ALLOWED_HOSTNAMES` | Añada el hostname en ambos sitios. |
| Error 502 al enviar | Brevo rechaza la clave: IP no autorizada (401) o clave revocada | Paso 6.1.2, o rote la clave con `wrangler secret put BREVO_API_KEY`. |
| El contacto se crea sin atributos | Los atributos no existen en Brevo | Ejecute de nuevo `brevo-setup.mjs`. |
| El popup del CMS se cierra sin iniciar sesión | La callback de la OAuth App no es exacta, o `ALLOWED_ORIGINS` no empieza por `https://industryproject.net` | Corrija la callback (paso 7) o el primer origen de la lista. |
| La web da error 526 o un bucle de redirección | SSL de Cloudflare en «Flexible», o certificado de GitHub aún no emitido | Ejecute el paso 9 solo después de «Enforce HTTPS» (paso 4.3). |
| Errores de CSP en consola tras activar algo en Cloudflare | Rocket Loader, Zaraz, Bot Fight Mode o Web Analytics automático | Desactívelo (paso 9). |
| Los correos llegan a spam | SPF duplicado, o DKIM/DMARC sin propagar | Debe haber un único registro SPF (paso 5.2.3). Espere 24 h. |

---
*Plantilla técnica reutilizable. Requiere validación comercial de marca y revisión jurídica de los textos legales antes de la puesta en producción.*
