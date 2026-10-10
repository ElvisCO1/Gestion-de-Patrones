/* Caso de uso transaccional para registrar salidas a servicio. */
(function (global) {
  "use strict";

  async function registerDispatch(context) {
    const {
      horaActualHHMMSS, seleccionados, getCliente, clienteSeleccionadoId,
      getSede, sedeSeleccionadaId, patrones, patronBloqueadoPorCalibracion,
      esPatronGrupo, cantidadSeleccionadaDe, unidadesDisponiblesDe, tecnicos,
      encargadoParaCodigos, isoDesdeFechaHoraLocal, nuevoId, unidadesDeGrupo,
      STORES, runAtomicTransaction, unidadesFueraDe, estadoTrasMovimiento,
      cantidadDeRegistro, clearSelection, todayISO, render
    } = context;

    const errBox = document.getElementById("msg-error");
    const okBox = document.getElementById("msg-ok");
    errBox.style.display="none"; okBox.style.display="none";

    const ot = document.getElementById("in-ot").value.trim();
    const tecnico = document.getElementById("in-tecnico").value;
    const fecha = document.getElementById("in-fecha").value;
    const hora = document.getElementById("in-hora").value || horaActualHHMMSS();
    const codigos = Object.keys(seleccionados).filter(k => seleccionados[k]);

    const cliente = getCliente(clienteSeleccionadoId);
    const sede = getSede(cliente, sedeSeleccionadaId);
    const empresa = cliente ? cliente.nombre : "";

    if (!ot) { errBox.textContent="Ingresa el número de OT."; errBox.style.display="block"; return; }
    if (!cliente) { errBox.textContent="Selecciona la empresa cliente (o registra una nueva)."; errBox.style.display="block"; return; }
    if ((cliente.sedes || []).length > 0 && !sede) {
      errBox.textContent = "Selecciona a qué sede de " + cliente.nombre + " va el servicio.";
      errBox.style.display = "block"; return;
    }
    if (!tecnico) { errBox.textContent="Selecciona un técnico."; errBox.style.display="block"; return; }
    if (!fecha) { errBox.textContent="Indica la fecha de salida."; errBox.style.display="block"; return; }
    if (codigos.length === 0) { errBox.textContent="Selecciona al menos un patrón para el servicio."; errBox.style.display="block"; return; }

    const noAptos = codigos
      .map(c => patrones.find(pp => pp.codigo === c))
      .filter(p => !p || p.estado !== "Disponible" || patronBloqueadoPorCalibracion(p));
    if (noAptos.length > 0) {
      errBox.textContent = "Estos patrones ya no pueden salir a servicio (no disponibles o con actividad vencida): "
        + noAptos.map(p => p ? p.codigo : "?").join(", ") + ". Quítalos de la selección.";
      errBox.style.display = "block";
      return;
    }

    const gruposExcedidos = codigos
      .map(c => patrones.find(pp => pp.codigo === c))
      .filter(esPatronGrupo)
      .map(p => ({ p, pide: cantidadSeleccionadaDe(p.codigo), hay: unidadesDisponiblesDe(p) }))
      .filter(x => x.pide > x.hay);
    if (gruposExcedidos.length > 0) {
      errBox.textContent = "Pides más piezas de las que hay libres: "
        + gruposExcedidos.map(x => `${x.p.codigo} (pides ${x.pide}, quedan ${x.hay})`).join("; ") + ".";
      errBox.style.display = "block";
      return;
    }

    const tecInfo = tecnicos.find(t => t.nombre === tecnico);
    const encargadoLaboratorio = encargadoParaCodigos(codigos);
    const fechaHoraSalida = isoDesdeFechaHoraLocal(fecha, hora);
    const registradoEn = new Date().toISOString();
    const salidaId = nuevoId("sal");
    const nuevos = codigos.map(codigo => {
      const p = patrones.find(pp => pp.codigo === codigo);
      return {
        id: crypto.randomUUID ? crypto.randomUUID() : (ot+"-"+codigo+"-"+Date.now()),
        salidaId, fecha, fechaHoraSalida, registradoEn, numeroOT: ot, empresa,
        clienteId: cliente.id, clienteRuc: cliente.ruc || "",
        sedeId: sede ? sede.id : "", sede: sede ? sede.nombre : "",
        direccion: sede ? (sede.direccion || "") : "",
        contactoSede: sede ? (sede.contacto || "") : "",
        telefonoSede: sede ? (sede.telefono || "") : "",
        tecnico, laptop: tecInfo ? tecInfo.laptop : "",
        termohigrometro: tecInfo ? tecInfo.termohigrometro : "",
        multimetro: tecInfo ? (tecInfo.multimetro || "") : "",
        extra: tecInfo ? tecInfo.extra : "", encargadoLaboratorio,
        categoria: p.categoria, area: p.area,
        valorNominal: String(p.valorNominal || p.valor || ""), codigo: p.codigo,
        cantidad: esPatronGrupo(p) ? cantidadSeleccionadaDe(codigo) : 1,
        esGrupo: esPatronGrupo(p),
        unidadesGrupo: esPatronGrupo(p) ? unidadesDeGrupo(p) : null,
        tipoMovimiento: "Salida", estadoMovimiento: "En servicio", observaciones: []
      };
    });

    const operaciones = [];
    for (const item of nuevos) operaciones.push({ store: STORES.historial, action: "put", item });
    for (const codigo of codigos) {
      const p = patrones.find(pp => pp.codigo === codigo);
      if (!p) continue;
      const fueraTras = unidadesFueraDe(codigo) + (esPatronGrupo(p) ? cantidadSeleccionadaDe(codigo) : 1);
      operaciones.push({ store: STORES.patrones, action: "put", item: {
        ...p, estado: estadoTrasMovimiento(p, fueraTras)
      }});
    }
    await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);

    const piezasRegistradas = nuevos.reduce((s, n) => s + cantidadDeRegistro(n), 0);
    clearSelection();
    const destino = sede ? ` (${sede.nombre})` : "";
    const detallePiezas = piezasRegistradas !== nuevos.length ? ` (${piezasRegistradas} piezas)` : "";
    okBox.textContent = nuevos.length + " patrón(es)" + detallePiezas +
      " registrados en el historial para la OT " + ot + " — " + empresa + destino + ".";
    okBox.style.display="block";
    document.getElementById("in-ot").value="";
    document.getElementById("in-tecnico").value="";
    document.getElementById("in-fecha").value = todayISO();
    document.getElementById("in-hora").value = horaActualHHMMSS();

    await render();
  }

  global.Metrologia.services.dispatchActions = Object.freeze({ registerDispatch });
})(window);
