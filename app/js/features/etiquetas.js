// ============================================================
// 7.5. ETIQUETAS DE PATRONES
// ============================================================
function actualizarContadorEtiquetas(){
  const n = Object.keys(seleccionEtiquetas).filter(c => patrones.some(p => p.codigo === c && p.estado !== "Eliminado")).length;
  const el = document.getElementById("etiquetas-sel-count");
  if (el) el.textContent = `${n} seleccionado${n === 1 ? "" : "s"}`;
}

function limpiarSeleccionEtiquetas(){
  seleccionEtiquetas = {};
  actualizarContadorEtiquetas();
  renderCatalogoPatrones();
}

function obtenerPatronesSeleccionadosParaEtiqueta(){
  const codigos = Object.keys(seleccionEtiquetas);
  const seleccion = codigos.map(c => patrones.find(p => p.codigo === c)).filter(Boolean).filter(p => p.estado !== "Eliminado");
  if (!seleccion.length) {
    avisar("Selecciona al menos un patrón para generar sus etiquetas.", "info");
    return null;
  }
  const sinValor = seleccion.filter(p => !String(p.valorNominal || "").trim());
  if (sinValor.length) {
    avisar("Hay patrones seleccionados sin valor nominal: " + sinValor.map(p => p.codigo).join(", ") + ".\n\nEdita esos patrones y registra su valor (ej: 500 g, 1 kg, 20 kg) antes de generar las etiquetas.");
    return null;
  }
  return seleccion;
}


// ============================================================
// 7.3 UTILIDADES DE PDF
// ============================================================
// Un solo sitio donde se crea el documento, para no repetir el
// destructuring de window.jspdf en cada informe.
function crearPDF(opciones){
  const { jsPDF } = window.jspdf;
  return new jsPDF(opciones);
}

// Reduce el tamaño de fuente hasta que el texto quepa en el ancho dado.
// En una etiqueta no se puede permitir que el codigo se parta en dos
// lineas: la segunda se montaba encima del valor nominal.
function ajustarFuenteParaAncho(doc, texto, anchoMax, tamInicial, tamMinimo){
  let tam = tamInicial;
  doc.setFontSize(tam);
  while (tam > tamMinimo && doc.getTextWidth(String(texto)) > anchoMax) {
    tam -= 0.5;
    doc.setFontSize(tam);
  }
  return tam;
}

// ============================================================
// 7.4 CODIGO DE BARRAS (Code 128)
//
// Se genera aqui dentro, sin librerias: la app tiene que seguir
// funcionando en un equipo sin internet, y una libreria de barcodes
// mas seria otro archivo que mantener al lado del HTML.
//
// Code 128 es el estandar para codigos alfanumericos de inventario:
// admite letras, digitos y signos, y lo lee cualquier lector laser o
// CCD del mercado. Usamos el subconjunto B (ASCII 32-126) y, cuando el
// codigo es solo digitos en cantidad par, el C, que ocupa la mitad.
// ============================================================

// Los 107 patrones de barras de Code 128. Cada cadena son 6 numeros:
// anchos alternos de barra y espacio, empezando por barra.
const CODE128_PATRONES = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];
const CODE128_START_B = 104;
const CODE128_START_C = 105;
const CODE128_STOP = 106;

// ¿Se puede codificar este texto? Code 128 B cubre ASCII 32..126: si el
// codigo trae acentos o simbolos raros no hay barcode posible y hay que
// avisar, no imprimir una etiqueta que el lector no va a poder leer.
function textoCodificableEnCode128(texto){
  const s = String(texto || "");
  if (!s.length) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 32 || c > 126) return false;
  }
  return true;
}

// Devuelve { modulos: [{ancho, esBarra}], totalModulos } o null si no se puede.
function codificarCode128(texto){
  const s = String(texto || "");
  if (!textoCodificableEnCode128(s)) return null;

  const valores = [];
  const soloDigitosPar = /^\d+$/.test(s) && s.length % 2 === 0;

  if (soloDigitosPar) {
    // Subconjunto C: cada par de digitos es un solo simbolo.
    valores.push(CODE128_START_C);
    for (let i = 0; i < s.length; i += 2) valores.push(parseInt(s.substr(i, 2), 10));
  } else {
    // Subconjunto B: el valor es el codigo ASCII menos 32.
    valores.push(CODE128_START_B);
    for (let i = 0; i < s.length; i++) valores.push(s.charCodeAt(i) - 32);
  }

  // Checksum modulo 103: start + suma de (valor * posicion), posicion desde 1.
  let suma = valores[0];
  for (let i = 1; i < valores.length; i++) suma += valores[i] * i;
  valores.push(suma % 103);
  valores.push(CODE128_STOP);

  const modulos = [];
  let total = 0;
  valores.forEach(v => {
    const patron = CODE128_PATRONES[v];
    for (let i = 0; i < patron.length; i++) {
      const ancho = parseInt(patron[i], 10);
      // En cada patron los tramos alternan barra/espacio empezando por barra.
      modulos.push({ ancho, esBarra: i % 2 === 0 });
      total += ancho;
    }
  });
  return { modulos, totalModulos: total };
}

// Un lector no distingue barras si son demasiado finas. 0,19 mm (7,5 mil)
// es el minimo habitual de los lectores CCD baratos; por debajo avisamos.
const ANCHO_MODULO_MINIMO_MM = 0.19;
// Zona muda: 10 modulos en blanco a cada lado, o el lector no engancha.
const QUIET_ZONE_MODULOS = 10;

function anchoModuloDe(texto, anchoDisponibleMM){
  const cod = codificarCode128(texto);
  if (!cod) return null;
  return anchoDisponibleMM / (cod.totalModulos + QUIET_ZONE_MODULOS * 2);
}

// Dibuja el codigo de barras centrado dentro del rectangulo dado del PDF.
function dibujarCodigoBarrasPDF(doc, texto, x, y, ancho, alto){
  const cod = codificarCode128(texto);
  if (!cod) return false;
  const anchoModulo = ancho / (cod.totalModulos + QUIET_ZONE_MODULOS * 2);
  let cursor = x + anchoModulo * QUIET_ZONE_MODULOS;
  doc.setFillColor(0, 0, 0);
  cod.modulos.forEach(m => {
    const w = m.ancho * anchoModulo;
    if (m.esBarra) doc.rect(cursor, y, w, alto, "F");
    cursor += w;
  });
  return true;
}

