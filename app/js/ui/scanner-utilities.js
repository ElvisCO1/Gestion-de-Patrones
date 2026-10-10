/* Utilidades de compatibilidad de teclado y sonido para lectores de barras. */
(function (global) {
  "use strict";

  const SHIFTED_DIGITS = { "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(", "0": ")" };
  const US_KEYS = {
    Minus: ["-", "_"], Equal: ["=", "+"], BracketLeft: ["[", "{"], BracketRight: ["]", "}"],
    Backslash: ["\\", "|"], Semicolon: [";", ":"], Quote: ["'", "\""], Backquote: ["`", "~"],
    Comma: [",", "<"], Period: [".", ">"], Slash: ["/", "?"], Space: [" ", " "],
    NumpadSubtract: ["-", "-"], NumpadAdd: ["+", "+"], NumpadMultiply: ["*", "*"],
    NumpadDivide: ["/", "/"], NumpadDecimal: [".", "."]
  };

  function create({ findPattern, notify, soundStorageKey }) {
    let distributionWarningShown = false;
    let audio = null;

    function readPhysicalKey(event) {
      const code = event.code || "";
      if (/^Key[A-Z]$/.test(code)) {
        const letter = code.slice(3);
        return event.shiftKey ? letter : letter.toLowerCase();
      }
      if (/^Digit[0-9]$/.test(code)) {
        const digit = code.slice(5);
        return event.shiftKey ? (SHIFTED_DIGITS[digit] || digit) : digit;
      }
      if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
      const pair = US_KEYS[code];
      return pair ? (event.shiftKey ? pair[1] : pair[0]) : null;
    }

    function announceChangedCode(chosen, browserValue) {
      if (chosen !== browserValue && !distributionWarningShown) {
        distributionWarningShown = true;
        notify(`El lector funciona, pero este navegador está traduciendo sus teclas con otra distribución de teclado: escribió "${browserValue}" en vez de "${chosen}". La app lo corrige sola. Si quieres quitarlo de raíz, pon el idioma de entrada de Windows en inglés (EE. UU.) en esta ventana, o configura el lector para teclado español.`, "info");
      }
      return chosen;
    }

    function resolveCode(candidates) {
      const values = [];
      candidates.forEach(candidate => {
        const value = String(candidate || "").trim();
        if (value && !values.includes(value)) values.push(value);
      });
      if (!values.length) return "";
      for (const value of values) if (findPattern(value, true).patron) return announceChangedCode(value, values[0]);
      for (const value of values) if (findPattern(value).patron) return announceChangedCode(value, values[0]);
      return values[0];
    }

    function isSoundEnabled() {
      try { return localStorage.getItem(soundStorageKey) !== "0"; } catch (_) { return true; }
    }

    function setSoundEnabled(enabled) {
      try { localStorage.setItem(soundStorageKey, enabled ? "1" : "0"); } catch (_) { /* optional preference */ }
    }

    function beep(type) {
      if (!isSoundEnabled()) return;
      try {
        const AudioContextClass = global.AudioContext || global.webkitAudioContext;
        if (!AudioContextClass) return;
        audio = audio || new AudioContextClass();
        if (audio.state === "suspended") audio.resume();
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const time = audio.currentTime;
        const frequency = type === "error" ? 200 : (type === "aviso" ? 500 : 900);
        const duration = type === "error" ? 0.30 : 0.09;
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(frequency, time);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.12, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(gain); gain.connect(audio.destination);
        oscillator.start(time); oscillator.stop(time + duration + 0.02);
      } catch (_) { /* el sonido nunca puede romper el registro */ }
    }

    return Object.freeze({ readPhysicalKey, resolveCode, isSoundEnabled, setSoundEnabled, beep });
  }

  global.Metrologia.modules.scannerUtilities = Object.freeze({ create });
})(window);
