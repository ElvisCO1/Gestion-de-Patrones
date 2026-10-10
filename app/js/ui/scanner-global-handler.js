/* Deteccion de rafagas de lectores que emulan un teclado. */
(function (global) {
  "use strict";

  function create({ getDestination, clearLeakedInput, resolveCode, readPhysicalKey,
    minCharacters, burstKeyIntervalMs, restartMs }) {
    const state = {
      buffer: "", physicalBuffer: "", lastTime: 0, isBurst: false,
      leaked: "", target: null
    };

    function reset() {
      state.buffer = "";
      state.physicalBuffer = "";
      state.isBurst = false;
      state.leaked = "";
      state.target = null;
    }

    function handle(event) {
      if (event.target?.classList?.contains("campo-escaneo")) return;
      if (event.ctrlKey || event.altKey || event.metaKey || !getDestination()) {
        reset();
        return;
      }

      const now = Date.now();
      const elapsed = now - state.lastTime;
      state.lastTime = now;
      const isTerminator = event.key === "Enter" || event.key === "Tab";

      if (isTerminator) {
        const byCharacter = state.buffer;
        const byPhysicalKey = state.physicalBuffer;
        const isValidBurst = state.isBurst && byCharacter.length >= minCharacters;
        if (isValidBurst) {
          event.preventDefault();
          clearLeakedInput(state.target, state.leaked);
          const destination = getDestination();
          reset();
          if (destination) destination(resolveCode([byCharacter, byPhysicalKey]));
          return;
        }
        reset();
        return;
      }

      if (event.key.length !== 1) return;
      if (elapsed > restartMs) {
        reset();
        state.target = event.target;
      }
      state.buffer += event.key;
      const physicalCharacter = readPhysicalKey(event);
      state.physicalBuffer += physicalCharacter !== null ? physicalCharacter : event.key;

      if (!state.isBurst) {
        state.leaked += event.key;
        if (state.buffer.length >= minCharacters && elapsed <= burstKeyIntervalMs) {
          state.isBurst = true;
        }
      } else {
        event.preventDefault();
      }
    }

    return Object.freeze({ handle, reset });
  }

  global.Metrologia.modules.scannerGlobalHandler = Object.freeze({ create });
})(window);