// Misma barra, pero como SVG para la vista previa de impresion del
// navegador. Se dibuja con un solo path para que imprima nitido.
function svgCodigoBarras(texto, anchoMM, altoMM){
  const cod = codificarCode128(texto);
  if (!cod) return "";
  const totalConZona = cod.totalModulos + QUIET_ZONE_MODULOS * 2;
  let cursor = QUIET_ZONE_MODULOS;
  let d = "";
  cod.modulos.forEach(m => {
    if (m.esBarra) d += `M${cursor} 0h${m.ancho}v100h-${m.ancho}z`;
    cursor += m.ancho;
  });
  return `<svg class="etiqueta-barras" viewBox="0 0 ${totalConZona} 100" preserveAspectRatio="none"
    style="width:${anchoMM}mm;height:${altoMM}mm;display:block;" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}

// Config de cada formato de etiqueta. Al meter el codigo de barras hay que
// repartir la altura: por eso cada formato dice cuanto ocupa la barra y si
// el texto va debajo (vertical) o al lado (horizontal, para la tira de 1 cm).
// "codigoTexto" y "valorTexto" son los tamaños que se usan cuando la
// etiqueta sale SIN barras (ahi el codigo manda y puede ir mas grande).
const FORMATOS_ETIQUETA = {
  '5x2':    { w: 50,  h: 20, codigo: 13, valor: 9,  gap: 2, barras: 6.5, orientacion: 'vertical',   codigoTexto: 20, valorTexto: 14 },
  '9x1':    { w: 90,  h: 10, codigo: 11, valor: 8,  gap: 2, barras: 6,   orientacion: 'horizontal', codigoTexto: 13, valorTexto: 9  },
  '14x3.5': { w: 140, h: 35, codigo: 20, valor: 13, gap: 3, barras: 13,  orientacion: 'vertical',   codigoTexto: 22, valorTexto: 15 }
};
const FORMATOS_ETIQUETA_SIN_BARRAS = {
  '5x2':    { w: 50,  h: 20, codigo: 20, valor: 14, gap: 2 },
  '9x1':    { w: 90,  h: 10, codigo: 13, valor: 9,  gap: 2 },
  '14x3.5': { w: 140, h: 35, codigo: 22, valor: 15, gap: 3 }
};

function formatoEtiquetaElegido(){
  return document.querySelector('input[name="formato-etiqueta"]:checked')?.value || '5x2';
}
function incluirBarrasEnEtiquetas(){
  const chk = document.getElementById("etiqueta-con-barras");
  return chk ? chk.checked : true;
}
// Agrupar por equipos es lo habitual (se reparten por tipo de equipo), pero
// para una tirada de reposicion a veces solo se quieren las etiquetas
// seguidas y aprovechando la hoja al maximo.
const AGRUPAR_ETIQUETAS_KEY = 'metrologia_etiqueta_agrupar';

function agruparEtiquetasPorEquipo(){
  const chk = document.getElementById("etiqueta-agrupar-equipos");
  return chk ? chk.checked : true;
}

function guardarPreferenciaAgrupar(){
  try { localStorage.setItem(AGRUPAR_ETIQUETAS_KEY, agruparEtiquetasPorEquipo() ? '1' : '0'); } catch(e){}
}

function restaurarPreferenciaAgrupar(){
  try {
    const v = localStorage.getItem(AGRUPAR_ETIQUETAS_KEY);
    const chk = document.getElementById("etiqueta-agrupar-equipos");
    if (chk && v !== null) chk.checked = v === '1';
  } catch(e){}
}

// ------------------------------------------------------------
// Medida personalizada.
//
// El papel de etiquetas que se compra no siempre coincide con los tres
// formatos de la lista. Aqui se escriben el ancho y el alto reales del
// rotulo y la app calcula sola el reparto: cuanto ocupa la barra, que
// tamaño de letra cabe y si el texto va debajo o al lado.
// ------------------------------------------------------------
const LIMITES_ETIQUETA = { anchoMin: 1.5, anchoMax: 19, altoMin: 0.6, altoMax: 27, sepMax: 20 };
const MEDIDA_ETIQUETA_KEY = 'metrologia_etiqueta_personalizada';

function leerMedidaPersonalizada(){
  const ancho = parseFloat(document.getElementById("etiqueta-ancho")?.value);
  const alto = parseFloat(document.getElementById("etiqueta-alto")?.value);
  const sepRaw = parseFloat(document.getElementById("etiqueta-separacion")?.value);
  const sep = isNaN(sepRaw) ? 2 : sepRaw;
  const L = LIMITES_ETIQUETA;

  if (isNaN(ancho) || isNaN(alto)) return { error: "Escribe el ancho y el alto de la etiqueta en centímetros." };
  if (ancho < L.anchoMin || ancho > L.anchoMax)
    return { error: `El ancho debe estar entre ${L.anchoMin} y ${L.anchoMax} cm (más ancho no entra en una hoja A4).` };
  if (alto < L.altoMin || alto > L.altoMax)
    return { error: `El alto debe estar entre ${L.altoMin} y ${L.altoMax} cm.` };
  if (sep < 0 || sep > L.sepMax) return { error: `La separación debe estar entre 0 y ${L.sepMax} mm.` };

  return { w: ancho * 10, h: alto * 10, gap: sep, anchoCM: ancho, altoCM: alto };
}

// Reparte una etiqueta de w x h mm. Las proporciones salen de los tres
// formatos ya probados, por eso con 5x2 o 14x3,5 da practicamente lo mismo
// que las constantes de arriba.
function construirConfigPersonalizada(w, h, gap, conBarras){
  const acotar = (v, min, max) => Math.max(min, Math.min(max, v));
  // Por debajo de 14 mm no hay sitio para apilar barra + dos lineas de
  // texto, asi que la barra se pone a la izquierda y el texto al lado.
  const horizontal = h < 14;

  const cfg = {
    w, h, gap,
    orientacion: horizontal ? 'horizontal' : 'vertical',
    barras: horizontal ? acotar(h * 0.60, 4, 10) : acotar(h * 0.35, 5, 20),
    codigo: horizontal ? acotar(h * 1.10, 6, 14) : acotar(h * 0.60, 6, 24),
    valor:  horizontal ? acotar(h * 0.80, 5, 11) : acotar(h * 0.42, 5, 16),
    codigoTexto: acotar(h * 1.00, 7, 26),
    valorTexto:  acotar(h * 0.70, 5, 18)
  };
  if (!conBarras) { cfg.codigo = cfg.codigoTexto; cfg.valor = cfg.valorTexto; }
  return cfg;
}

// Config de la etiqueta que toca imprimir ahora mismo. Devuelve null (y
// avisa) si las medidas escritas a mano no son validas.
function configEtiquetaActual(conBarras){
  const formato = formatoEtiquetaElegido();
  if (formato !== 'personalizado') {
    return conBarras ? FORMATOS_ETIQUETA[formato] : FORMATOS_ETIQUETA_SIN_BARRAS[formato];
  }
  const medida = leerMedidaPersonalizada();
  if (medida.error) { avisar(medida.error, "error"); return null; }
  // Guardamos al generar, no solo al teclear: asi la medida queda
  // recordada aunque los campos se hayan rellenado de otra forma.
  guardarMedidaPersonalizada();
  return construirConfigPersonalizada(medida.w, medida.h, medida.gap, conBarras);
}

// Nombre legible del formato, para el PDF y para el titulo de la vista previa.
function nombreFormatoEtiqueta(cfg){
  const formato = formatoEtiquetaElegido();
  if (formato !== 'personalizado') return formato.replace('.', ',') + ' cm';
  const n = v => String(+(v / 10).toFixed(2)).replace('.', ',');
  return `${n(cfg.w)} × ${n(cfg.h)} cm`;
}

// Nombre del equipo con el que se agrupan las etiquetas. El campo interno
// se sigue llamando "categoria" (no se toca para no migrar la base), pero de
// cara al usuario es "Equipos". Un patron sin equipo cae en un grupo propio
// en vez de mezclarse con el primero de la lista.
function nombreEquipoEtiqueta(p){
  return String((p && p.categoria) || '').trim() || 'Sin equipos';
}

// Cuantas etiquetas entran en una hoja A4 con esta medida.
function etiquetasPorHoja(cfg, margen){
  const util = 210 - margen * 2, utilAlto = 297 - margen * 2;
  const cols = Math.max(1, Math.floor((util + cfg.gap) / (cfg.w + cfg.gap)));
  const filas = Math.max(1, Math.floor((utilAlto + cfg.gap) / (cfg.h + cfg.gap)));
  return { cols, filas, porHoja: cols * filas };
}

// Resumen en pantalla de lo que va a salir con las medidas escritas.
function mostrarInfoMedidaEtiqueta(){
  const caja = document.getElementById("etiqueta-medida-info");
  if (!caja) return;
  const medida = leerMedidaPersonalizada();
  if (medida.error) { caja.textContent = medida.error; caja.style.color = "var(--text-danger)"; return; }

  const conBarras = incluirBarrasEnEtiquetas();
  const cfg = construirConfigPersonalizada(medida.w, medida.h, medida.gap, conBarras);
  const { cols, filas, porHoja } = etiquetasPorHoja(cfg, 5);
  const partes = [`Entran ${porHoja} etiquetas por hoja A4 (${cols} × ${filas}).`];

  if (agruparEtiquetasPorEquipo()) {
    // La franja de cada equipo ocupa una fila de alto aproximado, asi que la
    // cuenta de arriba es el maximo teorico, no lo que saldra de verdad.
    partes.push('Al agrupar por equipos entran algunas menos: la franja de cada grupo '
      + 'ocupa sitio y cada equipo empieza en una fila nueva.');
  }

  if (conBarras) {
    partes.push(cfg.orientacion === 'horizontal'
      ? "Es baja, así que el código de barras irá a la izquierda y el texto al lado."
      : "El código de barras irá arriba y el texto debajo.");
    // Con el codigo mas largo del catalogo vemos si la barra sera legible.
    const anchoUtil = cfg.orientacion === 'horizontal' ? cfg.w * 0.52 - 2 : cfg.w - 6;
    const codigos = patrones.map(p => String(p.codigo || "")).filter(textoCodificableEnCode128);
    const peor = codigos
      .map(c => ({ c, m: anchoModuloDe(c, anchoUtil) }))
      .filter(x => x.m !== null)
      .sort((a, b) => a.m - b.m)[0];
    if (peor) {
      partes.push(peor.m >= ANCHO_MODULO_MINIMO_MM
        ? `Con este ancho todos tus códigos salen legibles (el más largo, ${peor.c}, queda en ${peor.m.toFixed(2)} mm de barra).`
        : `Atención: el código más largo (${peor.c}) quedaría en ${peor.m.toFixed(2)} mm de barra, por debajo de los ${ANCHO_MODULO_MINIMO_MM} mm que necesita un lector. Ensancha la etiqueta o imprime esos aparte.`);
    }
  }
  caja.textContent = partes.join(" ");
  caja.style.color = "var(--text-secondary)";
}

function alternarMedidaPersonalizada(){
  const caja = document.getElementById("etiqueta-personalizada");
  if (!caja) return;
  const activa = formatoEtiquetaElegido() === 'personalizado';
  caja.style.display = activa ? "block" : "none";
  if (activa) mostrarInfoMedidaEtiqueta();
}

function guardarMedidaPersonalizada(){
  try {
    localStorage.setItem(MEDIDA_ETIQUETA_KEY, JSON.stringify({
      ancho: document.getElementById("etiqueta-ancho").value,
      alto: document.getElementById("etiqueta-alto").value,
      separacion: document.getElementById("etiqueta-separacion").value
    }));
  } catch(e){}
}

function restaurarMedidaPersonalizada(){
  try {
    const guardado = JSON.parse(localStorage.getItem(MEDIDA_ETIQUETA_KEY) || "null");
    if (!guardado) return;
    if (guardado.ancho) document.getElementById("etiqueta-ancho").value = guardado.ancho;
    if (guardado.alto) document.getElementById("etiqueta-alto").value = guardado.alto;
    if (guardado.separacion) document.getElementById("etiqueta-separacion").value = guardado.separacion;
  } catch(e){}
}

// Avisa de los codigos que no se pueden codificar o que saldrian con las
// barras demasiado finas para el lector.
function revisarLegibilidadBarras(datos, cfg){
  const anchoUtil = cfg.orientacion === 'horizontal' ? cfg.w * 0.52 - 2 : cfg.w - 6;
  const noCodificables = [], demasiadoFinos = [];
  datos.forEach(p => {
    const codigo = String(p.codigo || "");
    if (!textoCodificableEnCode128(codigo)) { noCodificables.push(codigo); return; }
    const m = anchoModuloDe(codigo, anchoUtil);
    if (m !== null && m < ANCHO_MODULO_MINIMO_MM) demasiadoFinos.push(codigo);
  });
  return { noCodificables, demasiadoFinos };
}

function descargarEtiquetasPDF(){
  // La seleccion vive en "seleccionEtiquetas" (los checkbox del catalogo la
  // mantienen al dia); antes esta funcion buscaba un atributo
  // data-etiqueta-codigo que ningun elemento tiene, codigo muerto ya retirado.
  const codigos = Object.keys(seleccionEtiquetas)
    .filter(c => seleccionEtiquetas[c])
    .filter(c => patrones.some(p => p.codigo === c && p.estado !== "Eliminado"));
  if (!codigos.length){ avisar('Selecciona al menos un patrón para imprimir su etiqueta.', 'info'); return; }
  const conBarras = incluirBarrasEnEtiquetas();
  const cfg = configEtiquetaActual(conBarras);
  if (!cfg) return;   // medidas personalizadas no validas
  const formato = nombreFormatoEtiqueta(cfg);
  const agrupar = agruparEtiquetasPorEquipo();
  // Con la agrupacion activada se ordena por equipos (el campo interno sigue
  // llamandose "categoria") y, dentro de cada equipo, por codigo: asi basta
  // recorrer la lista una vez para saber cuando empieza un grupo nuevo. Sin
  // agrupar se respeta el orden de seleccion, como antes.
  const datos = codigos
    .map(c => patrones.find(p => p.codigo === c))
    .filter(Boolean);
  if (agrupar) {
    datos.sort((a, b) => {
      const ea = nombreEquipoEtiqueta(a), eb = nombreEquipoEtiqueta(b);
      return ea === eb
        ? String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true })
        : ea.localeCompare(eb, 'es');
    });
  }
  const faltantes=datos.filter(p=>!String(p.valorNominal||p.valor||'').trim());
  if(faltantes.length){avisar('Falta el valor nominal en: '+faltantes.map(p=>p.codigo).join(', '), 'error');return;}
  if(typeof window.jspdf==='undefined'||!window.jspdf.jsPDF){avisar('No se pudo cargar el generador PDF.', 'error');return;}

  if (conBarras) {
    const { noCodificables, demasiadoFinos } = revisarLegibilidadBarras(datos, cfg);
    if (noCodificables.length) {
      avisar('Estos códigos llevan caracteres que Code 128 no admite (tildes o símbolos raros) y saldrán sin barras: '
        + noCodificables.join(', ') + '.', 'error');
    }
    if (demasiadoFinos.length) {
      avisar('Estos códigos son largos para el formato ' + formato + ': las barras quedarían muy finas y el lector puede fallar. '
        + 'Usa una etiqueta más ancha (14 × 3,5 cm o una medida personalizada).\n' + demasiadoFinos.join(', '), 'info');
    }
  }

  const doc=crearPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const PW=210,PH=297,margin=5,gap=cfg.gap;
  const { cols, filas } = etiquetasPorHoja(cfg, margin);
  const gridW=cols*cfg.w+(cols-1)*gap;
  const sx=(PW-gridW)/2;

  // Dos reparticiones distintas segun la casilla "Agrupar por equipos":
  //
  //  - Sin agrupar: la rejilla fija centrada en la hoja, como siempre.
  //  - Agrupando: cada franja de titulo desplaza las filas de debajo, asi que
  //    la rejilla ya no es fija y la hoja se llena de arriba hacia abajo.
  //
  // En los dos casos "y" es el borde superior de lo proximo que se dibuja y
  // "col" la columna libre de la fila en curso, de modo que el bucle de abajo
  // es el mismo; solo cambian de donde arranca y donde termina la rejilla.
  const GRUPO_H = 7;     // alto de la franja de color, en mm
  const GRUPO_SEP = 2;   // aire entre la franja y la primera fila del grupo

  const gridH = filas * cfg.h + (filas - 1) * gap;
  const yArranque = agrupar ? margin : (PH - gridH) / 2;
  const yTope = agrupar ? PH - margin : (PH - gridH) / 2 + gridH + 0.01;

  let paginaIniciada = false;
  let y = yArranque;
  let col = 0;

  const nuevaPagina = () => {
    if (paginaIniciada) doc.addPage(); else paginaIniciada = true;
    y = yArranque;
    col = 0;
  };

  const franjaGrupo = (titulo) => {
    if (col > 0) { col = 0; y += cfg.h + gap; }   // cerrar la fila a medias
    // La franja no se queda sola al pie de la hoja: si debajo no cabe al
    // menos una fila de etiquetas, el grupo entero empieza en la siguiente.
    if (y + GRUPO_H + GRUPO_SEP + cfg.h > yTope) nuevaPagina();
    // La franja se alinea con la rejilla de etiquetas, no con la hoja: asi
    // el bloque de cada equipo se lee como una sola pieza.
    doc.setFillColor(30, 80, 160);
    doc.rect(sx, y, gridW, GRUPO_H, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(doc.splitTextToSize(titulo, gridW - 6)[0], sx + 3, y + GRUPO_H / 2 + 1.2);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    y += GRUPO_H + GRUPO_SEP;
  };

  let grupoActual = null;
  for (const p of datos) {
    const equipo = nombreEquipoEtiqueta(p);
    if (!paginaIniciada) nuevaPagina();
    if (agrupar && equipo !== grupoActual) { franjaGrupo('Equipos: ' + equipo); grupoActual = equipo; }
    if (col >= cols) { col = 0; y += cfg.h + gap; }
    if (y + cfg.h > yTope) {
      nuevaPagina();
      // El grupo sigue en la hoja siguiente: se repite el titulo para que
      // nadie tenga que volver atras a ver de que equipo son estas etiquetas.
      if (agrupar) franjaGrupo('Equipos: ' + equipo + ' (continúa)');
    }
    const x = sx + col * (cfg.w + gap);
    doc.setDrawColor(150); doc.setLineWidth(.25); doc.rect(x, y, cfg.w, cfg.h);
    dibujarEtiquetaEnPDF(doc, p, x, y, cfg, conBarras);
    col++;
  }
  const nombreArchivo = 'Etiquetas_Patrones_'
    + formato.replace(/\s/g, '').replace(/[×,]/g, m => m === '×' ? 'x' : '_').replace('cm', 'cm')
    + (conBarras ? '_barras' : '') + '.pdf';
  doc.save(nombreArchivo);
}

// Una sola etiqueta dentro del PDF. Separada para que los dos formatos
// (barra arriba con texto debajo, o barra a la izquierda con texto al lado)
// no se mezclen con la logica de paginacion.
function dibujarEtiquetaEnPDF(doc, p, x, y, cfg, conBarras){
  const codigo = String(p.codigo || "");
  const valor = String(p.valorNominal || p.valor || "");

  // El reparto vertical se calcula con la ALTURA REAL de cada linea, no
  // con distancias fijas. Con medidas a mano una letra grande se montaba
  // sobre las barras y el codigo quedaba ilegible justo donde importa.
  const PT_A_MM = 25.4 / 72;

  // Ajusta la letra al ancho disponible y devuelve el tamaño final y su
  // altura en mm, para poder apilar sin que nada se solape.
  const medirLinea = (texto, anchoMax, tam, negrita) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    const final = ajustarFuenteParaAncho(doc, texto, anchoMax, tam, 4.5);
    return { tam: final, alto: final * PT_A_MM, negrita };
  };
  const pintar = (texto, linea, xPos, yCentro, alineado) => {
    doc.setFont('helvetica', linea.negrita ? 'bold' : 'normal');
    doc.setFontSize(linea.tam);
    doc.text(texto, xPos, yCentro, { align: alineado || 'center', baseline: 'middle' });
  };

  const margen = 1.5, sep = 1.1, margenLateral = 3;

  // Sin barras (o con un codigo que Code 128 no admite) el texto manda y
  // puede ir mas grande: cada formato trae sus dos tamaños preparados.
  if (!conBarras || !textoCodificableEnCode128(codigo)) {
    const anchoTexto = cfg.w - 4;
    const lCodigo = medirLinea(codigo, anchoTexto, cfg.codigoTexto ?? cfg.codigo, true);
    const lValor  = medirLinea(valor,  anchoTexto, cfg.valorTexto  ?? cfg.valor,  false);
    // Bloque de dos lineas centrado en la etiqueta.
    const alto = lCodigo.alto + (valor ? sep + lValor.alto : 0);
    const arriba = y + (cfg.h - alto) / 2;
    pintar(codigo, lCodigo, x + cfg.w/2, arriba + lCodigo.alto/2);
    if (valor) pintar(valor, lValor, x + cfg.w/2, arriba + lCodigo.alto + sep + lValor.alto/2);
    return;
  }

  if (cfg.orientacion === 'horizontal') {
    // Etiqueta baja: no hay altura para apilar barra y texto, asi que la
    // barra ocupa la mitad izquierda y las dos lineas van a la derecha.
    const anchoBarras = cfg.w * 0.52 - 2;
    dibujarCodigoBarrasPDF(doc, codigo, x + 2, y + (cfg.h - cfg.barras) / 2, anchoBarras, cfg.barras);

    const xTexto = x + cfg.w * 0.54;
    const anchoTexto = cfg.w * 0.46 - 3;
    const lCodigo = medirLinea(codigo, anchoTexto, cfg.codigo, true);
    const lValor  = medirLinea(valor,  anchoTexto, cfg.valor,  false);
    const alto = lCodigo.alto + (valor ? sep + lValor.alto : 0);
    const arriba = y + (cfg.h - alto) / 2;
    pintar(codigo, lCodigo, xTexto, arriba + lCodigo.alto/2, 'left');
    if (valor) pintar(valor, lValor, xTexto, arriba + lCodigo.alto + sep + lValor.alto/2, 'left');
    return;
  }

  // Vertical: barras arriba, codigo legible debajo (si el lector falla, la
  // persona siempre puede teclearlo) y valor nominal al pie.
  const anchoTexto = cfg.w - 4;
  const lCodigo = medirLinea(codigo, anchoTexto, cfg.codigo, true);
  const lValor  = medirLinea(valor,  anchoTexto, cfg.valor,  false);
  const altoTexto = lCodigo.alto + (valor ? sep + lValor.alto : 0);

  // La barra cede altura si el texto no cabe: antes que solaparse, prefiere
  // una barra mas baja (el lector la sigue leyendo) o incluso recortarla.
  const disponible = cfg.h - margen * 2 - sep - altoTexto;
  const alturaBarras = Math.max(2.5, Math.min(cfg.barras, disponible));

  dibujarCodigoBarrasPDF(doc, codigo, x + margenLateral, y + margen, cfg.w - margenLateral * 2, alturaBarras);
  const yCodigo = y + margen + alturaBarras + sep + lCodigo.alto / 2;
  pintar(codigo, lCodigo, x + cfg.w/2, yCodigo);
  if (valor) pintar(valor, lValor, x + cfg.w/2, yCodigo + lCodigo.alto/2 + sep + lValor.alto/2);
}

function imprimirEtiquetasSeleccionadas(){
  const seleccion = obtenerPatronesSeleccionadosParaEtiqueta();
  if (!seleccion) return;

  // Mismo formato y dimensiones reales que el PDF descargable, para que
  // "Vista previa / imprimir" y "Descargar PDF" produzcan etiquetas iguales.
  const conBarras = incluirBarrasEnEtiquetas();
  const cfg = configEtiquetaActual(conBarras);
  if (!cfg) return;   // medidas personalizadas no validas
  const formato = nombreFormatoEtiqueta(cfg);
  const agrupar = agruparEtiquetasPorEquipo();
  const { cols } = etiquetasPorHoja(cfg, 8); // A4 menos 8 mm por lado
  const horizontal = conBarras && cfg.orientacion === 'horizontal';

  const etiquetaHTML = (p) => {
    const codigo = String(p.codigo || "");
    const puedeBarras = conBarras && textoCodificableEnCode128(codigo);
    const anchoBarras = horizontal ? cfg.w * 0.52 - 2 : cfg.w - 6;
    const barras = puedeBarras ? svgCodigoBarras(codigo, anchoBarras, cfg.barras) : "";
    const texto = `<div class="etiqueta-texto">
        <div class="etiqueta-codigo">${escapeHTML(codigo)}</div>
        <div class="etiqueta-valor">${escapeHTML(p.valorNominal)}</div>
      </div>`;
    return `<div class="etiqueta${horizontal ? " horizontal" : ""}">${barras}${texto}</div>`;
  };

  // Se reparten las etiquetas en hojas igual que en el PDF: cada equipo abre
  // con su franja de titulo y, si sus etiquetas no caben en lo que queda de
  // hoja, el resto continua en la siguiente repitiendo el titulo. La cuenta
  // se hace en milimetros porque es la unidad de @page y de la rejilla.
  const ALTO_UTIL  = 297 - 8 * 2;   // A4 menos los margenes de @page
  const GRUPO_H    = 7;             // alto de la franja de titulo, en mm
  const GRUPO_SEP  = 2;             // aire entre la franja y su primera fila
  const ALTO_FILA  = cfg.h + cfg.gap;
  const ANCHO_REJILLA = cols * cfg.w + (cols - 1) * cfg.gap;  // para que la franja case con la rejilla

  // Sin agrupar se respeta el orden de seleccion y todo va en un solo grupo
  // sin franja, que es el reparto de siempre: la rejilla llena cada hoja.
  const ordenados = [...seleccion];
  if (agrupar) {
    ordenados.sort((a, b) => {
      const ea = nombreEquipoEtiqueta(a), eb = nombreEquipoEtiqueta(b);
      return ea === eb
        ? String(a.codigo || '').localeCompare(String(b.codigo || ''), 'es', { numeric: true })
        : ea.localeCompare(eb, 'es');
    });
  }

  const grupos = [];
  for (const p of ordenados) {
    const equipo = agrupar ? nombreEquipoEtiqueta(p) : null;
    if (!grupos.length || grupos[grupos.length - 1].equipo !== equipo) grupos.push({ equipo, items: [] });
    grupos[grupos.length - 1].items.push(p);
  }

  const hojas = [];
  let hoja = [], yUsado = 0;
  const cerrarHoja = () => { if (hoja.length) hojas.push(hoja); hoja = []; yUsado = 0; };

  for (const g of grupos) {
    let pendientes = g.items.slice();
    let continuacion = false;
    while (pendientes.length) {
      // La franja nunca se queda sola al pie: si debajo no cabe ni una fila
      // de etiquetas, el grupo arranca en la hoja siguiente.
      const altoFranja = agrupar ? GRUPO_H + GRUPO_SEP : 0;
      if (yUsado + altoFranja + cfg.h > ALTO_UTIL) cerrarHoja();
      if (agrupar) {
        const titulo = 'Equipos: ' + g.equipo + (continuacion ? ' (continúa)' : '');
        hoja.push(`<div class="grupo-header">${escapeHTML(titulo)}</div>`);
        yUsado += GRUPO_H + GRUPO_SEP;
        continuacion = true;
      }

      const filasCaben = Math.max(1, Math.floor((ALTO_UTIL - yUsado + cfg.gap) / ALTO_FILA));
      const lote = pendientes.splice(0, filasCaben * cols);
      hoja.push(`<div class="grupo-rejilla">${lote.map(etiquetaHTML).join("")}</div>`);
      yUsado += Math.ceil(lote.length / cols) * ALTO_FILA;

      if (pendientes.length) cerrarHoja();
    }
  }
  cerrarHoja();

  const ventana = window.open("", "_blank", "width=1000,height=800");
  if (!ventana) { avisar("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para esta aplicación.", "error"); return; }
  ventana.document.open();
  ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de patrones (${formato})</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    html,body { margin:0; padding:0; background:#fff; color:#000; font-family:Arial,Helvetica,sans-serif; }
    .hoja { page-break-after:always; break-after:page; }
    .hoja:last-child { page-break-after:auto; break-after:auto; }
    .grupo-rejilla { display:grid; grid-template-columns:repeat(${cols}, ${cfg.w}mm); grid-auto-rows:${cfg.h}mm; gap:${cfg.gap}mm; justify-content:center; align-content:start; margin-bottom:${cfg.gap}mm; }
    .grupo-header { width:${ANCHO_REJILLA}mm; max-width:100%; margin:0 auto ${GRUPO_SEP}mm; height:${GRUPO_H}mm;
                    background:#1e50a0; color:#fff; font-size:9pt; font-weight:700; display:flex;
                    align-items:center; padding:0 3mm; border-radius:1mm; overflow:hidden;
                    white-space:nowrap; text-overflow:ellipsis; }
    .etiqueta { border:0.35mm solid #222; border-radius:1mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; overflow:hidden; padding:1mm 2mm; }
    .etiqueta.horizontal { flex-direction:row; justify-content:space-between; gap:2mm; padding:0.8mm 2mm; }
    .etiqueta.horizontal .etiqueta-texto { text-align:left; }
    .etiqueta-texto { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; }
    .etiqueta.horizontal .etiqueta-texto { align-items:flex-start; }
    .etiqueta-barras { margin-bottom:0.8mm; flex:0 0 auto; }
    .etiqueta.horizontal .etiqueta-barras { margin-bottom:0; }
    .etiqueta-codigo { font-size:${cfg.codigo}pt; font-weight:700; line-height:1.05; overflow-wrap:anywhere; }
    .etiqueta-valor { font-size:${cfg.valor}pt; font-weight:400; line-height:1.05; margin-top:0.6mm; overflow-wrap:anywhere; }
    /* Las barras deben imprimirse en negro puro aunque el navegador
       intente ahorrar tinta: si las aclara, el lector deja de leerlas. */
    @media print {
      .etiqueta-barras, .grupo-header { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      .grupo-header, .grupo-rejilla { break-inside:avoid; page-break-inside:avoid; }
    }
    @media screen { body { padding:10px; background:#eee; } .hoja { width:194mm; min-height:281mm; margin:0 auto 15px; background:#fff; box-shadow:0 0 8px rgba(0,0,0,.2); padding:8mm; } }
  </style></head><body>`);
  for (const bloques of hojas) {
    ventana.document.write(`<div class="hoja">${bloques.join("")}</div>`);
  }
  ventana.document.write(`</body></html>`);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 350);
}

