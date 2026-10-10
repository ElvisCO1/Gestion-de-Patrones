// 7.  CATÁLOGO DE PATRONES (con filtro de estado y eliminación mejorada)
// ============================================================
function renderCatalogoPatrones(){
  const lista2 = document.getElementById("lista-patrones2");
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

// ------------------------------------------------------------
// Formulario de edicion de un patron (se construye bajo demanda)
// ------------------------------------------------------------
function formularioEdicionPatronHTML(p){
    const act = getActividades(p);
    function bloqueActividad(clave, nombre){
      const a = act[clave];
      return `
        <div class="full" style="border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-top:6px;">
          <p style="font-weight:600; font-size:13px; margin:0 0 8px;">${nombre} (${clave})</p>
          <div class="grid2">
            <div>
              <label class="field-label">Frecuencia (meses)</label>
              <input type="number" class="ep-act-frecuencia" data-clave="${clave}" min="1" step="1" value="${escapeHTML(a.frecuenciaMeses ?? "")}">
            </div>
            <div>
              <label class="field-label">Mes de vencimiento</label>
              <input type="month" class="ep-act-mesvenc" data-clave="${clave}" value="${escapeHTML(a.mesVencimiento || "")}">
            </div>
            <div>
              <label class="field-label">Tipo (interna / externa)</label>
              <select class="ep-act-tipo" data-clave="${clave}">
                ${TIPOS_POR_ACTIVIDAD[clave].map(([v, txt]) =>
                  `<option value="${v}"${(a.tipoCalibracion || "") === v ? " selected" : ""}>${txt}</option>`).join("")}
              </select>
            </div>
            <div>
              <label class="field-label">Fecha real de ultima ejecucion (opcional)</label>
              <input type="date" class="ep-act-fecha" data-clave="${clave}" value="${escapeHTML(a.ultimaFechaEjecucion || "")}">
            </div>
            <div class="full">
              <label class="field-label">N.° de documento / informe (opcional)</label>
              <input type="text" class="ep-act-doc" data-clave="${clave}" value="${escapeHTML(a.ultimoDocumento || "")}" placeholder="Ej: IV26-0142">
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="grid2">
        <div><label class="field-label">Código único</label><input type="text" class="ep-codigo" value="${escapeHTML(p.codigo)}"></div>
        <div><label class="field-label">Laboratorio</label><input type="text" class="ep-area" value="${escapeHTML(p.area)}"></div>
        <div class="full"><label class="field-label">Equipos</label><input type="text" class="ep-categoria" value="${escapeHTML(p.categoria)}"></div>
        <div><label class="field-label">Marca (opcional)</label><input type="text" class="ep-marca" value="${escapeHTML(p.marca || "")}" placeholder="Ej: Mettler Toledo"></div>
        <div><label class="field-label">Valor nominal (opcional)</label><input type="text" class="ep-valor" value="${escapeHTML(p.valorNominal || "")}" placeholder="Ej: 500 g, 1 kg, 20 kg"></div>
        <div><label class="field-label">Modelo (opcional)</label><input type="text" class="ep-modelo" value="${escapeHTML(p.modelo || "")}" placeholder="Ej: SH-110"></div>
        <div><label class="field-label">Serie (opcional)</label><input type="text" class="ep-serie" value="${escapeHTML(p.serie || "")}" placeholder="Ej: 16928273"></div>
        <div>
          <label class="field-label">Lugar de uso</label>
          <select class="ep-lugar">
            <option value="Campo"${(p.lugarUso || "Campo")==="Campo"?" selected":""}>Campo</option>
            <option value="Laboratorio"${p.lugarUso==="Laboratorio"?" selected":""}>Laboratorio</option>
          </select>
        </div>
        <div>
          <label class="field-label">Estado</label>
          <select class="ep-estado">
            <option value="Disponible"${p.estado==="Disponible"?" selected":""}>Disponible</option>
            <option value="En servicio"${p.estado==="En servicio"?" selected":""}>En servicio</option>
            <option value="En mantenimiento"${p.estado==="En mantenimiento"?" selected":""}>En mantenimiento</option>
            <option value="De baja"${p.estado==="De baja"?" selected":""}>De baja</option>
            <option value="Extraviado"${p.estado==="Extraviado"?" selected":""}>Extraviado</option>
            <option value="No Cumple / Inoperativo"${p.estado==="No Cumple / Inoperativo"?" selected":""}>No Cumple / Inoperativo</option>
            <option value="Eliminado"${p.estado==="Eliminado"?" selected":""}>Eliminado</option>
          </select>
        </div>
        <div class="full" style="background:var(--surface-2); border:1px dashed var(--border-strong); border-radius:10px; padding:10px 12px;">
          <label style="font-weight:600;"><input type="checkbox" class="ep-es-grupo"${esPatronGrupo(p) ? " checked" : ""}> Es un grupo de piezas iguales</label>
          <div style="margin-top:8px; max-width:260px;">
            <label class="field-label">Número de piezas del grupo</label>
            <input type="number" class="ep-unidades" value="${escapeHTML(unidadesDeGrupo(p))}" min="1" max="9999" step="1">
          </div>
          ${esPatronGrupo(p) ? `<div style="font-size:12px; color:var(--text-secondary); margin-top:8px;">Ahora mismo: ${escapeHTML(descripcionDisponibilidadGrupo(p))}.</div>` : ""}
        </div>
        <div class="full">
          <label class="field-label">Observacion (opcional)</label>
          <textarea class="ep-observacion" placeholder="Ej: revisar mordazas antes de próxima calibración">${escapeHTML(p.observacion || "")}</textarea>
        </div>
      </div>
      <p style="font-weight:600; font-size:14px; margin:14px 0 4px; color:var(--text-primary);">Actividades ISO 17025</p>
      ${ACTIVIDADES_ISO.map(({clave, nombre}) => bloqueActividad(clave, nombre)).join("")}
      <p class="msg-error ep-error" style="margin-top:10px;"></p>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-guardar-patron btn-primario btn-mini" data-codigo-original="${escapeHTML(p.codigo)}">Guardar cambios</button>
        <button class="btn-cancelar-patron btn-mini" data-codigo="${escapeHTML(p.codigo)}">Cancelar</button>
      </div>
    `;
}

// Abre (rellenando bajo demanda) el formulario de edicion de un patron.
function abrirFormularioEdicion(codigo){
  // Cerramos y vaciamos cualquier otro formulario abierto para no acumular
  // campos en el DOM.
  document.querySelectorAll("#lista-patrones2 .tec-edit-form.open").forEach(f => {
    f.classList.remove("open");
    f.innerHTML = "";
  });
  const form = document.getElementById("edit-patron-" + encodeURIComponent(codigo));
  const p = patrones.find(pp => pp.codigo === codigo);
  if (!form || !p) return;
  form.innerHTML = formularioEdicionPatronHTML(p);
  form.classList.add("open");
  form.querySelector(".btn-cancelar-patron").addEventListener("click", () => {
    form.classList.remove("open");
    form.innerHTML = "";
  });
  form.querySelector(".btn-guardar-patron").addEventListener("click", () => guardarEdicionPatron(codigo, form));
  // Mantener la casilla de grupo y su numero de piezas coherentes.
  const chkGrupo = form.querySelector(".ep-es-grupo");
  const campoUnidades = form.querySelector(".ep-unidades");
  const sincronizar = () => { campoUnidades.disabled = !chkGrupo.checked; };
  chkGrupo.addEventListener("change", sincronizar);
  sincronizar();
}

function conectarBotonesCatalogo(lista2){
  lista2.querySelectorAll(".etiqueta-seleccionada").forEach(chk => {
    chk.addEventListener("change", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      if (e.target.checked) seleccionEtiquetas[codigo] = true;
      else delete seleccionEtiquetas[codigo];
      actualizarContadorEtiquetas();
    });
  });

  // Eliminar patron: sin historial -> confirmacion simple; con historial -> opciones claras
  lista2.querySelectorAll(".btn-eliminar-patron").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      const patron = patrones.find(p => p.codigo === codigo);
      if (!patron) return;

      const tieneHistorial = historial.some(h => h.codigo === codigo);
      const actsDelPatron = actividadesEjecutadas.filter(a => a.codigoPatron === codigo);

      if (!tieneHistorial) {
        const aviso = actsDelPatron.length
          ? `\n\nOJO: tiene ${actsDelPatron.length} actividad(es) de calibración registradas que también se borrarán.`
          : "\n\nNo tiene historial asociado.";
        const ok = await confirmar({
          titulo: "Eliminar patrón",
          mensaje: `Se eliminará definitivamente el patrón ${codigo}.` + aviso,
          textoOk: "Eliminar", peligro: true
        });
        if (ok) {
          const patronBorrado = { ...patron };
          // Borramos el patron y su hoja de vida en una sola transaccion.
          await runAtomicTransaction([STORES.patrones, STORES.actividades], [
            { store: STORES.patrones, action: 'delete', key: codigo },
            ...actsDelPatron.map(a => ({ store: STORES.actividades, action: 'delete', key: a.id }))
          ]);
          delete seleccionados[codigo];
          delete seleccionEtiquetas[codigo];
          await render();
          avisar(`Patrón ${codigo} eliminado.`, "ok", {
            etiqueta: "Deshacer",
            ejecutar: () => restaurarRegistros([patronBorrado], [], actsDelPatron)
          });
        }
        return;
      }

      // Con historial hay dos salidas distintas y antes se resolvian con un
      // confirm() donde "Cancelar" significaba "borrar todo": justo al reves
      // de lo que espera cualquiera. Ahora cada opcion es un boton con su
      // nombre, y el borrado total sigue pasando por el modal que exige
      // escribir el codigo.
      const respuesta = await confirmar({
        titulo: "El patrón tiene historial",
        mensaje: `El patrón ${codigo} aparece en registros del historial.\n\n` +
                 `Lo recomendable es marcarlo como "Eliminado": desaparece de las listas de uso ` +
                 `pero su historial se conserva, como pide la trazabilidad.`,
        textoOk: "Marcar como Eliminado",
        textoAlterno: "Borrar todo (patrón + historial)",
        peligroAlterno: true
      });

      if (respuesta === "ok") {
        await saveRecord(STORES.patrones, { ...patron, estado: "Eliminado" });
        delete seleccionados[codigo];
        delete seleccionEtiquetas[codigo];
        await render();
        avisar(`Patrón ${codigo} marcado como Eliminado. Su historial se conserva.`, "ok");
      } else if (respuesta === "alterno") {
        abrirModalEliminarTotal(codigo);
      }
    });
  });

  lista2.querySelectorAll(".btn-calibrar-patron").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      abrirModalCalibracion(codigo);
    });
  });

  lista2.querySelectorAll(".btn-editar-patron").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirFormularioEdicion(e.target.getAttribute("data-codigo"));
    });
  });
  lista2.querySelectorAll(".btn-ficha-patron").forEach(btn => {
    btn.addEventListener("click", (e) => {
      abrirFichaPatron(e.target.getAttribute("data-codigo"));
    });
  });
  lista2.querySelectorAll(".btn-duplicar-patron").forEach(btn => {
    btn.addEventListener("click", (e) => {
      duplicarPatron(e.target.getAttribute("data-codigo"));
    });
  });
}

