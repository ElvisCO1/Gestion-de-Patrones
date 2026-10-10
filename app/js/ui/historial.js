// 8.  RENDERIZADO DEL HISTORIAL
// ============================================================
function renderHistorial(){
  const histBox = document.getElementById("historial-lista");
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

  // El historial se lee por orden de generacion: la OT registrada mas
  // recientemente arriba. No es lo mismo que la fecha de salida, que se
  // escribe a mano y puede ser anterior: si hoy das de alta una salida
  // fechada la semana pasada, sale arriba porque es lo ultimo que hiciste.
  const grupos = agruparPorOT(filtrados).sort((a, b) => {
    const ga = String(a.generadoEn || ""), gb = String(b.generadoEn || "");
    if (ga !== gb) return ga < gb ? 1 : -1;
    // Mismo instante: el numero de OT deja el orden estable entre recargas.
    return String(b.numeroOT || "").localeCompare(String(a.numeroOT || ""), "es", { numeric: true });
  });
  grupos.forEach(grupo => {
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

    const obsOtHtml = grupo.observacionesOT.length
      ? `<div class="obs-bloque">${grupo.observacionesOT.map(observacionHTML).join("")}</div>`
      : "";

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
          <button class="btn-descargar btn-primario" data-salida="${escapeHTML(grupo.salidaId)}">Descargar PDF</button>
          <button class="btn-eliminar-ot btn-mini" data-salida="${escapeHTML(grupo.salidaId)}">Eliminar OT</button>
        </div>
      </div>
      ${obsOtHtml}
      ${patronesHtml}
    `;
    histBox.appendChild(div);
  });

  histBox.querySelectorAll(".btn-devuelto-mini").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const reg = historial.find(h => h.id === id);
      if (!reg) return;
      const p = patrones.find(p => p.codigo === reg.codigo);

      const operaciones = [];
      if (p) {
        // Al cerrar el movimiento vuelven sus piezas: en un grupo puede que
        // sigan fuera otras de otra OT, asi que el estado se recalcula.
        const fueraTras = unidadesFueraDe(reg.codigo) - cantidadDeRegistro(reg);
        operaciones.push({ store: STORES.patrones, action: 'put', item: {
          ...p, estado: estadoTrasMovimiento(p, fueraTras)
        }});
      }
      // Dejamos trazabilidad de la devolucion en el propio registro de
      // historial en vez de solo cambiar el estado del patron y perder
      // el dato de cuando volvio.
      operaciones.push({
        store: STORES.historial,
        action: 'put',
        item: { ...reg, estadoMovimiento: "Devuelto", fechaHoraDevolucion: new Date().toISOString() }
      });

      await runAtomicTransaction([STORES.patrones, STORES.historial], operaciones);
      await render();
    });
  });

  histBox.querySelectorAll(".btn-otro-servicio-mini").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      const reg = historial.find(h => h.id === id);
      if (!reg) return;
      const p = patrones.find(p => p.codigo === reg.codigo);

      const operaciones = [];
      if (p) {
        // Al cerrar el movimiento vuelven sus piezas: en un grupo puede que
        // sigan fuera otras de otra OT, asi que el estado se recalcula.
        const fueraTras = unidadesFueraDe(reg.codigo) - cantidadDeRegistro(reg);
        operaciones.push({ store: STORES.patrones, action: 'put', item: {
          ...p, estado: estadoTrasMovimiento(p, fueraTras)
        }});
      }
      // Trazabilidad: queda registrado que este patron salio de la OT
      // anterior directo a otro servicio, sin pasar por el laboratorio.
      operaciones.push({
        store: STORES.historial,
        action: 'put',
        item: { ...reg, estadoMovimiento: "Enviado a otro servicio", fechaHoraDevolucion: new Date().toISOString() }
      });

      await runAtomicTransaction([STORES.patrones, STORES.historial], operaciones);
      // Se AÑADE a la seleccion, no se reemplaza: lo normal es mandar varios
      // patrones seguidos al mismo servicio nuevo, y antes cada clic borraba
      // el anterior y solo quedaba el ultimo.
      seleccionados[reg.codigo] = true;
      filtroAreaSalida = "Todas";
      filtroCategoria = "Todas";
      document.getElementById("buscar").value = "";
      busqueda = "";
      await render();
      activarTab("salida");
      const okBox = document.getElementById("msg-ok");
      const n = Object.values(seleccionados).filter(Boolean).length;
      okBox.textContent = n > 1
        ? `Patrón ${reg.codigo} añadido: ya hay ${n} patrones listos para el nuevo servicio. `
          + `Puedes seguir enviando más desde el historial o completar los datos de la nueva OT.`
        : `Patrón ${reg.codigo} listo para asignar a un nuevo servicio. Completa los datos de la nueva OT.`;
      okBox.style.display = "block";
    });
  });

  histBox.querySelectorAll(".btn-obs-mini").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirModalObservacion({ registroId: e.target.getAttribute("data-id") });
    });
  });

  histBox.querySelectorAll(".btn-obs-ot").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirModalObservacion({ salidaId: e.target.getAttribute("data-salida") });
    });
  });

  histBox.querySelectorAll(".btn-editar-ot").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirModalEditarOT(e.target.getAttribute("data-salida"));
    });
  });

  histBox.querySelectorAll(".btn-corregir-mini").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirModalObservacion({ registroId: e.target.getAttribute("data-id"), correccion: true });
    });
  });

  histBox.querySelectorAll(".btn-descargar").forEach(btn => {
    btn.addEventListener("click", (e) => {
      descargarActaPDF(e.target.getAttribute("data-salida"));
    });
  });

  histBox.querySelectorAll(".btn-eliminar-ot").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      await eliminarOT(e.target.getAttribute("data-salida"));
    });
  });
}

// ------------------------------------------------------------
// Modal de observaciones. Tres usos, un solo modal:
//   1. Observacion sobre un patron concreto de una OT.
//   2. Observacion sobre la OT completa.
//   3. Correccion de una devolucion equivocada (obliga a escribir el
//      motivo y ademas reabre el movimiento).
// ------------------------------------------------------------
let obsDestino = null;

function abrirModalObservacion({ registroId = null, salidaId = null, correccion = false }){
  obsDestino = { registroId, salidaId, correccion };

  const titulo = document.getElementById("obs-titulo");
  const contexto = document.getElementById("obs-contexto");
  const labelTexto = document.getElementById("obs-label-texto");
  const textarea = document.getElementById("obs-texto");
  const btnGuardar = document.getElementById("obs-guardar");

  document.getElementById("obs-error").style.display = "none";
  textarea.value = "";

  if (correccion) {
    const reg = historial.find(h => h.id === registroId);
    titulo.textContent = "Corregir devolución";
    contexto.innerHTML = reg
      ? `El patrón <b>${escapeHTML(reg.codigo)}</b> de la OT <b>${escapeHTML(reg.numeroOT)}</b> figura como
         «${escapeHTML(reg.estadoMovimiento)}». Al confirmar volverá a marcarse <b>en servicio</b> y el patrón
         quedará otra vez fuera del laboratorio.`
      : "";
    labelTexto.textContent = "Motivo de la corrección (obligatorio)";
    textarea.placeholder = "Ej: Se marcó devuelto por error; el patrón sigue en la sede del cliente.";
    btnGuardar.textContent = "Corregir y reabrir";
  } else if (registroId) {
    const reg = historial.find(h => h.id === registroId);
    titulo.textContent = "Añadir observación";
    contexto.innerHTML = reg
      ? `Patrón <b>${escapeHTML(reg.codigo)}</b> · OT <b>${escapeHTML(reg.numeroOT)}</b> · ${escapeHTML(reg.empresa || "")}`
      : "";
    labelTexto.textContent = "Observación";
    textarea.placeholder = "Ej: El cliente reportó golpe en el estuche durante el traslado.";
    btnGuardar.textContent = "Guardar observación";
  } else {
    // La observacion es de TODA la salida, no de la OT entera: si esa OT ha
    // tenido varios servicios, se dice de cual se trata.
    const filas = historial.filter(h => claveSalida(h) === salidaId);
    const ref = filas[0];
    const n = numeroDeServicio(salidaId);
    titulo.textContent = "Observación del servicio";
    contexto.innerHTML = ref
      ? `Aplica a todo este servicio de la orden <b>${escapeHTML(ref.numeroOT)}</b>`
        + (n ? ` (servicio ${n})` : "")
        + ` del ${escapeHTML(formatFecha(ref.fecha))}.`
      : "";
    labelTexto.textContent = "Observación";
    textarea.placeholder = "Ej: El servicio se reprogramó; los patrones permanecieron en la sede dos días más.";
    btnGuardar.textContent = "Guardar observación";
  }

  document.getElementById("modal-observacion").classList.add("open");
  textarea.focus();
}

function cerrarModalObservacion(){
  document.getElementById("modal-observacion").classList.remove("open");
  obsDestino = null;
}

async function guardarObservacion(){
  if (!obsDestino) return;
  const err = document.getElementById("obs-error");
  err.style.display = "none";

  const texto = document.getElementById("obs-texto").value.trim();
  const autor = document.getElementById("obs-autor").value.trim();
  if (!texto) {
    err.textContent = obsDestino.correccion
      ? "Escribe el motivo de la corrección: queda como constancia del error."
      : "Escribe la observación.";
    err.style.display = "block";
    return;
  }

  const { registroId, salidaId, correccion } = obsDestino;

  // --- Caso 3: correccion de devolucion ---
  if (correccion) {
    const reg = historial.find(h => h.id === registroId);
    if (!reg) { cerrarModalObservacion(); return; }

    const obs = nuevaObservacion({ texto, autor, alcance: "patron", tipo: "correccion" });
    // El registro original NO se borra: la devolucion anulada se archiva
    // con su fecha y su motivo dentro del propio movimiento.
    const anuladas = Array.isArray(reg.devolucionesAnuladas) ? [...reg.devolucionesAnuladas] : [];
    anuladas.push({
      estadoAnterior: reg.estadoMovimiento,
      fechaHoraDevolucion: reg.fechaHoraDevolucion || "",
      motivo: texto,
      autor,
      anuladoEn: new Date().toISOString()
    });

    const registroCorregido = {
      ...reg,
      estadoMovimiento: "En servicio",
      fechaHoraDevolucion: "",
      devolucionesAnuladas: anuladas,
      observaciones: [...(Array.isArray(reg.observaciones) ? reg.observaciones : []), obs]
    };

    const operaciones = [{ store: STORES.historial, action: 'put', item: registroCorregido }];
    const patron = patrones.find(p => p.codigo === reg.codigo);
    // Solo devolvemos el patron a "En servicio" si esta libre. Si ya salio
    // en otra OT posterior, no le pisamos su estado actual.
    if (patron && patron.estado === "Disponible") {
      operaciones.push({ store: STORES.patrones, action: 'put', item: { ...patron, estado: "En servicio" } });
    }

    await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
    cerrarModalObservacion();
    await render();

    const aviso = (patron && patron.estado !== "Disponible")
      ? ` El patrón ya estaba en otro estado ("${patron.estado}") y no se modificó.`
      : "";
    avisar(`Devolución de ${reg.codigo} corregida: vuelve a figurar en servicio.${aviso}`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        const ops = [{ store: STORES.historial, action: 'put', item: reg }];
        if (patron) ops.push({ store: STORES.patrones, action: 'put', item: patron });
        await runAtomicTransaction([STORES.historial, STORES.patrones], ops);
        await render();
        avisar("Se deshizo la corrección.", "info");
      }
    });
    return;
  }

  // --- Casos 1 y 2: observacion normal ---
  const alcance = registroId ? "patron" : "OT";
  const obs = nuevaObservacion({ texto, autor, alcance });

  // Para una observacion de OT escribimos la MISMA observacion (mismo id)
  // en todas sus filas; al agrupar se deduplica y se muestra una sola vez.
  const destinos = registroId
    ? historial.filter(h => h.id === registroId)
    : historial.filter(h => claveSalida(h) === salidaId);

  if (destinos.length === 0) { cerrarModalObservacion(); return; }

  const previos = destinos.map(h => ({ ...h }));
  const operaciones = destinos.map(h => ({
    store: STORES.historial,
    action: 'put',
    item: { ...h, observaciones: [...(Array.isArray(h.observaciones) ? h.observaciones : []), obs] }
  }));

  await runAtomicTransaction([STORES.historial], operaciones);
  cerrarModalObservacion();
  await render();
  avisar(alcance === "OT" ? "Observación añadida a la OT." : "Observación añadida.", "ok", {
    etiqueta: "Deshacer",
    ejecutar: async () => {
      await runAtomicTransaction([STORES.historial],
        previos.map(h => ({ store: STORES.historial, action: 'put', item: h })));
      await render();
      avisar("Observación eliminada.", "info");
    }
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
  const cont = document.getElementById("dev-lista");
  document.getElementById("dev-count").textContent = devolucionPendiente.length;
  document.getElementById("dev-confirmar").disabled = devolucionPendiente.length === 0;

  if (!devolucionPendiente.length) {
    cont.innerHTML = `<p class="empty-msg" style="padding:14px;">Todavía no has escaneado nada. Los patrones aparecerán aquí conforme los leas.</p>`;
    return;
  }

  cont.innerHTML = devolucionPendiente.map(item => {
    const reg = historial.find(h => h.id === item.registroId);
    if (!reg) return "";
    const dias = diasDesde(reg.fecha);
    const salieron = cantidadDeRegistro(reg);
    // De un grupo pueden volver menos piezas de las que salieron (una se
    // quedo en el cliente): se escribe cuantas vuelven de verdad.
    const campoCantidad = salieron > 1
      ? `<div style="display:flex; align-items:center; gap:6px;">
           <label class="field-label" style="margin:0; white-space:nowrap;">Vuelven</label>
           <input type="number" class="dev-cantidad" data-id="${escapeHTML(item.registroId)}"
                  value="${item.cantidad}" min="1" max="${salieron}" step="1" style="width:70px; height:30px; text-align:center;">
           <span style="font-size:12px; color:var(--text-secondary);">de ${salieron}</span>
         </div>`
      : "";
    return `<div class="dev-linea">
        <div style="flex:1;">
          <div class="dev-codigo">${escapeHTML(reg.codigo)}${salieron > 1 ? ` <span class="badge grupo">salieron ${salieron}</span>` : ""}</div>
          <div class="dev-sub">OT ${escapeHTML(reg.numeroOT)} · ${escapeHTML(reg.empresa || "sin empresa")}${reg.sede ? " · " + escapeHTML(reg.sede) : ""} · ${escapeHTML(reg.tecnico || "sin técnico")}${dias !== null ? ` · ${dias} día(s) fuera` : ""}</div>
        </div>
        ${campoCantidad}
        <button class="btn-mini btn-quitar-devolucion" data-id="${escapeHTML(item.registroId)}" title="Quitar de la lista">Quitar</button>
      </div>`;
  }).join("");

  cont.querySelectorAll(".btn-quitar-devolucion").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      devolucionPendiente = devolucionPendiente.filter(x => x.registroId !== id);
      renderListaDevolucion();
    });
  });

  // Igual que en el resumen de salida: no se redibuja al teclear para que
  // el campo no pierda el foco.
  cont.querySelectorAll(".dev-cantidad").forEach(input => {
    const fijar = (e, corregir) => {
      const id = e.currentTarget.getAttribute("data-id");
      const item = devolucionPendiente.find(x => x.registroId === id);
      const reg = historial.find(h => h.id === id);
      if (!item || !reg) return;
      const salieron = cantidadDeRegistro(reg);
      let n = parseInt(e.currentTarget.value, 10);
      if (corregir) {
        if (!Number.isInteger(n) || n < 1) n = 1;
        if (n > salieron) n = salieron;
        e.currentTarget.value = n;
      }
      item.cantidad = Number.isInteger(n) && n > 0 ? Math.min(n, salieron) : 1;
    };
    input.addEventListener("input", e => fijar(e, false));
    input.addEventListener("change", e => fijar(e, true));
  });
}

function procesarEscaneoDevolucion(codigoLeido){
  const eco = document.getElementById("escaneo-devolucion-eco");
  const mostrar = (texto, tipo) => { eco.textContent = texto; eco.className = "escaneo-eco " + tipo; };

  const { patron, ambiguos } = buscarPatronPorCodigoEscaneado(codigoLeido);

  if (ambiguos.length) {
    pitido("error");
    mostrar(`"${codigoLeido}": hay varios patrones con ese código (${ambiguos.map(p=>p.codigo).join(", ")}). Devuélvelo desde el historial.`, "error");
    return;
  }
  if (!patron) {
    pitido("error");
    mostrar(`"${codigoLeido}" no corresponde a ningún patrón del catálogo.`, "error");
    return;
  }
  if (devolucionPendiente.some(x => x.codigo === patron.codigo)) {
    pitido("aviso");
    mostrar(`${patron.codigo} ya estaba en la lista.`, "aviso");
    return;
  }

  // Solo se puede devolver lo que consta como fuera. Si no hay salida
  // abierta, decimos exactamente por que: es el error mas probable
  // (devolver algo que ya se marco, o que nunca salio).
  const salida = salidaActivaDe(patron.codigo);
  if (!salida) {
    pitido("error");
    const ultima = salidasDePatron(patron.codigo)[0];
    const detalle = ultima
      ? ` Su última salida (OT ${ultima.numeroOT}) ya figura como "${ultima.estadoMovimiento}".`
      : " No tiene ninguna salida registrada.";
    mostrar(`${patron.codigo} no está fuera del laboratorio.${detalle}`, "error");
    return;
  }

  // Por defecto vuelve todo lo que salio; si faltara alguna pieza se
  // corrige en el campo de la lista antes de confirmar.
  const salieron = cantidadDeRegistro(salida);
  devolucionPendiente.push({ registroId: salida.id, codigo: patron.codigo, cantidad: salieron });
  pitido("ok");
  const detalle = salieron > 1 ? ` (${salieron} piezas)` : "";
  mostrar(`${patron.codigo}${detalle} añadido — OT ${salida.numeroOT}, ${salida.empresa || "sin empresa"}`, "ok");
  renderListaDevolucion();
}

async function confirmarDevolucionMasiva(){
  if (!devolucionPendiente.length) return;

  const registros = devolucionPendiente
    .map(x => historial.find(h => h.id === x.registroId))
    .filter(Boolean);

  // Revalidacion: entre el escaneo y la confirmacion alguien pudo devolver
  // uno de estos desde el historial en otra pestaña.
  const yaCerrados = registros.filter(movimientoCerrado);
  const aDevolver = registros.filter(r => !movimientoCerrado(r));
  if (!aDevolver.length) {
    avisar("Esos patrones ya figuran como devueltos. No hay nada que registrar.", "info");
    cerrarModalDevolucion();
    await render();
    return;
  }

  const ahora = new Date().toISOString();
  const operaciones = [];
  const patronesAntes = [];
  const historialAntes = aDevolver.map(r => ({ ...r }));

  const parciales = [];
  aDevolver.forEach(reg => {
    const salieron = cantidadDeRegistro(reg);
    const item = devolucionPendiente.find(x => x.registroId === reg.id);
    const vuelven = Math.max(1, Math.min(salieron, parseInt(item && item.cantidad, 10) || salieron));

    if (vuelven < salieron) {
      // Devolucion PARCIAL: el movimiento no se cierra, se queda abierto
      // con las piezas que siguen fuera, y se anota lo ocurrido.
      const faltan = salieron - vuelven;
      parciales.push({ codigo: reg.codigo, vuelven, faltan });
      const obs = nuevaObservacion({
        texto: `Devolución parcial: vuelven ${vuelven} de ${salieron} piezas. Quedan ${faltan} fuera del laboratorio.`,
        autor: "", alcance: "patron", tipo: "nota"
      });
      operaciones.push({ store: STORES.historial, action: 'put', item: {
        ...reg,
        cantidad: faltan,
        observaciones: [...(Array.isArray(reg.observaciones) ? reg.observaciones : []), obs]
      }});
    } else {
      operaciones.push({ store: STORES.historial, action: 'put', item: {
        ...reg, estadoMovimiento: "Devuelto", fechaHoraDevolucion: ahora, devueltoPorEscaneo: true
      }});
    }

    const p = patrones.find(x => x.codigo === reg.codigo);
    if (p && (p.estado === "En servicio" || p.estado === "Disponible")) {
      const fueraTras = unidadesFueraDe(reg.codigo) - vuelven;
      const nuevoEstado = estadoTrasMovimiento(p, fueraTras);
      if (nuevoEstado !== p.estado) {
        patronesAntes.push({ ...p });
        operaciones.push({ store: STORES.patrones, action: 'put', item: { ...p, estado: nuevoEstado } });
      }
    }
  });

  await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
  const cuantos = aDevolver.length;
  cerrarModalDevolucion();
  await render();

  const nota = yaCerrados.length ? ` (${yaCerrados.length} ya estaban devueltos)` : "";
  const notaParcial = parciales.length
    ? ` Atención: ${parciales.map(x => `${x.codigo} sigue con ${x.faltan} pieza(s) fuera`).join("; ")}.`
    : "";
  avisar(`${cuantos} patrón(es) devueltos y disponibles de nuevo${nota}.${notaParcial}`,
    parciales.length ? "info" : "ok", {
    etiqueta: "Deshacer",
    ejecutar: async () => {
      await runAtomicTransaction([STORES.historial, STORES.patrones], [
        ...historialAntes.map(h => ({ store: STORES.historial, action: 'put', item: h })),
        ...patronesAntes.map(p => ({ store: STORES.patrones, action: 'put', item: p }))
      ]);
      await render();
      avisar("Se deshizo la devolución.", "info");
    }
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
  // Se corrige UNA salida, no todas las de ese numero de OT: si la orden
  // tuvo varios servicios, cada uno se corrige por su cuenta.
  const registros = historial.filter(h => claveSalida(h) === salidaId);
  if (!registros.length) return;

  edicionOT = {
    salidaId,
    // "" cuando la salida es anterior al identificador: al guardar la
    // correccion se le asigna uno, y asi deja de poder fusionarse con otra.
    salidaIdReal: registros[0].salidaId || "",
    numeroOTOriginal: registros[0].numeroOT,
    fechaOriginal: registros[0].fecha,
    registros,
    retirar: {},          // { idRegistro: true }
    agregar: {},          // { codigoPatron: true }
    clienteId: registros[0].clienteId || "",
    sedeId: registros[0].sedeId || ""
  };

  // Si la OT se registro antes del directorio de clientes, intentamos
  // enlazarla por nombre para que el selector arranque en su empresa.
  if (!edicionOT.clienteId && registros[0].empresa) {
    const porNombre = clientes.find(c =>
      normalizarNombre(c.nombre).toLowerCase() === normalizarNombre(registros[0].empresa).toLowerCase());
    if (porNombre) edicionOT.clienteId = porNombre.id;
  }

  // El titulo nombra la OT y, si tuvo varios servicios, cual de ellos es.
  const nServicio = numeroDeServicio(salidaId);
  document.getElementById("edit-ot-titulo").textContent =
    registros[0].numeroOT + (nServicio ? ` · servicio ${nServicio}` : "");
  document.getElementById("edit-ot-numero").value = registros[0].numeroOT;
  document.getElementById("edit-ot-fecha").value = registros[0].fecha;
  document.getElementById("edit-ot-hora").value = horaLocalDeISO(registros[0].fechaHoraSalida) || "";
  document.getElementById("edit-ot-motivo").value = "";
  document.getElementById("edit-ot-autor").value = "";
  document.getElementById("edit-ot-buscar").value = "";
  document.getElementById("edit-ot-agregar-resultados").innerHTML = "";
  document.getElementById("edit-ot-error").style.display = "none";

  poblarSelectsEdicionOT();
  renderPatronesEdicionOT();
  document.getElementById("modal-editar-ot").classList.add("open");
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
    ? `Se actualizarán también sus equipos: laptop ${t.laptop || "-"}, termohigrómetro ${t.termohigrometro || "-"}.`
    : "";
}

function renderPatronesEdicionOT(){
  if (!edicionOT) return;
  const cont = document.getElementById("edit-ot-patrones");

  const activos = edicionOT.registros.filter(r => r.estadoMovimiento !== "Anulado");
  const anulados = edicionOT.registros.filter(r => r.estadoMovimiento === "Anulado");
  const porAgregar = Object.keys(edicionOT.agregar).filter(c => edicionOT.agregar[c]);
  const quedan = activos.filter(r => !edicionOT.retirar[r.id]).length + porAgregar.length;
  document.getElementById("edit-ot-conteo").textContent = quedan;

  let html = activos.map(r => {
    const marcado = !!edicionOT.retirar[r.id];
    const devuelto = movimientoCerrado(r);
    return `<div class="edit-patron-line ${marcado ? "marcado-retirar" : ""}">
        <div class="edit-patron-datos">
          <b>${escapeHTML(r.codigo)}</b>${etiquetaCantidad(r)}
          <div class="edit-patron-sub">${escapeHTML(r.area || "")}${r.area ? " · " : ""}${escapeHTML(r.categoria || "")} · ${escapeHTML(r.estadoMovimiento || "En servicio")}</div>
        </div>
        <button class="btn-mini ${marcado ? "" : "btn-eliminar-patron"} btn-toggle-retirar" data-id="${escapeHTML(r.id)}">
          ${marcado ? "Conservar" : (devuelto ? "Retirar (fue error)" : "Retirar de la OT")}
        </button>
      </div>`;
  }).join("");

  html += porAgregar.map(codigo => {
    const p = patrones.find(x => x.codigo === codigo);
    return `<div class="edit-patron-line">
        <div class="edit-patron-datos">
          <b>${escapeHTML(codigo)}</b> <span class="badge disp">Se añadirá${(+edicionOT.agregar[codigo] > 1) ? ` × ${+edicionOT.agregar[codigo]} piezas` : ""}</span>
          <div class="edit-patron-sub">${escapeHTML(p ? (p.area || "") : "")}${p && p.area ? " · " : ""}${escapeHTML(p ? p.categoria : "")}</div>
        </div>
        <button class="btn-mini btn-quitar-agregado" data-codigo="${escapeHTML(codigo)}">Cancelar</button>
      </div>`;
  }).join("");

  if (anulados.length) {
    html += `<div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border);">` +
      anulados.map(r => `<div class="edit-patron-line" style="border-top:none;">
          <div class="edit-patron-datos" style="opacity:.6;">
            <b style="text-decoration:line-through;">${escapeHTML(r.codigo)}</b>
            <span class="badge anulado">Anulado</span>
            <div class="edit-patron-sub">${escapeHTML(r.motivoAnulacion || "Retirado en una corrección anterior")}</div>
          </div>
        </div>`).join("") + `</div>`;
  }

  if (!html) html = `<p class="obs-vacio">Esta OT se quedaría sin patrones. Añade al menos uno.</p>`;
  cont.innerHTML = html;

  cont.querySelectorAll(".btn-toggle-retirar").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.getAttribute("data-id");
      if (edicionOT.retirar[id]) delete edicionOT.retirar[id];
      else edicionOT.retirar[id] = true;
      renderPatronesEdicionOT();
    });
  });
  cont.querySelectorAll(".btn-quitar-agregado").forEach(btn => {
    btn.addEventListener("click", (e) => {
      delete edicionOT.agregar[e.currentTarget.getAttribute("data-codigo")];
      renderPatronesEdicionOT();
      renderBusquedaEdicionOT();
    });
  });
}

