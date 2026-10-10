/* Calcula los cambios trazables de una correccion de salida/OT. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function calculateChanges(context) {
    const {
      document, edition, getClient, getSite, formatDate, localTimeFromIso,
      laboratoryManagerForCodes
    } = context;
    const record = edition.registros[0];
    const changes = [];
    const orderNumber = document.getElementById('edit-ot-numero').value.trim();
    const date = document.getElementById('edit-ot-fecha').value;
    const previousTime = localTimeFromIso(record.fechaHoraSalida);
    const time = document.getElementById('edit-ot-hora').value || previousTime || '00:00:00';
    const technician = document.getElementById('edit-ot-tecnico').value;
    const client = getClient(edition.clienteId);
    const site = getSite(client, edition.sedeId);

    if (orderNumber !== record.numeroOT) changes.push(`N.° de OT: "${record.numeroOT}" → "${orderNumber}"`);
    if (date !== record.fecha) changes.push(`Fecha de salida: ${formatDate(record.fecha)} → ${formatDate(date)}`);
    if (time.slice(0, 5) !== String(previousTime || '').slice(0, 5)) changes.push(`Hora de salida: ${previousTime || 'sin hora'} → ${time}`);
    if (technician !== (record.tecnico || '')) changes.push(`Técnico: "${record.tecnico || 'sin asignar'}" → "${technician || 'sin asignar'}"`);
    const company = client ? client.nombre : '';
    if (company !== (record.empresa || '')) changes.push(`Empresa: "${record.empresa || 'sin empresa'}" → "${company || 'sin empresa'}"`);
    const siteName = site ? site.nombre : '';
    if (siteName !== (record.sede || '')) changes.push(`Sede: "${record.sede || 'sin sede'}" → "${siteName || 'sin sede'}"`);
    const address = site ? (site.direccion || '') : '';
    if (address !== (record.direccion || '')) changes.push(`Dirección: "${record.direccion || 'sin dirección'}" → "${address || 'sin dirección'}"`);

    const removed = edition.registros.filter((item) => edition.retirar[item.id]).map((item) => item.codigo);
    if (removed.length) changes.push(`Patrones retirados de la OT (anulados): ${removed.join(', ')}`);
    const added = Object.keys(edition.agregar).filter((code) => edition.agregar[code]);
    if (added.length) changes.push(`Patrones añadidos a la OT: ${added.map((code) => +edition.agregar[code] > 1 ? `${code} (${+edition.agregar[code]} piezas)` : code).join(', ')}`);
    const finalCodes = edition.registros
      .filter((item) => item.estadoMovimiento !== 'Anulado' && !edition.retirar[item.id])
      .map((item) => item.codigo)
      .concat(added);
    const manager = laboratoryManagerForCodes(finalCodes);
    const previousManager = String(record.encargadoLaboratorio || '');
    if (manager !== previousManager) changes.push(`Encargado de laboratorio: "${previousManager || 'sin encargado'}" → "${manager || 'sin encargado'}"`);

    return { cambios: changes, nuevoNumero: orderNumber, nuevaFecha: date, nuevaHora: time,
      nuevoTecnico: technician, cliente: client, sede: site, retirados: removed,
      agregados: added, nuevoEncargado: manager };
  }

  namespace.modules.orderEdit = Object.freeze({ calculateChanges });
})(window);
