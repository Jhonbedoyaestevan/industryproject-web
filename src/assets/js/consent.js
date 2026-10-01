/*!
 * consent.js — Gestor de consentimiento (sin dependencias, compatible con CSP estricta)
 *
 * Principios aplicados:
 *  - Opt-in previo: ningún script de analítica se carga sin aceptación expresa
 *    (art. 22.2 LSSI-CE; art. 5.3 Directiva 2002/58/CE; arts. 4.11 y 7 RGPD).
 *  - Rechazar tan fácil como aceptar (Guía AEPD cookies 2023; Directrices CEPD 03/2022).
 *  - Global Privacy Control (GPC) respetado como rechazo automático (FDBR §501.705;
 *    buena práctica FTC; obligatorio en otros estados como California/Colorado).
 *  - Registro de prueba del consentimiento: versión de política + marca temporal (art. 7.1 RGPD).
 *  - Caducidad: se vuelve a preguntar a los 12 meses o al cambiar la versión de la política.
 *  - Revocable en cualquier momento desde «Configurar cookies» (art. 7.3 RGPD).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "consent.v1";
  var MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 12 meses
  var body = document.body;
  var policyVersion = body.getAttribute("data-policy-version") || "1.0";
  var cfToken = body.getAttribute("data-cf-analytics") || "";

  var banner = document.getElementById("consent-banner");
  var panel = document.getElementById("consent-panel");
  var analyticsBox = document.getElementById("consent-analytics");
  if (!banner) return;

  var btnConfigure = banner.querySelector('[data-consent="configure"]');
  var btnSave = banner.querySelector('[data-consent="save"]');

  // ---- Almacenamiento seguro (localStorage puede estar bloqueado) -----------
  function read() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      if (data.v !== policyVersion) return null;                 // política cambiada
      if (Date.now() - Number(data.ts || 0) > MAX_AGE_MS) return null; // caducado
      return data;
    } catch (e) { return null; }
  }
  function write(analytics, source) {
    var record = { v: policyVersion, ts: Date.now(), analytics: !!analytics, source: source };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record)); } catch (e) { /* modo privado */ }
    return record;
  }

  // ---- Carga diferida de la analítica (solo tras consentimiento) ------------
  var analyticsLoaded = false;
  function loadAnalytics() {
    if (analyticsLoaded || !cfToken) return;
    // El token solo puede contener caracteres alfanuméricos: evita inyección en el atributo
    if (!/^[A-Za-z0-9]{16,64}$/.test(cfToken)) return;
    var s = document.createElement("script");
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.defer = true;
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: cfToken, spa: false }));
    document.head.appendChild(s);
    analyticsLoaded = true;
  }

  // ---- UI -------------------------------------------------------------------
  function showBanner() {
    banner.hidden = false;
    var first = banner.querySelector('[data-consent="reject"]');
    if (first) first.focus({ preventScroll: true });
  }
  function hideBanner() {
    banner.hidden = true;
    panel.hidden = true;
    btnSave.hidden = true;
    btnConfigure.setAttribute("aria-expanded", "false");
  }
  function apply(record, previous) {
    if (record.analytics) {
      loadAnalytics();
    } else if (previous && previous.analytics && analyticsLoaded) {
      // Revocación: el script ya cargado no puede descargarse; se recarga la página
      // para detener cualquier medición en la sesión actual.
      window.location.reload();
    }
  }

  banner.addEventListener("click", function (ev) {
    var target = ev.target.closest("[data-consent]");
    if (!target) return;
    var action = target.getAttribute("data-consent");
    var previous = read();
    if (action === "accept") { apply(write(true, "accept"), previous); hideBanner(); }
    else if (action === "reject") { apply(write(false, "reject"), previous); hideBanner(); }
    else if (action === "configure") {
      var open = panel.hidden;
      panel.hidden = !open;
      btnSave.hidden = !open;
      btnConfigure.setAttribute("aria-expanded", String(open));
      if (open) analyticsBox.focus();
    }
    else if (action === "save") { apply(write(analyticsBox.checked, "custom"), previous); hideBanner(); }
  });

  document.addEventListener("keydown", function (ev) {
    // Escape cierra el banner SIN consentir (equivale a no decidir; no carga nada)
    if (ev.key === "Escape" && !banner.hidden && read()) hideBanner();
  });

  // Enlaces «Configurar cookies» en el pie y en /cookies/
  document.querySelectorAll("[data-consent-open]").forEach(function (el) {
    el.addEventListener("click", function () {
      var current = read();
      analyticsBox.checked = !!(current && current.analytics);
      panel.hidden = false;
      btnSave.hidden = false;
      btnConfigure.setAttribute("aria-expanded", "true");
      showBanner();
    });
  });

  // ---- Arranque ---------------------------------------------------------------
  var gpc = navigator.globalPrivacyControl === true;
  var existing = read();
  if (existing) {
    apply(existing, null);
  } else if (gpc) {
    // Señal GPC: se registra como rechazo y no se muestra el banner.
    write(false, "gpc");
  } else {
    showBanner();
  }
})();
