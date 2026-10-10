/* Genera el PDF de inventario total o por laboratorio. */
(function (global) {
  "use strict";

  function downloadInventory(context, area) {
    const { patrones, claveArea, ordenarAreasInventario, patronBloqueadoPorCalibracion,
      createPdf, avisar, trozoNombreArchivo, todayISO } = context;
    const activos = patrones.filter(p => p.estado !== "Eliminado" && (!area || claveArea(p.area) === claveArea(area)));
    if (area && !activos.length) { avisar(`El laboratorio «${area}» no tiene patrones que listar.`, "error"); return; }
    const porArea = {};
    activos.forEach(p => { (porArea[p.area] ||= []).push(p); });
    const areas = ordenarAreasInventario(Object.keys(porArea));
    const doc = createPdf({ unit: "mm", format: "a4" });
    const marginX = 12;
    let y = 20;
    doc.setFontSize(15); doc.setFont(undefined, "bold");
    doc.text(area ? "Inventario de patrones — " + area : "Inventario de patrones por laboratorio", marginX, y);
    y += 7; doc.setFontSize(10); doc.setFont(undefined, "normal");
    doc.text("Generado: " + new Date().toLocaleString("es-PE") + "    Total: " + activos.length + " patron(es)", marginX, y);
    y += 4; doc.setDrawColor(210); doc.line(marginX, y, 198, y); y += 8;
    const colX = [marginX, marginX + 45, marginX + 120, marginX + 150];
    const encabezados = ["Código", "Marca / Nombre del instrumento", "Estado", "Observación"];
    const encabezado = () => {
      doc.setFontSize(9); doc.setFont(undefined, "bold");
      encabezados.forEach((texto, i) => doc.text(texto, colX[i], y));
      y += 4; doc.setDrawColor(210); doc.line(marginX, y, 198, y); y += 5; doc.setFont(undefined, "normal");
    };
    areas.forEach(nombreArea => {
      const lista = porArea[nombreArea].sort((a, b) => a.codigo.localeCompare(b.codigo));
      if (y > 260) { doc.addPage(); y = 20; }
      if (!area) {
        doc.setFontSize(12); doc.setFont(undefined, "bold"); doc.setTextColor(0, 0, 0);
        doc.text(`${nombreArea} (${lista.length} patron${lista.length === 1 ? "" : "es"})`, marginX, y); y += 7;
      }
      encabezado();
      lista.forEach(patron => {
        if (y > 280) { doc.addPage(); y = 20; encabezado(); }
        const marca = (patron.marca && patron.marca.trim()) ? patron.marca : patron.categoria;
        const observacion = (patron.observacion && patron.observacion.trim()) ? patron.observacion : "Ninguna";
        if (patron.estado === "Extraviado" || patron.estado === "No Cumple / Inoperativo" || patronBloqueadoPorCalibracion(patron)) doc.setTextColor(180, 30, 30);
        else doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        const codigo = doc.splitTextToSize(String(patron.codigo), 42);
        const marcaLineas = doc.splitTextToSize(String(marca), 72);
        const observacionLineas = doc.splitTextToSize(String(observacion), 46);
        const lineas = Math.max(codigo.length, marcaLineas.length, observacionLineas.length, 1);
        if (y + lineas * 4.5 > 285) { doc.addPage(); y = 20; encabezado(); }
        codigo.forEach((texto, i) => doc.text(texto, colX[0], y + i * 4.5));
        marcaLineas.forEach((texto, i) => doc.text(texto, colX[1], y + i * 4.5));
        doc.text(String(patron.estado), colX[2], y);
        observacionLineas.forEach((texto, i) => doc.text(texto, colX[3], y + i * 4.5));
        y += lineas * 4.5 + 1.5;
      });
      y += 6;
    });
    doc.setTextColor(0, 0, 0);
    const total = doc.getNumberOfPages();
    for (let pagina = 1; pagina <= total; pagina++) {
      doc.setPage(pagina); doc.setFontSize(8); doc.setFont(undefined, "normal"); doc.setTextColor(120);
      doc.text(`Página ${pagina} de ${total}`, marginX, 292);
      if (area) doc.text(area, 198, 292, { align: "right" });
      doc.setTextColor(0, 0, 0);
    }
    const nombre = area
      ? "Inventario_" + (trozoNombreArchivo(area, 60).replace(/\s+/g, "_") || "Laboratorio") + "_" + todayISO() + ".pdf"
      : "Inventario_Patrones_" + todayISO() + ".pdf";
    doc.save(nombre);
  }

  global.Metrologia.modules.inventoryReport = Object.freeze({ downloadInventory });
})(window);
