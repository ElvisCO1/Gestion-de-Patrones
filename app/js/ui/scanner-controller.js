/* Captura de lectores que emulan teclado y campos de escaneo dedicados. */
(function (global) {
  "use strict";

  function bind({ handleGlobalKeydown, scanners, restartMs, readPhysicalKey,
    resolveCode, isSoundEnabled, setSoundEnabled, beep }) {
    document.addEventListener("keydown", handleGlobalKeydown, true);

    (scanners || []).forEach(({ id, process }) => {
      const field = document.getElementById(id);
      if (!field) return;
      let physical = "";
      let lastInputAt = 0;
      field.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === "Tab") {
          const value = field.value.trim();
          if (!value) { physical = ""; return; }
          event.preventDefault();
          const candidates = physical.length === value.length ? [value, physical] : [value];
          field.value = "";
          physical = "";
          process(resolveCode(candidates));
          return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
        const now = Date.now();
        if (now - lastInputAt > restartMs || !field.value) physical = "";
        lastInputAt = now;
        const character = readPhysicalKey(event);
        physical += character !== null ? character : event.key;
      });
      field.addEventListener("paste", () => { physical = ""; });
      field.addEventListener("keydown", event => {
        if (event.key === "Backspace" || event.key === "Delete") physical = "";
      });
    });

    const soundChecks = ["escaneo-sonido-salida", "escaneo-sonido-devolucion"]
      .map(id => document.getElementById(id)).filter(Boolean);
    soundChecks.forEach(check => {
      check.checked = isSoundEnabled();
      check.addEventListener("change", () => {
        setSoundEnabled(check.checked);
        soundChecks.forEach(other => { other.checked = check.checked; });
        if (check.checked) beep("ok");
      });
    });
  }

  global.Metrologia.modules.scannerController = Object.freeze({ bind });
})(window);