// ============================================================
// 7.6 LECTOR DE CODIGO DE BARRAS
//
// Los lectores de codigo de barras USB son "keyboard wedge": el sistema
// los ve como un teclado que teclea el codigo muy rapido y termina con
// Enter (algunos con Tab). No hay driver ni permiso que pedir; hay que
// distinguir esa rafaga de una persona escribiendo.
//
// Se detecta por velocidad: nadie teclea 20 caracteres seguidos con menos
// de 50 ms entre teclas. En cuanto la rafaga se confirma, tragamos las
// teclas para que no se cuelen en el campo que tenga el foco, y al final
// limpiamos los primeros caracteres que alcanzaron a escribirse.
//
// El modo manual NUNCA se toca: el campo de escaneo acepta que escribas
// el codigo y pulses Enter, y los botones y casillas de siempre siguen ahi.
// ============================================================
const ESCANER_MS_ENTRE_TECLAS = 50;   // por encima de esto, es una persona
const ESCANER_MIN_CARACTERES  = 3;    // rafagas mas cortas no son un codigo
const ESCANER_MS_REINICIO     = 300;  // pausa que da por terminada la rafaga
const ESCANER_SONIDO_KEY      = 'metrologia_escaner_sonido';

const lectorEstado = { buffer: "", bufferFisico: "", ultimoTiempo: 0, rafaga: false, fugados: "", objetivo: null };

