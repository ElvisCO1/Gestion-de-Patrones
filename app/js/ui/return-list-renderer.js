/* Lista editable de retornos pendientes antes de confirmar la devolucion. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function render(context) {
    const { document, pending, history, daysSince, recordQuantity, escapeHTML, rerender } = context;
    const container = document.getElementById('dev-lista');
    document.getElementById('dev-count').textContent = pending.length;
    document.getElementById('dev-confirmar').disabled = pending.length === 0;
    if (!pending.length) {
      container.innerHTML = '<p class="empty-msg" style="padding:14px;">Todavía no has escaneado nada. Los patrones aparecerán aquí conforme los leas.</p>';
      return;
    }
    container.innerHTML = pending.map((item) => {
      const record = history.find((entry) => entry.id === item.registroId);
      if (!record) return '';
      const days = daysSince(record.fecha);
      const sent = recordQuantity(record);
      const quantity = sent > 1 ? `<div style="display:flex; align-items:center; gap:6px;"><label class="field-label" style="margin:0; white-space:nowrap;">Vuelven</label><input type="number" class="dev-cantidad" data-id="${escapeHTML(item.registroId)}" value="${item.cantidad}" min="1" max="${sent}" step="1" style="width:70px; height:30px; text-align:center;"><span style="font-size:12px; color:var(--text-secondary);">de ${sent}</span></div>` : '';
      return `<div class="dev-linea"><div style="flex:1;"><div class="dev-codigo">${escapeHTML(record.codigo)}${sent > 1 ? ` <span class="badge grupo">salieron ${sent}</span>` : ''}</div><div class="dev-sub">OT ${escapeHTML(record.numeroOT)} · ${escapeHTML(record.empresa || 'sin empresa')}${record.sede ? ' · ' + escapeHTML(record.sede) : ''} · ${escapeHTML(record.tecnico || 'sin técnico')}${days !== null ? ` · ${days} día(s) fuera` : ''}</div></div>${quantity}<button class="btn-mini btn-quitar-devolucion" data-id="${escapeHTML(item.registroId)}" title="Quitar de la lista">Quitar</button></div>`;
    }).join('');
    container.querySelectorAll('.btn-quitar-devolucion').forEach((button) => button.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-id');
      const position = pending.findIndex((item) => item.registroId === id);
      if (position >= 0) pending.splice(position, 1);
      rerender();
    }));
    container.querySelectorAll('.dev-cantidad').forEach((input) => {
      const setQuantity = (event, normalize) => {
        const id = event.currentTarget.getAttribute('data-id');
        const item = pending.find((entry) => entry.registroId === id);
        const record = history.find((entry) => entry.id === id);
        if (!item || !record) return;
        const sent = recordQuantity(record);
        let quantity = parseInt(event.currentTarget.value, 10);
        if (normalize) {
          if (!Number.isInteger(quantity) || quantity < 1) quantity = 1;
          if (quantity > sent) quantity = sent;
          event.currentTarget.value = quantity;
        }
        item.cantidad = Number.isInteger(quantity) && quantity > 0 ? Math.min(quantity, sent) : 1;
      };
      input.addEventListener('input', (event) => setQuantity(event, false));
      input.addEventListener('change', (event) => setQuantity(event, true));
    });
  }

  namespace.modules.returnListRenderer = Object.freeze({ render });
})(window);
