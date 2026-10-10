/* Caso de uso para el alta de técnicos y encargados de laboratorio. */
(function (global) {
  "use strict";

  async function addPerson(context) {
    const {
      normalizarNombre, ROL_SUPERVISOR, ROL_TECNICO, tecnicos, saveRecord,
      STORES, nombreRol, render, alternarCamposPersonal, cerrarModalPersonal
    } = context;
    const errBox = document.getElementById("nt-error");
    const okBox = document.getElementById("nt-ok");
    errBox.style.display="none"; okBox.style.display="none";
    const nombre = normalizarNombre(document.getElementById("nt-nombre").value);
    const rol = document.getElementById("nt-rol").value === ROL_SUPERVISOR ? ROL_SUPERVISOR : ROL_TECNICO;
    const laptop = document.getElementById("nt-laptop").value.trim();
    const termo = document.getElementById("nt-termo").value.trim();
    const multimetro = document.getElementById("nt-multimetro").value.trim();
    const extra = document.getElementById("nt-extra").value.trim();
    const labs = [...document.querySelectorAll("#nt-laboratorios .nt-lab:checked")].map(c => c.value);
    if (!nombre) { errBox.textContent="Indica el nombre de la persona."; errBox.style.display="block"; return; }
    if (tecnicos.some(t => t.nombre.toLowerCase() === nombre.toLowerCase())) {
      errBox.textContent="Ya existe alguien con ese nombre en el personal."; errBox.style.display="block"; return;
    }
    if (rol === ROL_SUPERVISOR && !labs.length) {
      errBox.textContent="Marca al menos un laboratorio a su cargo: es lo que hace que su nombre salga en las actas.";
      errBox.style.display="block"; return;
    }
    const nuevo = rol === ROL_SUPERVISOR
      ? { nombre, rol, laboratorios: labs, activo: true }
      : { nombre, rol, laptop, termohigrometro: termo, multimetro, extra, activo: true };
    await saveRecord(STORES.tecnicos, nuevo);
    okBox.textContent = nombreRol(rol) + " " + nombre + " añadido correctamente.";
    okBox.style.display="block";
    ["nt-nombre", "nt-laptop", "nt-termo", "nt-multimetro", "nt-extra"].forEach(id => { document.getElementById(id).value=""; });
    await render();
    alternarCamposPersonal();
    if (typeof cerrarModalPersonal === "function") cerrarModalPersonal();
  }

  async function updatePerson(context, index, data) {
    const {
      tecnicos, ROL_SUPERVISOR, STORES, historial, movimientoCerrado,
      listaEncargados, SEP_ENCARGADOS, runAtomicTransaction
    } = context;
    const anterior = tecnicos[index];
    if (!anterior) return null;
    const nombreAnterior = anterior.nombre;
    const activoAnterior = anterior.activo !== false;
    const actualizado = data.rol === ROL_SUPERVISOR
      ? { nombre: data.nombre, rol: data.rol, laboratorios: data.labs, activo: activoAnterior }
      : { nombre: data.nombre, rol: data.rol, laptop: data.laptop, termohigrometro: data.termo, multimetro: data.multimetro, extra: data.extra, activo: activoAnterior };
    const operaciones = [];
    if (actualizado.nombre !== nombreAnterior) {
      operaciones.push({ store: STORES.tecnicos, action: "delete", key: nombreAnterior });
      const tocadas = new Map();
      historial.filter(h => h.tecnico === nombreAnterior && !movimientoCerrado(h))
        .forEach(h => tocadas.set(h.id, { ...h, tecnico: actualizado.nombre }));
      historial.filter(h => !movimientoCerrado(h) && listaEncargados(h.encargadoLaboratorio).includes(nombreAnterior))
        .forEach(h => {
          const base = tocadas.get(h.id) || { ...h };
          tocadas.set(h.id, { ...base, encargadoLaboratorio: listaEncargados(h.encargadoLaboratorio)
            .map(n => n === nombreAnterior ? actualizado.nombre : n).join(SEP_ENCARGADOS) });
        });
      tocadas.forEach(item => operaciones.push({ store: STORES.historial, action: "put", item }));
    }
    operaciones.push({ store: STORES.tecnicos, action: "put", item: actualizado });
    await runAtomicTransaction([STORES.tecnicos, STORES.historial], operaciones);
    tecnicos[index] = actualizado;
    return { nombreAnterior, actualizado };
  }

  async function setPersonActive(context, person, active) {
    const { saveRecord, STORES } = context;
    await saveRecord(STORES.tecnicos, { ...person, activo: active });
  }

  async function removePerson(context, name) {
    const { deleteRecord, STORES } = context;
    await deleteRecord(STORES.tecnicos, name);
  }

  global.Metrologia.services.personnelActions = Object.freeze({
    addPerson, updatePerson, setPersonActive, removePerson
  });
})(window);
