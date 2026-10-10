/* Reglas operativas de inventario, movimientos y patrones por grupo. */
(function (global) {
  "use strict";

  const ESTADOS_FUERA_DE_USO = Object.freeze(["Eliminado", "De baja", "Extraviado", "No Cumple / Inoperativo"]);
  const MOVIMIENTOS_CERRADOS = Object.freeze(["Devuelto", "Enviado a otro servicio", "Anulado"]);

  function movimientoCerrado(registro) {
    return MOVIMIENTOS_CERRADOS.includes(registro && registro.estadoMovimiento);
  }

  function esPatronGrupo(patron) {
    return Boolean(patron && patron.esGrupo);
  }

  function unidadesDeGrupo(patron) {
    if (!esPatronGrupo(patron)) return 1;
    const unidades = parseInt(patron.unidades, 10);
    return Number.isInteger(unidades) && unidades > 0 ? unidades : 1;
  }

  function cantidadDeRegistro(registro) {
    const cantidad = parseInt(registro && registro.cantidad, 10);
    return Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1;
  }

  function unidadesFueraDe(codigo, historial) {
    return (historial || [])
      .filter(registro => registro.codigo === codigo && !movimientoCerrado(registro))
      .reduce((suma, registro) => suma + cantidadDeRegistro(registro), 0);
  }

  function unidadesDisponiblesDe(patron, historial) {
    return Math.max(0, unidadesDeGrupo(patron) - unidadesFueraDe(patron.codigo, historial));
  }

  function estadoTrasMovimiento(patron, unidadesFueraProyectadas) {
    if (patron.estado !== "Disponible" && patron.estado !== "En servicio") return patron.estado;
    return unidadesFueraProyectadas >= unidadesDeGrupo(patron) ? "En servicio" : "Disponible";
  }

  function descripcionDisponibilidadGrupo(patron, historial) {
    const total = unidadesDeGrupo(patron);
    return `Grupo · ${unidadesDisponiblesDe(patron, historial)} de ${total} disponibles`;
  }

  function grupoSinPiezasLibres(patron, historial) {
    return esPatronGrupo(patron) && unidadesDisponiblesDe(patron, historial) <= 0;
  }

  function diasDesde(fechaISO) {
    if (!fechaISO) return null;
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO);
    const fecha = soloFecha
      ? new Date(Number(fechaISO.slice(0, 4)), Number(fechaISO.slice(5, 7)) - 1, Number(fechaISO.slice(8, 10)))
      : new Date(fechaISO);
    if (isNaN(fecha.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - fecha.getTime()) / 86400000));
  }

  function salidaActivaDe(codigo, historial) {
    const abiertas = (historial || []).filter(registro => registro.codigo === codigo && !movimientoCerrado(registro));
    return abiertas.sort((a, b) => (a.fechaHoraSalida || a.fecha || "") < (b.fechaHoraSalida || b.fecha || "") ? 1 : -1)[0] || null;
  }

  global.Metrologia.modules.inventory = Object.freeze({
    ESTADOS_FUERA_DE_USO, MOVIMIENTOS_CERRADOS, movimientoCerrado, esPatronGrupo,
    unidadesDeGrupo, cantidadDeRegistro, unidadesFueraDe, unidadesDisponiblesDe,
    estadoTrasMovimiento, descripcionDisponibilidadGrupo, grupoSinPiezasLibres,
    diasDesde, salidaActivaDe
  });
})(window);
