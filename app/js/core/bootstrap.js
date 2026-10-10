// ============================================================
// 0. PERSISTENCIA
// ============================================================
// Implementación en js/db.js. Estas referencias mantienen la API del código
// de aplicación mientras cada pantalla se migra a módulos propios.
const { STORES, openDB, getAll, saveRecord, deleteRecord, clearStore,
  runAtomicTransaction, getConfig, setConfig } = window.MetrologiaDB;
// ============================================================
// 2.b ESPEJO AUTOMATICO A DISCO (File System Access API)
//
// IndexedDB vive dentro del navegador: si se borran los datos de
// navegacion o falla el equipo, se pierde todo. Este modulo copia
// automaticamente TODO el contenido (patrones, tecnicos, historial)
// a un archivo real en una carpeta que el usuario elige una sola
// vez (ej. D:\PATRONES\datos):
//   - datos_metrologia.json         -> siempre la copia mas reciente
//   - respaldos/respaldo_FECHA.json -> un respaldo por dia, historico
//
// El espejo se dispara solo, con un pequeño retraso (debounce),
// despues de cada escritura exitosa en la base. Requiere Chrome o
// Edge (la API no existe en Firefox); si no esta disponible, la app
// funciona igual que antes y lo indica en la barra de estado.
// ============================================================
const SOPORTA_CARPETA_DATOS = ('showDirectoryPicker' in window);
const CARPETA_CONFIG_KEY = 'carpetaDatos';
const RESPALDO_DIARIO_KEY = 'metrologia_respaldo_diario';

let carpetaDatosHandle = null;     // handle activo con permiso concedido
let carpetaDatosPendiente = null;  // handle guardado que espera un clic para reactivar permiso
let espejoTimer = null;
let ultimoEspejoOK = null;
let ultimoEspejoError = null;

function programarEspejo(){
  if (!carpetaDatosHandle) return;
  clearTimeout(espejoTimer);
  espejoTimer = setTimeout(() => {
    espejoADisco().catch(e => {
      ultimoEspejoError = e;
      console.warn('No se pudo espejar los datos a disco:', e);
      actualizarEstadoAlmacenamiento();
    });
  }, 1500);
}

async function serializarTodo(){
  const [p, t, h, a, c] = await Promise.all([
    getAll(STORES.patrones), getAll(STORES.tecnicos),
    getAll(STORES.historial), getAll(STORES.actividades),
    getAll(STORES.clientes)
  ]);
  // El logo propio va en el respaldo: si no, al restaurar en otro equipo
  // los PDF saldrian con el logo de fabrica sin que nadie se de cuenta.
  let logo = null;
  try { logo = await getConfig(LOGO_CONFIG_KEY); } catch(e){ /* el respaldo sale igual */ }
  return JSON.stringify({
    version: 4,
    exportadoEn: new Date().toISOString(),
    patrones: p, tecnicos: t, historial: h, actividades: a, clientes: c,
    logo: logo || null
  }, null, 1);
}

async function escribirArchivo(dirHandle, nombre, contenido){
  const fh = await dirHandle.getFileHandle(nombre, { create: true });
  const writable = await fh.createWritable();
  await writable.write(contenido);
  await writable.close();
}

async function espejoADisco(){
  if (!carpetaDatosHandle) return;
  const contenido = await serializarTodo();
  await escribirArchivo(carpetaDatosHandle, 'datos_metrologia.json', contenido);

  // Un respaldo historico por dia (el primero que se escriba ese dia).
  const hoy = todayISO();
  if (localStorage.getItem(RESPALDO_DIARIO_KEY) !== hoy) {
    const dirRespaldos = await carpetaDatosHandle.getDirectoryHandle('respaldos', { create: true });
    await escribirArchivo(dirRespaldos, 'respaldo_' + hoy + '.json', contenido);
    localStorage.setItem(RESPALDO_DIARIO_KEY, hoy);
  }
  ultimoEspejoOK = new Date();
  ultimoEspejoError = null;
  actualizarEstadoAlmacenamiento();
}

