// 11. PDF
// ============================================================
// Inventario en PDF. Sin argumentos saca el catalogo completo; con el
// nombre de un area saca solo el inventario de ese laboratorio, que es lo
// que descarga cada seccion de la pestaña.
function descargarInventarioPDF(area = null){
  return window.MetrologiaReportesInventario.descargarInventarioPDF(area, {
    patrones, claveArea, ordenarAreas: ordenarAreasInventario, crearPDF, avisar,
    patronBloqueadoPorCalibracion, trozoNombreArchivo, todayISO
  });
}
function descargarReporteVencimientosPDF(){
  // Construimos una fila por CADA actividad programada de cada patron
  // (un patron puede aportar hasta 3 filas: CAL, V, M).
  const filas = [];
  patrones.forEach(p => {
    const act = getActividades(p);
    ACTIVIDADES_ISO.forEach(({clave, nombre}) => {
      const a = act[clave];
      if (a.mesVencimiento) {
        filas.push({
          codigo: p.codigo, categoria: p.categoria, area: p.area,
          actividad: clave + (a.tipoCalibracion ? " (" + a.tipoCalibracion + ")" : ""),
          claveActividad: clave,
          mesVencimiento: a.mesVencimiento,
          estado: estadoActividad(a)
        });
      }
    });
  });

  const vencidas = filas.filter(f => f.estado === 'vencido');
  const porVencer = filas.filter(f => f.estado === 'por_vencer');
  const vigentes = filas.filter(f => f.estado === 'vigente');

  const ordenadas = [
    ...vencidas.sort((a,b) => a.mesVencimiento.localeCompare(b.mesVencimiento)),
    ...porVencer,
    ...vigentes.sort((a,b) => a.mesVencimiento.localeCompare(b.mesVencimiento)),
  ];

  const doc = crearPDF({ unit: "mm", format: "a4" });
  const marginX = 12;
  let y = 20;

  doc.setFontSize(15);
  doc.setFont(undefined, "bold");
  doc.text("Reporte de vigencia de actividades ISO 17025", marginX, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text("Generado: " + new Date().toLocaleString("es-PE"), marginX, y);
  y += 4;
  doc.setDrawColor(210);
  doc.line(marginX, y, 198, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont(undefined, "bold");
  doc.text(`Vencidas: ${vencidas.length}    Vencen este mes: ${porVencer.length}    Vigentes: ${vigentes.length}`, marginX, y);
  y += 9;

  doc.setFontSize(9);
  const colX = [marginX, marginX+35, marginX+80, marginX+108, marginX+130, marginX+158];
  const encabezados = ["Código", "Equipos", "Laboratorio", "Actividad", "Vence", "Estado"];

  function dibujarEncabezado(){
    doc.setFont(undefined, "bold");
    encabezados.forEach((h,i) => doc.text(h, colX[i], y));
    y += 4;
    doc.setDrawColor(210);
    doc.line(marginX, y, 198, y);
    y += 5;
    doc.setFont(undefined, "normal");
  }
  dibujarEncabezado();

  ordenadas.forEach(f => {
    if (y > 280) { doc.addPage(); y = 20; dibujarEncabezado(); }
    const estTexto = f.estado === 'vencido' ? 'VENCIDA' : f.estado === 'por_vencer' ? 'Vence este mes' : 'Vigente';
    if (f.estado === 'vencido') doc.setTextColor(180, 30, 30);
    else if (f.estado === 'por_vencer') doc.setTextColor(150, 100, 0);
    else doc.setTextColor(0, 0, 0);

    doc.text(String(f.codigo).slice(0,18), colX[0], y);
    doc.text(String(f.categoria).slice(0,22), colX[1], y);
    doc.text(String(f.area).slice(0,14), colX[2], y);
    doc.text(String(f.actividad).slice(0,14), colX[3], y);
    doc.text(formatMesISO(f.mesVencimiento), colX[4], y);
    doc.text(estTexto, colX[5], y);
    y += 5.5;
  });
  doc.setTextColor(0,0,0);

  // Patrones donde NINGUNA de las 3 actividades tiene fecha programada.
  const sinProgramar = patrones.filter(p => {
    const act = getActividades(p);
    const algunaProgramada = ACTIVIDADES_ISO.some(({clave}) => !!act[clave].mesVencimiento);
    return !algunaProgramada && p.estado !== "Eliminado" && p.estado !== "De baja";
  });
  if (sinProgramar.length > 0) {
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
    doc.setFont(undefined, "bold");
    doc.setFontSize(11);
    doc.text(`Patrones sin ninguna actividad programada: ${sinProgramar.length}`, marginX, y);
    y += 7;
    doc.setFont(undefined, "normal");
    doc.setFontSize(9);
    sinProgramar.forEach(p => {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(`${p.codigo} - ${p.categoria} (${p.area})`, marginX, y);
      y += 5;
    });
  }

  doc.save("Reporte_Vencimientos_ISO17025_" + todayISO() + ".pdf");
}

// ------------------------------------------------------------
// SOLICITUD DE CALIBRACION mensual (modelo "Lista para generar OT")
//
// Para el mes elegido, lista los patrones cuya actividad vence ese
// mes, en tres secciones: CALIBRACION, VERIFICACION (Comprobacion
// Intermedia) y MANTENIMIENTO. Columnas del modelo: Equipo, Marca,
// Modelo, Serie, Codigo, Puntos, Lugar de uso ("No indica" si falta).
// Los codigos consecutivos del mismo equipo se agrupan como en el
// modelo original (ej. "PTB-PEM2-41 al 60").
// ------------------------------------------------------------
function agruparCodigosConsecutivos(lista, claveActividad){
  // lista: patrones con misma actividad venciendo. Devuelve filas
  // {equipo, marca, modelo, serie, codigo, puntos, lugar, cantidad, tipo}.
  const tipoDe = p => claveActividad ? (getActividades(p)[claveActividad].tipoCalibracion || "") : "";
  const filas = [];
  const grupos = {};
  lista.forEach(p => {
    const m = String(p.codigo).match(/^(.*?-)(\d+)$/);
    const clave = m
      ? [m[1], p.categoria, p.marca||"", p.modelo||"", p.valorNominal||"", p.lugarUso||"Campo", tipoDe(p)].join("§")
      : null;
    if (m) {
      if (!grupos[clave]) grupos[clave] = { p, prefijo: m[1], nums: [] };
      grupos[clave].nums.push(m[2]);
    } else {
      filas.push({ p, codigo: p.codigo, cantidad: 1 });
    }
  });
  Object.values(grupos).forEach(g => {
    const nums = g.nums.sort((a,b) => parseInt(a,10) - parseInt(b,10));
    let i = 0;
    while (i < nums.length) {
      let j = i;
      while (j + 1 < nums.length && parseInt(nums[j+1],10) === parseInt(nums[j],10) + 1) j++;
      const cantidad = j - i + 1;
      const codigo = cantidad >= 3
        ? `${g.prefijo}${nums[i]} al ${nums[j]}`
        : null;
      if (codigo) {
        filas.push({ p: g.p, codigo, cantidad });
      } else {
        for (let k = i; k <= j; k++) filas.push({ p: g.p, codigo: g.prefijo + nums[k], cantidad: 1 });
      }
      i = j + 1;
    }
  });
  filas.sort((a,b) => a.codigo.localeCompare(b.codigo));
  return filas.map(f => ({
    equipo: f.p.categoria || "No indica",
    marca: (f.p.marca || "").trim() || "No indica",
    modelo: (f.p.modelo || "").trim() || "No indica",
    serie: (f.p.serie || "").trim() || "No indica",
    codigo: f.codigo + (tipoDe(f.p) ? " (" + tipoDe(f.p) + ")" : ""),
    puntos: (f.p.valorNominal || "").trim() || "-",
    lugar: f.p.lugarUso || "Campo",
    cantidad: f.cantidad
  }));
}

const SECCIONES_SOLICITUD = [
  { titulo: "CALIBRACIÓN", clave: "CAL", colPuntos: "Puntos Cal." },
  { titulo: "VERIFICACIÓN (Comprobación Intermedia)", clave: "V", colPuntos: "Puntos Ver." },
  { titulo: "MANTENIMIENTO", clave: "M", colPuntos: "Puntos Mant." },
];

// Seleccion del modal: { "CODIGO|CLAVE": true/false }. Se reconstruye al abrir.
let solicitudSeleccion = {};
let solicitudCandidatos = []; // [{codigo, clave}] en orden de despliegue

function marcadoPorDefectoSolicitud(clave, tipo){
  // La solicitud normalmente lleva solo calibracion interna y mantenimiento;
  // lo externo (CE) se gestiona con el proveedor y la comprobacion es interna
  // del laboratorio. Todo sigue siendo seleccionable a mano.
  if (clave === "M") return true;
  if (clave === "CAL") return tipo !== "CE";
  return false;
}

function abrirModalSolicitud(){
  const mes = document.getElementById("solicitud-mes").value;
  if (!mes) { avisar("Elige el mes de la solicitud.", "info"); return; }
  document.getElementById("sol-mes-titulo").textContent = formatMesISO(mes);
  solicitudSeleccion = {};
  solicitudCandidatos = [];
  patrones
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado))
    .forEach(p => {
      const acts = getActividades(p);
      SECCIONES_SOLICITUD.forEach(({clave}) => {
        if (acts[clave].mesVencimiento === mes) {
          solicitudCandidatos.push({ codigo: p.codigo, clave });
          solicitudSeleccion[p.codigo + "|" + clave] = marcadoPorDefectoSolicitud(clave, acts[clave].tipoCalibracion);
        }
      });
    });
  document.getElementById("sol-buscar").value = "";
  document.getElementById("sol-resultados-busqueda").innerHTML = "";
  renderListasSolicitud();
  document.getElementById("modal-solicitud").classList.add("open");
}