// ------------------------------------------------------------
// Distribucion de teclado: por que "PT-TCDG-07" se leia "PT'TCDG'07".
//
// El lector no envia caracteres, envia POSICIONES de tecla de un teclado
// americano. Windows las traduce con la distribucion activa, y recuerda el
// idioma de entrada por VENTANA: de ahi que en Chrome saliera bien y en
// Edge mal en el mismo equipo. En la distribucion española, la tecla que
// en la americana da "-" da "'", y la que da "/" da "-".
//
// La solucion es no fiarse del caracter (event.key) y reconstruirlo de la
// tecla fisica (event.code), que es igual en cualquier distribucion. Se
// guardan las dos lecturas y gana la que encuentre un patron de verdad,
// asi que tambien funciona si el lector SI esta configurado en español.
// ------------------------------------------------------------
const US_SHIFT_DIGITOS = { "1":"!","2":"@","3":"#","4":"$","5":"%","6":"^","7":"&","8":"*","9":"(","0":")" };
const US_TECLAS = {
  Minus:["-","_"], Equal:["=","+"], BracketLeft:["[","{"], BracketRight:["]","}"],
  Backslash:["\\","|"], Semicolon:[";",":"], Quote:["'","\""], Backquote:["`","~"],
  Comma:[",","<"], Period:[".",">"], Slash:["/","?"], Space:[" "," "],
  NumpadSubtract:["-","-"], NumpadAdd:["+","+"], NumpadMultiply:["*","*"],
  NumpadDivide:["/","/"], NumpadDecimal:[".","."]
};

