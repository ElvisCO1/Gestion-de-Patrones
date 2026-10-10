// ============================================================
// 0-1. PERSISTENCIA INDEXEDDB (modulo js/data/indexeddb.js)
// ============================================================
// La API conserva los mismos nombres que usaba la aplicacion original.
// El modulo recibe los efectos de interfaz por hooks para no acoplarse
// a notificaciones ni al espejo de archivos.
const persistence = window.Metrologia.services.data;
const {
  STORES, openDB, getAll, saveRecord, deleteRecord, clearStore,
  runAtomicTransaction, getConfig, setConfig
} = persistence;

persistence.configure({
  onDataChanged: () => programarEspejo(),
  onVersionChange: () => avisarPersistente(
    "La aplicacion se actualizo en otra pestana. Recarga esta pagina para seguir trabajando.",
    "error",
    { etiqueta: "Recargar ahora", ejecutar: () => location.reload() }
  ),
  onBlocked: () => avisarPersistente(
    "Tienes esta aplicacion abierta en otra pestana con una version anterior.\n" +
    "Cierra las demas pestanas de la app y recarga esta pagina para completar la actualizacion.",
    "error",
    { etiqueta: "Recargar", ejecutar: () => location.reload() }
  )
});

// ============================================================
// 2.b. ESPEJO AUTOMATICO A DISCO (modulo js/data/mirror.js)
// ============================================================
const mirror = window.Metrologia.services.mirror;
const {
  scheduleMirror: programarEspejo,
  serializeAll: serializarTodo,
  mirrorToDisk: espejoADisco,
  connectDirectory: conectarCarpetaDatos,
  restoreDirectory: restaurarCarpetaDatos,
  updateStatus: actualizarEstadoAlmacenamiento
} = mirror;

mirror.configure({
  getLogoConfigKey: () => LOGO_CONFIG_KEY,
  getDocumentConfigKey: () => CONFIG_DOCUMENTO_KEY,
  getDocumentFormatKey: () => FORMATO_ACTA_CONFIG_KEY,
  getSettingsAccessKey: () => CONFIG_ACCESO_CONFIGURACION_KEY,
  todayISO: () => todayISO(),
  notify: (mensaje, tipo) => avisar(mensaje, tipo)
});
// ============================================================
// 2-3. MIGRACION Y CATALOGO INICIAL (modulo js/data/bootstrap.js)
// ============================================================
const bootstrap = window.Metrologia.services.bootstrap;
const INICIALIZADO_KEY = bootstrap.INITIALIZED_KEY;
const migrarDesdeLocalStorage = bootstrap.migrateFromLocalStorage;
const cargarDatosIniciales = bootstrap.loadInitialData;
// ============================================================
// 4.  VARIABLES GLOBALES
// ============================================================
let patrones = [];
let tecnicos = [];
let historial = [];
// Historial ACUMULADO de actividades ISO ejecutadas (una fila por cada
// calibracion / comprobacion / mantenimiento registrado, nunca se pisa).
let actividadesEjecutadas = [];
let clientes = [];
let busquedaClientes = "";
let clienteSeleccionadoId = "";
let sedeSeleccionadaId = "";
let seleccionados = {};
// Cuantas piezas se llevan de cada patron de grupo en la salida en curso.
// Va aparte de "seleccionados" (que sigue siendo un booleano) para no
// tocar todo el codigo que ya trabaja con esa marca.
let cantidadesSeleccion = {};
let seleccionEtiquetas = {};
let filtroCategoria = "Todas", busqueda = "";
let filtroCategoria2 = "Todas", busqueda2 = "";
let filtroAreaSalida = "Todas";
let filtroAreaCatalogo = "Todas";
let busquedaHistorial = "";
let paginaHistorial = 1;
let ordenHistorial = "actividad_desc";
// NOTA: el filtro de estado del catalogo NO se guarda en una variable global
// duplicada; se lee siempre directamente del <select id="filtro-estado">
// dentro de renderCatalogoPatrones() para evitar tener dos fuentes de verdad.

// Estado del modal de borrado total (evita usar confirm() nativo encadenado)
// Sirve tanto para patrones como para tecnicos; "modalEliminarTipo" indica cual.
let modalEliminarCodigoObjetivo = null;
let modalEliminarTipo = null; // 'patron' | 'tecnico'

// Estado del modal de registro de calibracion
let modalCalibracionCodigoObjetivo = null;

// ============================================================
// 5.  FUNCIONES AUXILIARES
// ============================================================
// 5. REGLAS DE ACTIVIDADES ISO (modulo js/domain/activity.js)
// ============================================================
const activityDomain = window.Metrologia.modules.activity;
const {
  ACTIVIDADES_ISO, TIPOS_POR_ACTIVIDAD, normalizarNombre, normalizarCodigoPatron,
  etiquetaTipoCal, actividadVacia, getActividades, mesActualISO, sumarMesesAMes,
  formatMesISO, estadoActividad, estadoCalibracion, patronBloqueadoPorCalibracion,
  actividadesVencidas
} = activityDomain;
// ------------------------------------------------------------
// Avisos no bloqueantes (sustituyen a alert()) y accion "Deshacer".
// alert() congela la pagina y obliga a un clic extra en cada paso;
// estos avisos aparecen abajo a la derecha y se van solos.
// ------------------------------------------------------------
function avisar(mensaje, tipo = "ok", accion = null, persistente = false){
  return window.Metrologia.modules.feedback.notify(document, mensaje, tipo, accion, persistente);
}
function avisarPersistente(mensaje, tipo = "error", accion = null){
  return avisar(mensaje, tipo, accion, true);
}
function confirmar(opciones){ return window.Metrologia.modules.feedback.confirm(document, opciones); }
function cerrarConfirmacion(respuesta){ return window.Metrologia.modules.feedback.closeConfirmation(document, respuesta); }

// Restaura registros borrados (para el "Deshacer" de las eliminaciones).
async function restaurarRegistros(patronesRest = [], historialRest = [], actividadesRest = []){
  const ops = [
    ...patronesRest.map(p => ({ store: STORES.patrones, action: 'put', item: p })),
    ...historialRest.map(h => ({ store: STORES.historial, action: 'put', item: h })),
    ...actividadesRest.map(a => ({ store: STORES.actividades, action: 'put', item: a })),
  ];
  if (!ops.length) return;
  await runAtomicTransaction([STORES.patrones, STORES.historial, STORES.actividades], ops);
  await render();
  avisar("Restaurado correctamente.", "ok");
}

