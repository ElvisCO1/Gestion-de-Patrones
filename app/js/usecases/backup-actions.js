/* Exportación e importación de datos; no contiene ni gestiona archivos ya generados. */
(function (global) {
  "use strict";

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch (_) { reject(new Error("El archivo no contiene JSON válido.")); }
      };
      reader.readAsText(file);
    });
  }

  async function exportBackup(context) {
    const { getConfig, LOGO_CONFIG_KEY, DOCUMENT_CONFIG_KEY, FORMATO_ACTA_CONFIG_KEY, SETTINGS_ACCESS_KEY, patrones, tecnicos, historial,
      actividadesEjecutadas, clientes, todayISO } = context;
    let logo = null; let documentConfig = null; let documentFormat = null; let settingsAccess = null;
    try { logo = await getConfig(LOGO_CONFIG_KEY); } catch (_) {}
    try { documentConfig = await getConfig(DOCUMENT_CONFIG_KEY); } catch (_) {}
    try { documentFormat = await getConfig(FORMATO_ACTA_CONFIG_KEY); } catch (_) {}
    try { settingsAccess = await getConfig(SETTINGS_ACCESS_KEY); } catch (_) {}
    const backup = {
      version: 5, exportadoEn: new Date().toISOString(), patrones, tecnicos,
      historial, actividades: actividadesEjecutadas, clientes, logo: logo || null,
      configuracionDocumento: documentConfig || null,
      formatoActa: documentFormat || null,
      accesoConfiguracion: settingsAccess || null
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `metrologia_backup_${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(context, file) {
    const {
      confirmar, STORES, clearStore, saveRecord, guardarLogo, guardarConfiguracionDocumento, guardarFormatoActa, guardarAccesoConfiguracion, markImported,
      resetInterface, render, createInitialWeightGroups, avisar
    } = context;
    try {
      const data = await readJsonFile(file);
      if (!data || !Array.isArray(data.patrones) || !Array.isArray(data.tecnicos) || !Array.isArray(data.historial)) {
        throw new Error("El archivo no tiene una estructura de respaldo válida.");
      }
      const ok = await confirmar({
        titulo: "Importar respaldo",
        mensaje: `El archivo trae ${data.patrones.length} patrones, ${data.tecnicos.length} técnicos y ${data.historial.length} registros de historial.\n\nEsto REEMPLAZA todos los datos guardados actualmente. ¿Continuar?`,
        textoOk: "Reemplazar datos", peligro: true
      });
      if (!ok) return;
      for (const store of [STORES.patrones, STORES.tecnicos, STORES.historial, STORES.actividades, STORES.clientes]) {
        await clearStore(store);
      }
      for (const item of data.patrones) await saveRecord(STORES.patrones, item);
      for (const item of data.tecnicos) await saveRecord(STORES.tecnicos, item);
      for (const item of data.historial) await saveRecord(STORES.historial, item);
      for (const item of (Array.isArray(data.actividades) ? data.actividades : [])) await saveRecord(STORES.actividades, item);
      for (const item of (Array.isArray(data.clientes) ? data.clientes : [])) await saveRecord(STORES.clientes, item);
      if (data.logo && data.logo.dataUrl) await guardarLogo(data.logo);
      if (typeof guardarConfiguracionDocumento === "function") await guardarConfiguracionDocumento(data.configuracionDocumento || {});
      if (typeof guardarFormatoActa === "function") await guardarFormatoActa(data.formatoActa || {});
      if (typeof guardarAccesoConfiguracion === "function") await guardarAccesoConfiguracion(data.accesoConfiguracion || null);
      markImported();
      resetInterface();
      await render();
      const grupos = await createInitialWeightGroups();
      if (grupos > 0) await render();
      avisar("Respaldo importado correctamente." + (grupos > 0 ? ` Se crearon además ${grupos} grupo(s) de pesas.` : ""), "ok");
    } catch (error) {
      avisar("No se pudo importar el respaldo: " + error.message, "error");
    }
  }

  async function mergeProgram(context, file) {
    const {
      confirmar, patrones, normalizarCodigoPatron, getActividades,
      ACTIVIDADES_ISO, ESTADOS_ESPECIALES_FUSION, STORES,
      runAtomicTransaction, INICIALIZADO_KEY, render, avisar
    } = context;
    try {
      const data = await readJsonFile(file);
      if (!data || !Array.isArray(data.patrones)) throw new Error("El archivo no tiene una lista de patrones valida.");
      const ok = await confirmar({
        titulo: "Fusionar programa",
        mensaje: `El archivo trae ${data.patrones.length} patrones.\n\nSe AGREGARÁN los nuevos y se ACTUALIZARÁN las actividades de los existentes.\nTus técnicos, clientes, historial y estados operativos NO se tocan.`,
        textoOk: "Fusionar"
      });
      if (!ok) return;
      const porCodigo = {};
      patrones.forEach(p => { porCodigo[normalizarCodigoPatron(p.codigo).toUpperCase()] = p; });
      let nuevos = 0, actualizados = 0, estadosCambiados = 0;
      const operaciones = [];
      for (const entrante of data.patrones) {
        if (!entrante || !entrante.codigo) continue;
        const codigo = normalizarCodigoPatron(entrante.codigo).toUpperCase();
        const existente = porCodigo[codigo];
        if (!existente) {
          operaciones.push({ store: STORES.patrones, action: "put", item: {
            codigo, categoria: entrante.categoria || "Sin categoria", area: entrante.area || "Sin area",
            estado: entrante.estado || "Disponible", marca: entrante.marca || "",
            valorNominal: entrante.valorNominal || "", observacion: entrante.observacion || "",
            actividades: getActividades(entrante)
          }});
          nuevos++;
          continue;
        }
        const actividades = getActividades(existente);
        const entrantes = getActividades(entrante);
        let cambio = false;
        ACTIVIDADES_ISO.forEach(({ clave }) => {
          const actividad = entrantes[clave];
          if (actividad && (actividad.mesVencimiento || actividad.frecuenciaMeses)) {
            actividades[clave] = actividad; cambio = true;
          }
        });
        const item = { ...existente, actividades };
        if (ESTADOS_ESPECIALES_FUSION.includes(entrante.estado) && existente.estado !== entrante.estado) {
          item.estado = entrante.estado; estadosCambiados++; cambio = true;
        }
        if (!item.valorNominal && entrante.valorNominal) { item.valorNominal = entrante.valorNominal; cambio = true; }
        if (!item.marca && entrante.marca) { item.marca = entrante.marca; cambio = true; }
        if (!item.observacion && entrante.observacion) { item.observacion = entrante.observacion; cambio = true; }
        if (cambio) { operaciones.push({ store: STORES.patrones, action: "put", item }); actualizados++; }
      }
      await runAtomicTransaction([STORES.patrones], operaciones);
      localStorage.setItem(INICIALIZADO_KEY, "1");
      await render();
      avisar(`Fusión completada:\n· ${nuevos} patrones nuevos agregados\n· ${actualizados} patrones existentes actualizados\n· ${estadosCambiados} cambios de estado especial (Extraviado / Inoperativo)\nTécnicos e historial quedaron intactos.`, "ok");
    } catch (error) {
      avisar("No se pudo fusionar el programa: " + error.message, "error");
    }
  }

  global.Metrologia.services.backupActions = Object.freeze({ exportBackup, importBackup, mergeProgram });
})(window);
