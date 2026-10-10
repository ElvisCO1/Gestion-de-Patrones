/*
 * Punto único de extensión para la migración.
 *
 * Durante la fase 1 el comportamiento sigue siendo el de la referencia.
 * Las fases siguientes registrarán aquí módulos, servicios y adaptadores
 * antes de retirar código del archivo de compatibilidad.
 */
(function (global) {
  "use strict";

  if (global.Metrologia) return;

  // Los adaptadores se cargan como scripts independientes y registran sus
  // capacidades progresivamente. El objeto raiz no puede congelarse: varios
  // modulos aseguran la existencia de `modules` y `services` al inicializarse.
  global.Metrologia = {
    version: "fase-1",
    modules: Object.create(null),
    services: Object.create(null)
  };
})(window);