function escapeHTML(value){
  return String(value ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

// ============================================================
// FECHAS Y HORA LOCAL (modulo js/domain/date.js)
// ============================================================
const dateDomain = window.Metrologia.modules.date;
const { todayISO, horaActualHHMMSS, isoDesdeFechaHoraLocal, horaLocalDeISO,
  claveCronologica, formatFecha } = dateDomain;
function nuevoId(prefijo){
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return prefijo + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// 5.b DIRECTORIO DE CLIENTES Y SEDES
//
// Una empresa cliente puede tener varias sedes (planta, almacen,
// oficina...), cada una con su propia direccion. Por eso el cliente
// guarda un ARRAY de sedes y la salida a servicio apunta a una sede
// concreta, no solo a la empresa.
//
// Forma de un cliente:
//   { id, nombre, ruc, sedes: [{ id, nombre, direccion, contacto,
//     telefono }], creadoEn }
// ============================================================
function getCliente(id){
  return clientes.find(c => c.id === id) || null;
}

function getSede(cliente, sedeId){
  if (!cliente || !Array.isArray(cliente.sedes)) return null;
  return cliente.sedes.find(s => s.id === sedeId) || null;
}

function clientesOrdenados(){
  return [...clientes].sort((a, b) =>
    String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" }));
}

// El nombre de la empresa es la clave practica para el usuario, asi que
// impedimos duplicados aunque la clave real de la base sea el id.
function existeClienteConNombre(nombre, ignorarId = null){
  const n = normalizarNombre(nombre).toLowerCase();
  return clientes.some(c => c.id !== ignorarId && normalizarNombre(c.nombre).toLowerCase() === n);
}

function textoSede(sede){
  if (!sede) return "";
  const partes = [sede.nombre, sede.direccion].filter(x => String(x || "").trim());
  return partes.join(" — ");
}

async function crearCliente({ nombre, ruc, sedeNombre, sedeDireccion, sedeContacto, sedeTelefono }){
  return window.Metrologia.services.clientActions.createClient(
    { nuevoId, normalizarNombre, saveRecord, STORES },
    { nombre, ruc, sedeNombre, sedeDireccion, sedeContacto, sedeTelefono }
  );
}

async function agregarSedeACliente(clienteId, { nombre, direccion, contacto, telefono }){
  return window.Metrologia.services.clientActions.addSiteToClient(
    { nuevoId, normalizarNombre, getAll, saveRecord, STORES }, clienteId,
    { nombre, direccion, contacto, telefono }
  );
}

// ------------------------------------------------------------
// Migracion: las salidas antiguas guardaban la empresa como texto
// libre. Al estrenar el directorio creamos una ficha por cada empresa
// distinta que aparezca en el historial, para no empezar de cero.
// Las sedes quedan vacias: el usuario les pone direccion cuando quiera.
// ------------------------------------------------------------
const CLIENTES_MIGRADOS_KEY = 'metrologia_clientes_migrados';

async function migrarClientesDesdeHistorial(){
  if (localStorage.getItem(CLIENTES_MIGRADOS_KEY)) return 0;

  const existentes = await getAll(STORES.clientes);
  const hist = await getAll(STORES.historial);
  const yaRegistrados = new Set(
    existentes.map(c => normalizarNombre(c.nombre).toLowerCase())
  );

  const nombresUnicos = [];
  hist.forEach(h => {
    const nombre = normalizarNombre(h.empresa);
    if (!nombre) return;
    const clave = nombre.toLowerCase();
    if (yaRegistrados.has(clave)) return;
    yaRegistrados.add(clave);
    nombresUnicos.push(nombre);
  });

  const operaciones = nombresUnicos.map(nombre => ({
    store: STORES.clientes,
    action: 'put',
    item: {
      id: nuevoId("cli"),
      nombre,
      ruc: "",
      sedes: [],
      creadoEn: new Date().toISOString(),
      origen: "historial"
    }
  }));

  if (operaciones.length) {
    await runAtomicTransaction([STORES.clientes], operaciones);
  }
  localStorage.setItem(CLIENTES_MIGRADOS_KEY, '1');
  return operaciones.length;
}

const catalogProgram = window.Metrologia.modules.catalogProgram;
function getAreas(){
  return catalogProgram.getAreas(patrones);
}
// ------------------------------------------------------------
// PERSONAL: tecnicos y encargados de laboratorio (supervisores).
//
// Los dos viven en el mismo store (STORES.tecnicos, con el nombre como
// clave) para no migrar la base: lo que los distingue es el campo "rol".
// Los registros antiguos no lo llevan, asi que la ausencia de rol se lee
// como "tecnico", que es lo que eran todos hasta ahora.
//
// Un supervisor puede tener a su cargo VARIOS laboratorios: por eso
// "laboratorios" es una lista y no un campo suelto. La comparacion de
// nombres de laboratorio pasa por claveArea() (sin tildes ni mayusculas)
// porque en las fichas de patron conviven "Grandes Volumenes y Flujo" y
// "Grandes Volúmenes y Flujo", y las dos deben caer en el mismo encargado.
// ------------------------------------------------------------
const ROL_TECNICO = "tecnico";
const ROL_SUPERVISOR = "supervisor";
const personalDominio = window.Metrologia.modules.personnel.create({
  getTechnicians: () => tecnicos,
  getPatterns: () => patrones,
  normalizeArea: claveArea
});

function rolPersona(p){ return personalDominio.roleOf(p); }
function esSupervisor(p){ return personalDominio.isSupervisor(p); }
function esTecnico(p){ return personalDominio.isTechnician(p); }
function nombreRol(rol){
  return rol === ROL_SUPERVISOR ? "Encargado de laboratorio" : "Técnico";
}

function laboratoriosDe(p){ return personalDominio.laboratoriesOf(p); }

// Solo los que pueden salir a servicio; el selector de salida usa esto.
function tecnicosActivos(){ return personalDominio.activeTechnicians(); }
function supervisoresActivos(){ return personalDominio.activeSupervisors(); }

// Encargado(s) de un laboratorio concreto. Devuelve nombres, en orden
// alfabetico, porque un laboratorio podria tener mas de un encargado.
function encargadosDeLaboratorio(area){ return personalDominio.supervisorsForLaboratory(area); }

// Encargado(s) que corresponden a un conjunto de laboratorios (los de los
// patrones de una OT). Sin linea de firma que repartir, una OT que cruza
// laboratorios simplemente nombra a todos sus encargados, sin duplicar a
// quien lleva dos de esos laboratorios.
function encargadosDeLaboratorios(areas){ return personalDominio.supervisorsForLaboratories(areas); }

// ------------------------------------------------------------
// PESAS Y JUEGOS DE PESAS
//
// El acta muestra el valor nominal SOLO para estos: en una pesa el valor
// ES la identidad del patron ("la de 20 kg"), mientras que en un manometro
// o un termohigrometro el valor nominal es un rango largo que llenaria la
// tabla sin aportar nada al tecnico que carga la furgoneta.
//
// Se mira el sustantivo con el que EMPIEZA la categoria, no si la palabra
// aparece en algun sitio: "Pinzas de juegos de pesas" son pinzas, no pesas,
// y no deben llevar valor. La comparacion va sin tildes ni mayusculas
// porque en el catalogo conviven "PESAS", "Pesa" y "Juego de Pesas E2".
// ------------------------------------------------------------
function esCategoriaDePesas(categoria){
  const n = String(categoria || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  return /^pesas?\b/.test(n) || /^juegos? de pesas?\b/.test(n);
}

// Valor nominal que corresponde imprimir en el acta para una fila: vacio
// si no es una pesa. La fila del historial lleva el valor congelado desde
// que se registro la salida; para las OT anteriores a ese campo se busca
// en el catalogo, que es lo unico que queda.
function valorNominalParaActa(fila){
  if (!fila || !esCategoriaDePesas(fila.categoria)) return "";
  const guardado = String(fila.valorNominal || "").trim();
  if (guardado) return guardado;
  const p = patrones.find(x => x.codigo === fila.codigo);
  return p ? String(p.valorNominal || p.valor || "").trim() : "";
}

// Lo que va en la columna "Equipos" del acta: la categoria y, solo en pesas
// y juegos de pesas, su valor nominal detras ("Pesas M2 de 20 kg - 20 kg").
// Si la pesa no tiene valor escrito en su ficha se deja la categoria tal
// cual, porque no habria nada que añadir.
//
// El recorte a lo ancho de la columna NO se hace aqui sino en la tabla del
// acta, que es la que conoce el ancho: se recorta el nombre y nunca el
// valor, que es justo el dato que se quiere ver.
function textoEquipoActa(fila){
  const categoria = String((fila && fila.categoria) || "").trim();
  const valor = valorNominalParaActa(fila);
  return valor ? categoria + " - " + valor : categoria;
}

// En la OT el encargado se guarda como un solo texto (puede haber mas de
// uno si la salida cruza laboratorios). Este es el separador y su inversa.
const SEP_ENCARGADOS = " · ";
function listaEncargados(texto){
  return String(texto || "").split(SEP_ENCARGADOS).map(s => s.trim()).filter(Boolean);
}

// Texto ya listo para el acta a partir de codigos de patron.
function encargadoParaCodigos(codigos){
  const areas = (codigos || [])
    .map(c => patrones.find(p => p.codigo === c))
    .filter(Boolean)
    .map(p => p.area);
  return encargadosDeLaboratorios(areas).join(SEP_ENCARGADOS);
}
function getCategorias(areaFiltro){
  return catalogProgram.getCategorias(patrones, areaFiltro);
}

// ============================================================// 6.  RENDERIZADO PRINCIPAL
// ============================================================
async function render() {
  return window.Metrologia.modules.appRenderCoordinator.render({
    loadState: async () => {
      const [patterns, technicians, history, activities, clientList] = await Promise.all([
        getAll(STORES.patrones), getAll(STORES.tecnicos), getAll(STORES.historial),
        getAll(STORES.actividades), getAll(STORES.clientes)
      ]);
      return { patterns, technicians, history, activities, clients: clientList };
    },
    compareHistory: (left, right) => {
      const leftKey = claveCronologica(left), rightKey = claveCronologica(right);
      if (leftKey !== rightKey) return leftKey < rightKey ? 1 : -1;
      return String(left.codigo || "").localeCompare(String(right.codigo || ""), "es", { numeric: true });
    },
    applyState: (state) => {
      patrones = state.patterns; tecnicos = state.technicians; historial = state.history;
      actividadesEjecutadas = state.activities; clientes = state.clients;
    },
    updateDispatchHeader: (history) => {
      document.getElementById("hist-count").textContent = history.length;
      const count = Object.values(seleccionados).filter(Boolean).length;
      document.getElementById("sel-count").textContent = count;
      document.getElementById("btn-limpiar").style.display = count > 0 ? "inline-block" : "none";
    },
    renderSelectionSummary: renderResumenSeleccion,
    refreshControls: () => {
      poblarSelectsEstaticos(); mostrarInfoTecnico(); poblarSelectClientes();
      renderAreaTags(); poblarFiltrosCategoria();
    },
    renderDispatchList: () => window.Metrologia.modules.dispatchPatternListRenderer.render({
      document, patterns: patrones, selected: seleccionados, quantities: cantidadesSeleccion,
      filterPatterns: patronesFiltrados, area: filtroAreaSalida, category: filtroCategoria,
      search: busqueda, unavailableStates: ESTADOS_FUERA_DE_USO,
      isCalibrationBlocked: patronBloqueadoPorCalibracion,
      expiredActivities: actividadesVencidas, formatMonth: formatMesISO,
      isGroup: esPatronGrupo, groupHasNoFreeUnits: grupoSinPiezasLibres,
      availabilityDescription: descripcionDisponibilidadGrupo, escapeHTML,
      prepareGroupQuantity: prepararCantidadGrupo, renderApp: render
    }),
    renderScreens: () => {
      renderCatalogoPatrones(); renderHistorial(); renderTecnicos(); renderClientes();
      renderInventario(); renderInicio(); poblarFiltrosPrograma(); renderPrograma();
    },
    updateStorageStatus: actualizarEstadoAlmacenamiento
  });
}

// ============================================================
// 6.b PANEL DE INICIO (SEMAFORO)
// ============================================================
// 6.b. REGLAS OPERATIVAS DE INVENTARIO (modulo js/domain/inventory.js)
// ============================================================
const inventoryDomain = window.Metrologia.modules.inventory;
const {
  ESTADOS_FUERA_DE_USO, MOVIMIENTOS_CERRADOS, movimientoCerrado, esPatronGrupo,
  unidadesDeGrupo, cantidadDeRegistro, estadoTrasMovimiento, diasDesde
} = inventoryDomain;

// Adaptadores temporales: los controladores todavía mantienen el historial
// en memoria. La regla recibe el historial de forma explícita en el módulo.
function unidadesFueraDe(codigo) { return inventoryDomain.unidadesFueraDe(codigo, historial); }
function unidadesDisponiblesDe(patron) { return inventoryDomain.unidadesDisponiblesDe(patron, historial); }
function descripcionDisponibilidadGrupo(patron) { return inventoryDomain.descripcionDisponibilidadGrupo(patron, historial); }
function grupoSinPiezasLibres(patron) { return inventoryDomain.grupoSinPiezasLibres(patron, historial); }
function salidaActivaDe(codigo) { return inventoryDomain.salidaActivaDe(codigo, historial); }

function renderInicio(){
  return window.Metrologia.modules.dashboardRenderer.render({
    patrones,
    historial,
    escapeHTML,
    openActivity: abrirModalCalibracion
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
    const multimetroWrap = document.getElementById("tec-multimetro-wrap");
    multimetroWrap.style.display = tecInfo.multimetro ? "" : "none";
    document.getElementById("tec-multimetro").textContent = tecInfo.multimetro || "";
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
  return window.Metrologia.modules.dispatchSummaryRenderer.render({
    document, patterns: patrones, selected: seleccionados, quantities: cantidadesSeleccion,
    selectedCodes: codigosSeleccionados, isGroup: esPatronGrupo,
    selectedQuantity: cantidadSeleccionadaDe, availableUnits: unidadesDisponiblesDe,
    escapeHTML, renderApp: render, updateCount: actualizarContadorPiezas
  });
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
  return window.Metrologia.modules.clientsRenderer.render({
    clients: clientes,
    history: historial,
    search: busquedaClientes,
    orderedClients: clientesOrdenados,
    normalizeName: normalizarNombre,
    escapeHTML,
    bindButtons: conectarBotonesClientes
  });
}
function conectarBotonesClientes(cont){
  return window.Metrologia.modules.clientsController.bind({
    document, history: historial, STORES, normalizeName: normalizarNombre,
    getClient: getCliente, getSite: getSede, clientNameExists: existeClienteConNombre,
    addSite: agregarSedeACliente, render, confirm: confirmar, notify: avisar,
    saveRecord, deleteRecord,
    clientActions: window.Metrologia.services.clientActions,
    getSelectedSiteId: () => sedeSeleccionadaId,
    setSelectedSiteId: (value) => { sedeSeleccionadaId = value; },
    getSelectedClientId: () => clienteSeleccionadoId,
    setSelectedClientId: (value) => { clienteSeleccionadoId = value; }
  }, cont);
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
  cerrarModalCliente();
}

function abrirModalCliente(){
  const modal = document.getElementById("modal-cliente");
  if (!modal) return;
  document.getElementById("cl-error").style.display = "none";
  document.getElementById("cl-ok").style.display = "none";
  modal.classList.add("open");
  document.getElementById("cl-nombre").focus();
}

function cerrarModalCliente(){
  const modal = document.getElementById("modal-cliente");
  if (modal) modal.classList.remove("open");
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

// Filtros del catálogo delegados al módulo puro; la pantalla conserva su estado local.
function coincideBusqueda(patron, busqueda){
  return catalogProgram.coincideBusqueda(patron, busqueda);
}
function patronesFiltrados(area, categoria, busqueda, soloDisponibles = false){
  return catalogProgram.patronesFiltrados(patrones, area, categoria, busqueda, soloDisponibles);
}

// ============================================================// 7.5. ETIQUETAS DE PATRONES
// ============================================================
function actualizarContadorEtiquetas(){
  const seleccion = Object.keys(seleccionEtiquetas)
    .map(c => patrones.find(p => p.codigo === c))
    .filter(p => p && p.estado !== "Eliminado");
  const n = seleccion.length;
  const missingCodes = seleccion
    .filter(p => !String(p.valorNominal || p.valor || "").trim())
    .map(p => p.codigo);
  const texto = `${n} seleccionado${n === 1 ? "" : "s"}`;
  ["etiquetas-sel-count", "etiquetas-sel-count-compact", "etiquetas-sel-count-modal"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
  });
  if (window.Metrologia.modules.labelsModal) window.Metrologia.modules.labelsModal.updateSelection(n, { missingCodes });
}

function limpiarSeleccionEtiquetas(){
  seleccionEtiquetas = {};
  actualizarContadorEtiquetas();
  renderCatalogoPatrones();
}

function obtenerPatronesSeleccionadosParaEtiqueta(){
  const codigos = Object.keys(seleccionEtiquetas);
  const seleccion = codigos.map(c => patrones.find(p => p.codigo === c)).filter(Boolean).filter(p => p.estado !== "Eliminado");
  if (!seleccion.length) {
    avisar("Selecciona al menos un patrón para generar sus etiquetas.", "info");
    return null;
  }
  const sinValor = seleccion.filter(p => !String(p.valorNominal || "").trim());
  if (sinValor.length) {
    avisar("Hay patrones seleccionados sin valor nominal: " + sinValor.map(p => p.codigo).join(", ") + ".\n\nEdita esos patrones y registra su valor (ej: 500 g, 1 kg, 20 kg) antes de generar las etiquetas.");
    return null;
  }
  return seleccion;
}


// ============================================================
// 7.3 UTILIDADES DE PDF
// ============================================================
// Un solo sitio donde se crea el documento, para no repetir el
// destructuring de window.jspdf en cada informe.
function crearPDF(opciones){
  const { jsPDF } = window.jspdf;
  return new jsPDF(opciones);
}

// Reduce el tamaño de fuente hasta que el texto quepa en el ancho dado.
// En una etiqueta no se puede permitir que el codigo se parta en dos
// lineas: la segunda se montaba encima del valor nominal.
function ajustarFuenteParaAncho(doc, texto, anchoMax, tamInicial, tamMinimo){
  let tam = tamInicial;
  doc.setFontSize(tam);
  while (tam > tamMinimo && doc.getTextWidth(String(texto)) > anchoMax) {
    tam -= 0.5;
    doc.setFontSize(tam);
  }
  return tam;
}

// ============================================================
// 7.4 CODIGO DE BARRAS (Code 128)
//
// Se genera aqui dentro, sin librerias: la app tiene que seguir
// funcionando en un equipo sin internet, y una libreria de barcodes
// mas seria otro archivo que mantener al lado del HTML.
//
// Code 128 es el estandar para codigos alfanumericos de inventario:
// admite letras, digitos y signos, y lo lee cualquier lector laser o
// CCD del mercado. Usamos el subconjunto B (ASCII 32-126) y, cuando el
// codigo es solo digitos en cantidad par, el C, que ocupa la mitad.
// ============================================================

// Adaptadores de compatibilidad para el modulo de Code 128.
const barcodeCode128 = window.Metrologia.modules.barcodeCode128;
const ANCHO_MODULO_MINIMO_MM = barcodeCode128.MIN_MODULE_WIDTH_MM;
function textoCodificableEnCode128(texto){ return barcodeCode128.isEncodable(texto); }
function codificarCode128(texto){
  const barcode = barcodeCode128.encode(texto);
  return barcode ? {
    modulos: barcode.modules.map(item => ({ ancho: item.width, esBarra: item.isBar })),
    totalModulos: barcode.totalModules
  } : null;
}
function anchoModuloDe(texto, anchoDisponibleMM){ return barcodeCode128.moduleWidth(texto, anchoDisponibleMM); }
function dibujarCodigoBarrasPDF(doc, texto, x, y, ancho, alto){ return barcodeCode128.drawPdf(doc, texto, x, y, ancho, alto); }
function svgCodigoBarras(texto, anchoMM, altoMM){ return barcodeCode128.svg(texto, anchoMM, altoMM); }
// Config de cada formato de etiqueta. Al meter el codigo de barras hay que
// repartir la altura: por eso cada formato dice cuanto ocupa la barra y si
// el texto va debajo (vertical) o al lado (horizontal, para la tira de 1 cm).
// "codigoTexto" y "valorTexto" son los tamaños que se usan cuando la
// etiqueta sale SIN barras (ahi el codigo manda y puede ir mas grande).
const FORMATOS_ETIQUETA = {
  '5x2':    { w: 50,  h: 20, codigo: 13, valor: 9,  gap: 2, barras: 6.5, orientacion: 'vertical',   codigoTexto: 20, valorTexto: 14 },
  '9x1':    { w: 90,  h: 10, codigo: 11, valor: 8,  gap: 2, barras: 6,   orientacion: 'horizontal', codigoTexto: 13, valorTexto: 9  },
  '14x3.5': { w: 140, h: 35, codigo: 20, valor: 13, gap: 3, barras: 13,  orientacion: 'vertical',   codigoTexto: 22, valorTexto: 15 }
};
const FORMATOS_ETIQUETA_SIN_BARRAS = {
  '5x2':    { w: 50,  h: 20, codigo: 20, valor: 14, gap: 2 },
  '9x1':    { w: 90,  h: 10, codigo: 13, valor: 9,  gap: 2 },
  '14x3.5': { w: 140, h: 35, codigo: 22, valor: 15, gap: 3 }
};

function formatoEtiquetaElegido(){
  return document.querySelector('input[name="formato-etiqueta"]:checked')?.value || '5x2';
}
function incluirBarrasEnEtiquetas(){
  const chk = document.getElementById("etiqueta-con-barras");
  return chk ? chk.checked : true;
}
// Agrupar por equipos es lo habitual (se reparten por tipo de equipo), pero
// para una tirada de reposicion a veces solo se quieren las etiquetas
// seguidas y aprovechando la hoja al maximo.
const AGRUPAR_ETIQUETAS_KEY = 'metrologia_etiqueta_agrupar';

function agruparEtiquetasPorEquipo(){
  const chk = document.getElementById("etiqueta-agrupar-equipos");
  return chk ? chk.checked : true;
}

function guardarPreferenciaAgrupar(){
  try { localStorage.setItem(AGRUPAR_ETIQUETAS_KEY, agruparEtiquetasPorEquipo() ? '1' : '0'); } catch(e){}
}

function restaurarPreferenciaAgrupar(){
  try {
    const v = localStorage.getItem(AGRUPAR_ETIQUETAS_KEY);
    const chk = document.getElementById("etiqueta-agrupar-equipos");
    if (chk && v !== null) chk.checked = v === '1';
  } catch(e){}
}

// ------------------------------------------------------------
// Medida personalizada.
//
// El papel de etiquetas que se compra no siempre coincide con los tres
// formatos de la lista. Aqui se escriben el ancho y el alto reales del
// rotulo y la app calcula sola el reparto: cuanto ocupa la barra, que
// tamaño de letra cabe y si el texto va debajo o al lado.
// ------------------------------------------------------------
const LIMITES_ETIQUETA = { anchoMin: 1.5, anchoMax: 19, altoMin: 0.6, altoMax: 27, sepMax: 20 };
const MEDIDA_ETIQUETA_KEY = 'metrologia_etiqueta_personalizada';

function leerMedidaPersonalizada(){
  const ancho = parseFloat(document.getElementById("etiqueta-ancho")?.value);
  const alto = parseFloat(document.getElementById("etiqueta-alto")?.value);
  const sepRaw = parseFloat(document.getElementById("etiqueta-separacion")?.value);
  const sep = isNaN(sepRaw) ? 2 : sepRaw;
  const L = LIMITES_ETIQUETA;

  if (isNaN(ancho) || isNaN(alto)) return { error: "Escribe el ancho y el alto de la etiqueta en centímetros." };
  if (ancho < L.anchoMin || ancho > L.anchoMax)
    return { error: `El ancho debe estar entre ${L.anchoMin} y ${L.anchoMax} cm (más ancho no entra en una hoja A4).` };
  if (alto < L.altoMin || alto > L.altoMax)
    return { error: `El alto debe estar entre ${L.altoMin} y ${L.altoMax} cm.` };
  if (sep < 0 || sep > L.sepMax) return { error: `La separación debe estar entre 0 y ${L.sepMax} mm.` };

  return { w: ancho * 10, h: alto * 10, gap: sep, anchoCM: ancho, altoCM: alto };
}

// Reparte una etiqueta de w x h mm. Las proporciones salen de los tres
// formatos ya probados, por eso con 5x2 o 14x3,5 da practicamente lo mismo
// que las constantes de arriba.
function construirConfigPersonalizada(w, h, gap, conBarras){
  const acotar = (v, min, max) => Math.max(min, Math.min(max, v));
  // Por debajo de 14 mm no hay sitio para apilar barra + dos lineas de
  // texto, asi que la barra se pone a la izquierda y el texto al lado.
  const horizontal = h < 14;

  const cfg = {
    w, h, gap,
    orientacion: horizontal ? 'horizontal' : 'vertical',
    barras: horizontal ? acotar(h * 0.60, 4, 10) : acotar(h * 0.35, 5, 20),
    codigo: horizontal ? acotar(h * 1.10, 6, 14) : acotar(h * 0.60, 6, 24),
    valor:  horizontal ? acotar(h * 0.80, 5, 11) : acotar(h * 0.42, 5, 16),
    codigoTexto: acotar(h * 1.00, 7, 26),
    valorTexto:  acotar(h * 0.70, 5, 18)
  };
  if (!conBarras) { cfg.codigo = cfg.codigoTexto; cfg.valor = cfg.valorTexto; }
  return cfg;
}

// Config de la etiqueta que toca imprimir ahora mismo. Devuelve null (y
// avisa) si las medidas escritas a mano no son validas.
function configEtiquetaActual(conBarras){
  const formato = formatoEtiquetaElegido();
  if (formato !== 'personalizado') {
    return conBarras ? FORMATOS_ETIQUETA[formato] : FORMATOS_ETIQUETA_SIN_BARRAS[formato];
  }
  const medida = leerMedidaPersonalizada();
  if (medida.error) { avisar(medida.error, "error"); return null; }
  // Guardamos al generar, no solo al teclear: asi la medida queda
  // recordada aunque los campos se hayan rellenado de otra forma.
  guardarMedidaPersonalizada();
  return construirConfigPersonalizada(medida.w, medida.h, medida.gap, conBarras);
}

// Nombre legible del formato, para el PDF y para el titulo de la vista previa.
function nombreFormatoEtiqueta(cfg){
  const formato = formatoEtiquetaElegido();
  if (formato !== 'personalizado') return formato.replace('.', ',') + ' cm';
  const n = v => String(+(v / 10).toFixed(2)).replace('.', ',');
  return `${n(cfg.w)} × ${n(cfg.h)} cm`;
}

// Nombre del equipo con el que se agrupan las etiquetas. El campo interno
// se sigue llamando "categoria" (no se toca para no migrar la base), pero de
// cara al usuario es "Equipos". Un patron sin equipo cae en un grupo propio
// en vez de mezclarse con el primero de la lista.
function nombreEquipoEtiqueta(p){
  return String((p && p.categoria) || '').trim() || 'Sin equipos';
}

// Cuantas etiquetas entran en una hoja A4 con esta medida.
function etiquetasPorHoja(cfg, margen){
  const util = 210 - margen * 2, utilAlto = 297 - margen * 2;
  const cols = Math.max(1, Math.floor((util + cfg.gap) / (cfg.w + cfg.gap)));
  const filas = Math.max(1, Math.floor((utilAlto + cfg.gap) / (cfg.h + cfg.gap)));
  return { cols, filas, porHoja: cols * filas };
}

// Resumen en pantalla de lo que va a salir con las medidas escritas.
function mostrarInfoMedidaEtiqueta(){
  const caja = document.getElementById("etiqueta-medida-info");
  if (!caja) return;
  const medida = leerMedidaPersonalizada();
  if (medida.error) { caja.textContent = medida.error; caja.style.color = "var(--text-danger)"; return; }

  const conBarras = incluirBarrasEnEtiquetas();
  const cfg = construirConfigPersonalizada(medida.w, medida.h, medida.gap, conBarras);
  const { cols, filas, porHoja } = etiquetasPorHoja(cfg, 5);
  const partes = [`Entran ${porHoja} etiquetas por hoja A4 (${cols} × ${filas}).`];

  if (agruparEtiquetasPorEquipo()) {
    // La franja de cada equipo ocupa una fila de alto aproximado, asi que la
    // cuenta de arriba es el maximo teorico, no lo que saldra de verdad.
    partes.push('Al agrupar por equipos entran algunas menos: la franja de cada grupo '
      + 'ocupa sitio y cada equipo empieza en una fila nueva.');
  }

  if (conBarras) {
    partes.push(cfg.orientacion === 'horizontal'
      ? "Es baja, así que el código de barras irá a la izquierda y el texto al lado."
      : "El código de barras irá arriba y el texto debajo.");
    // Con el codigo mas largo del catalogo vemos si la barra sera legible.
    const anchoUtil = cfg.orientacion === 'horizontal' ? cfg.w * 0.52 - 2 : cfg.w - 6;
    const codigos = patrones.map(p => String(p.codigo || "")).filter(textoCodificableEnCode128);
    const peor = codigos
      .map(c => ({ c, m: anchoModuloDe(c, anchoUtil) }))
      .filter(x => x.m !== null)
      .sort((a, b) => a.m - b.m)[0];
    if (peor) {
      partes.push(peor.m >= ANCHO_MODULO_MINIMO_MM
        ? `Con este ancho todos tus códigos salen legibles (el más largo, ${peor.c}, queda en ${peor.m.toFixed(2)} mm de barra).`
        : `Atención: el código más largo (${peor.c}) quedaría en ${peor.m.toFixed(2)} mm de barra, por debajo de los ${ANCHO_MODULO_MINIMO_MM} mm que necesita un lector. Ensancha la etiqueta o imprime esos aparte.`);
    }
  }
  caja.textContent = partes.join(" ");
  caja.style.color = "var(--text-secondary)";
}

function alternarMedidaPersonalizada(){
  const caja = document.getElementById("etiqueta-personalizada");
  if (!caja) return;
  const activa = formatoEtiquetaElegido() === 'personalizado';
  caja.style.display = activa ? "block" : "none";
  if (activa) mostrarInfoMedidaEtiqueta();
}

function guardarMedidaPersonalizada(){
  try {
    localStorage.setItem(MEDIDA_ETIQUETA_KEY, JSON.stringify({
      ancho: document.getElementById("etiqueta-ancho").value,
      alto: document.getElementById("etiqueta-alto").value,
      separacion: document.getElementById("etiqueta-separacion").value
    }));
  } catch(e){}
}

function restaurarMedidaPersonalizada(){
  try {
    const guardado = JSON.parse(localStorage.getItem(MEDIDA_ETIQUETA_KEY) || "null");
    if (!guardado) return;
    if (guardado.ancho) document.getElementById("etiqueta-ancho").value = guardado.ancho;
    if (guardado.alto) document.getElementById("etiqueta-alto").value = guardado.alto;
    if (guardado.separacion) document.getElementById("etiqueta-separacion").value = guardado.separacion;
  } catch(e){}
}

// Avisa de los codigos que no se pueden codificar o que saldrian con las
// barras demasiado finas para el lector.
function revisarLegibilidadBarras(datos, cfg){
  const anchoUtil = cfg.orientacion === 'horizontal' ? cfg.w * 0.52 - 2 : cfg.w - 6;
  const noCodificables = [], demasiadoFinos = [];
  datos.forEach(p => {
    const codigo = String(p.codigo || "");
    if (!textoCodificableEnCode128(codigo)) { noCodificables.push(codigo); return; }
    const m = anchoModuloDe(codigo, anchoUtil);
    if (m !== null && m < ANCHO_MODULO_MINIMO_MM) demasiadoFinos.push(codigo);
  });
  return { noCodificables, demasiadoFinos };
}

function descargarEtiquetasPDF(){
  return window.Metrologia.modules.labelReport.downloadLabels({
    selection: seleccionEtiquetas, patrones, includeBars: incluirBarrasEnEtiquetas,
    getConfig: configEtiquetaActual, formatName: nombreFormatoEtiqueta,
    groupByEquipment: agruparEtiquetasPorEquipo, equipmentName: nombreEquipoEtiqueta,
    checkBarcodeLegibility: revisarLegibilidadBarras, labelsPerPage: etiquetasPorHoja,
    createPdf: crearPDF, drawLabel: dibujarEtiquetaEnPDF, avisar
  });
}

// Una sola etiqueta dentro del PDF. Separada para que los dos formatos
// (barra arriba con texto debajo, o barra a la izquierda con texto al lado)
// no se mezclen con la logica de paginacion.
function dibujarEtiquetaEnPDF(doc, p, x, y, cfg, conBarras){
  return window.Metrologia.modules.labelPdfRenderer.draw({
    fitFont: ajustarFuenteParaAncho,
    isBarcodeEncodable: textoCodificableEnCode128,
    drawBarcode: dibujarCodigoBarrasPDF
  }, doc, p, x, y, cfg, conBarras);
}

function imprimirEtiquetasSeleccionadas(){
  return window.Metrologia.modules.labelPrint.printLabels({
    getSelectedPatterns: obtenerPatronesSeleccionadosParaEtiqueta,
    includeBarcodes: incluirBarrasEnEtiquetas,
    currentConfig: configEtiquetaActual,
    formatName: nombreFormatoEtiqueta,
    groupByEquipment: agruparEtiquetasPorEquipo,
    labelsPerPage: etiquetasPorHoja,
    isBarcodeEncodable: textoCodificableEnCode128,
    barcodeSvg: svgCodigoBarras,
    equipmentName: nombreEquipoEtiqueta,
    escapeHTML,
    notify: avisar
  });
}

// ============================================================
// 7.6 LECTOR DE CODIGO DE BARRAS
//
// Los lectores de codigo de barras USB son "keyboard wedge": el sistema
// los ve como un teclado que teclea el codigo muy rapido y termina con
// Enter (algunos con Tab). No hay driver ni permiso que pedir; hay que
// distinguir esa rafaga de una persona escribiendo.
//
// Se detecta por velocidad: nadie teclea 20 caracteres seguidos con menos
// de 50 ms entre teclas. En cuanto la rafaga se confirma, tragamos las
// teclas para que no se cuelen en el campo que tenga el foco, y al final
// limpiamos los primeros caracteres que alcanzaron a escribirse.
//
// El modo manual NUNCA se toca: el campo de escaneo acepta que escribas
// el codigo y pulses Enter, y los botones y casillas de siempre siguen ahi.
// ============================================================
const ESCANER_MS_ENTRE_TECLAS = 50;   // por encima de esto, es una persona
const ESCANER_MIN_CARACTERES  = 3;    // rafagas mas cortas no son un codigo
const ESCANER_MS_REINICIO     = 300;  // pausa que da por terminada la rafaga
const ESCANER_SONIDO_KEY      = 'metrologia_escaner_sonido';

// ------------------------------------------------------------
// Distribucion de teclado: por que "PT-TCDG-07" se leia "PT'TCDG'07".
//
// El lector no envia caracteres, envia POSICIONES de tecla de un teclado
// americano. Windows las traduce con la distribucion activa, y recuerda el
// idioma de entrada por VENTANA: de ahi que en Chrome saliera bien y en
// Edge mal en el mismo equipo. En la distribucion española, la tecla que
// en la americana da "-" da "'", y la que da "/" da "-".
//
// La solucion es no fiarse del caracter (event.key) y reconstruirlo de la
// tecla fisica (event.code), que es igual en cualquier distribucion. Se
// guardan las dos lecturas y gana la que encuentre un patron de verdad,
// asi que tambien funciona si el lector SI esta configurado en español.
// ------------------------------------------------------------
const utilidadesEscaner = window.Metrologia.modules.scannerUtilities.create({
  findPattern: buscarPatronPorCodigoEscaneado,
  notify: avisar,
  soundStorageKey: ESCANER_SONIDO_KEY
});

function charDesdeTeclaFisica(e){ return utilidadesEscaner.readPhysicalKey(e); }

// De las lecturas posibles, gana la que identifique un patron. Primero se
// busca una coincidencia EXACTA; solo si ninguna la logra se acepta la
// aproximada, para no quedarnos con el texto mal traducido por casualidad.
let avisoDistribucionMostrado = false;

function resolverCodigoLeido(candidatos){ return utilidadesEscaner.resolveCode(candidatos); }

// Si lo que se ha usado no es lo que el navegador escribio, es que la
// distribucion de teclado no coincide con el lector. Se explica una vez.
function anunciarSiCambio(elegido, loQueEscribioElNavegador){
  if (elegido !== loQueEscribioElNavegador && !avisoDistribucionMostrado) {
    avisoDistribucionMostrado = true;
    avisar(
      `El lector funciona, pero este navegador está traduciendo sus teclas con otra distribución ` +
      `de teclado: escribió "${loQueEscribioElNavegador}" en vez de "${elegido}". La app lo corrige sola. ` +
      `Si quieres quitarlo de raíz, pon el idioma de entrada de Windows en inglés (EE. UU.) en esta ventana, ` +
      `o configura el lector para teclado español.`,
      "info"
    );
  }
  return elegido;
}

function sonidoEscanerActivo(){ return utilidadesEscaner.isSoundEnabled(); }
function fijarSonidoEscaner(activo){ return utilidadesEscaner.setSoundEnabled(activo); }

// Aviso sonoro: en el laboratorio se escanea mirando el patron, no la
// pantalla. Un pitido agudo = entro; uno grave y largo = algo falla.
function pitido(tipo){ return utilidadesEscaner.beep(tipo); }

// --- Normalizacion y busqueda del patron leido ---
function normalizarCodigoEscaneado(texto){
  return String(texto || "").trim().replace(/\s+/g, " ").toUpperCase();
}
// Version "plana": sin guiones, espacios ni puntuacion. Sirve de red por si
// la etiqueta se imprimio con separadores distintos a los del catalogo.
function clavePlanaCodigo(texto){
  return normalizarCodigoEscaneado(texto).replace(/[^A-Z0-9]/g, "");
}

// Busca el patron leido. Devuelve { patron, ambiguos, coincidencia }.
// Prueba, en orden: codigo exacto, serie exacta, codigo plano, serie plana.
// Solo baja al siguiente nivel si el anterior no dio nada, y si un nivel da
// varios resultados se considera ambiguo en vez de elegir al azar.
function buscarPatronPorCodigoEscaneado(leido, soloExacto = false){
  const exacto = normalizarCodigoEscaneado(leido);
  const plano = clavePlanaCodigo(leido);
  if (!exacto) return { patron: null, ambiguos: [], coincidencia: null };

  const niveles = [
    { nombre: "codigo", test: p => normalizarCodigoEscaneado(p.codigo) === exacto },
    { nombre: "serie",  test: p => p.serie && normalizarCodigoEscaneado(p.serie) === exacto }
  ];
  // Los niveles aproximados (ignorando guiones y espacios) son la red de
  // seguridad; al comparar dos lecturas de un mismo escaneo se piden solo
  // los exactos, para que gane la lectura bien traducida.
  if (!soloExacto) niveles.push(
    { nombre: "codigo aproximado", test: p => plano && clavePlanaCodigo(p.codigo) === plano },
    { nombre: "serie aproximada",  test: p => p.serie && plano && clavePlanaCodigo(p.serie) === plano }
  );

  for (const nivel of niveles) {
    const hallados = patrones.filter(nivel.test);
    if (hallados.length === 1) return { patron: hallados[0], ambiguos: [], coincidencia: nivel.nombre };
    if (hallados.length > 1) return { patron: null, ambiguos: hallados, coincidencia: nivel.nombre };
  }
  return { patron: null, ambiguos: [], coincidencia: null };
}

// --- Captura global de la rafaga del lector ---
// A que pantalla va lo escaneado. Se calcula en el momento de la lectura:
// asi el mismo lector sirve para la salida y para la devolucion sin que
// haya que cambiar de "modo" a mano.
function destinoEscaneoActivo(){
  const modalDev = document.getElementById("modal-devolucion");
  if (modalDev && modalDev.classList.contains("open")) return procesarEscaneoDevolucion;

  const hayOtroModal = Array.from(document.querySelectorAll(".modal-overlay"))
    .some(m => m.classList.contains("open"));
  if (hayOtroModal) return null;

  const panelSalida = document.getElementById("panel-salida");
  if (panelSalida && panelSalida.style.display !== "none") return procesarEscaneoSalida;
  return null;
}

// Si la rafaga empezo con el foco en un campo de texto, los primeros
// caracteres alcanzaron a escribirse antes de que la detectaramos. Los
// quitamos para no dejar basura en el buscador o en el numero de OT.
function limpiarFugaEnCampo(elemento, textoFugado){
  if (!elemento || !textoFugado || typeof elemento.value !== "string") return;
  const valor = elemento.value;
  const fin = valor.slice(-textoFugado.length);
  if (fin.toUpperCase() === textoFugado.toUpperCase()) {
    elemento.value = valor.slice(0, valor.length - textoFugado.length);
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

const manejadorLectorGlobal = window.Metrologia.modules.scannerGlobalHandler.create({
  getDestination: destinoEscaneoActivo,
  clearLeakedInput: limpiarFugaEnCampo,
  resolveCode: resolverCodigoLeido,
  readPhysicalKey: charDesdeTeclaFisica,
  minCharacters: ESCANER_MIN_CARACTERES,
  burstKeyIntervalMs: ESCANER_MS_ENTRE_TECLAS,
  restartMs: ESCANER_MS_REINICIO
});

function manejarTeclaLector(e){
  return manejadorLectorGlobal.handle(e);
}

// --- Procesamiento de un escaneo en la pantalla de SALIDA ---
function procesarEscaneoSalida(codigoLeido){
  return window.Metrologia.services.dispatchScanActions.processDispatchScan({
    document, selected: seleccionados, findScannedPattern: buscarPatronPorCodigoEscaneado,
    beep: pitido, notify: avisar, unavailableStates: ESTADOS_FUERA_DE_USO,
    groupHasNoFreeUnits: grupoSinPiezasLibres, groupUnits: unidadesDeGrupo,
    activeDispatchOf: salidaActivaDe, isCalibrationBlocked: patronBloqueadoPorCalibracion,
    expiredActivities: actividadesVencidas, formatMonth: formatMesISO,
    isGroup: esPatronGrupo, prepareGroupQuantity: prepararCantidadGrupo,
    availableUnits: unidadesDisponiblesDe, render
  }, codigoLeido);
}

// ============================================================
// 7.  CATÁLOGO DE PATRONES (con filtro de estado y eliminación mejorada)
// ============================================================
function renderCatalogoPatrones(){
  return window.Metrologia.modules.catalogRenderer.render({
    patrones, filtroAreaCatalogo, seleccionEtiquetas, escapeHTML,
    getActividades, ACTIVIDADES_ISO, estadoActividad, formatMesISO,
    coincideBusqueda, estadoCalibracion, conectarBotonesCatalogo
  });
}
function formularioEdicionPatronHTML(p){
  return window.Metrologia.modules.patternFormRenderer.render(p, {
    getActividades, TIPOS_POR_ACTIVIDAD, escapeHTML, esPatronGrupo,
    unidadesDeGrupo, descripcionDisponibilidadGrupo, ACTIVIDADES_ISO
  });
}

// Abre (rellenando bajo demanda) el formulario de edicion de un patron.
function abrirFormularioEdicion(codigo){
  return window.Metrologia.modules.patternFormRenderer.open({
    document, patterns: patrones, renderForm: formularioEdicionPatronHTML,
    saveEdition: guardarEdicionPatron
  }, codigo);
}

function conectarBotonesCatalogo(lista2){
  return window.Metrologia.modules.catalogProgramController.bindCatalogActions({
    patrones, historial, actividadesEjecutadas, seleccionados, seleccionEtiquetas,
    STORES, runAtomicTransaction, saveRecord, render, confirmar, avisar,
    restaurarRegistros, actualizarContadorEtiquetas, abrirModalEliminarTotal,
    abrirModalCalibracion, abrirFormularioEdicion, abrirFichaPatron,
    duplicarPatron,
    destructiveActions: window.Metrologia.services.destructiveActions
  }, lista2);
}

async function guardarEdicionPatron(codigoOriginal, form){
  return window.Metrologia.services.patternActions.savePatternEdition({
    codigoOriginal, form, normalizarCodigoPatron, actividadVacia,
    patrones, unidadesFueraDe, historial, actividadesEjecutadas, STORES,
    runAtomicTransaction, seleccionados, seleccionEtiquetas, render
  });
}

// ============================================================
// 7.a PROGRAMA ANUAL (CALENDARIO)
//
// Reproduce en pantalla el formato del programa FO-LAB-6-1: una fila
// por patron y actividad, doce columnas de meses. Cada celda muestra
// la marca de la actividad (CI/CE, V, M) coloreada segun su estado:
//   - Realizado: hay una ejecucion registrada ese mes
//   - Programado / Vence este mes / Vencido: segun el mes de vencimiento
// Al hacer clic en una celda se abre el registro de esa actividad.
// ============================================================
const { MESES_CORTOS } = catalogProgram;
function aniosDisponiblesPrograma(){
  return catalogProgram.aniosDisponiblesPrograma(patrones, actividadesEjecutadas);
}
function celdasAnioActividad(patron, clave, anio){
  return catalogProgram.celdasAnioActividad(patron, clave, anio, actividadesEjecutadas);
}
function poblarFiltrosPrograma(){
  const selAnio = document.getElementById("prog-anio");
  const anios = aniosDisponiblesPrograma();
  const anterior = selAnio.value;
  selAnio.innerHTML = anios.map(a => `<option value="${a}">Año ${a}</option>`).join("");
  selAnio.value = anios.includes(Number(anterior)) ? anterior : String(new Date().getFullYear());
  if (!selAnio.value) selAnio.value = String(anios[anios.length-1]);

  const selArea = document.getElementById("prog-area");
  const areas = getAreas();
  const areaAnterior = selArea.value;
  selArea.innerHTML = `<option value="Todas">Todos los laboratorios</option>` +
    areas.map(a => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`).join("");
  if (areaAnterior && (areaAnterior === "Todas" || areas.includes(areaAnterior))) selArea.value = areaAnterior;
}

function renderPrograma(){
  return window.Metrologia.modules.programRenderer.render({
    document, patterns: patrones, activities: ACTIVIDADES_ISO,
    shortMonths: MESES_CORTOS, cellsForActivity: celdasAnioActividad,
    escapeHTML, openCalibration: abrirModalCalibracion
  });
}

function descargarProgramaPDF(){
  return window.Metrologia.modules.programReport.downloadProgram({
    anio: Number(document.getElementById("prog-anio").value) || new Date().getFullYear(),
    area: document.getElementById("prog-area").value,
    activityFilter: document.getElementById("prog-actividad").value,
    ACTIVIDADES_ISO, patrones, celdasAnioActividad, MESES_CORTOS,
    createPdf: crearPDF, avisar
  });
}

// ============================================================
// 7.b FICHA / HOJA DE VIDA DEL PATRON
//
// Reune en un solo lugar todo lo que la ISO 17025 pide poder
// demostrar de un equipo (6.4.13): identificacion, estado,
// programa de actividades, historial COMPLETO de calibraciones
// ejecutadas con su documento y fecha, y los servicios en los
// que se uso. Este ultimo bloque es la "trazabilidad inversa":
// si un patron vuelve fuera de tolerancia, hay que saber a que
// servicios afecto desde su última calibración válida (7.10).
// ============================================================
let fichaCodigoActual = null;

const historyDomain = window.Metrologia.modules.history;
const historyOrdering = window.Metrologia.modules.historyOrdering;
const paginationDomain = window.Metrologia.modules.pagination;
function actividadesDePatron(codigo){ return historyDomain.actividadesDePatron(actividadesEjecutadas, codigo); }
function salidasDePatron(codigo){ return historyDomain.salidasDePatron(historial, codigo); }
function ultimaCalibracionDe(patron){ return historyDomain.ultimaCalibracionDe(patron, actividadesEjecutadas); }
function serviciosDesdeUltimaCalibracion(patron){ return historyDomain.serviciosDesdeUltimaCalibracion(patron, historial, actividadesEjecutadas); }
function abrirFichaPatron(codigo){
  const opened = window.Metrologia.modules.patternDetailRenderer.open({
    document, patterns: patrones, getActivities: getActividades,
    activitiesOfPattern: actividadesDePatron, dispatchesOfPattern: salidasDePatron,
    servicesSinceLastCalibration: serviciosDesdeUltimaCalibracion,
    lastCalibrationOf: ultimaCalibracionDe, activities: ACTIVIDADES_ISO,
    activityState: estadoActividad, calibrationTypeLabel: etiquetaTipoCal,
    formatMonth: formatMesISO, formatDate: formatFecha, escapeHTML,
    recordQuantity: cantidadDeRegistro
  }, codigo);
  if (opened) fichaCodigoActual = codigo;
}

function cerrarFichaPatron(){
  fichaCodigoActual = null;
  document.getElementById("modal-ficha").classList.remove("open");
}

function descargarFichaPDF(){
  return window.Metrologia.modules.patternSheetReport.downloadPatternSheet({
    patrones, getActividades, activitiesOfPattern: actividadesDePatron,
    dispatchesOfPattern: salidasDePatron, lastCalibrationOf: ultimaCalibracionDe,
    ACTIVIDADES_ISO, estadoActividad, formatMesISO, formatFecha, createPdf: crearPDF
  }, fichaCodigoActual);
}

// ------------------------------------------------------------
// Modal de confirmacion para borrado total (patron + historial)
// ------------------------------------------------------------
function abrirModalEliminarTotal(codigo, tipo = 'patron'){
  modalEliminarCodigoObjetivo = codigo;
  modalEliminarTipo = tipo;
  const titulo = document.querySelector("#modal-eliminar-total h3");
  const descPrefijo = document.getElementById("modal-desc-prefijo");
  const descSufijo = document.getElementById("modal-desc-sufijo");
  const labelInput = document.querySelector("#modal-eliminar-total label.field-label");
  if (tipo === 'tecnico') {
    titulo.textContent = "Eliminar tecnico y su historial";
    descPrefijo.textContent = "Vas a eliminar de forma irreversible al tecnico";
    descSufijo.textContent = "y todos los registros de historial donde aparece. Esta acción no se puede deshacer.";
    labelInput.textContent = "Escribe el nombre del tecnico para confirmar";
    document.getElementById("modal-confirm-input").placeholder = "Nombre del tecnico";
  } else {
    titulo.textContent = "Eliminar patrón y su historial";
    descPrefijo.textContent = "Vas a eliminar de forma irreversible el patrón";
    descSufijo.textContent = "y todos los registros de historial donde aparece. Esta acción no se puede deshacer.";
    labelInput.textContent = "Escribe el código del patrón para confirmar";
    document.getElementById("modal-confirm-input").placeholder = "Codigo del patron";
  }
  document.getElementById("modal-codigo-nombre").textContent = codigo;
  document.getElementById("modal-confirm-input").value = "";
  document.getElementById("modal-confirm-error").style.display = "none";
  document.getElementById("modal-confirmar").disabled = true;
  document.getElementById("modal-eliminar-total").classList.add("open");
  document.getElementById("modal-confirm-input").focus();
}

function abrirModalEliminarTecnicoTotal(nombre){
  abrirModalEliminarTotal(nombre, 'tecnico');
}

function cerrarModalEliminarTotal(){
  modalEliminarCodigoObjetivo = null;
  modalEliminarTipo = null;
  document.getElementById("modal-eliminar-total").classList.remove("open");
}

// ------------------------------------------------------------
// Modal de registro de calibracion
// ------------------------------------------------------------
function actualizarPreviewCalibracion(){
  return window.Metrologia.modules.calibrationModal.updatePreview({
    document, addMonths: sumarMesesAMes, formatMonth: formatMesISO
  });
}

function cargarDatosActividadEnModal(){
  return window.Metrologia.modules.calibrationModal.loadActivity({
    document, patterns: patrones, getActivities: getActividades,
    activityTypes: TIPOS_POR_ACTIVIDAD, updatePreview: actualizarPreviewCalibracion
  }, modalCalibracionCodigoObjetivo);
}

function abrirModalCalibracion(codigo, claveInicial = "CAL"){
  return window.Metrologia.modules.calibrationModal.open({
    document, patterns: patrones, today: todayISO,
    loadActivity: cargarDatosActividadEnModal,
    setTargetCode: (code) => { modalCalibracionCodigoObjetivo = code; }
  }, codigo, claveInicial);
}

function cerrarModalCalibracion(){
  modalCalibracionCodigoObjetivo = null;
  document.getElementById("modal-calibracion").classList.remove("open");
  actualizarContadorEtiquetas();
}

// ============================================================
// 8.  RENDERIZADO DEL HISTORIAL
// ============================================================
function renderHistorial(){
  const histBox = window.Metrologia.modules.historyRenderer.render({
    historial, busquedaHistorial, escapeHTML, agruparPorOT,
    etiquetaCantidad, observacionHTML, numeroDeServicio, formatFecha,
    sortHistoryGroups: groups => historyOrdering.sort(groups, ordenHistorial), pagination: paginationDomain,
    historyPage: paginaHistorial,
    changeHistoryPage: page => { paginaHistorial = page; renderHistorial(); },
    syncHistoryPage: page => { paginaHistorial = page; }
  });
  return window.Metrologia.modules.historyController.bindEntryActions({
    historial, patrones, cantidadDeRegistro, unidadesFueraDe, estadoTrasMovimiento,
    STORES, runAtomicTransaction, claveSalida, seleccionados,
    prepareNewService: () => {
      filtroAreaSalida = "Todas"; filtroCategoria = "Todas";
      document.getElementById("buscar").value = ""; busqueda = "";
    },
    render, activarTab, abrirModalObservacion, abrirModalEditarOT,
    descargarActaPDF, eliminarOT, avisar,
    returnActions: window.Metrologia.services.returnActions
  }, histBox);
}

// ------------------------------------------------------------
// Modal de observaciones. Tres usos, un solo modal:
//   1. Observacion sobre un patron concreto de una OT.
//   2. Observacion sobre la OT completa.
//   3. Correccion de una devolucion equivocada (obliga a escribir el
//      motivo y ademas reabre el movimiento).
// ------------------------------------------------------------
let obsDestino = null;

function abrirModalObservacion({ registroId = null, salidaId = null, correccion = false, destino = "interno", editarObservacionId = null }){
  obsDestino = { registroId, salidaId, correccion, destino, editarObservacionId };
  return window.Metrologia.modules.observationModal.open({
    document, history: historial, dispatchKey: claveSalida,
    serviceNumber: numeroDeServicio, formatDate: formatFecha, escapeHTML
  }, obsDestino);
}

function cerrarModalObservacion(){
  document.getElementById("modal-observacion").classList.remove("open");
  obsDestino = null;
}

async function guardarObservacion(){
  return window.Metrologia.services.returnActions.saveObservation({
    obsDestino, historial, patrones, nuevaObservacion, STORES, claveSalida,
    runAtomicTransaction, cerrarModalObservacion, render, avisar
  });
}

// ============================================================
// 8.b2 DEVOLUCION POR ESCANER
//
// Un tecnico vuelve del cliente con quince patrones en el maletin. Antes
// habia que buscar cada uno en su OT del historial y pulsar "Marcar
// devuelto" quince veces. Aqui se escanean todos seguidos, se revisa la
// lista y se confirma de una vez, en una sola transaccion.
//
// Nada se escribe hasta confirmar: un escaneo de mas se quita de la lista
// y ya esta, sin haber tocado el registro.
// ============================================================
let devolucionPendiente = [];   // [{ registroId, codigo }]

function abrirModalDevolucion(){
  devolucionPendiente = [];
  document.getElementById("escaneo-devolucion").value = "";
  const eco = document.getElementById("escaneo-devolucion-eco");
  eco.textContent = ""; eco.className = "escaneo-eco";
  renderListaDevolucion();
  document.getElementById("modal-devolucion").classList.add("open");
  setTimeout(() => document.getElementById("escaneo-devolucion").focus(), 60);
}

function cerrarModalDevolucion(){
  document.getElementById("modal-devolucion").classList.remove("open");
  devolucionPendiente = [];
}

function renderListaDevolucion(){
  return window.Metrologia.modules.returnListRenderer.render({
    document, pending: devolucionPendiente, history: historial,
    daysSince: diasDesde, recordQuantity: cantidadDeRegistro,
    escapeHTML, rerender: renderListaDevolucion
  });
}

function procesarEscaneoDevolucion(codigoLeido){
  return window.Metrologia.services.returnScanActions.processReturnScan({
    document, pending: devolucionPendiente,
    findScannedPattern: buscarPatronPorCodigoEscaneado,
    activeDispatchOf: salidaActivaDe, dispatchesOfPattern: salidasDePatron,
    recordQuantity: cantidadDeRegistro, beep: pitido,
    renderList: renderListaDevolucion
  }, codigoLeido);
}

async function confirmarDevolucionMasiva(){
  return window.Metrologia.services.returnActions.confirmBulkReturn({
    devolucionPendiente, historial, movimientoCerrado, avisar,
    cerrarModalDevolucion, render, cantidadDeRegistro, nuevaObservacion,
    STORES, patrones, unidadesFueraDe, estadoTrasMovimiento,
    runAtomicTransaction
  });
}

// ============================================================
// 8.c CORRECCION DE UNA OT YA REGISTRADA
//
// Equivocarse al registrar pasa: el tecnico que no era, el cliente de al
// lado, un patron marcado de mas o de menos. Antes la unica salida era
// borrar la OT entera y volver a escribirla, perdiendo el rastro.
//
// Aqui se corrige en su sitio, con dos reglas que vienen de ISO 17025:
//   - Nada se reescribe en silencio: cada cambio se anota con su antes y
//     su despues, la fecha, quien lo hizo y el motivo (obligatorio).
//   - Un patron retirado no se borra: queda "Anulado" en la OT, visible y
//     tachado, porque en realidad nunca salio del laboratorio.
// ============================================================
let edicionOT = null;

function abrirModalEditarOT(salidaId){
  return window.Metrologia.modules.orderEditorModal.open({
    document, history: historial, dispatchKey: claveSalida, clients: clientes,
    normalizeName: normalizarNombre, serviceNumber: numeroDeServicio,
    localTimeFromIso: horaLocalDeISO, populateSelects: poblarSelectsEdicionOT,
    renderPatterns: renderPatronesEdicionOT,
    setEdition: (edition) => { edicionOT = edition; }
  }, salidaId);
}

function cerrarModalEditarOT(){
  document.getElementById("modal-editar-ot").classList.remove("open");
  edicionOT = null;
}

function poblarSelectsEdicionOT(){
  if (!edicionOT) return;
  const reg = edicionOT.registros[0];

  // Tecnicos: los activos, mas el de la OT aunque ya este inactivo (si no,
  // abrir la correccion de una OT vieja borraria a su tecnico sin querer).
  const tecSel = document.getElementById("edit-ot-tecnico");
  const nombres = tecnicosActivos().map(t => t.nombre);
  if (reg.tecnico && !nombres.includes(reg.tecnico)) nombres.push(reg.tecnico + "");
  tecSel.innerHTML = '<option value="">Sin técnico asignado</option>' +
    nombres.sort((a, b) => a.localeCompare(b, "es")).map(n =>
      `<option value="${escapeHTML(n)}">${escapeHTML(n)}${tecnicos.some(t => t.nombre === n) ? "" : " (ya no registrado)"}</option>`).join("");
  tecSel.value = reg.tecnico || "";
  mostrarInfoTecnicoEdicion();

  const cliSel = document.getElementById("edit-ot-cliente");
  cliSel.innerHTML = '<option value="">Sin empresa enlazada</option>' +
    clientesOrdenados().map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.nombre)}</option>`).join("");
  cliSel.value = edicionOT.clienteId || "";
  poblarSelectSedesEdicionOT();
}

function poblarSelectSedesEdicionOT(){
  if (!edicionOT) return;
  const sel = document.getElementById("edit-ot-sede");
  const cliente = getCliente(edicionOT.clienteId);
  const sedes = cliente && Array.isArray(cliente.sedes) ? cliente.sedes : [];

  if (!cliente) {
    sel.innerHTML = '<option value="">Elige primero la empresa</option>';
    sel.disabled = true;
    edicionOT.sedeId = "";
    return;
  }
  sel.disabled = false;
  if (edicionOT.sedeId && !getSede(cliente, edicionOT.sedeId)) edicionOT.sedeId = "";
  sel.innerHTML = '<option value="">' + (sedes.length ? "Sin sede indicada" : "Esta empresa no tiene sedes") + '</option>' +
    sedes.map(s => {
      const dir = String(s.direccion || "").trim();
      return `<option value="${escapeHTML(s.id)}">${escapeHTML(dir ? s.nombre + " — " + dir : s.nombre)}</option>`;
    }).join("");
  sel.value = edicionOT.sedeId || "";
}

function mostrarInfoTecnicoEdicion(){
  const nombre = document.getElementById("edit-ot-tecnico").value;
  const t = tecnicos.find(x => x.nombre === nombre);
  const caja = document.getElementById("edit-ot-tecnico-info");
  caja.textContent = t
    ? `Se actualizarán también sus equipos: laptop ${t.laptop || "-"}, termohigrómetro ${t.termohigrometro || "-"}${t.multimetro ? `, multímetro ${t.multimetro}` : ""}.`
    : "";
}

function renderPatronesEdicionOT(){
  return window.Metrologia.modules.orderEditorRenderer.renderPatterns({
    document, edition: edicionOT, patterns: patrones, isMovementClosed: movimientoCerrado,
    quantityLabel: etiquetaCantidad, escapeHTML,
    rerenderPatterns: renderPatronesEdicionOT, rerenderSearch: renderBusquedaEdicionOT
  });
}

function renderBusquedaEdicionOT(){
  return window.Metrologia.modules.orderEditorRenderer.renderSearch({
    document, edition: edicionOT, patterns: patrones,
    unavailableStates: ESTADOS_FUERA_DE_USO, matchesSearch: coincideBusqueda,
    calibrationBlocked: patronBloqueadoPorCalibracion, isGroup: esPatronGrupo,
    availableUnits: unidadesDisponiblesDe, escapeHTML,
    rerenderPatterns: renderPatronesEdicionOT, rerenderSearch: renderBusquedaEdicionOT
  });
}

// Calcula, campo por campo, que cambio de verdad. Solo con esto decidimos
// si hay algo que guardar y que texto queda escrito en la trazabilidad.
function calcularCambiosOT(){
  return window.Metrologia.modules.orderEdit.calculateChanges({
    document, edition: edicionOT, getClient: getCliente, getSite: getSede,
    formatDate: formatFecha, localTimeFromIso: horaLocalDeISO,
    laboratoryManagerForCodes: encargadoParaCodigos
  });
}

async function guardarEdicionOT(){
  return window.Metrologia.services.orderActions.saveOrderEdition({
    edicionOT, calcularCambiosOT, patrones, patronBloqueadoPorCalibracion,
    nuevaObservacion, tecnicos, isoDesdeFechaHoraLocal, nuevoId,
    esPatronGrupo, unidadesDeGrupo, STORES, historial, movimientoCerrado,
    cantidadDeRegistro, estadoTrasMovimiento, runAtomicTransaction,
    cerrarModalEditarOT, render, avisar
  });
}

async function eliminarOT(salidaId) {
  return window.Metrologia.services.orderActions.deleteDispatch({
    historial, claveSalida, avisar, numeroDeServicio, confirmar, formatFecha,
    patrones, STORES, runAtomicTransaction, render, restaurarRegistros
  }, salidaId);
}

// Identidad de una SALIDA concreta.
//
// Un mismo numero de OT puede dar pie a varios servicios: el mismo cliente
// pide otra cosa el mismo dia, a veces con el mismo tecnico. Antes el
// historial agrupaba por numero de OT + fecha, asi que esa segunda salida
// se metia dentro del registro anterior y las dos acababan en una sola acta.
//
// Ahora cada llamada a registrarSalida sella sus filas con un "salidaId"
// propio y es ESE el que agrupa. Las filas anteriores a este cambio no lo
// llevan: para ellas se usa la clave de siempre, de modo que el historial
// que ya existe se sigue viendo exactamente igual.
function claveSalida(registro){ return historyDomain.claveSalida(registro); }
function numeroDeServicio(salidaId){ return historyDomain.numeroDeServicio(historial, salidaId); }
function agruparPorOT(registros){ return historyDomain.agruparPorOT(registros, encargadosDeLaboratorios, SEP_ENCARGADOS); }

// ------------------------------------------------------------// Observaciones del historial (append-only).
//
// El historial no se edita ni se borra: si hubo un error (por ejemplo
// marcar "devuelto" un patron que sigue donde el cliente), se ANOTA
// la correccion con su fecha y hora y, cuando toca, se reabre el
// movimiento. Asi el registro original nunca se falsea, que es lo que
// exige ISO 17025 para los registros tecnicos.
// ------------------------------------------------------------
function nuevaObservacion(datos){ return historyDomain.nuevaObservacion(datos, nuevoId); }
function etiquetaCantidad(registro){ return historyDomain.etiquetaCantidad(registro); }
function observacionHTML(o){
  const cuando = o.fechaHora
    ? new Date(o.fechaHora).toLocaleString("es-PE", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"})
    : "";
  const quien = o.autor ? " · " + escapeHTML(o.autor) : "";
  const marca = o.alcance === "OT" ? "Observación de la OT" : "Observación";
  const etiqueta = o.tipo === "correccion" ? "Corrección de devolución" : marca;
  return `<div class="obs-item${o.tipo === "correccion" ? " correccion" : ""}">${escapeHTML(o.texto)}<span class="obs-meta">${etiqueta} · ${escapeHTML(cuando)}${quien}</span></div>`;
}

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
  return window.Metrologia.modules.inventoryRenderer.render({
    document,
    patrones,
    escapeHTML,
    descripcionEstadoActividadTexto,
    ordenarAreas: ordenarAreasInventario,
    idSeccion: idSeccionInventario,
    areasColapsadas,
    patronesDeArea
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
  const box = window.Metrologia.modules.personnelRenderer.render({
    tecnicos, ROL_TECNICO, ROL_SUPERVISOR, rolPersona, laboratoriosDe,
    escapeHTML, casillasLaboratorios
  });
  return window.Metrologia.modules.personnelController.bind({
    document, tecnicos, historial, ROL_TECNICO, ROL_SUPERVISOR, STORES,
    rolPersona, nombreRol, esSupervisor, listaEncargados, SEP_ENCARGADOS,
    normalizarNombre, casillasLaboratorios, movimientoCerrado,
    abrirModalEliminarTecnicoTotal, confirmar, avisar, render,
    saveRecord, deleteRecord, runAtomicTransaction,
    personnelActions: window.Metrologia.services.personnelActions
  }, box);
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
// 11. PDF
// ============================================================
// Inventario en PDF. Sin argumentos saca el catalogo completo; con el
// nombre de un area saca solo el inventario de ese laboratorio, que es lo
// que descarga cada seccion de la pestaña.
function descargarInventarioPDF(area = null){
  return window.Metrologia.modules.inventoryReport.downloadInventory({
    patrones, claveArea, ordenarAreasInventario, patronBloqueadoPorCalibracion,
    createPdf: crearPDF, avisar, trozoNombreArchivo, todayISO
  }, area);
}

function descargarReporteVencimientosPDF(){
  return window.Metrologia.modules.expirationReport.downloadExpirationReport({
    patrones, getActividades, ACTIVIDADES_ISO, estadoActividad, formatMesISO,
    createPdf: crearPDF, todayISO
  });
}

// ------------------------------------------------------------
// SOLICITUD DE CALIBRACION mensual (modelo "Lista para generar OT")
//
// Para el mes elegido, lista los patrones cuya actividad vence ese
// mes, en tres secciones: CALIBRACION, VERIFICACION (Comprobacion
// Intermedia) y MANTENIMIENTO. Columnas del modelo: Equipo, Marca,
// Modelo, Serie, Codigo, Puntos, Lugar de uso ("No indica" si falta).
// Los codigos consecutivos del mismo equipo se agrupan como en el
// modelo original (ej. "PTB-PEM2-41 al 60").
// ------------------------------------------------------------
function agruparCodigosConsecutivos(lista, claveActividad){
  // lista: patrones con misma actividad venciendo. Devuelve filas
  // {equipo, marca, modelo, serie, codigo, puntos, lugar, cantidad, tipo}.
  const tipoDe = p => claveActividad ? (getActividades(p)[claveActividad].tipoCalibracion || "") : "";
  const filas = [];
  const grupos = {};
  lista.forEach(p => {
    const m = String(p.codigo).match(/^(.*?-)(\d+)$/);
    const clave = m
      ? [m[1], p.categoria, p.marca||"", p.modelo||"", p.valorNominal||"", p.lugarUso||"Campo", tipoDe(p)].join("§")
      : null;
    if (m) {
      if (!grupos[clave]) grupos[clave] = { p, prefijo: m[1], nums: [] };
      grupos[clave].nums.push(m[2]);
    } else {
      filas.push({ p, codigo: p.codigo, cantidad: 1 });
    }
  });
  Object.values(grupos).forEach(g => {
    const nums = g.nums.sort((a,b) => parseInt(a,10) - parseInt(b,10));
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && parseInt(nums[j+1],10) === parseInt(nums[j],10) + 1) j++;
      const cantidad = j - i + 1;
      const codigo = cantidad >= 3
        ? `${g.prefijo}${nums[i]} al ${nums[j]}`
        : null;
      if (codigo) {
        filas.push({ p: g.p, codigo, cantidad });
      } else {
        for (let k = i; k <= j; k++) filas.push({ p: g.p, codigo: g.prefijo + nums[k], cantidad: 1 });
      }
      i = j + 1;
    }
  });
  filas.sort((a,b) => a.codigo.localeCompare(b.codigo));
  return filas.map(f => ({
    equipo: f.p.categoria || "No indica",
    marca: (f.p.marca || "").trim() || "No indica",
    modelo: (f.p.modelo || "").trim() || "No indica",
    serie: (f.p.serie || "").trim() || "No indica",
    codigo: f.codigo + (tipoDe(f.p) ? " (" + tipoDe(f.p) + ")" : ""),
    puntos: (f.p.valorNominal || "").trim() || "-",
    lugar: f.p.lugarUso || "Campo",
    cantidad: f.cantidad
  }));
}

const SECCIONES_SOLICITUD = [
  { titulo: "CALIBRACIÓN", clave: "CAL", colPuntos: "Puntos Cal." },
  { titulo: "VERIFICACIÓN (Comprobación Intermedia)", clave: "V", colPuntos: "Puntos Ver." },
  { titulo: "MANTENIMIENTO", clave: "M", colPuntos: "Puntos Mant." },
];

// Seleccion del modal: { "CODIGO|CLAVE": true/false }. Se reconstruye al abrir.
let solicitudSeleccion = {};
let solicitudCandidatos = []; // [{codigo, clave}] en orden de despliegue

function marcadoPorDefectoSolicitud(clave, tipo){
  // La solicitud normalmente lleva solo calibracion interna y mantenimiento;
  // lo externo (CE) se gestiona con el proveedor y la comprobacion es interna
  // del laboratorio. Todo sigue siendo seleccionable a mano.
  if (clave === "M") return true;
  if (clave === "CAL") return tipo !== "CE";
  return false;
}

function abrirModalSolicitud(){
  const mes = document.getElementById("solicitud-mes").value;
  if (!mes) { avisar("Elige el mes de la solicitud.", "info"); return; }
  document.getElementById("sol-mes-titulo").textContent = formatMesISO(mes);
  solicitudSeleccion = {};
  solicitudCandidatos = [];
  patrones
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado))
    .forEach(p => {
      const acts = getActividades(p);
      SECCIONES_SOLICITUD.forEach(({clave}) => {
        if (acts[clave].mesVencimiento === mes) {
          solicitudCandidatos.push({ codigo: p.codigo, clave });
          solicitudSeleccion[p.codigo + "|" + clave] = marcadoPorDefectoSolicitud(clave, acts[clave].tipoCalibracion);
        }
      });
    });
  document.getElementById("sol-buscar").value = "";
  document.getElementById("sol-resultados-busqueda").innerHTML = "";
  renderListasSolicitud();
  document.getElementById("modal-solicitud").classList.add("open");
}

function cerrarModalSolicitud(){
  document.getElementById("modal-solicitud").classList.remove("open");
}

function renderListasSolicitud(){
  const cont = document.getElementById("sol-listas");
  cont.innerHTML = "";
  SECCIONES_SOLICITUD.forEach(sec => {
    const deSeccion = solicitudCandidatos.filter(c => c.clave === sec.clave);
    if (deSeccion.length === 0) return;
    const titulo = document.createElement("div");
    titulo.style.cssText = "padding:8px 14px; font-weight:700; font-size:13px; background:var(--surface-1); border-bottom:1px solid var(--border);";
    titulo.textContent = sec.titulo + " (" + deSeccion.length + ")";
    cont.appendChild(titulo);
    deSeccion.forEach(c => {
      const p = patrones.find(pp => pp.codigo === c.codigo);
      if (!p) return;
      const act = getActividades(p)[c.clave];
      const key = c.codigo + "|" + c.clave;
      const row = document.createElement("label");
      row.className = "patron-row";
      row.innerHTML = `
        <input type="checkbox" data-solkey="${escapeHTML(key)}" ${solicitudSeleccion[key] ? "checked" : ""}>
        <div style="flex:1;">
          <div class="codigo">${escapeHTML(p.codigo)}${act.tipoCalibracion ? ` <span class="badge area">${escapeHTML(act.tipoCalibracion)}</span>` : ""}</div>
          <div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}${act.mesVencimiento ? " · vence " + escapeHTML(formatMesISO(act.mesVencimiento)) : " · agregado a mano"}</div>
        </div>
      `;
      cont.appendChild(row);
    });
  });
  if (!cont.children.length) {
    cont.innerHTML = '<p class="empty-msg" style="padding:14px;">No hay actividades que venzan ese mes. Usa el buscador para añadir patrones a mano.</p>';
  }
  cont.querySelectorAll("input[data-solkey]").forEach(chk => {
    chk.addEventListener("change", (e) => {
      solicitudSeleccion[e.target.getAttribute("data-solkey")] = e.target.checked;
      actualizarContadorSolicitud();
    });
  });
  actualizarContadorSolicitud();
}

function actualizarContadorSolicitud(){
  const n = Object.values(solicitudSeleccion).filter(Boolean).length;
  document.getElementById("sol-contador").textContent = n + " seleccionado" + (n === 1 ? "" : "s");
}

function renderBusquedaSolicitud(){
  const q = document.getElementById("sol-buscar").value.trim().toLowerCase();
  const box = document.getElementById("sol-resultados-busqueda");
  box.innerHTML = "";
  if (q.length < 2) return;
  const yaListados = new Set(solicitudCandidatos.map(c => c.codigo + "|" + c.clave));
  const resultados = patrones
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado) &&
      (p.codigo.toLowerCase().includes(q) || (p.categoria||"").toLowerCase().includes(q)))
    .slice(0, 6);
  resultados.forEach(p => {
    const row = document.createElement("div");
    row.className = "patron-row";
    row.style.background = "var(--surface-1)";
    const botones = SECCIONES_SOLICITUD.map(({clave}) =>
      yaListados.has(p.codigo + "|" + clave)
        ? `<span class="badge disp">${clave} ya listado</span>`
        : `<button class="btn-mini sol-add" data-codigo="${escapeHTML(p.codigo)}" data-clave="${clave}">+ ${clave}</button>`
    ).join(" ");
    row.innerHTML = `
      <div style="flex:1;"><div class="codigo">${escapeHTML(p.codigo)}</div><div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}</div></div>
      <span style="display:flex; gap:4px;">${botones}</span>
    `;
    box.appendChild(row);
  });
  box.querySelectorAll(".sol-add").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      const clave = e.target.getAttribute("data-clave");
      solicitudCandidatos.push({ codigo, clave });
      solicitudSeleccion[codigo + "|" + clave] = true;
      renderListasSolicitud();
      renderBusquedaSolicitud();
    });
  });
}

function descargarSolicitudCalibracionPDF(){
  return window.Metrologia.modules.calibrationRequestReport.downloadCalibrationRequest({
    month: document.getElementById("solicitud-mes").value,
    sections: SECCIONES_SOLICITUD, candidates: solicitudCandidatos,
    selection: solicitudSeleccion, patrones,
    groupConsecutiveCodes: agruparCodigosConsecutivos, formatMesISO,
    createPdf: crearPDF, avisar
  });
}

function descargarActaPDF(salidaId){
  return window.Metrologia.modules.dispatchCertificateReport.downloadDispatchCertificate({
    history: historial,
    groupDispatches: agruparPorOT,
    createPdf: crearPDF,
    drawHeader: dibujarEncabezadoActa,
    drawSignatures: dibujarFirmasActa,
    drawFooter: dibujarPieFormato,
    formatDate: formatFecha,
    serviceNumber: numeroDeServicio,
    valueForCertificate: valorNominalParaActa,
    fileName: nombreArchivoActa,
    footerFormat: formatoActa,
    documentConfig: configuracionDocumento,
    maxContentY: ACTA_Y_CONTENIDO_MAX,
    // Bloque fijo: tres lineas de observacion y separacion antes de las firmas.
    observationsY: 229,
    signaturesY: ACTA_Y_FIRMAS
  }, salidaId);
}

// ------------------------------------------------------------
// Nombre del PDF: "OT-<numero>-<EMPRESA>-<TECNICO>.pdf"
//
// Windows no admite \ / : * ? " < > | ni punto o espacio al final, y el
// navegador cambia por su cuenta lo que no le gusta: se limpia aqui para
// que el archivo llegue con el nombre que se espera.
// ------------------------------------------------------------
function trozoNombreArchivo(texto, maxLargo){
  // Los puntos internos se conservan tal cual ("S.A.", "S.A.C."): la unica
  // regla de Windows sobre puntos afecta al final del nombre, y el nombre
  // siempre acaba en ".pdf".
  return String(texto || "")
    .replace(/[\\/:*?"<>|]/g, " ")      // prohibidos en Windows
    .replace(/[\x00-\x1f]/g, " ")       // caracteres de control
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLargo)
    .replace(/^[-\s]+|[-\s]+$/g, "")    // sin guiones ni espacios sueltos en los bordes
    .trim();
}

function nombreArchivoActa(grupo){
  // En el historial hay OT escritas ya con "OT" delante ("OT - 02602453"):
  // se quita para no repetir el prefijo en el nombre del archivo.
  const numero = trozoNombreArchivo(
    String(grupo.numeroOT || "").replace(/^\s*O\.?\s*T\.?\s*[-–—:]?\s*/i, ""),
    40
  );
  const partes = [
    "OT-" + (numero || "SIN-NUMERO"),
    trozoNombreArchivo(grupo.empresa, 60),
    trozoNombreArchivo(grupo.tecnico, 40)
  ].filter(Boolean);
  // Varios servicios de la misma OT darian el MISMO nombre de archivo y el
  // segundo PDF se descargaria como "(1)" o pisaria al primero. El numero de
  // servicio los separa; cuando la OT tiene una sola salida no se añade nada.
  const n = numeroDeServicio(grupo.salidaId);
  return partes.join("-") + (n ? "-servicio" + n : "") + ".pdf";
}

// ------------------------------------------------------------
// Pie de pagina de un formato controlado y bloque de firmas.
//
// Las medidas son fijas y compartidas: el contenido del acta no puede
// bajar de ACTA_Y_CONTENIDO_MAX, y por debajo quedan reservadas las
// firmas y el pie.
// ------------------------------------------------------------
// Titulo y logo del encabezado. El logo de fabrica va incrustado en el
// propio archivo (PNG en base64) para que el PDF salga igual en un equipo
// sin internet, que es la condicion de toda la app. El usuario puede
// sustituirlo desde "Logo del encabezado": el suyo se guarda en el store
// 'config' y viaja en los respaldos, y este queda siempre como respaldo.
const TITULO_ACTA = "Lista de equipos para servicio a campo";
const LOGO_ANCHO_MM = 45;
// Tope de altura: un logo cuadrado o vertical no puede empujar el
// contenido del acta hacia abajo, asi que se reduce el ancho en su lugar.
const LOGO_ALTO_MAX_MM = 20;
const LOGO_CONFIG_KEY = "logo_encabezado";
const FORMATO_ACTA_CONFIG_KEY = "formato_acta";
const CONFIG_DOCUMENTO_KEY = "configuracion_documento";
const CONFIG_ACCESO_CONFIGURACION_KEY = "acceso_configuracion";
const CAMPOS_DOCUMENTO_POR_DEFECTO = Object.freeze({
  numeroOT: { etiqueta: "Número de OT", visible: true },
  empresa: { etiqueta: "Empresa", visible: true },
  sede: { etiqueta: "Sede", visible: true },
  direccion: { etiqueta: "Dirección", visible: true },
  contacto: { etiqueta: "Contacto en sede", visible: true },
  tecnico: { etiqueta: "Técnico responsable", visible: true },
  laptop: { etiqueta: "Laptop asignada", visible: true },
  termohigrometro: { etiqueta: "Termohigrómetro asignado", visible: true },
  multimetro: { etiqueta: "Multímetro asignado", visible: true },
  fecha: { etiqueta: "Fecha de salida", visible: true },
  hora: { etiqueta: "Hora de salida", visible: true }
});
const TABLA_DOCUMENTO_POR_DEFECTO = Object.freeze({
  titulo: "Patrones que salen a servicio",
  mostrarTitulo: true,
  columnas: {
    codigo: { etiqueta: "Código único", visible: true },
    cantidad: { etiqueta: "Cant.", visible: true },
    laboratorio: { etiqueta: "Laboratorio", visible: true },
    equipos: { etiqueta: "Equipos", visible: true }
  }
});
const CONFIGURACION_DOCUMENTO_POR_DEFECTO = Object.freeze({
  titulo: TITULO_ACTA,
  mostrarLogo: true,
  campos: CAMPOS_DOCUMENTO_POR_DEFECTO,
  tabla: TABLA_DOCUMENTO_POR_DEFECTO
});
let formatoActa = { codigo: "FO-LAB-6-5", version: "01", aprobadoEn: "" };
let configuracionDocumento = { ...CONFIGURACION_DOCUMENTO_POR_DEFECTO };
let actualizarConfiguracionDocumentoUI = () => {};

function normalizarConfiguracionDocumento(configuracion = {}){
  const camposGuardados = configuracion.campos && typeof configuracion.campos === "object" ? configuracion.campos : {};
  const campos = Object.fromEntries(Object.entries(CAMPOS_DOCUMENTO_POR_DEFECTO).map(([clave, predeterminado]) => {
    const guardado = camposGuardados[clave] && typeof camposGuardados[clave] === "object" ? camposGuardados[clave] : {};
    const etiqueta = String(guardado.etiqueta || "").trim() || predeterminado.etiqueta;
    return [clave, { etiqueta, visible: guardado.visible !== false }];
  }));
  const tablaGuardada = configuracion.tabla && typeof configuracion.tabla === "object" ? configuracion.tabla : {};
  const columnasGuardadas = tablaGuardada.columnas && typeof tablaGuardada.columnas === "object" ? tablaGuardada.columnas : {};
  const columnas = Object.fromEntries(Object.entries(TABLA_DOCUMENTO_POR_DEFECTO.columnas).map(([clave, predeterminado]) => {
    const guardado = columnasGuardadas[clave] && typeof columnasGuardadas[clave] === "object" ? columnasGuardadas[clave] : {};
    return [clave, {
      etiqueta: String(guardado.etiqueta || "").trim() || predeterminado.etiqueta,
      visible: guardado.visible !== false
    }];
  }));
  if (!Object.values(columnas).some(columna => columna.visible)) columnas.codigo.visible = true;
  return {
    titulo: String(configuracion.titulo || "").trim() || TITULO_ACTA,
    mostrarLogo: configuracion.mostrarLogo !== false,
    campos,
    tabla: {
      titulo: String(tablaGuardada.titulo || "").trim() || TABLA_DOCUMENTO_POR_DEFECTO.titulo,
      mostrarTitulo: tablaGuardada.mostrarTitulo !== false,
      columnas
    }
  };
}

async function guardarConfiguracionDocumento(configuracion){
  configuracionDocumento = normalizarConfiguracionDocumento(configuracion);
  await setConfig(CONFIG_DOCUMENTO_KEY, configuracionDocumento);
  actualizarConfiguracionDocumentoUI();
  programarEspejo();
}

async function guardarFormatoActaRestaurado(configuracion){
  const origen = configuracion && typeof configuracion === "object" ? configuracion : {};
  formatoActa = {
    codigo: String(origen.codigo || "").trim() || "FO-LAB-6-5",
    version: String(origen.version || "").trim() || "01",
    aprobadoEn: String(origen.aprobadoEn || "").trim()
  };
  await setConfig(FORMATO_ACTA_CONFIG_KEY, formatoActa);
  programarEspejo();
}

async function guardarAccesoConfiguracion(credencial){
  await setConfig(CONFIG_ACCESO_CONFIGURACION_KEY, credencial || null);
  programarEspejo();
}
const LOGO_PROPORCION = 600 / 123;   // del PNG incrustado, 600 x 123 px
const LOGO_INCRUSTADO = "data:image/png;base64,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";

// Logo de fabrica: es el que se usa mientras no haya uno propio guardado.
const LOGO_POR_DEFECTO = Object.freeze({
  dataUrl: LOGO_INCRUSTADO,
  proporcion: LOGO_PROPORCION,
  formato: "PNG",
  nombre: "Logo incrustado en la app",
  propio: false
});

// Logo que se usa al generar los PDF. Se reemplaza al arrancar si hay uno
// guardado, y al cambiarlo o restaurarlo desde el modal.
let logoEncabezado = LOGO_POR_DEFECTO;

// Medidas con las que se dibuja: se respeta el ancho salvo que el alto se
// pase del tope, en cuyo caso manda el alto (logos cuadrados o verticales).
function medidasLogo(logo){
  let ancho = LOGO_ANCHO_MM;
  let alto = ancho / (logo.proporcion || 1);
  if (alto > LOGO_ALTO_MAX_MM) {
    alto = LOGO_ALTO_MAX_MM;
    ancho = alto * (logo.proporcion || 1);
  }
  return { ancho, alto };
}

async function cargarLogoGuardado(){
  try {
    const guardado = await getConfig(LOGO_CONFIG_KEY);
    if (guardado && guardado.dataUrl && guardado.proporcion > 0) {
      logoEncabezado = { ...guardado, propio: true };
    }
  } catch (e) {
    // Si el logo guardado no se puede leer, el acta sale con el de fabrica:
    // nunca es motivo para que la app no arranque.
    console.warn("No se pudo leer el logo guardado:", e);
  }
  try {
    const guardadoFormato = await getConfig(FORMATO_ACTA_CONFIG_KEY);
    if (guardadoFormato && typeof guardadoFormato === "object") {
      formatoActa = { ...formatoActa, ...guardadoFormato };
    }
  } catch (e) { /* se mantiene el formato predeterminado */ }
  try {
    const guardadoDocumento = await getConfig(CONFIG_DOCUMENTO_KEY);
    if (guardadoDocumento && typeof guardadoDocumento === "object") {
      configuracionDocumento = normalizarConfiguracionDocumento(guardadoDocumento);
    }
  } catch (e) { /* se mantiene la configuracion predeterminada */ }
}

// ------------------------------------------------------------
// Cambio del logo por el usuario.
//
// La imagen se guarda DENTRO de la base (y por tanto dentro de cada
// respaldo), asi que antes se reduce: un logo de camara de 4 MB haria
// pesados todos los respaldos sin verse mejor en una hoja A4.
// ------------------------------------------------------------
const LOGO_MAX_PX = 900;              // ancho maximo que se guarda
const LOGO_MAX_BYTES = 400 * 1024;    // a partir de aqui se aplana a JPEG

function leerArchivoComoDataURL(file){
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error || new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(file);
  });
}

function cargarImagen(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El archivo no es una imagen que el navegador pueda abrir."));
    img.src = dataUrl;
  });
}