function charDesdeTeclaFisica(e){
  const code = e.code || "";
  if (/^Key[A-Z]$/.test(code)) {
    const letra = code.slice(3);
    return e.shiftKey ? letra : letra.toLowerCase();
  }
  if (/^Digit[0-9]$/.test(code)) {
    const d = code.slice(5);
    return e.shiftKey ? (US_SHIFT_DIGITOS[d] || d) : d;
  }
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  const par = US_TECLAS[code];
  return par ? (e.shiftKey ? par[1] : par[0]) : null;
}

// De las lecturas posibles, gana la que identifique un patron. Primero se
// busca una coincidencia EXACTA; solo si ninguna la logra se acepta la
// aproximada, para no quedarnos con el texto mal traducido por casualidad.
let avisoDistribucionMostrado = false;

function resolverCodigoLeido(candidatos){
  const lista = [];
  candidatos.forEach(c => {
    const t = String(c || "").trim();
    if (t && !lista.includes(t)) lista.push(t);
  });
  if (!lista.length) return "";

  for (const t of lista) if (buscarPatronPorCodigoEscaneado(t, true).patron) return anunciarSiCambio(t, lista[0]);
  for (const t of lista) if (buscarPatronPorCodigoEscaneado(t).patron) return anunciarSiCambio(t, lista[0]);
  return lista[0];
}

