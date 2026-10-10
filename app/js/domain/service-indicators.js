/* Agrupacion confiable de servicios para indicadores; una OT no se cuenta por patron. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function serviceKey(record) {
    return String(record.salidaId || '') || `${record.numeroOT || ''}||${record.fecha || ''}`;
  }

  function servicesFromHistory(history) {
    const groups = new Map();
    (history || []).filter(record => record.estadoMovimiento !== 'Anulado').forEach(record => {
      const key = serviceKey(record);
      if (!groups.has(key)) {
        groups.set(key, {
          id: key, numeroOT: record.numeroOT || '', fecha: record.fecha || '',
          fechaHoraSalida: record.fechaHoraSalida || '', tecnico: record.tecnico || '',
          empresa: record.empresa || '', areas: new Set(), states: [], patternCount: 0
        });
      }
      const service = groups.get(key);
      if (record.area) service.areas.add(record.area);
      service.states.push(record.estadoMovimiento || 'En servicio');
      service.patternCount += Number(record.cantidad || 1) || 1;
      if (!service.fechaHoraSalida && record.fechaHoraSalida) service.fechaHoraSalida = record.fechaHoraSalida;
    });
    return [...groups.values()].map(service => ({
      ...service,
      areas: [...service.areas].sort((a, b) => a.localeCompare(b, 'es')),
      status: service.states.some(state => state === 'En servicio') ? 'activo' : 'devuelto'
    }));
  }

  function inPeriod(service, period, now) {
    if (period === 'todo') return true;
    const date = new Date(service.fechaHoraSalida || service.fecha);
    if (Number.isNaN(date.getTime())) return false;
    if (period === 'anio') return date.getFullYear() === now.getFullYear();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  function filterServices(services, filters, now = new Date()) {
    return (services || []).filter(service =>
      inPeriod(service, filters.periodo || 'todo', now)
      && (filters.tecnico === 'todos' || service.tecnico === filters.tecnico)
      && (filters.magnitud === 'todos' || service.areas.includes(filters.magnitud))
      && (filters.estado === 'todos' || service.status === filters.estado)
    );
  }

  namespace.modules.serviceIndicators = Object.freeze({ servicesFromHistory, filterServices });
})(window);