function cerrarModalSolicitud(){
  document.getElementById("modal-solicitud").classList.remove("open");
}

function renderListasSolicitud(){
  const cont = document.getElementById("sol-listas");
  cont.innerHTML = "";
  SECCIONES_SOLICITUD.forEach(sec => {
    const deSeccion = solicitudCandidatos.filter(c => c.clave === sec.clave);
    if (deSeccion.length === 0) return;
    const titulo = document.createElement("div");
    titulo.style.cssText = "padding:8px 14px; font-weight:700; font-size:13px; background:var(--surface-1); border-bottom:1px solid var(--border);";
    titulo.textContent = sec.titulo + " (" + deSeccion.length + ")";
    cont.appendChild(titulo);
    deSeccion.forEach(c => {
      const p = patrones.find(pp => pp.codigo === c.codigo);
      if (!p) return;
      const act = getActividades(p)[c.clave];
      const key = c.codigo + "|" + c.clave;
      const row = document.createElement("label");
      row.className = "patron-row";
      row.innerHTML = `
        <input type="checkbox" data-solkey="${escapeHTML(key)}" ${solicitudSeleccion[key] ? "checked" : ""}>
        <div style="flex:1;">
          <div class="codigo">${escapeHTML(p.codigo)}${act.tipoCalibracion ? ` <span class="badge area">${escapeHTML(act.tipoCalibracion)}</span>` : ""}</div>
          <div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}${act.mesVencimiento ? " · vence " + escapeHTML(formatMesISO(act.mesVencimiento)) : " · agregado a mano"}</div>
        </div>
      `;
      cont.appendChild(row);
    });
  });
  if (!cont.children.length) {
    cont.innerHTML = '<p class="empty-msg" style="padding:14px;">No hay actividades que venzan ese mes. Usa el buscador para añadir patrones a mano.</p>';
  }
  cont.querySelectorAll("input[data-solkey]").forEach(chk => {
    chk.addEventListener("change", (e) => {
      solicitudSeleccion[e.target.getAttribute("data-solkey")] = e.target.checked;
      actualizarContadorSolicitud();
    });
  });
  actualizarContadorSolicitud();
}

