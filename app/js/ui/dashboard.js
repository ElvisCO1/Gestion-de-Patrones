// 6.  RENDERIZADO PRINCIPAL
// ============================================================
async function render() {
  patrones = await getAll(STORES.patrones);
  tecnicos = await getAll(STORES.tecnicos);
  historial = await getAll(STORES.historial);
  actividadesEjecutadas = await getAll(STORES.actividades);
  clientes = await getAll(STORES.clientes);
  // Mas reciente arriba, por fecha Y hora: antes solo se comparaba el dia y
  // las salidas de una misma jornada salian en el orden en que IndexedDB las
  // devolvia, que es arbitrario.
  historial.sort((a, b) => {
    const ka = claveCronologica(a), kb = claveCronologica(b);
    if (ka !== kb) return ka < kb ? 1 : -1;
    // Mismo instante (las filas de una misma OT): el codigo las deja estables.
    return String(a.codigo || "").localeCompare(String(b.codigo || ""), "es", { numeric: true });
  });

  document.getElementById("hist-count").textContent = historial.length;
  const selCount = Object.values(seleccionados).filter(Boolean).length;
  document.getElementById("sel-count").textContent = selCount;
  document.getElementById("btn-limpiar").style.display = selCount>0 ? "inline-block" : "none";
  renderResumenSeleccion();

  poblarSelectsEstaticos();
  mostrarInfoTecnico();
  poblarSelectClientes();
  renderAreaTags();
  poblarFiltrosCategoria();

  // Lista de patrones para selección. Los estados "muertos" (eliminados,
  // de baja, extraviados, inoperativos) no se muestran aqui: nunca pueden
  // salir a servicio y solo agregan ruido a la lista.
  const lista = document.getElementById("lista-patrones");
  lista.innerHTML = "";
  const filtrados = patronesFiltrados(filtroAreaSalida, filtroCategoria, busqueda, false)
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado));
  filtrados.forEach(p => {
    const checked = !!seleccionados[p.codigo];
    const vencido = patronBloqueadoPorCalibracion(p);
    const grupo = esPatronGrupo(p);
    const sinPiezas = grupoSinPiezasLibres(p);
    const noDisp = (p.estado !== "Disponible" || vencido || sinPiezas) && !checked;
    const row = document.createElement("label");
    row.className = "patron-row";
    row.style.cursor = noDisp ? "not-allowed" : "pointer";
    row.style.opacity = noDisp ? "0.5" : "1";
    row.style.background = checked ? "var(--surface-0)" : "transparent";
    let badgeCalibracion = "";
    if (vencido) {
      const detalle = actividadesVencidas(p).map(a => `${a.nombre} (${formatMesISO(a.mesVencimiento)})`).join(", ");
      badgeCalibracion = `<span class="badge vencido" title="${escapeHTML(detalle)} - no puede salir a servicio">Vencido</span>`;
    }
    // En un grupo el estado suelto dice poco: lo que importa es cuantas
    // piezas quedan libres, asi que ese es el badge que se muestra.
    const badgeEstado = grupo
      ? `<span class="badge ${sinPiezas ? "serv" : "grupo"}" title="Patrón de grupo: se indica la cantidad al registrar la salida">${escapeHTML(descripcionDisponibilidadGrupo(p))}</span>`
      : `<span class="badge ${p.estado==="Disponible"?"disp":"serv"}">${escapeHTML(p.estado)}</span>`;
    row.innerHTML = `
      <input type="checkbox" ${checked?"checked":""} ${noDisp?"disabled":""} data-codigo="${escapeHTML(p.codigo)}">
      <div style="flex:1;"><div class="codigo">${escapeHTML(p.codigo)}</div><div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}</div></div>
      ${badgeEstado}
      ${badgeCalibracion}
    `;
    lista.appendChild(row);
  });
  lista.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      if (e.target.checked) {
        seleccionados[codigo] = true;
        prepararCantidadGrupo(codigo);
      } else {
        seleccionados[codigo] = false;
        delete cantidadesSeleccion[codigo];
      }
      render();
    });
  });

  renderCatalogoPatrones();
  renderHistorial();
  renderTecnicos();
  renderClientes();
  renderInventario();
  renderInicio();
  poblarFiltrosPrograma();
  renderPrograma();

  actualizarEstadoAlmacenamiento();
}

// ============================================================
// 6.b PANEL DE INICIO (SEMAFORO)
// ============================================================
// ============================================================
// 6.b REGLAS DE MOVIMIENTOS E INVENTARIO
// ============================================================
// Las reglas puras viven en js/domain/movimientos.js. Estos adaptadores solo
// suministran el historial cargado por la aplicación.
const { MOVIMIENTOS_CERRADOS, movimientoCerrado, esPatronGrupo,
  unidadesDeGrupo, cantidadDeRegistro, estadoTrasMovimiento, diasDesde } = window.MetrologiaMovimientos;
