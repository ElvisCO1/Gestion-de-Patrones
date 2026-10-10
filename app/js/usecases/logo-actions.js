/* Preparación y persistencia segura del logo institucional. */
(function (global) {
  "use strict";

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("El archivo no es una imagen que el navegador pueda abrir."));
      image.src = dataUrl;
    });
  }

  function dataUrlBytes(dataUrl) {
    const base64 = String(dataUrl || "").split(",")[1] || "";
    const padding = (base64.match(/=+$/) || [""])[0].length;
    return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
  }

  function drawImage(image, width, height, whiteBackground) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    if (whiteBackground) { context.fillStyle = "#FFFFFF"; context.fillRect(0, 0, width, height); }
    context.drawImage(image, 0, 0, width, height);
    return canvas;
  }

  async function prepareLogo(file, options) {
    if (!file.type || !/^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(file.type)) {
      throw new Error("Elige una imagen PNG, JPG o WEBP.");
    }
    const original = await readAsDataUrl(file);
    const image = await loadImage(original);
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("La imagen no tiene dimensiones válidas.");
    const scale = Math.min(1, options.maxPixels / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    let dataUrl = drawImage(image, width, height, false).toDataURL("image/png");
    let format = "PNG", flattened = false;
    if (dataUrlBytes(dataUrl) > options.maxBytes) {
      dataUrl = drawImage(image, width, height, true).toDataURL("image/jpeg", 0.9);
      format = "JPEG"; flattened = true;
    }
    return {
      logo: { dataUrl, proporcion: image.naturalWidth / image.naturalHeight, formato: format,
        nombre: file.name || "logo", anchoPx: width, altoPx: height,
        actualizadoEn: new Date().toISOString(), propio: true },
      aplanado: flattened, bytes: dataUrlBytes(dataUrl)
    };
  }

  async function saveLogo(context, logo) {
    const { setConfig, key, setCurrentLogo, scheduleMirror } = context;
    await setConfig(key, logo);
    setCurrentLogo(logo);
    scheduleMirror();
  }

  async function restoreDefaultLogo(context) {
    const { setConfig, key, defaultLogo, setCurrentLogo, scheduleMirror } = context;
    await setConfig(key, null);
    setCurrentLogo(defaultLogo);
    scheduleMirror();
  }

  global.Metrologia.services.logoActions = Object.freeze({ prepareLogo, saveLogo, restoreDefaultLogo });
})(window);