// Tamaño real en bytes de un data URI (la parte base64 son 4 caracteres
// por cada 3 bytes; los '=' finales no cuentan).
function bytesDeDataURL(dataUrl){
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const relleno = (base64.match(/=+$/) || [""])[0].length;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - relleno);
}

function dibujarEnLienzo(img, ancho, alto, fondoBlanco){
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (fondoBlanco) {
    // El JPEG no tiene transparencia: sin este relleno, lo transparente
    // saldria negro en el PDF.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, ancho, alto);
  }
  ctx.drawImage(img, 0, 0, ancho, alto);
  return lienzo;
}

async function prepararLogo(file){
  return window.Metrologia.services.logoActions.prepareLogo(file, {
    maxPixels: LOGO_MAX_PX, maxBytes: LOGO_MAX_BYTES
  });
}

async function guardarLogo(logo){
  return window.Metrologia.services.logoActions.saveLogo({
    setConfig, key: LOGO_CONFIG_KEY,
    setCurrentLogo: valor => { logoEncabezado = valor ? { ...valor, propio: true } : LOGO_POR_DEFECTO; },
    scheduleMirror: programarEspejo
  }, logo);
}

async function restaurarLogoPorDefecto(){
  return window.Metrologia.services.logoActions.restoreDefaultLogo({
    setConfig, key: LOGO_CONFIG_KEY, defaultLogo: LOGO_POR_DEFECTO,
    setCurrentLogo: valor => { logoEncabezado = valor; }, scheduleMirror: programarEspejo
  });
}

