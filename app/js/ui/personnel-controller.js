/* Eventos de la pantalla Personal; el marcado vive en personnel-renderer.js. */
(function (global) {
  'use strict';

  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function bind(context, box) {
    const {
      document, tecnicos, historial, ROL_TECNICO, ROL_SUPERVISOR, STORES,
      rolPersona, nombreRol, esSupervisor, listaEncargados, SEP_ENCARGADOS,
      normalizarNombre, casillasLaboratorios, movimientoCerrado,
      abrirModalEliminarTecnicoTotal, confirmar, avisar, render,
      saveRecord, deleteRecord, runAtomicTransaction, personnelActions
    } = context;

    box.querySelectorAll('.btn-reactivar-tec').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const index = parseInt(event.target.getAttribute('data-idx'), 10);
        const person = tecnicos[index];
        if (!person) return;
        await personnelActions.setPersonActive({ saveRecord, STORES }, person, true);
        await render();
      });
    });

    box.querySelectorAll('.btn-eliminar-tec').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const index = parseInt(event.target.getAttribute('data-idx'), 10);
        const person = tecnicos[index];
        if (!person) return;
        const role = nombreRol(rolPersona(person)).toLowerCase();
        const hasHistory = historial.some((record) =>
          record.tecnico === person.nombre || listaEncargados(record.encargadoLaboratorio).includes(person.nombre));

        if (!hasHistory) {
          const accepted = await confirmar({
            titulo: 'Eliminar del personal',
            mensaje: `Se eliminará definitivamente a ${person.nombre} (${role}).\n\nNo tiene historial asociado.`,
            textoOk: 'Eliminar', peligro: true
          });
          if (!accepted) return;
          const copy = { ...person };
          await personnelActions.removePerson({ deleteRecord, STORES }, person.nombre);
          await render();
          avisar(`${copy.nombre} eliminado del personal.`, 'ok', {
            etiqueta: 'Deshacer',
            ejecutar: async () => { await saveRecord(STORES.tecnicos, copy); await render(); }
          });
          return;
        }

        const supervisorWithHistory = esSupervisor(person);
        const answer = await confirmar({
          titulo: supervisorWithHistory ? 'El encargado figura en actas' : 'El técnico tiene historial',
          mensaje: supervisorWithHistory
            ? `${person.nombre} figura como encargado de laboratorio en actas ya emitidas.\n\n` +
              'Se marcará como "Inactivo": deja de asignarse a nuevas salidas, pero las actas antiguas siguen nombrándolo, para mantener la trazabilidad.'
            : `${person.nombre} aparece en registros del historial.\n\n` +
              'Lo recomendable es marcarlo como "Inactivo": deja de aparecer al crear nuevas OT pero su historial se conserva.',
          textoOk: 'Marcar como Inactivo',
          textoAlterno: supervisorWithHistory ? '' : 'Borrar todo (técnico + historial)',
          peligroAlterno: true
        });

        if (answer === 'ok') {
          await personnelActions.setPersonActive({ saveRecord, STORES }, person, false);
          await render();
          avisar(`${person.nombre} marcado como Inactivo. Su historial se conserva.`, 'ok');
        } else if (answer === 'alterno' && !supervisorWithHistory) {
          abrirModalEliminarTecnicoTotal(person.nombre);
        }
      });
    });

    box.querySelectorAll('.btn-editar-tec').forEach((button) => {
      button.addEventListener('click', (event) => {
        const index = event.target.getAttribute('data-idx');
        document.querySelectorAll('.tec-edit-form').forEach((form) => form.classList.remove('open'));
        document.getElementById(`edit-tec-${index}`).classList.add('open');
      });
    });
    box.querySelectorAll('.btn-cancelar-tec').forEach((button) => {
      button.addEventListener('click', (event) => {
        const index = event.target.getAttribute('data-idx');
        document.getElementById(`edit-tec-${index}`).classList.remove('open');
      });
    });
    box.querySelectorAll('.ed-rol').forEach((select) => {
      select.addEventListener('change', (event) => {
        const form = event.target.closest('.tec-edit-form');
        const isSupervisor = event.target.value === ROL_SUPERVISOR;
        form.querySelectorAll('.ed-solo-tecnico').forEach((item) => { item.style.display = isSupervisor ? 'none' : ''; });
        form.querySelectorAll('.ed-solo-supervisor').forEach((item) => { item.style.display = isSupervisor ? '' : 'none'; });
      });
    });
    box.querySelectorAll('.btn-guardar-tec').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const index = parseInt(event.target.getAttribute('data-idx'), 10);
        const form = document.getElementById(`edit-tec-${index}`);
        const name = normalizarNombre(form.querySelector('.ed-nombre').value);
        const role = form.querySelector('.ed-rol').value === ROL_SUPERVISOR ? ROL_SUPERVISOR : ROL_TECNICO;
        const laptop = form.querySelector('.ed-laptop').value.trim();
        const termo = form.querySelector('.ed-termo').value.trim();
        const multimetro = form.querySelector('.ed-multimetro').value.trim();
        const extra = form.querySelector('.ed-extra').value.trim();
        const labs = [...form.querySelectorAll('.ed-lab:checked')].map((checkbox) => checkbox.value);
        const errorBox = form.querySelector('.ed-error');
        errorBox.style.display = 'none';

        if (!name) {
          errorBox.textContent = 'El nombre no puede estar vacío.';
          errorBox.style.display = 'block';
          return;
        }
        const duplicate = tecnicos.some((person, position) => position !== index && person.nombre.toLowerCase() === name.toLowerCase());
        if (duplicate) {
          errorBox.textContent = 'Ya existe alguien con ese nombre en el personal.';
          errorBox.style.display = 'block';
          return;
        }

        const result = await personnelActions.updatePerson({
          tecnicos, ROL_SUPERVISOR, STORES, historial, movimientoCerrado,
          listaEncargados, SEP_ENCARGADOS, runAtomicTransaction
        }, index, { nombre: name, rol: role, laptop, termo, multimetro, extra, labs });
        if (!result) return;
        const technicianSelect = document.getElementById('in-tecnico');
        if (technicianSelect.value === result.nombreAnterior) technicianSelect.value = name;
        await render();
      });
    });

    const newPersonLabs = document.getElementById('nt-laboratorios');
    if (newPersonLabs) {
      const selected = [...newPersonLabs.querySelectorAll('.nt-lab:checked')].map((checkbox) => checkbox.value);
      newPersonLabs.innerHTML = casillasLaboratorios('nt-lab', selected);
    }
  }

  namespace.modules.personnelController = Object.freeze({ bind });
})(window);
