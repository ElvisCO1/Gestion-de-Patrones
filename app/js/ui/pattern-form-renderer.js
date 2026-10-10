/* Generador del formulario de edición de patrones. */
(function (global) {
  "use strict";

  function render(p, context) {
    const { getActividades, TIPOS_POR_ACTIVIDAD, escapeHTML, esPatronGrupo,
      unidadesDeGrupo, descripcionDisponibilidadGrupo, ACTIVIDADES_ISO } = context;    const act = getActividades(p);
    function bloqueActividad(clave, nombre){
      const a = act[clave];
      return `
        <div class="full" style="border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-top:6px;">
          <p style="font-weight:600; font-size:13px; margin:0 0 8px;">${nombre} (${clave})</p>
          <div class="grid2">
            <div>
              <label class="field-label">Frecuencia (meses)</label>
              <input type="number" class="ep-act-frecuencia" data-clave="${clave}" min="1" step="1" value="${escapeHTML(a.frecuenciaMeses ?? "")}">
            </div>
            <div>
              <label class="field-label">Mes de vencimiento</label>
              <input type="month" class="ep-act-mesvenc" data-clave="${clave}" value="${escapeHTML(a.mesVencimiento || "")}">
            </div>
            <div>
              <label class="field-label">Tipo (interna / externa)</label>
              <select class="ep-act-tipo" data-clave="${clave}">
                ${TIPOS_POR_ACTIVIDAD[clave].map(([v, txt]) =>
                  `<option value="${v}"${(a.tipoCalibracion || "") === v ? " selected" : ""}>${txt}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="field-label">Fecha real de ultima ejecucion (opcional)</label>
              <input type="date" class="ep-act-fecha" data-clave="${clave}" value="${escapeHTML(a.ultimaFechaEjecucion || "")}">
            </div>
            <div class="full">
              <label class="field-label">N.° de documento / informe (opcional)</label>
              <input type="text" class="ep-act-doc" data-clave="${clave}" value="${escapeHTML(a.ultimoDocumento || "")}" placeholder="Ej: IV26-0142">
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="grid2">
        <div><label class="field-label">Código único</label><input type="text" class="ep-codigo" value="${escapeHTML(p.codigo)}"></div>
        <div><label class="field-label">Laboratorio</label><input type="text" class="ep-area" value="${escapeHTML(p.area)}"></div>
        <div class="full"><label class="field-label">Equipos</label><input type="text" class="ep-categoria" value="${escapeHTML(p.categoria)}"></div>
        <div><label class="field-label">Marca (opcional)</label><input type="text" class="ep-marca" value="${escapeHTML(p.marca || "")}" placeholder="Ej: Mettler Toledo"></div>
        <div><label class="field-label">Valor nominal (opcional)</label><input type="text" class="ep-valor" value="${escapeHTML(p.valorNominal || "")}" placeholder="Ej: 500 g, 1 kg, 20 kg"></div>
        <div><label class="field-label">Modelo (opcional)</label><input type="text" class="ep-modelo" value="${escapeHTML(p.modelo || "")}" placeholder="Ej: SH-110"></div>
        <div><label class="field-label">Serie (opcional)</label><input type="text" class="ep-serie" value="${escapeHTML(p.serie || "")}" placeholder="Ej: 16928273"></div>
        <div>
          <label class="field-label">Lugar de uso</label>
          <select class="ep-lugar">
            <option value="Campo"${(p.lugarUso || "Campo")==="Campo"?" selected":""}>Campo</option>
            <option value="Laboratorio"${p.lugarUso==="Laboratorio"?" selected":""}>Laboratorio</option>
          </select>
        </div>
        <div>
          <label class="field-label">Estado</label>
          <select class="ep-estado">
            <option value="Disponible"${p.estado==="Disponible"?" selected":""}>Disponible</option>
            <option value="En servicio"${p.estado==="En servicio"?" selected":""}>En servicio</option>
            <option value="En mantenimiento"${p.estado==="En mantenimiento"?" selected":""}>En mantenimiento</option>
            <option value="De baja"${p.estado==="De baja"?" selected":""}>De baja</option>
            <option value="Extraviado"${p.estado==="Extraviado"?" selected":""}>Extraviado</option>
            <option value="No Cumple / Inoperativo"${p.estado==="No Cumple / Inoperativo"?" selected":""}>No Cumple / Inoperativo</option>
            <option value="Eliminado"${p.estado==="Eliminado"?" selected":""}>Eliminado</option>
          </select>
        </div>
        <div class="full" style="background:var(--surface-2); border:1px dashed var(--border-strong); border-radius:10px; padding:10px 12px;">
          <label style="font-weight:600;"><input type="checkbox" class="ep-es-grupo"${esPatronGrupo(p) ? " checked" : ""}> Es un grupo de piezas iguales</label>
          <div style="margin-top:8px; max-width:260px;">
            <label class="field-label">Número de piezas del grupo</label>
            <input type="number" class="ep-unidades" value="${escapeHTML(unidadesDeGrupo(p))}" min="1" max="9999" step="1">
          </div>
          ${esPatronGrupo(p) ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:8px;">Ahora mismo: ${escapeHTML(descripcionDisponibilidadGrupo(p))}.</div>` : ""}
        </div>
        <div class="full">
          <label class="field-label">Observacion (opcional)</label>
          <textarea class="ep-observacion" placeholder="Ej: revisar mordazas antes de próxima calibración">${escapeHTML(p.observacion || "")}</textarea>
        </div>
      </div>
      <p style="font-weight:600; font-size:14px; margin:14px 0 4px; color:var(--text-primary);">Actividades ISO 17025</p>
      ${ACTIVIDADES_ISO.map(({clave, nombre}) => bloqueActividad(clave, nombre)).join("")}
      <p class="msg-error ep-error" style="margin-top:10px;"></p>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-guardar-patron btn-primario btn-mini" data-codigo-original="${escapeHTML(p.codigo)}">Guardar cambios</button>
        <button class="btn-cancelar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}">Cancelar</button>
      </div>
    `;  }

  function open(context, code) {
    const { document, patterns, renderForm, saveEdition } = context;
    document.querySelectorAll('#lista-patrones2 .tec-edit-form.open').forEach((form) => {
      form.classList.remove('open');
      form.innerHTML = '';
    });
    const form = document.getElementById(`edit-patron-${encodeURIComponent(code)}`);
    const pattern = patterns.find((item) => item.codigo === code);
    if (!form || !pattern) return;
    form.innerHTML = renderForm(pattern);
    form.classList.add('open');
    form.querySelector('.btn-cancelar-patron').addEventListener('click', () => {
      form.classList.remove('open');
      form.innerHTML = '';
    });
    form.querySelector('.btn-guardar-patron').addEventListener('click', () => saveEdition(code, form));
    const groupCheck = form.querySelector('.ep-es-grupo');
    const unitsField = form.querySelector('.ep-unidades');
    const syncGroup = () => { unitsField.disabled = !groupCheck.checked; };
    groupCheck.addEventListener('change', syncGroup);
    syncGroup();
  }

  global.Metrologia.modules.patternFormRenderer = Object.freeze({ render, open });
})(window);