// ------------------------------------------------------------
// Modal "Logo del encabezado"
// ------------------------------------------------------------
function pintarVistaLogo(){
  const img = document.getElementById("logo-preview");
  const info = document.getElementById("logo-info");
  if (!img || !info) return;
  img.src = logoEncabezado.dataUrl;
  const { ancho, alto } = medidasLogo(logoEncabezado);
  const partes = [
    logoEncabezado.propio ? "Logo propio" : "Logo original de la app",
    `sale a ${ancho.toFixed(1)} × ${alto.toFixed(1)} mm en el PDF`
  ];
  if (logoEncabezado.propio) {
    if (logoEncabezado.nombre) partes.push(logoEncabezado.nombre);
    const kb = Math.round(bytesDeDataURL(logoEncabezado.dataUrl) / 1024);
    if (kb) partes.push(kb + " KB");
  }
  info.textContent = partes.join(" · ");
  const btnRestaurar = document.getElementById("logo-restaurar");
  if (btnRestaurar) btnRestaurar.disabled = !logoEncabezado.propio;
}

function abrirModalLogo(){
  pintarVistaLogo();
  document.getElementById("modal-logo").classList.add("open");
}

function cerrarModalLogo(){
  document.getElementById("modal-logo").classList.remove("open");
}

async function cambiarLogoDesdeArchivo(file){
  try {
    const { logo, aplanado, bytes } = await prepararLogo(file);
    await guardarLogo(logo);
    pintarVistaLogo();
    avisar(
      aplanado
        ? `Logo actualizado (${Math.round(bytes/1024)} KB). La imagen era pesada, así que se guardó en JPEG sobre fondo blanco: ` +
          `si el logo tenía fondo transparente, usa una imagen más simple para conservarlo.`
        : `Logo actualizado. Se usará en los PDF que generes a partir de ahora.`,
      aplanado ? "info" : "ok"
    );
  } catch (e) {
    avisar(e.message || "No se pudo usar esa imagen como logo.", "error");
  }
}

