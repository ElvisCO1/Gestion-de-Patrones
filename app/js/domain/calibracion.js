/* Reglas puras de vigencia para CAL, V y M.
 * No conoce IndexedDB ni el DOM; eso permite probarlas de forma aislada. */
(function (global) {
  "use strict";

  const ACTIVIDADES_ISO = Object.freeze([
    { clave: "CAL", nombre: "Calibración" },
    { clave: "V", nombre: "Comprobación Intermedia" },
    { clave: "M", nombre: "Mantenimiento" }
  ]);
  const TIPOS_POR_ACTIVIDAD = Object.freeze({
    CAL: [["", "Sin especificar"], ["CI", "Interna (CI)"], ["CE", "Externa (CE)"]],
    V: [["", "Sin especificar"], ["VI", "Interna (VI)"], ["VE", "Externa (VE)"]],
    M: [["", "Sin especificar"], ["MP", "Preventivo (MP)"]]
  });
  const NOMBRES_TIPO = Object.freeze({ CI: "Interna", CE: "Externa", VI: "Interna", VE: "Externa", MP: "Preventivo" });

  const etiquetaTipoCal = tipo => !tipo ? "" : (NOMBRES_TIPO[tipo] || tipo);
  const actividadVacia = () => ({
    frecuenciaMeses: null, mesVencimiento: null, ultimoDocumento: "",
    ultimaFechaEjecucion: null, tipoCalibracion: null
  });
  function getActividades(patron) {
    const base = (patron && patron.actividades) || {};
    return ACTIVIDADES_ISO.reduce((resultado, actividad) => {
      resultado[actividad.clave] = { ...actividadVacia(), ...(base[actividad.clave] || {}) };
      return resultado;
    }, {});
  }
  function mesActualISO(fecha = new Date()) {
    return fecha.getFullYear() + "-" + String(fecha.getMonth() + 1).padStart(2, "0");
  }
  function sumarMesesAMes(mesISO, meses) {
    const [anio, mes] = String(mesISO).split("-").map(Number);
    const total = anio * 12 + (mes - 1) + Number(meses);
    return Math.floor(total / 12) + "-" + String((total % 12) + 1).padStart(2, "0");
  }
  function formatMesISO(mesISO) {
    if (!mesISO) return "";
    const [anio, mes] = String(mesISO).split("-");
    const nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return (nombres[Number(mes) - 1] || mes) + " " + anio;
  }
  function estadoActividad(actividad, fecha = new Date()) {
    if (!actividad || !actividad.mesVencimiento) return "sin_programar";
    const actual = mesActualISO(fecha);
    if (actividad.mesVencimiento < actual) return "vencido";
    if (actividad.mesVencimiento === actual) return "por_vencer";
    return "vigente";
  }
  function estadoCalibracion(patron, fecha = new Date()) {
    const actividades = getActividades(patron);
    const estados = ACTIVIDADES_ISO.map(({ clave }) => estadoActividad(actividades[clave], fecha));
    if (estados.includes("vencido")) return "vencido";
    if (estados.includes("por_vencer")) return "por_vencer";
    if (estados.every(estado => estado === "sin_programar")) return "sin_programar";
    return "vigente";
  }
  const patronBloqueadoPorCalibracion = patron => estadoCalibracion(patron) === "vencido";
  function actividadesVencidas(patron, fecha = new Date()) {
    const actividades = getActividades(patron);
    return ACTIVIDADES_ISO
      .filter(({ clave }) => estadoActividad(actividades[clave], fecha) === "vencido")
      .map(({ clave, nombre }) => ({ clave, nombre, mesVencimiento: actividades[clave].mesVencimiento }));
  }

  global.MetrologiaCalibracion = Object.freeze({
    ACTIVIDADES_ISO, TIPOS_POR_ACTIVIDAD, etiquetaTipoCal, actividadVacia,
    getActividades, mesActualISO, sumarMesesAMes, formatMesISO,
    estadoActividad, estadoCalibracion, patronBloqueadoPorCalibracion, actividadesVencidas
  });
})(window);
