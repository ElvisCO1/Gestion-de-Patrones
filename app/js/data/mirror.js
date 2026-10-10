/* Espejo automático a disco. Extraído de control_patrones_original.html (fase 2). */
(function (global) {
  "use strict";

  const data = global.Metrologia.services.data;
  const SUPPORTS_DIRECTORY_PICKER = "showDirectoryPicker" in global;
  const DIRECTORY_CONFIG_KEY = "carpetaDatos";
  const DAILY_BACKUP_KEY = "metrologia_respaldo_diario";
  const hooks = { getLogoConfigKey: null, getDocumentConfigKey: null, getDocumentFormatKey: null, getSettingsAccessKey: null, todayISO: null, notify: null };
  let directoryHandle = null;
  let pendingDirectoryHandle = null;
  let mirrorTimer = null;
  let lastMirrorAt = null;
  let lastMirrorError = null;

  function configure(nextHooks) {
    Object.assign(hooks, nextHooks || {});
  }

  function updateStatus() {
    const status = document.getElementById("storage-status");
    const button = document.getElementById("btn-conectar-carpeta");
    if (!status || !button) return;
    if (directoryHandle) {
      const time = lastMirrorAt
        ? " Último guardado: " + lastMirrorAt.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" }) + "."
        : "";
      const error = lastMirrorError ? " ATENCIÓN: el último guardado a disco falló, revisa la carpeta." : "";
      status.textContent = "Datos protegidos: copia automática en la carpeta \"" + directoryHandle.name + "\" (+ respaldo diario)." + time + error;
      button.style.display = "none";
    } else if (pendingDirectoryHandle) {
      status.textContent = "La copia automática a la carpeta \"" + pendingDirectoryHandle.name + "\" está pausada: haz clic en «Reactivar carpeta de datos».";
      button.textContent = "Reactivar carpeta de datos";
      button.style.display = "inline-block";
    } else if (SUPPORTS_DIRECTORY_PICKER) {
      status.textContent = "Los datos viven solo en este navegador. Conecta una carpeta para tener copia automática en disco.";
      button.textContent = "Conectar carpeta de datos";
      button.style.display = "inline-block";
    } else {
      status.textContent = "Los datos se guardan en IndexedDB de este navegador. Este navegador no soporta copia automática a carpeta (usa Chrome/Edge); exporta respaldos manualmente con frecuencia.";
      button.style.display = "none";
    }
  }

  async function serializeAll() {
    const [patrones, tecnicos, historial, actividades, clientes] = await Promise.all([
      data.getAll(data.STORES.patrones), data.getAll(data.STORES.tecnicos),
      data.getAll(data.STORES.historial), data.getAll(data.STORES.actividades),
      data.getAll(data.STORES.clientes)
    ]);
    let logo = null;
    let documentConfig = null;
    let documentFormat = null;
    let settingsAccess = null;
    try {
      const key = typeof hooks.getLogoConfigKey === "function" ? hooks.getLogoConfigKey() : null;
      if (key) logo = await data.getConfig(key);
    } catch (_) { /* El respaldo se genera aun sin logo. */ }
    try {
      const key = typeof hooks.getDocumentConfigKey === "function" ? hooks.getDocumentConfigKey() : null;
      if (key) documentConfig = await data.getConfig(key);
    } catch (_) { /* El respaldo se genera aun sin esta configuración. */ }
    try {
      const key = typeof hooks.getDocumentFormatKey === "function" ? hooks.getDocumentFormatKey() : null;
      if (key) documentFormat = await data.getConfig(key);
    } catch (_) { /* El respaldo se genera aun sin este formato. */ }
    try {
      const key = typeof hooks.getSettingsAccessKey === "function" ? hooks.getSettingsAccessKey() : null;
      if (key) settingsAccess = await data.getConfig(key);
    } catch (_) { /* El respaldo se genera aun sin este acceso. */ }
    return JSON.stringify({
      version: 5,
      exportadoEn: new Date().toISOString(),
      patrones, tecnicos, historial, actividades, clientes, logo: logo || null,
      configuracionDocumento: documentConfig || null,
      formatoActa: documentFormat || null,
      accesoConfiguracion: settingsAccess || null
    }, null, 1);
  }

  async function writeFile(directory, name, contents) {
    const fileHandle = await directory.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
  }

  async function mirrorToDisk() {
    if (!directoryHandle) return;
    const contents = await serializeAll();
    await writeFile(directoryHandle, "datos_metrologia.json", contents);
    const today = typeof hooks.todayISO === "function" ? hooks.todayISO() : new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(DAILY_BACKUP_KEY) !== today) {
      const backupsDirectory = await directoryHandle.getDirectoryHandle("respaldos", { create: true });
      await writeFile(backupsDirectory, "respaldo_" + today + ".json", contents);
      localStorage.setItem(DAILY_BACKUP_KEY, today);
    }
    lastMirrorAt = new Date();
    lastMirrorError = null;
    updateStatus();
  }

  function scheduleMirror() {
    if (!directoryHandle) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(() => {
      mirrorToDisk().catch(error => {
        lastMirrorError = error;
        console.warn("No se pudo espejar los datos a disco:", error);
        updateStatus();
      });
    }, 1500);
  }

  async function connectDirectory() {
    if (!SUPPORTS_DIRECTORY_PICKER) {
      if (typeof hooks.notify === "function") hooks.notify("Este navegador no soporta guardar en carpeta (usa Chrome o Edge). Mientras tanto, usa \"Exportar respaldo\" con frecuencia.", "error");
      return;
    }
    if (pendingDirectoryHandle) {
      try {
        const permission = await pendingDirectoryHandle.requestPermission({ mode: "readwrite" });
        if (permission === "granted") {
          directoryHandle = pendingDirectoryHandle;
          pendingDirectoryHandle = null;
          await mirrorToDisk();
          return;
        }
      } catch (error) {
        console.warn("No se pudo reactivar la carpeta guardada, se pedirá de nuevo:", error);
      }
      pendingDirectoryHandle = null;
    }
    try {
      directoryHandle = await global.showDirectoryPicker({ id: "metrologia-datos", mode: "readwrite" });
      await data.setConfig(DIRECTORY_CONFIG_KEY, directoryHandle);
      await mirrorToDisk();
    } catch (error) {
      if (error && error.name === "AbortError") return;
      if (typeof hooks.notify === "function") hooks.notify("No se pudo conectar la carpeta de datos: " + error.message, "error");
    }
    updateStatus();
  }

  async function restoreDirectory() {
    if (!SUPPORTS_DIRECTORY_PICKER) return;
    try {
      const handle = await data.getConfig(DIRECTORY_CONFIG_KEY);
      if (!handle) return;
      const permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission === "granted") {
        directoryHandle = handle;
        scheduleMirror();
      } else {
        pendingDirectoryHandle = handle;
      }
    } catch (error) {
      console.warn("No se pudo restaurar la carpeta de datos:", error);
    }
  }

  global.Metrologia.services.mirror = Object.freeze({
    configure, scheduleMirror, serializeAll, mirrorToDisk, connectDirectory,
    restoreDirectory, updateStatus
  });
})(window);