const ACTA_Y_FIRMAS = 268;          // cargos y nombres de responsables
const ACTA_Y_PIE = 286;             // texto del pie
// Ultima linea util del contenido: el texto puede llegar hasta justo
// encima del pie. El hueco de las firmas NO se reserva en cada hoja (seria
// gastar papel en las intermedias): al terminar, si no caben debajo del
// contenido, se pasan a una hoja nueva.
const ACTA_Y_CONTENIDO_MAX = 272;

// Encabezado: logo a la izquierda y titulo a su derecha. Devuelve la Y en
// la que puede empezar el contenido. Se usa en la primera hoja y en toda
// pagina de continuacion; el pie con el codigo de formato tambien se repite.
function dibujarEncabezadoActa(doc, marginX){
  const yTop = 12;
  let xTitulo = marginX;
  let alto = 0;

  const titulo = configuracionDocumento.titulo || TITULO_ACTA;
  const logo = configuracionDocumento.mostrarLogo ? (logoEncabezado || LOGO_POR_DEFECTO) : null;
  if (logo && logo.dataUrl) {
    const medidas = medidasLogo(logo);
    alto = medidas.alto;
    try {
      doc.addImage(logo.dataUrl, logo.formato || "PNG", marginX, yTop, medidas.ancho, medidas.alto);
      xTitulo = marginX + medidas.ancho + 7;
    } catch (e) {
      // Si el logo fallara (imagen corrupta, formato raro), el acta sale
      // igual: solo con el titulo. Nunca se queda sin generar el PDF.
      console.warn("No se pudo dibujar el logo del encabezado:", e);
      alto = 0;
      xTitulo = marginX;
    }
  }

  doc.setFont(undefined, "bold");
  ajustarFuenteParaAncho(doc, titulo, 190 - xTitulo, 14, 9);
  // El titulo se centra con el logo si hay logo; si no, va arriba solo.
  doc.text(titulo, xTitulo, alto ? yTop + alto / 2 : yTop + 4, { baseline: "middle" });

  const yLinea = yTop + Math.max(alto, 8) + 6;
  doc.setDrawColor(210);
  doc.setLineWidth(0.2);
  doc.line(marginX, yLinea, 190, yLinea);
  return yLinea + 8;
}

