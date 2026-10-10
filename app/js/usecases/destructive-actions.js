/* Borrados totales confirmados, siempre en transacciones atómicas. */
(function (global) {
  "use strict";

  async function deleteAll(context, valor, tipo) {
    const {
      historial, STORES, tecnicos, patrones, actividadesEjecutadas,
      movimientoCerrado, runAtomicTransaction, cerrarModalEliminarTotal,
      render, avisar, restaurarRegistros, seleccionados
    } = context;
    if (!valor) return;
    if (tipo === "tecnico") {
      const registrosABorrar = historial.filter(h => h.tecnico === valor);
      const operaciones = registrosABorrar.map(reg => ({ store: STORES.historial, action: "delete", key: reg.id }));
      operaciones.push({ store: STORES.tecnicos, action: "delete", key: valor });
      const codigosAfectados = new Set(registrosABorrar.filter(reg => !movimientoCerrado(reg)).map(reg => reg.codigo));
      for (const codigo of codigosAfectados) {
        const p = patrones.find(pp => pp.codigo === codigo);
        if (p && p.estado === "En servicio") {
          operaciones.push({ store: STORES.patrones, action: "put", item: { ...p, estado: "Disponible" } });
        }
      }
      const tecnicoBorrado = tecnicos.find(t => t.nombre === valor);
      await runAtomicTransaction([STORES.historial, STORES.tecnicos, STORES.patrones], operaciones);
      cerrarModalEliminarTotal();
      await render();
      const avisoPatrones = codigosAfectados.size ? ` Se liberaron ${codigosAfectados.size} patrón(es) que estaban en servicio por este técnico.` : "";
      avisar(`Técnico ${valor} y su historial fueron eliminados.${avisoPatrones}`, "ok", {
        etiqueta: "Deshacer",
        ejecutar: async () => {
          const ops = registrosABorrar.map(h => ({ store: STORES.historial, action: "put", item: h }));
          if (tecnicoBorrado) ops.push({ store: STORES.tecnicos, action: "put", item: tecnicoBorrado });
          await runAtomicTransaction([STORES.historial, STORES.tecnicos], ops);
          await render(); avisar(`Se restauró al técnico ${valor} y su historial.`, "ok");
        }
      });
      return;
    }
    const registrosABorrar = historial.filter(h => h.codigo === valor);
    const actsBorradas = actividadesEjecutadas.filter(a => a.codigoPatron === valor);
    const operaciones = registrosABorrar.map(reg => ({ store: STORES.historial, action: "delete", key: reg.id }));
    actsBorradas.forEach(a => operaciones.push({ store: STORES.actividades, action: "delete", key: a.id }));
    operaciones.push({ store: STORES.patrones, action: "delete", key: valor });
    const patronBorrado = patrones.find(p => p.codigo === valor);
    await runAtomicTransaction([STORES.historial, STORES.patrones, STORES.actividades], operaciones);
    delete seleccionados[valor];
    cerrarModalEliminarTotal();
    await render();
    avisar(`Patrón ${valor} y su historial fueron eliminados.`, "ok", {
      etiqueta: "Deshacer",
      ejecutar: () => restaurarRegistros(patronBorrado ? [patronBorrado] : [], registrosABorrar, actsBorradas)
    });
  }

  async function deletePatternWithoutHistory(context, pattern, activities) {
    const { STORES, runAtomicTransaction, seleccionados, seleccionEtiquetas } = context;
    await runAtomicTransaction([STORES.patrones, STORES.actividades], [
      { store: STORES.patrones, action: "delete", key: pattern.codigo },
      ...activities.map(a => ({ store: STORES.actividades, action: "delete", key: a.id }))
    ]);
    delete seleccionados[pattern.codigo];
    delete seleccionEtiquetas[pattern.codigo];
  }

  async function markPatternRemoved(context, pattern) {
    const { STORES, saveRecord, seleccionados, seleccionEtiquetas } = context;
    await saveRecord(STORES.patrones, { ...pattern, estado: "Eliminado" });
    delete seleccionados[pattern.codigo];
    delete seleccionEtiquetas[pattern.codigo];
  }

  global.Metrologia.services.destructiveActions = Object.freeze({
    deleteAll, deletePatternWithoutHistory, markPatternRemoved
  });
})(window);