function renderBusquedaEdicionOT(){
  if (!edicionOT) return;
  const q = document.getElementById("edit-ot-buscar").value.trim().toLowerCase();
  const caja = document.getElementById("edit-ot-agregar-resultados");
  if (q.length < 2) { caja.innerHTML = ""; return; }

  const yaEnOT = new Set(edicionOT.registros
    .filter(r => r.estadoMovimiento !== "Anulado" && !edicionOT.retirar[r.id])
    .map(r => r.codigo));

  const candidatos = patrones
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado))
    .filter(p => !yaEnOT.has(p.codigo) && !edicionOT.agregar[p.codigo])
    .filter(p => coincideBusqueda(p, q))
    .slice(0, 25);

  if (!candidatos.length) { caja.innerHTML = `<div class="edit-agregar-row"><span class="obs-vacio">Sin resultados.</span></div>`; return; }

  caja.innerHTML = candidatos.map(p => {
    const vencido = patronBloqueadoPorCalibracion(p);
    const libre = p.estado === "Disponible" && !vencido;
    const motivo = vencido ? "Actividad vencida" : (p.estado !== "Disponible" ? p.estado : "");
    return `<div class="edit-agregar-row">
        <div>
          <b>${escapeHTML(p.codigo)}</b>
          <div class="edit-patron-sub">${escapeHTML(p.area || "")} · ${escapeHTML(p.categoria || "")}</div>
        </div>
        ${libre
          ? (esPatronGrupo(p)
              ? `<span style="display:flex; gap:6px; align-items:center;">
                   <input type="number" class="edit-cantidad-grupo" data-codigo="${escapeHTML(p.codigo)}"
                          value="1" min="1" max="${unidadesDisponiblesDe(p)}" step="1"
                          style="width:64px; height:30px; text-align:center;"
                          title="Piezas de este grupo (${unidadesDisponiblesDe(p)} disponibles)">
                   <button class="btn-mini btn-agregar-a-ot" data-codigo="${escapeHTML(p.codigo)}">Añadir</button>
                 </span>`
              : `<button class="btn-mini btn-agregar-a-ot" data-codigo="${escapeHTML(p.codigo)}">Añadir</button>`)
          : `<span class="badge ${vencido ? "vencido" : "serv"}">${escapeHTML(motivo)}</span>`}
      </div>`;
  }).join("");

  caja.querySelectorAll(".btn-agregar-a-ot").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.currentTarget.getAttribute("data-codigo");
      // En un grupo guardamos la cantidad; en el resto, 1. Ambos valores
      // son "verdaderos", asi que el resto del flujo no cambia.
      const campo = caja.querySelector(`.edit-cantidad-grupo[data-codigo="${CSS.escape(codigo)}"]`);
      const n = campo ? Math.max(1, parseInt(campo.value, 10) || 1) : 1;
      edicionOT.agregar[codigo] = n;
      renderPatronesEdicionOT();
      renderBusquedaEdicionOT();
    });
  });
}