function actualizarContadorSolicitud(){
  const n = Object.values(solicitudSeleccion).filter(Boolean).length;
  document.getElementById("sol-contador").textContent = n + " seleccionado" + (n === 1 ? "" : "s");
}

function renderBusquedaSolicitud(){
  const q = document.getElementById("sol-buscar").value.trim().toLowerCase();
  const box = document.getElementById("sol-resultados-busqueda");
  box.innerHTML = "";
  if (q.length < 2) return;
  const yaListados = new Set(solicitudCandidatos.map(c => c.codigo + "|" + c.clave));
  const resultados = patrones
    .filter(p => !ESTADOS_FUERA_DE_USO.includes(p.estado) &&
      (p.codigo.toLowerCase().includes(q) || (p.categoria||"").toLowerCase().includes(q)))
    .slice(0, 6);
  resultados.forEach(p => {
    const row = document.createElement("div");
    row.className = "patron-row";
    row.style.background = "var(--surface-1)";
    const botones = SECCIONES_SOLICITUD.map(({clave}) =>
      yaListados.has(p.codigo + "|" + clave)
        ? `<span class="badge disp">${clave} ya listado</span>`
        : `<button class="btn-mini sol-add" data-codigo="${escapeHTML(p.codigo)}" data-clave="${clave}">+ ${clave}</button>`
    ).join(" ");
    row.innerHTML = `
      <div style="flex:1;"><div class="codigo">${escapeHTML(p.codigo)}</div><div class="categoria">${escapeHTML(p.area)} - ${escapeHTML(p.categoria)}</div></div>
      <span style="display:flex; gap:4px;">${botones}</span>
    `;
    box.appendChild(row);
  });
  box.querySelectorAll(".sol-add").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const codigo = e.target.getAttribute("data-codigo");
      const clave = e.target.getAttribute("data-clave");
      solicitudCandidatos.push({ codigo, clave });
      solicitudSeleccion[codigo + "|" + clave] = true;
      renderListasSolicitud();
      renderBusquedaSolicitud();
    });
  });
}

