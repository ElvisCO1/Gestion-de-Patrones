/* Genera la ficha PDF y hoja de vida de un patrón. */
(function (global) {
  "use strict";

  function downloadPatternSheet(context, codigo) {
    const { patrones, getActividades, activitiesOfPattern, dispatchesOfPattern,
      lastCalibrationOf, ACTIVIDADES_ISO, estadoActividad, formatMesISO,
      formatFecha, createPdf } = context;
    const patron = patrones.find(item => item.codigo === codigo);
    if (!patron) return;
    const actividades = getActividades(patron);
    const ejecutadas = activitiesOfPattern(patron.codigo);
    const salidas = dispatchesOfPattern(patron.codigo);
    const ultimaCalibracion = lastCalibrationOf(patron);
    const doc = createPdf({ unit: "mm", format: "a4" });
    const mx = 14;
    let y = 18;
    doc.setFontSize(14); doc.setFont(undefined, "bold");
    doc.text("Ficha de patrón - " + patron.codigo, mx, y); y += 6;
    doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text("Generado: " + new Date().toLocaleString("es-PE"), mx, y); y += 3;
    doc.setDrawColor(180); doc.line(mx, y, 196, y); y += 7;
    const datos = [
      ["Laboratorio", patron.area], ["Equipos", patron.categoria], ["Marca", patron.marca || "No indica"],
      ["Modelo", patron.modelo || "No indica"], ["Serie", patron.serie || "No indica"],
      ["Valor nominal", patron.valorNominal || "-"], ["Lugar de uso", patron.lugarUso || "Campo"],
      ["Estado operativo", patron.estado], ["Última calibración", ultimaCalibracion ? formatFecha(ultimaCalibracion) : "Sin registro"],
      ["Observación", patron.observacion || "Ninguna"]
    ];
    doc.setFontSize(9);
    datos.forEach(([etiqueta, valor]) => {
      if (y > 275) { doc.addPage(); y = 18; }
      const lineas = doc.splitTextToSize(String(valor), 120);
      doc.setFont(undefined, "bold"); doc.text(etiqueta + ":", mx, y); doc.setFont(undefined, "normal");
      lineas.forEach((linea, indice) => doc.text(linea, mx + 45, y + indice * 4));
      y += Math.max(1, lineas.length) * 4 + 1;
    });
    const seccion = titulo => {
      y += 4; if (y > 265) { doc.addPage(); y = 18; }
      doc.setFont(undefined, "bold"); doc.setFontSize(11); doc.text(titulo, mx, y); y += 6;
      doc.setFont(undefined, "normal"); doc.setFontSize(9);
    };
    seccion("Programa de actividades");
    ACTIVIDADES_ISO.forEach(({ clave, nombre }) => {
      const actividad = actividades[clave];
      if (y > 280) { doc.addPage(); y = 18; }
      const estado = estadoActividad(actividad);
      const texto = `${nombre} (${clave})${actividad.tipoCalibracion ? " " + actividad.tipoCalibracion : ""}: cada ${actividad.frecuenciaMeses || "-"} meses · vence ${actividad.mesVencimiento ? formatMesISO(actividad.mesVencimiento) : "-"} · ${estado === "vencido" ? "VENCIDA" : estado === "por_vencer" ? "vence este mes" : estado === "vigente" ? "vigente" : "sin programar"}`;
      doc.setTextColor(estado === "vencido" ? 180 : 0, estado === "vencido" ? 30 : 0, estado === "vencido" ? 30 : 0);
      doc.text(texto, mx, y); y += 5;
    });
    doc.setTextColor(0, 0, 0);
    seccion("Historial de actividades ejecutadas (" + ejecutadas.length + ")");
    if (!ejecutadas.length) { doc.text("Sin registros en la app.", mx, y); y += 5; }
    ejecutadas.forEach(actividad => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(`${formatFecha(actividad.fechaEjecucion)} · ${actividad.nombreActividad || actividad.clave}${actividad.tipo ? " (" + actividad.tipo + ")" : ""} · Doc: ${actividad.documento || "-"} · Prox: ${formatMesISO(actividad.mesVencimientoResultante)}`, mx, y); y += 5;
    });
    seccion("Servicios en los que se usó (" + salidas.length + ")");
    if (!salidas.length) { doc.text("Sin salidas registradas.", mx, y); y += 5; }
    salidas.forEach(salida => {
      if (y > 280) { doc.addPage(); y = 18; }
      doc.text(`OT ${salida.numeroOT} · ${formatFecha(salida.fecha)} · ${salida.empresa || ""} · ${salida.tecnico || ""} · ${salida.estadoMovimiento || "En servicio"}`, mx, y); y += 5;
    });
    doc.save("Ficha_" + String(patron.codigo).replace(/[^a-zA-Z0-9-]/g, "_") + ".pdf");
  }

  global.Metrologia.modules.patternSheetReport = Object.freeze({ downloadPatternSheet });
})(window);
