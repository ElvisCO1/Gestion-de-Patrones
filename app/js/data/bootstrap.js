/* Migración y catálogo inicial. Extraído de control_patrones_original.html (fase 2). */
(function (global) {
  "use strict";

  const persistence = global.Metrologia.services.data;
  const { STORES, getAll, saveRecord } = persistence;
// ============================================================
// 2.  MIGRACIÓN DESDE LOCALSTORAGE (solo para la base oficial, por si acaso)
// ============================================================
const LEGACY_KEYS = {
  patrones: 'metrologia_patrones',
  tecnicos: 'metrologia_tecnicos',
  historial: 'metrologia_historial'
};

async function migrarDesdeLocalStorage() {
  const patronesExistentes = await getAll(STORES.patrones);
  if (patronesExistentes.length > 0) return false; // ya hay datos

  let migrado = false;
  for (const [store, key] of Object.entries(LEGACY_KEYS)) {
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const items = JSON.parse(data);
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            await saveRecord(store, item);
          }
          localStorage.removeItem(key);
          migrado = true;
        }
      } catch (e) {
        console.warn('Error migrando', key, e);
      }
    }
  }
  return migrado;
}

// ============================================================
// 3.  DATOS INICIALES (se cargan solo la PRIMERISIMA vez que se
//     usa la app en este navegador, nunca mas despues de eso)
// ============================================================
// Se usa una bandera en localStorage en vez de "la tabla esta vacia"
// para no repoblar con datos de ejemplo cuando el usuario elimina
// todos sus tecnicos o patrones a proposito.
const INICIALIZADO_KEY = 'metrologia_inicializado';

function buildPatronesIniciales() {
  return window.Metrologia.services.initialCatalog.getAll();
}
const TECNICOS_INICIALES = [];

async function cargarDatosIniciales() {
  // Solo poblamos con datos de ejemplo si esta app nunca se inicializo
  // antes en este navegador. Una vez inicializada, aunque el usuario
  // borre todos sus patrones o tecnicos, nunca se vuelven a reponer solos.
  if (localStorage.getItem(INICIALIZADO_KEY)) return;

  const patronesExistentes = await getAll(STORES.patrones);
  if (patronesExistentes.length === 0) {
    const iniciales = buildPatronesIniciales();
    for (const p of iniciales) {
      await saveRecord(STORES.patrones, p);
    }
  }
  const tecnicosExistentes = await getAll(STORES.tecnicos);
  if (tecnicosExistentes.length === 0) {
    for (const t of TECNICOS_INICIALES) {
      await saveRecord(STORES.tecnicos, t);
    }
  }

  localStorage.setItem(INICIALIZADO_KEY, '1');
}

  global.Metrologia.services.bootstrap = Object.freeze({
    INITIALIZED_KEY: INICIALIZADO_KEY,
    migrateFromLocalStorage: migrarDesdeLocalStorage,
    buildInitialPatterns: buildPatronesIniciales,
    loadInitialData: cargarDatosIniciales
  });
})(window);