/* Enlaces de interfaz para salidas, cliente/sede y devoluciones. */
(function (global) {
  "use strict";

  function byId(id) { return document.getElementById(id); }
  function on(id, eventName, listener) {
    const node = byId(id);
    if (node) node.addEventListener(eventName, listener);
  }

  function bind(config) {
    on("btn-registrar", "click", config.registerExit);
    ["btn-limpiar", "btn-limpiar-resumen"].forEach(id => on(id, "click", config.clearSelection));

    on("btn-devolucion-escaner", "click", config.openReturn);
    on("dev-cerrar", "click", config.closeReturn);
    on("dev-confirmar", "click", config.confirmReturn);
    on("dev-vaciar", "click", () => { config.clearReturn(); byId("escaneo-devolucion")?.focus(); });
    on("modal-devolucion", "click", event => { if (event.target.id === "modal-devolucion") config.closeReturn(); });

    on("in-cliente", "input", config.onCustomerInput);
    on("in-cliente", "change", () => config.resolveCustomer(true));
    on("in-cliente", "blur", () => config.resolveCustomer(true));
    on("in-cliente", "keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); config.resolveCustomer(true); }
    });
    on("in-sede", "change", event => config.selectSite(event.target.value));
    on("btn-guardar-cliente-nuevo", "click", config.saveNewCustomer);
    on("btn-cancelar-cliente-nuevo", "click", config.cancelNewCustomer);
    on("btn-guardar-sede-nueva", "click", config.saveNewSite);
    on("btn-cancelar-sede-nueva", "click", config.cancelNewSite);
  }

  global.Metrologia.modules.dispatchReturnController = Object.freeze({ bind });
})(window);
