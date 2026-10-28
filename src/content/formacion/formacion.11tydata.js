// Datos de directorio: layout y URL limpias para los cursos del CMS.
export default {
  layout: "layouts/curso.njk",
  seccion: "formacion",
  permalink: (data) => `/formacion/${data.page.fileSlug}/`,
};
