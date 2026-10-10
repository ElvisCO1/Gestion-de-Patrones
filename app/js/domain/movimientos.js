/* Reglas de inventario para salidas y devoluciones.
 * Todas reciben sus datos como argumentos: no dependen de la interfaz,
 * IndexedDB ni variables globales de la aplicación. */
(function (global) {
  "use strict";

  const MOVIMIENTOS_CERRADOS = Object.freeze(["Devuelto", "Enviado a otro servicio", "Anulado"]);
  const movimientoCerrado = registro => MOVIMIENTOS_CERRADOS.includes(registro && registro.estadoMovimiento);
  const esPatronGrupo = patron => Boolean(patron && patron.esGrupo);
  function unidadesDeGrupo(patron) {
    if (!esPatronGrupo(patron)) return 1;
    const unidades = Number.parseInt(patron.unidades, 10);
    return Number.isInteger(unidades) && unidades > 0 ? unidades : 1;
  }
  function cantidadDeRegistro(registro) {
    const cantidad = Number.parseInt(registro && registro.cantidad, 10);
    return Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 1;
  }
  function unidadesFueraDe(historial, codigo) {
    return (historial || [])
      .filter(registro => registro.codigo === codigo && !movimientoCerrado(registro))
      .reduce((total, registro) => total + cantidadDeRegistro(registro), 0);
  }
  function unidadesDisponiblesDe(patron, historial) {
    return Math.max(0, unidadesDeGrupo(patron) - unidadesFueraDe(historial, patron.codigo));
  }
  function estadoTrasMovimiento(patron, unidadesFueraProyectadas) {
    if (patron.estado !== "Disponible" && patron.estado !== "En servicio") return patron.estado;
    return unidadesFueraProyectadas >= unidadesDeGrupo(patron) ? "En servicio" : "Disponible";
  }
  function descripcionDisponibilidadGrupo(patron, historial) {
    const total = unidadesDeGrupo(patron);
    const disponibles = unidadesDisponiblesDe(patron, historial);
    return `Grupo · ${disponibles} de ${total} disponibles`;
  }
  const grupoSinPiezasLibres = (patron, historial) =>
    esPatronGrupo(patron) && unidadesDisponiblesDe(patron, historial) <= 0;
  function diasDesde(fechaISO, ahora = Date.now()) {
    if (!fechaISO) return null;
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaISO);
    const fecha = soloFecha
      ? new Date(Number(fechaISO.slice(0, 4)), Number(fechaISO.slice(5, 7)) - 1, Number(fechaISO.slice(8, 10)))
      : new Date(fechaISO);
    const diferencia = ahora - fecha.getTime();
    if (Number.isNaN(diferencia)) return null;
    return Math.max(0, Math.floor(diferencia / 86400000));
  }
  function salidaActivaDe(historial, codigo) {
    const abiertas = (historial || []).filter(registro => registro.codigo === codigo && !movimientoCerrado(registro));
    if (!abiertas.length) return null;
    return abiertas.slice().sort((a, b) =>
      (a.fechaHoraSalida || a.fecha || "") < (b.fechaHoraSalida || b.fecha || "") ? 1 : -1)[0];
  }

  global.MetrologiaMovimientos = Object.freeze({
    MOVIMIENTOS_CERRADOS, movimientoCerrado, esPatronGrupo, unidadesDeGrupo,
    cantidadDeRegistro, unidadesFueraDe, unidadesDisponiblesDe,
    estadoTrasMovimiento, descripcionDisponibilidadGrupo, grupoSinPiezasLibres,
    diasDesde, salidaActivaDe
  });
})(window);
