/* Contenedor modal del alta de patrones.
 * Reubica el formulario existente sin cambiar sus campos ni eventos.
 */
(function (global) {
  "use strict";

  const namespace = global.Metrologia = global.Metrologia || { modules: Object.create(null) };
  namespace.modules = namespace.modules || Object.create(null);
  let opener = null;

  function getModal() {
    return document.getElementById("modal-alta-patron");
  }

  function close() {
    const modal = getModal();
    if (modal) modal.classList.remove("open");
    if (opener && typeof opener.focus === "function") opener.focus();
    opener = null;
  }

  function open() {
    const modal = getModal();
    opener = document.activeElement;
    if (!modal) return;
    modal.classList.add("open");
    global.requestAnimationFrame(() => {
      const field = document.getElementById("np-categoria");
      if (field) field.focus();
    });
  }

  function moveFormToModal() {
    const host = document.getElementById("alta-patron-contenido");
    const form = document.getElementById("formulario-alta-patron");
    if (!host || !form || host.dataset.ready === "true") return;
    host.appendChild(form);
    host.dataset.ready = "true";
  }

  function createSection(id, title, open) {
    const details = document.createElement("details");
    details.id = id;
    details.className = "alta-patron-seccion";
    details.open = Boolean(open);
    const summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);
    return details;
  }

  function compactOptionalFields(form) {
    if (document.getElementById("np-datos-adicionales")) return;
    const grid = form.querySelector(".grid2");
    if (!grid) return;
    const fieldIds = ["np-marca", "np-valor", "np-modelo", "np-serie", "np-lugar", "np-estado"];
    const fields = fieldIds.map(id => document.getElementById(id)).filter(Boolean)
      .map(input => input.closest("div")).filter(Boolean);
    const section = createSection("np-datos-adicionales", "Datos adicionales (opcionales)", false);
    const innerGrid = document.createElement("div");
    innerGrid.className = "grid2 alta-patron-grid-interno";
    fields.forEach(field => innerGrid.appendChild(field));
    section.appendChild(innerGrid);
    grid.appendChild(section);
  }

  function compactGroup(form) {
    if (document.getElementById("np-grupo-seccion")) return;
    const checkbox = document.getElementById("np-es-grupo");
    const card = checkbox ? checkbox.closest(".full") : null;
    if (!card) return;
    const section = createSection("np-grupo-seccion", "Grupo de piezas iguales (opcional)", false);
    card.parentNode.insertBefore(section, card);
    section.appendChild(card);
  }

  function compactActivities() {
    const activities = document.getElementById("np-actividades");
    if (!activities || document.getElementById("np-actividades-seccion")) return;
    const heading = activities.previousElementSibling;
    const section = createSection("np-actividades-seccion", "Programaci\u00f3n ISO 17025 (opcional)", false);
    if (heading && heading.parentNode) heading.parentNode.insertBefore(section, heading);
    else activities.parentNode.insertBefore(section, activities);
    section.appendChild(activities);
    if (heading && heading.tagName === "P") heading.remove();
  }

  function compactForm() {
    const form = document.getElementById("formulario-alta-patron");
    if (!form) return;
    compactOptionalFields(form);
    compactGroup(form);
    compactActivities();
  }

  function prepareDuplicate() {
    const optional = document.getElementById("np-datos-adicionales");
    const activities = document.getElementById("np-actividades-seccion");
    if (optional) optional.open = true;
    if (activities) activities.open = true;
  }

  function resetOptionalSections() {
    const group = document.getElementById("np-grupo-seccion");
    const optional = document.getElementById("np-datos-adicionales");
    const activities = document.getElementById("np-actividades-seccion");
    if (group) group.open = false;
    if (optional) optional.open = false;
    if (activities) activities.open = false;
  }

  function bind() {
    const modal = getModal();
    const openButton = document.getElementById("btn-abrir-modal-alta-patron");
    const closeButton = document.getElementById("btn-cerrar-modal-alta-patron");
    moveFormToModal();
    compactForm();
    if (openButton) openButton.addEventListener("click", open);
    if (closeButton) closeButton.addEventListener("click", close);
    if (modal) {
      modal.addEventListener("click", event => {
        if (event.target === modal) close();
      });
    }
  }

  namespace.modules.patternCreateModal = Object.freeze({ bind, open, close, compactActivities, prepareDuplicate, resetOptionalSections });
})(window);
