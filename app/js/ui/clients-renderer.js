/* Renderizador de Clientes; las operaciones de escritura se inyectan aparte. */
(function (global) {
  "use strict";

  function render({ clients, history, search, orderedClients, normalizeName, escapeHTML, bindButtons }) {
    const container = document.getElementById("lista-clientes");
    const empty = document.getElementById("clientes-vacio");
    if (!container) return;
    container.innerHTML = "";
    const query = String(search || "").trim().toLowerCase();
    const filtered = orderedClients().filter(client => {
      if (!query) return true;
      const inSites = (client.sedes || []).some(site => [site.nombre, site.direccion, site.contacto]
        .some(value => String(value || "").toLowerCase().includes(query)));
      return [client.nombre, client.ruc].some(value => String(value || "").toLowerCase().includes(query)) || inSites;
    });
    if (!filtered.length) {
      empty.style.display = "block";
      empty.textContent = query ? "No hay empresas que coincidan con esa búsqueda." : "Aún no hay empresas registradas. Añade la primera con el formulario de arriba.";
      return;
    }
    empty.style.display = "none";
    filtered.forEach(client => {
      const sites = Array.isArray(client.sedes) ? client.sedes : [];
      const dispatches = (history || []).filter(item => item.clienteId === client.id || normalizeName(item.empresa).toLowerCase() === normalizeName(client.nombre).toLowerCase()).length;
      const sitesHtml = sites.length ? sites.map(site => `
        <div class="sede-line"><div><div class="sede-nombre">${escapeHTML(site.nombre)}</div><div class="sede-dir">${escapeHTML(site.direccion || "Sin dirección registrada")}</div>${(site.contacto || site.telefono) ? `<div class="sede-contacto">${escapeHTML([site.contacto, site.telefono].filter(Boolean).join(" · "))}</div>` : ""}</div><button class="btn-mini btn-eliminar-sede" data-cliente="${escapeHTML(client.id)}" data-sede="${escapeHTML(site.id)}">Quitar sede</button></div>`).join("") : `<div class="sede-line"><span class="obs-vacio">Sin sedes registradas. Añade una para poder usarla en las salidas.</span></div>`;
      const card = document.createElement("div");
      card.className = "cliente-card";
      card.innerHTML = `
        <div class="cliente-header"><div><div class="cliente-nombre">${escapeHTML(client.nombre)}</div><div class="cliente-meta">${client.ruc ? "RUC " + escapeHTML(client.ruc) + " · " : ""}${sites.length} sede(s) · ${dispatches} salida(s) registradas</div></div><div style="display:flex; gap:6px; flex-wrap:wrap;"><button class="btn-mini btn-nueva-sede" data-cliente="${escapeHTML(client.id)}">Añadir sede</button><button class="btn-mini btn-editar-cliente" data-cliente="${escapeHTML(client.id)}">Editar</button><button class="btn-mini btn-eliminar-cliente" data-cliente="${escapeHTML(client.id)}">Eliminar</button></div></div>
        ${sitesHtml}
        <div class="sede-nueva-form" id="form-sede-${escapeHTML(client.id)}"><div class="grid2"><div><label class="field-label">Nombre de la sede</label><input type="text" class="fs-nombre" placeholder="Ej: Planta Norte"></div><div><label class="field-label">Teléfono (opcional)</label><input type="text" class="fs-telefono" placeholder="Ej: 987 654 321"></div><div class="full"><label class="field-label">Dirección</label><input type="text" class="fs-direccion" placeholder="Ej: Jr. Los Talleres 145, Callao"></div><div class="full"><label class="field-label">Contacto (opcional)</label><input type="text" class="fs-contacto" placeholder="Ej: Sr. Juan Pérez"></div></div><p class="msg-error fs-error"></p><div style="display:flex; gap:8px; margin-top:10px;"><button class="btn-primario btn-mini btn-guardar-sede" data-cliente="${escapeHTML(client.id)}">Guardar sede</button><button class="btn-mini btn-cancelar-sede" data-cliente="${escapeHTML(client.id)}">Cancelar</button></div></div>
        <div class="cliente-edit-form" id="form-cliente-${escapeHTML(client.id)}"><div class="grid2"><div class="full"><label class="field-label">Razón social / nombre</label><input type="text" class="fc-nombre" value="${escapeHTML(client.nombre)}"></div><div class="full"><label class="field-label">RUC (opcional)</label><input type="text" class="fc-ruc" value="${escapeHTML(client.ruc || "")}"></div></div><p class="msg-error fc-error"></p><div style="display:flex; gap:8px; margin-top:10px;"><button class="btn-primario btn-mini btn-guardar-cliente" data-cliente="${escapeHTML(client.id)}">Guardar cambios</button><button class="btn-mini btn-cancelar-cliente" data-cliente="${escapeHTML(client.id)}">Cancelar</button></div></div>`;
      container.appendChild(card);
    });
    bindButtons(container);
  }

  global.Metrologia.modules.clientsRenderer = Object.freeze({ render });
})(window);