const unidadesFueraDe = codigo => window.MetrologiaMovimientos.unidadesFueraDe(historial, codigo);
const unidadesDisponiblesDe = patron => window.MetrologiaMovimientos.unidadesDisponiblesDe(patron, historial);
const descripcionDisponibilidadGrupo = patron => window.MetrologiaMovimientos.descripcionDisponibilidadGrupo(patron, historial);
const grupoSinPiezasLibres = patron => window.MetrologiaMovimientos.grupoSinPiezasLibres(patron, historial);
const salidaActivaDe = codigo => window.MetrologiaMovimientos.salidaActivaDe(historial, codigo);
function renderInicio(){
  const cont = document.getElementById("panel-inicio");
  if (!cont) return;

  const enUso = patrones.filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado));

  const bloqueados = enUso.filter(p => patronBloqueadoPorCalibracion(p));
  const porVencer = enUso.filter(p => estadoCalibracion(p) === 'por_vencer');
  const enServicio = patrones.filter(p => p.estado === "En servicio");
  const disponiblesOK = enUso.filter(p => p.estado === "Disponible" && !patronBloqueadoPorCalibracion(p));

  document.getElementById("stat-vencidos").textContent = bloqueados.length;
  document.getElementById("stat-porvencer").textContent = porVencer.length;
  document.getElementById("stat-enservicio").textContent = enServicio.length;
  document.getElementById("stat-disponibles").textContent = disponiblesOK.length;

  // --- Seccion: actividades vencidas ---
  const secVenc = document.getElementById("sec-vencidos");
  const listaVenc = document.getElementById("lista-inicio-vencidos");
  listaVenc.innerHTML = "";
  secVenc.style.display = bloqueados.length ? "block" : "none";
  bloqueados
    .slice()
    .sort((a,b) => a.codigo.localeCompare(b.codigo))
    .forEach(p => {
      actividadesVencidas(p).forEach(a => {
        const row = document.createElement("div");
        row.className = "patron-row";
        row.innerHTML = `
          <div style="flex:1;">
            <div class="codigo">${escapeHTML(p.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(p.categoria)}</span></div>
            <div class="categoria">${escapeHTML(p.area)} · ${escapeHTML(a.nombre)} vencio en ${escapeHTML(formatMesISO(a.mesVencimiento))}</div>
          </div>
          <span class="badge vencido">${escapeHTML(a.clave)} vencida</span>
          <button class="btn-mini btn-inicio-registrar" data-codigo="${escapeHTML(p.codigo)}" data-clave="${escapeHTML(a.clave)}">Registrar actividad</button>
        `;
        listaVenc.appendChild(row);
      });
    });

  // --- Seccion: vencen este mes ---
  const secPor = document.getElementById("sec-porvencer");
  const listaPor = document.getElementById("lista-inicio-porvencer");
  listaPor.innerHTML = "";
  secPor.style.display = porVencer.length ? "block" : "none";
  porVencer
    .slice()
    .sort((a,b) => a.codigo.localeCompare(b.codigo))
    .forEach(p => {
      const act = getActividades(p);
      ACTIVIDADES_ISO
        .filter(({clave}) => estadoActividad(act[clave]) === 'por_vencer')
        .forEach(({clave, nombre}) => {
          const row = document.createElement("div");
          row.className = "patron-row";
          row.innerHTML = `
            <div style="flex:1;">
              <div class="codigo">${escapeHTML(p.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(p.categoria)}</span></div>
              <div class="categoria">${escapeHTML(p.area)} · ${escapeHTML(nombre)} vence este mes (${escapeHTML(formatMesISO(act[clave].mesVencimiento))})</div>
            </div>
            <span class="badge porvencer">${escapeHTML(clave)}</span>
            <button class="btn-mini btn-inicio-registrar" data-codigo="${escapeHTML(p.codigo)}" data-clave="${escapeHTML(clave)}">Registrar actividad</button>
          `;
          listaPor.appendChild(row);
        });
    });

  // --- Seccion: patrones fuera en servicio ---
  const secServ = document.getElementById("sec-enservicio");
  const listaServ = document.getElementById("lista-inicio-enservicio");
  listaServ.innerHTML = "";
  secServ.style.display = enServicio.length ? "block" : "none";
  enServicio
    .slice()
    .sort((a,b) => a.codigo.localeCompare(b.codigo))
    .forEach(p => {
      const salida = salidaActivaDe(p.codigo);
      const dias = salida ? diasDesde(salida.fechaHoraSalida || salida.fecha) : null;
      const diasTxt = dias === null ? "" : (dias === 0 ? "salió hoy" : `fuera hace ${dias} día${dias===1?"":"s"}`);
      const detalle = salida
        ? `OT ${escapeHTML(salida.numeroOT)} · ${escapeHTML(salida.empresa)} · ${escapeHTML(salida.tecnico)}${diasTxt ? " · " + diasTxt : ""}`
        : "Sin registro de salida en el historial (revisar)";
      const row = document.createElement("div");
      row.className = "patron-row";
      row.innerHTML = `
        <div style="flex:1;">
          <div class="codigo">${escapeHTML(p.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(p.categoria)}</span></div>
          <div class="categoria">${detalle}</div>
        </div>
        ${dias !== null && dias > 30 ? '<span class="badge porvencer" title="Más de 30 días fuera del laboratorio">+30 días</span>' : ''}
        <span class="badge serv">En servicio</span>
      `;
      listaServ.appendChild(row);
    });

  document.getElementById("inicio-todo-ok").style.display =
    (bloqueados.length || porVencer.length || enServicio.length) ? "none" : "block";

  // Boton "Registrar actividad" -> abre el modal ya posicionado en la
  // actividad especifica que esta vencida / por vencer.
  cont.querySelectorAll(".btn-inicio-registrar").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      const clave = e.target.getAttribute("data-clave");
      abrirModalCalibracion(codigo, clave);
    });
  });
}

function mostrarInfoTecnico(){
  const tecnicoSel = document.getElementById("in-tecnico").value;
  const tecInfo = tecnicos.find(t => t.nombre === tecnicoSel);
  const tecInfoBox = document.getElementById("tec-info");
  if (tecInfo) {
    tecInfoBox.style.display = "flex";
    document.getElementById("tec-laptop").textContent = tecInfo.laptop || "-";
    document.getElementById("tec-termo").textContent = tecInfo.termohigrometro || "-";
    const extraWrap = document.getElementById("tec-extra-wrap");
    if (tecInfo.extra && tecInfo.extra.trim()) {
      extraWrap.style.display = "block";
      document.getElementById("tec-extra").textContent = tecInfo.extra;
    } else {
      extraWrap.style.display = "none";
    }
  } else {
    tecInfoBox.style.display = "none";
  }
}

