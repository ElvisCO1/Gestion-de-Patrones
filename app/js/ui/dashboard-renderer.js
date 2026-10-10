/* Renderizador del panel Inicio; recibe datos y acciones explícitamente. */
(function (global) {
  "use strict";

  const activity = global.Metrologia.modules.activity;
  const inventory = global.Metrologia.modules.inventory;

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function render({ patrones, historial, escapeHTML, openActivity }) {
    const panel = document.getElementById("panel-inicio");
    if (!panel) return;
    const active = (patrones || []).filter(patron => !inventory.ESTADOS_FUERA_DE_USO.includes(patron.estado));
    const overdue = active.filter(activity.patronBloqueadoPorCalibracion);
    const dueSoon = active.filter(patron => activity.estadoCalibracion(patron) === "por_vencer");
    const inService = (patrones || []).filter(patron => patron.estado === "En servicio");
    const available = active.filter(patron => patron.estado === "Disponible" && !activity.patronBloqueadoPorCalibracion(patron));
    setText("stat-vencidos", overdue.length);
    setText("stat-porvencer", dueSoon.length);
    setText("stat-enservicio", inService.length);
    setText("stat-disponibles", available.length);

    const renderActivityRows = (sectionId, listId, items, selector) => {
      const section = document.getElementById(sectionId);
      const list = document.getElementById(listId);
      if (!section || !list) return;
      list.innerHTML = "";
      section.style.display = items.length ? "block" : "none";
      items.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(patron => selector(patron).forEach(({ clave, subtitle, badge, badgeClass }) => {
        const row = document.createElement("div");
        row.className = "patron-row";
        row.innerHTML = `<div style="flex:1;"><div class="codigo">${escapeHTML(patron.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(patron.categoria)}</span></div><div class="categoria">${escapeHTML(patron.area)} · ${escapeHTML(subtitle)}</div></div><span class="badge ${badgeClass}">${escapeHTML(badge)}</span><button class="btn-mini btn-inicio-registrar" data-codigo="${escapeHTML(patron.codigo)}" data-clave="${escapeHTML(clave)}">Registrar actividad</button>`;
        list.appendChild(row);
      }));
    };

    renderActivityRows("sec-vencidos", "lista-inicio-vencidos", overdue, patron => activity.actividadesVencidas(patron).map(item => ({
      clave: item.clave, subtitle: `${item.nombre} vencio en ${activity.formatMesISO(item.mesVencimiento)}`,
      badge: `${item.clave} vencida`, badgeClass: "vencido"
    })));
    renderActivityRows("sec-porvencer", "lista-inicio-porvencer", dueSoon, patron => {
      const activities = activity.getActividades(patron);
      return activity.ACTIVIDADES_ISO.filter(({ clave }) => activity.estadoActividad(activities[clave]) === "por_vencer")
        .map(({ clave, nombre }) => ({
          clave, subtitle: `${nombre} vence este mes (${activity.formatMesISO(activities[clave].mesVencimiento)})`,
          badge: clave, badgeClass: "porvencer"
        }));
    });

    const serviceSection = document.getElementById("sec-enservicio");
    const serviceList = document.getElementById("lista-inicio-enservicio");
    if (serviceSection && serviceList) {
      serviceList.innerHTML = "";
      serviceSection.style.display = inService.length ? "block" : "none";
      inService.slice().sort((a, b) => a.codigo.localeCompare(b.codigo)).forEach(patron => {
        const dispatch = inventory.salidaActivaDe(patron.codigo, historial);
        const days = dispatch ? inventory.diasDesde(dispatch.fechaHoraSalida || dispatch.fecha) : null;
        const daysText = days === null ? "" : days === 0 ? "salió hoy" : `fuera hace ${days} día${days === 1 ? "" : "s"}`;
        const detail = dispatch ? `OT ${escapeHTML(dispatch.numeroOT)} · ${escapeHTML(dispatch.empresa)} · ${escapeHTML(dispatch.tecnico)}${daysText ? " · " + daysText : ""}` : "Sin registro de salida en el historial (revisar)";
        const row = document.createElement("div");
        row.className = "patron-row";
        row.innerHTML = `<div style="flex:1;"><div class="codigo">${escapeHTML(patron.codigo)} <span style="font-weight:400; color:var(--text-secondary);">- ${escapeHTML(patron.categoria)}</span></div><div class="categoria">${detail}</div></div>${days !== null && days > 30 ? '<span class="badge porvencer" title="Más de 30 días fuera del laboratorio">+30 días</span>' : ""}<span class="badge serv">En servicio</span>`;
        serviceList.appendChild(row);
      });
    }

    const allOk = document.getElementById("inicio-todo-ok");
    if (allOk) allOk.style.display = overdue.length || dueSoon.length || inService.length ? "none" : "block";
    panel.querySelectorAll(".btn-inicio-registrar").forEach(button => button.addEventListener("click", event => openActivity(event.target.getAttribute("data-codigo"), event.target.getAttribute("data-clave"))));
  }

  global.Metrologia.modules.dashboardRenderer = Object.freeze({ render });
})(window);
