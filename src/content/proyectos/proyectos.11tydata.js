// Datos de directorio: layout y URL limpias para los contenidos del CMS.
export default {
  layout: "layouts/post.njk",
  seccion: "proyectos",
  permalink: (data) => `/proyectos/${data.page.fileSlug}/`,
};