async function conectarCarpetaDatos(){
  if (!SOPORTA_CARPETA_DATOS) {
    avisar('Este navegador no soporta guardar en carpeta (usa Chrome o Edge). Mientras tanto, usa "Exportar respaldo" con frecuencia.', 'error');
    return;
  }
  // Si hay una carpeta guardada esperando permiso, solo lo re-pedimos
  // (evita que el usuario tenga que volver a buscar la carpeta).
  if (carpetaDatosPendiente) {
    try {
      const permiso = await carpetaDatosPendiente.requestPermission({ mode: 'readwrite' });
      if (permiso === 'granted') {
        carpetaDatosHandle = carpetaDatosPendiente;
        carpetaDatosPendiente = null;
        await espejoADisco();
        return;
      }
    } catch (e) {
      console.warn('No se pudo reactivar la carpeta guardada, se pedira de nuevo:', e);
    }
    carpetaDatosPendiente = null;
  }
  try {
    const handle = await window.showDirectoryPicker({ id: 'metrologia-datos', mode: 'readwrite' });
    carpetaDatosHandle = handle;
    await setConfig(CARPETA_CONFIG_KEY, handle);
    await espejoADisco();
  } catch (e) {
    if (e && e.name === 'AbortError') return; // el usuario cancelo el dialogo
    avisar('No se pudo conectar la carpeta de datos: ' + e.message, 'error');
  }
  actualizarEstadoAlmacenamiento();
}

// Al arrancar: recupera la carpeta usada la ultima vez. Si el navegador
// recuerda el permiso, el espejo queda activo solo; si no, se muestra el
// boton "Reactivar" (los permisos de escritura requieren un clic).
async function restaurarCarpetaDatos(){
  if (!SOPORTA_CARPETA_DATOS) return;
  try {
    const handle = await getConfig(CARPETA_CONFIG_KEY);
    if (!handle) return;
    const permiso = await handle.queryPermission({ mode: 'readwrite' });
    if (permiso === 'granted') {
      carpetaDatosHandle = handle;
      programarEspejo();
    } else {
      carpetaDatosPendiente = handle;
    }
  } catch (e) {
    console.warn('No se pudo restaurar la carpeta de datos:', e);
  }
}

