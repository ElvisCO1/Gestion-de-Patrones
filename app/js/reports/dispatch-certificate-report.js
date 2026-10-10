/* Documento de acta de salida. Conserva los adaptadores visuales del sistema legado. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function downloadDispatchCertificate(dependencies, dispatchId) {
    const group = dependencies.groupDispatches(dependencies.history || [])
      .find(item => item.salidaId === dispatchId || item.id === dispatchId);
    if (!group) { alert('No se encontró la salida solicitada.'); return false; }
    const doc = dependencies.createPdf({ unit: 'mm', format: 'a4' });
    const marginX = 20;
    let y = dependencies.drawHeader(doc, marginX);
    // Toda pagina posterior usa exactamente el mismo encabezado. Centralizar
    // este salto evita que una continuacion quede como una hoja en blanco.
    const newPageWithHeader = () => {
      doc.addPage();
      return dependencies.drawHeader(doc, marginX);
    };
    const maxContentY = dependencies.maxContentY - 2;
    const ensureSpace = (height, limit = maxContentY) => {
      if (y + height > limit) y = newPageWithHeader();
    };
    const service = dependencies.serviceNumber(group.salidaId);
    const configuredFields = dependencies.documentConfig && dependencies.documentConfig.campos || {};
    const fieldDefinitions = [
      ['numeroOT', 'Número de OT', `${group.numeroOT || '-'}${service ? `   (servicio ${service})` : ''}`],
      ['empresa', 'Empresa', `${group.empresa || '-'}${group.clienteRuc ? `  (RUC ${group.clienteRuc})` : ''}`],
      ['sede', 'Sede', group.sede, true], ['direccion', 'Dirección', group.direccion, true],
      ['contacto', 'Contacto en sede', [group.contactoSede, group.telefonoSede].filter(Boolean).join(' · '), true],
      ['tecnico', 'Técnico responsable', group.tecnico], ['laptop', 'Laptop asignada', group.laptop],
      ['termohigrometro', 'Termohigrómetro asignado', group.termohigrometro], ['multimetro', 'Multímetro asignado', group.multimetro, true],
      ['fecha', 'Fecha de salida', dependencies.formatDate(group.fecha)],
      ['hora', 'Hora de salida', group.fechaHoraSalida ? new Date(group.fechaHoraSalida).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-']
    ];
    const fields = fieldDefinitions
      .filter(([key]) => configuredFields[key] ? configuredFields[key].visible !== false : true)
      .map(([key, defaultLabel, value, optional]) => [configuredFields[key] && configuredFields[key].etiqueta || defaultLabel, value, optional]);
    doc.setFontSize(11); doc.setFont(undefined, 'normal');
    fields.forEach(([label, value, optional]) => {
      const text = String(value || '').trim();
      if (!text && optional) return;
      const lines = doc.splitTextToSize(text || '-', 110);
      ensureSpace(Math.max(7, lines.length * 5 + 2));
      doc.setFont(undefined, 'bold'); doc.text(`${label}:`, marginX, y);
      doc.setFont(undefined, 'normal');
      lines.forEach((line, index) => doc.text(line, marginX + 60, y + index * 5));
      y += Math.max(7, lines.length * 5 + 2);
    });
    if (String(group.extra || '').trim()) {
      ensureSpace(6);
      doc.setFont(undefined, 'bold'); doc.text('Equipos adicionales:', marginX, y); y += 6;
      doc.setFont(undefined, 'normal');
      doc.splitTextToSize(group.extra, 170).forEach(line => { ensureSpace(6); doc.text(line, marginX, y); y += 6; });
    }
    y += 4; ensureSpace(20, maxContentY - 20);
    const tableConfig = dependencies.documentConfig && dependencies.documentConfig.tabla || {};
    const configuredColumns = tableConfig.columnas || {};
    const tableColumns = [
      { key: 'codigo', label: 'Código único', weight: 40, value: pattern => pattern.codigo },
      { key: 'cantidad', label: 'Cant.', weight: 10, value: pattern => String(pattern.cantidad || 1) },
      { key: 'laboratorio', label: 'Laboratorio', weight: 42, value: pattern => pattern.area },
      { key: 'equipos', label: 'Equipos', weight: 68, value: pattern => equipment(pattern) }
    ].filter(column => configuredColumns[column.key] ? configuredColumns[column.key].visible !== false : true);
    // La normalización de la configuración evita este caso, pero mantener una
    // columna garantiza que un PDF antiguo nunca quede sin tabla legible.
    if (!tableColumns.length) tableColumns.push({ key: 'codigo', label: 'Código único', weight: 40, value: pattern => pattern.codigo });
    const totalWeight = tableColumns.reduce((sum, column) => sum + column.weight, 0);
    const tableWidth = 190 - marginX;
    let currentX = marginX;
    tableColumns.forEach(column => {
      column.label = configuredColumns[column.key] && configuredColumns[column.key].etiqueta || column.label;
      column.width = tableWidth * column.weight / totalWeight;
      column.x = currentX;
      currentX += column.width;
    });
    // Zona fija del formato: separa las observaciones de la tabla y de firmas.
    // Es un bloque obligatorio del formato, incluso cuando no tenga texto.
    const observations = (group.observacionesDocumento || [])
      .map(observation => String(observation.texto || '').trim()).filter(Boolean);
    const observationsY = dependencies.observationsY || (dependencies.signaturesY - 44);
    // La tabla aprovecha toda la altura segura de la hoja. Si llega a la zona
    // normalmente reservada para observaciones, estas (con las firmas) pasan
    // completas a la siguiente pagina, en vez de desperdiciar ese espacio.
    const tableLimitY = maxContentY;
    const drawObservationGuides = (baseY) => {
      doc.setDrawColor(215);
      [8, 13, 18].forEach(offset => doc.line(marginX, baseY + offset, 190, baseY + offset));
      doc.setDrawColor(0);
    };
    const cell = (value, width) => {
      const text = String(value || '').trim() || '-'; const lines = doc.splitTextToSize(text, width);
      return lines.length <= 1 ? (lines[0] || '-') : (doc.splitTextToSize(text, Math.max(2, width - 2))[0] || '').replace(/[\s;,.\-]+$/, '') + '...';
    };
    function equipment(pattern) {
      const value = dependencies.valueForCertificate(pattern); const category = String(pattern.categoria || '').trim();
      return value ? `${category} - ${value}` : category;
    }
    const drawTableHeading = (continued = false) => {
      if (!continued && tableConfig.mostrarTitulo !== false) {
        doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text(tableConfig.titulo || 'Patrones que salen a servicio', marginX, y);
        y += 8;
      }
      doc.setFont(undefined, 'bold');
      doc.setFontSize(10);
      tableColumns.forEach(column => doc.text(cell(column.label, column.width), column.x, y));
      y += 5; doc.setDrawColor(210); doc.line(marginX, y, 190, y); y += 5; doc.setFont(undefined, 'normal');
    };
    drawTableHeading();
    const patterns = (group.patrones || []).filter(pattern => pattern.estadoMovimiento !== 'Anulado'); let total = 0;
    patterns.forEach(pattern => {
      if (y + 6 > tableLimitY) { y = newPageWithHeader(); drawTableHeading(true); }
      const quantity = pattern.cantidad || 1; total += quantity;
      tableColumns.forEach(column => doc.text(cell(column.value(pattern), column.width), column.x, y));
      y += 6;
    });
    if (total !== patterns.length) {
      if (y + 7 > tableLimitY) { y = newPageWithHeader(); drawTableHeading(true); }
      doc.setFont(undefined, 'bold'); doc.text(`Total de piezas que salen: ${total}`, marginX, y + 1); doc.setFont(undefined, 'normal');
    }
    // Observaciones y firmas forman el cierre del acta: siempre quedan juntas
    // en la ultima hoja, con el bloque de observaciones en su posicion fija.
    if (y > observationsY - 8) newPageWithHeader();
    y = observationsY;
    doc.setFont(undefined, 'bold');
    doc.text('Observaciones:', marginX, y);
    doc.setFont(undefined, 'normal');
    drawObservationGuides(y);

    if (observations.length) {
      const observationLines = [];
      observations.forEach((observation, index) => {
        observationLines.push(...doc.splitTextToSize(observation, 170));
        if (index < observations.length - 1) observationLines.push('');
      });
      // El formato dispone de tres lineas. El texto completo sigue guardado
      // en el historial; el acta usa solo el espacio controlado del formato.
      observationLines.slice(0, 3).forEach((line, index) => {
        const isLastVisible = index === 2 && observationLines.length > 3;
        doc.text(isLastVisible ? `${line}...` : line, marginX, y + 6 + index * 5);
      });
    } else {
      // Sin una nota vigente se inutiliza el campo para que no pueda añadirse
      // texto manual despues de emitir el acta.
      doc.setDrawColor(170);
      doc.line(marginX, y + 8, 190, y + 20);
      doc.setDrawColor(0);
    }
    dependencies.drawSignatures(doc, marginX, group);
    dependencies.drawFooter(doc, dependencies.footerFormat || { codigo: 'FO-LAB-6-5', version: '01' }, marginX);
    doc.save(dependencies.fileName(group));
    return true;
  }

  namespace.modules.dispatchCertificateReport = Object.freeze({ downloadDispatchCertificate });
})(window);
