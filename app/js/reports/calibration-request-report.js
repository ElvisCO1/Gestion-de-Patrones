/* Genera la solicitud mensual de calibración. */
(function (global) {
  "use strict";

  function downloadCalibrationRequest(context) {
    const { month, sections, candidates, selection, patrones,
      groupConsecutiveCodes, formatMesISO, createPdf, avisar } = context;
    const porSeccion = sections.map(section => {
      const codigos = candidates.filter(item => item.clave === section.clave && selection[item.codigo + "|" + item.clave]);
      const vistos = new Set();
      const lista = [];
      codigos.forEach(item => {
        if (vistos.has(item.codigo)) return;
        vistos.add(item.codigo);
        const patron = patrones.find(p => p.codigo === item.codigo);
        if (patron) lista.push(patron);
      });
      return { ...section, filas: groupConsecutiveCodes(lista, section.clave), total: lista.length };
    });
    const total = porSeccion.reduce((suma, section) => suma + section.total, 0);
    if (!total) { avisar("No hay nada seleccionado para la solicitud.", "info"); return false; }
    const doc = createPdf({ unit: "mm", format: "a4" });
    const marginX = 12;
    let y = 18;
    doc.setFontSize(14); doc.setFont(undefined, "bold");
    doc.text("SOLICITUD DE CALIBRACIÓN - " + formatMesISO(month), marginX, y);
    y += 6; doc.setFontSize(9); doc.setFont(undefined, "normal");
    doc.text("Generado: " + new Date().toLocaleString("es-PE") + "    Total de patrones: " + total, marginX, y);
    y += 3; doc.setDrawColor(180); doc.line(marginX, y, 198, y); y += 7;
    const colX = [marginX, marginX + 32, marginX + 54, marginX + 76, marginX + 96, marginX + 134, marginX + 172];
    const colW = [30, 20, 20, 18, 36, 36, 14];
    porSeccion.forEach(section => {
      if (!section.filas.length) return;
      if (y > 255) { doc.addPage(); y = 18; }
      doc.setFontSize(11); doc.setFont(undefined, "bold");
      doc.text(section.titulo + " (" + section.total + ")", marginX, y); y += 6;
      const encabezados = ["Equipo", "Marca", "Modelo", "Serie", "Código", section.colPuntos, "Lugar"];
      const encabezado = () => {
        doc.setFontSize(8); doc.setFont(undefined, "bold");
        encabezados.forEach((texto, i) => doc.text(texto, colX[i], y));
        y += 3.5; doc.setDrawColor(200); doc.line(marginX, y, 198, y); y += 4; doc.setFont(undefined, "normal");
      };
      encabezado();
      section.filas.forEach(fila => {
        doc.setFontSize(8);
        const celdas = [fila.equipo, fila.marca, fila.modelo, fila.serie, fila.codigo, fila.puntos, fila.lugar]
          .map((texto, i) => doc.splitTextToSize(String(texto), colW[i]));
        const lineas = Math.max(...celdas.map(celda => celda.length), 1);
        if (y + lineas * 3.6 > 285) { doc.addPage(); y = 18; encabezado(); }
        celdas.forEach((celda, i) => celda.forEach((linea, indice) => doc.text(linea, colX[i], y + indice * 3.6)));
        y += lineas * 3.6 + 1.6;
      });
      y += 6;
    });
    doc.save("Solicitud_Calibracion_" + month + ".pdf");
    return true;
  }

  global.Metrologia.modules.calibrationRequestReport = Object.freeze({ downloadCalibrationRequest });
})(window);
