/* Vista previa e impresion de etiquetas; comparte configuracion con el PDF. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function printLabels(dependencies) {
    const selected = dependencies.getSelectedPatterns();
    if (!selected) return;
    const withBarcode = dependencies.includeBarcodes();
    const config = dependencies.currentConfig(withBarcode);
    if (!config) return;
    const format = dependencies.formatName(config);
    const groupByEquipment = dependencies.groupByEquipment();
    const { cols } = dependencies.labelsPerPage(config, 8);
    const horizontal = withBarcode && config.orientacion === 'horizontal';
    const labelHtml = (pattern) => {
      const code = String(pattern.codigo || '');
      const barWidth = horizontal ? config.w * 0.52 - 2 : config.w - 6;
      const barcode = withBarcode && dependencies.isBarcodeEncodable(code)
        ? dependencies.barcodeSvg(code, barWidth, config.barras) : '';
      return `<div class="etiqueta${horizontal ? ' horizontal' : ''}">${barcode}<div class="etiqueta-texto"><div class="etiqueta-codigo">${dependencies.escapeHTML(code)}</div><div class="etiqueta-valor">${dependencies.escapeHTML(pattern.valorNominal)}</div></div></div>`;
    };

    const usableHeight = 297 - 16;
    const groupHeight = 7;
    const groupGap = 2;
    const rowHeight = config.h + config.gap;
    const gridWidth = cols * config.w + (cols - 1) * config.gap;
    const ordered = [...selected];
    if (groupByEquipment) {
      ordered.sort((left, right) => {
        const leftName = dependencies.equipmentName(left);
        const rightName = dependencies.equipmentName(right);
        return leftName === rightName
          ? String(left.codigo || '').localeCompare(String(right.codigo || ''), 'es', { numeric: true })
          : leftName.localeCompare(rightName, 'es');
      });
    }
    const groups = [];
    ordered.forEach((pattern) => {
      const equipment = groupByEquipment ? dependencies.equipmentName(pattern) : null;
      if (!groups.length || groups.at(-1).equipment !== equipment) groups.push({ equipment, items: [] });
      groups.at(-1).items.push(pattern);
    });

    const pages = [];
    let page = [];
    let usedHeight = 0;
    const closePage = () => { if (page.length) pages.push(page); page = []; usedHeight = 0; };
    groups.forEach((group) => {
      let remaining = group.items.slice();
      let continuation = false;
      while (remaining.length) {
        const titleHeight = groupByEquipment ? groupHeight + groupGap : 0;
        if (usedHeight + titleHeight + config.h > usableHeight) closePage();
        if (groupByEquipment) {
          const title = `Equipos: ${group.equipment}${continuation ? ' (continúa)' : ''}`;
          page.push(`<div class="grupo-header">${dependencies.escapeHTML(title)}</div>`);
          usedHeight += titleHeight;
          continuation = true;
        }
        const fittingRows = Math.max(1, Math.floor((usableHeight - usedHeight + config.gap) / rowHeight));
        const batch = remaining.splice(0, fittingRows * cols);
        page.push(`<div class="grupo-rejilla">${batch.map(labelHtml).join('')}</div>`);
        usedHeight += Math.ceil(batch.length / cols) * rowHeight;
        if (remaining.length) closePage();
      }
    });
    closePage();

    const popup = global.open('', '_blank', 'width=1000,height=800');
    if (!popup) {
      dependencies.notify('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta aplicación.', 'error');
      return;
    }
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de patrones (${format})</title><style>
      @page { size: A4 portrait; margin: 8mm; } * { box-sizing:border-box; }
      html,body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,Helvetica,sans-serif; }
      .hoja { page-break-after:always; break-after:page; } .hoja:last-child { page-break-after:auto; break-after:auto; }
      .grupo-rejilla { display:grid; grid-template-columns:repeat(${cols}, ${config.w}mm); grid-auto-rows:${config.h}mm; gap:${config.gap}mm; justify-content:center; align-content:start; margin-bottom:${config.gap}mm; }
      .grupo-header { width:${gridWidth}mm; max-width:100%; margin:0 auto ${groupGap}mm; height:${groupHeight}mm; background:#1e50a0; color:#fff; font-size:9pt; font-weight:700; display:flex; align-items:center; padding:0 3mm; border-radius:1mm; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      .etiqueta { border:.35mm solid #222; border-radius:1mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; overflow:hidden; padding:1mm 2mm; }
      .etiqueta.horizontal { flex-direction:row; justify-content:space-between; gap:2mm; padding:.8mm 2mm; } .etiqueta.horizontal .etiqueta-texto { text-align:left; align-items:flex-start; }
      .etiqueta-texto { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; } .etiqueta-barras { margin-bottom:.8mm; flex:0 0 auto; } .etiqueta.horizontal .etiqueta-barras { margin-bottom:0; }
      .etiqueta-codigo { font-size:${config.codigo}pt; font-weight:700; line-height:1.05; overflow-wrap:anywhere; } .etiqueta-valor { font-size:${config.valor}pt; font-weight:400; line-height:1.05; margin-top:.6mm; overflow-wrap:anywhere; }
      @media print { .etiqueta-barras,.grupo-header { -webkit-print-color-adjust:exact; print-color-adjust:exact; } .grupo-header,.grupo-rejilla { break-inside:avoid; page-break-inside:avoid; } }
      @media screen { body { padding:10px; background:#eee; } .hoja { width:194mm; min-height:281mm; margin:0 auto 15px; background:#fff; box-shadow:0 0 8px rgba(0,0,0,.2); padding:8mm; } }
    </style></head><body>${pages.map((blocks) => `<div class="hoja">${blocks.join('')}</div>`).join('')}</body></html>`);
    popup.document.close();
    popup.focus();
    global.setTimeout(() => popup.print(), 350);
  }

  namespace.modules.labelPrint = Object.freeze({ printLabels });
})(window);