function descargarSolicitudCalibracionPDF(){
  const mes = document.getElementById("solicitud-mes").value;
  const porSeccion = SECCIONES_SOLICITUD.map(sec => {
    const codigos = solicitudCandidatos
      .filter(c => c.clave === sec.clave && solicitudSeleccion[c.codigo + "|" + c.clave]);
    const vistos = new Set();
    const lista = [];
    codigos.forEach(c => {
      if (vistos.has(c.codigo)) return;
      vistos.add(c.codigo);
      const p = patrones.find(pp => pp.codigo === c.codigo);
      if (p) lista.push(p);
    });
    return { ...sec, filas: agruparCodigosConsecutivos(lista, sec.clave), total: lista.length };
  });

  const totalItems = porSeccion.reduce((s, x) => s + x.total, 0);
  if (totalItems === 0) {
    avisar("No hay nada seleccionado para la solicitud.", "info");
    return false;
  }

  const doc = crearPDF({ unit: "mm", format: "a4" });
  const marginX = 12;
  let y = 18;

  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("SOLICITUD DE CALIBRACIÓN - " + formatMesISO(mes), marginX, y);
  y += 6;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.text("Generado: " + new Date().toLocaleString("es-PE") + "    Total de patrones: " + totalItems, marginX, y);
  y += 3;
  doc.setDrawColor(180);
  doc.line(marginX, y, 198, y);
  y += 7;

  // Columnas (x inicial) y anchos para el texto envolvente
  const colX = [marginX, marginX+32, marginX+54, marginX+76, marginX+96, marginX+134, marginX+172];
  const colW = [30, 20, 20, 18, 36, 36, 14];

  porSeccion.forEach(sec => {
    if (sec.filas.length === 0) return;
    if (y > 255) { doc.addPage(); y = 18; }

    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text(sec.titulo + " (" + sec.total + ")", marginX, y);
    y += 6;

    const encabezados = ["Equipo", "Marca", "Modelo", "Serie", "Código", sec.colPuntos, "Lugar"];
    function dibujarEncabezadoSec(){
      doc.setFontSize(8);
      doc.setFont(undefined, "bold");
      encabezados.forEach((h,i) => doc.text(h, colX[i], y));
      y += 3.5;
      doc.setDrawColor(200);
      doc.line(marginX, y, 198, y);
      y += 4;
      doc.setFont(undefined, "normal");
    }
    dibujarEncabezadoSec();

    sec.filas.forEach(f => {
      doc.setFontSize(8);
      const celdas = [f.equipo, f.marca, f.modelo, f.serie, f.codigo, f.puntos, f.lugar]
        .map((t, i) => doc.splitTextToSize(String(t), colW[i]));
      const lineas = Math.max(...celdas.map(c => c.length), 1);
      if (y + lineas*3.6 > 285) { doc.addPage(); y = 18; dibujarEncabezadoSec(); }
      celdas.forEach((c, i) => c.forEach((linea, li) => doc.text(linea, colX[i], y + li*3.6)));
      y += lineas*3.6 + 1.6;
    });
    y += 6;
  });

  doc.save("Solicitud_Calibracion_" + mes + ".pdf");
  return true;
}

