/* Casos de uso transaccionales de patrones. */
(function (global) {
  "use strict";

  async function savePatternEdition(context) {
    const { codigoOriginal, form, normalizarCodigoPatron, actividadVacia,
      patrones, unidadesFueraDe, historial, actividadesEjecutadas, STORES,
      runAtomicTransaction, seleccionados, seleccionEtiquetas, render } = context;      const nuevoCodigoBruto = normalizarCodigoPatron(form.querySelector(".ep-codigo").value);
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
      await render();  }

  async function addPattern(context) {
    const {
      normalizarCodigoPatron, patrones, leerActividadesAlta, saveRecord,
      STORES, render, avisar, deleteRecord
    } = context;
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
    if (patrones.some(p => p.codigo.toLowerCase() === codigo.toLowerCase())) {
      errBox.textContent="Ya existe un patrón con ese código único."; errBox.style.display="block"; return;
    }

    const { acts, error } = leerActividadesAlta();
    if (error) { errBox.textContent = error; errBox.style.display="block"; return; }
    const codigoNormalizado = codigo.toUpperCase();
    const esGrupo = document.getElementById("np-es-grupo").checked;
    const unidades = parseInt(document.getElementById("np-unidades").value, 10);
    if (esGrupo && (!Number.isInteger(unidades) || unidades < 1)) {
      errBox.textContent = "Indica cuántas piezas tiene el grupo (un número entero mayor que 0).";
      errBox.style.display = "block"; return;
    }

    const nuevo = {
      codigo: codigoNormalizado, categoria, area, estado, marca,
      valorNominal: document.getElementById("np-valor").value.trim(), observacion: "",
      modelo: document.getElementById("np-modelo").value.trim(),
      serie: document.getElementById("np-serie").value.trim(),
      lugarUso: document.getElementById("np-lugar").value,
      esGrupo, unidades: esGrupo ? unidades : null, actividades: acts
    };
    await saveRecord(STORES.patrones, nuevo);
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

  async function registerActivity(context) {
    const { codigo, ACTIVIDADES_ISO, patrones, cerrarModalCalibracion,
      sumarMesesAMes, getActividades, STORES, runAtomicTransaction,
      formatMesISO, render, avisar } = context;
    if (!codigo) return;
    const errBox = document.getElementById("modal-cal-error");
    errBox.style.display = "none";
    const claveActividad = document.getElementById("modal-cal-actividad").value;
    const actividad = ACTIVIDADES_ISO.find(a => a.clave === claveActividad);
    const fecha = document.getElementById("modal-cal-fecha").value;
    const intervalo = parseInt(document.getElementById("modal-cal-intervalo").value, 10);
    const documento = document.getElementById("modal-cal-documento").value.trim();
    if (!fecha) { errBox.textContent = "Indica la fecha de ejecución."; errBox.style.display = "block"; return; }
    if (!Number.isInteger(intervalo) || intervalo < 1) {
      errBox.textContent = "La frecuencia debe ser un número entero de meses mayor a 0."; errBox.style.display = "block"; return;
    }
    const patron = patrones.find(p => p.codigo === codigo);
    if (!patron) { cerrarModalCalibracion(); return; }
    const proximoVencimiento = sumarMesesAMes(fecha.slice(0, 7), intervalo);
    const tipo = document.getElementById("modal-cal-tipo").value || null;
    const actividadesActuales = getActividades(patron);
    actividadesActuales[claveActividad] = {
      frecuenciaMeses: intervalo, mesVencimiento: proximoVencimiento,
      ultimoDocumento: documento, ultimaFechaEjecucion: fecha, tipoCalibracion: tipo
    };
    const nuevoEstadoOperativo = patron.estado === "En mantenimiento" ? "Disponible" : patron.estado;
    const registroActividad = {
      id: crypto.randomUUID ? crypto.randomUUID() : codigo + "-" + claveActividad + "-" + Date.now(),
      codigoPatron: codigo, clave: claveActividad, nombreActividad: actividad.nombre,
      tipo, fechaEjecucion: fecha, documento, frecuenciaMeses: intervalo,
      mesVencimientoResultante: proximoVencimiento, registradoEn: new Date().toISOString()
    };
    await runAtomicTransaction([STORES.patrones, STORES.actividades], [
      { store: STORES.patrones, action: "put", item: { ...patron, estado: nuevoEstadoOperativo, actividades: actividadesActuales } },
      { store: STORES.actividades, action: "put", item: registroActividad }
    ]);
    cerrarModalCalibracion();
    await render();
    avisar(`${actividad.nombre} registrada para ${codigo}. Próximo vencimiento: ${formatMesISO(proximoVencimiento)}.`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: async () => {
        await runAtomicTransaction([STORES.patrones, STORES.actividades], [
          { store: STORES.patrones, action: "put", item: patron },
          { store: STORES.actividades, action: "delete", key: registroActividad.id }
        ]);
        await render();
        avisar(`Se deshizo el registro de ${actividad.nombre} en ${codigo}.`, "info");
      }
    });
  }

  global.Metrologia.services.patternActions = Object.freeze({ savePatternEdition, addPattern, registerActivity });
})(window);
