/* Generación del PDF de Inventario.
 * Recibe dependencias explícitas para no acoplarse a la interfaz ni al estado global. */
(function (global) {
  "use strict";

  function descargarInventarioPDF(area, ctx) {
    const { patrones, claveArea, ordenarAreas, crearPDF, avisar,
      patronBloqueadoPorCalibracion, trozoNombreArchivo, todayISO } = ctx;
    const activos = patrones.filter(patron =>
      patron.estado !== "Eliminado" && (!area || claveArea(patron.area) === claveArea(area)));
    if (area && !activos.length) {
      avisar(`El laboratorio «${area}» no tiene patrones que listar.`, "error");
      return;
    }

    const porArea = {};
    activos.forEach(patron => (porArea[patron.area] ||= []).push(patron));
    const areas = ordenarAreas(Object.keys(porArea));
    const doc = crearPDF({ unit: "mm", format: "a4" });
    const margen = 12;
    let y = 20;
    const columnas = [margen, margen + 45, margen + 120, margen + 150];
    const encabezados = ["Código", "Marca / Nombre del instrumento", "Estado", "Observación"];

    doc.setFontSize(15);
    doc.setFont(undefined, "bold");
    doc.text(area ? "Inventario de patrones — " + area : "Inventario de patrones por laboratorio", margen, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text("Generado: " + new Date().toLocaleString("es-PE") + "    Total: " + activos.length + " patron(es)", margen, y);
    y += 4;
    doc.setDrawColor(210);
    doc.line(margen, y, 198, y);
    y += 8;

    const dibujarEncabezado = () => {
      doc.setFontSize(9);
      doc.setFont(undefined, "bold");
      encabezados.forEach((texto, indice) => doc.text(texto, columnas[indice], y));
      y += 4;
      doc.setDrawColor(210);
      doc.line(margen, y, 198, y);
      y += 5;
      doc.setFont(undefined, "normal");
    };

    areas.forEach(nombreArea => {
      const lista = porArea[nombreArea].slice().sort((a, b) => a.codigo.localeCompare(b.codigo));
      if (y > 260) { doc.addPage(); y = 20; }
      if (!area) {
        doc.setFontSize(12);
        doc.setFont(undefined, "bold");
        doc.setTextColor(0, 0, 0);
        doc.text(`${nombreArea} (${lista.length} patron${lista.length === 1 ? "" : "es"})`, margen, y);
        y += 7;
      }
      dibujarEncabezado();

      lista.forEach(patron => {
        if (y > 280) { doc.addPage(); y = 20; dibujarEncabezado(); }
        const marcaONombre = patron.marca && patron.marca.trim() ? patron.marca : patron.categoria;
        const observacion = patron.observacion && patron.observacion.trim() ? patron.observacion : "Ninguna";
        const alerta = patron.estado === "Extraviado" || patron.estado === "No Cumple / Inoperativo" || patronBloqueadoPorCalibracion(patron);
        doc.setTextColor(...(alerta ? [180, 30, 30] : [0, 0, 0]));
        doc.setFontSize(9);
        const codigo = doc.splitTextToSize(String(patron.codigo), 42);
        const marca = doc.splitTextToSize(String(marcaONombre), 72);
        const nota = doc.splitTextToSize(String(observacion), 46);
        const lineas = Math.max(codigo.length, marca.length, nota.length, 1);
        if (y + lineas * 4.5 > 285) { doc.addPage(); y = 20; dibujarEncabezado(); }
        codigo.forEach((texto, indice) => doc.text(texto, columnas[0], y + indice * 4.5));
        marca.forEach((texto, indice) => doc.text(texto, columnas[1], y + indice * 4.5));
        doc.text(String(patron.estado), columnas[2], y);
        nota.forEach((texto, indice) => doc.text(texto, columnas[3], y + indice * 4.5));
        y += lineas * 4.5 + 1.5;
      });
      y += 6;
    });
    doc.setTextColor(0, 0, 0);

    const paginas = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= paginas; pagina++) {
      doc.setPage(pagina);
      doc.setFontSize(8);
      doc.setFont(undefined, "normal");
      doc.setTextColor(120);
      doc.text(`Página ${pagina} de ${paginas}`, margen, 292);
      if (area) doc.text(area, 198, 292, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
    const nombre = area
      ? "Inventario_" + (trozoNombreArchivo(area, 60).replace(/\s+/g, "_") || "Laboratorio") + "_" + todayISO() + ".pdf"
      : "Inventario_Patrones_" + todayISO() + ".pdf";
    doc.save(nombre);
  }

  global.MetrologiaReportesInventario = Object.freeze({ descargarInventarioPDF });
})(window);
