/* Enlaces de interfaz para Historial y respaldos. */
(function (global) {
  "use strict";
  let searchTimer = null;

  function element(id) {
    return document.getElementById(id);
  }

  function bind({ onSearch, onOrderChange, exportBackup, importBackup, importFusion, openHistory }) {
    const search = element("buscar-historial");
    if (search) search.addEventListener("input", event => {
      clearTimeout(searchTimer);
      const value = event.target.value;
      searchTimer = setTimeout(() => onSearch(value), 180);
    });
    const order = element("orden-historial");
    if (order) order.addEventListener("change", event => onOrderChange(event.target.value));
    const tab = element("tab-historial");
    if (tab) tab.addEventListener("click", openHistory);

    const inputBackup = element("input-importar-backup");
    const buttonBackup = element("btn-importar-backup");
    const exportButton = element("btn-exportar-backup");
    if (exportButton) exportButton.addEventListener("click", exportBackup);
    if (buttonBackup && inputBackup) buttonBackup.addEventListener("click", () => inputBackup.click());
    if (inputBackup) inputBackup.addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (file) importBackup(file);
      event.target.value = "";
    });

    const inputFusion = element("input-importar-fusion");
    const buttonFusion = element("btn-importar-fusion");
    if (buttonFusion && inputFusion) buttonFusion.addEventListener("click", () => inputFusion.click());
    if (inputFusion) inputFusion.addEventListener("change", event => {
      const file = event.target.files && event.target.files[0];
      if (file) importFusion(file);
      event.target.value = "";
    });
  }

  function bindEntryActions(context, historyBox) {
    const {
      historial, patrones, cantidadDeRegistro, unidadesFueraDe, estadoTrasMovimiento,
      STORES, runAtomicTransaction, claveSalida, seleccionados, prepareNewService, render,
      activarTab, abrirModalObservacion, abrirModalEditarOT, descargarActaPDF,
      eliminarOT, avisar, returnActions
    } = context;

    historyBox.querySelectorAll('.btn-devuelto-mini').forEach((button) => {
      button.addEventListener('click', async (event) => {
        await returnActions.closeReturn({
          historial, patrones, cantidadDeRegistro, unidadesFueraDe,
          estadoTrasMovimiento, STORES, runAtomicTransaction, render
        }, event.target.getAttribute('data-id'));
      });
    });
    historyBox.querySelectorAll('.btn-otro-servicio-mini').forEach((button) => {
      button.addEventListener('click', async (event) => {
        await returnActions.sendToAnotherService({
          historial, patrones, cantidadDeRegistro, unidadesFueraDe,
          estadoTrasMovimiento, STORES, runAtomicTransaction, seleccionados,
          prepareNewService, render, activarTab
        }, event.target.getAttribute('data-id'));
      });
    });
    historyBox.querySelectorAll('.btn-obs-mini').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalObservacion({ registroId: event.target.getAttribute('data-id') });
      });
    });
    historyBox.querySelectorAll('.btn-obs-ot').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalObservacion({ salidaId: event.target.getAttribute('data-salida'), destino: 'interno' });
      });
    });
    historyBox.querySelectorAll('.btn-obs-documento').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalObservacion({ salidaId: event.target.getAttribute('data-salida'), destino: 'documento' });
      });
    });
    historyBox.querySelectorAll('.btn-editar-obs-documento').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalObservacion({
          salidaId: event.target.getAttribute('data-salida'), destino: 'documento',
          editarObservacionId: event.target.getAttribute('data-obs-id')
        });
      });
    });
    historyBox.querySelectorAll('.btn-retirar-obs-documento').forEach((button) => {
      button.addEventListener('click', async (event) => {
        await returnActions.removeDocumentObservation({
          historial, STORES, claveSalida, runAtomicTransaction, render, avisar
        }, event.target.getAttribute('data-salida'), event.target.getAttribute('data-obs-id'));
      });
    });
    historyBox.querySelectorAll('.btn-editar-ot').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalEditarOT(event.target.getAttribute('data-salida'));
      });
    });
    historyBox.querySelectorAll('.btn-corregir-mini').forEach((button) => {
      button.addEventListener('click', (event) => {
        abrirModalObservacion({ registroId: event.target.getAttribute('data-id'), correccion: true });
      });
    });
    historyBox.querySelectorAll('.btn-descargar').forEach((button) => {
      button.addEventListener('click', (event) => {
        descargarActaPDF(event.target.getAttribute('data-salida'));
      });
    });
    historyBox.querySelectorAll('.btn-eliminar-ot').forEach((button) => {
      button.addEventListener('click', async (event) => {
        await eliminarOT(event.target.getAttribute('data-salida'));
      });
    });
  }

  global.Metrologia.modules.historyController = Object.freeze({ bind, bindEntryActions });
})(window);
