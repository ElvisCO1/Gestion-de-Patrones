/* Base modular del panel de indicadores: filtros sin calculos todavia. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};
  const serviceIndicators = namespace.modules.serviceIndicators;

  function escapeOption(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fillSelect(id, items, label) {
    const select = document.getElementById(id);
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="todos">${label}</option>` + items
      .map(item => `<option value="${escapeOption(item)}">${escapeOption(item)}</option>`).join('');
    select.value = [...select.options].some(option => option.value === previous) ? previous : 'todos';
  }

  function selectedFilters() {
    return {
      periodo: document.getElementById('indicadores-periodo').value || 'todo',
      tecnico: document.getElementById('indicadores-tecnico').value,
      magnitud: document.getElementById('indicadores-magnitud').value,
      estado: document.getElementById('indicadores-estado').value
    };
  }

  function renderSummary(services) {
    const total = document.getElementById('indicadores-servicios-total');
    const detail = document.getElementById('indicadores-servicios-detalle');
    const active = document.getElementById('indicadores-servicios-activos');
    const returned = document.getElementById('indicadores-servicios-devueltos');
    const patterns = document.getElementById('indicadores-patrones-movilizados');
    const technicians = document.getElementById('indicadores-tecnicos-participantes');
    if (total) total.textContent = services.length;
    if (detail) detail.textContent = services.length === 1 ? 'servicio único encontrado' : 'servicios únicos encontrados';
    if (active) active.textContent = services.filter(service => service.status === 'activo').length;
    if (returned) returned.textContent = services.filter(service => service.status === 'devuelto').length;
    if (patterns) patterns.textContent = services.reduce((sum, service) => sum + service.patternCount, 0);
    if (technicians) technicians.textContent = new Set(services.map(service => service.tecnico).filter(Boolean)).size;
  }

  function countBy(services, valuesForService) {
    const counts = new Map();
    services.forEach(service => valuesForService(service).forEach(value => {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }));
    return [...counts.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'es'));
  }

  function renderBars(id, data, emptyText) {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';
    if (!data.length) {
      container.textContent = emptyText;
      container.className = 'indicador-grafico-vacio';
      return;
    }
    container.className = '';
    const max = Math.max(...data.map(item => item.value), 1);
    data.forEach(item => {
      const row = document.createElement('div');
      row.className = 'indicador-barra';
      const caption = document.createElement('div');
      caption.className = 'indicador-barra-cabecera';
      const label = document.createElement('span');
      label.textContent = item.label;
      const value = document.createElement('strong');
      value.textContent = item.value;
      caption.append(label, value);
      const track = document.createElement('div');
      track.className = 'indicador-barra-pista';
      const bar = document.createElement('div');
      bar.className = 'indicador-barra-relleno';
      bar.style.width = `${Math.max(4, (item.value / max) * 100)}%`;
      track.appendChild(bar);
      row.append(caption, track);
      container.appendChild(row);
    });
  }

  function renderCharts(services) {
    const byTechnician = countBy(services, service => [service.tecnico || 'Sin técnico']);
    const byMagnitude = countBy(services, service => service.areas.length ? service.areas : ['Sin magnitud']);
    const byMonth = countBy(services, service => {
      const date = new Date(service.fechaHoraSalida || service.fecha);
      return Number.isNaN(date.getTime()) ? ['Sin fecha'] : [`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`];
    }).sort((a, b) => a.label.localeCompare(b.label)).slice(-6);
    renderBars('grafico-servicios-tecnico', byTechnician, 'No hay servicios para los filtros seleccionados.');
    renderBars('grafico-servicios-magnitud', byMagnitude, 'No hay magnitudes para los filtros seleccionados.');
    renderBars('grafico-servicios-mes', byMonth, 'No hay servicios fechados para los filtros seleccionados.');
  }

  function formatDate(value) {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('es-PE');
  }

  function renderDetail(services) {
    const body = document.getElementById('indicadores-tabla-cuerpo');
    const summary = document.getElementById('indicadores-tabla-resumen');
    if (!body) return;
    body.innerHTML = '';
    const ordered = services.slice().sort((a, b) => String(b.fechaHoraSalida || b.fecha).localeCompare(String(a.fechaHoraSalida || a.fecha)));
    if (summary) summary.textContent = `${ordered.length} servicio${ordered.length === 1 ? '' : 's'} mostrado${ordered.length === 1 ? '' : 's'}`;
    if (!ordered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'No hay servicios que coincidan con los filtros seleccionados.';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    ordered.forEach(service => {
      const row = document.createElement('tr');
      [service.numeroOT || '-', formatDate(service.fechaHoraSalida || service.fecha), service.tecnico || '-', service.empresa || '-', service.areas.join(', ') || '-', service.patternCount].forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${service.status === 'activo' ? 'serv' : 'devuelto'}`;
      badge.textContent = service.status === 'activo' ? 'En servicio' : 'Devuelto';
      status.appendChild(badge);
      row.appendChild(status);
      body.appendChild(row);
    });
  }

  function render({ technicians, patterns, history }) {
    const activeTechnicians = (technicians || []).filter(person => person.activo !== false && person.rol !== 'supervisor')
      .map(person => person.nombre).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));
    const magnitudes = [...new Set((patterns || []).map(pattern => pattern.area).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    fillSelect('indicadores-tecnico', activeTechnicians, 'Todos los técnicos');
    fillSelect('indicadores-magnitud', magnitudes, 'Todas las magnitudes');
    const refresh = () => {
      const services = serviceIndicators.filterServices(serviceIndicators.servicesFromHistory(history), selectedFilters());
      renderSummary(services);
      renderCharts(services);
      renderDetail(services);
    };
    ['indicadores-periodo', 'indicadores-tecnico', 'indicadores-magnitud', 'indicadores-estado'].forEach(id => {
      const control = document.getElementById(id);
      if (control) control.onchange = refresh;
    });
    refresh();
  }

  namespace.modules.indicatorsDashboard = Object.freeze({ render });
})(window);
