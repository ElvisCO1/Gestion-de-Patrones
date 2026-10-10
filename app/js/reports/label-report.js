/* Genera el PDF de etiquetas seleccionadas. */
(function (global) {
  "use strict";

  function downloadLabels(context) {
    const {
      selection, patrones, includeBars, getConfig, formatName, groupByEquipment,
      equipmentName, checkBarcodeLegibility, labelsPerPage, createPdf, drawLabel, avisar
    } = context;
    const codigos = Object.keys(selection).filter(codigo => selection[codigo])
      .filter(codigo => patrones.some(patron => patron.codigo === codigo && patron.estado !== "Eliminado"));
    if (!codigos.length) { avisar("Selecciona al menos un patrón para imprimir su etiqueta.", "info"); return; }
    const conBarras = includeBars();
    const configuracion = getConfig(conBarras);
    if (!configuracion) return;
    const formato = formatName(configuracion);
    const agrupar = groupByEquipment();
    const datos = codigos.map(codigo => patrones.find(patron => patron.codigo === codigo)).filter(Boolean);
    if (agrupar) datos.sort((a, b) => {
      const equipoA = equipmentName(a), equipoB = equipmentName(b);
      return equipoA === equipoB
        ? String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true })
        : equipoA.localeCompare(equipoB);
    });
    const faltantes = datos.filter(patron => !String(patron.valorNominal || patron.valor || "").trim());
    if (faltantes.length) { avisar("Falta el valor nominal en: " + faltantes.map(patron => patron.codigo).join(", "), "error"); return; }
    if (typeof window.jspdf === "undefined" || !window.jspdf.jsPDF) { avisar("No se pudo cargar el generador PDF.", "error"); return; }
    if (conBarras) {
      const { noCodificables, demasiadoFinos } = checkBarcodeLegibility(datos, configuracion);
      if (noCodificables.length) avisar("Estos códigos llevan caracteres que Code 128 no admite (tildes o símbolos raros) y saldrán sin barras: " + noCodificables.join(", ") + ".", "error");
      if (demasiadoFinos.length) avisar("Estos códigos son largos para el formato " + formato + ": las barras quedarían muy finas y el lector puede fallar. Usa una etiqueta más ancha (14 × 3,5 cm o una medida personalizada).\n" + demasiadoFinos.join(", "), "info");
    }
    const doc = createPdf({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210, pageHeight = 297, margin = 5, gap = configuracion.gap;
    const { cols, filas } = labelsPerPage(configuracion, margin);
    const gridWidth = cols * configuracion.w + (cols - 1) * gap;
    const startX = (pageWidth - gridWidth) / 2;
    const groupHeight = 7, groupGap = 2;
    const gridHeight = filas * configuracion.h + (filas - 1) * gap;
    const initialY = agrupar ? margin : (pageHeight - gridHeight) / 2;
    const limitY = agrupar ? pageHeight - margin : (pageHeight - gridHeight) / 2 + gridHeight + 0.01;
    let pageStarted = false, y = initialY, column = 0;
    const newPage = () => { if (pageStarted) doc.addPage(); else pageStarted = true; y = initialY; column = 0; };
    const groupHeader = title => {
      if (column > 0) { column = 0; y += configuracion.h + gap; }
      if (y + groupHeight + groupGap + configuracion.h > limitY) newPage();
      doc.setFillColor(30, 80, 160); doc.rect(startX, y, gridWidth, groupHeight, "F");
      doc.setFontSize(9); doc.setFont(undefined, "bold"); doc.setTextColor(255, 255, 255);
      doc.text(doc.splitTextToSize(title, gridWidth - 6)[0], startX + 3, y + groupHeight / 2 + 1.2);
      doc.setTextColor(0, 0, 0); doc.setFont(undefined, "normal"); y += groupHeight + groupGap;
    };
    let group = null;
    for (const patron of datos) {
      const equipo = equipmentName(patron);
      if (!pageStarted) newPage();
      if (agrupar && equipo !== group) { groupHeader("Equipos: " + equipo); group = equipo; }
      if (column >= cols) { column = 0; y += configuracion.h + gap; }
      if (y + configuracion.h > limitY) { newPage(); if (agrupar) groupHeader("Equipos: " + equipo + " (continúa)"); }
      const x = startX + column * (configuracion.w + gap);
      doc.setDrawColor(150); doc.setLineWidth(0.25); doc.rect(x, y, configuracion.w, configuracion.h);
      drawLabel(doc, patron, x, y, configuracion, conBarras); column++;
    }
    const nombre = "Etiquetas_Patrones_" + formato.replace(/\s/g, "").replace(/[×,]/g, match => match === "×" ? "x" : "_").replace("cm", "cm") + (conBarras ? "_barras" : "") + ".pdf";
    doc.save(nombre);
  }

  global.Metrologia.modules.labelReport = Object.freeze({ downloadLabels });
})(window);
