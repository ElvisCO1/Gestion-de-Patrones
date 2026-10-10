/* Consultas y agrupaciones inmutables para historial, salidas y devoluciones. */
(function (global) {
  "use strict";

  const activity = global.Metrologia.modules.activity;
  const inventory = global.Metrologia.modules.inventory;

  function porFechaDesc(campo) {
    return (a, b) => (a[campo] || "") < (b[campo] || "") ? 1 : -1;
  }

  function actividadesDePatron(actividades, codigo) {
    return (actividades || []).filter(item => item.codigoPatron === codigo).sort(porFechaDesc("fechaEjecucion"));
  }

  function salidasDePatron(historial, codigo) {
    return (historial || []).filter(item => item.codigo === codigo && item.estadoMovimiento !== "Anulado")
      .sort((a, b) => (a.fechaHoraSalida || a.fecha || "") < (b.fechaHoraSalida || b.fecha || "") ? 1 : -1);
  }

  function ultimaCalibracionDe(patron, actividades) {
    const calibraciones = actividadesDePatron(actividades, patron.codigo).filter(item => item.clave === "CAL");
    return calibraciones.length ? calibraciones[0].fechaEjecucion : activity.getActividades(patron).CAL.ultimaFechaEjecucion || null;
  }

  function serviciosDesdeUltimaCalibracion(patron, historial, actividades) {
    const desde = ultimaCalibracionDe(patron, actividades);
    return salidasDePatron(historial, patron.codigo).filter(item => !desde || (item.fecha || "") >= desde);
  }

  function claveSalida(registro) {
    return String((registro && registro.salidaId) || "") || (String((registro && registro.numeroOT) || "") + "||" + String((registro && registro.fecha) || ""));
  }

  function numeroDeServicio(historial, salidaId) {
    const filas = (historial || []).filter(item => claveSalida(item) === salidaId);
    if (!filas.length || !filas[0].numeroOT) return 0;
    const ordenes = new Map();
    (historial || []).forEach(item => {
      if (String(item.numeroOT || "") !== String(filas[0].numeroOT || "")) return;
      const clave = claveSalida(item);
      const sello = String(item.registradoEn || item.fechaHoraSalida || item.fecha || "");
      if (!ordenes.has(clave) || sello < ordenes.get(clave)) ordenes.set(clave, sello);
    });
    if (ordenes.size < 2) return 0;
    const orden = [...ordenes.entries()].sort((a, b) => a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1));
    return orden.findIndex(([clave]) => clave === salidaId) + 1;
  }

  function agruparPorOT(historial, resolverEncargados, separador) {
    const mapa = {};
    const orden = [];
    (historial || []).forEach(item => {
      const clave = claveSalida(item);
      if (!mapa[clave]) {
        mapa[clave] = {
          salidaId: clave, numeroOT: item.numeroOT, fecha: item.fecha, fechaHoraSalida: item.fechaHoraSalida || "", generadoEn: "", actualizadoEn: "",
          empresa: item.empresa, tecnico: item.tecnico, clienteId: item.clienteId || "", clienteRuc: item.clienteRuc || "",
          sede: item.sede || "", direccion: item.direccion || "", contactoSede: item.contactoSede || "", telefonoSede: item.telefonoSede || "",
          laptop: item.laptop, termohigrometro: item.termohigrometro, multimetro: item.multimetro || "", extra: item.extra || "", encargadoLaboratorio: item.encargadoLaboratorio || "",
          patrones: [], observacionesOT: [], observacionesDocumento: [], auditoriaObservacionesPDF: []
        };
        orden.push(clave);
      }
      const sello = String(item.registradoEn || item.fechaHoraSalida || item.fecha || "");
      if (sello && (!mapa[clave].generadoEn || sello < mapa[clave].generadoEn)) mapa[clave].generadoEn = sello;
      const marcasActualizacion = [item.registradoEn, item.fechaHoraSalida, item.fechaHoraDevolucion, item.fecha]
        .concat((Array.isArray(item.observaciones) ? item.observaciones : []).map(observacion => observacion.fechaHora))
        .concat((Array.isArray(item.devolucionesAnuladas) ? item.devolucionesAnuladas : []).map(anulada => anulada.anuladoEn));
      marcasActualizacion.filter(Boolean).forEach(marca => {
        const actualizadaEn = String(marca);
        if (!mapa[clave].actualizadoEn || actualizadaEn > mapa[clave].actualizadoEn) mapa[clave].actualizadoEn = actualizadaEn;
      });
      mapa[clave].patrones.push({
        id: item.id, codigo: item.codigo, categoria: item.categoria, area: item.area || "", valorNominal: item.valorNominal || "",
        tipoMovimiento: item.tipoMovimiento || "Salida", estadoMovimiento: item.estadoMovimiento || "En servicio",
        fechaHoraDevolucion: item.fechaHoraDevolucion || "", observaciones: Array.isArray(item.observaciones) ? item.observaciones : [],
        devolucionesAnuladas: Array.isArray(item.devolucionesAnuladas) ? item.devolucionesAnuladas : [], motivoAnulacion: item.motivoAnulacion || "",
        anuladoEn: item.anuladoEn || "", cantidad: inventory.cantidadDeRegistro(item), esGrupo: Boolean(item.esGrupo), unidadesGrupo: item.unidadesGrupo || null
      });
      (Array.isArray(item.observaciones) ? item.observaciones : []).filter(observacion => observacion.alcance === "OT").forEach(observacion => {
        // Los registros existentes no tenian destino: por seguridad son internos.
        const destino = observacion.destino === "documento" ? "documento" : "interno";
        const lista = destino !== "documento" ? mapa[clave].observacionesOT
          : ["reemplazada", "retirada"].includes(observacion.estado) ? mapa[clave].auditoriaObservacionesPDF
          : mapa[clave].observacionesDocumento;
        if (!lista.some(existente => existente.id === observacion.id)) lista.push(observacion);
      });
    });
    orden.forEach(clave => {
      const grupo = mapa[clave];
      if (!grupo.encargadoLaboratorio && typeof resolverEncargados === "function") grupo.encargadoLaboratorio = resolverEncargados(grupo.patrones.map(patron => patron.area)).join(separador);
      grupo.observacionesOT.sort((a, b) => String(a.fechaHora || "") < String(b.fechaHora || "") ? -1 : 1);
      grupo.observacionesDocumento.sort((a, b) => String(a.fechaHora || "") < String(b.fechaHora || "") ? -1 : 1);
      grupo.auditoriaObservacionesPDF.sort((a, b) => String(a.reemplazadaEn || a.fechaHora || "") < String(b.reemplazadaEn || b.fechaHora || "") ? -1 : 1);
    });
    return orden.map(clave => mapa[clave]);
  }

  function nuevaObservacion({ texto, autor, alcance = "patron", tipo = "nota", destino = "interno" }, nuevoId) {
    return { id: nuevoId("obs"), texto: String(texto || "").trim(), autor: String(autor || "").trim(), alcance, tipo, destino, fechaHora: new Date().toISOString() };
  }

  function etiquetaCantidad(registro) {
    const cantidad = inventory.cantidadDeRegistro(registro);
    if (cantidad <= 1 && !registro.esGrupo) return "";
    const total = registro.unidadesGrupo ? ` de ${registro.unidadesGrupo}` : "";
    return ` <span class="badge grupo" title="Piezas de este grupo en esta OT">× ${cantidad}${total} piezas</span>`;
  }

  global.Metrologia.modules.history = Object.freeze({
    actividadesDePatron, salidasDePatron, ultimaCalibracionDe, serviciosDesdeUltimaCalibracion,
    claveSalida, numeroDeServicio, agruparPorOT, nuevaObservacion, etiquetaCantidad
  });
})(window);
