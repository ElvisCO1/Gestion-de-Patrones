/* Eventos de Clientes: sedes, edicion y bajas con trazabilidad. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function bind(context, container) {
    const {
      document, history, STORES, normalizeName, getClient, getSite,
      clientNameExists, addSite, render, confirm, notify, saveRecord,
      deleteRecord, clientActions, getSelectedSiteId, setSelectedSiteId,
      getSelectedClientId, setSelectedClientId
    } = context;
    const toggle = (buttonSelector, formPrefix, closePrefix) => {
      container.querySelectorAll(buttonSelector).forEach((button) => button.addEventListener('click', (event) => {
        const id = event.target.getAttribute('data-cliente');
        if (closePrefix) document.getElementById(`${closePrefix}${id}`).classList.remove('open');
        const form = document.getElementById(`${formPrefix}${id}`);
        form.classList.toggle('open');
        if (form.classList.contains('open')) form.querySelector('input').focus();
      }));
    };
    toggle('.btn-nueva-sede', 'form-sede-', 'form-cliente-');
    toggle('.btn-editar-cliente', 'form-cliente-', 'form-sede-');
    [['.btn-cancelar-sede', 'form-sede-'], ['.btn-cancelar-cliente', 'form-cliente-']].forEach(([selector, prefix]) => {
      container.querySelectorAll(selector).forEach((button) => button.addEventListener('click', (event) => {
        document.getElementById(`${prefix}${event.target.getAttribute('data-cliente')}`).classList.remove('open');
      }));
    });

    container.querySelectorAll('.btn-guardar-sede').forEach((button) => button.addEventListener('click', async (event) => {
      const id = event.target.getAttribute('data-cliente');
      const form = document.getElementById(`form-sede-${id}`);
      const error = form.querySelector('.fs-error');
      error.style.display = 'none';
      const name = form.querySelector('.fs-nombre').value.trim();
      const address = form.querySelector('.fs-direccion').value.trim();
      if (!name || !address) {
        error.textContent = !name ? 'Ponle un nombre a la sede.' : 'Escribe la dirección de la sede.';
        error.style.display = 'block';
        return;
      }
      const client = getClient(id);
      if (client && (client.sedes || []).some((site) => normalizeName(site.nombre).toLowerCase() === name.toLowerCase())) {
        error.textContent = 'Esta empresa ya tiene una sede con ese nombre.';
        error.style.display = 'block';
        return;
      }
      await addSite(id, { nombre: name, direccion: address, contacto: form.querySelector('.fs-contacto').value, telefono: form.querySelector('.fs-telefono').value });
      await render();
      notify(`Sede "${name}" añadida.`, 'ok');
    }));

    container.querySelectorAll('.btn-guardar-cliente').forEach((button) => button.addEventListener('click', async (event) => {
      const id = event.target.getAttribute('data-cliente');
      const form = document.getElementById(`form-cliente-${id}`);
      const error = form.querySelector('.fc-error');
      const name = form.querySelector('.fc-nombre').value.trim();
      error.style.display = 'none';
      if (!name || clientNameExists(name, id)) {
        error.textContent = !name ? 'El nombre no puede quedar vacío.' : 'Ya existe otra empresa con ese nombre.';
        error.style.display = 'block';
        return;
      }
      const client = getClient(id);
      if (!client) return;
      await clientActions.updateClient({ normalizeName, saveRecord, STORES }, client, { nombre: name, ruc: form.querySelector('.fc-ruc').value });
      await render();
      notify('Datos de la empresa actualizados.', 'ok');
    }));

    container.querySelectorAll('.btn-eliminar-sede').forEach((button) => button.addEventListener('click', async (event) => {
      const clientId = event.target.getAttribute('data-cliente');
      const siteId = event.target.getAttribute('data-sede');
      const client = getClient(clientId);
      const site = getSite(client, siteId);
      if (!client || !site) return;
      const accepted = await confirm({ titulo: 'Quitar sede', mensaje: `Se quitará la sede "${site.nombre}" de ${client.nombre}.\n\nLas salidas ya registradas conservan la dirección con la que se emitieron, así que el historial y las actas antiguas no cambian.`, textoOk: 'Quitar sede', peligro: true });
      if (!accepted) return;
      const previousSites = await clientActions.removeSite({ saveRecord, STORES }, client, siteId);
      if (getSelectedSiteId() === siteId) setSelectedSiteId('');
      await render();
      notify(`Sede "${site.nombre}" eliminada.`, 'ok', { etiqueta: 'Deshacer', ejecutar: async () => { const current = getClient(clientId); if (current) await saveRecord(STORES.clientes, { ...current, sedes: previousSites }); await render(); } });
    }));

    container.querySelectorAll('.btn-eliminar-cliente').forEach((button) => button.addEventListener('click', async (event) => {
      const id = event.target.getAttribute('data-cliente');
      const client = getClient(id);
      if (!client) return;
      const dispatches = history.filter((item) => item.clienteId === id).length;
      const accepted = await confirm({ titulo: 'Eliminar empresa', mensaje: `Se eliminará "${client.nombre}" del directorio de clientes${dispatches ? `.\n\nTiene ${dispatches} salida(s) en el historial: esos registros NO se borran y conservan el nombre y la dirección con los que se emitieron.` : '.'}`, textoOk: 'Eliminar empresa', peligro: true });
      if (!accepted) return;
      await clientActions.removeClient({ deleteRecord, STORES }, id);
      if (getSelectedClientId() === id) { setSelectedClientId(''); setSelectedSiteId(''); }
      await render();
      notify(`Empresa "${client.nombre}" eliminada del directorio.`, 'ok', { etiqueta: 'Deshacer', ejecutar: async () => { await saveRecord(STORES.clientes, client); await render(); } });
    }));
  }

  namespace.modules.clientsController = Object.freeze({ bind });
})(window);