// ============================================================
// 6.b2 RESUMEN VISIBLE DE LA SELECCION
//
// La lista de patrones vive en un cuadro con scroll propio y el catalogo
// pasa de 600 equipos: al filtrar por area o buscar por codigo, lo ya
// marcado desaparecia de la vista y solo quedaba un contador. Este resumen
// mantiene a la vista TODO lo seleccionado, venga del filtro que venga,
// y permite quitar cualquiera sin tener que volver a buscarlo.
// ============================================================
function codigosSeleccionados(){
  return Object.keys(seleccionados).filter(c => seleccionados[c]);
}

// Al marcar un grupo le damos una cantidad de partida: 1 pieza. El usuario
// la corrige en el resumen, que esta siempre a la vista.
function prepararCantidadGrupo(codigo){
  const p = patrones.find(x => x.codigo === codigo);
  if (!esPatronGrupo(p)) return;
  if (!cantidadesSeleccion[codigo]) cantidadesSeleccion[codigo] = 1;
}

function cantidadSeleccionadaDe(codigo){
  const n = parseInt(cantidadesSeleccion[codigo], 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

// Total de PIEZAS de la salida (un patron normal cuenta como una).
function totalPiezasSeleccionadas(){
  return codigosSeleccionados().reduce((suma, c) => {
    const p = patrones.find(x => x.codigo === c);
    return suma + (esPatronGrupo(p) ? cantidadSeleccionadaDe(c) : 1);
  }, 0);
}

function renderResumenSeleccion(){
  const caja = document.getElementById("resumen-seleccion");
  const chips = document.getElementById("resumen-chips");
  if (!caja || !chips) return;

  const codigos = codigosSeleccionados();
  document.getElementById("resumen-count").textContent = codigos.length;

  if (codigos.length === 0) { caja.style.display = "none"; chips.innerHTML = ""; return; }
  caja.style.display = "block";

  // Agrupados por area: es como el tecnico arma el maletin, y de paso
  // deja ver de un vistazo si falta algo de alguna magnitud.
  const porArea = {};
  codigos.forEach(codigo => {
    const p = patrones.find(x => x.codigo === codigo);
    const area = p ? (p.area || "Sin laboratorio") : "Patrón no encontrado";
    (porArea[area] = porArea[area] || []).push({ codigo, patron: p });
  });

  chips.innerHTML = Object.keys(porArea).sort().map(area => {
    const lista = porArea[area]
      .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
      .map(({ codigo, patron }) => {
        const valor = patron && String(patron.valorNominal || "").trim();
        const titulo = patron ? `${patron.categoria}${valor ? " · " + valor : ""}` : "Este patrón ya no existe en el catálogo";
        // En un grupo la cantidad se escribe aqui: el resumen esta siempre
        // visible, tanto si el patron se marco a mano como si se escaneo.
        if (esPatronGrupo(patron)) {
          const libres = unidadesDisponiblesDe(patron);
          const cantidad = cantidadSeleccionadaDe(codigo);
          const excede = cantidad > libres;
          return `<span class="chip-patron chip-grupo${excede ? " excede" : ""}" title="${escapeHTML(titulo)}">
              <span class="chip-codigo">${escapeHTML(codigo)}</span>
              <input type="number" class="chip-cantidad" data-codigo="${escapeHTML(codigo)}"
                     value="${cantidad}" min="1" max="${libres}" step="1"
                     title="Cuántas piezas de este grupo salen (${libres} disponibles)"
                     aria-label="Cantidad de ${escapeHTML(codigo)}">
              <span class="chip-valor">de ${libres}</span>
              <button type="button" class="btn-quitar-chip" data-codigo="${escapeHTML(codigo)}" title="Quitar ${escapeHTML(codigo)} de la selección" aria-label="Quitar ${escapeHTML(codigo)}">×</button>
            </span>`;
        }
        return `<span class="chip-patron" title="${escapeHTML(titulo)}">
            <span class="chip-codigo">${escapeHTML(codigo)}</span>
            ${valor ? `<span class="chip-valor">${escapeHTML(valor)}</span>` : ""}
            <button type="button" class="btn-quitar-chip" data-codigo="${escapeHTML(codigo)}" title="Quitar ${escapeHTML(codigo)} de la selección" aria-label="Quitar ${escapeHTML(codigo)}">×</button>
          </span>`;
      }).join("");
    return `<div class="resumen-grupo">
        <div class="resumen-area">${escapeHTML(area)} (${porArea[area].length})</div>
        <div class="chips">${lista}</div>
      </div>`;
  }).join("");

  chips.querySelectorAll(".btn-quitar-chip").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.currentTarget.getAttribute("data-codigo");
      delete seleccionados[codigo];
      delete cantidadesSeleccion[codigo];
      render();
    });
  });

  // Al teclear la cantidad NO se vuelve a dibujar todo: si lo hicieramos,
  // el campo perderia el foco en cada pulsacion. Solo se guarda el numero
  // y se refresca el contador de piezas.
  chips.querySelectorAll(".chip-cantidad").forEach(input => {
    input.addEventListener("input", (e) => {
      const codigo = e.currentTarget.getAttribute("data-codigo");
      cantidadesSeleccion[codigo] = e.currentTarget.value;
      const p = patrones.find(x => x.codigo === codigo);
      const libres = unidadesDisponiblesDe(p);
      const n = parseInt(e.currentTarget.value, 10);
      e.currentTarget.closest(".chip-patron").classList.toggle("excede", Number.isInteger(n) && n > libres);
      actualizarContadorPiezas();
    });
    // Al salir del campo se corrige lo imposible (vacio, 0, mas de las que hay)
    input.addEventListener("change", (e) => {
      const codigo = e.currentTarget.getAttribute("data-codigo");
      const p = patrones.find(x => x.codigo === codigo);
      const libres = unidadesDisponiblesDe(p);
      let n = parseInt(e.currentTarget.value, 10);
      if (!Number.isInteger(n) || n < 1) n = 1;
      if (n > libres) n = Math.max(1, libres);
      cantidadesSeleccion[codigo] = n;
      e.currentTarget.value = n;
      e.currentTarget.closest(".chip-patron").classList.remove("excede");
      actualizarContadorPiezas();
    });
  });
  actualizarContadorPiezas();
}