// Bloque de responsables del acta. Ya NO lleva linea de firma: en su lugar
// van el cargo y, debajo, el nombre de quien responde por cada parte. Como
// no hay una linea que repartir, una OT que cruza laboratorios puede
// nombrar a sus dos encargados sin que el formato se rompa.
function dibujarFirmasActa(doc, marginX, grupo){
  const anchoUtil = 190 - marginX;
  const anchoCol = (anchoUtil - 20) / 2;
  const x2 = marginX + anchoCol + 20;

  const columnas = [
    { x: marginX, cargo: "Técnico encargado",      nombre: String((grupo && grupo.tecnico) || "").trim() },
    { x: x2,      cargo: "Encargado de Laboratorio", nombre: String((grupo && grupo.encargadoLaboratorio) || "").trim() }
  ];

  columnas.forEach(({ x, cargo, nombre }) => {
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text(cargo, x, ACTA_Y_FIRMAS);

    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    // Un nombre largo, o dos encargados, se parten en varias lineas en vez
    // de invadir la columna de al lado.
    const lineas = nombre
      ? doc.splitTextToSize(nombre, anchoCol)
      : ["No asignado"];
    if (!nombre) doc.setTextColor(130, 130, 130);
    lineas.slice(0, 3).forEach((linea, i) => {
      doc.text(linea, x, ACTA_Y_FIRMAS + 6 + i * 5);
    });
    doc.setTextColor(0, 0, 0);
  });
  doc.setFontSize(9);
}

