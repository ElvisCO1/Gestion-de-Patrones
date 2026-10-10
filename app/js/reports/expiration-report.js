/* Genera el reporte PDF de vigencia de actividades ISO 17025. */
(function (global) {
  "use strict";

  function downloadExpirationReport(context) {
    const { patrones, getActividades, ACTIVIDADES_ISO, estadoActividad,
      formatMesISO, createPdf, todayISO } = context;
    const filas = [];
    patrones.forEach(patron => {
      const actividades = getActividades(patron);
      ACTIVIDADES_ISO.forEach(({ clave }) => {
        const actividad = actividades[clave];
        if (actividad.mesVencimiento) filas.push({
          codigo: patron.codigo, categoria: patron.categoria, area: patron.area,
          actividad: clave + (actividad.tipoCalibracion ? " (" + actividad.tipoCalibracion + ")" : ""),
          mesVencimiento: actividad.mesVencimiento, estado: estadoActividad(actividad)
        });
      });
    });
    const vencidas = filas.filter(f => f.estado === "vencido");
    const porVencer = filas.filter(f => f.estado === "por_vencer");
    const vigentes = filas.filter(f => f.estado === "vigente");
    const ordenadas = [
      ...vencidas.sort((a, b) => a.mesVencimiento.localeCompare(b.mesVencimiento)),
      ...porVencer,
      ...vigentes.sort((a, b) => a.mesVencimiento.localeCompare(b.mesVencimiento))
    ];
    const doc = createPdf({ unit: "mm", format: "a4" });
    const marginX = 12;
    let y = 20;
    doc.setFontSize(15); doc.setFont(undefined, "bold");
    doc.text("Reporte de vigencia de actividades ISO 17025", marginX, y);
    y += 7; doc.setFontSize(10); doc.setFont(undefined, "normal");
    doc.text("Generado: " + new Date().toLocaleString("es-PE"), marginX, y);
    y += 4; doc.setDrawColor(210); doc.line(marginX, y, 198, y); y += 8;
    doc.setFontSize(11); doc.setFont(undefined, "bold");
    doc.text(`Vencidas: ${vencidas.length}    Vencen este mes: ${porVencer.length}    Vigentes: ${vigentes.length}`, marginX, y);
    y += 9;
    const colX = [marginX, marginX + 35, marginX + 80, marginX + 108, marginX + 130, marginX + 158];
    const encabezados = ["Código", "Equipos", "Laboratorio", "Actividad", "Vence", "Estado"];
    const encabezado = () => {
      doc.setFont(undefined, "bold"); encabezados.forEach((h, i) => doc.text(h, colX[i], y));
      y += 4; doc.setDrawColor(210); doc.line(marginX, y, 198, y); y += 5; doc.setFont(undefined, "normal");
    };
    doc.setFontSize(9); encabezado();
    ordenadas.forEach(fila => {
      if (y > 280) { doc.addPage(); y = 20; encabezado(); }
      const textoEstado = fila.estado === "vencido" ? "VENCIDA" : fila.estado === "por_vencer" ? "Vence este mes" : "Vigente";
      if (fila.estado === "vencido") doc.setTextColor(180, 30, 30);
      else if (fila.estado === "por_vencer") doc.setTextColor(150, 100, 0);
      else doc.setTextColor(0, 0, 0);
      doc.text(String(fila.codigo).slice(0, 18), colX[0], y);
      doc.text(String(fila.categoria).slice(0, 22), colX[1], y);
      doc.text(String(fila.area).slice(0, 14), colX[2], y);
      doc.text(String(fila.actividad).slice(0, 14), colX[3], y);
      doc.text(formatMesISO(fila.mesVencimiento), colX[4], y);
      doc.text(textoEstado, colX[5], y); y += 5.5;
    });
    doc.setTextColor(0, 0, 0);
    const sinProgramar = patrones.filter(patron => {
      const actividades = getActividades(patron);
      return !ACTIVIDADES_ISO.some(({ clave }) => !!actividades[clave].mesVencimiento)
        && patron.estado !== "Eliminado" && patron.estado !== "De baja";
    });
    if (sinProgramar.length) {
      y += 6; if (y > 270) { doc.addPage(); y = 20; }
      doc.setFont(undefined, "bold"); doc.setFontSize(11);
      doc.text(`Patrones sin ninguna actividad programada: ${sinProgramar.length}`, marginX, y);
      y += 7; doc.setFont(undefined, "normal"); doc.setFontSize(9);
      sinProgramar.forEach(patron => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(`${patron.codigo} - ${patron.categoria} (${patron.area})`, marginX, y); y += 5;
      });
    }
    doc.save("Reporte_Vencimientos_ISO17025_" + todayISO() + ".pdf");
  }

  global.Metrologia.modules.expirationReport = Object.freeze({ downloadExpirationReport });
})(window);
