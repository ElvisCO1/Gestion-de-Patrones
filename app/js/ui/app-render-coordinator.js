/* Coordina recarga de datos y refresco coherente de todas las pantallas. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  async function render(context) {
    const state = await context.loadState();
    state.history.sort(context.compareHistory);
    context.applyState(state);
    context.updateDispatchHeader(state.history);
    context.renderSelectionSummary();
    context.refreshControls();
    context.renderDispatchList();
    context.renderScreens();
    context.updateStorageStatus();
  }

  namespace.modules.appRenderCoordinator = Object.freeze({ render });
})(window);