function dibujarPieFormato(doc, { codigo, version }, marginX){
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(marginX, ACTA_Y_PIE - 5, 190, ACTA_Y_PIE - 5);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`Página ${i} de ${total}`, marginX, ACTA_Y_PIE);
    // Codigo de formato y version, alineados a la derecha de la hoja.
    doc.text(`${codigo}          Versión: ${version}`, 190, ACTA_Y_PIE, { align: "right" });
  }
}

// ============================================================
// Pie configurable del acta. Reemplaza el formato heredado fijo.
function dibujarPieFormato(doc, { codigo, version, aprobadoEn = "" }, marginX){
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(marginX, ACTA_Y_PIE - 5, 190, ACTA_Y_PIE - 5);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(String(codigo || ""), marginX, ACTA_Y_PIE);
    doc.text(`Versión: ${version || ""}`, marginX + 30, ACTA_Y_PIE);
    if (aprobadoEn) doc.text(`Aprobado el ${aprobadoEn}`, 105, ACTA_Y_PIE, { align: "center" });
    doc.text(`Página ${i} de ${total}`, 190, ACTA_Y_PIE, { align: "right" });
  }
}

// 12. RESPALDOS (exportar/importar)
// ============================================================
async function descargarBackup(){
  return window.Metrologia.services.backupActions.exportBackup({
    getConfig, LOGO_CONFIG_KEY, DOCUMENT_CONFIG_KEY, FORMATO_ACTA_CONFIG_KEY, SETTINGS_ACCESS_KEY: CONFIG_ACCESO_CONFIGURACION_KEY, patrones, tecnicos, historial,
    actividadesEjecutadas, clientes, todayISO
  });
}

async function importarBackup(file){
  return window.Metrologia.services.backupActions.importBackup({
    confirmar, STORES, clearStore, saveRecord, guardarLogo,
    guardarConfiguracionDocumento, guardarFormatoActa: guardarFormatoActaRestaurado, guardarAccesoConfiguracion,
    markImported: () => {
      localStorage.setItem(INICIALIZADO_KEY, '1');
      localStorage.setItem(CLIENTES_MIGRADOS_KEY, '1');
    },
    resetInterface: () => {
      seleccionados = {}; filtroCategoria = "Todas"; filtroCategoria2 = "Todas";
      filtroAreaSalida = "Todas"; filtroAreaCatalogo = "Todas";
      busqueda = ""; busqueda2 = ""; busquedaHistorial = ""; busquedaClientes = "";
      clienteSeleccionadoId = ""; sedeSeleccionadaId = "";
      document.getElementById("buscar-historial").value = "";
      document.getElementById("filtro-estado").value = "Todos";
    },
    render, createInitialWeightGroups: crearGruposPesasIniciales, avisar
  }, file);
}
// ------------------------------------------------------------
// Importacion por FUSION: actualiza el catalogo de patrones y sus
// actividades desde un JSON de programa, SIN tocar tecnicos ni
// historial y SIN borrar patrones que no vengan en el archivo.
//
// Reglas por patron entrante:
//   - Nuevo (codigo no existe)  -> se agrega completo.
//   - Existente -> se actualizan SOLO las actividades (CAL/V/M) que
//     el archivo trae programadas; area/categoria/estado se conservan.
//     Excepcion: si el archivo trae un estado especial (Extraviado,
//     No Cumple / Inoperativo, De baja), ese estado SI se aplica,
//     porque el programa es la fuente mas reciente de esa condicion.
//   - marca/valorNominal/observacion solo se completan si estaban vacios.
// ------------------------------------------------------------
const ESTADOS_ESPECIALES_FUSION = ["Extraviado", "No Cumple / Inoperativo", "De baja"];

async function importarFusion(file){
  return window.Metrologia.services.backupActions.mergeProgram({
    confirmar, patrones, normalizarCodigoPatron, getActividades,
    ACTIVIDADES_ISO, ESTADOS_ESPECIALES_FUSION, STORES,
    runAtomicTransaction, INICIALIZADO_KEY, render, avisar
  }, file);
}
// ============================================================
// 13. NAVEGACIÓN POR PESTAÑAS
// ============================================================
const TABS = ["inicio","indicadores","salida","historial","programa","patrones","tecnicos","clientes","inventario","configuracion"];
const TAB_KEY = "metrologia_tab_activa";

function activarTab(nombre){
  if (!TABS.includes(nombre)) nombre = "inicio";
  if (nombre === "configuracion" && !window.Metrologia.modules.settingsAuth.isAuthorized()) {
    window.Metrologia.modules.settingsAuth.requestAccess(() => activarTab("configuracion"));
    return;
  }
  const panelConfiguracion = document.getElementById("panel-configuracion");
  const seAbandonaConfiguracion = nombre !== "configuracion" && panelConfiguracion && panelConfiguracion.style.display !== "none";
  if (seAbandonaConfiguracion) {
    window.Metrologia.modules.settingsAuth.lock();
    cerrarModalLogo();
    cerrarFormatoActa();
  }
  TABS.forEach(t => {
    document.getElementById("panel-"+t).style.display = (t===nombre) ? "block" : "none";
    document.getElementById("tab-"+t).classList.toggle("active", t===nombre);
  });
  // Recordamos la pestaña para volver a ella al reabrir la app.
  try { localStorage.setItem(TAB_KEY, nombre); } catch(e){}
  render();
  if (nombre === "indicadores") renderIndicadores();
}

function renderIndicadores(){
  return window.Metrologia.modules.indicatorsDashboard.render({ technicians: tecnicos, patterns: patrones, history: historial });
}

// ============================================================
// 14. FUNCIONES DE REGISTRO
// ============================================================
async function registrarSalida(){
  return window.Metrologia.services.dispatchActions.registerDispatch({
    horaActualHHMMSS, seleccionados, getCliente, clienteSeleccionadoId,
    getSede, sedeSeleccionadaId, patrones, patronBloqueadoPorCalibracion,
    esPatronGrupo, cantidadSeleccionadaDe, unidadesDisponiblesDe, tecnicos,
    encargadoParaCodigos, isoDesdeFechaHoraLocal, nuevoId, unidadesDeGrupo,
    STORES, runAtomicTransaction, unidadesFueraDe, estadoTrasMovimiento,
    cantidadDeRegistro,
    clearSelection: () => { seleccionados = {}; cantidadesSeleccion = {}; },
    todayISO, render
  });
}

// ------------------------------------------------------------
// Alta de patron en UN SOLO paso: el formulario incluye las 3
// actividades ISO, y "Duplicar" precarga todo desde otro patron.
// ------------------------------------------------------------
function construirBloquesActividadAlta(){
  const cont = document.getElementById("np-actividades");
  if (!cont) return;
  cont.innerHTML = ACTIVIDADES_ISO.map(({clave, nombre}) => `
    <div class="full" style="border:1px solid var(--border); border-radius:8px; padding:8px 10px;">
      <p style="font-weight:600; font-size:12px; margin:0 0 6px;">${nombre} (${clave})</p>
      <div class="grid2">
        <div>
          <label class="field-label">Frecuencia (meses)</label>
          <input type="number" class="np-act-frecuencia" data-clave="${clave}" min="1" step="1" placeholder="Ej: 12">
        </div>
        <div>
          <label class="field-label">Mes de vencimiento</label>
          <input type="month" class="np-act-mesvenc" data-clave="${clave}">
        </div>
        <div>
          <label class="field-label">Tipo</label>
          <select class="np-act-tipo" data-clave="${clave}">
            ${TIPOS_POR_ACTIVIDAD[clave].map(([v,t]) => `<option value="${v}">${t}</option>`).join("")}
          </select>
        </div>
        <div>
          <label class="field-label">Última ejecución (opcional)</label>
          <input type="date" class="np-act-fecha" data-clave="${clave}">
        </div>
      </div>
    </div>
  `).join("");
  if (window.Metrologia.modules.patternCreateModal) window.Metrologia.modules.patternCreateModal.compactActivities();
}

function leerActividadesAlta(){
  const acts = { CAL: actividadVacia(), V: actividadVacia(), M: actividadVacia() };
  let error = "";
  document.querySelectorAll(".np-act-frecuencia").forEach(i => {
    const c = i.getAttribute("data-clave");
    if (i.value) {
      const n = parseInt(i.value, 10);
      if (!Number.isInteger(n) || n < 1) error = `La frecuencia de ${c} debe ser un número entero de meses mayor a 0.`;
      acts[c].frecuenciaMeses = n;
    }
  });
  document.querySelectorAll(".np-act-mesvenc").forEach(i => { acts[i.getAttribute("data-clave")].mesVencimiento = i.value || null; });
  document.querySelectorAll(".np-act-tipo").forEach(i => { acts[i.getAttribute("data-clave")].tipoCalibracion = i.value || null; });
  document.querySelectorAll(".np-act-fecha").forEach(i => { acts[i.getAttribute("data-clave")].ultimaFechaEjecucion = i.value || null; });
  return { acts, error };
}

