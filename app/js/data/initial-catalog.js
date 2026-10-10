/* Ensambla fragmentos de datos para que el catálogo no mezcle datos y lógica. */
(function (global) {
  "use strict";

  function getAll() {
    const parts = global.Metrologia.modules.initialCatalogParts || [];
    return parts.flatMap(part => part.map(item => ({ ...item })));
  }

  global.Metrologia.services.initialCatalog = Object.freeze({ getAll });
})(window);
