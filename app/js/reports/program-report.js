/* Genera el PDF del programa anual de actividades. */
(function (global) {
  "use strict";

  function downloadProgram(context) {
    const { anio, area, activityFilter, ACTIVIDADES_ISO, patrones,
      celdasAnioActividad, MESES_CORTOS, createPdf, avisar } = context;
    const claves = activityFilter === "Todas" ? ACTIVIDADES_ISO.map(a => a.clave) : [activityFilter];
    const filas = [];
    patrones.filter(p => p.estado !== "Eliminado" && (area === "Todas" || p.area === area))
      .sort((a, b) => a.area.localeCompare(b.area) || a.codigo.localeCompare(b.codigo))
      .forEach(p => claves.forEach(clave => {
        const celdas = celdasAnioActividad(p, clave, anio);
        if (celdas.some(Boolean)) filas.push({ p, clave, celdas });
      }));
    if (!filas.length) { avisar("No hay actividades para " + anio + " con esos filtros.", "info"); return; }
    const doc = createPdf({ unit: "mm", format: "a4", orientation: "landscape" });
    const mx = 10, anchoPatron = 62, anchoMes = 17;
    let y = 16;
    const encabezado = () => {
      doc.setFontSize(13); doc.setFont(undefined, "bold");
      doc.text(`Programa de calibración, comprobación intermedia y mantenimiento — ${anio}`, mx, y);
      y += 5; doc.setFontSize(8); doc.setFont(undefined, "normal");
      doc.text(`Laboratorio: ${area === "Todas" ? "todos" : area}    Generado: ${new Date().toLocaleString("es-PE")}`, mx, y);
      y += 5; doc.setFont(undefined, "bold"); doc.setFontSize(8);
      doc.text("Patrón / actividad", mx, y);
      MESES_CORTOS.forEach((mes, i) => doc.text(mes, mx + anchoPatron + i * anchoMes + 4, y));
      y += 2; doc.setDrawColor(170); doc.line(mx, y, mx + anchoPatron + 12 * anchoMes, y);
      y += 4.5; doc.setFont(undefined, "normal");
    };
    encabezado();
    filas.forEach(({ p, clave, celdas }) => {
      if (y > 195) { doc.addPage(); y = 16; encabezado(); }
      const nombre = ACTIVIDADES_ISO.find(a => a.clave === clave).nombre;
      doc.setFontSize(7.5); doc.text(String(p.codigo).slice(0, 26), mx, y);
      doc.setTextColor(110); doc.text(nombre, mx + 34, y); doc.setTextColor(0);
      celdas.forEach((celda, i) => {
        if (!celda) return;
        const x = mx + anchoPatron + i * anchoMes;
        if (celda.clase === "cal-realizado") doc.setTextColor(8, 80, 65);
        else if (celda.clase === "cal-vencido") doc.setTextColor(180, 30, 30);
        else if (celda.clase === "cal-porvencer") doc.setTextColor(150, 100, 0);
        else doc.setTextColor(31, 63, 121);
        doc.setFont(undefined, "bold"); doc.text(String(celda.texto), x + 4, y);
        doc.setFont(undefined, "normal"); doc.setTextColor(0);
      });
      y += 4.6;
    });
    y += 5; if (y > 190) { doc.addPage(); y = 16; }
    doc.setFontSize(8);
    doc.text("Leyenda:  CI = Calibración Interna · CE = Calibración Externa · VI/VE = Comprobación Intermedia · MP = Mantenimiento Preventivo", mx, y);
    y += 4;
    doc.text("Color:  verde = realizado · azul = programado · ámbar = vence este mes · rojo = vencido", mx, y);
    doc.save(`Programa_${anio}${area === "Todas" ? "" : "_" + area.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
  }

  global.Metrologia.modules.programReport = Object.freeze({ downloadProgram });
})(window);
