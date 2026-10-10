/* Vista de Personal; sus acciones de escritura se conservan como adaptadores. */
(function (global) {
  "use strict";

  function render(context) {
    const { tecnicos, ROL_TECNICO, ROL_SUPERVISOR, rolPersona, laboratoriosDe,
      escapeHTML, casillasLaboratorios } = context;  const box = document.getElementById("lista-tecnicos");
  box.innerHTML = "";

  // Se pinta en dos bloques por rol, pero los data-idx siguen apuntando al
  // indice real en "tecnicos": los manejadores de abajo no cambian.
  const bloques = [
    { rol: ROL_TECNICO,    titulo: "Técnicos",                  vacio: "Todavía no hay técnicos registrados." },
    { rol: ROL_SUPERVISOR, titulo: "Encargados de laboratorio", vacio: "Todavía no hay encargados de laboratorio registrados." }
  ];

  bloques.forEach(({ rol, titulo, vacio }) => {
    const titulo_el = document.createElement("div");
    titulo_el.className = "personal-grupo";
    titulo_el.textContent = titulo;
    box.appendChild(titulo_el);

    const delRol = tecnicos.map((t, idx) => ({ t, idx })).filter(({ t }) => rolPersona(t) === rol);
    if (!delRol.length) {
      const p = document.createElement("p");
      p.className = "personal-vacio";
      p.textContent = vacio;
      box.appendChild(p);
      return;
    }

    delRol.forEach(({ t, idx }) => {
      const inactivo = t.activo === false;
      const supervisor = rol === ROL_SUPERVISOR;
      const labs = laboratoriosDe(t);
      const div = document.createElement("div");
      div.className = "tec-card";
      div.style.opacity = inactivo ? "0.6" : "1";

      const meta = supervisor
        ? `<div class="tec-meta">${labs.length
              ? "Laboratorios a su cargo: " + escapeHTML(labs.join(" · "))
              : "Sin laboratorios asignados: no saldrá en ninguna acta."}</div>`
        : `<div class="tec-meta">Laptop: ${escapeHTML(t.laptop || "-")} - Termohigrometro: ${escapeHTML(t.termohigrometro || "-")}</div>`
          + (t.multimetro ? `<div class="tec-extra">Multimetro: ${escapeHTML(t.multimetro)}</div>` : '')
          + (t.extra && t.extra.trim() ? `<div class="tec-extra">Equipos adicionales: ${escapeHTML(t.extra)}</div>` : '');

      // Se pintan los campos de los DOS roles y se oculta el que no toca:
      // asi cambiar el rol en el desplegable solo alterna visibilidad, sin
      // volver a pintar la tarjeta ni perder lo que ya estaba escrito.
      const oculto = (cond) => cond ? "" : ' style="display:none;"';
      const camposEdicion = `
        <div class="ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Código de laptop</label><input type="text" class="ed-laptop" value="${escapeHTML(t.laptop || "")}"></div>
        <div class="ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Código de termohigrómetro</label><input type="text" class="ed-termo" value="${escapeHTML(t.termohigrometro || "")}"></div>
        <div class="ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Codigo de multimetro</label><input type="text" class="ed-multimetro" value="${escapeHTML(t.multimetro || "")}"></div>
        <div class="full ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Equipos adicionales</label><textarea class="ed-extra">${escapeHTML(t.extra||"")}</textarea></div>
        <div class="full ed-solo-supervisor"${oculto(supervisor)}><label class="field-label">Laboratorios a su cargo</label>
          <div class="labs-check">${casillasLaboratorios("ed-lab", labs)}</div></div>`;

      div.innerHTML = `
        <div class="tec-header">
          <div>
            <div class="tec-nombre">${escapeHTML(t.nombre)} ${inactivo ? '<span class="badge serv">Inactivo</span>' : ''}</div>
            ${meta}
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn-editar-tec btn-mini" data-idx="${idx}">Editar</button>
            ${inactivo ? `<button class="btn-reactivar-tec btn-mini" data-idx="${idx}">Reactivar</button>` : ''}
            <button class="btn-eliminar-tec btn-mini" data-idx="${idx}">Eliminar</button>
          </div>
        </div>
        <div class="tec-edit-form" id="edit-tec-${idx}">
          <div class="grid2">
            <div><label class="field-label">Rol</label>
              <select class="ed-rol">
                <option value="tecnico"${supervisor ? "" : " selected"}>Técnico</option>
                <option value="supervisor"${supervisor ? " selected" : ""}>Encargado de laboratorio</option>
              </select>
            </div>
            <div><label class="field-label">Nombre completo</label><input type="text" class="ed-nombre" value="${escapeHTML(t.nombre)}"></div>
            ${camposEdicion}
          </div>
          <p class="msg-error ed-error"></p>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="btn-guardar-tec btn-primario btn-mini" data-idx="${idx}">Guardar cambios</button>
            <button class="btn-cancelar-tec btn-mini" data-idx="${idx}">Cancelar</button>
          </div>
        </div>
      `;
      box.appendChild(div);
    });
  });

    return box;
  }

  global.Metrologia.modules.personnelRenderer = Object.freeze({ render });
})(window);