function limpiarFormularioAlta(){
  ["np-area-nueva","np-categoria","np-codigo","np-marca","np-valor","np-modelo","np-serie"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("np-estado").value = "Disponible";
  document.getElementById("np-lugar").value = "Campo";
  document.getElementById("np-es-grupo").checked = false;
  document.getElementById("np-unidades").value = "20";
  document.getElementById("np-grupo-campos").style.display = "none";
  window.Metrologia.modules.patternCreateModal.resetOptionalSections();
  construirBloquesActividadAlta();
  document.getElementById("np-modo-duplicado").style.display = "none";
  document.getElementById("np-error").style.display = "none";
  document.getElementById("np-ok").style.display = "none";
}

// Precarga el formulario de alta con los datos de otro patron.
function duplicarPatron(codigo){
  const p = patrones.find(pp => pp.codigo === codigo);
  if (!p) return;
  activarTab("patrones");
  window.Metrologia.modules.patternCreateModal.open();
  construirBloquesActividadAlta();
  const sel = document.getElementById("np-area");
  if (Array.from(sel.options).some(o => o.value === p.area)) sel.value = p.area;
  document.getElementById("np-area-nueva").value = "";
  document.getElementById("np-categoria").value = p.categoria || "";
  document.getElementById("np-codigo").value = "";
  document.getElementById("np-marca").value = p.marca || "";
  document.getElementById("np-valor").value = p.valorNominal || "";
  document.getElementById("np-modelo").value = p.modelo || "";
  document.getElementById("np-serie").value = "";     // la serie es unica de cada equipo
  document.getElementById("np-lugar").value = p.lugarUso || "Campo";
  document.getElementById("np-estado").value = "Disponible";

  const act = getActividades(p);
  document.querySelectorAll(".np-act-frecuencia").forEach(i => { i.value = act[i.getAttribute("data-clave")].frecuenciaMeses ?? ""; });
  document.querySelectorAll(".np-act-mesvenc").forEach(i => { i.value = act[i.getAttribute("data-clave")].mesVencimiento || ""; });
  document.querySelectorAll(".np-act-tipo").forEach(i => { i.value = act[i.getAttribute("data-clave")].tipoCalibracion || ""; });
  document.querySelectorAll(".np-act-fecha").forEach(i => { i.value = ""; });
  window.Metrologia.modules.patternCreateModal.prepareDuplicate();

  const aviso = document.getElementById("np-modo-duplicado");
  aviso.textContent = `Copiado de ${p.codigo} — escribe el código nuevo.`;
  aviso.style.display = "inline";

  const campoCodigo = document.getElementById("np-codigo");
  campoCodigo.scrollIntoView({ behavior: "smooth", block: "center" });
  campoCodigo.focus();
}

async function agregarPatron(){
  return window.Metrologia.services.patternActions.addPattern({
    normalizarCodigoPatron, patrones, leerActividadesAlta, saveRecord,
    STORES, render, avisar, deleteRecord
  });
}

// ------------------------------------------------------------
// Alta rapida de los nueve grupos de pesas M2 de 20 kg. Son los tramos
// con los que trabaja el laboratorio; crearlos a mano seria repetir nueve
// veces el mismo formulario. Los datos (area, categoria, valor nominal)
// se copian de las pesas sueltas que ya estan en el catalogo.
// ------------------------------------------------------------
// Los nueve grupos se crean SOLOS la primera vez, como ya se hace con el
// directorio de clientes. Antes esto era un boton en la pantalla de
// patrones, pero era un boton de un solo uso: se pulsa una vez en la vida
// del laboratorio y despues estorba ahi para siempre.
const GRUPOS_PESAS_KEY = 'metrologia_grupos_pesas_creados';
const gruposPesasIniciales = window.Metrologia.services.initialWeightGroups.create({
  getPatterns: () => patrones,
  isGroupPattern: esPatronGrupo,
  emptyActivity: actividadVacia,
  saveMany: items => runAtomicTransaction([STORES.patrones], items.map(item => ({
    store: STORES.patrones, action: 'put', item
  }))),
  deleteMany: codes => runAtomicTransaction([STORES.patrones], codes.map(key => ({
    store: STORES.patrones, action: 'delete', key
  }))),
  onChanged: render,
  storageKey: GRUPOS_PESAS_KEY
});

async function crearGruposPesasIniciales(){ return gruposPesasIniciales.createInitial(); }

// Se guarda para poder ofrecer "Deshacer" desde el aviso del arranque.

async function deshacerGruposPesasIniciales(){
  if (!await gruposPesasIniciales.undoInitial()) return;
  avisar("Se deshizo la creación de los grupos de pesas.", "info");
}

// Alterna los campos del formulario de alta segun el rol elegido y repinta
// las casillas de laboratorio con los laboratorios que existan ahora.
function alternarCamposPersonal(){
  const sel = document.getElementById("nt-rol");
  if (!sel) return;
  const sup = sel.value === ROL_SUPERVISOR;
  document.querySelectorAll(".nt-solo-tecnico").forEach(d => { d.style.display = sup ? "none" : ""; });
  document.querySelectorAll(".nt-solo-supervisor").forEach(d => { d.style.display = sup ? "" : "none"; });
  if (sup) {
    const caja = document.getElementById("nt-laboratorios");
    if (caja) caja.innerHTML = casillasLaboratorios("nt-lab", []);
  }
}

function abrirModalPersonal(){
  const modal = document.getElementById("modal-personal");
  if (!modal) return;
  document.getElementById("nt-error").style.display = "none";
  document.getElementById("nt-ok").style.display = "none";
  alternarCamposPersonal();
  modal.classList.add("open");
  document.getElementById("nt-nombre").focus();
}

function cerrarModalPersonal(){
  const modal = document.getElementById("modal-personal");
  if (modal) modal.classList.remove("open");
}

async function agregarTecnico(){
  return window.Metrologia.services.personnelActions.addPerson({
    normalizarNombre, ROL_SUPERVISOR, ROL_TECNICO, tecnicos, saveRecord,
    STORES, nombreRol, render, alternarCamposPersonal, cerrarModalPersonal
  });
}

// ============================================================
// 15. EVENTOS Y ARRANQUE (UN SOLO PUNTO DE ENTRADA)
// ============================================================
document.addEventListener("DOMContentLoaded", async function() {
  // --- Modal de borrado total ---
  const modalInput = document.getElementById("modal-confirm-input");
  const modalBtnConfirmar = document.getElementById("modal-confirmar");
  modalInput.addEventListener("input", () => {
    const coincide = modalEliminarCodigoObjetivo !== null &&
      modalInput.value.trim() === modalEliminarCodigoObjetivo;
    modalBtnConfirmar.disabled = !coincide;
  });
  document.getElementById("modal-cancelar").addEventListener("click", cerrarModalEliminarTotal);
  document.getElementById("modal-eliminar-total").addEventListener("click", (e) => {
    if (e.target.id === "modal-eliminar-total") cerrarModalEliminarTotal();
  });
  modalBtnConfirmar.addEventListener("click", async () => {
    const valor = modalEliminarCodigoObjetivo;
    const tipo = modalEliminarTipo;
    await window.Metrologia.services.destructiveActions.deleteAll({
      historial, STORES, tecnicos, patrones, actividadesEjecutadas,
      movimientoCerrado, runAtomicTransaction, cerrarModalEliminarTotal,
      render, avisar, restaurarRegistros, seleccionados
    }, valor, tipo);
  });

  // --- Modal de registro de calibracion ---
  document.getElementById("modal-cal-actividad").addEventListener("change", cargarDatosActividadEnModal);
  document.getElementById("modal-cal-fecha").addEventListener("input", actualizarPreviewCalibracion);
  document.getElementById("modal-cal-intervalo").addEventListener("input", actualizarPreviewCalibracion);
  document.getElementById("modal-cal-cancelar").addEventListener("click", cerrarModalCalibracion);
  document.getElementById("modal-calibracion").addEventListener("click", (e) => {
    if (e.target.id === "modal-calibracion") cerrarModalCalibracion();
  });
  document.getElementById("modal-cal-confirmar").addEventListener("click", async () => {
    await window.Metrologia.services.patternActions.registerActivity({
      codigo: modalCalibracionCodigoObjetivo, ACTIVIDADES_ISO, patrones,
      cerrarModalCalibracion, sumarMesesAMes, getActividades, STORES,
      runAtomicTransaction, formatMesISO, render, avisar
    });
  });

  // --- Modal generico de confirmacion ---
  document.getElementById("confirmar-cancelar").addEventListener("click", () => cerrarConfirmacion(false));
  document.getElementById("confirmar-ok").addEventListener("click", () => cerrarConfirmacion("ok"));
  document.getElementById("confirmar-alterno").addEventListener("click", () => cerrarConfirmacion("alterno"));
  document.getElementById("modal-confirmar-accion").addEventListener("click", (e) => {
    if (e.target.id === "modal-confirmar-accion") cerrarConfirmacion(false);
  });

  // --- Modal de observaciones del historial ---
  document.getElementById("obs-cancelar").addEventListener("click", cerrarModalObservacion);
  document.getElementById("obs-guardar").addEventListener("click", guardarObservacion);
  document.getElementById("modal-observacion").addEventListener("click", (e) => {
    if (e.target.id === "modal-observacion") cerrarModalObservacion();
  });

  // --- Lector de codigo de barras ---
  window.Metrologia.modules.scannerController.bind({
    handleGlobalKeydown: manejarTeclaLector,
    scanners: [
      { id: "escaneo-salida", process: procesarEscaneoSalida },
      { id: "escaneo-devolucion", process: procesarEscaneoDevolucion }
    ],
    restartMs: ESCANER_MS_REINICIO,
    readPhysicalKey: charDesdeTeclaFisica,
    resolveCode: resolverCodigoLeido,
    isSoundEnabled: sonidoEscanerActivo,
    setSoundEnabled: fijarSonidoEscaner,
    beep: pitido
  });
  // --- Modal de correccion de una OT registrada ---
  document.getElementById("edit-ot-cancelar").addEventListener("click", cerrarModalEditarOT);
  document.getElementById("edit-ot-guardar").addEventListener("click", guardarEdicionOT);
  document.getElementById("modal-editar-ot").addEventListener("click", (e) => {
    if (e.target.id === "modal-editar-ot") cerrarModalEditarOT();
  });
  document.getElementById("edit-ot-cliente").addEventListener("change", (e) => {
    if (!edicionOT) return;
    edicionOT.clienteId = e.target.value;
    edicionOT.sedeId = "";
    poblarSelectSedesEdicionOT();
    // Con una sola sede no tiene sentido obligar a elegirla.
    const cliente = getCliente(edicionOT.clienteId);
    if (cliente && (cliente.sedes || []).length === 1) {
      edicionOT.sedeId = cliente.sedes[0].id;
      document.getElementById("edit-ot-sede").value = edicionOT.sedeId;
    }
  });
  document.getElementById("edit-ot-sede").addEventListener("change", (e) => {
    if (edicionOT) edicionOT.sedeId = e.target.value;
  });
  document.getElementById("edit-ot-tecnico").addEventListener("change", mostrarInfoTecnicoEdicion);
  document.getElementById("edit-ot-buscar").addEventListener("input", renderBusquedaEdicionOT);

  // Escape cierra cualquier modal abierto (antes solo se cerraban con el raton).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.getElementById("modal-confirmar-accion").classList.contains("open")) { cerrarConfirmacion(false); return; }
    if (document.getElementById("modal-observacion").classList.contains("open")) { cerrarModalObservacion(); return; }
    if (document.getElementById("modal-personal").classList.contains("open")) { cerrarModalPersonal(); return; }
    if (document.getElementById("modal-cliente").classList.contains("open")) { cerrarModalCliente(); return; }
    if (document.getElementById("modal-logo").classList.contains("open")) { cerrarModalLogo(); return; }
    if (document.getElementById("modal-devolucion").classList.contains("open")) { cerrarModalDevolucion(); return; }
    if (document.getElementById("modal-editar-ot").classList.contains("open")) { cerrarModalEditarOT(); return; }
    if (document.getElementById("modal-ficha").classList.contains("open")) { cerrarFichaPatron(); return; }
    if (document.getElementById("modal-calibracion").classList.contains("open")) { cerrarModalCalibracion(); return; }
    if (document.getElementById("modal-solicitud").classList.contains("open")) { cerrarModalSolicitud(); return; }
    if (document.getElementById("modal-etiquetas").classList.contains("open")) { window.Metrologia.modules.labelsModal.close(); return; }
    if (document.getElementById("modal-alta-patron").classList.contains("open")) { window.Metrologia.modules.patternCreateModal.close(); return; }
    if (document.getElementById("modal-eliminar-total").classList.contains("open")) { cerrarModalEliminarTotal(); }
  });

  // --- Arranque de datos ---
  const iniciado = await window.Metrologia.modules.appStartup.run({
    openDatabase: openDB, loadLogo: cargarLogoGuardado,
    migrateLocalStorage: migrarDesdeLocalStorage, loadInitialData: cargarDatosIniciales,
    migrateClients: migrarClientesDesdeHistorial, restoreDataFolder: restaurarCarpetaDatos,
    render, createInitialWeightGroups: crearGruposPesasIniciales,
    notify: avisar, undoInitialWeightGroups: deshacerGruposPesasIniciales,
    persistentNotify: avisarPersistente, reload: () => location.reload()
  });
  if (!iniciado) return;

  window.Metrologia.modules.settingsAuth.bind({
    loadCredential: () => getConfig(CONFIG_ACCESO_CONFIGURACION_KEY),
    storeCredential: guardarAccesoConfiguracion,
    onLogout: () => activarTab("inicio"),
    notify: avisar
  });

  const controlesDocumento = window.Metrologia.modules.documentSettings.bind({
    getSettings: () => configuracionDocumento,
    saveSettings: async (settings) => guardarConfiguracionDocumento({ ...configuracionDocumento, ...settings }),
    notify: avisar
  });
  actualizarConfiguracionDocumentoUI = controlesDocumento && controlesDocumento.render || actualizarConfiguracionDocumentoUI;

  // --- Espejo a disco ---
  document.getElementById("btn-conectar-carpeta").addEventListener("click", conectarCarpetaDatos);

  // --- Modal ficha / hoja de vida ---
  document.getElementById("ficha-cerrar").addEventListener("click", cerrarFichaPatron);
  document.getElementById("ficha-pdf").addEventListener("click", descargarFichaPDF);
  document.getElementById("modal-ficha").addEventListener("click", (e) => {
    if (e.target.id === "modal-ficha") cerrarFichaPatron();
  });

  // --- Tarjetas del panel de inicio (atajos) ---
  document.getElementById("card-vencidos").addEventListener("click", ()=>{
    document.getElementById("filtro-calibracion").value = "vencido";
    activarTab("patrones");
  });
  document.getElementById("card-porvencer").addEventListener("click", ()=>{
    document.getElementById("filtro-calibracion").value = "por_vencer";
    activarTab("patrones");
  });
  document.getElementById("card-enservicio").addEventListener("click", ()=>activarTab("historial"));
  document.getElementById("card-disponibles").addEventListener("click", ()=>{
    document.getElementById("filtro-calibracion").value = "Todas";
    activarTab("patrones");
  });

    // --- Catálogo y Programa anual ---
  window.Metrologia.modules.catalogProgramController.bind({
    renderCatalog: renderCatalogoPatrones,
    renderProgram: renderPrograma,
    downloadProgram: descargarProgramaPDF,
    openProgram: () => activarTab("programa")
  });
  window.Metrologia.modules.historyController.bind({
    onSearch: valor => { busquedaHistorial = valor; paginaHistorial = 1; renderHistorial(); },
    onOrderChange: valor => { ordenHistorial = valor; paginaHistorial = 1; renderHistorial(); },
    exportBackup: descargarBackup,
    importBackup: importarBackup,
    importFusion: importarFusion,
    openHistory: () => activarTab("historial")
  });
  window.Metrologia.modules.dispatchReturnController.bind({
    registerExit: registrarSalida,
    clearSelection: () => { seleccionados = {}; cantidadesSeleccion = {}; render(); },
    openReturn: abrirModalDevolucion,
    closeReturn: cerrarModalDevolucion,
    confirmReturn: confirmarDevolucionMasiva,
    clearReturn: () => { devolucionPendiente = []; renderListaDevolucion(); },
    onCustomerInput: () => { document.getElementById("bloque-sede-nueva").classList.remove("open"); resolverClienteEscrito(); },
    resolveCustomer: abrirAltaSiNoExiste => resolverClienteEscrito({ abrirAltaSiNoExiste }),
    selectSite: valor => {
      if (valor === OPCION_NUEVA_SEDE) { abrirBloqueSedeNueva(); return; }
      document.getElementById("bloque-sede-nueva").classList.remove("open");
      sedeSeleccionadaId = valor;
      actualizarCajaDireccion();
    },
    saveNewCustomer: guardarClienteNuevoDesdeSalida,
    cancelNewCustomer: cerrarBloqueClienteNuevo,
    saveNewSite: guardarSedeNuevaDesdeSalida,
    cancelNewSite: cerrarBloqueSedeNueva
  });
  window.Metrologia.modules.dispatchLayout.bind();
  window.Metrologia.modules.adminController.bind({
    openHome: () => activarTab("inicio"),
    openIndicators: () => activarTab("indicadores"),
    openDispatch: () => activarTab("salida"),
    openPatterns: () => activarTab("patrones"),
    openTechnicians: () => activarTab("tecnicos"),
    openClients: () => activarTab("clientes"),
    openInventory: () => activarTab("inventario"),
    openConfiguration: () => activarTab("configuracion"),
    addPattern: agregarPatron,
    addTechnician: agregarTecnico,
    toggleTechnicianFields: alternarCamposPersonal,
    openPersonnelModal: abrirModalPersonal,
    closePersonnelModal: cerrarModalPersonal,
    openClientModal: abrirModalCliente,
    closeClientModal: cerrarModalCliente,
    addClient: agregarClienteDesdePestaña,
    searchClients: valor => { busquedaClientes = valor; renderClientes(); },
    filterExitCategory: valor => { filtroCategoria = valor; render(); },
    searchExit: valor => { busqueda = valor; render(); }
  });
// --- Alta de patrones: bloques de actividad y duplicado ---
  construirBloquesActividadAlta();
  window.Metrologia.modules.patternCreateModal.bind();
  document.getElementById("btn-limpiar-alta").addEventListener("click", limpiarFormularioAlta);
  document.getElementById("np-es-grupo").addEventListener("change", (e) => {
    document.getElementById("np-grupo-campos").style.display = e.target.checked ? "block" : "none";
  });

  // --- Filtros y busquedas ---
  document.getElementById("in-tecnico").addEventListener("change", render);
  document.getElementById("btn-descargar-reporte-vencimientos").addEventListener("click", descargarReporteVencimientosPDF);
  document.getElementById("btn-solicitud-calibracion").addEventListener("click", abrirModalSolicitud);
  document.getElementById("solicitud-mes").value = mesActualISO();
  document.getElementById("sol-cancelar").addEventListener("click", cerrarModalSolicitud);
  document.getElementById("modal-solicitud").addEventListener("click", (e) => {
    if (e.target.id === "modal-solicitud") cerrarModalSolicitud();
  });
  document.getElementById("sol-buscar").addEventListener("input", renderBusquedaSolicitud);
  document.getElementById("sol-generar").addEventListener("click", () => {
    if (descargarSolicitudCalibracionPDF()) cerrarModalSolicitud();
  });
  // --- Etiquetas e inventario ---
  window.Metrologia.modules.assetsController.bind({
    changeLabelFormat: alternarMedidaPersonalizada,
    changeLabelMeasure: () => { guardarMedidaPersonalizada(); mostrarInfoMedidaEtiqueta(); },
    measureLabels: mostrarInfoMedidaEtiqueta,
    changeBarcodeOption: () => { if (formatoEtiquetaElegido() === "personalizado") mostrarInfoMedidaEtiqueta(); },
    changeGroupOption: () => { guardarPreferenciaAgrupar(); if (formatoEtiquetaElegido() === "personalizado") mostrarInfoMedidaEtiqueta(); },
    downloadLabels: descargarEtiquetasPDF,
    printLabels: imprimirEtiquetasSeleccionadas,
    clearLabels: limpiarSeleccionEtiquetas,
    searchInventory: renderInventario,
    searchCatalog: renderCatalogoPatrones,
    downloadInventory: descargarInventarioPDF,
    toggleInventorySection: alternarSeccionInventario,
    goToInventoryArea: area => {
      if (areasColapsadas().includes(area)) alternarSeccionInventario(area);
      const destino = document.getElementById(idSeccionInventario(area));
      const contenedor = document.getElementById("inventario-contenido");
      if (destino && contenedor) {
        // Los accesos por magnitud navegan dentro de la caja del inventario,
        // sin desplazar toda la página.
        const posicion = destino.getBoundingClientRect().top - contenedor.getBoundingClientRect().top + contenedor.scrollTop;
        contenedor.scrollTo({ top: Math.max(0, posicion - 8), behavior: "smooth" });
      }
    },
    initializeLabels: () => { restaurarMedidaPersonalizada(); restaurarPreferenciaAgrupar(); alternarMedidaPersonalizada(); }
  });
  window.Metrologia.modules.labelsModal.bind();
  actualizarContadorEtiquetas();
  // --- Formularios ---

  // --- Logo del encabezado del PDF ---
  window.Metrologia.modules.logoController.bind({
    open: abrirModalLogo,
    close: cerrarModalLogo,
    chooseFile: () => document.getElementById("input-logo").click(),
    changeFile: cambiarLogoDesdeArchivo,
    restore: async () => {
      if (!logoEncabezado.propio) return;
      const ok = await confirmar({
        titulo: "Restaurar el logo original",
        mensaje: "Se volverá al logo que trae la app y se descartará la imagen que cargaste. ¿Continuar?",
        textoOk: "Restaurar"
      });
      if (!ok) return;
      await restaurarLogoPorDefecto();
      pintarVistaLogo();
      avisar("Se restauró el logo original de la app.", "ok");
    }
  });
  // --- Fecha y hora por defecto: este momento ---
  document.getElementById("in-fecha").value = todayISO();
  document.getElementById("in-hora").value = horaActualHHMMSS();
  document.getElementById("btn-hora-ahora").addEventListener("click", () => {
    document.getElementById("in-fecha").value = todayISO();
    document.getElementById("in-hora").value = horaActualHHMMSS();
  });

  // --- Volver a la pestaña donde se estaba trabajando ---
  try {
    const guardada = localStorage.getItem(TAB_KEY);
    if (guardada && TABS.includes(guardada) && guardada !== "inicio") activarTab(guardada);
  } catch(e){}
});

function abrirFormatoActa(){
  document.getElementById("formato-acta-codigo").value = formatoActa.codigo || "";
  document.getElementById("formato-acta-version").value = formatoActa.version || "";
  document.getElementById("formato-acta-aprobado").value = formatoActa.aprobadoEn || "";
  document.getElementById("formato-acta-error").style.display = "none";
  document.getElementById("modal-formato-acta").classList.add("open");
}

function cerrarFormatoActa(){ document.getElementById("modal-formato-acta").classList.remove("open"); }

async function guardarFormatoActa(){
  const codigo = document.getElementById("formato-acta-codigo").value.trim();
  const version = document.getElementById("formato-acta-version").value.trim();
  const aprobadoEn = document.getElementById("formato-acta-aprobado").value;
  const error = document.getElementById("formato-acta-error");
  if (!codigo || !version || !aprobadoEn) {
    error.textContent = "Completa cÃ³digo, versiÃ³n y fecha de aprobaciÃ³n.";
    error.style.display = "block";
    return;
  }
  formatoActa = { codigo, version, aprobadoEn };
  await setConfig(FORMATO_ACTA_CONFIG_KEY, formatoActa);
  programarEspejo();
  cerrarFormatoActa();
  avisar("Formato del acta guardado.", "ok");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-formato-acta").addEventListener("click", abrirFormatoActa);
  document.getElementById("formato-acta-cancelar").addEventListener("click", cerrarFormatoActa);
  document.getElementById("formato-acta-guardar").addEventListener("click", guardarFormatoActa);
  document.getElementById("modal-formato-acta").addEventListener("click", event => {
    if (event.target.id === "modal-formato-acta") cerrarFormatoActa();
  });
});