// Si lo que se ha usado no es lo que el navegador escribio, es que la
// distribucion de teclado no coincide con el lector. Se explica una vez.
function anunciarSiCambio(elegido, loQueEscribioElNavegador){
  if (elegido !== loQueEscribioElNavegador && !avisoDistribucionMostrado) {
    avisoDistribucionMostrado = true;
    avisar(
      `El lector funciona, pero este navegador está traduciendo sus teclas con otra distribución ` +
      `de teclado: escribió "${loQueEscribioElNavegador}" en vez de "${elegido}". La app lo corrige sola. ` +
      `Si quieres quitarlo de raíz, pon el idioma de entrada de Windows en inglés (EE. UU.) en esta ventana, ` +
      `o configura el lector para teclado español.`,
      "info"
    );
  }
  return elegido;
}

function sonidoEscanerActivo(){
  try { return localStorage.getItem(ESCANER_SONIDO_KEY) !== '0'; } catch(e){ return true; }
}
function fijarSonidoEscaner(activo){
  try { localStorage.setItem(ESCANER_SONIDO_KEY, activo ? '1' : '0'); } catch(e){}
}

// Aviso sonoro: en el laboratorio se escanea mirando el patron, no la
// pantalla. Un pitido agudo = entro; uno grave y largo = algo falla.
let audioEscaner = null;
function pitido(tipo){
  if (!sonidoEscanerActivo()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioEscaner = audioEscaner || new AC();
    if (audioEscaner.state === 'suspended') audioEscaner.resume();
    const osc = audioEscaner.createOscillator();
    const gan = audioEscaner.createGain();
    const t = audioEscaner.currentTime;
    const frec = tipo === 'error' ? 200 : (tipo === 'aviso' ? 500 : 900);
    const dur  = tipo === 'error' ? 0.30 : 0.09;
    osc.type = 'square';
    osc.frequency.setValueAtTime(frec, t);
    gan.gain.setValueAtTime(0.0001, t);
    gan.gain.exponentialRampToValueAtTime(0.12, t + 0.008);
    gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gan); gan.connect(audioEscaner.destination);
    osc.start(t); osc.stop(t + dur + 0.02);
  } catch(e){ /* el sonido nunca puede romper el registro */ }
}

