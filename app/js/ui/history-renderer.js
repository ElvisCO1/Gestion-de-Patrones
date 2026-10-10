/* Renderizador de Historial; sus transiciones operativas quedan inyectadas. */
(function (global) {
  "use strict";

  function render(context) {
    const { historial, busquedaHistorial, escapeHTML, agruparPorOT, sortHistoryGroups,
      etiquetaCantidad, observacionHTML, numeroDeServicio, formatFecha, pagination,
      historyPage, changeHistoryPage, syncHistoryPage } = context;  const histBox = document.getElementById("historial-lista");
  const histVacio = document.getElementById("historial-vacio");
  histBox.innerHTML = "";

  let filtrados = historial;
  const q = busquedaHistorial.trim().toLowerCase();
  if (q !== "") {
    filtrados = historial.filter(h => {
      const campos = [h.numeroOT, h.empresa, h.tecnico, h.codigo, h.categoria,
                      h.sede, h.direccion, h.contactoSede];
      if (campos.some(v => String(v || "").toLowerCase().includes(q))) return true;
      // Buscar tambien dentro de las observaciones: si anotaste "se marco
      // devuelto por error", poder encontrarlo despues es justamente el punto.
      return (Array.isArray(h.observaciones) ? h.observaciones : [])
        .some(o => String(o.texto || "").toLowerCase().includes(q));
    });
  }

  if (filtrados.length === 0) {
    histVacio.style.display = "block";
    histVacio.textContent = q ? "No hay resultados para esa búsqueda." : "Aún no hay salidas registradas.";
    return;
  }
  histVacio.style.display = "none";

  // Orden predeterminado: la ultima actividad registrada de cada servicio.
  const grupos = sortHistoryGroups(agruparPorOT(filtrados));
  const pageInfo = pagination.paginate(grupos, historyPage, 20);
  if (pageInfo.page !== historyPage) syncHistoryPage(pageInfo.page);
  const renderPager = () => {
    const pager = document.createElement("div");
    pager.className = "historial-paginacion";
    const label = document.createElement("span");
    label.textContent = `Mostrando ${pageInfo.start + 1}–${pageInfo.end} de ${pageInfo.total} ${q ? "resultados" : "servicios"}`;
    pager.appendChild(label);
    if (pageInfo.pages > 1) {
      const controls = document.createElement("div");
      controls.className = "historial-paginacion-controles";
      const previous = document.createElement("button");
      previous.className = "btn-mini"; previous.textContent = "Anterior"; previous.disabled = pageInfo.page === 1;
      previous.addEventListener("click", () => changeHistoryPage(pageInfo.page - 1));
      const pageNumbers = [1, pageInfo.page - 1, pageInfo.page, pageInfo.page + 1, pageInfo.pages]
        .filter(page => page >= 1 && page <= pageInfo.pages).filter((page, index, all) => all.indexOf(page) === index)
        .sort((left, right) => left - right);
      const next = document.createElement("button");
      next.className = "btn-mini"; next.textContent = "Siguiente"; next.disabled = pageInfo.page === pageInfo.pages;
      next.addEventListener("click", () => changeHistoryPage(pageInfo.page + 1));
      controls.appendChild(previous);
      let lastPage = 0;
      pageNumbers.forEach(page => {
        if (page - lastPage > 1) {
          const omission = document.createElement("span");
          omission.textContent = "…";
          controls.appendChild(omission);
        }
        const button = document.createElement("button");
        button.className = `btn-mini historial-pagina${page === pageInfo.page ? " activa" : ""}`;
        button.textContent = page;
        button.disabled = page === pageInfo.page;
        button.addEventListener("click", () => changeHistoryPage(page));
        controls.appendChild(button);
        lastPage = page;
      });
      controls.appendChild(next);
      pager.appendChild(controls);
    }
    histBox.appendChild(pager);
  };
  renderPager();
  pageInfo.items.forEach(grupo => {
    const div = document.createElement("div");
    div.className = "ot-group";
    let patronesHtml = "";
    grupo.patrones.forEach(p => {
      // Un patron anulado entro en la OT por error: se muestra tachado, sin
      // acciones de devolucion (nunca salio) pero con su motivo a la vista.
      if (p.estadoMovimiento === "Anulado") {
        const obsAnulado = (p.observaciones || []).filter(o => o.alcance !== "OT");
        patronesHtml += `
          <div class="patron-line anulada" style="flex-direction:column; align-items:stretch;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
              <span><span class="codigo-patron">${escapeHTML(p.codigo)}</span>${etiquetaCantidad(p)}
                <span style="color:var(--text-secondary);">(${p.area?escapeHTML(p.area)+" - ":""}${escapeHTML(p.categoria)})</span>
                <span class="badge anulado">Anulado</span></span>
              <span style="color:var(--text-muted); font-size:12px; max-width:60%; text-align:right;">
                ${escapeHTML(p.motivoAnulacion || "Retirado de la OT en una corrección")}</span>
            </div>
            ${obsAnulado.length ? `<div class="obs-bloque">${obsAnulado.map(observacionHTML).join("")}</div>` : ""}
          </div>`;
        return;
      }

      const yaDevuelto = p.estadoMovimiento === "Devuelto" || p.estadoMovimiento === "Enviado a otro servicio";
      const infoDevolucion = yaDevuelto && p.fechaHoraDevolucion
        ? ` · el ${new Date(p.fechaHoraDevolucion).toLocaleString("es-PE", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"})}`
        : "";

      // Boton de observacion SIEMPRE disponible: el registro nunca se
      // bloquea para anotaciones, este el patron fuera o ya devuelto.
      const btnObs = `<button data-id="${escapeHTML(p.id)}" class="btn-obs-mini btn-mini" title="Añadir una observación a este patrón en esta OT">Observación</button>`;

      const botones = yaDevuelto
        ? `<span class="linea-acciones">
            <span style="color:var(--text-muted); font-size:12px;">${escapeHTML(p.estadoMovimiento)}${infoDevolucion}</span>
            <button data-id="${escapeHTML(p.id)}" class="btn-corregir-mini btn-mini" title="El patrón sigue fuera: reabrir el movimiento dejando constancia del error">Corregir devolución</button>
            ${btnObs}
          </span>`
        : `<span class="linea-acciones">
            <button data-id="${escapeHTML(p.id)}" class="btn-otro-servicio-mini btn-mini">Enviar a otro servicio</button>
            <button data-id="${escapeHTML(p.id)}" class="btn-devuelto-mini btn-mini">Marcar devuelto</button>
            ${btnObs}
          </span>`;

      const obsPatron = (p.observaciones || []).filter(o => o.alcance !== "OT");
      const obsHtml = obsPatron.length
        ? `<div class="obs-bloque">${obsPatron
              .slice()
              .sort((a,b) => String(a.fechaHora||"") < String(b.fechaHora||"") ? -1 : 1)
              .map(observacionHTML).join("")}</div>`
        : "";

      const badgeCorregido = (p.devolucionesAnuladas || []).length
        ? ` <span class="badge corregido" title="Esta devolución fue corregida ${p.devolucionesAnuladas.length} vez(ces)">Devolución corregida</span>`
        : "";

      patronesHtml += `
        <div class="patron-line" style="flex-direction:column; align-items:stretch;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <span>${escapeHTML(p.codigo)}${etiquetaCantidad(p)} <span style="color:var(--text-secondary);">(${p.area?escapeHTML(p.area)+" - ":""}${escapeHTML(p.categoria)})</span> <span style="color:var(--text-muted);">· ${escapeHTML(p.tipoMovimiento||"Salida")} · ${escapeHTML(p.estadoMovimiento||"En servicio")}</span>${badgeCorregido}</span>
            ${botones}
          </div>
          ${obsHtml}
        </div>
      `;
    });

    // Linea de sede/direccion: solo aparece en las OT que la tienen,
    // para no ensuciar las salidas antiguas que no la registraron.
    const lineaSede = (grupo.sede || grupo.direccion)
      ? `<div class="ot-meta">${escapeHTML([grupo.sede, grupo.direccion].filter(Boolean).join(" — "))}</div>`
      : "";
    const lineaContacto = (grupo.contactoSede || grupo.telefonoSede)
      ? `<div class="ot-meta2">Contacto: ${escapeHTML([grupo.contactoSede, grupo.telefonoSede].filter(Boolean).join(" · "))}</div>`
      : "";

    const obsInternasHtml = grupo.observacionesOT.length
      ? `<div class="obs-bloque"><div class="obs-category">Notas internas</div>${grupo.observacionesOT.map(observacionHTML).join("")}</div>`
      : "";
    const obsDocumentoHtml = (grupo.observacionesDocumento || []).length
      ? `<div class="obs-bloque"><div class="obs-category">Notas para PDF</div>${grupo.observacionesDocumento.map(observacion => `${observacionHTML(observacion)}<span class="linea-acciones"><button class="btn-editar-obs-documento btn-mini" data-salida="${escapeHTML(grupo.salidaId)}" data-obs-id="${escapeHTML(observacion.id)}">Editar</button><button class="btn-retirar-obs-documento btn-mini" data-salida="${escapeHTML(grupo.salidaId)}" data-obs-id="${escapeHTML(observacion.id)}">Quitar del PDF</button></span>`).join("")}</div>`
      : "";
    const auditoriaPdfHtml = (grupo.auditoriaObservacionesPDF || []).length
      ? `<details class="obs-bloque obs-auditoria"><summary>Historial de ediciones y retiros PDF (${grupo.auditoriaObservacionesPDF.length})</summary>${grupo.auditoriaObservacionesPDF.map(observacion => `<div class="obs-category">${observacion.estado === "retirada" ? "Retirada del PDF" : "Version anterior"}</div>${observacionHTML(observacion)}`).join("")}</details>`
      : "";
    const obsOtHtml = obsInternasHtml + obsDocumentoHtml + auditoriaPdfHtml;

    div.innerHTML = `
      <div class="ot-header">
        <div>
          <div class="ot-title">OT ${escapeHTML(grupo.numeroOT)}${
            // Si la orden ha tenido varios servicios, se dice cual es este:
            // sin esto dos tarjetas de la misma OT y el mismo dia serian
            // indistinguibles a simple vista.
            (() => { const n = numeroDeServicio(grupo.salidaId);
                     return n ? ` <span class="badge serv">Servicio ${n}</span>` : ""; })()
          }</div>
          <div class="ot-meta">${formatFecha(grupo.fecha)} - ${escapeHTML(grupo.empresa)} - ${escapeHTML(grupo.tecnico)}</div>
          ${lineaSede}
          ${lineaContacto}
          <div class="ot-meta2">Laptop ${escapeHTML(grupo.laptop)} - Termohigrometro ${escapeHTML(grupo.termohigrometro)} - ${
            // Los anulados se retiraron de la orden y no salieron: se siguen
            // mostrando tachados mas abajo, pero NO cuentan como patrones
            // que fueron al servicio.
            grupo.patrones.filter(p => p.estadoMovimiento !== "Anulado").length
          } patron(es)</div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-editar-ot btn-mini" data-salida="${escapeHTML(grupo.salidaId)}" title="Corregir empresa, sede, técnico, fecha o los patrones de este servicio">Corregir OT</button>
          <button class="btn-obs-ot btn-mini" data-salida="${escapeHTML(grupo.salidaId)}" title="Observación que aplica a todo este servicio">Observación de la OT</button>
          <button class="btn-obs-documento btn-mini" data-salida="${escapeHTML(grupo.salidaId)}" title="Observacion que aparecera en el PDF">Obs. PDF</button>
          <button class="btn-descargar btn-primario" data-salida="${escapeHTML(grupo.salidaId)}">Descargar PDF</button>
          <button class="btn-eliminar-ot btn-mini" data-salida="${escapeHTML(grupo.salidaId)}">Eliminar OT</button>
        </div>
      </div>
      ${obsOtHtml}
      ${patronesHtml}
    `;
    histBox.appendChild(div);
  });
  if (pageInfo.pages > 1) renderPager();

    return histBox;
  }

  global.Metrologia.modules.historyRenderer = Object.freeze({ render });
})(window);