// El titulo del resumen distingue patrones de piezas: 2 patrones pueden ser
// 32 pesas, y lo que el tecnico carga en el maletin son las piezas.
function actualizarContadorPiezas(){
  const el = document.getElementById("resumen-count");
  if (!el) return;
  const patronesSel = codigosSeleccionados().length;
  const piezas = totalPiezasSeleccionadas();
  el.textContent = piezas === patronesSel
    ? String(patronesSel)
    : `${patronesSel} · ${piezas} piezas`;
}

// ============================================================
// 6.c SELECTORES DE EMPRESA Y SEDE EN LA PANTALLA DE SALIDA
// ============================================================
const OPCION_NUEVA_SEDE = "__nueva_sede__";

// La empresa se escribe a mano con autocompletado, no se elige de una lista
// desplegable: con muchos clientes buscar en el desplegable era mas lento
// que teclear. El <datalist> ofrece las que ya existen mientras se escribe y,
// en cuanto lo tecleado coincide con una registrada, queda seleccionada sola
// y aparecen sus sedes. Si no coincide con ninguna, se ofrece registrarla.
function poblarSelectClientes(){
  const campo = document.getElementById("in-cliente");
  if (!campo) return;

  // Si la empresa recordada se borro desde la pestaña Clientes,
  // limpiamos la seleccion en vez de dejar un id fantasma.
  if (clienteSeleccionadoId && !getCliente(clienteSeleccionadoId)) {
    clienteSeleccionadoId = "";
    sedeSeleccionadaId = "";
  }

  // Ojo: la pestaña Clientes ya usa el id "lista-clientes" para sus
  // tarjetas; estas sugerencias llevan uno propio.
  const lista = document.getElementById("sugerencias-clientes");
  if (lista) {
    lista.innerHTML = clientesOrdenados().map(c => {
      const nSedes = Array.isArray(c.sedes) ? c.sedes.length : 0;
      const detalle = nSedes > 1 ? ` — ${nSedes} sedes` : "";
      return `<option value="${escapeHTML(c.nombre)}">${escapeHTML(detalle)}</option>`;
    }).join("");
  }

  // El campo muestra el NOMBRE; el id vive en clienteSeleccionadoId. No se
  // pisa lo que el usuario este tecleando ahora mismo.
  const cliente = getCliente(clienteSeleccionadoId);
  if (document.activeElement !== campo) campo.value = cliente ? cliente.nombre : "";
  mostrarEstadoCliente();
  poblarSelectSedes();
}

// Mensaje bajo el campo: dice si lo escrito ya corresponde a una empresa
// registrada o si habra que darla de alta.
function mostrarEstadoCliente(){
  const caja = document.getElementById("in-cliente-estado");
  const campo = document.getElementById("in-cliente");
  if (!caja || !campo) return;
  const texto = campo.value.trim();
  const cliente = getCliente(clienteSeleccionadoId);

  if (!texto) {
    caja.textContent = "";
    return;
  }
  if (cliente && normalizarNombre(cliente.nombre).toLowerCase() === normalizarNombre(texto).toLowerCase()) {
    const n = Array.isArray(cliente.sedes) ? cliente.sedes.length : 0;
    caja.textContent = n
      ? `Empresa registrada · ${n} sede(s)`
      : "Empresa registrada · sin sedes todavía";
    caja.style.color = "var(--text-secondary)";
    return;
  }
  caja.textContent = "Empresa nueva: se registrará al completar los datos de abajo.";
  caja.style.color = "var(--text-danger)";
}

// Resuelve lo tecleado contra el directorio. Devuelve true si lo encontro.
function resolverClienteEscrito({ abrirAltaSiNoExiste = false } = {}){
  const campo = document.getElementById("in-cliente");
  if (!campo) return false;
  const texto = campo.value.trim();

  if (!texto) {
    clienteSeleccionadoId = "";
    sedeSeleccionadaId = "";
    document.getElementById("bloque-cliente-nuevo").classList.remove("open");
    poblarSelectSedes();
    mostrarEstadoCliente();
    return false;
  }

  const clave = normalizarNombre(texto).toLowerCase();
  const encontrado = clientes.find(c => normalizarNombre(c.nombre).toLowerCase() === clave);

  if (encontrado) {
    // Coincide con una que ya existe: se selecciona sola, con sus sedes.
    const cambio = clienteSeleccionadoId !== encontrado.id;
    clienteSeleccionadoId = encontrado.id;
    if (cambio) sedeSeleccionadaId = "";
    campo.value = encontrado.nombre;   // deja el nombre tal como esta guardado
    document.getElementById("bloque-cliente-nuevo").classList.remove("open");
    poblarSelectSedes();
    mostrarEstadoCliente();
    return true;
  }

  clienteSeleccionadoId = "";
  sedeSeleccionadaId = "";
  poblarSelectSedes();
  mostrarEstadoCliente();
  if (abrirAltaSiNoExiste) {
    abrirBloqueClienteNuevo();
    const nc = document.getElementById("nc-nombre");
    if (nc && !nc.value.trim()) nc.value = texto;   // ya escrito, no repetirlo
  }
  return false;
}