// --- Normalizacion y busqueda del patron leido ---
function normalizarCodigoEscaneado(texto){
  return String(texto || "").trim().replace(/\s+/g, " ").toUpperCase();
}
// Version "plana": sin guiones, espacios ni puntuacion. Sirve de red por si
// la etiqueta se imprimio con separadores distintos a los del catalogo.
function clavePlanaCodigo(texto){
  return normalizarCodigoEscaneado(texto).replace(/[^A-Z0-9]/g, "");
}

// Busca el patron leido. Devuelve { patron, ambiguos, coincidencia }.
// Prueba, en orden: codigo exacto, serie exacta, codigo plano, serie plana.
// Solo baja al siguiente nivel si el anterior no dio nada, y si un nivel da
// varios resultados se considera ambiguo en vez de elegir al azar.
function buscarPatronPorCodigoEscaneado(leido, soloExacto = false){
  const exacto = normalizarCodigoEscaneado(leido);
  const plano = clavePlanaCodigo(leido);
  if (!exacto) return { patron: null, ambiguos: [], coincidencia: null };

  const niveles = [
    { nombre: "codigo", test: p => normalizarCodigoEscaneado(p.codigo) === exacto },
    { nombre: "serie",  test: p => p.serie && normalizarCodigoEscaneado(p.serie) === exacto }
  ];
  // Los niveles aproximados (ignorando guiones y espacios) son la red de
  // seguridad; al comparar dos lecturas de un mismo escaneo se piden solo
  // los exactos, para que gane la lectura bien traducida.
  if (!soloExacto) niveles.push(
    { nombre: "codigo aproximado", test: p => plano && clavePlanaCodigo(p.codigo) === plano },
    { nombre: "serie aproximada",  test: p => p.serie && plano && clavePlanaCodigo(p.serie) === plano }
  );

  for (const nivel of niveles) {
    const hallados = patrones.filter(nivel.test);
    if (hallados.length === 1) return { patron: hallados[0], ambiguos: [], coincidencia: nivel.nombre };
    if (hallados.length > 1) return { patron: null, ambiguos: hallados, coincidencia: nivel.nombre };
  }
  return { patron: null, ambiguos: [], coincidencia: null };
}

// --- Captura global de la rafaga del lector ---
// A que pantalla va lo escaneado. Se calcula en el momento de la lectura:
// asi el mismo lector sirve para la salida y para la devolucion sin que
// haya que cambiar de "modo" a mano.
function destinoEscaneoActivo(){
  const modalDev = document.getElementById("modal-devolucion");
  if (modalDev && modalDev.classList.contains("open")) return procesarEscaneoDevolucion;

  const hayOtroModal = Array.from(document.querySelectorAll(".modal-overlay"))
    .some(m => m.classList.contains("open"));
  if (hayOtroModal) return null;

  const panelSalida = document.getElementById("panel-salida");
  if (panelSalida && panelSalida.style.display !== "none") return procesarEscaneoSalida;
  return null;
}

