/* Operaciones persistentes del directorio de clientes y sedes. */
(function (global) {
  "use strict";

  async function createClient(context, data) {
    const { nuevoId, normalizarNombre, saveRecord, STORES } = context;
    const { nombre, ruc, sedeNombre, sedeDireccion, sedeContacto, sedeTelefono } = data;
    const cliente = {
      id: nuevoId("cli"),
      nombre: normalizarNombre(nombre),
      ruc: String(ruc || "").trim(),
      sedes: [],
      creadoEn: new Date().toISOString()
    };
    if (String(sedeDireccion || "").trim() || String(sedeNombre || "").trim()) {
      cliente.sedes.push({
        id: nuevoId("sede"),
        nombre: normalizarNombre(sedeNombre) || "Sede principal",
        direccion: String(sedeDireccion || "").trim(),
        contacto: String(sedeContacto || "").trim(),
        telefono: String(sedeTelefono || "").trim()
      });
    }
    await saveRecord(STORES.clientes, cliente);
    return cliente;
  }

  async function addSiteToClient(context, clienteId, data) {
    const { nuevoId, normalizarNombre, getAll, saveRecord, STORES } = context;
    const todos = await getAll(STORES.clientes);
    const cliente = todos.find(c => c.id === clienteId);
    if (!cliente) throw new Error("La empresa ya no existe.");
    const sede = {
      id: nuevoId("sede"),
      nombre: normalizarNombre(data.nombre),
      direccion: String(data.direccion || "").trim(),
      contacto: String(data.contacto || "").trim(),
      telefono: String(data.telefono || "").trim()
    };
    const sedes = Array.isArray(cliente.sedes) ? [...cliente.sedes, sede] : [sede];
    await saveRecord(STORES.clientes, { ...cliente, sedes });
    return sede;
  }

  async function updateClient(context, client, data) {
    const { normalizarNombre, saveRecord, STORES } = context;
    const actualizado = {
      ...client,
      nombre: normalizarNombre(data.nombre),
      ruc: String(data.ruc || "").trim()
    };
    await saveRecord(STORES.clientes, actualizado);
    return actualizado;
  }

  async function removeSite(context, client, siteId) {
    const { saveRecord, STORES } = context;
    const sedesAntes = [...(client.sedes || [])];
    await saveRecord(STORES.clientes, { ...client, sedes: sedesAntes.filter(s => s.id !== siteId) });
    return sedesAntes;
  }

  async function removeClient(context, clientId) {
    const { deleteRecord, STORES } = context;
    await deleteRecord(STORES.clientes, clientId);
  }

  global.Metrologia.services.clientActions = Object.freeze({
    createClient, addSiteToClient, updateClient, removeSite, removeClient
  });
})(window);
