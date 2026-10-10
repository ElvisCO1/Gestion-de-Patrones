/* Presentacion del modal de observaciones y correcciones de Historial. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function open(context, destination) {
    const { document, history, dispatchKey, serviceNumber, formatDate, escapeHTML } = context;
    const { registroId, salidaId, correccion, destino = 'interno', editarObservacionId = null } = destination;
    const title = document.getElementById('obs-titulo');
    const details = document.getElementById('obs-contexto');
    const label = document.getElementById('obs-label-texto');
    const textarea = document.getElementById('obs-texto');
    const author = document.getElementById('obs-autor');
    const save = document.getElementById('obs-guardar');
    const help = document.getElementById('obs-ayuda');
    document.getElementById('obs-error').style.display = 'none';
    textarea.value = '';
    author.value = '';

    if (correccion) {
      const record = history.find((item) => item.id === registroId);
      title.textContent = 'Corregir devoluci\u00f3n';
      details.innerHTML = record ? `El patr\u00f3n <b>${escapeHTML(record.codigo)}</b> de la OT <b>${escapeHTML(record.numeroOT)}</b> figura como \u00ab${escapeHTML(record.estadoMovimiento)}\u00bb.` : '';
      label.textContent = 'Motivo de la correcci\u00f3n (obligatorio)';
      textarea.placeholder = 'Ej: Se marc\u00f3 devuelto por error; el patr\u00f3n sigue en la sede del cliente.';
      save.textContent = 'Corregir y reabrir';
      help.textContent = 'La correcci\u00f3n queda como constancia interna y no se imprime en el acta PDF.';
    } else if (registroId) {
      const record = history.find((item) => item.id === registroId);
      title.textContent = 'A\u00f1adir observaci\u00f3n';
      details.innerHTML = record ? `Patr\u00f3n <b>${escapeHTML(record.codigo)}</b> \u00b7 OT <b>${escapeHTML(record.numeroOT)}</b>` : '';
      label.textContent = 'Observaci\u00f3n interna';
      textarea.placeholder = 'Ej: El cliente report\u00f3 golpe en el estuche durante el traslado.';
      save.textContent = 'Guardar observaci\u00f3n';
      help.textContent = 'Esta observaci\u00f3n pertenece al patr\u00f3n y queda como trazabilidad interna.';
    } else {
      const records = history.filter((item) => dispatchKey(item) === salidaId);
      const reference = records[0];
      const previous = editarObservacionId ? records
        .flatMap(item => Array.isArray(item.observaciones) ? item.observaciones : [])
        .find(item => item.id === editarObservacionId && item.destino === 'documento' && item.estado !== 'reemplazada') : null;
      const service = serviceNumber(salidaId);
      const paraDocumento = destino === 'documento';
      const editing = Boolean(previous);
      title.textContent = editing ? 'Editar observaci\u00f3n para el PDF' : paraDocumento ? 'Observaci\u00f3n para el PDF' : 'Observaci\u00f3n interna del servicio';
      details.innerHTML = reference ? `Aplica a todo este servicio de la orden <b>${escapeHTML(reference.numeroOT)}</b>${service ? ` (servicio ${service})` : ''} del ${escapeHTML(formatDate(reference.fecha))}.` : '';
      label.textContent = paraDocumento ? 'Texto que aparecer\u00e1 en el acta PDF' : 'Nota interna';
      textarea.placeholder = paraDocumento ? 'Ej: Patrones entregados en buen estado y conforme a la relaci\u00f3n.' : 'Ej: El servicio se reprogram\u00f3; los patrones permanecieron en la sede dos d\u00edas m\u00e1s.';
      textarea.value = previous ? previous.texto || '' : '';
      author.value = previous ? previous.autor || '' : '';
      save.textContent = editing ? 'Guardar nueva versi\u00f3n' : paraDocumento ? 'Guardar para PDF' : 'Guardar nota interna';
      help.textContent = editing
        ? 'La versi\u00f3n anterior quedar\u00e1 en el historial interno y no se imprimir\u00e1 en el PDF.'
        : paraDocumento
          ? 'Esta nota se ver\u00e1 en el historial y se imprimir\u00e1 debajo de la tabla de patrones del acta PDF.'
          : 'Esta nota se conserva en el historial y en el JSON; no se imprime en el acta PDF.';
    }
    document.getElementById('modal-observacion').classList.add('open');
    textarea.focus();
  }

  namespace.modules.observationModal = Object.freeze({ open });
})(window);