async function guardarEdicionPatron(codigoOriginal, form){
      const nuevoCodigoBruto = normalizarCodigoPatron(form.querySelector(".ep-codigo").value);
      const nuevoCodigo = nuevoCodigoBruto.toUpperCase();
      const nuevaArea = form.querySelector(".ep-area").value.trim();
      const nuevaCategoria = form.querySelector(".ep-categoria").value.trim();
      const nuevoEstado = form.querySelector(".ep-estado").value;
      const nuevaMarca = form.querySelector(".ep-marca").value.trim();
      const nuevoValorNominal = form.querySelector(".ep-valor").value.trim();
      const nuevaObservacion = form.querySelector(".ep-observacion").value.trim();
      const errBox = form.querySelector(".ep-error");
      errBox.style.display = "none";

      if (!nuevoCodigo) { errBox.textContent="El código no puede estar vacío."; errBox.style.display="block"; return; }
      if (!nuevaArea) { errBox.textContent="El laboratorio no puede estar vacío."; errBox.style.display="block"; return; }
      if (!nuevaCategoria) { errBox.textContent="Los equipos no pueden estar vacíos."; errBox.style.display="block"; return; }

      // Leemos las 3 actividades desde sus bloques (data-clave = CAL/V/M)
      const nuevasActividades = { CAL: actividadVacia(), V: actividadVacia(), M: actividadVacia() };
      let errorActividad = "";
      form.querySelectorAll(".ep-act-frecuencia").forEach(input => {
        const clave = input.getAttribute("data-clave");
        const raw = input.value;
        if (raw) {
          const num = parseInt(raw, 10);
          if (!Number.isInteger(num) || num < 1) {
            errorActividad = `La frecuencia de ${clave} debe ser un numero entero de meses mayor a 0.`;
          }
          nuevasActividades[clave].frecuenciaMeses = num;
        }
      });
      form.querySelectorAll(".ep-act-mesvenc").forEach(input => {
        const clave = input.getAttribute("data-clave");
        nuevasActividades[clave].mesVencimiento = input.value || null;
      });
      form.querySelectorAll(".ep-act-doc").forEach(input => {
        const clave = input.getAttribute("data-clave");
        nuevasActividades[clave].ultimoDocumento = input.value.trim();
      });
      form.querySelectorAll(".ep-act-fecha").forEach(input => {
        const clave = input.getAttribute("data-clave");
        nuevasActividades[clave].ultimaFechaEjecucion = input.value || null;
      });
      form.querySelectorAll(".ep-act-tipo").forEach(input => {
        const clave = input.getAttribute("data-clave");
        nuevasActividades[clave].tipoCalibracion = input.value || null;
      });

      if (errorActividad) { errBox.textContent = errorActividad; errBox.style.display="block"; return; }

      const duplicado = patrones.some(p => p.codigo.toUpperCase() === nuevoCodigo && p.codigo.toUpperCase() !== codigoOriginal.toUpperCase());
      if (duplicado) { errBox.textContent="Ya existe otro patrón con ese código."; errBox.style.display="block"; return; }

      const nuevoEsGrupo = form.querySelector(".ep-es-grupo").checked;
      const nuevasUnidades = parseInt(form.querySelector(".ep-unidades").value, 10);
      if (nuevoEsGrupo && (!Number.isInteger(nuevasUnidades) || nuevasUnidades < 1)) {
        errBox.textContent = "Indica cuántas piezas tiene el grupo."; errBox.style.display="block"; return;
      }
      // No se puede encoger un grupo por debajo de las piezas que ya estan
      // fuera: quedarian salidas registradas que el grupo no puede tener.
      if (nuevoEsGrupo) {
        const fuera = unidadesFueraDe(codigoOriginal);
        if (nuevasUnidades < fuera) {
          errBox.textContent = `Hay ${fuera} pieza(s) de este grupo fuera del laboratorio: no puedes dejarlo en ${nuevasUnidades}.`;
          errBox.style.display="block"; return;
        }
      }

      const idx = patrones.findIndex(p => p.codigo === codigoOriginal);
      if (idx !== -1) {
        const p = patrones[idx];
        const patronActualizado = {
          ...p, codigo: nuevoCodigo, area: nuevaArea, categoria: nuevaCategoria, estado: nuevoEstado,
          marca: nuevaMarca, valorNominal: nuevoValorNominal, observacion: nuevaObservacion,
          modelo: form.querySelector(".ep-modelo").value.trim(),
          serie: form.querySelector(".ep-serie").value.trim(),
          lugarUso: form.querySelector(".ep-lugar").value,
          esGrupo: nuevoEsGrupo,
          unidades: nuevoEsGrupo ? nuevasUnidades : null,
          actividades: nuevasActividades
        };
        const operaciones = [];

        if (nuevoCodigo !== codigoOriginal) {
          operaciones.push({ store: STORES.patrones, action: 'delete', key: codigoOriginal });
          for (const h of historial) {
            if (h.codigo === codigoOriginal) {
              operaciones.push({ store: STORES.historial, action: 'put', item: { ...h, codigo: nuevoCodigo } });
            }
          }
          // El historial acumulado de actividades tambien apunta al codigo:
          // si no se renombra, la hoja de vida del patron quedaria huerfana.
          for (const a of actividadesEjecutadas) {
            if (a.codigoPatron === codigoOriginal) {
              operaciones.push({ store: STORES.actividades, action: 'put', item: { ...a, codigoPatron: nuevoCodigo } });
            }
          }
        }
        operaciones.push({ store: STORES.patrones, action: 'put', item: patronActualizado });

        await runAtomicTransaction([STORES.patrones, STORES.historial, STORES.actividades], operaciones);

        // Bug corregido: si el codigo cambia y ese patron estaba marcado
        // en la seleccion de "Registrar salida", la entrada vieja quedaba
        // apuntando a un codigo que ya no existe (seleccion fantasma).
        if (nuevoCodigo !== codigoOriginal && seleccionados[codigoOriginal]) {
          delete seleccionados[codigoOriginal];
          seleccionados[nuevoCodigo] = true;
        }
        if (nuevoCodigo !== codigoOriginal && seleccionEtiquetas[codigoOriginal]) {
          delete seleccionEtiquetas[codigoOriginal];
          seleccionEtiquetas[nuevoCodigo] = true;
        }
      }
      await render();
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
const MESES_CORTOS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function aniosDisponiblesPrograma(){
  const anios = new Set([new Date().getFullYear()]);
  patrones.forEach(p => {
    const act = getActividades(p);
    ACTIVIDADES_ISO.forEach(({clave}) => {
      const a = act[clave];
      if (a.mesVencimiento) anios.add(Number(a.mesVencimiento.slice(0,4)));
      if (a.ultimaFechaEjecucion) anios.add(Number(a.ultimaFechaEjecucion.slice(0,4)));
    });
  });
  actividadesEjecutadas.forEach(a => {
    if (a.fechaEjecucion) anios.add(Number(a.fechaEjecucion.slice(0,4)));
  });
  return Array.from(anios).filter(n => !isNaN(n)).sort();
}

// Devuelve 12 celdas (una por mes) para un patron y una actividad.
function celdasAnioActividad(patron, clave, anio){
  const celdas = new Array(12).fill(null);
  const act = getActividades(patron)[clave];
  const anioTxt = String(anio);

  // 1) Ejecuciones reales registradas en la app (historial acumulado)
  actividadesEjecutadas
    .filter(a => a.codigoPatron === patron.codigo && a.clave === clave &&
                 a.fechaEjecucion && a.fechaEjecucion.slice(0,4) === anioTxt)
    .forEach(a => {
      const m = Number(a.fechaEjecucion.slice(5,7)) - 1;
      if (m >= 0 && m < 12) {
        celdas[m] = {
          texto: a.tipo || clave,
          clase: "cal-realizado",
          titulo: `Realizado el ${formatFecha(a.fechaEjecucion)}` +
                  (a.documento ? ` · Doc: ${a.documento}` : "")
        };
      }
    });

  // 2) Ultima ejecucion que venia del programa Excel (si no hay ya una celda)
  if (act.ultimaFechaEjecucion && act.ultimaFechaEjecucion.slice(0,4) === anioTxt) {
    const m = Number(act.ultimaFechaEjecucion.slice(5,7)) - 1;
    if (m >= 0 && m < 12 && !celdas[m]) {
      celdas[m] = {
        texto: act.tipoCalibracion || clave,
        clase: "cal-realizado",
        titulo: `Realizado el ${formatFecha(act.ultimaFechaEjecucion)}` +
                (act.ultimoDocumento ? ` · Doc: ${act.ultimoDocumento}` : "")
      };
    }
  }

  // 3) Vencimiento programado
  if (act.mesVencimiento && act.mesVencimiento.slice(0,4) === anioTxt) {
    const m = Number(act.mesVencimiento.slice(5,7)) - 1;
    const est = estadoActividad(act);
    if (m >= 0 && m < 12 && !celdas[m]) {
      celdas[m] = {
        texto: act.tipoCalibracion || clave,
        clase: est === "vencido" ? "cal-vencido" : est === "por_vencer" ? "cal-porvencer" : "cal-programado",
        titulo: est === "vencido" ? `Vencido desde ${formatMesISO(act.mesVencimiento)}`
              : est === "por_vencer" ? "Vence este mes"
              : `Programado para ${formatMesISO(act.mesVencimiento)}`
      };
    }
  }
  return celdas;
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
  const tabla = document.getElementById("tabla-programa");
  if (!tabla) return;
  const anio = Number(document.getElementById("prog-anio").value) || new Date().getFullYear();
  const area = document.getElementById("prog-area").value;
  const actFiltro = document.getElementById("prog-actividad").value;
  const busq = (document.getElementById("prog-buscar").value || "").trim().toLowerCase();

  const claves = actFiltro === "Todas" ? ACTIVIDADES_ISO.map(a => a.clave) : [actFiltro];

  const candidatos = patrones.filter(p => {
    if (p.estado === "Eliminado") return false;
    if (area !== "Todas" && p.area !== area) return false;
    if (busq && !(
      p.codigo.toLowerCase().includes(busq) ||
      (p.categoria || "").toLowerCase().includes(busq) ||
      (p.marca || "").toLowerCase().includes(busq)
    )) return false;
    return true;
  });

  // Solo mostramos patrones que tengan algo que decir ese año.
  const filas = [];
  candidatos.forEach(p => {
    const bloque = [];
    claves.forEach(clave => {
      const celdas = celdasAnioActividad(p, clave, anio);
      if (celdas.some(Boolean)) bloque.push({ clave, celdas });
    });
    if (bloque.length) filas.push({ p, bloque });
  });
  filas.sort((a,b) => a.p.area.localeCompare(b.p.area) || a.p.codigo.localeCompare(b.p.codigo));

  const totalActividades = filas.reduce((s,f) => s + f.bloque.length, 0);
  document.getElementById("prog-resumen").textContent =
    `${filas.length} patrón(es) con actividad programada o ejecutada en ${anio} · ${totalActividades} línea(s) de actividad.`;

  if (!filas.length) {
    tabla.innerHTML = `<tbody><tr><td style="padding:16px;" class="empty-msg">No hay actividades registradas ni programadas para ${anio} con estos filtros.</td></tr></tbody>`;
    return;
  }

  const encabezado = `<thead><tr>
      <th class="col-patron">Patrón / actividad</th>
      ${MESES_CORTOS.map(m => `<th>${m}</th>`).join("")}
    </tr></thead>`;

  let cuerpo = "";
  let areaActual = null;
  filas.forEach(({p, bloque}) => {
    if (area === "Todas" && p.area !== areaActual) {
      areaActual = p.area;
      cuerpo += `<tr class="fila-grupo"><th class="col-patron" colspan="13">${escapeHTML(areaActual)}</th></tr>`;
    }
    bloque.forEach(({clave, celdas}, i) => {
      const nombre = ACTIVIDADES_ISO.find(a => a.clave === clave).nombre;
      const etiquetaPatron = i === 0
        ? `<div class="codigo">${escapeHTML(p.codigo)}</div>
           <div class="cal-actividad">${escapeHTML(p.categoria)}</div>
           <div class="cal-actividad"><b>${escapeHTML(nombre)}</b></div>`
        : `<div class="cal-actividad" style="padding-left:2px;"><b>${escapeHTML(nombre)}</b></div>`;
      cuerpo += `<tr><th class="col-patron">${etiquetaPatron}</th>` +
        celdas.map((c, m) => c
          ? `<td class="mes" data-codigo="${escapeHTML(p.codigo)}" data-clave="${clave}" title="${escapeHTML(c.titulo)}"><span class="cal-marca ${c.clase}">${escapeHTML(c.texto)}</span></td>`
          : `<td class="mes vacia" data-codigo="${escapeHTML(p.codigo)}" data-clave="${clave}" title="Registrar ${escapeHTML(nombre)} en ${MESES_CORTOS[m]} ${anio}"></td>`
        ).join("") + `</tr>`;
    });
  });

  tabla.innerHTML = encabezado + `<tbody>${cuerpo}</tbody>`;

  tabla.querySelectorAll("td.mes").forEach(td => {
    td.addEventListener("click", () => {
      abrirModalCalibracion(td.getAttribute("data-codigo"), td.getAttribute("data-clave"));
    });
  });
}

function descargarProgramaPDF(){
  const anio = Number(document.getElementById("prog-anio").value) || new Date().getFullYear();
  const area = document.getElementById("prog-area").value;
  const actFiltro = document.getElementById("prog-actividad").value;
  const claves = actFiltro === "Todas" ? ACTIVIDADES_ISO.map(a => a.clave) : [actFiltro];

  const filas = [];
  patrones
    .filter(p => p.estado !== "Eliminado" && (area === "Todas" || p.area === area))
    .sort((a,b) => a.area.localeCompare(b.area) || a.codigo.localeCompare(b.codigo))
    .forEach(p => {
      claves.forEach(clave => {
        const celdas = celdasAnioActividad(p, clave, anio);
        if (celdas.some(Boolean)) filas.push({ p, clave, celdas });
      });
    });

  if (!filas.length) { avisar("No hay actividades para " + anio + " con esos filtros.", "info"); return; }

  const doc = crearPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const mx = 10;
  const anchoPatron = 62, anchoMes = 17;
  let y = 16;

  function encabezado(){
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text(`Programa de calibración, comprobación intermedia y mantenimiento — ${anio}`, mx, y);
    y += 5;
    doc.setFontSize(8); doc.setFont(undefined, "normal");
    doc.text(`Laboratorio: ${area === "Todas" ? "todos" : area}    Generado: ${new Date().toLocaleString("es-PE")}`, mx, y);
    y += 5;
    doc.setFont(undefined, "bold"); doc.setFontSize(8);
    doc.text("Patrón / actividad", mx, y);
    MESES_CORTOS.forEach((m, i) => doc.text(m, mx + anchoPatron + i*anchoMes + 4, y));
    y += 2;
    doc.setDrawColor(170); doc.line(mx, y, mx + anchoPatron + 12*anchoMes, y);
    y += 4.5;
    doc.setFont(undefined, "normal");
  }
  encabezado();

  filas.forEach(({p, clave, celdas}) => {
    if (y > 195) { doc.addPage(); y = 16; encabezado(); }
    const nombre = ACTIVIDADES_ISO.find(a => a.clave === clave).nombre;
    doc.setFontSize(7.5);
    doc.text(String(p.codigo).slice(0, 26), mx, y);
    doc.setTextColor(110);
    doc.text(nombre, mx + 34, y);
    doc.setTextColor(0);
    celdas.forEach((c, i) => {
      if (!c) return;
      const x = mx + anchoPatron + i*anchoMes;
      if (c.clase === "cal-realizado") doc.setTextColor(8, 80, 65);
      else if (c.clase === "cal-vencido") doc.setTextColor(180, 30, 30);
      else if (c.clase === "cal-porvencer") doc.setTextColor(150, 100, 0);
      else doc.setTextColor(31, 63, 121);
      doc.setFont(undefined, "bold");
      doc.text(String(c.texto), x + 4, y);
      doc.setFont(undefined, "normal");
      doc.setTextColor(0);
    });
    y += 4.6;
  });

  y += 5;
  if (y > 190) { doc.addPage(); y = 16; }
  doc.setFontSize(8);
  doc.text("Leyenda:  CI = Calibración Interna · CE = Calibración Externa · VI/VE = Comprobación Intermedia · MP = Mantenimiento Preventivo", mx, y);
  y += 4;
  doc.text("Color:  verde = realizado · azul = programado · ámbar = vence este mes · rojo = vencido", mx, y);

  doc.save(`Programa_${anio}${area === "Todas" ? "" : "_" + area.replace(/[^a-zA-Z0-9]/g,"_")}.pdf`);
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

function actividadesDePatron(codigo){
  return actividadesEjecutadas
    .filter(a => a.codigoPatron === codigo)
    .sort((a,b) => (a.fechaEjecucion || "") < (b.fechaEjecucion || "") ? 1 : -1);
}

// Servicios en los que el patron SALIO de verdad.
//
// Una salida anulada nunca ocurrio: el patron se quito de esa orden en una
// correccion y no llego a moverse del laboratorio. Si se listara aqui, la
// hoja de vida diria que ese equipo se uso en un servicio en el que no
// estuvo, que es justo lo contrario de lo que se quiere documentar. El
// rastro de que entro en la orden y se retiro queda en el historial de esa
// OT, con su motivo, su autor y su fecha.
function salidasDePatron(codigo){
  return historial
    .filter(h => h.codigo === codigo && h.estadoMovimiento !== "Anulado")
    .sort((a,b) => (a.fechaHoraSalida || a.fecha || "") < (b.fechaHoraSalida || b.fecha || "") ? 1 : -1);
}

// Ultima fecha de calibracion (CAL) conocida: primero del historial
// acumulado; si no hay, la que quedo registrada en el propio patron.
function ultimaCalibracionDe(patron){
  const deHistorial = actividadesDePatron(patron.codigo).filter(a => a.clave === "CAL");
  if (deHistorial.length) return deHistorial[0].fechaEjecucion;
  return getActividades(patron).CAL.ultimaFechaEjecucion || null;
}

// Servicios en los que se uso el patron DESPUES de su ultima
// calibracion valida: los que habria que evaluar si el patron
// resulta no conforme.
function serviciosDesdeUltimaCalibracion(patron){
  const desde = ultimaCalibracionDe(patron);
  // salidasDePatron ya deja fuera las anuladas: un servicio en el que el
  // patron no llego a estar no es trabajo a reevaluar.
  return salidasDePatron(patron.codigo)
    .filter(h => !desde || (h.fecha || "") >= desde);
}

function abrirFichaPatron(codigo){
  const p = patrones.find(pp => pp.codigo === codigo);
  if (!p) return;
  fichaCodigoActual = codigo;
  document.getElementById("ficha-codigo").textContent = codigo;

  const act = getActividades(p);
  const ejecutadas = actividadesDePatron(codigo);
  const salidas = salidasDePatron(codigo);
  const afectados = serviciosDesdeUltimaCalibracion(p);
  const ultimaCal = ultimaCalibracionDe(p);
  const noConforme = ["No Cumple / Inoperativo", "Extraviado"].includes(p.estado);

  const datos = [
    ["Laboratorio", p.area],
    ["Equipos", p.categoria],
    ["Marca", p.marca || "No indica"],
    ["Modelo", p.modelo || "No indica"],
    ["Serie", p.serie || "No indica"],
    ["Valor nominal", p.valorNominal || "-"],
    ["Lugar de uso", p.lugarUso || "Campo"],
    ["Estado operativo", p.estado],
    ["Última calibración", ultimaCal ? formatFecha(ultimaCal) : "Sin registro"],
    ["Observación", p.observacion || "Ninguna"],
  ].map(([k,v]) => `<div><span style="color:var(--text-secondary);">${escapeHTML(k)}:</span> <b>${escapeHTML(v)}</b></div>`).join("");

  const programa = ACTIVIDADES_ISO.map(({clave, nombre}) => {
    const a = act[clave];
    const est = estadoActividad(a);
    const clase = est === 'vencido' ? 'vencido' : est === 'por_vencer' ? 'porvencer' : 'disp';
    const txtEstado = est === 'vencido' ? 'VENCIDA' : est === 'por_vencer' ? 'Vence este mes'
      : est === 'vigente' ? 'Vigente' : 'Sin programar';
    return `<div class="patron-row" style="cursor:default;">
      <div style="flex:1;">
        <div class="codigo">${escapeHTML(nombre)} (${escapeHTML(clave)})${a.tipoCalibracion ? " · " + escapeHTML(etiquetaTipoCal(a.tipoCalibracion)) : ""}</div>
        <div class="categoria">Frecuencia: ${a.frecuenciaMeses ? escapeHTML(String(a.frecuenciaMeses)) + " meses" : "no definida"} · Vence: ${a.mesVencimiento ? escapeHTML(formatMesISO(a.mesVencimiento)) : "-"}</div>
      </div>
      <span class="badge ${clase}">${escapeHTML(txtEstado)}</span>
    </div>`;
  }).join("");

  const filasEjecutadas = ejecutadas.length
    ? ejecutadas.map(a => `<div class="patron-row" style="cursor:default;">
        <div style="flex:1;">
          <div class="codigo">${escapeHTML(formatFecha(a.fechaEjecucion))} · ${escapeHTML(a.nombreActividad || a.clave)}${a.tipo ? " (" + escapeHTML(a.tipo) + ")" : ""}</div>
          <div class="categoria">Documento: ${escapeHTML(a.documento || "sin documento")} · Proximo vencimiento: ${escapeHTML(formatMesISO(a.mesVencimientoResultante))}</div>
        </div>
      </div>`).join("")
    : `<p class="empty-msg" style="padding:10px 14px;">Aún no hay actividades registradas desde la app. Las que vinieron del programa Excel figuran arriba como «última ejecución».</p>`;

  const filasSalidas = salidas.length
    ? salidas.slice(0, 40).map(h => {
        const anulada = h.estadoMovimiento === "Anulado";
        return `<div class="patron-row" style="cursor:default; ${anulada ? "opacity:.55;" : ""}">
        <div style="flex:1;">
          <div class="codigo" ${anulada ? 'style="text-decoration:line-through;"' : ""}>OT ${escapeHTML(h.numeroOT)} · ${escapeHTML(formatFecha(h.fecha))}${cantidadDeRegistro(h) > 1 ? ` · ${cantidadDeRegistro(h)} piezas` : ""}</div>
          <div class="categoria">${escapeHTML(h.empresa || "")} · ${escapeHTML(h.tecnico || "")} · ${escapeHTML(h.estadoMovimiento || "En servicio")}${anulada ? " (nunca salió)" : ""}</div>
        </div>
      </div>`;
      }).join("")
    : `<p class="empty-msg" style="padding:10px 14px;">Este patrón no ha salido a ningún servicio.</p>`;

  const avisoNoConforme = noConforme
    ? `<div class="card" style="background:#fde8e8; border-color:#e5b4b4;">
         <p class="title" style="color:var(--text-danger);">Atención: patrón no conforme (${escapeHTML(p.estado)})</p>
         <p style="font-size:13px; margin:0;">Según ISO 17025 (7.10) debes evaluar el impacto sobre los servicios en los que se usó
         desde su última calibración válida${ultimaCal ? " (" + escapeHTML(formatFecha(ultimaCal)) + ")" : ""}:
         <b>${afectados.length} servicio(s)</b> listados abajo como potencialmente afectados.</p>
       </div>`
    : "";

  document.getElementById("ficha-contenido").innerHTML = `
    ${avisoNoConforme}
    <div class="card"><p class="title">Identificación</p>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px; font-size:13px;">${datos}</div>
    </div>
    <p style="font-weight:700; font-size:14px; margin:0 0 6px;">Programa de actividades</p>
    <div class="inicio-lista" style="margin-bottom:16px;">${programa}</div>
    <p style="font-weight:700; font-size:14px; margin:0 0 6px;">Historial de actividades ejecutadas (${ejecutadas.length})</p>
    <div class="inicio-lista" style="margin-bottom:16px;">${filasEjecutadas}</div>
    <p style="font-weight:700; font-size:14px; margin:0 0 6px;">
      Servicios en los que se usó (${salidas.length}${afectados.length && salidas.length !== afectados.length ? ", " + afectados.length + " desde la ultima calibracion" : ""})
    </p>
    <div class="inicio-lista">${filasSalidas}</div>
  `;
  document.getElementById("modal-ficha").classList.add("open");
}

function cerrarFichaPatron(){
  fichaCodigoActual = null;
  document.getElementById("modal-ficha").classList.remove("open");
}

function descargarFichaPDF(){
  const p = patrones.find(pp => pp.codigo === fichaCodigoActual);
  if (!p) return;
  const act = getActividades(p);
  const ejecutadas = actividadesDePatron(p.codigo);
  const salidas = salidasDePatron(p.codigo);
  const ultimaCal = ultimaCalibracionDe(p);

  const doc = crearPDF({ unit: "mm", format: "a4" });
  const mx = 14;
  let y = 18;

  doc.setFontSize(14); doc.setFont(undefined, "bold");
  doc.text("Ficha de patrón - " + p.codigo, mx, y); y += 6;
  doc.setFontSize(9); doc.setFont(undefined, "normal");
  doc.text("Generado: " + new Date().toLocaleString("es-PE"), mx, y); y += 3;
  doc.setDrawColor(180); doc.line(mx, y, 196, y); y += 7;

  const datos = [
    ["Laboratorio", p.area], ["Equipos", p.categoria],
    ["Marca", p.marca || "No indica"], ["Modelo", p.modelo || "No indica"],
    ["Serie", p.serie || "No indica"], ["Valor nominal", p.valorNominal || "-"],
    ["Lugar de uso", p.lugarUso || "Campo"], ["Estado operativo", p.estado],
    ["Última calibración", ultimaCal ? formatFecha(ultimaCal) : "Sin registro"],
    ["Observación", p.observacion || "Ninguna"],
  ];
  doc.setFontSize(9);
  datos.forEach(([k, v]) => {
    if (y > 275) { doc.addPage(); y = 18; }
    doc.setFont(undefined, "bold"); doc.text(k + ":", mx, y);
    doc.setFont(undefined, "normal");
    doc.splitTextToSize(String(v), 120).forEach((l, i) => doc.text(l, mx + 45, y + i * 4));
    y += Math.max(1, doc.splitTextToSize(String(v), 120).length) * 4 + 1;
  });

  function seccion(titulo){
    y += 4;
    if (y > 265) { doc.addPage(); y = 18; }
    doc.setFont(undefined, "bold"); doc.setFontSize(11);
    doc.text(titulo, mx, y); y += 6;
    doc.setFont(undefined, "normal"); doc.setFontSize(9);
  }

  seccion("Programa de actividades");
  ACTIVIDADES_ISO.forEach(({clave, nombre}) => {
    const a = act[clave];
    if (y > 280) { doc.addPage(); y = 18; }
    const est = estadoActividad(a);
    const txt = `${nombre} (${clave})${a.tipoCalibracion ? " " + a.tipoCalibracion : ""}: cada ${a.frecuenciaMeses || "-"} meses · vence ${a.mesVencimiento ? formatMesISO(a.mesVencimiento) : "-"} · ${est === 'vencido' ? "VENCIDA" : est === 'por_vencer' ? "vence este mes" : est === 'vigente' ? "vigente" : "sin programar"}`;
    if (est === 'vencido') doc.setTextColor(180,30,30); else doc.setTextColor(0,0,0);
    doc.text(txt, mx, y); y += 5;
  });
  doc.setTextColor(0,0,0);

  seccion("Historial de actividades ejecutadas (" + ejecutadas.length + ")");
  if (!ejecutadas.length) { doc.text("Sin registros en la app.", mx, y); y += 5; }
  ejecutadas.forEach(a => {
    if (y > 280) { doc.addPage(); y = 18; }
    doc.text(`${formatFecha(a.fechaEjecucion)} · ${a.nombreActividad || a.clave}${a.tipo ? " (" + a.tipo + ")" : ""} · Doc: ${a.documento || "-"} · Prox: ${formatMesISO(a.mesVencimientoResultante)}`, mx, y);
    y += 5;
  });

  seccion("Servicios en los que se usó (" + salidas.length + ")");
  if (!salidas.length) { doc.text("Sin salidas registradas.", mx, y); y += 5; }
  salidas.forEach(h => {
    if (y > 280) { doc.addPage(); y = 18; }
    doc.text(`OT ${h.numeroOT} · ${formatFecha(h.fecha)} · ${h.empresa || ""} · ${h.tecnico || ""} · ${h.estadoMovimiento || "En servicio"}`, mx, y);
    y += 5;
  });

  doc.save("Ficha_" + String(p.codigo).replace(/[^a-zA-Z0-9-]/g, "_") + ".pdf");
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
  const fecha = document.getElementById("modal-cal-fecha").value;
  const intervaloRaw = document.getElementById("modal-cal-intervalo").value;
  const intervalo = intervaloRaw ? parseInt(intervaloRaw, 10) : NaN;
  const preview = document.getElementById("modal-cal-preview");
  if (!fecha || !Number.isInteger(intervalo) || intervalo < 1) {
    preview.textContent = "-";
    return;
  }
  const mesFecha = fecha.slice(0,7); // YYYY-MM
  const proximo = sumarMesesAMes(mesFecha, intervalo);
  preview.textContent = formatMesISO(proximo);
}

function cargarDatosActividadEnModal(){
  const codigo = modalCalibracionCodigoObjetivo;
  const patron = patrones.find(p => p.codigo === codigo);
  if (!patron) return;
  const clave = document.getElementById("modal-cal-actividad").value;
  const act = getActividades(patron)[clave];
  document.getElementById("modal-cal-intervalo").value = act.frecuenciaMeses || 12;
  document.getElementById("modal-cal-documento").value = "";
  // Opciones de tipo segun la actividad (CI/CE, VI/VE o MP), preseleccionando
  // el tipo que el patron ya tenia configurado para esa actividad.
  const selTipo = document.getElementById("modal-cal-tipo");
  selTipo.innerHTML = TIPOS_POR_ACTIVIDAD[clave]
    .map(([v, txt]) => `<option value="${v}"${(act.tipoCalibracion || "") === v ? " selected" : ""}>${txt}</option>`)
    .join("");
  actualizarPreviewCalibracion();
}

function abrirModalCalibracion(codigo, claveInicial = "CAL"){
  const patron = patrones.find(p => p.codigo === codigo);
  if (!patron) return;
  modalCalibracionCodigoObjetivo = codigo;
  document.getElementById("modal-cal-codigo").textContent = codigo;
  document.getElementById("modal-cal-actividad").value = claveInicial;
  document.getElementById("modal-cal-fecha").value = todayISO();
  document.getElementById("modal-cal-error").style.display = "none";
  cargarDatosActividadEnModal();
  document.getElementById("modal-calibracion").classList.add("open");
}

function cerrarModalCalibracion(){
  modalCalibracionCodigoObjetivo = null;
  document.getElementById("modal-calibracion").classList.remove("open");
  actualizarContadorEtiquetas();
}

// ============================================================
