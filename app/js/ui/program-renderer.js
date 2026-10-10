/* Tabla del programa anual; recibe estado y apertura de actividad por inyeccion. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function render(context) {
    const {
      document, patterns, activities, shortMonths, cellsForActivity,
      escapeHTML, openCalibration
    } = context;
    const table = document.getElementById('tabla-programa');
    if (!table) return;
    const year = Number(document.getElementById('prog-anio').value) || new Date().getFullYear();
    const area = document.getElementById('prog-area').value;
    const activityFilter = document.getElementById('prog-actividad').value;
    const search = (document.getElementById('prog-buscar').value || '').trim().toLowerCase();
    const keys = activityFilter === 'Todas' ? activities.map((item) => item.clave) : [activityFilter];
    const candidates = patterns.filter((pattern) => {
      if (pattern.estado === 'Eliminado') return false;
      if (area !== 'Todas' && pattern.area !== area) return false;
      return !search || pattern.codigo.toLowerCase().includes(search) ||
        (pattern.categoria || '').toLowerCase().includes(search) ||
        (pattern.marca || '').toLowerCase().includes(search);
    });
    const rows = [];
    candidates.forEach((pattern) => {
      const group = [];
      keys.forEach((key) => {
        const cells = cellsForActivity(pattern, key, year);
        if (cells.some(Boolean)) group.push({ key, cells });
      });
      if (group.length) rows.push({ pattern, group });
    });
    rows.sort((left, right) => left.pattern.area.localeCompare(right.pattern.area) || left.pattern.codigo.localeCompare(right.pattern.codigo));

    const activityCount = rows.reduce((total, row) => total + row.group.length, 0);
    document.getElementById('prog-resumen').textContent =
      `${rows.length} patrón(es) con actividad programada o ejecutada en ${year} · ${activityCount} línea(s) de actividad.`;
    if (!rows.length) {
      table.innerHTML = `<tbody><tr><td style="padding:16px;" class="empty-msg">No hay actividades registradas ni programadas para ${year} con estos filtros.</td></tr></tbody>`;
      return;
    }

    const header = `<thead><tr><th class="col-patron">Patrón / actividad</th>${shortMonths.map((month) => `<th>${month}</th>`).join('')}</tr></thead>`;
    let body = '';
    let currentArea = null;
    rows.forEach(({ pattern, group }) => {
      if (area === 'Todas' && pattern.area !== currentArea) {
        currentArea = pattern.area;
        body += `<tr class="fila-grupo"><th class="col-patron" colspan="13">${escapeHTML(currentArea)}</th></tr>`;
      }
      group.forEach(({ key, cells }, index) => {
        const name = activities.find((item) => item.clave === key).nombre;
        const patternLabel = index === 0
          ? `<div class="codigo">${escapeHTML(pattern.codigo)}</div><div class="cal-actividad">${escapeHTML(pattern.categoria)}</div><div class="cal-actividad"><b>${escapeHTML(name)}</b></div>`
          : `<div class="cal-actividad" style="padding-left:2px;"><b>${escapeHTML(name)}</b></div>`;
        body += `<tr><th class="col-patron">${patternLabel}</th>` + cells.map((cell, month) => cell
          ? `<td class="mes" data-codigo="${escapeHTML(pattern.codigo)}" data-clave="${key}" title="${escapeHTML(cell.titulo)}"><span class="cal-marca ${cell.clase}">${escapeHTML(cell.texto)}</span></td>`
          : `<td class="mes vacia" data-codigo="${escapeHTML(pattern.codigo)}" data-clave="${key}" title="Registrar ${escapeHTML(name)} en ${shortMonths[month]} ${year}"></td>`
        ).join('') + '</tr>';
      });
    });
    table.innerHTML = header + `<tbody>${body}</tbody>`;
    table.querySelectorAll('td.mes').forEach((cell) => {
      cell.addEventListener('click', () => openCalibration(cell.getAttribute('data-codigo'), cell.getAttribute('data-clave')));
    });
  }

  namespace.modules.programRenderer = Object.freeze({ render });
})(window);
