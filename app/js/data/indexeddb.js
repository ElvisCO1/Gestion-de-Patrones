/* Persistencia IndexedDB. Extraida de control_patrones_original.html (fase 2). */
(function (global) {
  "use strict";

  const DB_NAME = "MetrologiaDB";
  const DB_VERSION = 4;
  const STORES = Object.freeze({
    patrones: "patrones",
    tecnicos: "tecnicos",
    historial: "historial",
    config: "config",
    actividades: "actividades",
    clientes: "clientes"
  });

  let db = null;
  let openDatabaseName = null;
  const hooks = { onDataChanged: null, onVersionChange: null, onBlocked: null };

  function notify(hookName) {
    const hook = hooks[hookName];
    if (typeof hook === "function") hook();
  }

  function configure(nextHooks) {
    Object.assign(hooks, nextHooks || {});
  }

  function createStores(database) {
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
    if (!database.objectStoreNames.contains(STORES.config)) {
      database.createObjectStore(STORES.config, { keyPath: "clave" });
    }
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
      if (db && openDatabaseName === DB_NAME) {
        resolve(db);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => createStores(event.target.result);
      request.onsuccess = event => {
        db = event.target.result;
        openDatabaseName = DB_NAME;
        db.onversionchange = () => {
          db.close();
          db = null;
          openDatabaseName = null;
          notify("onVersionChange");
        };
        resolve(db);
      };
      request.onblocked = () => notify("onBlocked");
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

  async function saveRecord(storeName, item) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, "readwrite");
      let result;
      const request = tx.objectStore(storeName).put(item);
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        resolve(result);
        if (storeName !== STORES.config) notify("onDataChanged");
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaccion abortada al guardar en " + storeName));
    });
  }

  async function deleteRecord(storeName, key) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, "readwrite");
      const request = tx.objectStore(storeName).delete(key);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        resolve();
        if (storeName !== STORES.config) notify("onDataChanged");
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaccion abortada al eliminar de " + storeName));
    });
  }

  async function clearStore(storeName) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeName, "readwrite");
      const request = tx.objectStore(storeName).clear();
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        resolve();
        if (storeName !== STORES.config) notify("onDataChanged");
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaccion abortada al limpiar " + storeName));
    });
  }

  async function runAtomicTransaction(storeNames, operations) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(storeNames, "readwrite");
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Transaccion atomica abortada"));
      tx.oncomplete = () => {
        resolve();
        notify("onDataChanged");
      };
      for (const operation of operations) {
        const store = tx.objectStore(operation.store);
        if (operation.action === "put") store.put(operation.item);
        else if (operation.action === "delete") store.delete(operation.key);
      }
      if (operations.length === 0) resolve();
    });
  }

  async function getConfig(clave) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const request = database.transaction(STORES.config, "readonly").objectStore(STORES.config).get(clave);
      request.onsuccess = () => resolve(request.result ? request.result.valor : null);
      request.onerror = () => reject(request.error);
    });
  }

  async function setConfig(clave, valor) {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORES.config, "readwrite");
      tx.objectStore(STORES.config).put({ clave, valor });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  global.Metrologia.services.data = Object.freeze({
    DB_NAME, DB_VERSION, STORES, configure, openDB, getAll, saveRecord,
    deleteRecord, clearStore, runAtomicTransaction, getConfig, setConfig
  });
})(window);
