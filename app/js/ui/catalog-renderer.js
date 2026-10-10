/* Renderizador del Catálogo; edición y borrado se inyectan como adaptadores. */
(function (global) {
  "use strict";

  function render(context) {
    const { patrones, filtroAreaCatalogo, seleccionEtiquetas, escapeHTML,
      getActividades, ACTIVIDADES_ISO, estadoActividad, formatMesISO,
      coincideBusqueda, estadoCalibracion, conectarBotonesCatalogo } = context;  const lista2 = document.getElementById("lista-patrones2");
  lista2.innerHTML = "";
  const filtroEstadoActual = document.getElementById("filtro-estado").value;
  const filtroCalActual = document.getElementById("filtro-calibracion").value;
  const filtroTipoCal = document.getElementById("filtro-tipocal").value;
  const filtrados2 = patrones.filter(p => {
    if (filtroTipoCal !== "Todas") {
      const tipoCAL = getActividades(p).CAL.tipoCalibracion || "";
      if (tipoCAL !== filtroTipoCal) return false;
    }
    if (filtroAreaCatalogo && filtroAreaCatalogo !== "Todas" && p.area !== filtroAreaCatalogo) return false;
    const cat = document.getElementById("filtro-cat2").value;
    if (cat && cat !== "Todas" && p.categoria !== cat) return false;
    if (!coincideBusqueda(p, document.getElementById("buscar2").value)) return false;
    if (filtroEstadoActual && filtroEstadoActual !== "Todos" && p.estado !== filtroEstadoActual) return false;
    if (filtroCalActual && filtroCalActual !== "Todas" && estadoCalibracion(p) !== filtroCalActual) return false;
    return true;
  });

  filtrados2.forEach(p => {
    const wrap = document.createElement("div");
    wrap.style.borderBottom = "1px solid var(--border)";
    const row = document.createElement("div");
    row.className = "patron-row";
    row.style.cursor = "default";
    row.style.borderBottom = "none";

    const act = getActividades(p);
    const badgesActividades = ACTIVIDADES_ISO.map(({clave, nombre}) => {
      const a = act[clave];
      const est = estadoActividad(a);
      if (est === 'sin_programar') return "";
      const etiqueta = `${clave}${a.tipoCalibracion ? " " + a.tipoCalibracion : ""}: ${formatMesISO(a.mesVencimiento)}`;
      if (est === 'vencido') return `<span class="badge vencido" title="${escapeHTML(nombre)} vencida">${escapeHTML(etiqueta)}</span>`;
      if (est === 'por_vencer') return `<span class="badge porvencer" title="${escapeHTML(nombre)} vence este mes">${escapeHTML(etiqueta)}</span>`;
      return `<span class="badge disp" title="${escapeHTML(nombre)} vigente">${escapeHTML(etiqueta)}</span>`;
    }).join(" ");

    row.innerHTML = `
      <input type="checkbox" class="etiqueta-seleccionada" data-codigo="${escapeHTML(p.codigo)}" ${seleccionEtiquetas[p.codigo] ? "checked" : ""} title="Seleccionar para etiqueta">
      <div style="flex:1;"><div class="codigo">${escapeHTML(p.codigo)}</div><div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}</div>${p.valorNominal ? `<div class="valor-patron">Valor: ${escapeHTML(p.valorNominal)}</div>` : `<div class="valor-patron">Valor: no registrado</div>`}</div>
      <span class="badge ${p.estado==="Disponible"?"disp":"serv"}">${escapeHTML(p.estado)}</span>
      <span style="display:flex; gap:4px; flex-wrap:wrap;">${badgesActividades}</span>
      <button class="btn-calibrar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}">Registrar calibración</button>
      <button class="btn-ficha-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}" title="Hoja de vida: historial de calibraciones y salidas">Ficha</button>
      <button class="btn-duplicar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}" title="Crear otro patrón igual, solo cambiando el código">Duplicar</button>
      <button class="btn-editar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}">Editar</button>
      <button class="btn-eliminar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}">Eliminar</button>
    `;
    wrap.appendChild(row);

    // El formulario de edicion se crea VACIO y solo se rellena al pulsar
    // "Editar" (ver abrirFormularioEdicion). Antes se construia el formulario
    // completo de los ~700 patrones en cada render: 18 000 campos invisibles
    // que congelaban la interfaz ~0,4 s en cada clic.
    const editForm = document.createElement("div");
    editForm.className = "tec-edit-form";
    editForm.id = "edit-patron-"+encodeURIComponent(p.codigo);
    editForm.style.padding = "0 14px 14px";
    wrap.appendChild(editForm);
    lista2.appendChild(wrap);
  });

  conectarBotonesCatalogo(lista2);
}

  global.Metrologia.modules.catalogRenderer = Object.freeze({ render });
})(window);