function poblarSelectSedes(){
  const sel = document.getElementById("in-sede");
  if (!sel) return;
  const cliente = getCliente(clienteSeleccionadoId);

  if (!cliente) {
    sel.innerHTML = '<option value="">Primero elige la empresa</option>';
    sel.disabled = true;
    sedeSeleccionadaId = "";
    actualizarCajaDireccion();
    return;
  }

  sel.disabled = false;
  const sedes = Array.isArray(cliente.sedes) ? cliente.sedes : [];
  if (sedeSeleccionadaId && !getSede(cliente, sedeSeleccionadaId)) sedeSeleccionadaId = "";

  const opciones = [];
  if (sedes.length === 0) {
    opciones.push('<option value="">Esta empresa aún no tiene sedes</option>');
  } else {
    opciones.push('<option value="">Selecciona la sede</option>');
    sedes.forEach(s => {
      const dir = String(s.direccion || "").trim();
      const etiqueta = dir ? `${s.nombre} — ${dir}` : s.nombre;
      opciones.push(`<option value="${escapeHTML(s.id)}">${escapeHTML(etiqueta)}</option>`);
    });
  }
  opciones.push(`<option value="${OPCION_NUEVA_SEDE}">➕ Añadir otra sede...</option>`);
  sel.innerHTML = opciones.join("");
  sel.value = sedeSeleccionadaId || "";

  // Con una sola sede no tiene sentido obligar a elegirla: la damos por buena.
  if (!sedeSeleccionadaId && sedes.length === 1) {
    sedeSeleccionadaId = sedes[0].id;
    sel.value = sedeSeleccionadaId;
  }
  actualizarCajaDireccion();
}

function actualizarCajaDireccion(){
  const caja = document.getElementById("salida-direccion-box");
  if (!caja) return;
  const cliente = getCliente(clienteSeleccionadoId);
  const sede = getSede(cliente, sedeSeleccionadaId);
  if (!sede) { caja.style.display = "none"; return; }

  caja.style.display = "block";
  const dir = String(sede.direccion || "").trim();
  document.getElementById("salida-direccion-texto").textContent =
    dir ? `${sede.nombre}: ${dir}` : `${sede.nombre} (sin dirección registrada)`;

  const contacto = [sede.contacto, sede.telefono].filter(x => String(x || "").trim()).join(" · ");
  const cajaContacto = document.getElementById("salida-contacto-texto");
  cajaContacto.textContent = contacto ? "Contacto: " + contacto : "";
  cajaContacto.style.display = contacto ? "block" : "none";
}

function abrirBloqueClienteNuevo(){
  document.getElementById("bloque-sede-nueva").classList.remove("open");
  const bloque = document.getElementById("bloque-cliente-nuevo");
  bloque.classList.add("open");
  document.getElementById("nc-error").style.display = "none";
  const escrito = (document.getElementById("in-cliente").value || "").trim();
  const nc = document.getElementById("nc-nombre");
  if (escrito && !nc.value.trim()) nc.value = escrito;
  // Si ya trae el nombre, el foco va al primer campo que falta por llenar.
  (nc.value.trim() ? document.getElementById("nc-sede-direccion") : nc).focus();
}

function cerrarBloqueClienteNuevo(){
  document.getElementById("bloque-cliente-nuevo").classList.remove("open");
  ["nc-nombre","nc-ruc","nc-sede-nombre","nc-sede-direccion","nc-sede-contacto","nc-sede-telefono"]
    .forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("nc-error").style.display = "none";
  const cli = getCliente(clienteSeleccionadoId);
  document.getElementById("in-cliente").value = cli ? cli.nombre : "";
  mostrarEstadoCliente();
}

function abrirBloqueSedeNueva(){
  const cliente = getCliente(clienteSeleccionadoId);
  if (!cliente) { avisar("Primero elige la empresa a la que quieres añadir la sede.", "info"); return; }
  document.getElementById("bloque-cliente-nuevo").classList.remove("open");
  document.getElementById("ns-empresa-nombre").textContent = cliente.nombre;
  const bloque = document.getElementById("bloque-sede-nueva");
  bloque.classList.add("open");
  document.getElementById("ns-error").style.display = "none";
  document.getElementById("ns-nombre").focus();
}

function cerrarBloqueSedeNueva(){
  document.getElementById("bloque-sede-nueva").classList.remove("open");
  ["ns-nombre","ns-direccion","ns-contacto","ns-telefono"]
    .forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("ns-error").style.display = "none";
  document.getElementById("in-sede").value = sedeSeleccionadaId || "";
}