function descargarActaPDF(salidaId){
  const grupos = agruparPorOT(historial);
  const grupo = grupos.find(g => g.salidaId === salidaId);
  if (!grupo) return;

  const doc = crearPDF({ unit: "mm", format: "a4" });
  const marginX = 20;
  let y = dibujarEncabezadoActa(doc, marginX);

  doc.setFontSize(11);
  doc.setFont(undefined, "normal");
  const campos = [
    ["Número de OT", grupo.numeroOT + (() => {
      // Dos actas de la misma OT tienen que poder distinguirse en papel.
      const n = numeroDeServicio(grupo.salidaId);
      return n ? `   (servicio ${n})` : "";
    })()],
    ["Empresa", grupo.empresa + (grupo.clienteRuc ? "  (RUC " + grupo.clienteRuc + ")" : "")],
    ["Sede", grupo.sede],
    ["Dirección", grupo.direccion],
    ["Contacto en sede", [grupo.contactoSede, grupo.telefonoSede].filter(Boolean).join(" · ")],
    ["Técnico responsable", grupo.tecnico],
    ["Laptop asignada", grupo.laptop],
    ["Termohigrómetro asignado", grupo.termohigrometro],
    ["Fecha de salida", formatFecha(grupo.fecha)],
    ["Hora de salida", grupo.fechaHoraSalida ? new Date(grupo.fechaHoraSalida).toLocaleTimeString("es-PE", {hour:"2-digit", minute:"2-digit", second:"2-digit"}) : "-"]
  ];
  campos.forEach(([label, valor]) => {
    // Las salidas antiguas no tienen sede ni direccion: en vez de imprimir
    // filas con guion, esas lineas simplemente no salen en el acta.
    const texto = String(valor || "").trim();
    if (!texto && ["Sede", "Dirección", "Contacto en sede"].includes(label)) return;
    doc.setFont(undefined, "bold");
    doc.text(label + ":", marginX, y);
    doc.setFont(undefined, "normal");
    // La direccion puede ser larga: la partimos para que no se salga de la hoja.
    const lineas = doc.splitTextToSize(texto || "-", 110);
    lineas.forEach((linea, i) => {
      doc.text(linea, marginX + 60, y + i * 5);
    });
    y += Math.max(7, lineas.length * 5 + 2);
  });

  if (grupo.extra && grupo.extra.trim()) {
    doc.setFont(undefined, "bold");
    doc.text("Equipos adicionales:", marginX, y);
    y += 6;
    doc.setFont(undefined, "normal");
    const lineas = doc.splitTextToSize(grupo.extra, 170);
    lineas.forEach(linea => {
      if (y > ACTA_Y_CONTENIDO_MAX) { doc.addPage(); y = 20; }
      doc.text(linea, marginX, y);
      y += 6;
    });
  }

  y += 4;
  if (y > ACTA_Y_CONTENIDO_MAX - 20) { doc.addPage(); y = 20; }
  doc.setFont(undefined, "bold");
  doc.setFontSize(12);
  doc.text("Patrones que salen a servicio", marginX, y);
  y += 8;

  doc.setFontSize(10);
  // "Cant." gastaba 23 mm para un numero de una o dos cifras; ese espacio
  // pasa a "Equipos", que es la columna que de verdad lo necesita desde que
  // las pesas llevan ahi su clase y su valor nominal.
  const colX = [marginX, marginX + 42, marginX + 54, marginX + 98];
  const colW = [40, 10, 42, 190 - (marginX + 98)];
  // Cada celda se recorta a su ancho: antes un nombre de laboratorio largo
  // (p. ej. "Equipos Auxiliares (Dim/Fza/Pre)") se montaba sobre la columna
  // de al lado en vez de cortarse. Lo recortado se marca con puntos
  // suspensivos para que no parezca que ese es el nombre completo.
  const recortar = (texto, ancho) => {
    const t = String(texto || "").trim() || "-";
    if (ancho <= 0) return "";
    const lineas = doc.splitTextToSize(t, ancho);
    if (lineas.length <= 1) return lineas[0] || "-";
    return (doc.splitTextToSize(t, Math.max(2, ancho - 2))[0] || "")
      .replace(/[\s;,.\-]+$/, "") + "...";
  };
  const celda = (texto, i) => recortar(texto, colW[i]);

  // Celda de equipos. En las pesas lleva " - valor nominal" detras del
  // nombre, y cuando no cabe todo se recorta el NOMBRE, nunca el valor:
  // perder el valor por un nombre largo seria lo contrario de lo que se
  // busca ("Pesas F1 de 5 kg; 10 kg; 20... - 5 kg").
  const celdaEquipos = (fila) => {
    const valor = valorNominalParaActa(fila);
    const categoria = String((fila && fila.categoria) || "").trim();
    if (!valor) return recortar(categoria, colW[3]);
    const sufijo = " - " + valor;
    return recortar(categoria, colW[3] - doc.getTextWidth(sufijo)) + sufijo;
  };

  doc.setFont(undefined, "bold");
  doc.text("Código único", colX[0], y);
  doc.text("Cant.", colX[1], y);
  doc.text("Laboratorio", colX[2], y);
  doc.text("Equipos", colX[3], y);
  y += 5;
  doc.setDrawColor(210);
  doc.line(marginX, y, 190, y);
  y += 5;

  doc.setFont(undefined, "normal");
  // Los patrones anulados se retiraron de la orden en una correccion: nunca
  // salieron del laboratorio. No aparecen en el acta de ninguna forma, ni en
  // la tabla ni en un apartado aparte: el acta dice lo que SALE, y el rastro
  // de que entro y que se quito vive en el historial, con su motivo, su
  // autor y su fecha.
  const patronesVigentes = grupo.patrones.filter(p => p.estadoMovimiento !== "Anulado");

  let totalPiezas = 0;
  patronesVigentes.forEach(p => {
    if (y > ACTA_Y_CONTENIDO_MAX) { doc.addPage(); y = 20; }
    const n = p.cantidad || 1;
    totalPiezas += n;
    doc.text(celda(p.codigo, 0), colX[0], y);
    doc.text(String(n), colX[1], y);
    doc.text(celda(p.area, 2), colX[2], y);
    doc.text(celdaEquipos(p), colX[3], y);
    y += 6;
  });

  // Total de piezas: con grupos, el numero de filas ya no es el numero de
  // equipos que sale del laboratorio, y es el dato que se cuenta al cargar.
  if (totalPiezas !== patronesVigentes.length) {
    if (y > ACTA_Y_CONTENIDO_MAX) { doc.addPage(); y = 20; }
    doc.setFont(undefined, "bold");
    doc.text(`Total de piezas que salen: ${totalPiezas}`, colX[0], y + 1);
    doc.setFont(undefined, "normal");
    y += 7;
  }

  // Las observaciones (las de la OT y las de cada patron) NO salen en el
  // acta: son la bitacora interna del laboratorio y se consultan en el
  // historial, que es donde se escriben y donde queda su rastro completo
  // con autor y fecha. El acta es el documento que viaja con los patrones y
  // se queda en una lista de que sale, quien lo lleva y quien responde.

  // Las firmas van SIEMPRE al pie de la hoja, no pegadas a donde acabo el
  // contenido: es un documento que se firma a mano y el hueco tiene que
  // quedar en el mismo sitio en todas las actas. Si el contenido llega
  // demasiado abajo, se pasan a una hoja nueva en vez de apretarlas.
  if (y > ACTA_Y_FIRMAS - 12) { doc.addPage(); }
  dibujarFirmasActa(doc, marginX, grupo);

  // El pie va en TODAS las hojas y se pinta al final, cuando ya se sabe
  // cuantas hay (hace falta para el "Página X de Y").
  dibujarPieFormato(doc, { codigo: "FO-LAB-6-5", version: "01" }, marginX);

  doc.save(nombreArchivoActa(grupo));
}

