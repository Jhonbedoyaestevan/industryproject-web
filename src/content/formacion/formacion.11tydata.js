// Datos de directorio: layout y URL limpias para los cursos del CMS.
// Si un curso tiene «enlace» (p. ej. /cursos-itra/), su tarjeta apunta a esa
// página y NO se genera /formacion/<slug>/ (evita contenido duplicado).
export default {
  layout: "layouts/curso.njk",
  seccion: "formacion",
  permalink: (data) => (data.enlace ? false : `/formacion/${data.page.fileSlug}/`),
  eleventyComputed: {
    // Schema Course por defecto; un curso puede definir el suyo en «schema».
    // Con «duracion» / «modalidad» / «zona» añade una CourseInstance presencial.
    schemaAuto: (data) => {
      const horas = String(data.duracion || "").match(/(\d+)\s*h/i);
      const presencial = /presencial/i.test(String(data.modalidad || ""));
      const course = {
        "@context": "https://schema.org",
        "@type": "Course",
        name: data.title,
        description: data.resumen,
        inLanguage: "es",
        url: data.env?.siteUrl && data.page?.url ? data.env.siteUrl + data.page.url : undefined,
        provider: { "@type": "Organization", "@id": `${data.env?.siteUrl}/#organization`, name: data.site?.marca, sameAs: data.env?.siteUrl },
      };
      if (data.certificacion) course.educationalCredentialAwarded = String(data.certificacion).trim();
      if (horas || presencial || data.zona) {
        course.hasCourseInstance = {
          "@type": "CourseInstance",
          courseMode: presencial ? "Onsite" : undefined,
          courseWorkload: horas ? `PT${horas[1]}H` : undefined,
          location: data.zona ? { "@type": "Place", name: data.zona, address: { "@type": "PostalAddress", addressCountry: "ES" } } : undefined,
        };
      }
      return course;
    },
  },
};
