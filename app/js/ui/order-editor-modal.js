/* Apertura del modal de correccion de una salida/OT. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function open(context, dispatchId) {
    const { document, history, dispatchKey, clients, normalizeName, serviceNumber,
      localTimeFromIso, populateSelects, renderPatterns, setEdition } = context;
    const records = history.filter((record) => dispatchKey(record) === dispatchId);
    if (!records.length) return null;
    const edition = {
      salidaId: dispatchId,
      salidaIdReal: records[0].salidaId || '',
      numeroOTOriginal: records[0].numeroOT,
      fechaOriginal: records[0].fecha,
      registros: records,
      retirar: {},
      agregar: {},
      clienteId: records[0].clienteId || '',
      sedeId: records[0].sedeId || ''
    };
    if (!edition.clienteId && records[0].empresa) {
      const byName = clients.find((client) => normalizeName(client.nombre).toLowerCase() === normalizeName(records[0].empresa).toLowerCase());
      if (byName) edition.clienteId = byName.id;
    }
    setEdition(edition);
    const service = serviceNumber(dispatchId);
    document.getElementById('edit-ot-titulo').textContent = records[0].numeroOT + (service ? ` · servicio ${service}` : '');
    document.getElementById('edit-ot-numero').value = records[0].numeroOT;
    document.getElementById('edit-ot-fecha').value = records[0].fecha;
    document.getElementById('edit-ot-hora').value = localTimeFromIso(records[0].fechaHoraSalida) || '';
    document.getElementById('edit-ot-motivo').value = '';
    document.getElementById('edit-ot-autor').value = '';
    document.getElementById('edit-ot-buscar').value = '';
    document.getElementById('edit-ot-agregar-resultados').innerHTML = '';
    document.getElementById('edit-ot-error').style.display = 'none';
    populateSelects();
    renderPatterns();
    document.getElementById('modal-editar-ot').classList.add('open');
    return edition;
  }

  namespace.modules.orderEditorModal = Object.freeze({ open });
})(window);