async function guardarClienteNuevoDesdeSalida(){
  const err = document.getElementById("nc-error");
  err.style.display = "none";
  const nombre = document.getElementById("nc-nombre").value.trim();
  const direccion = document.getElementById("nc-sede-direccion").value.trim();

  if (!nombre) { err.textContent = "Escribe la razón social o nombre de la empresa."; err.style.display = "block"; return; }
  if (existeClienteConNombre(nombre)) {
    err.textContent = "Ya existe una empresa registrada con ese nombre. Escríbelo arriba y se seleccionará sola.";
    err.style.display = "block"; return;
  }
  if (!direccion) { err.textContent = "Escribe la dirección de la sede: es lo que se imprime en el acta."; err.style.display = "block"; return; }

  const cliente = await crearCliente({
    nombre,
    ruc: document.getElementById("nc-ruc").value,
    sedeNombre: document.getElementById("nc-sede-nombre").value,
    sedeDireccion: direccion,
    sedeContacto: document.getElementById("nc-sede-contacto").value,
    sedeTelefono: document.getElementById("nc-sede-telefono").value
  });

  clienteSeleccionadoId = cliente.id;
  sedeSeleccionadaId = cliente.sedes.length ? cliente.sedes[0].id : "";
  cerrarBloqueClienteNuevo();
  await render();
  avisar(`Empresa "${cliente.nombre}" registrada y seleccionada para esta salida.`, "ok");
}

async function guardarSedeNuevaDesdeSalida(){
  const err = document.getElementById("ns-error");
  err.style.display = "none";
  const nombre = document.getElementById("ns-nombre").value.trim();
  const direccion = document.getElementById("ns-direccion").value.trim();

  if (!nombre) { err.textContent = "Ponle un nombre a la sede (ej: Planta Norte)."; err.style.display = "block"; return; }
  if (!direccion) { err.textContent = "Escribe la dirección de la sede."; err.style.display = "block"; return; }

  const cliente = getCliente(clienteSeleccionadoId);
  if (cliente && (cliente.sedes || []).some(s => normalizarNombre(s.nombre).toLowerCase() === nombre.toLowerCase())) {
    err.textContent = "Esa empresa ya tiene una sede con ese nombre."; err.style.display = "block"; return;
  }

  try {
    const sede = await agregarSedeACliente(clienteSeleccionadoId, {
      nombre,
      direccion,
      contacto: document.getElementById("ns-contacto").value,
      telefono: document.getElementById("ns-telefono").value
    });
    sedeSeleccionadaId = sede.id;
    cerrarBloqueSedeNueva();
    await render();
    avisar(`Sede "${sede.nombre}" añadida y seleccionada.`, "ok");
  } catch (e) {
    err.textContent = e.message; err.style.display = "block";
  }
}

// ============================================================
// 6.d PESTAÑA DE CLIENTES (alta, edicion y sedes)
// ============================================================
function renderClientes(){
  const cont = document.getElementById("lista-clientes");
  const vacio = document.getElementById("clientes-vacio");
  if (!cont) return;
  cont.innerHTML = "";

  const q = busquedaClientes.trim().toLowerCase();
  const filtrados = clientesOrdenados().filter(c => {
    if (!q) return true;
    const enSedes = (c.sedes || []).some(s =>
      String(s.nombre || "").toLowerCase().includes(q) ||
      String(s.direccion || "").toLowerCase().includes(q) ||
      String(s.contacto || "").toLowerCase().includes(q));
    return String(c.nombre || "").toLowerCase().includes(q)
        || String(c.ruc || "").toLowerCase().includes(q)
        || enSedes;
  });

  if (filtrados.length === 0) {
    vacio.style.display = "block";
    vacio.textContent = q
      ? "No hay empresas que coincidan con esa búsqueda."
      : "Aún no hay empresas registradas. Añade la primera con el formulario de arriba.";
    return;
  }
  vacio.style.display = "none";

  filtrados.forEach(c => {
    const sedes = Array.isArray(c.sedes) ? c.sedes : [];
    const salidas = historial.filter(h => h.clienteId === c.id ||
      normalizarNombre(h.empresa).toLowerCase() === normalizarNombre(c.nombre).toLowerCase()).length;

    let sedesHtml = "";
    if (sedes.length === 0) {
      sedesHtml = `<div class="sede-line"><span class="obs-vacio">Sin sedes registradas. Añade una para poder usarla en las salidas.</span></div>`;
    } else {
      sedes.forEach(s => {
        sedesHtml += `
          <div class="sede-line">
            <div>
              <div class="sede-nombre">${escapeHTML(s.nombre)}</div>
              <div class="sede-dir">${escapeHTML(s.direccion || "Sin dirección registrada")}</div>
              ${(s.contacto || s.telefono)
                ? `<div class="sede-contacto">${escapeHTML([s.contacto, s.telefono].filter(Boolean).join(" · "))}</div>`
                : ""}
            </div>
            <button class="btn-mini btn-eliminar-sede" data-cliente="${escapeHTML(c.id)}" data-sede="${escapeHTML(s.id)}">Quitar sede</button>
          </div>`;
      });
    }

    const div = document.createElement("div");
    div.className = "cliente-card";
    div.innerHTML = `
      <div class="cliente-header">
        <div>
          <div class="cliente-nombre">${escapeHTML(c.nombre)}</div>
          <div class="cliente-meta">
            ${c.ruc ? "RUC " + escapeHTML(c.ruc) + " · " : ""}${sedes.length} sede(s) · ${salidas} salida(s) registradas
          </div>
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn-mini btn-nueva-sede" data-cliente="${escapeHTML(c.id)}">Añadir sede</button>
          <button class="btn-mini btn-editar-cliente" data-cliente="${escapeHTML(c.id)}">Editar</button>
          <button class="btn-mini btn-eliminar-cliente" data-cliente="${escapeHTML(c.id)}">Eliminar</button>
        </div>
      </div>
      ${sedesHtml}

      <div class="sede-nueva-form" id="form-sede-${escapeHTML(c.id)}">
        <div class="grid2">
          <div>
            <label class="field-label">Nombre de la sede</label>
            <input type="text" class="fs-nombre" placeholder="Ej: Planta Norte">
          </div>
          <div>
            <label class="field-label">Teléfono (opcional)</label>
            <input type="text" class="fs-telefono" placeholder="Ej: 987 654 321">
          </div>
          <div class="full">
            <label class="field-label">Dirección</label>
            <input type="text" class="fs-direccion" placeholder="Ej: Jr. Los Talleres 145, Callao">
          </div>
          <div class="full">
            <label class="field-label">Contacto (opcional)</label>
            <input type="text" class="fs-contacto" placeholder="Ej: Sr. Juan Pérez">
          </div>
        </div>
        <p class="msg-error fs-error"></p>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-primario btn-mini btn-guardar-sede" data-cliente="${escapeHTML(c.id)}">Guardar sede</button>
          <button class="btn-mini btn-cancelar-sede" data-cliente="${escapeHTML(c.id)}">Cancelar</button>
        </div>
      </div>

      <div class="cliente-edit-form" id="form-cliente-${escapeHTML(c.id)}">
        <div class="grid2">
          <div class="full">
            <label class="field-label">Razón social / nombre</label>
            <input type="text" class="fc-nombre" value="${escapeHTML(c.nombre)}">
          </div>
          <div class="full">
            <label class="field-label">RUC (opcional)</label>
            <input type="text" class="fc-ruc" value="${escapeHTML(c.ruc || "")}">
          </div>
        </div>
        <p class="msg-error fc-error"></p>
        <div style="display:flex; gap:8px; margin-top:10px;">
          <button class="btn-primario btn-mini btn-guardar-cliente" data-cliente="${escapeHTML(c.id)}">Guardar cambios</button>
          <button class="btn-mini btn-cancelar-cliente" data-cliente="${escapeHTML(c.id)}">Cancelar</button>
        </div>
      </div>
    `;
    cont.appendChild(div);
  });

  conectarBotonesClientes(cont);
}

