/* Punto de entrada compacto para la gestion de etiquetas. */
(function (global) {
  "use strict";

  const namespace = global.Metrologia = global.Metrologia || { modules: Object.create(null) };
  namespace.modules = namespace.modules || Object.create(null);

  function getModal() {
    return document.getElementById("modal-etiquetas");
  }

  function close() {
    const modal = getModal();
    if (modal) modal.classList.remove("open");
  }

  function open() {
    const modal = getModal();
    if (modal) modal.classList.add("open");
  }

  function updateSelection(count, options = {}) {
    const selected = Number(count) || 0;
    const noSelection = selected === 0;
    const missingCodes = Array.isArray(options.missingCodes) ? options.missingCodes : [];
    const cannotGenerate = noSelection || missingCodes.length > 0;
    ["btn-descargar-etiquetas-pdf", "btn-imprimir-etiquetas"].forEach(id => {
      const action = document.getElementById(id);
      if (action) {
        action.disabled = cannotGenerate;
        action.title = missingCodes.length
          ? `Falta el valor nominal en: ${missingCodes.join(", ")}`
          : "";
      }
    });
    const clearButton = document.getElementById("btn-limpiar-etiquetas");
    if (clearButton) clearButton.disabled = noSelection;

    const openButton = document.getElementById("btn-abrir-modal-etiquetas");
    if (openButton) openButton.textContent = selected ? `Configurar etiquetas (${selected})` : "Configurar etiquetas";

    const status = document.getElementById("etiquetas-modal-estado");
    if (status) {
      status.textContent = noSelection
        ? "Selecciona uno o m\u00e1s patrones del cat\u00e1logo para habilitar las acciones."
        : missingCodes.length
          ? `Completa el valor nominal antes de generar: ${missingCodes.join(", ")}.`
          : "La selecci\u00f3n est\u00e1 lista para vista previa o descarga.";
      status.classList.toggle("vacio", noSelection || missingCodes.length > 0);
      status.classList.toggle("invalido", missingCodes.length > 0);
    }
  }

  function moveControlsToModal() {
    const host = document.getElementById("etiquetas-configuracion-modal");
    const format = document.getElementById("selector-formato-etiquetas");
    const actionIds = [
      "btn-descargar-etiquetas-pdf",
      "btn-imprimir-etiquetas",
      "btn-limpiar-etiquetas"
    ];

    if (!host || !format || host.dataset.ready === "true") return;

    const actions = document.createElement("div");
    actions.className = "etiquetas-modal-acciones";
    actions.setAttribute("aria-label", "Acciones de etiquetas");

    host.appendChild(format);
    actionIds.forEach(id => {
      const action = document.getElementById(id);
      if (action) actions.appendChild(action);
    });
    host.appendChild(actions);
    host.dataset.ready = "true";
  }

  function bind() {
    const openButton = document.getElementById("btn-abrir-modal-etiquetas");
    const closeButton = document.getElementById("btn-cerrar-modal-etiquetas");
    const modal = getModal();

    moveControlsToModal();
    const description = modal ? modal.querySelector("h3 + p") : null;
    const summaryLabel = modal ? modal.querySelector(".etiquetas-modal-resumen span") : null;
    const hint = modal ? modal.querySelector(".hint") : null;
    if (description) description.textContent = "Selecciona los patrones desde el cat\u00e1logo y configura aqu\u00ed la salida de sus etiquetas.";
    if (summaryLabel) summaryLabel.textContent = "Selecci\u00f3n actual";
    if (hint) hint.textContent = "El formato elegido se conserva para las siguientes descargas e impresiones.";
    updateSelection(0);
    if (openButton) openButton.addEventListener("click", open);
    if (closeButton) closeButton.addEventListener("click", close);
    if (modal) {
      modal.addEventListener("click", event => {
        if (event.target === modal) close();
      });
    }
  }

  namespace.modules.labelsModal = Object.freeze({ bind, close, open, updateSelection });
})(window);
