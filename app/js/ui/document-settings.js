/* Configuración visible del encabezado del PDF.
   Este módulo sólo gestiona la interfaz; la persistencia y el PDF permanecen
   en la aplicación principal para no duplicar el estado del documento. */
(function (global) {
  "use strict";

  const CAMPOS_CUERPO = [
    ["numeroOT", "Número de OT"], ["empresa", "Empresa"], ["sede", "Sede"],
    ["direccion", "Dirección"], ["contacto", "Contacto en sede"], ["tecnico", "Técnico responsable"],
    ["laptop", "Laptop asignada"], ["termohigrometro", "Termohigrómetro asignado"],
    ["multimetro", "Multímetro asignado"], ["fecha", "Fecha de salida"], ["hora", "Hora de salida"]
  ];
  const COLUMNAS_TABLA = [
    ["codigo", "Código único"], ["cantidad", "Cant."], ["laboratorio", "Laboratorio"], ["equipos", "Equipos"]
  ];

  function bind({ getSettings, saveSettings, notify }) {
    const inputTitulo = document.getElementById("doc-titulo-encabezado");
    const inputLogo = document.getElementById("doc-mostrar-logo");
    const botonGuardar = document.getElementById("btn-guardar-encabezado-documento");
    const error = document.getElementById("doc-encabezado-error");
    const camposContenedor = document.getElementById("doc-campos-salida");
    const botonGuardarCuerpo = document.getElementById("btn-guardar-cuerpo-documento");
    const errorCuerpo = document.getElementById("doc-cuerpo-error");
    const inputTituloTabla = document.getElementById("doc-titulo-tabla");
    const inputMostrarTituloTabla = document.getElementById("doc-mostrar-titulo-tabla");
    const columnasContenedor = document.getElementById("doc-columnas-salida");
    const botonGuardarTabla = document.getElementById("btn-guardar-tabla-documento");
    const errorTabla = document.getElementById("doc-tabla-error");

    if (!inputTitulo || !inputLogo || !botonGuardar || !error || !camposContenedor || !botonGuardarCuerpo || !errorCuerpo || !inputTituloTabla || !inputMostrarTituloTabla || !columnasContenedor || !botonGuardarTabla || !errorTabla) return;

    function mostrarError(mensaje) {
      error.textContent = mensaje || "";
      error.style.display = mensaje ? "block" : "none";
    }

    function mostrarErrorCuerpo(mensaje) {
      errorCuerpo.textContent = mensaje || "";
      errorCuerpo.style.display = mensaje ? "block" : "none";
    }

    function mostrarErrorTabla(mensaje) {
      errorTabla.textContent = mensaje || "";
      errorTabla.style.display = mensaje ? "block" : "none";
    }

    function crearCampo(clave, etiquetaPredeterminada, configuracion) {
      const fila = document.createElement("div");
      fila.className = "configuracion-campo-documento";
      const controlVisible = document.createElement("input");
      controlVisible.type = "checkbox";
      controlVisible.checked = !configuracion || configuracion.visible !== false;
      controlVisible.dataset.campoVisible = clave;
      controlVisible.setAttribute("aria-label", `Mostrar ${etiquetaPredeterminada}`);
      controlVisible.title = `Mostrar ${etiquetaPredeterminada}`;
      const etiquetaMostrar = document.createElement("span");
      etiquetaMostrar.textContent = "Mostrar";
      const entradaEtiqueta = document.createElement("input");
      entradaEtiqueta.type = "text";
      entradaEtiqueta.maxLength = 60;
      entradaEtiqueta.value = configuracion && configuracion.etiqueta || etiquetaPredeterminada;
      entradaEtiqueta.dataset.campoEtiqueta = clave;
      entradaEtiqueta.setAttribute("aria-label", `Etiqueta para ${etiquetaPredeterminada}`);
      fila.append(controlVisible, etiquetaMostrar, entradaEtiqueta);
      return fila;
    }

    function pintarCampos(settings) {
      camposContenedor.replaceChildren();
      const campos = settings.campos || {};
      CAMPOS_CUERPO.forEach(([clave, etiqueta]) => camposContenedor.append(crearCampo(clave, etiqueta, campos[clave])));
      mostrarErrorCuerpo("");
    }

    function pintarTabla(settings) {
      const tabla = settings.tabla || {};
      inputTituloTabla.value = tabla.titulo || "Patrones que salen a servicio";
      inputMostrarTituloTabla.checked = tabla.mostrarTitulo !== false;
      columnasContenedor.replaceChildren();
      const columnas = tabla.columnas || {};
      COLUMNAS_TABLA.forEach(([clave, etiqueta]) => columnasContenedor.append(crearCampo(clave, etiqueta, columnas[clave])));
      mostrarErrorTabla("");
    }

    function pintar() {
      const settings = getSettings() || {};
      inputTitulo.value = settings.titulo || "";
      inputLogo.checked = settings.mostrarLogo !== false;
      mostrarError("");
      pintarCampos(settings);
      pintarTabla(settings);
    }

    botonGuardar.addEventListener("click", async () => {
      const titulo = inputTitulo.value.trim();
      if (!titulo) {
        mostrarError("El título del documento es obligatorio.");
        inputTitulo.focus();
        return;
      }

      botonGuardar.disabled = true;
      try {
        await saveSettings({ titulo, mostrarLogo: inputLogo.checked });
        mostrarError("");
        notify("Encabezado del documento guardado.", "ok");
      } catch (e) {
        console.error("No se pudo guardar el encabezado del documento:", e);
        mostrarError("No se pudo guardar el encabezado. Inténtalo nuevamente.");
      } finally {
        botonGuardar.disabled = false;
      }
    });

    inputTitulo.addEventListener("input", () => mostrarError(""));
    botonGuardarCuerpo.addEventListener("click", async () => {
      const campos = {};
      for (const [clave, etiquetaPredeterminada] of CAMPOS_CUERPO) {
        const visible = camposContenedor.querySelector(`[data-campo-visible="${clave}"]`);
        const etiqueta = camposContenedor.querySelector(`[data-campo-etiqueta="${clave}"]`);
        const texto = etiqueta.value.trim();
        if (visible.checked && !texto) {
          mostrarErrorCuerpo(`La etiqueta de ${etiquetaPredeterminada} no puede quedar vacía mientras se muestra.`);
          etiqueta.focus();
          return;
        }
        campos[clave] = { etiqueta: texto || etiquetaPredeterminada, visible: visible.checked };
      }

      botonGuardarCuerpo.disabled = true;
      try {
        await saveSettings({ campos });
        mostrarErrorCuerpo("");
        notify("Datos del cuerpo del documento guardados.", "ok");
      } catch (e) {
        console.error("No se pudieron guardar los datos del cuerpo:", e);
        mostrarErrorCuerpo("No se pudieron guardar los datos. Inténtalo nuevamente.");
      } finally {
        botonGuardarCuerpo.disabled = false;
      }
    });
    botonGuardarTabla.addEventListener("click", async () => {
      const titulo = inputTituloTabla.value.trim() || "Patrones que salen a servicio";
      const columnas = {};
      for (const [clave, etiquetaPredeterminada] of COLUMNAS_TABLA) {
        const visible = columnasContenedor.querySelector(`[data-campo-visible="${clave}"]`);
        const etiqueta = columnasContenedor.querySelector(`[data-campo-etiqueta="${clave}"]`);
        const texto = etiqueta.value.trim();
        if (visible.checked && !texto) {
          mostrarErrorTabla(`La etiqueta de ${etiquetaPredeterminada} no puede quedar vacía mientras se muestra.`);
          etiqueta.focus();
          return;
        }
        columnas[clave] = { etiqueta: texto || etiquetaPredeterminada, visible: visible.checked };
      }
      if (!Object.values(columnas).some(columna => columna.visible)) {
        mostrarErrorTabla("Debes mostrar al menos una columna en la tabla de patrones.");
        return;
      }

      botonGuardarTabla.disabled = true;
      try {
        await saveSettings({ tabla: { titulo, mostrarTitulo: inputMostrarTituloTabla.checked, columnas } });
        mostrarErrorTabla("");
        notify("Tabla de patrones guardada.", "ok");
      } catch (e) {
        console.error("No se pudo guardar la tabla de patrones:", e);
        mostrarErrorTabla("No se pudo guardar la tabla. Inténtalo nuevamente.");
      } finally {
        botonGuardarTabla.disabled = false;
      }
    });
    pintar();
    return { render: pintar };
  }

  global.Metrologia = global.Metrologia || { modules: {} };
  global.Metrologia.modules = global.Metrologia.modules || {};
  global.Metrologia.modules.documentSettings = { bind };
})(window);
