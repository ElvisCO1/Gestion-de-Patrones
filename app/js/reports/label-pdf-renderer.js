/* Dibuja una etiqueta individual en jsPDF, con o sin codigo de barras. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function draw(context, doc, pattern, x, y, config, withBarcode) {
    const { fitFont, isBarcodeEncodable, drawBarcode } = context;
    const code = String(pattern.codigo || '');
    const value = String(pattern.valorNominal || pattern.valor || '');
    const pointToMm = 25.4 / 72;
    const measureLine = (text, width, size, bold) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const finalSize = fitFont(doc, text, width, size, 4.5);
      return { size: finalSize, height: finalSize * pointToMm, bold };
    };
    const paint = (text, line, xPosition, centerY, align) => {
      doc.setFont('helvetica', line.bold ? 'bold' : 'normal');
      doc.setFontSize(line.size);
      doc.text(text, xPosition, centerY, { align: align || 'center', baseline: 'middle' });
    };
    const margin = 1.5;
    const gap = 1.1;
    const sideMargin = 3;
    if (!withBarcode || !isBarcodeEncodable(code)) {
      const width = config.w - 4;
      const codeLine = measureLine(code, width, config.codigoTexto ?? config.codigo, true);
      const valueLine = measureLine(value, width, config.valorTexto ?? config.valor, false);
      const height = codeLine.height + (value ? gap + valueLine.height : 0);
      const top = y + (config.h - height) / 2;
      paint(code, codeLine, x + config.w / 2, top + codeLine.height / 2);
      if (value) paint(value, valueLine, x + config.w / 2, top + codeLine.height + gap + valueLine.height / 2);
      return;
    }
    if (config.orientacion === 'horizontal') {
      const barcodeWidth = config.w * 0.52 - 2;
      drawBarcode(doc, code, x + 2, y + (config.h - config.barras) / 2, barcodeWidth, config.barras);
      const textX = x + config.w * 0.54;
      const textWidth = config.w * 0.46 - 3;
      const codeLine = measureLine(code, textWidth, config.codigo, true);
      const valueLine = measureLine(value, textWidth, config.valor, false);
      const height = codeLine.height + (value ? gap + valueLine.height : 0);
      const top = y + (config.h - height) / 2;
      paint(code, codeLine, textX, top + codeLine.height / 2, 'left');
      if (value) paint(value, valueLine, textX, top + codeLine.height + gap + valueLine.height / 2, 'left');
      return;
    }
    const textWidth = config.w - 4;
    const codeLine = measureLine(code, textWidth, config.codigo, true);
    const valueLine = measureLine(value, textWidth, config.valor, false);
    const textHeight = codeLine.height + (value ? gap + valueLine.height : 0);
    const available = config.h - margin * 2 - gap - textHeight;
    const barcodeHeight = Math.max(2.5, Math.min(config.barras, available));
    drawBarcode(doc, code, x + sideMargin, y + margin, config.w - sideMargin * 2, barcodeHeight);
    const codeY = y + margin + barcodeHeight + gap + codeLine.height / 2;
    paint(code, codeLine, x + config.w / 2, codeY);
    if (value) paint(value, valueLine, x + config.w / 2, codeY + codeLine.height / 2 + gap + valueLine.height / 2);
  }

  namespace.modules.labelPdfRenderer = Object.freeze({ draw });
})(window);
