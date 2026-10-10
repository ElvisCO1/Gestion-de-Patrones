/* Reglas de negocio al escanear un patron que retorna al laboratorio. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.services = namespace.services || {};

  function processReturnScan(context, scannedCode) {
    const { document, pending, findScannedPattern, activeDispatchOf, dispatchesOfPattern,
      recordQuantity, beep, renderList } = context;
    const echo = document.getElementById('escaneo-devolucion-eco');
    const show = (text, type) => { if (echo) { echo.textContent = text; echo.className = `escaneo-eco ${type}`; } };
    const { patron, ambiguos } = findScannedPattern(scannedCode);
    if (ambiguos.length) {
      beep('error');
      show(`"${scannedCode}": hay varios patrones con ese código (${ambiguos.map((item) => item.codigo).join(', ')}). Devuélvelo desde el historial.`, 'error');
      return;
    }
    if (!patron) { beep('error'); show(`"${scannedCode}" no corresponde a ningún patrón del catálogo.`, 'error'); return; }
    if (pending.some((item) => item.codigo === patron.codigo)) { beep('aviso'); show(`${patron.codigo} ya estaba en la lista.`, 'aviso'); return; }
    const dispatch = activeDispatchOf(patron.codigo);
    if (!dispatch) {
      beep('error');
      const latest = dispatchesOfPattern(patron.codigo)[0];
      const detail = latest ? ` Su última salida (OT ${latest.numeroOT}) ya figura como "${latest.estadoMovimiento}".` : ' No tiene ninguna salida registrada.';
      show(`${patron.codigo} no está fuera del laboratorio.${detail}`, 'error');
      return;
    }
    const quantity = recordQuantity(dispatch);
    pending.push({ registroId: dispatch.id, codigo: patron.codigo, cantidad: quantity });
    beep('ok');
    show(`${patron.codigo}${quantity > 1 ? ` (${quantity} piezas)` : ''} añadido — OT ${dispatch.numeroOT}, ${dispatch.empresa || 'sin empresa'}`, 'ok');
    renderList();
  }

  namespace.services.returnScanActions = Object.freeze({ processReturnScan });
})(window);
