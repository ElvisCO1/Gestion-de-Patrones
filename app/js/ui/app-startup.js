/* Secuencia de arranque: datos, migraciones, primera vista y avisos. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};
  async function run(context) {
    const { openDatabase, loadLogo, migrateLocalStorage, loadInitialData,
      migrateClients, restoreDataFolder, render, createInitialWeightGroups,
      notify, undoInitialWeightGroups, persistentNotify, reload } = context;
    try {
      await openDatabase();
      await loadLogo();
      await migrateLocalStorage();
      await loadInitialData();
      const createdClients = await migrateClients();
      await restoreDataFolder();
      await render();
      const createdGroups = await createInitialWeightGroups();
      if (createdGroups > 0) {
        await render();
        notify(`Se crearon ${createdGroups} grupo(s) de pesas (PTB-PEM2-01-20, 21-40, …) para poder sacar varias de una vez sin escanearlas una por una. Tus pesas sueltas no se tocaron.`, 'info', { etiqueta: 'Deshacer', ejecutar: undoInitialWeightGroups });
      }
      if (createdClients > 0) notify(`Se crearon ${createdClients} empresa(s) en el nuevo directorio de clientes a partir de tu historial. Entra a la pestaña «Clientes» para añadirles sus sedes y direcciones.`, 'info');
      return true;
    } catch (error) {
      console.error('Error al inicializar la aplicación:', error);
      persistentNotify('Hubo un problema al cargar los datos. Revisa la consola (F12) para más detalles.\nTus datos no se han modificado.', 'error', { etiqueta: 'Reintentar', ejecutar: reload });
      return false;
    }
  }
  namespace.modules.appStartup = Object.freeze({ run });
})(window);
