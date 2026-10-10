/* Protección local de la pestaña Configuración.
   Es un control de acceso de interfaz para una aplicación sin servidor. */
(function (global) {
  "use strict";

  const DEFAULT_USER = "admin";
  const DEFAULT_PASSWORD = "admin123";
  let sessionAuthorized = false;
  let getCredential = null;
  let saveCredential = null;
  let pendingAccess = null;

  function bytesToBase64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }

  async function sha256(value) {
    if (!global.crypto || !global.crypto.subtle) throw new Error("Este navegador no permite proteger la configuración.");
    const buffer = await global.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToBase64(new Uint8Array(buffer));
  }

  async function createCredential(usuario, clave) {
    const salt = new Uint8Array(16);
    global.crypto.getRandomValues(salt);
    const sal = bytesToBase64(salt);
    return { usuario, sal, hash: await sha256(`${sal}:${usuario}:${clave}`), algoritmo: "SHA-256" };
  }

  async function matchesCredential(credential, usuario, clave) {
    if (!credential || !credential.sal || !credential.hash) return false;
    const hash = await sha256(`${credential.sal}:${usuario}:${clave}`);
    return credential.usuario === usuario && credential.hash === hash;
  }

  function validCredential(credential) {
    return Boolean(credential && typeof credential.usuario === "string" && typeof credential.sal === "string" && typeof credential.hash === "string");
  }

  function close() {
    document.getElementById("modal-acceso-configuracion").classList.remove("open");
    document.getElementById("acceso-configuracion-clave").value = "";
    const error = document.getElementById("acceso-configuracion-error");
    error.textContent = "";
    error.style.display = "none";
  }

  function showError(message) {
    const error = document.getElementById("acceso-configuracion-error");
    error.textContent = message;
    error.style.display = "block";
  }

  function closeChangePassword() {
    const modal = document.getElementById("modal-cambiar-clave-configuracion");
    modal.classList.remove("open");
    ["cambiar-clave-actual", "cambiar-clave-nueva", "cambiar-clave-confirmacion"].forEach(id => { document.getElementById(id).value = ""; });
    const error = document.getElementById("cambiar-clave-error");
    error.textContent = "";
    error.style.display = "none";
  }

  function showChangeError(message) {
    const error = document.getElementById("cambiar-clave-error");
    error.textContent = message || "";
    error.style.display = message ? "block" : "none";
  }

  function requestAccess(onAuthorized) {
    if (sessionAuthorized) { onAuthorized(); return; }
    pendingAccess = onAuthorized;
    const modal = document.getElementById("modal-acceso-configuracion");
    modal.classList.add("open");
    document.getElementById("acceso-configuracion-clave").focus();
  }

  function lock() {
    sessionAuthorized = false;
    pendingAccess = null;
    close();
    closeChangePassword();
  }

  function bind({ loadCredential, storeCredential, onLogout, notify }) {
    getCredential = loadCredential;
    saveCredential = storeCredential;
    const modal = document.getElementById("modal-acceso-configuracion");
    const user = document.getElementById("acceso-configuracion-usuario");
    const password = document.getElementById("acceso-configuracion-clave");
    const enter = document.getElementById("acceso-configuracion-ingresar");
    const changeModal = document.getElementById("modal-cambiar-clave-configuracion");
    const currentPassword = document.getElementById("cambiar-clave-actual");
    const newPassword = document.getElementById("cambiar-clave-nueva");
    const confirmPassword = document.getElementById("cambiar-clave-confirmacion");
    const savePassword = document.getElementById("cambiar-clave-guardar");

    async function login() {
      enter.disabled = true;
      try {
        let credential = await getCredential();
        if (!validCredential(credential)) {
          if (user.value.trim() !== DEFAULT_USER || password.value !== DEFAULT_PASSWORD) {
            showError("Usuario o contraseña incorrectos.");
            return;
          }
          credential = await createCredential(DEFAULT_USER, DEFAULT_PASSWORD);
          await saveCredential(credential);
        }
        if (!await matchesCredential(credential, user.value.trim(), password.value)) {
          showError("Usuario o contraseña incorrectos.");
          password.select();
          return;
        }
        sessionAuthorized = true;
        const callback = pendingAccess;
        pendingAccess = null;
        close();
        if (callback) callback();
      } catch (error) {
        console.error("No se pudo comprobar el acceso a Configuración:", error);
        showError(error.message || "No se pudo comprobar el acceso.");
      } finally {
        enter.disabled = false;
      }
    }

    enter.addEventListener("click", login);
    password.addEventListener("keydown", event => { if (event.key === "Enter") login(); });
    document.getElementById("acceso-configuracion-cancelar").addEventListener("click", () => { pendingAccess = null; close(); });
    modal.addEventListener("click", event => { if (event.target === modal) { pendingAccess = null; close(); } });

    document.getElementById("btn-cambiar-clave-configuracion").addEventListener("click", () => {
      changeModal.classList.add("open");
      currentPassword.focus();
    });
    document.getElementById("cambiar-clave-cancelar").addEventListener("click", closeChangePassword);
    changeModal.addEventListener("click", event => { if (event.target === changeModal) closeChangePassword(); });
    savePassword.addEventListener("click", async () => {
      if (!newPassword.value) { showChangeError("Ingresa una nueva contraseña."); newPassword.focus(); return; }
      if (newPassword.value !== confirmPassword.value) { showChangeError("La confirmación no coincide con la nueva contraseña."); confirmPassword.focus(); return; }
      savePassword.disabled = true;
      try {
        const credential = await getCredential();
        if (!await matchesCredential(credential, DEFAULT_USER, currentPassword.value)) {
          showChangeError("La contraseña actual no es correcta.");
          currentPassword.select();
          return;
        }
        await saveCredential(await createCredential(credential.usuario || DEFAULT_USER, newPassword.value));
        closeChangePassword();
        if (typeof notify === "function") notify("Contraseña de Configuración actualizada.", "ok");
      } catch (error) {
        console.error("No se pudo cambiar la contraseña:", error);
        showChangeError(error.message || "No se pudo cambiar la contraseña.");
      } finally {
        savePassword.disabled = false;
      }
    });
    confirmPassword.addEventListener("keydown", event => { if (event.key === "Enter") savePassword.click(); });
    document.getElementById("btn-cerrar-sesion-configuracion").addEventListener("click", () => {
      lock();
      if (typeof onLogout === "function") onLogout();
    });
  }

  global.Metrologia = global.Metrologia || { modules: {} };
  global.Metrologia.modules = global.Metrologia.modules || {};
  global.Metrologia.modules.settingsAuth = Object.freeze({ bind, requestAccess, lock, isAuthorized: () => sessionAuthorized });
})(window);
