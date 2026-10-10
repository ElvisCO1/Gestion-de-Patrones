/* Reglas de negocio al escanear un patron para una salida. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.services = namespace.services || {};

  function processDispatchScan(context, scannedCode) {
    const {
      document, selected, findScannedPattern, beep, notify, unavailableStates,
      groupHasNoFreeUnits, groupUnits, activeDispatchOf, isCalibrationBlocked,
      expiredActivities, formatMonth, isGroup, prepareGroupQuantity,
      availableUnits, render
    } = context;
    const echo = document.getElementById('escaneo-salida-eco');
    const show = (text, type) => { if (echo) { echo.textContent = text; echo.className = `escaneo-eco ${type}`; } };
    const { patron, ambiguos } = findScannedPattern(scannedCode);
    if (ambiguos.length) {
      beep('error');
      show(`"${scannedCode}": hay ${ambiguos.length} patrones con ese código (${ambiguos.map((item) => item.codigo).join(', ')}). Selecciónalo a mano.`, 'error');
      notify(`Código ambiguo: ${ambiguos.map((item) => item.codigo).join(', ')}. Márcalo manualmente.`, 'error');
      return;
    }
    if (!patron) {
      beep('error');
      show(`"${scannedCode}" no corresponde a ningún patrón del catálogo.`, 'error');
      notify(`El código "${scannedCode}" no está en el catálogo. Revisa la etiqueta o búscalo a mano.`, 'error');
      return;
    }
    if (selected[patron.codigo]) { beep('aviso'); show(`${patron.codigo} ya estaba en la lista.`, 'aviso'); return; }
    if (unavailableStates.includes(patron.estado)) {
      beep('error');
      show(`${patron.codigo} está como "${patron.estado}" y no puede salir.`, 'error');
      notify(`${patron.codigo} está como "${patron.estado}": no puede salir a servicio.`, 'error');
      return;
    }
    if (groupHasNoFreeUnits(patron)) {
      beep('error');
      show(`${patron.codigo}: no queda ninguna pieza libre del grupo (las ${groupUnits(patron)} están fuera).`, 'error');
      notify(`${patron.codigo} no tiene piezas disponibles ahora mismo.`, 'error');
      return;
    }
    if (patron.estado !== 'Disponible') {
      beep('error');
      const dispatch = activeDispatchOf(patron.codigo);
      const detail = dispatch ? ` (OT ${dispatch.numeroOT}, ${dispatch.empresa || 'sin empresa'})` : '';
      show(`${patron.codigo} está "${patron.estado}"${detail}.`, 'error');
      notify(`${patron.codigo} no está disponible: figura como "${patron.estado}"${detail}.`, 'error');
      return;
    }
    if (isCalibrationBlocked(patron)) {
      beep('error');
      const detail = expiredActivities(patron).map((item) => `${item.nombre} venció ${formatMonth(item.mesVencimiento)}`).join('; ');
      show(`${patron.codigo} tiene actividad vencida: ${detail}.`, 'error');
      notify(`${patron.codigo} no puede salir: ${detail}.`, 'error');
      return;
    }
    selected[patron.codigo] = true;
    beep('ok');
    if (isGroup(patron)) {
      prepareGroupQuantity(patron.codigo);
      show(`${patron.codigo} añadido — escribe cuántas piezas salen (${availableUnits(patron)} disponibles).`, 'aviso');
      render().then(() => {
        const field = document.querySelector(`.chip-cantidad[data-codigo="${CSS.escape(patron.codigo)}"]`);
        if (field) { field.focus(); field.select(); }
      });
      return;
    }
    show(`${patron.codigo} añadido — ${patron.area || ''}${patron.area ? ' · ' : ''}${patron.categoria || ''}`, 'ok');
    render();
  }

  namespace.services.dispatchScanActions = Object.freeze({ processDispatchScan });
})(window);