function actualizarEstadoAlmacenamiento(){
  const status = document.getElementById('storage-status');
  const btn = document.getElementById('btn-conectar-carpeta');
  if (!status || !btn) return;
  if (carpetaDatosHandle) {
    const hora = ultimoEspejoOK
      ? ' Último guardado: ' + ultimoEspejoOK.toLocaleTimeString('es-PE', {hour:'2-digit', minute:'2-digit'}) + '.'
      : '';
    const errorTxt = ultimoEspejoError ? ' ATENCIÓN: el último guardado a disco falló, revisa la carpeta.' : '';
    status.textContent = 'Datos protegidos: copia automática en la carpeta "' + carpetaDatosHandle.name + '" (+ respaldo diario).' + hora + errorTxt;
    btn.style.display = 'none';
  } else if (carpetaDatosPendiente) {
    status.textContent = 'La copia automática a la carpeta "' + carpetaDatosPendiente.name + '" está pausada: haz clic en «Reactivar carpeta de datos».';
    btn.textContent = 'Reactivar carpeta de datos';
    btn.style.display = 'inline-block';
  } else if (SOPORTA_CARPETA_DATOS) {
    status.textContent = 'Los datos viven solo en este navegador. Conecta una carpeta para tener copia automática en disco.';
    btn.textContent = 'Conectar carpeta de datos';
    btn.style.display = 'inline-block';
  } else {
    status.textContent = 'Los datos se guardan en IndexedDB de este navegador. Este navegador no soporta copia automática a carpeta (usa Chrome/Edge); exporta respaldos manualmente con frecuencia.';
    btn.style.display = 'none';
  }
}

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
  // Catalogo real del laboratorio, cargado a partir del inventario maestro
  // (imagen de tabla por magnitud / equipo-instrumento / codigo).
  return [
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-13", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-14", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-15", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-16", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-17", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-18", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-19", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas E2", codigo: "PTB-STE2-20", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-01", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-02", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-03", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-04", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-05", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas F1", codigo: "PTB-STF1-06", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M1", codigo: "PTB-STM1-01", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M1", codigo: "PTB-STM1-02", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M1", codigo: "PTB-STM1-03 juegos con pesas de 1g a 2 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-01", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-02", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-03", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-04", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-05", estado: "Disponible" },
    { area: "Masa", categoria: "Juego de Pesas M2", codigo: "PTB-STM2-06", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-M1-01", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-M1-02", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-M1-03", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-E2-13", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-E2-14", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-E2-15", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-E2-16", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-F1-01", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-F1-02", estado: "Disponible" },
    { area: "Masa", categoria: "Pinzas de juegos de pesas", codigo: "ITS-PTB-ST-F1-03", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-02", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-03 1kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-04 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-05", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-06 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-07 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas E2: 500 g, 1 kg", codigo: "PTB-PEE2-09 1kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-01 5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-02 10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-03 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-04 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-05 1kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-06 2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-22 10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-17 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-23 20kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-21-5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-24-0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-25 0,5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-26 2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-06-2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-27-2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 5 kg; 10 kg; 20 kg y 500 g", codigo: "PTB-PEF1-07 2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-08", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-11 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-12 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-13 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-14 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-15 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-16 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-18 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-19 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-20 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F1 de 100 g; 2 kg; 1 kg", codigo: "PTB-PEF1-21 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F2 de 20 kg; 200 g; 1 kg y 2 kg", codigo: "PTB-PEF2-01 20kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F2 de 20 kg; 200 g; 1 kg y 2 kg", codigo: "PTB-PEF2-02 20kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F2 de 20 kg; 200 g; 1 kg y 2 kg", codigo: "PTB-PEF2-03 1kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas F2 de 20 kg; 200 g; 1 kg y 2 kg", codigo: "PTB-PEF2-04 2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M1 de 1 kg, 5 kg, 10 kg y 20 kg", codigo: "PTB-PEM1-01 kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M1 de 1 kg, 5 kg, 10 kg y 20 kg", codigo: "PTB-PEM1-02 20kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M1 de 1 kg, 5 kg, 10 kg y 20 kg", codigo: "PTB-PEM1-03-5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M1 de 1 kg, 5 kg, 10 kg y 20 kg", codigo: "PTB-PEM1-04 5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-001 5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-002 5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-005 5kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-006 10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-007 10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-008-10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-009 10kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-010", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-0035kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 10 kg; 10 kg; 5 kg", codigo: "PTB-PEM2-06 2kg", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-21", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-22", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-23", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-24", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-25", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-26", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-27", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-28", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-29", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-30", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-31", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-32", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-33", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-34", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-35", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-36", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-37", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-38", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-39", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-40", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-41", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-42", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-43", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-44", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-45", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-46", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-47", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-48", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-49", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-50", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-51", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-52", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-53", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-54", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-55", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-56", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-57", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-58", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-59", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-60", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-61", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-62", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-63", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-64", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-65", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-66", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-67", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-68", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-69", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-70", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-71", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-72", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-73", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-74", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-75", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-76", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-77", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-78", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-79", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-80", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-81", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-82", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-83", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-84", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-85", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-86", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-87", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-88", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-89", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-90", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-91", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-92", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-93", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-94", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-95", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-96", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-97", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-98", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-99", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-100", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-101", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-102", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-103", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-104", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-105", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-106", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-107", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-108", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-109", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-110", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-111", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-112", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-113", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-114", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-115", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-116", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-117", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-118", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-119", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-120", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-121", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-122", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-123", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-124", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-125", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-190", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-191", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-192", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-193", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-194", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-195", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-196", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-197", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-198", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-199", estado: "Disponible" },
    { area: "Masa", categoria: "Pesas M2 de 20 kg", codigo: "PTB-PEM2-200", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-05-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-07-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-07-TA05-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-07-TK05-01/10", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-08-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-08-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-08-TK07-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-09-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-09-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-09-TK08-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-11-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-11-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-11-TK09-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-11-TK11-01/10", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-12-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-12-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-12-TK12-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-13-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-13-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-13-TK13-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-14-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-14-TK13-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-14-TK14-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-15-TK15-01 al TK15-04", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-15-TA15-01 al TA15-12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-15-TC15-01 al TC15-12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-15-TK15-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-16-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-16-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-16-TK16-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-17-TC-01/12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-17-TC-13/24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro multicanal", codigo: "PT-TMUL-17-TK17-", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-16", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-18", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-20", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-22-B", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-14-B", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-19", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-21", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-4", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-1", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-2", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-22", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THIG-05 (B)", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-14", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-23", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-25", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-26", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-27", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-28", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-29", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-30", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-31", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-32", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-33", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-34", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-35", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-36", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-37", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-38", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-39", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-40", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-41", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-42", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-43", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-44", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-45", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-46", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termo higrometro Data Logger", codigo: "PT-THDL-47", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TDIG-18 (T1 Y T2)", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TDIG-19 (A y B)", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TDIG-20 (A y B)", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TDIG-07", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TCDG-03", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TCDG-06", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TCDG-08", estado: "Disponible" },
    { area: "Temperatura", categoria: "Termometro digital / Termometro de contacto", codigo: "PT-TDIG-06", estado: "Disponible" },
    { area: "Temperatura", categoria: "Pozo Seco / Baño Termostatico", codigo: "EQ-BTPS-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Pozo Seco / Baño Termostatico", codigo: "EQ-BTPS-03", estado: "Disponible" },
    { area: "Temperatura", categoria: "Tacometro / Termometro infrarrojo", codigo: "PT-TACD-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Tacometro / Termometro infrarrojo", codigo: "PT-TACD-02", estado: "Disponible" },
    { area: "Temperatura", categoria: "Tacometro / Termometro infrarrojo", codigo: "PT-TDIR-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-02", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-04", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-06", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-07", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-08", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-09", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-10", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-13", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-14", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-15", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-16", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-17", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-18", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-19", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-20", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-21", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-22", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cinta metrica 5m", codigo: "IM-CMET-23", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-13", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-14", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-15", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-16", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-17", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-18", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-19", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-20", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-21", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-23", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-24", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-25", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-26", estado: "Disponible" },
    { area: "Temperatura", categoria: "Cronometro", codigo: "PT-CRON-27", estado: "Disponible" },
    { area: "Temperatura", categoria: "Calibr. de Procesos / Pinza Amper.", codigo: "PT-CPRO-001", estado: "Disponible" },
    { area: "Temperatura", categoria: "Calibr. de Procesos / Pinza Amper.", codigo: "IM-PINZ-01", estado: "Disponible" },
    { area: "Temperatura", categoria: "Calibr. de Procesos / Pinza Amper.", codigo: "PT-CPRO-10", estado: "Disponible" },
    { area: "Temperatura", categoria: "Calibr. de Procesos / Pinza Amper.", codigo: "PT-CPRO-11", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-06", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-07", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-08", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-09", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-10", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-11", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-12", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-13", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-14", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-15", estado: "Disponible" },
    { area: "Temperatura", categoria: "Multimetro Digital", codigo: "IM-MULT-16", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Buffer Patron", codigo: "PT-SB-02", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Buffer Patron", codigo: "PT-SB-04", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Buffer Patron", codigo: "PT-SB-07", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Buffer Patron", codigo: "PT-SB-10", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Buffer Patron", codigo: "PT-SB-12", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-01", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-05", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-10", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-84", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-147", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-1413", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de Conductividad", codigo: "PT-SC-12880", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-0,1", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-15", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-100", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-750", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-0", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion Turbidez", codigo: "PT-ST-500", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Baño termostatico", codigo: "EQ-BTER-03", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Baño termostatico", codigo: "EQ-BTER-04", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Baño termostatico", codigo: "EQ-BTER-05", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Baño termostatico", codigo: "EQ-BTER-08", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-01", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-02", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-03", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-08", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-10", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-13", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Termometro digital", codigo: "PT-TDIG-14", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "PT-SCL-06", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "MR-FDEN-09", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "PT-SCL-10", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "PT-SCL-11", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "PT-SCL-12", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "PT-SCL-13", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "MR-FODD-03", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Soluciones de cloro/Filtros de Espectrofoto", codigo: "MR-FOHM-03", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Reactivo para oxigeno disuelto", codigo: "PT-SZ0-16", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Reactivo para oxigeno disuelto", codigo: "PT-SZ0-17", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Reactivo para oxigeno disuelto", codigo: "PT-SZ0-18", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Reactivo para oxigeno disuelto", codigo: "PT-SZ0-19", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de ORP", codigo: "PT-SORP-01", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de ORP", codigo: "PT-SORP-02", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de ORP", codigo: "PT-SORP-03", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de ORP", codigo: "PT-SORP-04", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de ORP", codigo: "PT-SORP-05", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de TDS", codigo: "PT-TDS-147", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de TDS", codigo: "PT-TDS-1413", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de TDS", codigo: "PT-TDS-12880", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-0%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-5%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-10%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-15%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-20%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-25%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-30%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de refraccion", codigo: "PT-SFR-35%", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-5", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-20", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-50", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-200", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-1000", estado: "Disponible" },
    { area: "Fisico-Quimica", categoria: "Solucion de viscosidad", codigo: "PT-SV-5000", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Termo Anemometro / C. Particulas", codigo: "PT-TANE-02", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Termo Anemometro / C. Particulas", codigo: "PT-TANE-04", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "PT-PHOT-01", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "PT-PHOT-02", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "PT-C-PAR-01", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "PT-C-PAR-02", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "EQ-NEBU-01", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Fotometro / Generador de Aerosol / de humo", codigo: "EQ-NEBU-02", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Radiometro / Indicador de Fases", codigo: "PT-RDMT-03", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Radiometro / Indicador de Fases", codigo: "PT-RDMT-05", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Radiometro / Indicador de Fases", codigo: "PT-RDMT-06", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Radiometro / Indicador de Fases", codigo: "PT-RDMT-07", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Radiometro / Indicador de Fases", codigo: "IM-RFAS-01", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Sonometro / Compresor", codigo: "PT-SONO-04", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Sonometro / Compresor", codigo: "PT-SONO-05", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Sonometro / Compresor", codigo: "PT-SONO-06", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Sonometro / Compresor", codigo: "PT-SONO-07", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Sonometro / Compresor", codigo: "EQ-COMP-01", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Luxometro / Biodescontaminador", codigo: "PT-LUXO-04", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Luxometro / Biodescontaminador", codigo: "PT-LUXO-07", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Luxometro / Biodescontaminador", codigo: "PT-LUXO-08", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Luxometro / Biodescontaminador", codigo: "PT-LUXO-09", estado: "Disponible" },
    { area: "Bioseguridad", categoria: "Luxometro / Biodescontaminador", codigo: "PI-BUES-01", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Banco de Presion", codigo: "EQ-BCPR-01", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Banco de Presion", codigo: "EQ-BCPR-05", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Banco de Presion", codigo: "EQ-BCPR-06", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-09", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-10", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-11", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-12", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-13", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-14", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Manometro", codigo: "PT-PRES-15", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Micrometro de exteriores / Pie de Rey", codigo: "PT-MICR-01", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Micrometro de exteriores / Pie de Rey", codigo: "PT-MICR-02", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Micrometro de exteriores / Pie de Rey", codigo: "PT-MICR-03", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Micrometro de exteriores / Pie de Rey", codigo: "PT-PREY-01", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Micrometro de exteriores / Pie de Rey", codigo: "PT-PREY-02", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Reloj comparador", codigo: "PT-RCOM-01", estado: "Disponible" },
    { area: "Dimension y Presion", categoria: "Reloj comparador", codigo: "PT-RCOM-02", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Medidor de Espesores ultrasonico", codigo: "PT-MEUS-01", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Celda de carga / Megohmetro", codigo: "PT-CELD-01", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Celda de carga / Megohmetro", codigo: "PT-CELD-02", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Celda de carga / Megohmetro", codigo: "IM-MEGO-01", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Medidor Volumetrico Metalico", codigo: "PT-MVOL-01", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Medidor Volumetrico Metalico", codigo: "PT-MVOL-03", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Medidor Volumetrico Metalico", codigo: "PT-MVOL-04", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Medidor Volumetrico Metalico", codigo: "PT-MVOL-05", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Flujometro Ultrasonico", codigo: "PT-FLUD-01", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Flujometro Ultrasonico", codigo: "PT-FLUD-02", estado: "Disponible" },
    { area: "Otras magnitudes", categoria: "Flujometro Ultrasonico", codigo: "PT-FLUD-03", estado: "Disponible" },
  ];
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
function normalizarNombre(nombre){
  // Recorta espacios al inicio/fin y colapsa espacios multiples internos,
  // para que "Juan  Perez" y "Juan Perez" no se traten como distintos.
  return String(nombre || "").trim().replace(/\s+/g, " ");
}

function normalizarCodigoPatron(codigo){
  // Colapsa espacios multiples/saltos de linea (pegados por accidente)
  // y recorta extremos. No fuerza mayusculas aqui; eso se hace aparte
  // donde corresponda para no romper casos con formato mixto legitimo.
  return String(codigo || "").trim().replace(/\s+/g, " ");
}

// ------------------------------------------------------------
// ============================================================
// 5.a REGLAS DE CALIBRACIÓN
// ============================================================
// Implementación pura en js/domain/calibracion.js.
const { ACTIVIDADES_ISO, TIPOS_POR_ACTIVIDAD, etiquetaTipoCal, actividadVacia,
  getActividades, mesActualISO, sumarMesesAMes, formatMesISO,
  estadoActividad, estadoCalibracion, patronBloqueadoPorCalibracion,
  actividadesVencidas } = window.MetrologiaCalibracion;
// ------------------------------------------------------------
// Avisos no bloqueantes (sustituyen a alert()) y accion "Deshacer".
// alert() congela la pagina y obliga a un clic extra en cada paso;
// estos avisos aparecen abajo a la derecha y se van solos.
// ------------------------------------------------------------
function avisar(mensaje, tipo = "ok", accion = null, persistente = false){
  const cont = document.getElementById("toasts");
  if (!cont) { console.log(mensaje); return; }
  const div = document.createElement("div");
  div.className = "toast " + (tipo === "error" ? "error" : tipo === "info" ? "info" : "ok");
  const txt = document.createElement("div");
  txt.className = "toast-txt";
  txt.textContent = mensaje;
  div.appendChild(txt);

  let temporizador = null;
  const cerrar = () => { clearTimeout(temporizador); div.remove(); };

  if (accion) {
    const btn = document.createElement("button");
    btn.className = "btn-mini";
    btn.textContent = accion.etiqueta || "Deshacer";
    btn.addEventListener("click", async () => { cerrar(); await accion.ejecutar(); });
    div.appendChild(btn);
  }
  const cerrarBtn = document.createElement("button");
  cerrarBtn.className = "btn-mini";
  cerrarBtn.textContent = "✕";
  cerrarBtn.title = "Cerrar";
  cerrarBtn.addEventListener("click", cerrar);
  div.appendChild(cerrarBtn);

  cont.appendChild(div);
  // Los avisos con "Deshacer" duran mas, para dar tiempo a reaccionar.
  // Los "persistentes" (avisos criticos de base de datos) no se van solos:
  // el usuario tiene que leerlos y cerrarlos a mano.
  if (!persistente) {
    temporizador = setTimeout(cerrar, accion ? 12000 : (tipo === "error" ? 9000 : 5000));
  }
}

// Aviso critico que NO desaparece solo. Sustituye a los alert() bloqueantes
// que quedaban en el arranque y en los conflictos entre pestañas.
function avisarPersistente(mensaje, tipo = "error", accion = null){
  avisar(mensaje, tipo, accion, true);
}

// ------------------------------------------------------------
// Confirmacion no bloqueante (sustituye al confirm() nativo).
//
// El confirm() del navegador congela la pestaña entera, se ve distinto
// en cada equipo y en algunos navegadores se puede desactivar sin aviso
// ("no volver a mostrar"), lo que dejaba acciones destructivas sin
// confirmar. Este modal devuelve una promesa: se usa con
//   if (!(await confirmar({...}))) return;
// ------------------------------------------------------------
let resolverConfirmacion = null;

// Devuelve "ok", "alterno" o false. Los tres valores funcionan con
// `if (!respuesta) return;` porque solo el cancelar devuelve falsy.
function confirmar({ titulo = "Confirmar acción", mensaje = "", textoOk = "Confirmar",
                     peligro = false, textoAlterno = null, peligroAlterno = false }){
  return new Promise(resolve => {
    const overlay = document.getElementById("modal-confirmar-accion");
    if (!overlay) { resolve(false); return; }
    document.getElementById("confirmar-titulo").textContent = titulo;
    document.getElementById("confirmar-mensaje").textContent = mensaje;

    const btnOk = document.getElementById("confirmar-ok");
    btnOk.textContent = textoOk;
    btnOk.className = peligro ? "btn-peligro btn-mini" : "btn-primario btn-mini";

    // Tercer boton opcional: para decisiones que no son un si/no,
    // como "marcar eliminado" frente a "borrar todo".
    const btnAlt = document.getElementById("confirmar-alterno");
    if (textoAlterno) {
      btnAlt.textContent = textoAlterno;
      btnAlt.className = peligroAlterno ? "btn-peligro btn-mini" : "btn-mini";
      btnAlt.style.display = "inline-block";
    } else {
      btnAlt.style.display = "none";
    }

    overlay.classList.add("open");
    btnOk.focus();
    resolverConfirmacion = resolve;
  });
}

function cerrarConfirmacion(respuesta){
  const overlay = document.getElementById("modal-confirmar-accion");
  if (overlay) overlay.classList.remove("open");
  if (resolverConfirmacion) {
    const r = resolverConfirmacion;
    resolverConfirmacion = null;
    r(respuesta);
  }
}

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

function todayISO(){
  const d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

// ------------------------------------------------------------
// FECHA + HORA DE SALIDA
//
// "fecha" es el dia (YYYY-MM-DD) y "fechaHoraSalida" la marca completa en
// ISO/UTC. Como la hora se escribe a mano, las dos se construyen desde la
// hora LOCAL del equipo, y para ordenar se vuelve a la hora local: si se
// compararan las marcas ISO en crudo, una salida de las 20:00 en Perú
// (UTC-5) caeria en el dia siguiente y se colaria fuera de sitio.
// ------------------------------------------------------------
function horaActualHHMMSS(){
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
}

// "14:30" o "14:30:00" + "2026-09-21" -> marca ISO en UTC.
function isoDesdeFechaHoraLocal(fecha, hora){
  const [a, m, d] = String(fecha || "").split("-").map(Number);
  const [hh, mm, ss] = String(hora || "00:00:00").split(":").map(Number);
  if (!a || !m || !d) return new Date().toISOString();
  const dt = new Date(a, m - 1, d, hh || 0, mm || 0, ss || 0);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

// De una marca ISO a la hora local en HH:MM:SS, para rellenar un <input type="time">.
function horaLocalDeISO(iso){
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
}

// Clave de orden cronologico de una fila del historial. Manda el dia que se
// muestra ("fecha") y desempata la hora local de salida; las filas antiguas
// sin hora se colocan al arranque de su dia en vez de mezclarse al azar.
function claveCronologica(h){
  const fecha = String((h && h.fecha) || "");
  return fecha + " " + (horaLocalDeISO(h && h.fechaHoraSalida) || "00:00:00");
}
function formatFecha(iso){
  if(!iso) return "";
  const [y,m,d] = iso.split("-");
  return d+"/"+m+"/"+y;
}

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
  const cliente = {
    id: nuevoId("cli"),
    nombre: normalizarNombre(nombre),
    ruc: String(ruc || "").trim(),
    sedes: [],
    creadoEn: new Date().toISOString()
  };
  if (String(sedeDireccion || "").trim() || String(sedeNombre || "").trim()) {
    cliente.sedes.push({
      id: nuevoId("sede"),
      nombre: normalizarNombre(sedeNombre) || "Sede principal",
      direccion: String(sedeDireccion || "").trim(),
      contacto: String(sedeContacto || "").trim(),
      telefono: String(sedeTelefono || "").trim()
    });
  }
  await saveRecord(STORES.clientes, cliente);
  return cliente;
}

async function agregarSedeACliente(clienteId, { nombre, direccion, contacto, telefono }){
  // Leemos el cliente de la BASE, no del array en memoria: si otra pestaña
  // (o el paso anterior de este mismo flujo) acaba de tocarlo, el array
  // todavia puede estar desactualizado y perderiamos sedes al reescribirlo.
  const todos = await getAll(STORES.clientes);
  const cliente = todos.find(c => c.id === clienteId);
  if (!cliente) throw new Error("La empresa ya no existe.");
  const sede = {
    id: nuevoId("sede"),
    nombre: normalizarNombre(nombre),
    direccion: String(direccion || "").trim(),
    contacto: String(contacto || "").trim(),
    telefono: String(telefono || "").trim()
  };
  const sedes = Array.isArray(cliente.sedes) ? [...cliente.sedes, sede] : [sede];
  await saveRecord(STORES.clientes, { ...cliente, sedes });
  return sede;
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

function getAreas(){
  return Array.from(new Set(patrones.map(p=>p.area))).sort();
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

function rolPersona(p){
  return (p && p.rol === ROL_SUPERVISOR) ? ROL_SUPERVISOR : ROL_TECNICO;
}
function esSupervisor(p){ return rolPersona(p) === ROL_SUPERVISOR; }
function esTecnico(p){ return rolPersona(p) === ROL_TECNICO; }
function nombreRol(rol){
  return rol === ROL_SUPERVISOR ? "Encargado de laboratorio" : "Técnico";
}

function laboratoriosDe(p){
  return Array.isArray(p && p.laboratorios) ? p.laboratorios.filter(Boolean) : [];
}

// Solo los que pueden salir a servicio; el selector de salida usa esto.
function tecnicosActivos(){
  return tecnicos.filter(t => t.activo !== false && esTecnico(t));
}
function supervisoresActivos(){
  return tecnicos.filter(t => t.activo !== false && esSupervisor(t));
}

// Encargado(s) de un laboratorio concreto. Devuelve nombres, en orden
// alfabetico, porque un laboratorio podria tener mas de un encargado.
function encargadosDeLaboratorio(area){
  const clave = claveArea(area);
  if (!clave) return [];
  return supervisoresActivos()
    .filter(s => laboratoriosDe(s).some(l => claveArea(l) === clave))
    .map(s => s.nombre)
    .sort((a, b) => a.localeCompare(b, "es"));
}

// Encargado(s) que corresponden a un conjunto de laboratorios (los de los
// patrones de una OT). Sin linea de firma que repartir, una OT que cruza
// laboratorios simplemente nombra a todos sus encargados, sin duplicar a
// quien lleva dos de esos laboratorios.
function encargadosDeLaboratorios(areas){
  const vistos = new Set();
  const nombres = [];
  (areas || []).forEach(a => {
    encargadosDeLaboratorio(a).forEach(n => {
      if (!vistos.has(n)) { vistos.add(n); nombres.push(n); }
    });
  });
  return nombres.sort((a, b) => a.localeCompare(b, "es"));
}

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
  const base = areaFiltro && areaFiltro!=="Todas" ? patrones.filter(p=>p.area===areaFiltro) : patrones;
  return Array.from(new Set(base.map(p=>p.categoria))).sort();
}

// ============================================================
