/* Operaciones transaccionales sobre una salida/OT existente. */
(function (global) {
  "use strict";

  async function deleteDispatch(context, salidaId) {
    const {
      historial, claveSalida, avisar, numeroDeServicio, confirmar, formatFecha,
      patrones, STORES, runAtomicTransaction, render, restaurarRegistros
    } = context;
    const registrosAEliminar = historial.filter(h => claveSalida(h) === salidaId);
    if (registrosAEliminar.length === 0) {
      avisar("No se encontraron registros para esa salida.", "error");
      return;
    }
    const ref = registrosAEliminar[0];
    const n = numeroDeServicio(salidaId);
    const confirmado = await confirmar({
      titulo: "Eliminar salida",
      mensaje: `Se eliminará ${n ? `el servicio ${n} de la OT` : "la OT"} ${ref.numeroOT} `
             + `del día ${formatFecha(ref.fecha)} y sus ${registrosAEliminar.length} registro(s).\n\n`
             + (n ? "Los demás servicios de esa misma OT NO se tocan.\n\n" : "")
             + "Los patrones asociados volverán a estar disponibles.\n\n"
             + "Si lo que pasó es que marcaste algo por error, es mejor usar «Observación» "
             + "o «Corregir devolución»: así queda constancia en vez de borrarse.",
      textoOk: "Eliminar salida", peligro: true
    });
    if (!confirmado) return;
    const codigosPatrones = registrosAEliminar.map(h => h.codigo);
    const patronesAntes = codigosPatrones.map(c => patrones.find(p => p.codigo === c))
      .filter(Boolean).map(p => ({ ...p }));
    try {
      const operaciones = registrosAEliminar.map(registro =>
        ({ store: STORES.historial, action: "delete", key: registro.id }));
      for (const codigo of codigosPatrones) {
        const patron = patrones.find(p => p.codigo === codigo);
        if (patron && patron.estado === "En servicio") {
          operaciones.push({ store: STORES.patrones, action: "put", item: { ...patron, estado: "Disponible" } });
        }
      }
      await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
    } catch (error) {
      console.error("Error al eliminar la salida:", error);
      avisar("Hubo un error al eliminar la OT. Revisa la consola.", "error");
      return;
    }
    await render();
    avisar(`${n ? `Servicio ${n} de la OT` : "OT"} ${ref.numeroOT} eliminado. Los patrones han sido liberados.`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: () => restaurarRegistros(patronesAntes, registrosAEliminar, [])
    });
  }

  async function saveOrderEdition(context) {
    const {
      edicionOT, calcularCambiosOT, patrones, patronBloqueadoPorCalibracion,
      nuevaObservacion, tecnicos, isoDesdeFechaHoraLocal, nuevoId,
      esPatronGrupo, unidadesDeGrupo, STORES, historial, movimientoCerrado,
      cantidadDeRegistro, estadoTrasMovimiento, runAtomicTransaction,
      cerrarModalEditarOT, render, avisar
    } = context;
    if (!edicionOT) return;
    const err = document.getElementById("edit-ot-error");
    err.style.display = "none";
    const d = calcularCambiosOT();
    const motivo = document.getElementById("edit-ot-motivo").value.trim();
    const autor = document.getElementById("edit-ot-autor").value.trim();
    if (!d.nuevoNumero) { err.textContent = "El número de OT no puede quedar vacío."; err.style.display = "block"; return; }
    if (!d.nuevaFecha) { err.textContent = "La fecha de salida no puede quedar vacía."; err.style.display = "block"; return; }
    const quedan = edicionOT.registros.filter(r => r.estadoMovimiento !== "Anulado" && !edicionOT.retirar[r.id]).length + d.agregados.length;
    if (quedan === 0) {
      err.textContent = "La OT se quedaría sin ningún patrón. Añade uno o, si toda la orden fue un error, elimínala desde el historial.";
      err.style.display = "block"; return;
    }
    if (!d.cambios.length) { err.textContent = "No has cambiado nada todavía."; err.style.display = "block"; return; }
    if (!motivo) {
      err.textContent = "Escribe el motivo de la corrección: es lo que queda como constancia de por qué cambió el registro.";
      err.style.display = "block"; return;
    }
    const noAptos = d.agregados.map(c => patrones.find(p => p.codigo === c))
      .filter(p => !p || p.estado !== "Disponible" || patronBloqueadoPorCalibracion(p));
    if (noAptos.length) {
      err.textContent = "Estos patrones ya no pueden añadirse (no disponibles o con actividad vencida): "
        + noAptos.map(p => p ? p.codigo : "?").join(", ") + ".";
      err.style.display = "block"; return;
    }
    const obs = nuevaObservacion({
      texto: motivo + "\n\nCambios aplicados:\n· " + d.cambios.join("\n· "),
      autor, alcance: "OT", tipo: "correccion"
    });
    const tecInfo = tecnicos.find(t => t.nombre === d.nuevoTecnico);
    const cabecera = {
      numeroOT: d.nuevoNumero, fecha: d.nuevaFecha,
      fechaHoraSalida: isoDesdeFechaHoraLocal(d.nuevaFecha, d.nuevaHora),
      empresa: d.cliente ? d.cliente.nombre : "", clienteId: d.cliente ? d.cliente.id : "",
      clienteRuc: d.cliente ? (d.cliente.ruc || "") : "", sedeId: d.sede ? d.sede.id : "",
      sede: d.sede ? d.sede.nombre : "", direccion: d.sede ? (d.sede.direccion || "") : "",
      contactoSede: d.sede ? (d.sede.contacto || "") : "", telefonoSede: d.sede ? (d.sede.telefono || "") : "",
      tecnico: d.nuevoTecnico, laptop: tecInfo ? (tecInfo.laptop || "") : "",
      termohigrometro: tecInfo ? (tecInfo.termohigrometro || "") : "", extra: tecInfo ? (tecInfo.extra || "") : "",
      multimetro: tecInfo ? (tecInfo.multimetro || "") : "",
      encargadoLaboratorio: d.nuevoEncargado, salidaId: edicionOT.salidaIdReal || nuevoId("sal")
    };
    const ahora = new Date().toISOString();
    const operaciones = [];
    const patronesTocados = new Map();
    edicionOT.registros.forEach(r => {
      const retirado = !!edicionOT.retirar[r.id];
      const item = { ...r, ...cabecera, observaciones: [...(Array.isArray(r.observaciones) ? r.observaciones : []), obs] };
      if (retirado) {
        item.estadoMovimiento = "Anulado"; item.anuladoEn = ahora; item.motivoAnulacion = motivo;
        item.estadoAntesDeAnular = r.estadoMovimiento || "En servicio"; item.fechaHoraDevolucion = "";
      }
      operaciones.push({ store: STORES.historial, action: "put", item });
    });
    const idsNuevos = [];
    d.agregados.forEach(codigo => {
      const p = patrones.find(x => x.codigo === codigo);
      const idNuevo = nuevoId("hist");
      idsNuevos.push(idNuevo);
      operaciones.push({ store: STORES.historial, action: "put", item: {
        id: idNuevo, ...cabecera, registradoEn: ahora, categoria: p.categoria, area: p.area,
        codigo: p.codigo, valorNominal: String(p.valorNominal || p.valor || ""),
        cantidad: esPatronGrupo(p) ? Math.max(1, parseInt(edicionOT.agregar[codigo], 10) || 1) : 1,
        esGrupo: esPatronGrupo(p), unidadesGrupo: esPatronGrupo(p) ? unidadesDeGrupo(p) : null,
        tipoMovimiento: "Salida", estadoMovimiento: "En servicio", agregadoEnCorreccion: ahora, observaciones: [obs]
      }});
      patronesTocados.set(codigo, "En servicio");
    });
    const idsRetirados = new Set(edicionOT.registros.filter(r => edicionOT.retirar[r.id]).map(r => r.id));
    edicionOT.registros.filter(r => idsRetirados.has(r.id)).forEach(r => {
      const p = patrones.find(x => x.codigo === r.codigo);
      if (!p) return;
      const fueraTras = historial.filter(h => h.codigo === r.codigo && !idsRetirados.has(h.id) && !movimientoCerrado(h))
        .reduce((suma, h) => suma + cantidadDeRegistro(h), 0);
      patronesTocados.set(r.codigo, estadoTrasMovimiento(p, fueraTras));
    });
    patronesTocados.forEach((estado, codigo) => {
      const p = patrones.find(x => x.codigo === codigo);
      if (!p || p.estado === estado || (p.estado !== "Disponible" && p.estado !== "En servicio")) return;
      operaciones.push({ store: STORES.patrones, action: "put", item: { ...p, estado } });
    });
    const historialAntes = edicionOT.registros.map(r => ({ ...r }));
    const patronesAntes = [...patronesTocados.keys()].map(c => patrones.find(p => p.codigo === c))
      .filter(Boolean).map(p => ({ ...p }));
    await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
    cerrarModalEditarOT();
    await render();
    avisar(`OT ${d.nuevoNumero} corregida (${d.cambios.length} cambio(s)). Queda anotado en el historial.`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        const ops = [
          ...historialAntes.map(h => ({ store: STORES.historial, action: "put", item: h })),
          ...idsNuevos.map(id => ({ store: STORES.historial, action: "delete", key: id })),
          ...patronesAntes.map(p => ({ store: STORES.patrones, action: "put", item: p }))
        ];
        await runAtomicTransaction([STORES.historial, STORES.patrones], ops);
        await render();
        avisar("Se deshizo la corrección de la OT.", "info");
      }
    });
  }

  global.Metrologia.services.orderActions = Object.freeze({ deleteDispatch, saveOrderEdition });
})(window);
