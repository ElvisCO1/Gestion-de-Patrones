/* Caso de uso transaccional para devoluciones de patrones. */
(function (global) {
  "use strict";

  async function confirmBulkReturn(context) {
    const {
      devolucionPendiente, historial, movimientoCerrado, avisar,
      cerrarModalDevolucion, render, cantidadDeRegistro, nuevaObservacion,
      STORES, patrones, unidadesFueraDe, estadoTrasMovimiento,
      runAtomicTransaction
    } = context;

    if (!devolucionPendiente.length) return;
    const registros = devolucionPendiente
      .map(x => historial.find(h => h.id === x.registroId))
      .filter(Boolean);
    const yaCerrados = registros.filter(movimientoCerrado);
    const aDevolver = registros.filter(r => !movimientoCerrado(r));
    if (!aDevolver.length) {
      avisar("Esos patrones ya figuran como devueltos. No hay nada que registrar.", "info");
      cerrarModalDevolucion();
      await render();
      return;
    }

    const ahora = new Date().toISOString();
    const operaciones = [];
    const patronesAntes = [];
    const historialAntes = aDevolver.map(r => ({ ...r }));
    const parciales = [];
    aDevolver.forEach(reg => {
      const salieron = cantidadDeRegistro(reg);
      const item = devolucionPendiente.find(x => x.registroId === reg.id);
      const vuelven = Math.max(1, Math.min(salieron, parseInt(item && item.cantidad, 10) || salieron));

      if (vuelven < salieron) {
        const faltan = salieron - vuelven;
        parciales.push({ codigo: reg.codigo, vuelven, faltan });
        const obs = nuevaObservacion({
          texto: `Devolución parcial: vuelven ${vuelven} de ${salieron} piezas. Quedan ${faltan} fuera del laboratorio.`,
          autor: "", alcance: "patron", tipo: "nota"
        });
        operaciones.push({ store: STORES.historial, action: "put", item: {
          ...reg, cantidad: faltan,
          observaciones: [...(Array.isArray(reg.observaciones) ? reg.observaciones : []), obs]
        }});
      } else {
        operaciones.push({ store: STORES.historial, action: "put", item: {
          ...reg, estadoMovimiento: "Devuelto", fechaHoraDevolucion: ahora, devueltoPorEscaneo: true
        }});
      }

      const p = patrones.find(x => x.codigo === reg.codigo);
      if (p && (p.estado === "En servicio" || p.estado === "Disponible")) {
        const fueraTras = unidadesFueraDe(reg.codigo) - vuelven;
        const nuevoEstado = estadoTrasMovimiento(p, fueraTras);
        if (nuevoEstado !== p.estado) {
          patronesAntes.push({ ...p });
          operaciones.push({ store: STORES.patrones, action: "put", item: { ...p, estado: nuevoEstado } });
        }
      }
    });

    await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
    const cuantos = aDevolver.length;
    cerrarModalDevolucion();
    await render();
    const nota = yaCerrados.length ? ` (${yaCerrados.length} ya estaban devueltos)` : "";
    const notaParcial = parciales.length
      ? ` Atención: ${parciales.map(x => `${x.codigo} sigue con ${x.faltan} pieza(s) fuera`).join("; ")}.`
      : "";
    avisar(`${cuantos} patrón(es) devueltos y disponibles de nuevo${nota}.${notaParcial}`,
      parciales.length ? "info" : "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        await runAtomicTransaction([STORES.historial, STORES.patrones], [
          ...historialAntes.map(h => ({ store: STORES.historial, action: "put", item: h })),
          ...patronesAntes.map(p => ({ store: STORES.patrones, action: "put", item: p }))
        ]);
        await render();
        avisar("Se deshizo la devolución.", "info");
      }
    });
  }

  async function closeReturn(context, registroId) {
    const { historial, patrones, cantidadDeRegistro, unidadesFueraDe,
      estadoTrasMovimiento, STORES, runAtomicTransaction, render } = context;
    const reg = historial.find(h => h.id === registroId);
    if (!reg) return;
    const p = patrones.find(x => x.codigo === reg.codigo);
    const operaciones = [];
    if (p) {
      const fueraTras = unidadesFueraDe(reg.codigo) - cantidadDeRegistro(reg);
      operaciones.push({ store: STORES.patrones, action: "put", item: { ...p, estado: estadoTrasMovimiento(p, fueraTras) } });
    }
    operaciones.push({ store: STORES.historial, action: "put", item: {
      ...reg, estadoMovimiento: "Devuelto", fechaHoraDevolucion: new Date().toISOString()
    }});
    await runAtomicTransaction([STORES.patrones, STORES.historial], operaciones);
    await render();
  }

  async function sendToAnotherService(context, registroId) {
    const { historial, patrones, cantidadDeRegistro, unidadesFueraDe,
      estadoTrasMovimiento, STORES, runAtomicTransaction, seleccionados,
      prepareNewService, render, activarTab } = context;
    const reg = historial.find(h => h.id === registroId);
    if (!reg) return;
    const p = patrones.find(x => x.codigo === reg.codigo);
    const operaciones = [];
    if (p) {
      const fueraTras = unidadesFueraDe(reg.codigo) - cantidadDeRegistro(reg);
      operaciones.push({ store: STORES.patrones, action: "put", item: { ...p, estado: estadoTrasMovimiento(p, fueraTras) } });
    }
    operaciones.push({ store: STORES.historial, action: "put", item: {
      ...reg, estadoMovimiento: "Enviado a otro servicio", fechaHoraDevolucion: new Date().toISOString()
    }});
    await runAtomicTransaction([STORES.patrones, STORES.historial], operaciones);
    seleccionados[reg.codigo] = true;
    prepareNewService();
    await render();
    activarTab("salida");
    const okBox = document.getElementById("msg-ok");
    const n = Object.values(seleccionados).filter(Boolean).length;
    okBox.textContent = n > 1
      ? `Patrón ${reg.codigo} añadido: ya hay ${n} patrones listos para el nuevo servicio. Puedes seguir enviando más desde el historial o completar los datos de la nueva OT.`
      : `Patrón ${reg.codigo} listo para asignar a un nuevo servicio. Completa los datos de la nueva OT.`;
    okBox.style.display = "block";
  }

  async function saveObservation(context) {
    const { obsDestino, historial, patrones, nuevaObservacion, STORES,
      claveSalida, runAtomicTransaction, cerrarModalObservacion, render, avisar } = context;
    if (!obsDestino) return;
    const err = document.getElementById("obs-error");
    err.style.display = "none";
    const texto = document.getElementById("obs-texto").value.trim();
    const autor = document.getElementById("obs-autor").value.trim();
    if (!texto) {
      err.textContent = obsDestino.correccion
        ? "Escribe el motivo de la corrección: queda como constancia del error."
        : "Escribe la observación.";
      err.style.display = "block";
      return;
    }
    const { registroId, salidaId, correccion, destino = "interno", editarObservacionId = null } = obsDestino;
    if (correccion) {
      const reg = historial.find(h => h.id === registroId);
      if (!reg) { cerrarModalObservacion(); return; }
      const obs = nuevaObservacion({ texto, autor, alcance: "patron", tipo: "correccion" });
      const anuladas = Array.isArray(reg.devolucionesAnuladas) ? [...reg.devolucionesAnuladas] : [];
      anuladas.push({ estadoAnterior: reg.estadoMovimiento, fechaHoraDevolucion: reg.fechaHoraDevolucion || "", motivo: texto, autor, anuladoEn: new Date().toISOString() });
      const registroCorregido = {
        ...reg, estadoMovimiento: "En servicio", fechaHoraDevolucion: "", devolucionesAnuladas: anuladas,
        observaciones: [...(Array.isArray(reg.observaciones) ? reg.observaciones : []), obs]
      };
      const operaciones = [{ store: STORES.historial, action: "put", item: registroCorregido }];
      const patron = patrones.find(p => p.codigo === reg.codigo);
      if (patron && patron.estado === "Disponible") {
        operaciones.push({ store: STORES.patrones, action: "put", item: { ...patron, estado: "En servicio" } });
      }
      await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
      cerrarModalObservacion();
      await render();
      const aviso = (patron && patron.estado !== "Disponible") ? ` El patrón ya estaba en otro estado ("${patron.estado}") y no se modificó.` : "";
      avisar(`Devolución de ${reg.codigo} corregida: vuelve a figurar en servicio.${aviso}`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => {
          const ops = [{ store: STORES.historial, action: "put", item: reg }];
          if (patron) ops.push({ store: STORES.patrones, action: "put", item: patron });
          await runAtomicTransaction([STORES.historial, STORES.patrones], ops);
          await render();
          avisar("Se deshizo la corrección.", "info");
        }
      });
      return;
    }
    if (editarObservacionId) {
      const destinosEdicion = historial.filter(h => claveSalida(h) === salidaId);
      const anterior = destinosEdicion
        .flatMap(h => Array.isArray(h.observaciones) ? h.observaciones : [])
        .find(observacion => observacion.id === editarObservacionId && observacion.destino === "documento" && observacion.estado !== "reemplazada");
      if (!anterior || !destinosEdicion.length) {
        err.textContent = "La observacion ya no esta disponible para editar.";
        err.style.display = "block";
        return;
      }
      const revision = {
        ...nuevaObservacion({ texto, autor, alcance: "OT", tipo: "revision", destino: "documento" }),
        reemplaza: anterior.id
      };
      const reemplazadaEn = new Date().toISOString();
      const previos = destinosEdicion.map(h => ({ ...h }));
      await runAtomicTransaction([STORES.historial], destinosEdicion.map(h => ({
        store: STORES.historial, action: "put",
        item: {
          ...h,
          observaciones: (Array.isArray(h.observaciones) ? h.observaciones : [])
            .map(observacion => observacion.id === editarObservacionId
              ? { ...observacion, estado: "reemplazada", reemplazadaEn, reemplazadaPor: revision.id }
              : observacion)
            .concat(revision)
        }
      })));
      cerrarModalObservacion();
      await render();
      avisar("Observacion para PDF actualizada. La version anterior se conserva en el historial interno.", "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => {
          await runAtomicTransaction([STORES.historial], previos.map(h => ({ store: STORES.historial, action: "put", item: h })));
          await render(); avisar("Se deshizo la edicion de la observacion.", "info");
        }
      });
      return;
    }
    const alcance = registroId ? "patron" : "OT";
    const obs = nuevaObservacion({
      texto, autor, alcance,
      destino: alcance === "OT" && destino === "documento" ? "documento" : "interno"
    });
    const destinos = registroId ? historial.filter(h => h.id === registroId) : historial.filter(h => claveSalida(h) === salidaId);
    if (!destinos.length) { cerrarModalObservacion(); return; }
    const previos = destinos.map(h => ({ ...h }));
    await runAtomicTransaction([STORES.historial], destinos.map(h => ({
      store: STORES.historial, action: "put",
      item: { ...h, observaciones: [...(Array.isArray(h.observaciones) ? h.observaciones : []), obs] }
    })));
    cerrarModalObservacion();
    await render();
    avisar(alcance === "OT" ? "Observación añadida a la OT." : "Observación añadida.", "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        await runAtomicTransaction([STORES.historial], previos.map(h => ({ store: STORES.historial, action: "put", item: h })));
        await render(); avisar("Observación eliminada.", "info");
      }
    });
  }

  async function removeDocumentObservation(context, salidaId, observationId) {
    const { historial, STORES, claveSalida, runAtomicTransaction, render, avisar } = context;
    const destinos = historial.filter(item => claveSalida(item) === salidaId);
    const previa = destinos.flatMap(item => Array.isArray(item.observaciones) ? item.observaciones : [])
      .find(observacion => observacion.id === observationId && observacion.destino === "documento" && !["reemplazada", "retirada"].includes(observacion.estado));
    if (!previa || !destinos.length) return;
    const retiradoEn = new Date().toISOString();
    const previos = destinos.map(item => ({ ...item }));
    await runAtomicTransaction([STORES.historial], destinos.map(item => ({
      store: STORES.historial, action: "put",
      item: {
        ...item,
        observaciones: (Array.isArray(item.observaciones) ? item.observaciones : []).map(observacion =>
          observacion.id === observationId ? { ...observacion, estado: "retirada", retiradoEn } : observacion)
      }
    })));
    await render();
    avisar("Observacion retirada del PDF. Se conserva en el historial interno.", "info", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        await runAtomicTransaction([STORES.historial], previos.map(item => ({ store: STORES.historial, action: "put", item })));
        await render(); avisar("Se restauro la observacion para PDF.", "ok");
      }
    });
  }

  global.Metrologia.services.returnActions = Object.freeze({ confirmBulkReturn, closeReturn, sendToAnotherService, saveObservation, removeDocumentObservation });
})(window);
