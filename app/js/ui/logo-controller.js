/* Enlaces de interfaz para el logo de encabezados PDF. */
(function (global) {
  "use strict";

  function bind({ open, close, chooseFile, changeFile, restore }) {
    const get = id => document.getElementById(id);
    get("btn-logo")?.addEventListener("click", open);
    get("logo-cerrar")?.addEventListener("click", close);
    get("modal-logo")?.addEventListener("click", event => { if (event.target.id === "modal-logo") close(); });
    get("logo-elegir")?.addEventListener("click", () => get("input-logo")?.click());
    get("input-logo")?.addEventListener("change", async event => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (file) await changeFile(file);
    });
    get("logo-restaurar")?.addEventListener("click", restore);
  }

  global.Metrologia.modules.logoController = Object.freeze({ bind });
})(window);
