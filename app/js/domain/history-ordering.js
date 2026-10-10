/* Reglas de orden para el historial, aisladas de su presentacion. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function byLatestActivity(groups) {
    return (groups || []).slice().sort((left, right) => {
      const leftStamp = String(left.actualizadoEn || left.generadoEn || '');
      const rightStamp = String(right.actualizadoEn || right.generadoEn || '');
      if (leftStamp !== rightStamp) return leftStamp < rightStamp ? 1 : -1;
      return String(right.numeroOT || '').localeCompare(String(left.numeroOT || ''), 'es', { numeric: true });
    });
  }

  function valueFor(group, order) {
    if (order.startsWith('salida')) return String(group.fechaHoraSalida || group.fecha || '');
    if (order.startsWith('tecnico')) return String(group.tecnico || '');
    if (order.startsWith('empresa')) return String(group.empresa || '');
    if (order.startsWith('ot')) return String(group.numeroOT || '');
    return String(group.actualizadoEn || group.generadoEn || '');
  }

  function sort(groups, order = 'actividad_desc') {
    if (order === 'actividad_desc') return byLatestActivity(groups);
    const descending = order.endsWith('_desc');
    return (groups || []).slice().sort((left, right) => {
      const leftValue = valueFor(left, order);
      const rightValue = valueFor(right, order);
      const comparison = leftValue.localeCompare(rightValue, 'es', { numeric: true });
      if (comparison) return descending ? -comparison : comparison;
      const activityComparison = String(right.actualizadoEn || right.generadoEn || '').localeCompare(String(left.actualizadoEn || left.generadoEn || ''));
      if (activityComparison) return activityComparison;
      return String(left.numeroOT || '').localeCompare(String(right.numeroOT || ''), 'es', { numeric: true });
    });
  }

  namespace.modules.historyOrdering = Object.freeze({ byLatestActivity, sort });
})(window);