// Calcula, campo por campo, que cambio de verdad. Solo con esto decidimos
// si hay algo que guardar y que texto queda escrito en la trazabilidad.
function calcularCambiosOT(){
  const reg = edicionOT.registros[0];
  const cambios = [];

  const nuevoNumero = document.getElementById("edit-ot-numero").value.trim();
  const nuevaFecha = document.getElementById("edit-ot-fecha").value;
  const horaAnterior = horaLocalDeISO(reg.fechaHoraSalida);
  const nuevaHora = document.getElementById("edit-ot-hora").value || horaAnterior || "00:00:00";
  const nuevoTecnico = document.getElementById("edit-ot-tecnico").value;
  const cliente = getCliente(edicionOT.clienteId);
  const sede = getSede(cliente, edicionOT.sedeId);

  if (nuevoNumero !== reg.numeroOT) cambios.push(`N.° de OT: "${reg.numeroOT}" → "${nuevoNumero}"`);
  if (nuevaFecha !== reg.fecha) cambios.push(`Fecha de salida: ${formatFecha(reg.fecha)} → ${formatFecha(nuevaFecha)}`);
  // La hora se compara a nivel de minuto: el <input type="time"> puede
  // devolver los segundos a cero y eso no es una correccion de verdad.
  if (nuevaHora.slice(0, 5) !== String(horaAnterior || "").slice(0, 5)) {
    cambios.push(`Hora de salida: ${horaAnterior || "sin hora"} → ${nuevaHora}`);
  }
  if (nuevoTecnico !== (reg.tecnico || "")) {
    cambios.push(`Técnico: "${reg.tecnico || "sin asignar"}" → "${nuevoTecnico || "sin asignar"}"`);
  }
  const empresaNueva = cliente ? cliente.nombre : "";
  if (empresaNueva !== (reg.empresa || "")) {
    cambios.push(`Empresa: "${reg.empresa || "sin empresa"}" → "${empresaNueva || "sin empresa"}"`);
  }
  const sedeNueva = sede ? sede.nombre : "";
  if (sedeNueva !== (reg.sede || "")) {
    cambios.push(`Sede: "${reg.sede || "sin sede"}" → "${sedeNueva || "sin sede"}"`);
  }
  const dirNueva = sede ? (sede.direccion || "") : "";
  if (dirNueva !== (reg.direccion || "")) {
    cambios.push(`Dirección: "${reg.direccion || "sin dirección"}" → "${dirNueva || "sin dirección"}"`);
  }

  const retirados = edicionOT.registros.filter(r => edicionOT.retirar[r.id]).map(r => r.codigo);
  if (retirados.length) cambios.push(`Patrones retirados de la OT (anulados): ${retirados.join(", ")}`);
  const agregados = Object.keys(edicionOT.agregar).filter(c => edicionOT.agregar[c]);
  if (agregados.length) {
    cambios.push(`Patrones añadidos a la OT: ${agregados.map(c => {
      const n = +edicionOT.agregar[c];
      return n > 1 ? `${c} (${n} piezas)` : c;
    }).join(", ")}`);
  }

  // Quitar o añadir patrones puede cambiar los laboratorios implicados y con
  // ellos el encargado que figura en el acta, asi que se recalcula sobre los
  // patrones que QUEDAN y el cambio se anota como cualquier otro.
  const codigosFinales = edicionOT.registros
    .filter(r => r.estadoMovimiento !== "Anulado" && !edicionOT.retirar[r.id])
    .map(r => r.codigo)
    .concat(agregados);
  const nuevoEncargado = encargadoParaCodigos(codigosFinales);
  const encargadoAnterior = String(reg.encargadoLaboratorio || "");
  if (nuevoEncargado !== encargadoAnterior) {
    cambios.push(`Encargado de laboratorio: "${encargadoAnterior || "sin encargado"}" → "${nuevoEncargado || "sin encargado"}"`);
  }

  return { cambios, nuevoNumero, nuevaFecha, nuevaHora, nuevoTecnico, cliente, sede,
           retirados, agregados, nuevoEncargado };
}