// ------------------------------------------------------------
// Nombre del PDF: "OT-<numero>-<EMPRESA>-<TECNICO>.pdf"
//
// Windows no admite \ / : * ? " < > | ni punto o espacio al final, y el
// navegador cambia por su cuenta lo que no le gusta: se limpia aqui para
// que el archivo llegue con el nombre que se espera.
// ------------------------------------------------------------
function trozoNombreArchivo(texto, maxLargo){
  // Los puntos internos se conservan tal cual ("S.A.", "S.A.C."): la unica
  // regla de Windows sobre puntos afecta al final del nombre, y el nombre
  // siempre acaba en ".pdf".
  return String(texto || "")
    .replace(/[\\/:*?"<>|]/g, " ")      // prohibidos en Windows
    .replace(/[\x00-\x1f]/g, " ")       // caracteres de control
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLargo)
    .replace(/^[-\s]+|[-\s]+$/g, "")    // sin guiones ni espacios sueltos en los bordes
    .trim();
}

function nombreArchivoActa(grupo){
  // En el historial hay OT escritas ya con "OT" delante ("OT - 02602453"):
  // se quita para no repetir el prefijo en el nombre del archivo.
  const numero = trozoNombreArchivo(
    String(grupo.numeroOT || "").replace(/^\s*O\.?\s*T\.?\s*[-–—:]?\s*/i, ""),
    40
  );
  const partes = [
    "OT-" + (numero || "SIN-NUMERO"),
    trozoNombreArchivo(grupo.empresa, 60),
    trozoNombreArchivo(grupo.tecnico, 40)
  ].filter(Boolean);
  // Varios servicios de la misma OT darian el MISMO nombre de archivo y el
  // segundo PDF se descargaria como "(1)" o pisaria al primero. El numero de
  // servicio los separa; cuando la OT tiene una sola salida no se añade nada.
  const n = numeroDeServicio(grupo.salidaId);
  return partes.join("-") + (n ? "-servicio" + n : "") + ".pdf";
}

// ------------------------------------------------------------
// Pie de pagina de un formato controlado y bloque de firmas.
//
// Las medidas son fijas y compartidas: el contenido del acta no puede
// bajar de ACTA_Y_CONTENIDO_MAX, y por debajo quedan reservadas las
// firmas y el pie.
// ------------------------------------------------------------
// Titulo y logo del encabezado. El logo de fabrica va incrustado en el
// propio archivo (PNG en base64) para que el PDF salga igual en un equipo
// sin internet, que es la condicion de toda la app. El usuario puede
// sustituirlo desde "Logo del encabezado": el suyo se guarda en el store
// 'config' y viaja en los respaldos, y este queda siempre como respaldo.
const TITULO_ACTA = "Lista de equipos para servicio a campo";
const LOGO_ANCHO_MM = 45;
// Tope de altura: un logo cuadrado o vertical no puede empujar el
// contenido del acta hacia abajo, asi que se reduce el ancho en su lugar.
const LOGO_ALTO_MAX_MM = 20;
const LOGO_CONFIG_KEY = "logo_encabezado";
const LOGO_PROPORCION = 600 / 123;   // del PNG incrustado, 600 x 123 px
const LOGO_INCRUSTADO = "data:image/png;base64,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";

// Logo de fabrica: es el que se usa mientras no haya uno propio guardado.
const LOGO_POR_DEFECTO = Object.freeze({
  dataUrl: LOGO_INCRUSTADO,
  proporcion: LOGO_PROPORCION,
  formato: "PNG",
  nombre: "Logo incrustado en la app",
  propio: false
});

// Logo que se usa al generar los PDF. Se reemplaza al arrancar si hay uno
// guardado, y al cambiarlo o restaurarlo desde el modal.
let logoEncabezado = LOGO_POR_DEFECTO;

// Medidas con las que se dibuja: se respeta el ancho salvo que el alto se
// pase del tope, en cuyo caso manda el alto (logos cuadrados o verticales).
function medidasLogo(logo){
  let ancho = LOGO_ANCHO_MM;
  let alto = ancho / (logo.proporcion || 1);
  if (alto > LOGO_ALTO_MAX_MM) {
    alto = LOGO_ALTO_MAX_MM;
    ancho = alto * (logo.proporcion || 1);
  }
  return { ancho, alto };
}

async function cargarLogoGuardado(){
  try {
    const guardado = await getConfig(LOGO_CONFIG_KEY);
    if (guardado && guardado.dataUrl && guardado.proporcion > 0) {
      logoEncabezado = { ...guardado, propio: true };
    }
  } catch (e) {
    // Si el logo guardado no se puede leer, el acta sale con el de fabrica:
    // nunca es motivo para que la app no arranque.
    console.warn("No se pudo leer el logo guardado:", e);
  }
}

// ------------------------------------------------------------
// Cambio del logo por el usuario.
//
// La imagen se guarda DENTRO de la base (y por tanto dentro de cada
// respaldo), asi que antes se reduce: un logo de camara de 4 MB haria
// pesados todos los respaldos sin verse mejor en una hoja A4.
// ------------------------------------------------------------
const LOGO_MAX_PX = 900;              // ancho maximo que se guarda
const LOGO_MAX_BYTES = 400 * 1024;    // a partir de aqui se aplana a JPEG

function leerArchivoComoDataURL(file){
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error || new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(file);
  });
}

