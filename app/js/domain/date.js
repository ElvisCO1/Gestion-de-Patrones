/* Utilidades de fechas, hora local y presentación. */
(function (global) {
  "use strict";

  function todayISO() {
    const fecha = new Date();
    return fecha.getFullYear() + "-" + String(fecha.getMonth() + 1).padStart(2, "0") + "-" + String(fecha.getDate()).padStart(2, "0");
  }

  function horaActualHHMMSS() {
    const fecha = new Date();
    return [fecha.getHours(), fecha.getMinutes(), fecha.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
  }

  function isoDesdeFechaHoraLocal(fecha, hora) {
    const [anio, mes, dia] = String(fecha || "").split("-").map(Number);
    const [horaNum, minuto, segundo] = String(hora || "00:00:00").split(":").map(Number);
    if (!anio || !mes || !dia) return new Date().toISOString();
    const local = new Date(anio, mes - 1, dia, horaNum || 0, minuto || 0, segundo || 0);
    return isNaN(local.getTime()) ? new Date().toISOString() : local.toISOString();
  }

  function horaLocalDeISO(iso) {
    if (!iso) return "";
    const fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return "";
    return [fecha.getHours(), fecha.getMinutes(), fecha.getSeconds()].map(n => String(n).padStart(2, "0")).join(":");
  }

  function claveCronologica(registro) {
    const fecha = String((registro && registro.fecha) || "");
    return fecha + " " + (horaLocalDeISO(registro && registro.fechaHoraSalida) || "00:00:00");
  }

  function formatFecha(iso) {
    if (!iso) return "";
    const [anio, mes, dia] = iso.split("-");
    return dia + "/" + mes + "/" + anio;
  }

  global.Metrologia.modules.date = Object.freeze({
    todayISO, horaActualHHMMSS, isoDesdeFechaHoraLocal, horaLocalDeISO,
    claveCronologica, formatFecha
  });
})(window);
