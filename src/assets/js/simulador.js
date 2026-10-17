// RigCalc Rescate · muestra el aviso tras enviar (?enviado=1) o confirmar el correo (?confirmado=1)
["enviado", "confirmado"].forEach(function (k) {
  if (new RegExp("[?&]" + k + "=1").test(location.search)) {
    var a = document.getElementById(k);
    if (a) { a.hidden = false; a.scrollIntoView({ block: "center" }); }
  }
});
