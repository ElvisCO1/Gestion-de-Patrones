/* Persistencia IndexedDB. Se expone como script clásico para mantener
 * compatibilidad con la apertura directa del HTML (file://). */
(function (global) {
  "use strict";

  const NOMBRE_DB = "MetrologiaDB";
  const DB_VERSION = 4;
  const STORES = Object.freeze({
    patrones: "patrones", tecnicos: "tecnicos", historial: "historial",
    config: "config", actividades: "actividades", clientes: "clientes"
  });
  let db = null;

  function avisar(mensaje, opciones) {
    if (typeof global.avisarPersistente === "function") {
      global.avisarPersistente(mensaje, "error", opciones);
    } else console.warn(mensaje);
  }
  function notificarCambio(storeName) {
    if (storeName !== STORES.config && typeof global.programarEspejo === "function") global.programarEspejo();
  }
  function crearEsquema(database) {
    if (!database.objectStoreNames.contains(STORES.patrones)) {
      const store = database.createObjectStore(STORES.patrones, { keyPath: "codigo" });
      store.createIndex("categoria", "categoria", { unique: false });
      store.createIndex("area", "area", { unique: false });
      store.createIndex("estado", "estado", { unique: false });
    }
    if (!database.objectStoreNames.contains(STORES.tecnicos)) {
      const store = database.createObjectStore(STORES.tecnicos, { keyPath: "nombre" });
      store.createIndex("activo", "activo", { unique: false });
    }
    if (!database.objectStoreNames.contains(STORES.historial)) {
      const store = database.createObjectStore(STORES.historial, { keyPath: "id" });
      store.createIndex("numeroOT", "numeroOT", { unique: false });
      store.createIndex("fecha", "fecha", { unique: false });
      store.createIndex("codigo", "codigo", { unique: false });
    }
    if (!database.objectStoreNames.contains(STORES.config)) database.createObjectStore(STORES.config, { keyPath: "clave" });
    if (!database.objectStoreNames.contains(STORES.actividades)) {
      const store = database.createObjectStore(STORES.actividades, { keyPath: "id" });
      store.createIndex("codigoPatron", "codigoPatron", { unique: false });
      store.createIndex("fechaEjecucion", "fechaEjecucion", { unique: false });
    }
    if (!database.objectStoreNames.contains(STORES.clientes)) {
      const store = database.createObjectStore(STORES.clientes, { keyPath: "id" });
      store.createIndex("nombre", "nombre", { unique: false });
    }
  }
  function openDB() {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);
      const request = indexedDB.open(NOMBRE_DB, DB_VERSION);
      request.onupgradeneeded = event => crearEsquema(event.target.result);
      request.onsuccess = event => {
        db = event.target.result;
        db.onversionchange = () => {
          db.close(); db = null;
          avisar("La aplicación se actualizó en otra pestaña. Recarga esta página para seguir trabajando.",
            { etiqueta: "Recargar ahora", ejecutar: () => location.reload() });
        };
        resolve(db);
      };
      request.onblocked = () => avisar("Tienes la aplicación abierta en otra pestaña con una versión anterior. Ciérrala y recarga esta página.",
        { etiqueta: "Recargar", ejecutar: () => location.reload() });
      request.onerror = event => reject(event.target.error);
    });
  }
  async function getAll(storeName) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function ejecutar(storeNames, trabajo, notificar = true) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeNames, "readwrite");
      tx.oncomplete = () => { if (notificar) notificarCambio(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transacción abortada"));
      try { trabajo(tx); } catch (error) { tx.abort(); reject(error); }
    });
  }
  const saveRecord = async (store, item) => ejecutar([store], tx => tx.objectStore(store).put(item));
  const deleteRecord = async (store, key) => ejecutar([store], tx => tx.objectStore(store).delete(key));
  const clearStore = async store => ejecutar([store], tx => tx.objectStore(store).clear());
  async function runAtomicTransaction(stores, operations) {
    if (!operations.length) return;
    await ejecutar(stores, tx => operations.forEach(op => {
      const store = tx.objectStore(op.store);
      if (op.action === "put") store.put(op.item);
      else if (op.action === "delete") store.delete(op.key);
      else throw new Error("Operación no soportada: " + op.action);
    }));
  }
  async function getConfig(clave) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORES.config, "readonly").objectStore(STORES.config).get(clave);
      request.onsuccess = () => resolve(request.result ? request.result.valor : null);
      request.onerror = () => reject(request.error);
    });
  }
  const setConfig = async (clave, valor) => ejecutar([STORES.config], tx =>
    tx.objectStore(STORES.config).put({ clave, valor }), false);
  async function replaceBackupData(data) {
    const stores = [STORES.patrones, STORES.tecnicos, STORES.historial, STORES.actividades, STORES.clientes];
    await ejecutar(stores, tx => {
      stores.forEach(store => tx.objectStore(store).clear());
      ["patrones", "tecnicos", "historial", "actividades", "clientes"].forEach(name =>
        (data[name] || []).forEach(item => tx.objectStore(STORES[name]).put(item)));
    });
  }
  global.MetrologiaDB = Object.freeze({ STORES, openDB, getAll, saveRecord, deleteRecord, clearStore,
    runAtomicTransaction, getConfig, setConfig, replaceBackupData });
})(window);
