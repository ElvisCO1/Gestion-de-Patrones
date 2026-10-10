/* Consultas puras compartidas por Catálogo de patrones y Programa anual. */
(function (global) {
  "use strict";

  const activity = global.Metrologia.modules.activity;
  const date = global.Metrologia.modules.date;
  const MESES_CORTOS = Object.freeze(["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]);

  function getAreas(patrones) {
    return Array.from(new Set((patrones || []).map(patron => patron.area))).sort();
  }

  function getCategorias(patrones, areaFiltro) {
    const base = areaFiltro && areaFiltro !== "Todas"
      ? (patrones || []).filter(patron => patron.area === areaFiltro)
      : (patrones || []);
    return Array.from(new Set(base.map(patron => patron.categoria))).sort();
  }

  function coincideBusqueda(patron, busqueda) {
    if (!busqueda) return true;
    const consulta = busqueda.toLowerCase();
    return [patron.codigo, patron.categoria, patron.marca, patron.modelo, patron.valorNominal]
      .some(valor => String(valor || "").toLowerCase().includes(consulta));
  }

  function patronesFiltrados(patrones, area, categoria, busqueda, soloDisponibles) {
    return (patrones || []).filter(patron => {
      if (soloDisponibles && (patron.estado !== "Disponible" || activity.patronBloqueadoPorCalibracion(patron))) return false;
      if (area && area !== "Todas" && patron.area !== area) return false;
      if (categoria && categoria !== "Todas" && patron.categoria !== categoria) return false;
      return coincideBusqueda(patron, busqueda);
    });
  }

  function aniosDisponiblesPrograma(patrones, actividadesEjecutadas) {
    const anios = new Set([new Date().getFullYear()]);
    (patrones || []).forEach(patron => {
      const actividades = activity.getActividades(patron);
      activity.ACTIVIDADES_ISO.forEach(({ clave }) => {
        const item = actividades[clave];
        if (item.mesVencimiento) anios.add(Number(item.mesVencimiento.slice(0, 4)));
        if (item.ultimaFechaEjecucion) anios.add(Number(item.ultimaFechaEjecucion.slice(0, 4)));
      });
    });
    (actividadesEjecutadas || []).forEach(item => {
      if (item.fechaEjecucion) anios.add(Number(item.fechaEjecucion.slice(0, 4)));
    });
    return Array.from(anios).filter(anio => !isNaN(anio)).sort();
  }

  function celdasAnioActividad(patron, clave, anio, actividadesEjecutadas) {
    const celdas = new Array(12).fill(null);
    const actividad = activity.getActividades(patron)[clave];
    const anioTexto = String(anio);
    (actividadesEjecutadas || [])
      .filter(item => item.codigoPatron === patron.codigo && item.clave === clave && item.fechaEjecucion && item.fechaEjecucion.slice(0, 4) === anioTexto)
      .forEach(item => {
        const mes = Number(item.fechaEjecucion.slice(5, 7)) - 1;
        if (mes >= 0 && mes < 12) celdas[mes] = {
          texto: item.tipo || clave, clase: "cal-realizado",
          titulo: `Realizado el ${date.formatFecha(item.fechaEjecucion)}${item.documento ? ` · Doc: ${item.documento}` : ""}`
        };
      });
    if (actividad.ultimaFechaEjecucion && actividad.ultimaFechaEjecucion.slice(0, 4) === anioTexto) {
      const mes = Number(actividad.ultimaFechaEjecucion.slice(5, 7)) - 1;
      if (mes >= 0 && mes < 12 && !celdas[mes]) celdas[mes] = {
        texto: actividad.tipoCalibracion || clave, clase: "cal-realizado",
        titulo: `Realizado el ${date.formatFecha(actividad.ultimaFechaEjecucion)}${actividad.ultimoDocumento ? ` · Doc: ${actividad.ultimoDocumento}` : ""}`
      };
    }
    if (actividad.mesVencimiento && actividad.mesVencimiento.slice(0, 4) === anioTexto) {
      const mes = Number(actividad.mesVencimiento.slice(5, 7)) - 1;
      const estado = activity.estadoActividad(actividad);
      if (mes >= 0 && mes < 12 && !celdas[mes]) celdas[mes] = {
        texto: actividad.tipoCalibracion || clave,
        clase: estado === "vencido" ? "cal-vencido" : estado === "por_vencer" ? "cal-porvencer" : "cal-programado",
        titulo: estado === "vencido" ? `Vencido desde ${activity.formatMesISO(actividad.mesVencimiento)}` : estado === "por_vencer" ? "Vence este mes" : `Programado para ${activity.formatMesISO(actividad.mesVencimiento)}`
      };
    }
    return celdas;
  }

  global.Metrologia.modules.catalogProgram = Object.freeze({
    MESES_CORTOS, getAreas, getCategorias, coincideBusqueda, patronesFiltrados,
    aniosDisponiblesPrograma, celdasAnioActividad
  });
})(window);
