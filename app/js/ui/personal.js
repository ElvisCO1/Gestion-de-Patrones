// ============================================================
// 9.  RENDERIZADO DE TÉCNICOS
// ============================================================
// ------------------------------------------------------------
// Inventario de patrones agrupado por Area (= Laboratorio)
// ------------------------------------------------------------
function descripcionEstadoActividadTexto(patron){
  // Texto corto para mostrar en pantalla: si esta en servicio, si le
  // toca calibrarse pronto/ya vencio, o si esta todo al dia.
  if (patronBloqueadoPorCalibracion(patron)) {
    const detalle = actividadesVencidas(patron).map(a => a.nombre).join(", ");
    return { texto: `Bloqueado: ${detalle} vencida(s)`, clase: 'vencido' };
  }
  if (patron.estado === "En servicio") {
    return { texto: "En servicio (fuera del laboratorio)", clase: 'serv' };
  }
  const est = estadoCalibracion(patron);
  if (est === 'por_vencer') {
    const act = getActividades(patron);
    const cuales = ACTIVIDADES_ISO.filter(({clave}) => estadoActividad(act[clave]) === 'por_vencer').map(a => a.nombre).join(", ");
    return { texto: `Vence este mes: ${cuales}`, clase: 'porvencer' };
  }
  if (est === 'vigente') return { texto: "Vigente, sin actividades pendientes este mes", clase: 'disp' };
  if (patron.estado === "Disponible") return { texto: "Disponible en laboratorio", clase: 'disp' };
  return { texto: patron.estado, clase: 'serv' };
}

// ------------------------------------------------------------
// Laboratorios del inventario.
//
// El catalogo tiene mas areas que laboratorios: los cuatro con los que se
// trabaja van primero y con su nombre, y las demas areas siguen debajo en
// orden alfabetico para que ningun patron se quede fuera del inventario.
// La comparacion es sin tildes y sin mayusculas porque en las fichas
// conviven "Grandes Volumenes y Flujo" y "Grandes Volúmenes y Flujo".
// ------------------------------------------------------------
const LABORATORIOS_PRINCIPALES = ["Masa", "Temperatura", "Volumen", "Grandes Volumenes y Flujo"];

