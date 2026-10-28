/*! main.js — navegación accesible (sin manejadores inline, compatible con CSP) */
(function () {
  "use strict";
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("menu-principal");
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    toggle.querySelector(".sr-only").textContent = open ? "Cerrar menú" : "Abrir menú";
  }
  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.addEventListener("click", function (ev) {
    if (ev.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
})();

(function () {
  "use strict";
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var els = document.querySelectorAll(".service, .card, .section-header");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
      setTimeout(function () { e.target.classList.remove("reveal", "is-in"); }, 800);
    });
  }, { threshold: 0.12 });
  els.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
})();

/* Matricularme: rellena el mensaje del formulario con el curso elegido */
(function () {
  try {
    var curso = new URLSearchParams(location.search).get("curso");
    var ta = document.getElementById("cf-mensaje");
    if (curso && ta && !ta.value) {
      ta.value = "Quiero matricularme en el curso: " + curso.slice(0, 120) + ". ";
    }
  } catch (e) {}
})();
