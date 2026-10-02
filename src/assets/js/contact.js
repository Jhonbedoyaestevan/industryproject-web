/*!
 * contact.js — Formulario de contacto con Cloudflare Turnstile (modo explícito)
 *
 * Seguridad:
 *  - Solo usa la sitekey PÚBLICA. El secreto de Turnstile vive en el Worker.
 *  - Turnstile se carga de forma diferida al acercarse el formulario (minimización:
 *    sin conexiones a terceros para quien no va a contactar).
 *  - Validación en cliente = usabilidad; la validación real se repite en el Worker.
 *  - Sin innerHTML: todos los mensajes se escriben con textContent (anti-XSS).
 *  - credentials: "omit" → no se envían cookies al endpoint.
 */
(function () {
  "use strict";

  var form = document.getElementById("contact-form");
  if (!form) return;

  var endpoint = form.getAttribute("data-endpoint");
  var sitekey = form.getAttribute("data-sitekey");
  var policyVersion = form.getAttribute("data-policy-version") || "1.0";
  var statusEl = document.getElementById("cf-status");
  var submitBtn = document.getElementById("cf-submit");
  var container = document.getElementById("turnstile-container");

  var token = "";
  var widgetId = null;
  var scriptRequested = false;

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  if (!endpoint || !sitekey) {
    if (submitBtn) submitBtn.disabled = true;
    setStatus("Formulario temporalmente no disponible. Escríbanos por correo o WhatsApp.", "error");
    return;
  }

  // ---- Turnstile: carga diferida y renderizado explícito ---------------------
  window.__onTurnstileLoad = function () {
    if (!window.turnstile) return;

    var targetContainer = container || document.getElementById("turnstile-container");
    var targetSitekey = sitekey || (form ? form.getAttribute("data-sitekey") : "");

    if (widgetId === null && targetContainer && targetSitekey) {
      widgetId = window.turnstile.render(targetContainer, {
        sitekey: targetSitekey,
        action: "contact",
        appearance: "interaction-only",   // invisible salvo que Cloudflare requiera interacción
        language: "es",
        callback: function (t) { token = t; },
        "expired-callback": function () { token = ""; },
        "error-callback": function () {
          token = "";
          setStatus("No se pudo completar la verificación anti-spam. Recargue la página.", "error");
        }
      });
    }
  };

  function requestTurnstile() {
    if (scriptRequested) return;
    scriptRequested = true;

    // Si la API de Turnstile ya fue cargada previamente por el navegador
    if (window.turnstile) {
      window.__onTurnstileLoad();
      return;
    }

    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__onTurnstileLoad";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { 
        requestTurnstile(); 
        io.disconnect(); 
      }
    }, { rootMargin: "300px" });
    io.observe(form);
  } else {
    requestTurnstile();
  }
  form.addEventListener("focusin", requestTurnstile, { once: true });

  function waitForToken(ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function poll() {
        if (token) return resolve(token);
        if (Date.now() - start > ms) return resolve("");
        setTimeout(poll, 250);
      })();
    });
  }

  // ---- Envío -------------------------------------------------------------------
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setStatus("");

    // Honeypot relleno → descartar silenciosamente
    if (form.web && form.web.value) { 
      form.reset(); 
      setStatus("Mensaje enviado. Gracias.", "ok"); 
      return; 
    }

    if (!form.checkValidity()) {
      form.reportValidity();
      setStatus("Revise los campos obligatorios marcados con *.", "error");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus("Verificando y enviando…");
    requestTurnstile();

    waitForToken(10000).then(function (t) {
      if (!t) {
        throw new Error("captcha");
      }
      var payload = {
        nombre: form.nombre ? form.nombre.value.trim() : "",
        empresa: form.empresa ? form.empresa.value.trim() : "",
        email: form.email ? form.email.value.trim() : "",
        telefono: form.telefono ? form.telefono.value.trim() : "",
        servicio: form.servicio ? form.servicio.value : "",
        mensaje: form.mensaje ? form.mensaje.value.trim() : "",
        privacidad: form.privacidad ? form.privacidad.checked === true : false,
        comercial: form.comercial ? form.comercial.checked === true : false,
        policyVersion: policyVersion,
        web: form.web ? form.web.value : "",
        token: t
      };
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 15000);
      return fetch(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      }).finally(function () { clearTimeout(timer); });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.ok) throw new Error(data.error || "server");
      });
    }).then(function () {
      form.reset();
      setStatus("Mensaje enviado correctamente. Le responderemos en un máximo de 48 horas laborables.", "ok");
    }).catch(function (err) {
      var msg = "No se pudo enviar el mensaje. Inténtelo de nuevo o contáctenos por WhatsApp.";
      if (err && err.message === "captcha") msg = "La verificación anti-spam no se completó. Espere unos segundos e inténtelo de nuevo.";
      if (err && err.message === "validation") msg = "Algún campo no es válido. Revise el formulario.";
      if (err && err.message === "rate_limited") msg = "Demasiados envíos seguidos. Inténtelo en unos minutos.";
      setStatus(msg, "error");
    }).finally(function () {
      if (submitBtn) submitBtn.disabled = false;
      token = "";
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    });
  });
})();