async function guardarEdicionOT(){
  if (!edicionOT) return;
  const err = document.getElementById("edit-ot-error");
  err.style.display = "none";

  const d = calcularCambiosOT();
  const motivo = document.getElementById("edit-ot-motivo").value.trim();
  const autor = document.getElementById("edit-ot-autor").value.trim();

  if (!d.nuevoNumero) { err.textContent = "El número de OT no puede quedar vacío."; err.style.display = "block"; return; }
  if (!d.nuevaFecha) { err.textContent = "La fecha de salida no puede quedar vacía."; err.style.display = "block"; return; }

  const quedan = edicionOT.registros.filter(r => r.estadoMovimiento !== "Anulado" && !edicionOT.retirar[r.id]).length
    + d.agregados.length;
  if (quedan === 0) {
    err.textContent = "La OT se quedaría sin ningún patrón. Añade uno o, si toda la orden fue un error, elimínala desde el historial.";
    err.style.display = "block"; return;
  }

  // Cambiar numero+fecha a los de OTRA orden existente las fusionaria sin
  // avisar; mejor pararlo aqui que dejar dos servicios distintos mezclados.
  // Antes aqui se rechazaba cambiar el numero+fecha a los de otra orden
  // existente, porque con esa pareja como clave las dos se habrian fusionado
  // sin avisar. Ya no hace falta: cada salida tiene su propio identificador y
  // dos servicios del mismo cliente pueden compartir numero y dia sin
  // mezclarse. Lo que si se hace es dar identidad a las salidas antiguas, que
  // se registraron antes de que existiera ese identificador (mas abajo).

  if (!d.cambios.length) { err.textContent = "No has cambiado nada todavía."; err.style.display = "block"; return; }
  if (!motivo) {
    err.textContent = "Escribe el motivo de la corrección: es lo que queda como constancia de por qué cambió el registro.";
    err.style.display = "block"; return;
  }

  // Revalidacion de ultima hora de los patrones a añadir.
  const noAptos = d.agregados
    .map(c => patrones.find(p => p.codigo === c))
    .filter(p => !p || p.estado !== "Disponible" || patronBloqueadoPorCalibracion(p));
  if (noAptos.length) {
    err.textContent = "Estos patrones ya no pueden añadirse (no disponibles o con actividad vencida): "
      + noAptos.map(p => p ? p.codigo : "?").join(", ") + ".";
    err.style.display = "block"; return;
  }

  const obs = nuevaObservacion({
    texto: motivo + "\n\nCambios aplicados:\n· " + d.cambios.join("\n· "),
    autor, alcance: "OT", tipo: "correccion"
  });

  const tecInfo = tecnicos.find(t => t.nombre === d.nuevoTecnico);
  const cabecera = {
    numeroOT: d.nuevoNumero,
    fecha: d.nuevaFecha,
    // La marca de salida se rehace desde la fecha y la hora del formulario.
    // "registradoEn" NO se toca: sigue diciendo cuando nacio el registro.
    fechaHoraSalida: isoDesdeFechaHoraLocal(d.nuevaFecha, d.nuevaHora),
    empresa: d.cliente ? d.cliente.nombre : "",
    clienteId: d.cliente ? d.cliente.id : "",
    clienteRuc: d.cliente ? (d.cliente.ruc || "") : "",
    sedeId: d.sede ? d.sede.id : "",
    sede: d.sede ? d.sede.nombre : "",
    direccion: d.sede ? (d.sede.direccion || "") : "",
    contactoSede: d.sede ? (d.sede.contacto || "") : "",
    telefonoSede: d.sede ? (d.sede.telefono || "") : "",
    tecnico: d.nuevoTecnico,
    // Los equipos siguen al tecnico: si cambia quien fue, cambia su maletin.
    laptop: tecInfo ? (tecInfo.laptop || "") : "",
    termohigrometro: tecInfo ? (tecInfo.termohigrometro || "") : "",
    extra: tecInfo ? (tecInfo.extra || "") : "",
    // Recalculado en calcularCambiosOT sobre los patrones que quedan.
    encargadoLaboratorio: d.nuevoEncargado,
    // Las salidas anteriores al identificador reciben uno aqui: sin el,
    // cambiarles el numero o la fecha podria juntarlas con otra salida que
    // ya tuviera esa pareja.
    salidaId: edicionOT.salidaIdReal || nuevoId("sal")
  };

  const ahora = new Date().toISOString();
  const operaciones = [];
  const patronesTocados = new Map();

  // 1. Cabecera + observacion en TODAS las filas (incluidas las ya anuladas:
  //    si no, al cambiar el numero de OT se irian a un grupo huerfano).
  edicionOT.registros.forEach(r => {
    const retirado = !!edicionOT.retirar[r.id];
    const item = {
      ...r, ...cabecera,
      observaciones: [...(Array.isArray(r.observaciones) ? r.observaciones : []), obs]
    };
    if (retirado) {
      item.estadoMovimiento = "Anulado";
      item.anuladoEn = ahora;
      item.motivoAnulacion = motivo;
      item.estadoAntesDeAnular = r.estadoMovimiento || "En servicio";
      item.fechaHoraDevolucion = "";
    }
    operaciones.push({ store: STORES.historial, action: 'put', item });
  });

  // 2. Filas nuevas por los patrones añadidos. Guardamos sus ids AQUI: mirar
  //    despues el campo "agregadoEnCorreccion" no sirve, porque tambien lo
  //    llevan las filas que se añadieron en correcciones anteriores y el
  //    "Deshacer" acabaria borrandolas.
  const idsNuevos = [];
  d.agregados.forEach(codigo => {
    const p = patrones.find(x => x.codigo === codigo);
    const idNuevo = nuevoId("hist");
    idsNuevos.push(idNuevo);
    operaciones.push({ store: STORES.historial, action: 'put', item: {
      id: idNuevo,
      ...cabecera,
      // La hora de salida ya viene en "cabecera" (misma para toda la OT), asi
      // que un patron añadido en una correccion no se queda con la hora vieja.
      registradoEn: ahora,
      categoria: p.categoria, area: p.area, codigo: p.codigo,
      valorNominal: String(p.valorNominal || p.valor || ""),
      cantidad: esPatronGrupo(p) ? Math.max(1, parseInt(edicionOT.agregar[codigo], 10) || 1) : 1,
      esGrupo: esPatronGrupo(p),
      unidadesGrupo: esPatronGrupo(p) ? unidadesDeGrupo(p) : null,
      tipoMovimiento: "Salida",
      estadoMovimiento: "En servicio",
      agregadoEnCorreccion: ahora,
      observaciones: [obs]
    }});
    patronesTocados.set(codigo, "En servicio");
  });

  // 3. Estado operativo de los patrones retirados. Solo vuelve a
  //    "Disponible" si no le queda ninguna otra salida abierta.
  const idsRetirados = new Set(edicionOT.registros.filter(r => edicionOT.retirar[r.id]).map(r => r.id));
  edicionOT.registros.filter(r => idsRetirados.has(r.id)).forEach(r => {
    const p = patrones.find(x => x.codigo === r.codigo);
    if (!p) return;
    // Cuantas piezas de este patron seguirian fuera tras la correccion.
    const fueraTras = historial
      .filter(h => h.codigo === r.codigo && !idsRetirados.has(h.id) && !movimientoCerrado(h))
      .reduce((suma, h) => suma + cantidadDeRegistro(h), 0);
    patronesTocados.set(r.codigo, estadoTrasMovimiento(p, fueraTras));
  });

  patronesTocados.forEach((estado, codigo) => {
    const p = patrones.find(x => x.codigo === codigo);
    if (!p || p.estado === estado) return;
    // Un patron en mantenimiento o de baja sigue su propio flujo: no lo
    // tocamos solo porque haya cambiado esta OT.
    if (p.estado !== "Disponible" && p.estado !== "En servicio") return;
    operaciones.push({ store: STORES.patrones, action: 'put', item: { ...p, estado } });
  });

  const historialAntes = edicionOT.registros.map(r => ({ ...r }));
  const patronesAntes = [...patronesTocados.keys()]
    .map(c => patrones.find(p => p.codigo === c)).filter(Boolean).map(p => ({ ...p }));

  await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
  cerrarModalEditarOT();
  await render();

  avisar(`OT ${d.nuevoNumero} corregida (${d.cambios.length} cambio(s)). Queda anotado en el historial.`, "ok", {
    etiqueta: "Deshacer",
    ejecutar: async () => {
      const ops = [
        ...historialAntes.map(h => ({ store: STORES.historial, action: 'put', item: h })),
        ...idsNuevos.map(id => ({ store: STORES.historial, action: 'delete', key: id })),
        ...patronesAntes.map(p => ({ store: STORES.patrones, action: 'put', item: p }))
      ];
      await runAtomicTransaction([STORES.historial, STORES.patrones], ops);
      await render();
      avisar("Se deshizo la corrección de la OT.", "info");
    }
  });
}

