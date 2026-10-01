// Datos de directorio: layout y URL limpias para los contenidos del CMS.
export default {
  layout: "layouts/post.njk",
  seccion: "noticias",
  permalink: (data) => `/noticias/${data.page.fileSlug}/`,
};
