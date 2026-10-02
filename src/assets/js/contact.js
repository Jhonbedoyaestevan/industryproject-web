/*!
 * contact.js — Formulario de contacto con Cloudflare Turnstile (Carga directa)
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

  function setStatus(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "form-status" + (kind ? " is-" + kind : "");
  }

  if (!endpoint || !sitekey) {
    if (submitBtn) submitBtn.disabled = true;
    setStatus("Formulario temporalmente no disponible.", "error");
    return;
  }

  // 1. Renderizar Turnstile siempre visible
  window.__onTurnstileLoad = function () {
    if (!window.turnstile || !container) return;
    if (widgetId !== null) return;

    widgetId = window.turnstile.render(container, {
      sitekey: sitekey,
      action: "contact",
      appearance: "always", // Visibilidad inmediata
      language: "es",
      callback: function (t) {
        token = t;
        setStatus("", "");
      },
      "expired-callback": function () { token = ""; },
      "error-callback": function () {
        token = "";
        setStatus("Error de verificación anti-spam. Recargue la página.", "error");
      }
    });
  };

  // 2. Cargar el script de Cloudflare sin demoras
  var s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__onTurnstileLoad";
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);

  // 3. Envío del formulario
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    setStatus("");

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

    if (!token) {
      setStatus("Por favor, complete la casilla de verificación de Cloudflare.", "error");
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    setStatus("Enviando mensaje…");

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
      token: token
    };

    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);

    fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
    .then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data.ok) throw new Error(data.error || "server");
      });
    })
    .then(function () {
      form.reset();
      setStatus("Mensaje enviado correctamente. Le responderemos lo antes posible.", "ok");
    })
    .catch(function (err) {
      var msg = "No se pudo enviar el mensaje. Inténtelo de nuevo o escríbanos por WhatsApp.";
      if (err && err.message === "rate_limited") msg = "Demasiados envíos seguidos. Inténtelo en unos minutos.";
      setStatus(msg, "error");
    })
    .finally(function () {
      clearTimeout(timer);
      if (submitBtn) submitBtn.disabled = false;
      token = "";
      if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
    });
  });
})();