function conectarBotonesClientes(cont){
  cont.querySelectorAll(".btn-nueva-sede").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-cliente");
      document.getElementById("form-cliente-" + id).classList.remove("open");
      const form = document.getElementById("form-sede-" + id);
      form.classList.toggle("open");
      if (form.classList.contains("open")) form.querySelector(".fs-nombre").focus();
    });
  });
  cont.querySelectorAll(".btn-cancelar-sede").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.getElementById("form-sede-" + e.target.getAttribute("data-cliente")).classList.remove("open");
    });
  });
  cont.querySelectorAll(".btn-editar-cliente").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.target.getAttribute("data-cliente");
      document.getElementById("form-sede-" + id).classList.remove("open");
      const form = document.getElementById("form-cliente-" + id);
      form.classList.toggle("open");
      if (form.classList.contains("open")) form.querySelector(".fc-nombre").focus();
    });
  });
  cont.querySelectorAll(".btn-cancelar-cliente").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.getElementById("form-cliente-" + e.target.getAttribute("data-cliente")).classList.remove("open");
    });
  });

  cont.querySelectorAll(".btn-guardar-sede").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-cliente");
      const form = document.getElementById("form-sede-" + id);
      const err = form.querySelector(".fs-error");
      err.style.display = "none";
      const nombre = form.querySelector(".fs-nombre").value.trim();
      const direccion = form.querySelector(".fs-direccion").value.trim();
      if (!nombre) { err.textContent = "Ponle un nombre a la sede."; err.style.display = "block"; return; }
      if (!direccion) { err.textContent = "Escribe la dirección de la sede."; err.style.display = "block"; return; }
      const cliente = getCliente(id);
      if (cliente && (cliente.sedes || []).some(s => normalizarNombre(s.nombre).toLowerCase() === nombre.toLowerCase())) {
        err.textContent = "Esta empresa ya tiene una sede con ese nombre."; err.style.display = "block"; return;
      }
      await agregarSedeACliente(id, {
        nombre, direccion,
        contacto: form.querySelector(".fs-contacto").value,
        telefono: form.querySelector(".fs-telefono").value
      });
      await render();
      avisar(`Sede "${nombre}" añadida.`, "ok");
    });
  });

  cont.querySelectorAll(".btn-guardar-cliente").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-cliente");
      const form = document.getElementById("form-cliente-" + id);
      const err = form.querySelector(".fc-error");
      err.style.display = "none";
      const nombre = form.querySelector(".fc-nombre").value.trim();
      if (!nombre) { err.textContent = "El nombre no puede quedar vacío."; err.style.display = "block"; return; }
      if (existeClienteConNombre(nombre, id)) {
        err.textContent = "Ya existe otra empresa con ese nombre."; err.style.display = "block"; return;
      }
      const cliente = getCliente(id);
      if (!cliente) return;
      await saveRecord(STORES.clientes, {
        ...cliente,
        nombre: normalizarNombre(nombre),
        ruc: form.querySelector(".fc-ruc").value.trim()
      });
      await render();
      avisar("Datos de la empresa actualizados.", "ok");
    });
  });

  cont.querySelectorAll(".btn-eliminar-sede").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const clienteId = e.target.getAttribute("data-cliente");
      const sedeId = e.target.getAttribute("data-sede");
      const cliente = getCliente(clienteId);
      const sede = getSede(cliente, sedeId);
      if (!cliente || !sede) return;
      const ok = await confirmar({
        titulo: "Quitar sede",
        mensaje: `Se quitará la sede "${sede.nombre}" de ${cliente.nombre}.\n\n` +
                 `Las salidas ya registradas conservan la dirección con la que se emitieron, ` +
                 `así que el historial y las actas antiguas no cambian.`,
        textoOk: "Quitar sede", peligro: true
      });
      if (!ok) return;
      const sedesAntes = [...(cliente.sedes || [])];
      await saveRecord(STORES.clientes, {
        ...cliente, sedes: sedesAntes.filter(s => s.id !== sedeId)
      });
      if (sedeSeleccionadaId === sedeId) sedeSeleccionadaId = "";
      await render();
      avisar(`Sede "${sede.nombre}" eliminada.`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => {
          const actual = getCliente(clienteId);
          if (actual) await saveRecord(STORES.clientes, { ...actual, sedes: sedesAntes });
          await render();
        }
      });
    });
  });

  cont.querySelectorAll(".btn-eliminar-cliente").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-cliente");
      const cliente = getCliente(id);
      if (!cliente) return;
      const salidas = historial.filter(h => h.clienteId === id).length;
      const ok = await confirmar({
        titulo: "Eliminar empresa",
        mensaje: `Se eliminará "${cliente.nombre}" del directorio de clientes` +
                 (salidas ? `.\n\nTiene ${salidas} salida(s) en el historial: esos registros NO se borran ` +
                            `y conservan el nombre y la dirección con los que se emitieron.` : "."),
        textoOk: "Eliminar empresa", peligro: true
      });
      if (!ok) return;
      await deleteRecord(STORES.clientes, id);
      if (clienteSeleccionadoId === id) { clienteSeleccionadoId = ""; sedeSeleccionadaId = ""; }
      await render();
      avisar(`Empresa "${cliente.nombre}" eliminada del directorio.`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => { await saveRecord(STORES.clientes, cliente); await render(); }
      });
    });
  });
}