function claveArea(texto){
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const LABORATORIOS_CLAVES = LABORATORIOS_PRINCIPALES.map(claveArea);

function ordenarAreasInventario(areas){
  const principales = [];
  LABORATORIOS_CLAVES.forEach(clave => {
    areas.filter(a => claveArea(a) === clave)
         .sort((a,b) => a.localeCompare(b, "es"))
         .forEach(a => principales.push(a));
  });
  const resto = areas
    .filter(a => !LABORATORIOS_CLAVES.includes(claveArea(a)))
    .sort((a,b) => a.localeCompare(b, "es"));
  return principales.concat(resto);
}

// Secciones plegadas: se recuerda la eleccion para no volver a plegar lo
// mismo cada vez que se entra a la pestaña. Por defecto, todas abiertas.
const INV_PLEGADAS_KEY = "metrologia_inventario_plegadas";

function areasColapsadas(){
  try {
    const guardado = JSON.parse(localStorage.getItem(INV_PLEGADAS_KEY) || "[]");
    return Array.isArray(guardado) ? guardado : [];
  } catch(e){ return []; }
}

function alternarSeccionInventario(area){
  const actual = areasColapsadas();
  const nuevo = actual.includes(area) ? actual.filter(a => a !== area) : actual.concat([area]);
  try { localStorage.setItem(INV_PLEGADAS_KEY, JSON.stringify(nuevo)); } catch(e){}
  renderInventario();
}

function idSeccionInventario(area){
  // Un id valido a partir del nombre del area, para poder saltar a ella.
  return "sec-inv-" + claveArea(area).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Todos los patrones vivos de un area, sin que la busqueda los recorte:
// el PDF de un laboratorio es su inventario completo.
function patronesDeArea(area){
  return patrones
    .filter(p => p.estado !== "Eliminado" && claveArea(p.area) === claveArea(area))
    .sort((a,b) => a.codigo.localeCompare(b.codigo));
}

function renderInventario(){
  return window.MetrologiaUIInventario.renderizarInventario({
    document, patrones, escapeHTML, descripcionEstadoActividadTexto,
    ordenarAreas: ordenarAreasInventario, claveArea,
    idSeccion: idSeccionInventario, areasColapsadas
  });
}
// Casillas de laboratorio para los formularios de personal. Se ofrecen los
// laboratorios que existen en el catalogo mas los que ya tenga asignados la
// persona (por si un laboratorio se quedo sin patrones y desapareceria de
// la lista, borrandole el cargo sin querer al guardar).
function casillasLaboratorios(clase, asignados){
  const marcados = (asignados || []).filter(Boolean);
  const disponibles = getAreas();
  marcados.forEach(l => {
    if (!disponibles.some(a => claveArea(a) === claveArea(l))) disponibles.push(l);
  });
  if (!disponibles.length) {
    return '<span class="labs-vacio">Todavía no hay laboratorios en el catálogo de patrones.</span>';
  }
  return disponibles.sort((a, b) => a.localeCompare(b, "es")).map(a => {
    const activo = marcados.some(l => claveArea(l) === claveArea(a));
    return `<label><input type="checkbox" class="${clase}" value="${escapeHTML(a)}"${activo ? " checked" : ""}> ${escapeHTML(a)}</label>`;
  }).join("");
}

function renderTecnicos(){
  const box = document.getElementById("lista-tecnicos");
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
          + (t.extra && t.extra.trim() ? `<div class="tec-extra">Equipos adicionales: ${escapeHTML(t.extra)}</div>` : '');

      // Se pintan los campos de los DOS roles y se oculta el que no toca:
      // asi cambiar el rol en el desplegable solo alterna visibilidad, sin
      // volver a pintar la tarjeta ni perder lo que ya estaba escrito.
      const oculto = (cond) => cond ? "" : ' style="display:none;"';
      const camposEdicion = `
        <div class="ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Código de laptop</label><input type="text" class="ed-laptop" value="${escapeHTML(t.laptop || "")}"></div>
        <div class="ed-solo-tecnico"${oculto(!supervisor)}><label class="field-label">Código de termohigrómetro</label><input type="text" class="ed-termo" value="${escapeHTML(t.termohigrometro || "")}"></div>
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

  box.querySelectorAll(".btn-reactivar-tec").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      const tecnico = tecnicos[idx];
      if (!tecnico) return;
      tecnico.activo = true;
      await saveRecord(STORES.tecnicos, tecnico);
      await render();
    });
  });

  box.querySelectorAll(".btn-eliminar-tec").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      const tecnico = tecnicos[idx];
      if (!tecnico) return;
      const cargo = nombreRol(rolPersona(tecnico)).toLowerCase();
      // Un encargado de laboratorio no aparece como tecnico de ninguna OT,
      // pero si queda nombrado en el acta: eso tambien es historial.
      const tieneHistorial = historial.some(h =>
        h.tecnico === tecnico.nombre || listaEncargados(h.encargadoLaboratorio).includes(tecnico.nombre));

      if (!tieneHistorial) {
        const ok = await confirmar({
          titulo: "Eliminar del personal",
          mensaje: `Se eliminará definitivamente a ${tecnico.nombre} (${cargo}).\n\nNo tiene historial asociado.`,
          textoOk: "Eliminar", peligro: true
        });
        if (ok) {
          const copia = { ...tecnico };
          await deleteRecord(STORES.tecnicos, tecnico.nombre);
          await render();
          avisar(`${copia.nombre} eliminado del personal.`, "ok", {
            etiqueta: "Deshacer",
            ejecutar: async () => { await saveRecord(STORES.tecnicos, copia); await render(); }
          });
        }
        return;
      }

      // Igual que con los patrones: cada opcion es ahora un boton con su
      // propio nombre, en vez de esconder "borrar todo" detras de "Cancelar".
      //
      // A un encargado de laboratorio NO se le ofrece el borrado total: las
      // OT donde figura no son suyas, son del tecnico que hizo el servicio,
      // y borrarlas por quitar a un encargado destruiria el historial de
      // otra persona. Para el solo cabe desactivarlo.
      const supervisorConHistorial = esSupervisor(tecnico);
      const respuesta = await confirmar({
        titulo: supervisorConHistorial ? "El encargado figura en actas" : "El técnico tiene historial",
        mensaje: supervisorConHistorial
          ? `${tecnico.nombre} figura como encargado de laboratorio en actas ya emitidas.\n\n` +
            `Se marcará como "Inactivo": deja de asignarse a nuevas salidas, pero las actas ` +
            `antiguas siguen nombrándolo, que es lo que pide la trazabilidad.`
          : `${tecnico.nombre} aparece en registros del historial.\n\n` +
            `Lo recomendable es marcarlo como "Inactivo": deja de aparecer al crear nuevas OT ` +
            `pero su historial se conserva.`,
        textoOk: "Marcar como Inactivo",
        textoAlterno: supervisorConHistorial ? "" : "Borrar todo (técnico + historial)",
        peligroAlterno: true
      });

      if (respuesta === "ok") {
        await saveRecord(STORES.tecnicos, { ...tecnico, activo: false });
        await render();
        avisar(`${tecnico.nombre} marcado como Inactivo. Su historial se conserva.`, "ok");
      } else if (respuesta === "alterno" && !supervisorConHistorial) {
        abrirModalEliminarTecnicoTotal(tecnico.nombre);
      }
    });
  });

  box.querySelectorAll(".btn-editar-tec").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = e.target.getAttribute("data-idx");
      document.querySelectorAll(".tec-edit-form").forEach(f => f.classList.remove("open"));
      document.getElementById("edit-tec-"+idx).classList.add("open");
    });
  });
  box.querySelectorAll(".btn-cancelar-tec").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idx = e.target.getAttribute("data-idx");
      document.getElementById("edit-tec-"+idx).classList.remove("open");
    });
  });
  // Cambiar el rol dentro de la tarjeta alterna que campos se ven.
  box.querySelectorAll(".ed-rol").forEach(sel => {
    sel.addEventListener("change", (e) => {
      const form = e.target.closest(".tec-edit-form");
      const sup = e.target.value === ROL_SUPERVISOR;
      form.querySelectorAll(".ed-solo-tecnico").forEach(d => { d.style.display = sup ? "none" : ""; });
      form.querySelectorAll(".ed-solo-supervisor").forEach(d => { d.style.display = sup ? "" : "none"; });
    });
  });
  box.querySelectorAll(".btn-guardar-tec").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const idx = parseInt(e.target.getAttribute("data-idx"), 10);
      const form = document.getElementById("edit-tec-"+idx);
      const nombre = normalizarNombre(form.querySelector(".ed-nombre").value);
      const rol = form.querySelector(".ed-rol").value === ROL_SUPERVISOR ? ROL_SUPERVISOR : ROL_TECNICO;
      const laptop = form.querySelector(".ed-laptop").value.trim();
      const termo = form.querySelector(".ed-termo").value.trim();
      const extra = form.querySelector(".ed-extra").value.trim();
      const labs = [...form.querySelectorAll(".ed-lab:checked")].map(c => c.value);
      const errBox = form.querySelector(".ed-error");
      errBox.style.display = "none";

      if (!nombre) { errBox.textContent = "El nombre no puede estar vacío."; errBox.style.display="block"; return; }
      const duplicado = tecnicos.some((t,i) => i!==idx && t.nombre.toLowerCase()===nombre.toLowerCase());
      if (duplicado) { errBox.textContent = "Ya existe alguien con ese nombre en el personal."; errBox.style.display="block"; return; }

      const nombreAnterior = tecnicos[idx].nombre;
      const activoAnterior = tecnicos[idx].activo !== false;
      // Cada rol guarda solo lo suyo: un encargado no arrastra maletin y un
      // tecnico no arrastra laboratorios a su cargo.
      tecnicos[idx] = rol === ROL_SUPERVISOR
        ? { nombre, rol, laboratorios: labs, activo: activoAnterior }
        : { nombre, rol, laptop, termohigrometro: termo, extra, activo: activoAnterior };

      // Renombrar es borrar la clave vieja + escribir la nueva: una sola
      // transaccion atomica para no perder a la persona si algo falla en medio.
      // Si cambia el nombre, el historial conserva el nombre con el que se
      // hizo cada servicio (trazabilidad), pero las filas ACTIVAS (patrones
      // aun fuera) se actualizan para que "Marcar devuelto" y la eliminacion
      // del tecnico las sigan encontrando. Lo mismo para el encargado de
      // laboratorio anotado en la OT.
      const opsTec = [];
      if (nombre !== nombreAnterior) {
        opsTec.push({ store: STORES.tecnicos, action: 'delete', key: nombreAnterior });
        const tocadas = new Map();
        historial
          .filter(h => h.tecnico === nombreAnterior && !movimientoCerrado(h))
          .forEach(h => tocadas.set(h.id, { ...h, tecnico: nombre }));
        historial
          .filter(h => !movimientoCerrado(h) && listaEncargados(h.encargadoLaboratorio).includes(nombreAnterior))
          .forEach(h => {
            const base = tocadas.get(h.id) || { ...h };
            tocadas.set(h.id, { ...base, encargadoLaboratorio: listaEncargados(h.encargadoLaboratorio)
              .map(n => n === nombreAnterior ? nombre : n).join(SEP_ENCARGADOS) });
          });
        tocadas.forEach(item => opsTec.push({ store: STORES.historial, action: 'put', item }));
      }
      opsTec.push({ store: STORES.tecnicos, action: 'put', item: tecnicos[idx] });
      await runAtomicTransaction([STORES.tecnicos, STORES.historial], opsTec);

      const selTec = document.getElementById("in-tecnico");
      if (selTec.value === nombreAnterior) {
        selTec.value = nombre;
      }
      await render();
    });
  });

  // Las casillas del formulario de alta se repintan aqui para que recojan
  // los laboratorios que existan ahora en el catalogo, conservando lo que
  // el usuario ya hubiera marcado.
  const cajaAlta = document.getElementById("nt-laboratorios");
  if (cajaAlta) {
    const marcados = [...cajaAlta.querySelectorAll(".nt-lab:checked")].map(c => c.value);
    cajaAlta.innerHTML = casillasLaboratorios("nt-lab", marcados);
  }
}

// ============================================================
// 10. FUNCIONES DE POBLADO DE SELECTS
// ============================================================
function poblarSelectsEstaticos(){
  const tecSel = document.getElementById("in-tecnico");
  const current = tecSel.value;
  tecSel.innerHTML = '<option value="">Selecciona un tecnico</option>';
  // Solo tecnicos: los encargados de laboratorio no salen a servicio, su
  // nombre llega al acta por el laboratorio de los patrones.
  tecnicosActivos().forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.nombre; opt.textContent = t.nombre;
    tecSel.appendChild(opt);
  });
  if (tecnicos.some(t => t.nombre === current)) tecSel.value = current;

  const npArea = document.getElementById("np-area");
  npArea.innerHTML = "";
  getAreas().forEach(a => {
    const opt = document.createElement("option");
    opt.value = a; opt.textContent = a;
    npArea.appendChild(opt);
  });
}

function poblarFiltrosCategoria(){
  const cats = getCategorias(filtroAreaSalida);
  const sel = document.getElementById("filtro-cat");
  const valActual = sel.value;
  sel.innerHTML = '<option value="Todas">Todos los equipos</option>';
  cats.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
  if (cats.includes(valActual)) sel.value = valActual; else filtroCategoria = "Todas";

  const cats2 = getCategorias(filtroAreaCatalogo);
  const sel2 = document.getElementById("filtro-cat2");
  const valActual2 = sel2.value;
  sel2.innerHTML = '<option value="Todas">Todos los equipos</option>';
  cats2.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c; opt.textContent = c;
    sel2.appendChild(opt);
  });
  if (cats2.includes(valActual2)) sel2.value = valActual2; else filtroCategoria2 = "Todas";
}

// ============================================================
