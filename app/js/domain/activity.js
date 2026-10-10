/* Reglas de actividades ISO 17025 y normalización de patrones. */
(function (global) {
  "use strict";

  const ACTIVIDADES_ISO = Object.freeze([
    Object.freeze({ clave: "CAL", nombre: "Calibración" }),
    Object.freeze({ clave: "V", nombre: "Comprobación Intermedia" }),
    Object.freeze({ clave: "M", nombre: "Mantenimiento" })
  ]);
  const TIPOS_POR_ACTIVIDAD = Object.freeze({
    CAL: Object.freeze([["", "Sin especificar"], ["CI", "Interna (CI)"], ["CE", "Externa (CE)"]]),
    V: Object.freeze([["", "Sin especificar"], ["VI", "Interna (VI)"], ["VE", "Externa (VE)"]]),
    M: Object.freeze([["", "Sin especificar"], ["MP", "Preventivo (MP)"]])
  });

  function normalizarNombre(nombre) {
    return String(nombre || "").trim().replace(/\s+/g, " ");
  }

  function normalizarCodigoPatron(codigo) {
    return String(codigo || "").trim().replace(/\s+/g, " ");
  }

  function etiquetaTipoCal(tipo) {
    if (!tipo) return "";
    return ({ CI: "Interna", CE: "Externa", VI: "Interna", VE: "Externa", MP: "Preventivo" })[tipo] || tipo;
  }

  function actividadVacia() {
    return { frecuenciaMeses: null, mesVencimiento: null, ultimoDocumento: "", ultimaFechaEjecucion: null, tipoCalibracion: null };
  }

  function getActividades(patron) {
    const base = patron.actividades || {};
    const resultado = {};
    ACTIVIDADES_ISO.forEach(({ clave }) => {
      resultado[clave] = { ...actividadVacia(), ...(base[clave] || {}) };
    });
    return resultado;
  }

  function mesActualISO() {
    const fecha = new Date();
    return fecha.getFullYear() + "-" + String(fecha.getMonth() + 1).padStart(2, "0");
  }

  function sumarMesesAMes(mesISO, meses) {
    const [anio, mes] = mesISO.split("-").map(Number);
    const total = (anio * 12 + (mes - 1)) + meses;
    return Math.floor(total / 12) + "-" + String((total % 12) + 1).padStart(2, "0");
  }

  function formatMesISO(mesISO) {
    if (!mesISO) return "";
    const [anio, mes] = mesISO.split("-");
    const nombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return (nombres[parseInt(mes, 10) - 1] || mes) + " " + anio;
  }

  function estadoActividad(actividad) {
    if (!actividad || !actividad.mesVencimiento) return "sin_programar";
    const actual = mesActualISO();
    if (actividad.mesVencimiento < actual) return "vencido";
    if (actividad.mesVencimiento === actual) return "por_vencer";
    return "vigente";
  }

  function estadoCalibracion(patron) {
    const estados = ACTIVIDADES_ISO.map(({ clave }) => estadoActividad(getActividades(patron)[clave]));
    if (estados.includes("vencido")) return "vencido";
    if (estados.includes("por_vencer")) return "por_vencer";
    return estados.every(estado => estado === "sin_programar") ? "sin_programar" : "vigente";
  }

  function patronBloqueadoPorCalibracion(patron) {
    return estadoCalibracion(patron) === "vencido";
  }

  function actividadesVencidas(patron) {
    const actividades = getActividades(patron);
    return ACTIVIDADES_ISO
      .filter(({ clave }) => estadoActividad(actividades[clave]) === "vencido")
      .map(({ clave, nombre }) => ({ clave, nombre, mesVencimiento: actividades[clave].mesVencimiento }));
  }

  global.Metrologia.modules.activity = Object.freeze({
    ACTIVIDADES_ISO, TIPOS_POR_ACTIVIDAD, normalizarNombre, normalizarCodigoPatron,
    etiquetaTipoCal, actividadVacia, getActividades, mesActualISO, sumarMesesAMes,
    formatMesISO, estadoActividad, estadoCalibracion, patronBloqueadoPorCalibracion,
    actividadesVencidas
  });
})(window);
