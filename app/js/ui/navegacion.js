/* Navegación de pestañas, aislada de los paneles concretos. */
(function (global) {
  "use strict";

  function activarTab(nombre, { document, tabs, storageKey, render }) {
    const destino = tabs.includes(nombre) ? nombre : "inicio";
    tabs.forEach(tab => {
      document.getElementById("panel-" + tab).style.display = tab === destino ? "block" : "none";
      document.getElementById("tab-" + tab).classList.toggle("active", tab === destino);
    });
    try { localStorage.setItem(storageKey, destino); } catch (_) { /* almacenamiento no disponible */ }
    render();
  }

  global.MetrologiaUINavegacion = Object.freeze({ activarTab });
})(window);
