/* Vista de ficha del patron: identificacion, programa y trazabilidad. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function open(context, code) {
    const {
      document, patterns, getActivities, activitiesOfPattern, dispatchesOfPattern,
      servicesSinceLastCalibration, lastCalibrationOf, activities, activityState,
      calibrationTypeLabel, formatMonth, formatDate, escapeHTML, recordQuantity
    } = context;
    const pattern = patterns.find((item) => item.codigo === code);
    if (!pattern) return false;
    document.getElementById('ficha-codigo').textContent = code;

    const scheduled = getActivities(pattern);
    const completed = activitiesOfPattern(code);
    const dispatches = dispatchesOfPattern(code);
    const affected = servicesSinceLastCalibration(pattern);
    const lastCalibration = lastCalibrationOf(pattern);
    const nonconforming = ['No Cumple / Inoperativo', 'Extraviado'].includes(pattern.estado);
    const details = [
      ['Laboratorio', pattern.area], ['Equipos', pattern.categoria],
      ['Marca', pattern.marca || 'No indica'], ['Modelo', pattern.modelo || 'No indica'],
      ['Serie', pattern.serie || 'No indica'], ['Valor nominal', pattern.valorNominal || '-'],
      ['Lugar de uso', pattern.lugarUso || 'Campo'], ['Estado operativo', pattern.estado],
      ['Última calibración', lastCalibration ? formatDate(lastCalibration) : 'Sin registro'],
      ['Observación', pattern.observacion || 'Ninguna']
    ].map(([label, value]) => `<div><span style="color:var(--text-secondary);">${escapeHTML(label)}:</span> <b>${escapeHTML(value)}</b></div>`).join('');

    const program = activities.map(({ clave, nombre }) => {
      const activity = scheduled[clave];
      const state = activityState(activity);
      const badge = state === 'vencido' ? 'vencido' : state === 'por_vencer' ? 'porvencer' : 'disp';
      const stateText = state === 'vencido' ? 'VENCIDA' : state === 'por_vencer' ? 'Vence este mes'
        : state === 'vigente' ? 'Vigente' : 'Sin programar';
      return `<div class="patron-row" style="cursor:default;"><div style="flex:1;"><div class="codigo">${escapeHTML(nombre)} (${escapeHTML(clave)})${activity.tipoCalibracion ? ' · ' + escapeHTML(calibrationTypeLabel(activity.tipoCalibracion)) : ''}</div><div class="categoria">Frecuencia: ${activity.frecuenciaMeses ? escapeHTML(String(activity.frecuenciaMeses)) + ' meses' : 'no definida'} · Vence: ${activity.mesVencimiento ? escapeHTML(formatMonth(activity.mesVencimiento)) : '-'}</div></div><span class="badge ${badge}">${escapeHTML(stateText)}</span></div>`;
    }).join('');

    const completedRows = completed.length
      ? completed.map((activity) => `<div class="patron-row" style="cursor:default;"><div style="flex:1;"><div class="codigo">${escapeHTML(formatDate(activity.fechaEjecucion))} · ${escapeHTML(activity.nombreActividad || activity.clave)}${activity.tipo ? ' (' + escapeHTML(activity.tipo) + ')' : ''}</div><div class="categoria">Documento: ${escapeHTML(activity.documento || 'sin documento')} · Proximo vencimiento: ${escapeHTML(formatMonth(activity.mesVencimientoResultante))}</div></div></div>`).join('')
      : '<p class="empty-msg" style="padding:10px 14px;">Aún no hay actividades registradas desde la app. Las que vinieron del programa Excel figuran arriba como «última ejecución».</p>';
    const dispatchRows = dispatches.length
      ? dispatches.slice(0, 40).map((dispatch) => {
        const cancelled = dispatch.estadoMovimiento === 'Anulado';
        return `<div class="patron-row" style="cursor:default; ${cancelled ? 'opacity:.55;' : ''}"><div style="flex:1;"><div class="codigo" ${cancelled ? 'style="text-decoration:line-through;"' : ''}>OT ${escapeHTML(dispatch.numeroOT)} · ${escapeHTML(formatDate(dispatch.fecha))}${recordQuantity(dispatch) > 1 ? ` · ${recordQuantity(dispatch)} piezas` : ''}</div><div class="categoria">${escapeHTML(dispatch.empresa || '')} · ${escapeHTML(dispatch.tecnico || '')} · ${escapeHTML(dispatch.estadoMovimiento || 'En servicio')}${cancelled ? ' (nunca salió)' : ''}</div></div></div>`;
      }).join('')
      : '<p class="empty-msg" style="padding:10px 14px;">Este patrón no ha salido a ningún servicio.</p>';
    const notice = nonconforming
      ? `<div class="card" style="background:#fde8e8; border-color:#e5b4b4;"><p class="title" style="color:var(--text-danger);">Atención: patrón no conforme (${escapeHTML(pattern.estado)})</p><p style="font-size:13px; margin:0;">Según ISO 17025 (7.10) debes evaluar el impacto sobre los servicios en los que se usó desde su última calibración válida${lastCalibration ? ' (' + escapeHTML(formatDate(lastCalibration)) + ')' : ''}: <b>${affected.length} servicio(s)</b> listados abajo como potencialmente afectados.</p></div>`
      : '';

    document.getElementById('ficha-contenido').innerHTML = `
      ${notice}<div class="card"><p class="title">Identificación</p><div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:13px;">${details}</div></div>
      <p style="font-weight:700; font-size:14px; margin:0 0 6px;">Programa de actividades</p><div class="inicio-lista" style="margin-bottom:16px;">${program}</div>
      <p style="font-weight:700; font-size:14px; margin:0 0 6px;">Historial de actividades ejecutadas (${completed.length})</p><div class="inicio-lista" style="margin-bottom:16px;">${completedRows}</div>
      <p style="font-weight:700; font-size:14px; margin:0 0 6px;">Servicios en los que se usó (${dispatches.length}${affected.length && dispatches.length !== affected.length ? `, ${affected.length} desde la ultima calibracion` : ''})</p><div class="inicio-lista">${dispatchRows}</div>`;
    document.getElementById('modal-ficha').classList.add('open');
    return true;
  }

  namespace.modules.patternDetailRenderer = Object.freeze({ open });
})(window);