async function eliminarOT(salidaId) {
  // Borra SOLO esta salida. Los demas servicios de la misma OT no se tocan.
  const registrosAEliminar = historial.filter(h => claveSalida(h) === salidaId);
  if (registrosAEliminar.length === 0) {
    avisar('No se encontraron registros para esa salida.', 'error');
    return;
  }
  const ref = registrosAEliminar[0];
  const n = numeroDeServicio(salidaId);
  const confirmado = await confirmar({
    titulo: "Eliminar salida",
    mensaje: `Se eliminará ${n ? `el servicio ${n} de la OT` : "la OT"} ${ref.numeroOT} `
           + `del día ${formatFecha(ref.fecha)} y sus ${registrosAEliminar.length} registro(s).\n\n`
           + (n ? `Los demás servicios de esa misma OT NO se tocan.\n\n` : "")
           + `Los patrones asociados volverán a estar disponibles.\n\n`
           + `Si lo que pasó es que marcaste algo por error, es mejor usar «Observación» `
           + `o «Corregir devolución»: así queda constancia en vez de borrarse.`,
    textoOk: "Eliminar salida", peligro: true
  });
  if (!confirmado) return;

  const codigosPatrones = registrosAEliminar.map(h => h.codigo);
  // La foto de los patrones se toma ANTES de escribir, para poder deshacer.
  const patronesAntes = codigosPatrones
    .map(c => patrones.find(p => p.codigo === c))
    .filter(Boolean)
    .map(p => ({ ...p }));

  // El try cubre SOLO la escritura. Si envolviera tambien el aviso de exito,
  // un fallo al componer el mensaje se reportaria como "no se pudo eliminar"
  // cuando la OT ya esta borrada, que es justo lo que pasaba.
  try {
    const operaciones = [];
    for (const registro of registrosAEliminar) {
      operaciones.push({ store: STORES.historial, action: 'delete', key: registro.id });
    }
    for (const codigo of codigosPatrones) {
      const patron = patrones.find(p => p.codigo === codigo);
      if (patron && patron.estado === "En servicio") {
        operaciones.push({ store: STORES.patrones, action: 'put', item: { ...patron, estado: "Disponible" } });
      }
    }
    // Una sola transaccion atomica para todo el borrado + liberacion.
    await runAtomicTransaction([STORES.historial, STORES.patrones], operaciones);
  } catch (error) {
    console.error('Error al eliminar la salida:', error);
    avisar('Hubo un error al eliminar la OT. Revisa la consola.', "error");
    return;
  }

  await render();
  avisar(`${n ? `Servicio ${n} de la OT` : "OT"} ${ref.numeroOT} eliminado. `
       + `Los patrones han sido liberados.`, "ok", {
    etiqueta: "Deshacer",
    ejecutar: () => restaurarRegistros(patronesAntes, registrosAEliminar, [])
  });
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
function claveSalida(h){
  return String((h && h.salidaId) || "") || (String((h && h.numeroOT) || "") + "||" + String((h && h.fecha) || ""));
}

// Que numero de servicio es esta salida dentro de su OT. Devuelve 0 cuando
// la orden tiene una sola salida, que es el caso normal: ahi no hay nada que
// numerar y la pantalla y el acta no mencionan ningun servicio. Solo cuando
// una misma OT acumula varias salidas se numeran por orden de registro, para
// poder distinguirlas en el historial y en sus actas.
function numeroDeServicio(salidaId){
  const filas = historial.filter(h => claveSalida(h) === salidaId);
  if (!filas.length) return 0;
  const ot = String(filas[0].numeroOT || "");
  if (!ot) return 0;

  const sellos = new Map();   // salidaId -> marca de generacion mas antigua
  historial.forEach(h => {
    if (String(h.numeroOT || "") !== ot) return;
    const k = claveSalida(h);
    const sello = String(h.registradoEn || h.fechaHoraSalida || h.fecha || "");
    if (!sellos.has(k) || sello < sellos.get(k)) sellos.set(k, sello);
  });
  if (sellos.size < 2) return 0;

  const orden = [...sellos.entries()].sort((a, b) =>
    a[1] !== b[1] ? (a[1] < b[1] ? -1 : 1) : (a[0] < b[0] ? -1 : 1));
  return orden.findIndex(([k]) => k === salidaId) + 1;
}

function agruparPorOT(hist){
  const mapa = {};
  const orden = [];
  hist.forEach(h => {
    const key = claveSalida(h);
    if (!mapa[key]) {
      mapa[key] = {
        salidaId: key,
        numeroOT: h.numeroOT, fecha: h.fecha, fechaHoraSalida: h.fechaHoraSalida || "",
        // Cuando se dio de alta la OT. Se toma la marca MAS ANTIGUA de sus
        // filas (abajo): las que se añadieron despues en una correccion
        // traen su propia marca, y si mandara la mas nueva la orden saltaria
        // cada vez que se corrige una OT vieja.
        generadoEn: "",
        empresa: h.empresa, tecnico: h.tecnico,
        // Datos de sede tal como quedaron congelados al emitir la salida.
        clienteId: h.clienteId || "", clienteRuc: h.clienteRuc || "",
        sede: h.sede || "", direccion: h.direccion || "",
        contactoSede: h.contactoSede || "", telefonoSede: h.telefonoSede || "",
        laptop: h.laptop, termohigrometro: h.termohigrometro, extra: h.extra || "",
        // Las OT registradas antes de que existieran los encargados no lo
        // traen: en esas se deduce al vuelo de las areas de sus patrones,
        // mas abajo, una vez recogidas todas las filas del grupo.
        encargadoLaboratorio: h.encargadoLaboratorio || "",
        patrones: [],
        observacionesOT: []
      };
      orden.push(key);
    }
    // Marca de generacion de la fila: el sello del reloj si lo tiene y, para
    // las filas anteriores a ese campo, la hora de salida o el dia a secas.
    const selloFila = String(h.registradoEn || h.fechaHoraSalida || h.fecha || "");
    if (selloFila && (!mapa[key].generadoEn || selloFila < mapa[key].generadoEn)) {
      mapa[key].generadoEn = selloFila;
    }
    mapa[key].patrones.push({
      id: h.id, codigo: h.codigo, categoria: h.categoria, area: h.area || "",
      valorNominal: h.valorNominal || "",
      tipoMovimiento: h.tipoMovimiento || "Salida", estadoMovimiento: h.estadoMovimiento || "En servicio",
      fechaHoraDevolucion: h.fechaHoraDevolucion || "",
      observaciones: Array.isArray(h.observaciones) ? h.observaciones : [],
      devolucionesAnuladas: Array.isArray(h.devolucionesAnuladas) ? h.devolucionesAnuladas : [],
      motivoAnulacion: h.motivoAnulacion || "",
      anuladoEn: h.anuladoEn || "",
      cantidad: cantidadDeRegistro(h),
      esGrupo: !!h.esGrupo,
      unidadesGrupo: h.unidadesGrupo || null
    });

    // Las observaciones de alcance "OT" se guardan replicadas en cada fila
    // de la orden (el historial es una fila por patron, no hay tabla de OT).
    // Al agrupar las deduplicamos por su id para mostrarlas una sola vez.
    (Array.isArray(h.observaciones) ? h.observaciones : [])
      .filter(o => o.alcance === "OT")
      .forEach(o => {
        if (!mapa[key].observacionesOT.some(x => x.id === o.id)) {
          mapa[key].observacionesOT.push(o);
        }
      });
  });
  orden.forEach(k => {
    // Respaldo para las OT anteriores al campo: se deduce el encargado de
    // las areas de los patrones de la orden. Es una deduccion con los datos
    // de HOY, no una constancia; las OT nuevas ya lo traen congelado.
    if (!mapa[k].encargadoLaboratorio) {
      mapa[k].encargadoLaboratorio = encargadosDeLaboratorios(
        mapa[k].patrones.map(p => p.area)
      ).join(SEP_ENCARGADOS);
    }
    mapa[k].observacionesOT.sort((a,b) => String(a.fechaHora||"") < String(b.fechaHora||"") ? -1 : 1);
  });
  return orden.map(k => mapa[k]);
}

// ------------------------------------------------------------
// Observaciones del historial (append-only).
//
// El historial no se edita ni se borra: si hubo un error (por ejemplo
// marcar "devuelto" un patron que sigue donde el cliente), se ANOTA
// la correccion con su fecha y hora y, cuando toca, se reabre el
// movimiento. Asi el registro original nunca se falsea, que es lo que
// exige ISO 17025 para los registros tecnicos.
// ------------------------------------------------------------
function nuevaObservacion({ texto, autor, alcance = "patron", tipo = "nota" }){
  return {
    id: nuevoId("obs"),
    texto: String(texto || "").trim(),
    autor: String(autor || "").trim(),
    alcance,           // "patron" | "OT"
    tipo,              // "nota" | "correccion"
    fechaHora: new Date().toISOString()
  };
}

// "× 30 piezas" junto al codigo, solo cuando de verdad son varias.
function etiquetaCantidad(registro){
  const n = cantidadDeRegistro(registro);
  if (n <= 1 && !registro.esGrupo) return "";
  const total = registro.unidadesGrupo ? ` de ${registro.unidadesGrupo}` : "";
  return ` <span class="badge grupo" title="Piezas de este grupo en esta OT">× ${n}${total} piezas</span>`;
}

function observacionHTML(o){
  const cuando = o.fechaHora
    ? new Date(o.fechaHora).toLocaleString("es-PE", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"})
    : "";
  const quien = o.autor ? " · " + escapeHTML(o.autor) : "";
  const marca = o.alcance === "OT" ? "Observación de la OT" : "Observación";
  const etiqueta = o.tipo === "correccion" ? "Corrección de devolución" : marca;
  return `<div class="obs-item${o.tipo === "correccion" ? " correccion" : ""}">${escapeHTML(o.texto)}<span class="obs-meta">${etiqueta} · ${escapeHTML(cuando)}${quien}</span></div>`;
}

