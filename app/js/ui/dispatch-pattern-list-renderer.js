/* Lista seleccionable de patrones disponibles para una salida. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function render(context) {
    const {
      document, patterns, selected, quantities, filterPatterns, area, category,
      search, unavailableStates, isCalibrationBlocked, expiredActivities,
      formatMonth, isGroup, groupHasNoFreeUnits, availabilityDescription,
      escapeHTML, prepareGroupQuantity, renderApp
    } = context;
    const list = document.getElementById('lista-patrones');
    list.innerHTML = '';
    const filtered = filterPatterns(area, category, search, false)
      .filter((pattern) => !unavailableStates.includes(pattern.estado));
    filtered.forEach((pattern) => {
      const checked = !!selected[pattern.codigo];
      const overdue = isCalibrationBlocked(pattern);
      const group = isGroup(pattern);
      const noPieces = groupHasNoFreeUnits(pattern);
      const unavailable = (pattern.estado !== 'Disponible' || overdue || noPieces) && !checked;
      const row = document.createElement('label');
      row.className = 'patron-row';
      row.style.cursor = unavailable ? 'not-allowed' : 'pointer';
      row.style.opacity = unavailable ? '0.5' : '1';
      row.style.background = checked ? 'var(--surface-0)' : 'transparent';
      const calibrationBadge = overdue
        ? `<span class="badge vencido" title="${escapeHTML(expiredActivities(pattern).map((item) => `${item.nombre} (${formatMonth(item.mesVencimiento)})`).join(', '))} - no puede salir a servicio">Vencido</span>`
        : '';
      const stateBadge = group
        ? `<span class="badge ${noPieces ? 'serv' : 'grupo'}" title="Patrón de grupo: se indica la cantidad al registrar la salida">${escapeHTML(availabilityDescription(pattern))}</span>`
        : `<span class="badge ${pattern.estado === 'Disponible' ? 'disp' : 'serv'}">${escapeHTML(pattern.estado)}</span>`;
      row.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''} ${unavailable ? 'disabled' : ''} data-codigo="${escapeHTML(pattern.codigo)}"><div style="flex:1;"><div class="codigo">${escapeHTML(pattern.codigo)}</div><div class="categoria">${escapeHTML(pattern.area)} - ${escapeHTML(pattern.categoria)}</div></div>${stateBadge}${calibrationBadge}`;
      list.appendChild(row);
    });
    list.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
      const code = event.target.getAttribute('data-codigo');
      if (event.target.checked) {
        selected[code] = true;
        prepareGroupQuantity(code);
      } else {
        selected[code] = false;
        delete quantities[code];
      }
      renderApp();
    }));
  }

  namespace.modules.dispatchPatternListRenderer = Object.freeze({ render });
})(window);
