/* Enlaces de interfaz para Patrones, Personal y Clientes. */
(function (global) {
  "use strict";

  function on(id, eventName, listener) {
    const node = document.getElementById(id);
    if (node) node.addEventListener(eventName, listener);
  }

  function bind({ openHome, openIndicators, openDispatch, openPatterns, openTechnicians, openClients, openInventory, openConfiguration, addPattern, addTechnician,
    toggleTechnicianFields, openPersonnelModal, closePersonnelModal, openClientModal, closeClientModal, addClient, searchClients, filterExitCategory, searchExit }) {
    on("tab-inicio", "click", openHome);
    on("tab-indicadores", "click", openIndicators);
    on("tab-salida", "click", openDispatch);
    on("tab-patrones", "click", openPatterns);
    on("tab-tecnicos", "click", openTechnicians);
    on("tab-clientes", "click", openClients);
    on("tab-inventario", "click", openInventory);
    on("tab-configuracion", "click", openConfiguration);
    on("btn-agregar-patron", "click", addPattern);
    on("btn-agregar-tecnico", "click", addTechnician);
    on("btn-abrir-modal-personal", "click", openPersonnelModal);
    on("btn-cancelar-personal", "click", closePersonnelModal);
    const personnelModal = document.getElementById("modal-personal");
    if (personnelModal) personnelModal.addEventListener("click", event => {
      if (event.target === personnelModal) closePersonnelModal();
    });
    on("btn-abrir-modal-cliente", "click", openClientModal);
    on("btn-cancelar-cliente", "click", closeClientModal);
    const clientModal = document.getElementById("modal-cliente");
    if (clientModal) clientModal.addEventListener("click", event => {
      if (event.target === clientModal) closeClientModal();
    });
    on("nt-rol", "change", toggleTechnicianFields);
    on("btn-agregar-cliente", "click", addClient);
    on("buscar-clientes", "input", event => searchClients(event.target.value));
    on("filtro-cat", "change", event => filterExitCategory(event.target.value));
    on("buscar", "input", event => searchExit(event.target.value));
  }

  global.Metrologia.modules.adminController = Object.freeze({ bind });
})(window);
