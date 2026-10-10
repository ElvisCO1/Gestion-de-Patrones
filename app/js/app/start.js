// ============================================================
// 12. RESPALDOS (exportar/importar)
// ============================================================
async function descargarBackup(){
  let logo = null;
  try { logo = await getConfig(LOGO_CONFIG_KEY); } catch(e){ /* el respaldo sale igual */ }
  const backup = {
    version: 4,
    exportadoEn: new Date().toISOString(),
    patrones: patrones,
    tecnicos: tecnicos,
    historial: historial,
    actividades: actividadesEjecutadas,
    clientes: clientes,
    logo: logo || null
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `metrologia_backup_${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importarBackup(file){
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.patrones) || !Array.isArray(data.tecnicos) || !Array.isArray(data.historial)) {
        throw new Error("El archivo no tiene una estructura de respaldo válida.");
      }
      const ok = await confirmar({
        titulo: "Importar respaldo",
        mensaje: `El archivo trae ${data.patrones.length} patrones, ${data.tecnicos.length} técnicos ` +
                 `y ${data.historial.length} registros de historial.\n\n` +
                 `Esto REEMPLAZA todos los datos guardados actualmente. ¿Continuar?`,
        textoOk: "Reemplazar datos", peligro: true
      });
      if (!ok) return;

      // El reemplazo completo se hace en una única transacción IndexedDB.
      // Si alguna fila no puede guardarse, se revierte también el borrado:
      // nunca queda una base parcialmente importada.
      await window.MetrologiaDB.replaceBackupData(data);
      // El logo propio solo se toca si el respaldo trae uno: un respaldo
      // antiguo (sin este campo) no debe borrar el logo de este equipo.
      if (data.logo && data.logo.dataUrl) {
        await guardarLogo(data.logo);
      }

      // Marcamos la app como inicializada para que, si luego el usuario
      // borra todo, no se repongan los datos de ejemplo por accidente.
      localStorage.setItem(INICIALIZADO_KEY, '1');

      // El respaldo trae su propio directorio de clientes: damos por hecha
      // la migracion para no volver a crear fichas desde el historial.
      localStorage.setItem(CLIENTES_MIGRADOS_KEY, '1');

      seleccionados = {};
      filtroCategoria = "Todas";
      filtroCategoria2 = "Todas";
      filtroAreaSalida = "Todas";
      filtroAreaCatalogo = "Todas";
      busqueda = "";
      busqueda2 = "";
      busquedaHistorial = "";
      busquedaClientes = "";
      clienteSeleccionadoId = "";
      sedeSeleccionadaId = "";
      document.getElementById("buscar-historial").value = "";
      document.getElementById("filtro-estado").value = "Todos";

      await render();
      // Si el respaldo trae el catálogo de pesas y todavía no hay grupos,
      // se crean ahora: es el momento en que aparecen las pesas sueltas.
      const grupos = await crearGruposPesasIniciales();
      if (grupos > 0) await render();
      avisar("Respaldo importado correctamente." +
        (grupos > 0 ? ` Se crearon además ${grupos} grupo(s) de pesas.` : ""), "ok");
    } catch (err) {
      avisar("No se pudo importar el respaldo: " + err.message, "error");
    }
  };
  reader.readAsText(file);
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
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.patrones)) {
        throw new Error("El archivo no tiene una lista de patrones valida.");
      }
      const okFusion = await confirmar({
        titulo: "Fusionar programa",
        mensaje: `El archivo trae ${data.patrones.length} patrones.\n\n` +
                 `Se AGREGARÁN los nuevos y se ACTUALIZARÁN las actividades de los existentes.\n` +
                 `Tus técnicos, clientes, historial y estados operativos NO se tocan.`,
        textoOk: "Fusionar"
      });
      if (!okFusion) return;

      // Coincidencia por codigo SIN distinguir mayusculas/minusculas: el
      // catalogo historico tiene codigos como "PTB-PEE2-03 1kg" y el
      // programa los trae en mayusculas; son el mismo patron fisico.
      const porCodigo = {};
      patrones.forEach(p => { porCodigo[normalizarCodigoPatron(p.codigo).toUpperCase()] = p; });

      let nuevos = 0, actualizados = 0, estadosCambiados = 0;
      const operaciones = [];
      for (const entrante of data.patrones) {
        if (!entrante || !entrante.codigo) continue;
        const codigo = normalizarCodigoPatron(entrante.codigo).toUpperCase();
        const existente = porCodigo[codigo];
        if (!existente) {
          operaciones.push({ store: STORES.patrones, action: 'put', item: {
            codigo,
            categoria: entrante.categoria || "Sin categoria",
            area: entrante.area || "Sin area",
            estado: entrante.estado || "Disponible",
            marca: entrante.marca || "",
            valorNominal: entrante.valorNominal || "",
            observacion: entrante.observacion || "",
            actividades: getActividades(entrante)
          }});
          nuevos++;
        } else {
          const actus = getActividades(existente);
          const nuevasActs = getActividades(entrante);
          let cambio = false;
          ACTIVIDADES_ISO.forEach(({clave}) => {
            const na = nuevasActs[clave];
            // Solo pisamos la actividad si el archivo trae algo programado
            if (na && (na.mesVencimiento || na.frecuenciaMeses)) {
              actus[clave] = na;
              cambio = true;
            }
          });
          const item = { ...existente, actividades: actus };
          if (ESTADOS_ESPECIALES_FUSION.includes(entrante.estado) && existente.estado !== entrante.estado) {
            item.estado = entrante.estado;
            estadosCambiados++;
            cambio = true;
          }
          if (!item.valorNominal && entrante.valorNominal) { item.valorNominal = entrante.valorNominal; cambio = true; }
          if (!item.marca && entrante.marca) { item.marca = entrante.marca; cambio = true; }
          if (!item.observacion && entrante.observacion) { item.observacion = entrante.observacion; cambio = true; }
          if (cambio) {
            operaciones.push({ store: STORES.patrones, action: 'put', item });
            actualizados++;
          }
        }
      }

      await runAtomicTransaction([STORES.patrones], operaciones);
      localStorage.setItem(INICIALIZADO_KEY, '1');
      await render();
      avisar(
        `Fusión completada:\n` +
        `· ${nuevos} patrones nuevos agregados\n` +
        `· ${actualizados} patrones existentes actualizados\n` +
        `· ${estadosCambiados} cambios de estado especial (Extraviado / Inoperativo)\n` +
        `Técnicos e historial quedaron intactos.`, "ok"
      );
    } catch (err) {
      avisar("No se pudo fusionar el programa: " + err.message, "error");
    }
  };
  reader.readAsText(file);
}

// ============================================================
// 13. NAVEGACIÓN POR PESTAÑAS
// ============================================================
const TABS = ["inicio","salida","historial","programa","patrones","tecnicos","clientes","inventario"];
const TAB_KEY = "metrologia_tab_activa";

function activarTab(nombre){
  if (!TABS.includes(nombre)) nombre = "inicio";
  TABS.forEach(t => {
    document.getElementById("panel-"+t).style.display = (t===nombre) ? "block" : "none";
    document.getElementById("tab-"+t).classList.toggle("active", t===nombre);
  });
  // Recordamos la pestaña para volver a ella al reabrir la app.
  try { localStorage.setItem(TAB_KEY, nombre); } catch(e){}
  render();
}

// Navegación activa extraída a js/ui/navegacion.js.
activarTab = nombre => window.MetrologiaUINavegacion.activarTab(nombre, {
  document, tabs: TABS, storageKey: TAB_KEY, render
});

// ============================================================
// 14. FUNCIONES DE REGISTRO
// ============================================================
async function registrarSalida(){
  const errBox = document.getElementById("msg-error");
  const okBox = document.getElementById("msg-ok");
  errBox.style.display="none"; okBox.style.display="none";

  const ot = document.getElementById("in-ot").value.trim();
  const tecnico = document.getElementById("in-tecnico").value;
  const fecha = document.getElementById("in-fecha").value;
  // La hora es editable (se registra una salida que ocurrio antes, o se
  // prepara la de mas tarde). Si el campo queda vacio se toma la de ahora.
  const hora = document.getElementById("in-hora").value || horaActualHHMMSS();
  const codigos = Object.keys(seleccionados).filter(k => seleccionados[k]);

  const cliente = getCliente(clienteSeleccionadoId);
  const sede = getSede(cliente, sedeSeleccionadaId);
  const empresa = cliente ? cliente.nombre : "";

  if (!ot) { errBox.textContent="Ingresa el número de OT."; errBox.style.display="block"; return; }
  if (!cliente) { errBox.textContent="Selecciona la empresa cliente (o registra una nueva)."; errBox.style.display="block"; return; }
  // La sede solo es obligatoria si la empresa tiene alguna registrada: asi las
  // empresas heredadas del historial antiguo, que aun no tienen direcciones,
  // siguen pudiendo usarse mientras el usuario las completa.
  if ((cliente.sedes || []).length > 0 && !sede) {
    errBox.textContent = "Selecciona a qué sede de " + cliente.nombre + " va el servicio.";
    errBox.style.display = "block"; return;
  }
  if (!tecnico) { errBox.textContent="Selecciona un técnico."; errBox.style.display="block"; return; }
  if (!fecha) { errBox.textContent="Indica la fecha de salida."; errBox.style.display="block"; return; }
  if (codigos.length === 0) { errBox.textContent="Selecciona al menos un patrón para el servicio."; errBox.style.display="block"; return; }

  // Revalidacion final antes de escribir: por si algun patron seleccionado
  // dejo de estar disponible (o vencio) mientras la seleccion seguia marcada.
  const noAptos = codigos
    .map(c => patrones.find(pp => pp.codigo === c))
    .filter(p => !p || p.estado !== "Disponible" || patronBloqueadoPorCalibracion(p));
  if (noAptos.length > 0) {
    errBox.textContent = "Estos patrones ya no pueden salir a servicio (no disponibles o con actividad vencida): "
      + noAptos.map(p => p ? p.codigo : "?").join(", ") + ". Quítalos de la selección.";
    errBox.style.display = "block";
    return;
  }

  // En los grupos, la cantidad pedida no puede pasarse de las piezas libres.
  const gruposExcedidos = codigos
    .map(c => patrones.find(pp => pp.codigo === c))
    .filter(esPatronGrupo)
    .map(p => ({ p, pide: cantidadSeleccionadaDe(p.codigo), hay: unidadesDisponiblesDe(p) }))
    .filter(x => x.pide > x.hay);
  if (gruposExcedidos.length > 0) {
    errBox.textContent = "Pides más piezas de las que hay libres: "
      + gruposExcedidos.map(x => `${x.p.codigo} (pides ${x.pide}, quedan ${x.hay})`).join("; ") + ".";
    errBox.style.display = "block";
    return;
  }

  const tecInfo = tecnicos.find(t => t.nombre === tecnico);
  // El encargado de laboratorio se deduce de los laboratorios de los
  // patrones que salen y se CONGELA en la fila, igual que el maletin del
  // tecnico: si mañana cambia quien lleva ese laboratorio, el acta vieja
  // sigue nombrando a quien lo llevaba el dia del servicio.
  const encargadoLaboratorio = encargadoParaCodigos(codigos);
  // Dos marcas distintas a proposito: "fechaHoraSalida" es cuando salieron
  // los patrones (la escribe el usuario y es la que ordena y sale en el
  // acta) y "registradoEn" es cuando se creo el registro (la pone el reloj
  // y nadie la toca). Sin la segunda, al hacer editable la hora se perderia
  // el rastro de cuando se dio de alta la OT de verdad.
  const fechaHoraSalida = isoDesdeFechaHoraLocal(fecha, hora);
  const registradoEn = new Date().toISOString();
  // Sello propio de ESTA salida. Es lo que mantiene separado un segundo
  // servicio de la misma OT en vez de sumarlo al registro anterior.
  const salidaId = nuevoId("sal");
  const nuevos = codigos.map(codigo => {
    const p = patrones.find(pp => pp.codigo === codigo);
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : (ot+"-"+codigo+"-"+Date.now()),
      salidaId,
      fecha,
      fechaHoraSalida,
      registradoEn,
      numeroOT: ot,
      empresa,
      // Guardamos el id (para enlazar con el directorio) y ademas una COPIA
      // del nombre, sede y direccion tal como estaban al emitir la salida.
      // Si mañana el cliente cambia de local, el acta antigua sigue diciendo
      // a donde fue realmente el patron: eso es lo que pide la trazabilidad.
      clienteId: cliente.id,
      clienteRuc: cliente.ruc || "",
      sedeId: sede ? sede.id : "",
      sede: sede ? sede.nombre : "",
      direccion: sede ? (sede.direccion || "") : "",
      contactoSede: sede ? (sede.contacto || "") : "",
      telefonoSede: sede ? (sede.telefono || "") : "",
      tecnico,
      laptop: tecInfo ? tecInfo.laptop : "",
      termohigrometro: tecInfo ? tecInfo.termohigrometro : "",
      extra: tecInfo ? tecInfo.extra : "",
      encargadoLaboratorio,
      categoria: p.categoria,
      area: p.area,
      // Se congela para que el acta reimpresa diga el valor que tenia la
      // pesa el dia que salio, aunque luego se corrija la ficha.
      valorNominal: String(p.valorNominal || p.valor || ""),
      codigo: p.codigo,
      // En los grupos guardamos cuantas piezas salieron; en el resto,
      // "cantidad" es 1 y el registro se lee igual que siempre.
      cantidad: esPatronGrupo(p) ? cantidadSeleccionadaDe(codigo) : 1,
      esGrupo: esPatronGrupo(p),
      unidadesGrupo: esPatronGrupo(p) ? unidadesDeGrupo(p) : null,
      tipoMovimiento: "Salida",
      estadoMovimiento: "En servicio",
      observaciones: []
    };
  });

  // Una sola transaccion atomica: si algo falla a mitad de camino
  // (navegador se cierra, error de escritura, etc.), NINGUNA de las
  // escrituras queda aplicada, en vez de quedar historial parcial
  // con patrones a medio actualizar.
  const operaciones = [];
  for (const item of nuevos) {
    operaciones.push({ store: STORES.historial, action: 'put', item });
  }
  for (const codigo of codigos) {
    const p = patrones.find(pp => pp.codigo === codigo);
    if (!p) continue;
    // Un grupo solo pasa a "En servicio" cuando se lleva la ultima pieza;
    // si quedan libres, sigue disponible para otra OT.
    const fueraTras = unidadesFueraDe(codigo) + (esPatronGrupo(p) ? cantidadSeleccionadaDe(codigo) : 1);
    operaciones.push({ store: STORES.patrones, action: 'put', item: {
      ...p, estado: estadoTrasMovimiento(p, fueraTras)
    }});
  }
  await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);

  const piezasRegistradas = nuevos.reduce((s, n) => s + cantidadDeRegistro(n), 0);
  seleccionados = {};
  cantidadesSeleccion = {};
  const destino = sede ? ` (${sede.nombre})` : "";
  const detallePiezas = piezasRegistradas !== nuevos.length ? ` (${piezasRegistradas} piezas)` : "";
  okBox.textContent = nuevos.length + " patrón(es)" + detallePiezas +
    " registrados en el historial para la OT " + ot + " — " + empresa + destino + ".";
  okBox.style.display="block";
  document.getElementById("in-ot").value="";
  document.getElementById("in-tecnico").value="";
  // La hora vuelve a la de ahora: si la OT anterior se registro con una hora
  // corregida a mano, la siguiente no debe heredarla sin darse cuenta.
  document.getElementById("in-fecha").value = todayISO();
  document.getElementById("in-hora").value = horaActualHHMMSS();
  // La empresa y la sede NO se limpian: lo normal es registrar varias OT
  // seguidas para el mismo cliente, y volver a elegirlo cada vez era el
  // tipo de friccion que este directorio venia a quitar.

  await render();
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

  const aviso = document.getElementById("np-modo-duplicado");
  aviso.textContent = `Copiado de ${p.codigo} — escribe el código nuevo.`;
  aviso.style.display = "inline";

  const campoCodigo = document.getElementById("np-codigo");
  campoCodigo.scrollIntoView({ behavior: "smooth", block: "center" });
  campoCodigo.focus();
}

async function agregarPatron(){
  const errBox = document.getElementById("np-error");
  const okBox = document.getElementById("np-ok");
  errBox.style.display="none"; okBox.style.display="none";

  const areaNueva = document.getElementById("np-area-nueva").value.trim();
  const areaSel = document.getElementById("np-area").value;
  const area = areaNueva || areaSel;
  const categoria = document.getElementById("np-categoria").value.trim();
  const codigo = normalizarCodigoPatron(document.getElementById("np-codigo").value);
  const estado = document.getElementById("np-estado").value;
  const marca = document.getElementById("np-marca").value.trim();

  if (!area) { errBox.textContent="Indica el laboratorio (selecciona uno existente o escribe uno nuevo)."; errBox.style.display="block"; return; }
  if (!categoria) { errBox.textContent="Indica los equipos del patrón."; errBox.style.display="block"; return; }
  if (!codigo) { errBox.textContent="Indica el código único del patrón."; errBox.style.display="block"; return; }

  const yaExiste = patrones.some(p => p.codigo.toLowerCase() === codigo.toLowerCase());
  if (yaExiste) { errBox.textContent="Ya existe un patrón con ese código único."; errBox.style.display="block"; return; }

  // Las 3 actividades ISO se configuran aqui mismo (antes habia que crear el
  // patron y luego buscarlo para editarlo: dos pasos para una sola alta).
  const { acts, error } = leerActividadesAlta();
  if (error) { errBox.textContent = error; errBox.style.display="block"; return; }

  // Normalizamos el codigo a mayusculas: IndexedDB SI distingue mayusculas/minusculas
  // en las claves, así que sin esto "PCF-001" y "pcf-001" quedarian como registros
  // distintos en la base aunque la validacion de arriba los detecte como iguales.
  const codigoNormalizado = codigo.toUpperCase();
  const esGrupo = document.getElementById("np-es-grupo").checked;
  const unidades = parseInt(document.getElementById("np-unidades").value, 10);
  if (esGrupo && (!Number.isInteger(unidades) || unidades < 1)) {
    errBox.textContent = "Indica cuántas piezas tiene el grupo (un número entero mayor que 0).";
    errBox.style.display = "block"; return;
  }

  const nuevo = {
    codigo: codigoNormalizado, categoria, area, estado, marca, valorNominal: document.getElementById("np-valor").value.trim(), observacion: "",
    modelo: document.getElementById("np-modelo").value.trim(),
    serie: document.getElementById("np-serie").value.trim(),
    lugarUso: document.getElementById("np-lugar").value,
    esGrupo,
    unidades: esGrupo ? unidades : null,
    actividades: acts
  };
  await saveRecord(STORES.patrones, nuevo);

  // Tras dar de alta dejamos el formulario listo para el siguiente equipo
  // parecido: se conservan laboratorio, equipos, marca, modelo y actividades,
  // y solo se limpian los datos propios de cada unidad.
  document.getElementById("np-codigo").value = "";
  document.getElementById("np-serie").value = "";
  document.getElementById("np-modo-duplicado").style.display = "none";
  document.getElementById("np-codigo").focus();

  await render();
  const detalleGrupo = esGrupo ? ` como grupo de ${unidades} piezas` : "";
  avisar(`Patrón ${codigoNormalizado} añadido en ${area}${detalleGrupo}. El formulario quedó listo para cargar otro igual.`, "ok", {
    etiqueta: "Deshacer",
    ejecutar: async () => {
      await deleteRecord(STORES.patrones, codigoNormalizado);
      await render();
      avisar(`Se deshizo el alta de ${codigoNormalizado}.`, "info");
    }
  });
}

// ------------------------------------------------------------
// Alta rapida de los nueve grupos de pesas M2 de 20 kg. Son los tramos
// con los que trabaja el laboratorio; crearlos a mano seria repetir nueve
// veces el mismo formulario. Los datos (area, categoria, valor nominal)
// se copian de las pesas sueltas que ya estan en el catalogo.
// ------------------------------------------------------------
const GRUPOS_PESAS_PEM2 = [
  [1, 20], [21, 40], [41, 60], [61, 80], [81, 100],
  [101, 125], [126, 150], [151, 175], [176, 200]
];

function codigoGrupoPesas(desde, hasta){
  const dosDigitos = n => String(n).padStart(2, "0");
  return `PTB-PEM2-${dosDigitos(desde)}-${dosDigitos(hasta)}`;
}

// Numero de pesa dentro de su codigo. El catalogo trae variantes como
// "PTB-PEM2-001 5kg" o "PTB-PEM2-0035kg", de ahi el parseo tolerante.
function numeroDePesaPEM2(codigo){
  const m = /^PTB-PEM2-0*(\d+)/i.exec(String(codigo || "").trim());
  return m ? parseInt(m[1], 10) : null;
}

// El valor y la categoria del grupo se deducen de las pesas que de verdad
// estan en ese tramo, no de una pesa cualquiera de la familia: entre las
// PTB-PEM2 hay sueltas de 5 y 10 kg, y un grupo de 20 kg no puede heredar
// "5 kg" solo porque esa fuera la primera que apareciera en la lista.
function datosDeRangoPesas(desde, hasta){
  const enRango = patrones.filter(p => {
    if (esPatronGrupo(p)) return false;
    const n = numeroDePesaPEM2(p.codigo);
    return n !== null && n >= desde && n <= hasta;
  });

  const masFrecuente = (lista) => {
    const cuenta = {};
    lista.filter(v => String(v || "").trim()).forEach(v => { cuenta[v] = (cuenta[v] || 0) + 1; });
    const orden = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
    return orden[0] || "";
  };

  const valor = masFrecuente(enRango.map(p => String(p.valorNominal || "").trim())) || "20 kg";
  // Para la categoria miramos toda la familia con ESE valor: dentro de un
  // tramo suelto conviven "PESAS", "Pesa" y "Pesas M2 de 20 kg" y queremos
  // la denominacion que usa el laboratorio con mas frecuencia.
  const mismosKg = patrones.filter(p => !esPatronGrupo(p) &&
    numeroDePesaPEM2(p.codigo) !== null &&
    String(p.valorNominal || "").trim() === valor);
  const categoria = masFrecuente(mismosKg.map(p => p.categoria))
                 || masFrecuente(enRango.map(p => p.categoria))
                 || "Pesas M2 de 20 kg";
  const area = masFrecuente(enRango.map(p => p.area)) || "Masa";
  const marca = masFrecuente(enRango.map(p => p.marca));
  const lugarUso = masFrecuente(enRango.map(p => p.lugarUso)) || "Campo";
  return { valor, categoria, area, marca, lugarUso, encontradas: enRango.length };
}

// Los nueve grupos se crean SOLOS la primera vez, como ya se hace con el
// directorio de clientes. Antes esto era un boton en la pantalla de
// patrones, pero era un boton de un solo uso: se pulsa una vez en la vida
// del laboratorio y despues estorba ahi para siempre.
const GRUPOS_PESAS_KEY = 'metrologia_grupos_pesas_creados';

async function crearGruposPesasIniciales(){
  try { if (localStorage.getItem(GRUPOS_PESAS_KEY)) return 0; } catch(e){}

  // Sin pesas sueltas en el catalogo no hay nada que agrupar. NO marcamos
  // la bandera: si el usuario importa su catalogo despues, los grupos se
  // crean entonces en vez de perderse para siempre.
  const hayPesasSueltas = patrones.some(p => !esPatronGrupo(p) && numeroDePesaPEM2(p.codigo) !== null);
  if (!hayPesasSueltas) return 0;

  const aCrear = GRUPOS_PESAS_PEM2
    .map(([desde, hasta]) => ({ desde, hasta, codigo: codigoGrupoPesas(desde, hasta) }))
    .filter(g => !patrones.some(p => p.codigo.toUpperCase() === g.codigo))
    .map(g => ({ ...g, datos: datosDeRangoPesas(g.desde, g.hasta) }));

  const marcarHecho = () => { try { localStorage.setItem(GRUPOS_PESAS_KEY, '1'); } catch(e){} };
  if (!aCrear.length) { marcarHecho(); return 0; }

  const operaciones = aCrear.map(g => ({
    store: STORES.patrones, action: 'put', item: {
      codigo: g.codigo,
      area: g.datos.area,
      categoria: g.datos.categoria,
      estado: "Disponible",
      marca: g.datos.marca,
      valorNominal: g.datos.valor,
      observacion: `Grupo de pesas ${g.desde} a ${g.hasta} (${g.datos.valor}).`,
      modelo: "", serie: "",
      lugarUso: g.datos.lugarUso,
      esGrupo: true,
      unidades: g.hasta - g.desde + 1,
      rangoDesde: g.desde,
      rangoHasta: g.hasta,
      actividades: { CAL: actividadVacia(), V: actividadVacia(), M: actividadVacia() }
    }
  }));

  await runAtomicTransaction([STORES.patrones], operaciones);
  marcarHecho();
  gruposPesasRecienCreados = aCrear.map(g => g.codigo);
  return aCrear.length;
}

// Se guarda para poder ofrecer "Deshacer" desde el aviso del arranque.
let gruposPesasRecienCreados = [];

async function deshacerGruposPesasIniciales(){
  if (!gruposPesasRecienCreados.length) return;
  await runAtomicTransaction([STORES.patrones],
    gruposPesasRecienCreados.map(codigo => ({ store: STORES.patrones, action: 'delete', key: codigo })));
  gruposPesasRecienCreados = [];
  await render();
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

async function agregarTecnico(){
  const errBox = document.getElementById("nt-error");
  const okBox = document.getElementById("nt-ok");
  errBox.style.display="none"; okBox.style.display="none";

  const nombre = normalizarNombre(document.getElementById("nt-nombre").value);
  const rol = document.getElementById("nt-rol").value === ROL_SUPERVISOR ? ROL_SUPERVISOR : ROL_TECNICO;
  const laptop = document.getElementById("nt-laptop").value.trim();
  const termo = document.getElementById("nt-termo").value.trim();
  const extra = document.getElementById("nt-extra").value.trim();
  const labs = [...document.querySelectorAll("#nt-laboratorios .nt-lab:checked")].map(c => c.value);

  if (!nombre) { errBox.textContent="Indica el nombre de la persona."; errBox.style.display="block"; return; }
  const yaExiste = tecnicos.some(t => t.nombre.toLowerCase() === nombre.toLowerCase());
  if (yaExiste) { errBox.textContent="Ya existe alguien con ese nombre en el personal."; errBox.style.display="block"; return; }
  // Un encargado sin laboratorios no saldria en ninguna acta: mejor avisar
  // ahora que descubrirlo cuando el acta sale con el hueco vacio.
  if (rol === ROL_SUPERVISOR && !labs.length) {
    errBox.textContent="Marca al menos un laboratorio a su cargo: es lo que hace que su nombre salga en las actas.";
    errBox.style.display="block"; return;
  }

  const nuevo = rol === ROL_SUPERVISOR
    ? { nombre, rol, laboratorios: labs, activo: true }
    : { nombre, rol, laptop, termohigrometro: termo, extra, activo: true };
  await saveRecord(STORES.tecnicos, nuevo);
  okBox.textContent = nombreRol(rol) + " " + nombre + " añadido correctamente.";
  okBox.style.display="block";
  document.getElementById("nt-nombre").value="";
  document.getElementById("nt-laptop").value="";
  document.getElementById("nt-termo").value="";
  document.getElementById("nt-extra").value="";
  await render();
  alternarCamposPersonal();
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
    if (!valor) return;

    if (tipo === 'tecnico') {
      const registrosABorrar = historial.filter(h => h.tecnico === valor);
      const operaciones = registrosABorrar.map(reg => ({ store: STORES.historial, action: 'delete', key: reg.id }));
      operaciones.push({ store: STORES.tecnicos, action: 'delete', key: valor });

      // Bug corregido: antes de borrar el historial de este tecnico,
      // liberamos cualquier patron que siga "En servicio" por una OT
      // suya, para que no queden bloqueados permanentemente sin forma
      // de devolverlos (el boton de devolucion vive en esas filas de
      // historial que estamos a punto de borrar).
      const codigosAfectados = new Set(
        registrosABorrar
          .filter(reg => !movimientoCerrado(reg))
          .map(reg => reg.codigo)
      );
      for (const codigo of codigosAfectados) {
        const p = patrones.find(pp => pp.codigo === codigo);
        if (p && p.estado === "En servicio") {
          operaciones.push({ store: STORES.patrones, action: 'put', item: { ...p, estado: "Disponible" } });
        }
      }

      const tecnicoBorrado = tecnicos.find(t => t.nombre === valor);
      await runAtomicTransaction([STORES.historial, STORES.tecnicos, STORES.patrones], operaciones);
      cerrarModalEliminarTotal();
      await render();
      const avisoPatrones = codigosAfectados.size > 0
        ? ` Se liberaron ${codigosAfectados.size} patrón(es) que estaban en servicio por este técnico.`
        : "";
      avisar(`Técnico ${valor} y su historial fueron eliminados.${avisoPatrones}`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => {
          const ops = registrosABorrar.map(h => ({ store: STORES.historial, action: 'put', item: h }));
          if (tecnicoBorrado) ops.push({ store: STORES.tecnicos, action: 'put', item: tecnicoBorrado });
          await runAtomicTransaction([STORES.historial, STORES.tecnicos], ops);
          await render();
          avisar(`Se restauró al técnico ${valor} y su historial.`, "ok");
        }
      });
    } else {
      const registrosABorrar = historial.filter(h => h.codigo === valor);
      const operaciones = registrosABorrar.map(reg => ({ store: STORES.historial, action: 'delete', key: reg.id }));
      // El borrado total tambien debe llevarse su hoja de vida, o quedarian
      // registros de actividades apuntando a un patron que ya no existe.
      actividadesEjecutadas
        .filter(a => a.codigoPatron === valor)
        .forEach(a => operaciones.push({ store: STORES.actividades, action: 'delete', key: a.id }));
      operaciones.push({ store: STORES.patrones, action: 'delete', key: valor });

      const patronBorrado = patrones.find(p => p.codigo === valor);
      const actsBorradas = actividadesEjecutadas.filter(a => a.codigoPatron === valor);
      await runAtomicTransaction([STORES.historial, STORES.patrones, STORES.actividades], operaciones);
      delete seleccionados[valor];
      cerrarModalEliminarTotal();
      await render();
      avisar(`Patrón ${valor} y su historial fueron eliminados.`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: () => restaurarRegistros(
          patronBorrado ? [patronBorrado] : [], registrosABorrar, actsBorradas)
      });
    }
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
    const codigo = modalCalibracionCodigoObjetivo;
    if (!codigo) return;
    const errBox = document.getElementById("modal-cal-error");
    errBox.style.display = "none";

    const claveActividad = document.getElementById("modal-cal-actividad").value;
    const nombreActividad = ACTIVIDADES_ISO.find(a => a.clave === claveActividad).nombre;
    const fecha = document.getElementById("modal-cal-fecha").value;
    const intervaloRaw = document.getElementById("modal-cal-intervalo").value;
    const intervalo = intervaloRaw ? parseInt(intervaloRaw, 10) : NaN;
    const documento = document.getElementById("modal-cal-documento").value.trim();

    if (!fecha) { errBox.textContent = "Indica la fecha de ejecución."; errBox.style.display = "block"; return; }
    if (!Number.isInteger(intervalo) || intervalo < 1) {
      errBox.textContent = "La frecuencia debe ser un número entero de meses mayor a 0.";
      errBox.style.display = "block"; return;
    }

    const patron = patrones.find(p => p.codigo === codigo);
    if (!patron) { cerrarModalCalibracion(); return; }

    const mesFecha = fecha.slice(0,7);
    const proximoVencimiento = sumarMesesAMes(mesFecha, intervalo);

    const actividadesActuales = getActividades(patron);
    actividadesActuales[claveActividad] = {
      frecuenciaMeses: intervalo,
      mesVencimiento: proximoVencimiento,
      ultimoDocumento: documento,
      ultimaFechaEjecucion: fecha,
      tipoCalibracion: document.getElementById("modal-cal-tipo").value || null
    };

    // Al registrar la actividad, el patron tambien se libera operativamente
    // si estaba "En mantenimiento" por causa de ella (no tocamos "En
    // servicio" ni "De baja": esos siguen su propio flujo normal).
    const nuevoEstadoOperativo = patron.estado === "En mantenimiento" ? "Disponible" : patron.estado;

    // ISO 17025 (6.4.13): hay que conservar el registro de TODAS las
    // calibraciones/comprobaciones/mantenimientos, no solo el ultimo.
    // Por eso, ademas de actualizar el patron, guardamos una fila nueva
    // e inmutable en el historial acumulado de actividades. Ambas
    // escrituras van en una sola transaccion atomica.
    const registroActividad = {
      id: (crypto.randomUUID ? crypto.randomUUID() : codigo + "-" + claveActividad + "-" + Date.now()),
      codigoPatron: codigo,
      clave: claveActividad,
      nombreActividad,
      tipo: document.getElementById("modal-cal-tipo").value || null,
      fechaEjecucion: fecha,
      documento,
      frecuenciaMeses: intervalo,
      mesVencimientoResultante: proximoVencimiento,
      registradoEn: new Date().toISOString()
    };

    await runAtomicTransaction([STORES.patrones, STORES.actividades], [
      { store: STORES.patrones, action: 'put', item: {
          ...patron, estado: nuevoEstadoOperativo, actividades: actividadesActuales } },
      { store: STORES.actividades, action: 'put', item: registroActividad }
    ]);

    cerrarModalCalibracion();
    await render();
    avisar(`${nombreActividad} registrada para ${codigo}. Próximo vencimiento: ${formatMesISO(proximoVencimiento)}.`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        // Volvemos el patron a como estaba y quitamos la fila del historial.
        await runAtomicTransaction([STORES.patrones, STORES.actividades], [
          { store: STORES.patrones, action: 'put', item: patron },
          { store: STORES.actividades, action: 'delete', key: registroActividad.id }
        ]);
        await render();
        avisar(`Se deshizo el registro de ${nombreActividad} en ${codigo}.`, "info");
      }
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
  // Captura en fase de captura para poder tragar las teclas del lector
  // antes de que lleguen al campo que tenga el foco.
  document.addEventListener("keydown", manejarTeclaLector, true);

  // Los dos campos de escaneo dedicados: aqui Enter siempre vale, tanto si
  // vino del lector como si el codigo se tecleo a mano.
  [["escaneo-salida", procesarEscaneoSalida], ["escaneo-devolucion", procesarEscaneoDevolucion]]
    .forEach(([id, procesar]) => {
      const campo = document.getElementById(id);
      // Si el lector dispara con el cursor DENTRO del campo, el navegador
      // escribe los caracteres ya traducidos por la distribucion activa.
      // Guardamos en paralelo la lectura por tecla fisica para poder
      // corregirlo igual que en la captura global.
      let fisico = "", ultima = 0;
      campo.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "Tab") {
          const valor = campo.value.trim();
          if (!valor) { fisico = ""; return; }
          e.preventDefault();
          const candidatos = fisico.length === valor.length ? [valor, fisico] : [valor];
          campo.value = "";
          fisico = "";
          procesar(resolverCodigoLeido(candidatos));
          return;
        }
        if (e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
        const ahora = Date.now();
        // Una pausa larga o un campo vacio empiezan una lectura nueva.
        if (ahora - ultima > ESCANER_MS_REINICIO || !campo.value) fisico = "";
        ultima = ahora;
        const c = charDesdeTeclaFisica(e);
        fisico += (c !== null ? c : e.key);
      });
      // Si se edita el campo a mano (borrar, pegar), la lectura fisica ya
      // no corresponde: se descarta y vale lo que hay escrito.
      campo.addEventListener("paste", () => { fisico = ""; });
      campo.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" || e.key === "Delete") fisico = "";
      });
    });

  // Sonido: una sola preferencia, dos casillas que la reflejan.
  const casillasSonido = ["escaneo-sonido-salida", "escaneo-sonido-devolucion"]
    .map(id => document.getElementById(id));
  casillasSonido.forEach(chk => {
    chk.checked = sonidoEscanerActivo();
    chk.addEventListener("change", () => {
      fijarSonidoEscaner(chk.checked);
      casillasSonido.forEach(otra => { otra.checked = chk.checked; });
      if (chk.checked) pitido("ok");
    });
  });

  // --- Devolucion por escaner ---
  document.getElementById("btn-devolucion-escaner").addEventListener("click", abrirModalDevolucion);
  document.getElementById("dev-cerrar").addEventListener("click", cerrarModalDevolucion);
  document.getElementById("dev-confirmar").addEventListener("click", confirmarDevolucionMasiva);
  document.getElementById("dev-vaciar").addEventListener("click", () => {
    devolucionPendiente = [];
    renderListaDevolucion();
    document.getElementById("escaneo-devolucion").focus();
  });
  document.getElementById("modal-devolucion").addEventListener("click", (e) => {
    if (e.target.id === "modal-devolucion") cerrarModalDevolucion();
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
    if (document.getElementById("modal-logo").classList.contains("open")) { cerrarModalLogo(); return; }
    if (document.getElementById("modal-devolucion").classList.contains("open")) { cerrarModalDevolucion(); return; }
    if (document.getElementById("modal-editar-ot").classList.contains("open")) { cerrarModalEditarOT(); return; }
    if (document.getElementById("modal-ficha").classList.contains("open")) { cerrarFichaPatron(); return; }
    if (document.getElementById("modal-calibracion").classList.contains("open")) { cerrarModalCalibracion(); return; }
    if (document.getElementById("modal-solicitud").classList.contains("open")) { cerrarModalSolicitud(); return; }
    if (document.getElementById("modal-eliminar-total").classList.contains("open")) { cerrarModalEliminarTotal(); }
  });

  // --- Arranque de datos ---
  try {
    await openDB();
    await cargarLogoGuardado();
    await migrarDesdeLocalStorage();
    await cargarDatosIniciales();
    const clientesCreados = await migrarClientesDesdeHistorial();
    await restaurarCarpetaDatos();
    await render();

    // Los grupos se crean despues del primer render: hacen falta los
    // patrones ya cargados para deducir el valor nominal de cada tramo.
    const gruposCreados = await crearGruposPesasIniciales();
    if (gruposCreados > 0) {
      await render();
      avisar(
        `Se crearon ${gruposCreados} grupo(s) de pesas (PTB-PEM2-01-20, 21-40, …) para poder sacar varias ` +
        `de una vez sin escanearlas una por una. Tus pesas sueltas no se tocaron.`,
        "info",
        { etiqueta: "Deshacer", ejecutar: deshacerGruposPesasIniciales }
      );
    }

    if (clientesCreados > 0) {
      avisar(
        `Se crearon ${clientesCreados} empresa(s) en el nuevo directorio de clientes a partir de tu historial. ` +
        `Entra a la pestaña «Clientes» para añadirles sus sedes y direcciones.`,
        "info"
      );
    }
  } catch (error) {
    console.error("Error al inicializar la aplicación:", error);
    avisarPersistente(
      "Hubo un problema al cargar los datos. Revisa la consola (F12) para más detalles.\n" +
      "Tus datos no se han modificado.",
      "error",
      { etiqueta: "Reintentar", ejecutar: () => location.reload() }
    );
    return;
  }

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

  // --- Programa anual (calendario) ---
  ["prog-anio","prog-area","prog-actividad"].forEach(id =>
    document.getElementById(id).addEventListener("change", renderPrograma));
  document.getElementById("prog-buscar").addEventListener("input", renderPrograma);
  document.getElementById("btn-programa-pdf").addEventListener("click", descargarProgramaPDF);
  document.getElementById("tab-programa").addEventListener("click", ()=>activarTab("programa"));

  // --- Alta de patrones: bloques de actividad y duplicado ---
  construirBloquesActividadAlta();
  document.getElementById("btn-limpiar-alta").addEventListener("click", limpiarFormularioAlta);
  document.getElementById("np-es-grupo").addEventListener("change", (e) => {
    document.getElementById("np-grupo-campos").style.display = e.target.checked ? "block" : "none";
  });

  // --- Pestañas ---
  document.getElementById("tab-inicio").addEventListener("click", ()=>activarTab("inicio"));
  document.getElementById("tab-salida").addEventListener("click", ()=>activarTab("salida"));
  document.getElementById("tab-historial").addEventListener("click", ()=>activarTab("historial"));
  document.getElementById("tab-patrones").addEventListener("click", ()=>activarTab("patrones"));
  document.getElementById("tab-tecnicos").addEventListener("click", ()=>activarTab("tecnicos"));
  document.getElementById("tab-clientes").addEventListener("click", ()=>activarTab("clientes"));
  document.getElementById("tab-inventario").addEventListener("click", ()=>activarTab("inventario"));

  // --- Empresa y sede en la pantalla de salida ---
  // Mientras se teclea solo se resuelve (por si se completa con el
  // autocompletado); el alta de empresa nueva se ofrece al salir del campo o
  // al pulsar Enter, para no abrir el formulario a media palabra.
  document.getElementById("in-cliente").addEventListener("input", () => {
    document.getElementById("bloque-sede-nueva").classList.remove("open");
    resolverClienteEscrito();
  });
  document.getElementById("in-cliente").addEventListener("change", () => {
    resolverClienteEscrito({ abrirAltaSiNoExiste: true });
  });
  document.getElementById("in-cliente").addEventListener("blur", () => {
    resolverClienteEscrito({ abrirAltaSiNoExiste: true });
  });
  document.getElementById("in-cliente").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      resolverClienteEscrito({ abrirAltaSiNoExiste: true });
    }
  });
  document.getElementById("in-sede").addEventListener("change", (e) => {
    const valor = e.target.value;
    if (valor === OPCION_NUEVA_SEDE) { abrirBloqueSedeNueva(); return; }
    document.getElementById("bloque-sede-nueva").classList.remove("open");
    sedeSeleccionadaId = valor;
    actualizarCajaDireccion();
  });
  document.getElementById("btn-guardar-cliente-nuevo").addEventListener("click", guardarClienteNuevoDesdeSalida);
  document.getElementById("btn-cancelar-cliente-nuevo").addEventListener("click", cerrarBloqueClienteNuevo);
  document.getElementById("btn-guardar-sede-nueva").addEventListener("click", guardarSedeNuevaDesdeSalida);
  document.getElementById("btn-cancelar-sede-nueva").addEventListener("click", cerrarBloqueSedeNueva);

  // --- Pestaña de clientes ---
  document.getElementById("btn-agregar-cliente").addEventListener("click", agregarClienteDesdePestaña);
  document.getElementById("buscar-clientes").addEventListener("input", (e) => {
    busquedaClientes = e.target.value;
    renderClientes();
  });

  // --- Filtros y busquedas ---
  document.getElementById("in-tecnico").addEventListener("change", render);
  document.getElementById("filtro-cat").addEventListener("change", (e)=>{ filtroCategoria=e.target.value; render(); });
  document.getElementById("buscar").addEventListener("input", (e)=>{ busqueda=e.target.value; render(); });
  document.getElementById("filtro-cat2").addEventListener("change", (e)=>{ filtroCategoria2=e.target.value; renderCatalogoPatrones(); });
  document.getElementById("filtro-estado").addEventListener("change", renderCatalogoPatrones);
  document.getElementById("filtro-calibracion").addEventListener("change", renderCatalogoPatrones);
  document.getElementById("filtro-tipocal").addEventListener("change", renderCatalogoPatrones);
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
  // --- Medidas de etiqueta ---
  document.querySelectorAll('input[name="formato-etiqueta"]').forEach(radio => {
    radio.addEventListener("change", alternarMedidaPersonalizada);
  });
  ["etiqueta-ancho", "etiqueta-alto", "etiqueta-separacion"].forEach(id => {
    document.getElementById(id).addEventListener("input", () => {
      guardarMedidaPersonalizada();
      mostrarInfoMedidaEtiqueta();
    });
  });
  document.getElementById("btn-medir-etiquetas").addEventListener("click", mostrarInfoMedidaEtiqueta);
  document.getElementById("etiqueta-con-barras").addEventListener("change", () => {
    if (formatoEtiquetaElegido() === 'personalizado') mostrarInfoMedidaEtiqueta();
  });
  document.getElementById("etiqueta-agrupar-equipos")?.addEventListener("change", () => {
    guardarPreferenciaAgrupar();
    if (formatoEtiquetaElegido() === 'personalizado') mostrarInfoMedidaEtiqueta();
  });
  restaurarMedidaPersonalizada();
  restaurarPreferenciaAgrupar();
  alternarMedidaPersonalizada();

  document.getElementById("btn-descargar-etiquetas-pdf").addEventListener("click", descargarEtiquetasPDF);
  // Cada seccion del inventario trae su propio boton de descarga, y las
  // secciones se vuelven a pintar en cada render: el listener va en el
  // contenedor, no en cada boton.
  document.getElementById("inventario-contenido").addEventListener("click", (e) => {
    const pdf = e.target.closest(".btn-inv-pdf");
    if (pdf) { descargarInventarioPDF(pdf.dataset.area); return; }
    const plegar = e.target.closest(".btn-inv-plegar");
    if (plegar) alternarSeccionInventario(plegar.dataset.area);
  });

  // Índice de laboratorios: salta a la sección y la abre si estaba plegada.
  document.getElementById("inventario-indice").addEventListener("click", (e) => {
    const chip = e.target.closest(".btn-inv-ir");
    if (!chip) return;
    const area = chip.dataset.area;
    if (areasColapsadas().includes(area)) alternarSeccionInventario(area);
    const destino = document.getElementById(idSeccionInventario(area));
    if (destino) destino.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("btn-imprimir-etiquetas").addEventListener("click", imprimirEtiquetasSeleccionadas);
  document.getElementById("btn-limpiar-etiquetas").addEventListener("click", limpiarSeleccionEtiquetas);
  document.getElementById("buscar-inventario").addEventListener("input", renderInventario);
  document.getElementById("buscar2").addEventListener("input", renderCatalogoPatrones);
  document.getElementById("btn-limpiar").addEventListener("click", ()=>{ seleccionados={}; cantidadesSeleccion={}; render(); });
  document.getElementById("btn-limpiar-resumen").addEventListener("click", ()=>{ seleccionados={}; cantidadesSeleccion={}; render(); });

  document.getElementById("buscar-historial").addEventListener("input", (e) => {
    busquedaHistorial = e.target.value;
    renderHistorial();
  });

  // --- Formularios ---
  document.getElementById("btn-registrar").addEventListener("click", registrarSalida);
  document.getElementById("btn-agregar-patron").addEventListener("click", agregarPatron);
  document.getElementById("btn-agregar-tecnico").addEventListener("click", agregarTecnico);
  document.getElementById("nt-rol").addEventListener("change", alternarCamposPersonal);

  // --- Backups ---
  document.getElementById("btn-exportar-backup").addEventListener("click", descargarBackup);
  document.getElementById("btn-importar-backup").addEventListener("click", ()=>{
    document.getElementById("input-importar-backup").click();
  });
  document.getElementById("input-importar-backup").addEventListener("change", (e)=>{
    if (e.target.files && e.target.files[0]) importarBackup(e.target.files[0]);
    e.target.value = "";
  });
  document.getElementById("btn-importar-fusion").addEventListener("click", ()=>{
    document.getElementById("input-importar-fusion").click();
  });
  document.getElementById("input-importar-fusion").addEventListener("change", (e)=>{
    if (e.target.files && e.target.files[0]) importarFusion(e.target.files[0]);
    e.target.value = "";
  });

  // --- Logo del encabezado del PDF ---
  document.getElementById("btn-logo").addEventListener("click", abrirModalLogo);
  document.getElementById("logo-cerrar").addEventListener("click", cerrarModalLogo);
  document.getElementById("modal-logo").addEventListener("click", (e)=>{
    if (e.target.id === "modal-logo") cerrarModalLogo();
  });
  document.getElementById("logo-elegir").addEventListener("click", ()=>{
    document.getElementById("input-logo").click();
  });
  document.getElementById("input-logo").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (file) await cambiarLogoDesdeArchivo(file);
  });
  document.getElementById("logo-restaurar").addEventListener("click", async ()=>{
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