async function agregarClienteDesdePestaña(){
  const err = document.getElementById("cl-error");
  const ok = document.getElementById("cl-ok");
  err.style.display = "none"; ok.style.display = "none";

  const nombre = document.getElementById("cl-nombre").value.trim();
  const direccion = document.getElementById("cl-sede-direccion").value.trim();

  if (!nombre) { err.textContent = "Escribe la razón social o nombre de la empresa."; err.style.display = "block"; return; }
  if (existeClienteConNombre(nombre)) {
    err.textContent = "Ya existe una empresa registrada con ese nombre."; err.style.display = "block"; return;
  }

  const cliente = await crearCliente({
    nombre,
    ruc: document.getElementById("cl-ruc").value,
    sedeNombre: document.getElementById("cl-sede-nombre").value,
    sedeDireccion: direccion,
    sedeContacto: document.getElementById("cl-sede-contacto").value,
    sedeTelefono: document.getElementById("cl-sede-telefono").value
  });

  ["cl-nombre","cl-ruc","cl-sede-nombre","cl-sede-direccion","cl-sede-contacto","cl-sede-telefono"]
    .forEach(id => { document.getElementById(id).value = ""; });
  ok.textContent = `Empresa "${cliente.nombre}" registrada` +
    (cliente.sedes.length ? ` con la sede "${cliente.sedes[0].nombre}".` : ". Añádele una sede para poder usarla en las salidas.");
  ok.style.display = "block";
  await render();
}

function renderAreaTags(){
  const areas = getAreas();
  const wrap1 = document.getElementById("area-tags-salida");
  wrap1.innerHTML = `<span class="area-tag${filtroAreaSalida==="Todas"?" active":""}" data-area="Todas" data-target="salida">Todos los laboratorios</span>`;
  areas.forEach(a => {
    wrap1.innerHTML += `<span class="area-tag${filtroAreaSalida===a?" active":""}" data-area="${escapeHTML(a)}" data-target="salida">${escapeHTML(a)}</span>`;
  });
  const wrap2 = document.getElementById("area-tags-catalogo");
  wrap2.innerHTML = `<span class="area-tag${filtroAreaCatalogo==="Todas"?" active":""}" data-area="Todas" data-target="catalogo">Todos los laboratorios</span>`;
  areas.forEach(a => {
    wrap2.innerHTML += `<span class="area-tag${filtroAreaCatalogo===a?" active":""}" data-area="${escapeHTML(a)}" data-target="catalogo">${escapeHTML(a)}</span>`;
  });
  document.querySelectorAll(".area-tag").forEach(tag => {
    tag.addEventListener("click", (e) => {
      const area = e.target.getAttribute("data-area");
      const target = e.target.getAttribute("data-target");
      if (target === "salida") { filtroAreaSalida = area; filtroCategoria = "Todas"; }
      else { filtroAreaCatalogo = area; filtroCategoria2 = "Todas"; }
      render();
    });
  });
}

// La busqueda mira codigo, categoria, marca y valor nominal: antes solo
// miraba el codigo y buscar "Sartorius" o "termohigrometro" no devolvia nada.
function coincideBusqueda(p, busq){
  if (!busq) return true;
  const q = busq.toLowerCase();
  return String(p.codigo || "").toLowerCase().includes(q)
      || String(p.categoria || "").toLowerCase().includes(q)
      || String(p.marca || "").toLowerCase().includes(q)
      || String(p.modelo || "").toLowerCase().includes(q)
      || String(p.valorNominal || "").toLowerCase().includes(q);
}

function patronesFiltrados(area, cat, busq, soloDisponibles = false){
  return patrones.filter(p => {
    if (soloDisponibles && p.estado !== "Disponible") return false;
    // Un patron vencido de calibracion no puede salir a servicio,
    // aunque su estado operativo diga "Disponible".
    if (soloDisponibles && patronBloqueadoPorCalibracion(p)) return false;
    if (area && area !== "Todas" && p.area !== area) return false;
    if (cat && cat !== "Todas" && p.categoria !== cat) return false;
    if (!coincideBusqueda(p, busq)) return false;
    return true;
  });
}

