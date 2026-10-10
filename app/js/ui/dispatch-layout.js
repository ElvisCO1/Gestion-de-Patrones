/* Estructura visual del flujo de salida. No modifica datos ni eventos. */
(function (global) {
  "use strict";

  const namespace = global.Metrologia = global.Metrologia || { modules: Object.create(null) };
  namespace.modules = namespace.modules || Object.create(null);

  function bind() {
    const sidebar = document.getElementById("salida-sidebar-seleccion");
    const summary = document.getElementById("resumen-seleccion");
    if (sidebar && summary && summary.parentElement !== sidebar) sidebar.appendChild(summary);
    const actions = document.getElementById("salida-sidebar-acciones");
    const register = document.getElementById("btn-registrar");
    if (actions && register && register.parentElement !== actions) actions.appendChild(register);
  }

  namespace.modules.dispatchLayout = Object.freeze({ bind });
})(window);