function cargarImagen(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El archivo no es una imagen que el navegador pueda abrir."));
    img.src = dataUrl;
  });
}

// Tamaño real en bytes de un data URI (la parte base64 son 4 caracteres
// por cada 3 bytes; los '=' finales no cuentan).
function bytesDeDataURL(dataUrl){
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const relleno = (base64.match(/=+$/) || [""])[0].length;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - relleno);
}

function dibujarEnLienzo(img, ancho, alto, fondoBlanco){
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (fondoBlanco) {
    // El JPEG no tiene transparencia: sin este relleno, lo transparente
    // saldria negro en el PDF.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, ancho, alto);
  }
  ctx.drawImage(img, 0, 0, ancho, alto);
  return lienzo;
}

async function prepararLogo(file){
  if (!file.type || !/^image\/(png|jpeg|jpg|webp|gif|bmp)$/i.test(file.type)) {
    throw new Error("Elige una imagen PNG, JPG o WEBP.");
  }
  const original = await leerArchivoComoDataURL(file);
  const img = await cargarImagen(original);
  if (!img.naturalWidth || !img.naturalHeight) throw new Error("La imagen no tiene dimensiones válidas.");

  const proporcion = img.naturalWidth / img.naturalHeight;
  const escala = Math.min(1, LOGO_MAX_PX / img.naturalWidth);
  const ancho = Math.max(1, Math.round(img.naturalWidth * escala));
  const alto = Math.max(1, Math.round(img.naturalHeight * escala));

  // PNG conserva la transparencia, que es lo que casi siempre quiere un
  // logo sobre la hoja blanca. Solo se cambia a JPEG si sale demasiado
  // pesado para meterlo en todos los respaldos.
  let dataUrl = dibujarEnLienzo(img, ancho, alto, false).toDataURL("image/png");
  let formato = "PNG";
  let aplanado = false;
  if (bytesDeDataURL(dataUrl) > LOGO_MAX_BYTES) {
    dataUrl = dibujarEnLienzo(img, ancho, alto, true).toDataURL("image/jpeg", 0.9);
    formato = "JPEG";
    aplanado = true;
  }

  return {
    logo: {
      dataUrl, proporcion, formato,
      nombre: file.name || "logo",
      anchoPx: ancho, altoPx: alto,
      actualizadoEn: new Date().toISOString(),
      propio: true
    },
    aplanado,
    bytes: bytesDeDataURL(dataUrl)
  };
}

async function guardarLogo(logo){
  await setConfig(LOGO_CONFIG_KEY, logo);
  logoEncabezado = logo ? { ...logo, propio: true } : LOGO_POR_DEFECTO;
  // setConfig no dispara el espejo (el store 'config' esta excluido a
  // proposito), pero el logo si tiene que llegar al archivo de disco.
  programarEspejo();
}

async function restaurarLogoPorDefecto(){
  await setConfig(LOGO_CONFIG_KEY, null);
  logoEncabezado = LOGO_POR_DEFECTO;
  programarEspejo();
}

// ------------------------------------------------------------
// Modal "Logo del encabezado"
// ------------------------------------------------------------
function pintarVistaLogo(){
  const img = document.getElementById("logo-preview");
  const info = document.getElementById("logo-info");
  if (!img || !info) return;
  img.src = logoEncabezado.dataUrl;
  const { ancho, alto } = medidasLogo(logoEncabezado);
  const partes = [
    logoEncabezado.propio ? "Logo propio" : "Logo original de la app",
    `sale a ${ancho.toFixed(1)} × ${alto.toFixed(1)} mm en el PDF`
  ];
  if (logoEncabezado.propio) {
    if (logoEncabezado.nombre) partes.push(logoEncabezado.nombre);
    const kb = Math.round(bytesDeDataURL(logoEncabezado.dataUrl) / 1024);
    if (kb) partes.push(kb + " KB");
  }
  info.textContent = partes.join(" · ");
  const btnRestaurar = document.getElementById("logo-restaurar");
  if (btnRestaurar) btnRestaurar.disabled = !logoEncabezado.propio;
}

function abrirModalLogo(){
  pintarVistaLogo();
  document.getElementById("modal-logo").classList.add("open");
}

