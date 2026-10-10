/* Render de la pestaña Inventario.
 * Las dependencias se inyectan para que este módulo no lea estado global. */
(function (global) {
  "use strict";

  function render(ctx) {
    const { document, patrones, escapeHTML, descripcionEstadoActividadTexto,
      ordenarAreas, idSeccion, areasColapsadas, patronesDeArea } = ctx;
    const contenido = document.getElementById("inventario-contenido");
    if (!contenido) return;
    contenido.innerHTML = "";

    const busqueda = (document.getElementById("buscar-inventario")?.value || "").toLowerCase();
    const activos = patrones.filter(patron => patron.estado !== "Eliminado");
    const filtrados = activos.filter(patron => !busqueda ||
      patron.codigo.toLowerCase().includes(busqueda) ||
      patron.categoria.toLowerCase().includes(busqueda) ||
      (patron.marca || "").toLowerCase().includes(busqueda));

    const aviso = document.getElementById("inventario-aviso-filtro");
    if (aviso) aviso.style.display = busqueda ? "block" : "none";
    const total = document.getElementById("inventario-total");
    if (total) total.textContent = busqueda
      ? `${filtrados.length} de ${activos.length} patrón(es) coinciden con la búsqueda`
      : `${activos.length} patrón(es) en ${ordenarAreas([...new Set(activos.map(p => p.area))]).length} laboratorio(s)`;

    const porArea = {};
    filtrados.forEach(patron => (porArea[patron.area] ||= []).push(patron));
    const areas = ordenarAreas(Object.keys(porArea));
    if (!areas.length) {
      contenido.innerHTML = '<p class="empty-msg">No hay patrones que coincidan con la búsqueda.</p>';
      return;
    }

    const indice = document.getElementById("inventario-indice");
    if (indice) {
      indice.innerHTML = "";
      areas.forEach(area => {
        const chip = document.createElement("button");
        chip.className = "btn-inv-ir btn-mini";
        chip.dataset.area = area;
        chip.textContent = `${area} (${porArea[area].length})`;
        indice.appendChild(chip);
      });
    }

    const plegadas = areasColapsadas();
    areas.forEach(area => {
      const lista = porArea[area].slice().sort((a, b) => a.codigo.localeCompare(b.codigo));
      const totalArea = patronesDeArea(area).length;
      const plegada = !busqueda && plegadas.includes(area);
      const grupo = document.createElement("div");
      grupo.style.marginBottom = "20px";
      grupo.id = idSeccion(area);

      const cabecera = document.createElement("div");
      cabecera.style.cssText = "display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin:0 0 8px;";
      const titulo = document.createElement("button");
      titulo.className = "btn-inv-plegar";
      titulo.dataset.area = area;
      titulo.title = plegada ? "Mostrar los patrones" : "Ocultar los patrones";
      titulo.style.cssText = "background:none; border:0; padding:0; cursor:pointer; text-align:left; font-weight:700; font-size:15px; color:var(--text-primary); font-family:inherit;";
      const cantidad = busqueda && lista.length !== totalArea
        ? `(${lista.length} de ${totalArea} patron${totalArea === 1 ? "" : "es"})`
        : `(${lista.length} patron${lista.length === 1 ? "" : "es"})`;
      titulo.innerHTML = `<span style="display:inline-block; width:14px; color:var(--text-secondary);">${plegada ? "▸" : "▾"}</span>` +
        `${escapeHTML(area)} <span style="font-weight:400; color:var(--text-secondary); font-size:13px;">${cantidad}</span>`;
      const pdf = document.createElement("button");
      pdf.className = "btn-inv-pdf btn-mini btn-primario";
      pdf.dataset.area = area;
      pdf.textContent = "Descargar PDF";
      pdf.title = `Inventario completo de ${area} (${totalArea} patrón(es))`;
      cabecera.append(titulo, pdf);
      grupo.appendChild(cabecera);

      const tabla = document.createElement("div");
      tabla.className = "inv-cuerpo";
      tabla.style.border = "1px solid var(--border)";
      tabla.style.borderRadius = "var(--radius)";
      if (plegada) tabla.style.display = "none";
      (plegada ? [] : lista).forEach(patron => {
        const info = descripcionEstadoActividadTexto(patron);
        const fila = document.createElement("div");
        fila.className = "patron-row";
        fila.style.cursor = "default";
        fila.innerHTML = `<div style="flex:1;"><div class="codigo">${escapeHTML(patron.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(patron.categoria)}</span></div><div class="categoria">${patron.marca ? escapeHTML(patron.marca) + " · " : ""}${escapeHTML(info.texto)}</div></div><span class="badge ${patron.estado === "Disponible" ? "disp" : "serv"}">${escapeHTML(patron.estado)}</span>`;
        tabla.appendChild(fila);
      });
      grupo.appendChild(tabla);
      contenido.appendChild(grupo);
    });
  }

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};
  namespace.modules.inventoryRenderer = Object.freeze({ render });
})(window);
