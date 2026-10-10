/* Resumen de patrones seleccionados para una salida, incluidos grupos. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function render(context) {
    const {
      document, patterns, selected, quantities, selectedCodes, isGroup,
      selectedQuantity, availableUnits, escapeHTML, renderApp, updateCount
    } = context;
    const box = document.getElementById('resumen-seleccion');
    const chips = document.getElementById('resumen-chips');
    const empty = document.getElementById('salida-sidebar-vacio');
    const sidebar = document.querySelector('.salida-sidebar');
    if (!box || !chips) return;
    const codes = selectedCodes();
    document.getElementById('resumen-count').textContent = codes.length;
    if (!codes.length) {
      box.style.display = 'none';
      chips.innerHTML = '';
      if (empty) empty.style.display = '';
      if (sidebar) sidebar.setAttribute('aria-label', 'Sin patrones seleccionados');
      return;
    }
    // Debe conservar el layout flex: la lista ocupa únicamente el espacio
    // libre entre su cabecera y el botón fijo de registrar.
    box.style.display = 'flex';
    if (empty) empty.style.display = 'none';
    if (sidebar) sidebar.setAttribute('aria-label', `${codes.length} patrones seleccionados`);
    chips.innerHTML = codes.sort((left, right) => left.localeCompare(right, 'es', { numeric: true })).map((code) => {
        const pattern = patterns.find((item) => item.codigo === code);
        if (isGroup(pattern)) {
          const available = availableUnits(pattern);
          const quantity = selectedQuantity(code);
          return `<span class="chip-patron chip-grupo${quantity > available ? ' excede' : ''}"><span class="chip-codigo">${escapeHTML(code)}</span><input type="number" class="chip-cantidad" data-codigo="${escapeHTML(code)}" value="${quantity}" min="1" max="${available}" step="1" title="Cuántas piezas de este grupo salen (${available} disponibles)" aria-label="Cantidad de ${escapeHTML(code)}"><span class="chip-valor">de ${available}</span><button type="button" class="btn-quitar-chip" data-codigo="${escapeHTML(code)}" title="Quitar ${escapeHTML(code)} de la selección" aria-label="Quitar ${escapeHTML(code)}">×</button></span>`;
        }
        return `<span class="chip-patron"><span class="chip-codigo">${escapeHTML(code)}</span><button type="button" class="btn-quitar-chip" data-codigo="${escapeHTML(code)}" title="Quitar ${escapeHTML(code)} de la selección" aria-label="Quitar ${escapeHTML(code)}">×</button></span>`;
    }).join('');

    chips.querySelectorAll('.btn-quitar-chip').forEach((button) => button.addEventListener('click', (event) => {
      const code = event.currentTarget.getAttribute('data-codigo');
      delete selected[code];
      delete quantities[code];
      renderApp();
    }));
    chips.querySelectorAll('.chip-cantidad').forEach((input) => {
      input.addEventListener('input', (event) => {
        const code = event.currentTarget.getAttribute('data-codigo');
        quantities[code] = event.currentTarget.value;
        const available = availableUnits(patterns.find((item) => item.codigo === code));
        const count = parseInt(event.currentTarget.value, 10);
        event.currentTarget.closest('.chip-patron').classList.toggle('excede', Number.isInteger(count) && count > available);
        updateCount();
      });
      input.addEventListener('change', (event) => {
        const code = event.currentTarget.getAttribute('data-codigo');
        const available = availableUnits(patterns.find((item) => item.codigo === code));
        let count = parseInt(event.currentTarget.value, 10);
        if (!Number.isInteger(count) || count < 1) count = 1;
        if (count > available) count = Math.max(1, available);
        quantities[code] = count;
        event.currentTarget.value = count;
        event.currentTarget.closest('.chip-patron').classList.remove('excede');
        updateCount();
      });
    });
    updateCount();
  }

  namespace.modules.dispatchSummaryRenderer = Object.freeze({ render });
})(window);