function cerrarModalLogo(){
  document.getElementById("modal-logo").classList.remove("open");
}

async function cambiarLogoDesdeArchivo(file){
  try {
    const { logo, aplanado, bytes } = await prepararLogo(file);
    await guardarLogo(logo);
    pintarVistaLogo();
    avisar(
      aplanado
        ? `Logo actualizado (${Math.round(bytes/1024)} KB). La imagen era pesada, así que se guardó en JPEG sobre fondo blanco: ` +
          `si el logo tenía fondo transparente, usa una imagen más simple para conservarlo.`
        : `Logo actualizado. Se usará en los PDF que generes a partir de ahora.`,
      aplanado ? "info" : "ok"
    );
  } catch (e) {
    avisar(e.message || "No se pudo usar esa imagen como logo.", "error");
  }
}

const ACTA_Y_FIRMAS = 258;          // linea de firma
const ACTA_Y_PIE = 286;             // texto del pie
// Ultima linea util del contenido: el texto puede llegar hasta justo
// encima del pie. El hueco de las firmas NO se reserva en cada hoja (seria
// gastar papel en las intermedias): al terminar, si no caben debajo del
// contenido, se pasan a una hoja nueva.
const ACTA_Y_CONTENIDO_MAX = 272;

// Encabezado: logo a la izquierda y titulo a su derecha. Devuelve la Y en
// la que puede empezar el contenido. Va solo en la primera hoja; lo que se
// repite en todas es el pie con el codigo de formato.
function dibujarEncabezadoActa(doc, marginX){
  const yTop = 12;
  let xTitulo = marginX;
  let alto = 0;

  const logo = logoEncabezado || LOGO_POR_DEFECTO;
  if (logo && logo.dataUrl) {
    const medidas = medidasLogo(logo);
    alto = medidas.alto;
    try {
      doc.addImage(logo.dataUrl, logo.formato || "PNG", marginX, yTop, medidas.ancho, medidas.alto);
      xTitulo = marginX + medidas.ancho + 7;
    } catch (e) {
      // Si el logo fallara (imagen corrupta, formato raro), el acta sale
      // igual: solo con el titulo. Nunca se queda sin generar el PDF.
      console.warn("No se pudo dibujar el logo del encabezado:", e);
      alto = 0;
      xTitulo = marginX;
    }
  }

  doc.setFont(undefined, "bold");
  ajustarFuenteParaAncho(doc, TITULO_ACTA, 190 - xTitulo, 14, 9);
  // El titulo se centra con el logo si hay logo; si no, va arriba solo.
  doc.text(TITULO_ACTA, xTitulo, alto ? yTop + alto / 2 : yTop + 4, { baseline: "middle" });

  const yLinea = yTop + Math.max(alto, 8) + 6;
  doc.setDrawColor(210);
  doc.setLineWidth(0.2);
  doc.line(marginX, yLinea, 190, yLinea);
  return yLinea + 8;
}

// Bloque de responsables del acta. Ya NO lleva linea de firma: en su lugar
// van el cargo y, debajo, el nombre de quien responde por cada parte. Como
// no hay una linea que repartir, una OT que cruza laboratorios puede
// nombrar a sus dos encargados sin que el formato se rompa.
function dibujarFirmasActa(doc, marginX, grupo){
  const anchoUtil = 190 - marginX;
  const anchoCol = (anchoUtil - 20) / 2;
  const x2 = marginX + anchoCol + 20;

  const columnas = [
    { x: marginX, cargo: "Técnico encargado",      nombre: String((grupo && grupo.tecnico) || "").trim() },
    { x: x2,      cargo: "Encargado de Laboratorio", nombre: String((grupo && grupo.encargadoLaboratorio) || "").trim() }
  ];

  columnas.forEach(({ x, cargo, nombre }) => {
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text(cargo, x, ACTA_Y_FIRMAS);

    doc.setFont(undefined, "normal");
    doc.setFontSize(10);
    // Un nombre largo, o dos encargados, se parten en varias lineas en vez
    // de invadir la columna de al lado.
    const lineas = nombre
      ? doc.splitTextToSize(nombre, anchoCol)
      : ["No asignado"];
    if (!nombre) doc.setTextColor(130, 130, 130);
    lineas.slice(0, 3).forEach((linea, i) => {
      doc.text(linea, x, ACTA_Y_FIRMAS + 6 + i * 5);
    });
    doc.setTextColor(0, 0, 0);
  });
  doc.setFontSize(9);
}

function dibujarPieFormato(doc, { codigo, version }, marginX){
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(marginX, ACTA_Y_PIE - 5, 190, ACTA_Y_PIE - 5);
    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(`Página ${i} de ${total}`, marginX, ACTA_Y_PIE);
    // Codigo de formato y version, alineados a la derecha de la hoja.
    doc.text(`${codigo}          Versión: ${version}`, 190, ACTA_Y_PIE, { align: "right" });
  }
}

