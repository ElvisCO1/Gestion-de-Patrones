/* Listas interactivas del editor de una salida/OT. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function renderPatterns(context) {
    const { document, edition, patterns, isMovementClosed, quantityLabel,
      escapeHTML, rerenderPatterns, rerenderSearch } = context;
    if (!edition) return;
    const container = document.getElementById('edit-ot-patrones');
    const active = edition.registros.filter((record) => record.estadoMovimiento !== 'Anulado');
    const cancelled = edition.registros.filter((record) => record.estadoMovimiento === 'Anulado');
    const addedCodes = Object.keys(edition.agregar).filter((code) => edition.agregar[code]);
    document.getElementById('edit-ot-conteo').textContent = active.filter((record) => !edition.retirar[record.id]).length + addedCodes.length;
    let html = active.map((record) => {
      const marked = !!edition.retirar[record.id];
      const returned = isMovementClosed(record);
      return `<div class="edit-patron-line ${marked ? 'marcado-retirar' : ''}"><div class="edit-patron-datos"><b>${escapeHTML(record.codigo)}</b>${quantityLabel(record)}<div class="edit-patron-sub">${escapeHTML(record.area || '')}${record.area ? ' · ' : ''}${escapeHTML(record.categoria || '')} · ${escapeHTML(record.estadoMovimiento || 'En servicio')}</div></div><button class="btn-mini ${marked ? '' : 'btn-eliminar-patron'} btn-toggle-retirar" data-id="${escapeHTML(record.id)}">${marked ? 'Conservar' : (returned ? 'Retirar (fue error)' : 'Retirar de la OT')}</button></div>`;
    }).join('');
    html += addedCodes.map((code) => {
      const pattern = patterns.find((item) => item.codigo === code);
      return `<div class="edit-patron-line"><div class="edit-patron-datos"><b>${escapeHTML(code)}</b> <span class="badge disp">Se añadirá${+edition.agregar[code] > 1 ? ` × ${+edition.agregar[code]} piezas` : ''}</span><div class="edit-patron-sub">${escapeHTML(pattern ? (pattern.area || '') : '')}${pattern && pattern.area ? ' · ' : ''}${escapeHTML(pattern ? pattern.categoria : '')}</div></div><button class="btn-mini btn-quitar-agregado" data-codigo="${escapeHTML(code)}">Cancelar</button></div>`;
    }).join('');
    if (cancelled.length) html += `<div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border);">${cancelled.map((record) => `<div class="edit-patron-line" style="border-top:none;"><div class="edit-patron-datos" style="opacity:.6;"><b style="text-decoration:line-through;">${escapeHTML(record.codigo)}</b><span class="badge anulado">Anulado</span><div class="edit-patron-sub">${escapeHTML(record.motivoAnulacion || 'Retirado en una corrección anterior')}</div></div></div>`).join('')}</div>`;
    container.innerHTML = html || '<p class="obs-vacio">Esta OT se quedaría sin patrones. Añade al menos uno.</p>';
    container.querySelectorAll('.btn-toggle-retirar').forEach((button) => button.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-id');
      if (edition.retirar[id]) delete edition.retirar[id]; else edition.retirar[id] = true;
      rerenderPatterns();
    }));
    container.querySelectorAll('.btn-quitar-agregado').forEach((button) => button.addEventListener('click', (event) => {
      delete edition.agregar[event.currentTarget.getAttribute('data-codigo')];
      rerenderPatterns();
      rerenderSearch();
    }));
  }

  function renderSearch(context) {
    const { document, edition, patterns, unavailableStates, matchesSearch,
      calibrationBlocked, isGroup, availableUnits, escapeHTML, rerenderPatterns,
      rerenderSearch } = context;
    if (!edition) return;
    const query = document.getElementById('edit-ot-buscar').value.trim().toLowerCase();
    const box = document.getElementById('edit-ot-agregar-resultados');
    if (query.length < 2) { box.innerHTML = ''; return; }
    const alreadyInOrder = new Set(edition.registros.filter((record) => record.estadoMovimiento !== 'Anulado' && !edition.retirar[record.id]).map((record) => record.codigo));
    const candidates = patterns.filter((pattern) => !unavailableStates.includes(pattern.estado))
      .filter((pattern) => !alreadyInOrder.has(pattern.codigo) && !edition.agregar[pattern.codigo])
      .filter((pattern) => matchesSearch(pattern, query)).slice(0, 25);
    if (!candidates.length) { box.innerHTML = '<div class="edit-agregar-row"><span class="obs-vacio">Sin resultados.</span></div>'; return; }
    box.innerHTML = candidates.map((pattern) => {
      const overdue = calibrationBlocked(pattern);
      const available = pattern.estado === 'Disponible' && !overdue;
      const reason = overdue ? 'Actividad vencida' : (pattern.estado !== 'Disponible' ? pattern.estado : '');
      const button = isGroup(pattern)
        ? `<span style="display:flex; gap:6px; align-items:center;"><input type="number" class="edit-cantidad-grupo" data-codigo="${escapeHTML(pattern.codigo)}" value="1" min="1" max="${availableUnits(pattern)}" step="1" style="width:64px; height:30px; text-align:center;" title="Piezas de este grupo (${availableUnits(pattern)} disponibles)"><button class="btn-mini btn-agregar-a-ot" data-codigo="${escapeHTML(pattern.codigo)}">Añadir</button></span>`
        : `<button class="btn-mini btn-agregar-a-ot" data-codigo="${escapeHTML(pattern.codigo)}">Añadir</button>`;
      return `<div class="edit-agregar-row"><div><b>${escapeHTML(pattern.codigo)}</b><div class="edit-patron-sub">${escapeHTML(pattern.area || '')} · ${escapeHTML(pattern.categoria || '')}</div></div>${available ? button : `<span class="badge ${overdue ? 'vencido' : 'serv'}">${escapeHTML(reason)}</span>`}</div>`;
    }).join('');
    box.querySelectorAll('.btn-agregar-a-ot').forEach((button) => button.addEventListener('click', (event) => {
      const code = event.currentTarget.getAttribute('data-codigo');
      const field = box.querySelector(`.edit-cantidad-grupo[data-codigo="${CSS.escape(code)}"]`);
      edition.agregar[code] = field ? Math.max(1, parseInt(field.value, 10) || 1) : 1;
      rerenderPatterns();
      rerenderSearch();
    }));
  }

  namespace.modules.orderEditorRenderer = Object.freeze({ renderPatterns, renderSearch });
})(window);
