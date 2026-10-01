// =============================================================================
// Eleventy 3.x — configuración del generador estático
// Ninguna clave se define aquí: los identificadores públicos llegan por
// variables de entorno (ver src/_data/env.js y .github/workflows/deploy.yml).
// =============================================================================
import { HtmlBasePlugin } from "@11ty/eleventy";
import markdownIt from "markdown-it";

export default function (eleventyConfig) {
  // --- Seguridad: autoescape en Nunjucks (mitiga XSS con datos del CMS) -----
  eleventyConfig.setNunjucksEnvironmentOptions({ autoescape: true, throwOnUndefined: false });

  // --- Markdown sin HTML crudo (defensa en profundidad frente a XSS) ---------
  eleventyConfig.setLibrary(
    "md",
    markdownIt({ html: false, linkify: true, typographer: true })
  );

  // --- Prefijo de ruta para GitHub Pages de proyecto (usuario.github.io/repo) -
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // --- Archivos estáticos ---------------------------------------------------
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  // Decap CMS auto-alojado (sin CDN de terceros): bundle principal, chunks y wasm
  eleventyConfig.addPassthroughCopy({
    "node_modules/decap-cms/dist/*decap-cms.js": "admin",
    "node_modules/decap-cms/dist/*.wasm": "admin",
  });

  // --- Colecciones (excluyen borradores) -----------------------------------
  const published = (item) => !item.data.draft;
  eleventyConfig.addCollection("noticias", (api) =>
    api.getFilteredByGlob("src/content/noticias/*.md").filter(published).reverse()
  );
  eleventyConfig.addCollection("proyectos", (api) =>
    api.getFilteredByGlob("src/content/proyectos/*.md").filter(published).reverse()
  );

  // --- Filtros ---------------------------------------------------------------
  eleventyConfig.addFilter("fechaES", (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  });
  eleventyConfig.addFilter("isoDate", (value) => {
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  });
  eleventyConfig.addFilter("year", (value) => new Date(value).getUTCFullYear());
  eleventyConfig.addFilter("limit", (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []));
  eleventyConfig.addFilter("origin", (url) => {
    try { return url ? new URL(url).origin : ""; } catch { return ""; }
  });
  eleventyConfig.addFilter("hostname", (url) => {
    try { return url ? new URL(url).hostname : ""; } catch { return ""; }
  });
  // Solo dígitos para enlaces wa.me / tel:
  eleventyConfig.addFilter("digits", (s) => String(s || "").replace(/\D/g, ""));

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    pathPrefix: process.env.PATH_PREFIX || "/",
    // El Markdown del CMS NO se procesa con Nunjucks: evita inyección de plantillas
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md"],
  };
}
