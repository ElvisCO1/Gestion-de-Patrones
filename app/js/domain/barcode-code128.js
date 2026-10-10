/* Code 128 sin dependencias externas, para etiquetas PDF y vista previa. */
(function (global) {
  'use strict';
  const patterns = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];
  const START_B = 104, START_C = 105, STOP = 106;
  const MIN_MODULE_WIDTH_MM = 0.19, QUIET_ZONE_MODULES = 10;
  function isEncodable(text) {
    const value = String(text || '');
    return Boolean(value) && [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code <= 126;
    });
  }
  function encode(text) {
    const value = String(text || '');
    if (!isEncodable(value)) return null;
    const values = [];
    if (/^\d+$/.test(value) && value.length % 2 === 0) {
      values.push(START_C);
      for (let index = 0; index < value.length; index += 2) values.push(parseInt(value.substr(index, 2), 10));
    } else {
      values.push(START_B);
      for (let index = 0; index < value.length; index += 1) values.push(value.charCodeAt(index) - 32);
    }
    let checksum = values[0];
    for (let index = 1; index < values.length; index += 1) checksum += values[index] * index;
    values.push(checksum % 103, STOP);
    const modules = [];
    let total = 0;
    values.forEach((entry) => {
      const pattern = patterns[entry];
      for (let index = 0; index < pattern.length; index += 1) {
        const width = parseInt(pattern[index], 10);
        modules.push({ width, isBar: index % 2 === 0 });
        total += width;
      }
    });
    return { modules, totalModules: total };
  }
  function moduleWidth(text, availableWidthMm) {
    const barcode = encode(text);
    return barcode ? availableWidthMm / (barcode.totalModules + QUIET_ZONE_MODULES * 2) : null;
  }
  function drawPdf(doc, text, x, y, width, height) {
    const barcode = encode(text);
    if (!barcode) return false;
    const module = width / (barcode.totalModules + QUIET_ZONE_MODULES * 2);
    let cursor = x + module * QUIET_ZONE_MODULES;
    doc.setFillColor(0, 0, 0);
    barcode.modules.forEach((item) => { const barWidth = item.width * module; if (item.isBar) doc.rect(cursor, y, barWidth, height, 'F'); cursor += barWidth; });
    return true;
  }
  function svg(text, widthMm, heightMm) {
    const barcode = encode(text);
    if (!barcode) return '';
    const total = barcode.totalModules + QUIET_ZONE_MODULES * 2;
    let cursor = QUIET_ZONE_MODULES;
    let path = '';
    barcode.modules.forEach((item) => { if (item.isBar) path += `M${cursor} 0h${item.width}v100h-${item.width}z`; cursor += item.width; });
    return `<svg class="etiqueta-barras" viewBox="0 0 ${total} 100" preserveAspectRatio="none" style="width:${widthMm}mm;height:${heightMm}mm;display:block;" shape-rendering="crispEdges"><path d="${path}" fill="#000"/></svg>`;
  }
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};
  namespace.modules.barcodeCode128 = Object.freeze({ MIN_MODULE_WIDTH_MM, isEncodable, encode, moduleWidth, drawPdf, svg });
})(window);
