/* Enlaces de interfaz para Etiquetas e Inventario. */
(function (global) {
  "use strict";

  function on(id, eventName, listener) {
    const node = document.getElementById(id);
    if (node) node.addEventListener(eventName, listener);
  }

  function bind(config) {
    document.querySelectorAll('input[name="formato-etiqueta"]').forEach(node => node.addEventListener("change", config.changeLabelFormat));
    ["etiqueta-ancho", "etiqueta-alto", "etiqueta-separacion"].forEach(id => on(id, "input", config.changeLabelMeasure));
    on("btn-medir-etiquetas", "click", config.measureLabels);
    on("etiqueta-con-barras", "change", config.changeBarcodeOption);
    on("etiqueta-agrupar-equipos", "change", config.changeGroupOption);
    on("btn-descargar-etiquetas-pdf", "click", config.downloadLabels);
    on("btn-imprimir-etiquetas", "click", config.printLabels);
    on("btn-limpiar-etiquetas", "click", config.clearLabels);
    on("buscar-inventario", "input", config.searchInventory);
    on("buscar2", "input", config.searchCatalog);

    on("inventario-contenido", "click", event => {
      const pdf = event.target.closest(".btn-inv-pdf");
      if (pdf) return config.downloadInventory(pdf.dataset.area);
      const collapse = event.target.closest(".btn-inv-plegar");
      if (collapse) config.toggleInventorySection(collapse.dataset.area);
    });
    on("inventario-indice", "click", event => {
      const chip = event.target.closest(".btn-inv-ir");
      if (chip) config.goToInventoryArea(chip.dataset.area);
    });
    config.initializeLabels();
  }

  global.Metrologia.modules.assetsController = Object.freeze({ bind });
})(window);