// Si la rafaga empezo con el foco en un campo de texto, los primeros
// caracteres alcanzaron a escribirse antes de que la detectaramos. Los
// quitamos para no dejar basura en el buscador o en el numero de OT.
function limpiarFugaEnCampo(elemento, textoFugado){
  if (!elemento || !textoFugado || typeof elemento.value !== "string") return;
  const valor = elemento.value;
  const fin = valor.slice(-textoFugado.length);
  if (fin.toUpperCase() === textoFugado.toUpperCase()) {
    elemento.value = valor.slice(0, valor.length - textoFugado.length);
    elemento.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function reiniciarLector(){
  lectorEstado.buffer = "";
  lectorEstado.bufferFisico = "";
  lectorEstado.rafaga = false;
  lectorEstado.fugados = "";
  lectorEstado.objetivo = null;
}

function manejarTeclaLector(e){
  // El campo de escaneo dedicado se gestiona solo (ahi Enter siempre vale,
  // aunque el codigo se haya tecleado despacio a mano).
  if (e.target && e.target.classList && e.target.classList.contains("campo-escaneo")) return;
  if (e.ctrlKey || e.altKey || e.metaKey) { reiniciarLector(); return; }
  if (!destinoEscaneoActivo()) { reiniciarLector(); return; }

  const ahora = Date.now();
  const delta = ahora - lectorEstado.ultimoTiempo;
  lectorEstado.ultimoTiempo = ahora;

  const esTerminador = e.key === "Enter" || e.key === "Tab";

  if (esTerminador) {
    const porCaracter = lectorEstado.buffer;
    const porTeclaFisica = lectorEstado.bufferFisico;
    const eraRafaga = lectorEstado.rafaga && porCaracter.length >= ESCANER_MIN_CARACTERES;
    if (eraRafaga) {
      e.preventDefault();
      limpiarFugaEnCampo(lectorEstado.objetivo, lectorEstado.fugados);
      const destino = destinoEscaneoActivo();
      reiniciarLector();
      // Dos lecturas del mismo disparo: la del navegador y la reconstruida
      // de las teclas fisicas. Gana la que identifique un patron.
      if (destino) destino(resolverCodigoLeido([porCaracter, porTeclaFisica]));
      return;
    }
    reiniciarLector();
    return;
  }

  if (e.key.length !== 1) return;   // flechas, mayusculas, F5...

  if (delta > ESCANER_MS_REINICIO) {
    lectorEstado.buffer = "";
    lectorEstado.bufferFisico = "";
    lectorEstado.rafaga = false;
    lectorEstado.fugados = "";
    lectorEstado.objetivo = e.target;
  }
  lectorEstado.buffer += e.key;
  const fisico = charDesdeTeclaFisica(e);
  lectorEstado.bufferFisico += (fisico !== null ? fisico : e.key);

  if (!lectorEstado.rafaga) {
    // Todavia no sabemos si es el lector: dejamos pasar la tecla y la
    // apuntamos como "fugada" por si luego hay que borrarla del campo.
    lectorEstado.fugados += e.key;
    if (lectorEstado.buffer.length >= ESCANER_MIN_CARACTERES && delta <= ESCANER_MS_ENTRE_TECLAS) {
      lectorEstado.rafaga = true;   // confirmado: a partir de aqui las tragamos
    }
  } else {
    e.preventDefault();
  }
}

// --- Procesamiento de un escaneo en la pantalla de SALIDA ---
function procesarEscaneoSalida(codigoLeido){
  const eco = document.getElementById("escaneo-salida-eco");
  const mostrar = (texto, tipo) => {
    if (!eco) return;
    eco.textContent = texto;
    eco.className = "escaneo-eco " + tipo;
  };

  const { patron, ambiguos } = buscarPatronPorCodigoEscaneado(codigoLeido);

  if (ambiguos.length) {
    pitido("error");
    mostrar(`"${codigoLeido}": hay ${ambiguos.length} patrones con ese código (${ambiguos.map(p=>p.codigo).join(", ")}). Selecciónalo a mano.`, "error");
    avisar(`Código ambiguo: ${ambiguos.map(p=>p.codigo).join(", ")}. Márcalo manualmente.`, "error");
    return;
  }
  if (!patron) {
    pitido("error");
    mostrar(`"${codigoLeido}" no corresponde a ningún patrón del catálogo.`, "error");
    avisar(`El código "${codigoLeido}" no está en el catálogo. Revisa la etiqueta o búscalo a mano.`, "error");
    return;
  }
  if (seleccionados[patron.codigo]) {
    pitido("aviso");
    mostrar(`${patron.codigo} ya estaba en la lista.`, "aviso");
    return;
  }
  // Mismas reglas que marcando la casilla a mano: el escaner no es un atajo
  // para saltarse el bloqueo por calibracion vencida.
  if (ESTADOS_FUERA_DE_USO.includes(patron.estado)) {
    pitido("error");
    mostrar(`${patron.codigo} está como "${patron.estado}" y no puede salir.`, "error");
    avisar(`${patron.codigo} está como "${patron.estado}": no puede salir a servicio.`, "error");
    return;
  }
  // En un grupo, "En servicio" solo quiere decir que no queda ninguna pieza
  // libre: se explica asi, que es lo util, antes del mensaje generico.
  if (grupoSinPiezasLibres(patron)) {
    pitido("error");
    mostrar(`${patron.codigo}: no queda ninguna pieza libre del grupo (las ${unidadesDeGrupo(patron)} están fuera).`, "error");
    avisar(`${patron.codigo} no tiene piezas disponibles ahora mismo.`, "error");
    return;
  }
  if (patron.estado !== "Disponible") {
    pitido("error");
    const salida = salidaActivaDe(patron.codigo);
    const detalle = salida ? ` (OT ${salida.numeroOT}, ${salida.empresa || "sin empresa"})` : "";
    mostrar(`${patron.codigo} está "${patron.estado}"${detalle}.`, "error");
    avisar(`${patron.codigo} no está disponible: figura como "${patron.estado}"${detalle}.`, "error");
    return;
  }
  if (patronBloqueadoPorCalibracion(patron)) {
    pitido("error");
    const detalle = actividadesVencidas(patron).map(a => `${a.nombre} venció ${formatMesISO(a.mesVencimiento)}`).join("; ");
    mostrar(`${patron.codigo} tiene actividad vencida: ${detalle}.`, "error");
    avisar(`${patron.codigo} no puede salir: ${detalle}.`, "error");
    return;
  }
  seleccionados[patron.codigo] = true;
  pitido("ok");

  if (esPatronGrupo(patron)) {
    // Un grupo no se escanea pieza a pieza: entra con 1 y el usuario
    // escribe cuantas salen en el campo del resumen, que queda enfocado.
    prepararCantidadGrupo(patron.codigo);
    mostrar(`${patron.codigo} añadido — escribe cuántas piezas salen (${unidadesDisponiblesDe(patron)} disponibles).`, "aviso");
    // El campo solo existe despues de redibujar el resumen: sin esperar a
    // que render() termine, el foco se pedia sobre un elemento inexistente.
    render().then(() => {
      const campo = document.querySelector(`.chip-cantidad[data-codigo="${CSS.escape(patron.codigo)}"]`);
      if (campo) { campo.focus(); campo.select(); }
    });
    return;
  }

  mostrar(`${patron.codigo} añadido — ${patron.area || ""}${patron.area ? " · " : ""}${patron.categoria || ""}`, "ok");
  render();
}

// ============================================================
