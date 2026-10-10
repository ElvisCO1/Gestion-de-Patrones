/* Avisos no bloqueantes y confirmaciones reutilizables de la interfaz. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};
  let resolveConfirmation = null;
  function notify(document, message, type = 'ok', action = null, persistent = false) {
    const container = document.getElementById('toasts');
    if (!container) { console.log(message); return; }
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : 'ok'}`;
    const text = document.createElement('div');
    text.className = 'toast-txt';
    text.textContent = message;
    toast.appendChild(text);
    let timer = null;
    const close = () => { clearTimeout(timer); toast.remove(); };
    if (action) {
      const button = document.createElement('button');
      button.className = 'btn-mini';
      button.textContent = action.etiqueta || 'Deshacer';
      button.addEventListener('click', async () => { close(); await action.ejecutar(); });
      toast.appendChild(button);
    }
    const closeButton = document.createElement('button');
    closeButton.className = 'btn-mini';
    closeButton.textContent = '×';
    closeButton.title = 'Cerrar';
    closeButton.addEventListener('click', close);
    toast.appendChild(closeButton);
    container.appendChild(toast);
    if (!persistent) timer = setTimeout(close, action ? 12000 : (type === 'error' ? 9000 : 5000));
  }
  function confirm(document, options = {}) {
    const { titulo = 'Confirmar acción', mensaje = '', textoOk = 'Confirmar', peligro = false, textoAlterno = null, peligroAlterno = false } = options;
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-confirmar-accion');
      if (!overlay) { resolve(false); return; }
      document.getElementById('confirmar-titulo').textContent = titulo;
      document.getElementById('confirmar-mensaje').textContent = mensaje;
      const ok = document.getElementById('confirmar-ok');
      ok.textContent = textoOk;
      ok.className = peligro ? 'btn-peligro btn-mini' : 'btn-primario btn-mini';
      const alternate = document.getElementById('confirmar-alterno');
      if (textoAlterno) {
        alternate.textContent = textoAlterno;
        alternate.className = peligroAlterno ? 'btn-peligro btn-mini' : 'btn-mini';
        alternate.style.display = 'inline-block';
      } else alternate.style.display = 'none';
      overlay.classList.add('open');
      ok.focus();
      resolveConfirmation = resolve;
    });
  }
  function closeConfirmation(document, answer) {
    const overlay = document.getElementById('modal-confirmar-accion');
    if (overlay) overlay.classList.remove('open');
    if (resolveConfirmation) { const resolve = resolveConfirmation; resolveConfirmation = null; resolve(answer); }
  }
  namespace.modules.feedback = Object.freeze({ notify, confirm, closeConfirmation });
})(window);
