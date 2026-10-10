/* Enlaces de interfaz para Catálogo de patrones y Programa anual. */
(function (global) {
  "use strict";

  function on(id, eventName, listener) {
    const element = document.getElementById(id);
    if (element) element.addEventListener(eventName, listener);
  }

  function bind({ renderCatalog, renderProgram, downloadProgram, openProgram }) {
    ["prog-anio", "prog-area", "prog-actividad"].forEach(id => on(id, "change", renderProgram));
    on("prog-buscar", "input", renderProgram);
    on("btn-programa-pdf", "click", downloadProgram);
    on("tab-programa", "click", openProgram);

    ["filtro-cat2", "filtro-estado", "filtro-calibracion", "filtro-tipocal"]
      .forEach(id => on(id, "change", renderCatalog));
    on("buscar2", "input", renderCatalog);
  }

  function bindCatalogActions(context, list) {
    const {
      patrones, historial, actividadesEjecutadas, seleccionados, seleccionEtiquetas,
      STORES, runAtomicTransaction, saveRecord, render, confirmar, avisar,
      restaurarRegistros, actualizarContadorEtiquetas, abrirModalEliminarTotal,
      abrirModalCalibracion, abrirFormularioEdicion, abrirFichaPatron,
      duplicarPatron, destructiveActions
    } = context;

    list.querySelectorAll('.etiqueta-seleccionada').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const code = event.target.getAttribute('data-codigo');
        if (event.target.checked) seleccionEtiquetas[code] = true;
        else delete seleccionEtiquetas[code];
        actualizarContadorEtiquetas();
      });
    });

    list.querySelectorAll('.btn-eliminar-patron').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const code = event.target.getAttribute('data-codigo');
        const pattern = patrones.find((item) => item.codigo === code);
        if (!pattern) return;
        const hasHistory = historial.some((item) => item.codigo === code);
        const patternActivities = actividadesEjecutadas.filter((item) => item.codigoPatron === code);

        if (!hasHistory) {
          const notice = patternActivities.length
            ? `\n\nOJO: tiene ${patternActivities.length} actividad(es) de calibración registradas que también se borrarán.`
            : '\n\nNo tiene historial asociado.';
          const accepted = await confirmar({
            titulo: 'Eliminar patrón',
            mensaje: `Se eliminará definitivamente el patrón ${code}.` + notice,
            textoOk: 'Eliminar', peligro: true
          });
          if (!accepted) return;
          const deletedPattern = { ...pattern };
          await destructiveActions.deletePatternWithoutHistory({
            STORES, runAtomicTransaction, seleccionados, seleccionEtiquetas
          }, pattern, patternActivities);
          await render();
          avisar(`Patrón ${code} eliminado.`, 'ok', {
            etiqueta: 'Deshacer',
            ejecutar: () => restaurarRegistros([deletedPattern], [], patternActivities)
          });
          return;
        }

        const answer = await confirmar({
          titulo: 'El patrón tiene historial',
          mensaje: `El patrón ${code} aparece en registros del historial.\n\n` +
            'Lo recomendable es marcarlo como "Eliminado": desaparece de las listas de uso pero su historial se conserva, como pide la trazabilidad.',
          textoOk: 'Marcar como Eliminado',
          textoAlterno: 'Borrar todo (patrón + historial)',
          peligroAlterno: true
        });
        if (answer === 'ok') {
          await destructiveActions.markPatternRemoved({
            STORES, saveRecord, seleccionados, seleccionEtiquetas
          }, pattern);
          await render();
          avisar(`Patrón ${code} marcado como Eliminado. Su historial se conserva.`, 'ok');
        } else if (answer === 'alterno') {
          abrirModalEliminarTotal(code);
        }
      });
    });

    const actions = [
      ['.btn-calibrar-patron', abrirModalCalibracion],
      ['.btn-editar-patron', abrirFormularioEdicion],
      ['.btn-ficha-patron', abrirFichaPatron],
      ['.btn-duplicar-patron', duplicarPatron]
    ];
    actions.forEach(([selector, handler]) => {
      list.querySelectorAll(selector).forEach((button) => {
        button.addEventListener('click', (event) => handler(event.target.getAttribute('data-codigo')));
      });
    });
  }

  global.Metrologia.modules.catalogProgramController = Object.freeze({ bind, bindCatalogActions });
})(window);
