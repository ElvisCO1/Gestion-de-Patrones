/* Creación inicial, segura y reversible de grupos de pesas PEM2. */
(function (global) {
  "use strict";

  const RANGES = [[1, 20], [21, 40], [41, 60], [61, 80], [81, 100],
    [101, 125], [126, 150], [151, 175], [176, 200]];

  function create({ getPatterns, isGroupPattern, emptyActivity, saveMany, deleteMany,
    onChanged, storageKey }) {
    let recentlyCreated = [];
    const mode = values => {
      const counts = {};
      values.filter(value => String(value || "").trim()).forEach(value => {
        counts[value] = (counts[value] || 0) + 1;
      });
      return Object.keys(counts).sort((first, second) => counts[second] - counts[first])[0] || "";
    };
    const weightNumber = code => {
      const match = /^PTB-PEM2-0*(\d+)/i.exec(String(code || "").trim());
      return match ? parseInt(match[1], 10) : null;
    };
    const groupCode = (from, to) => `PTB-PEM2-${String(from).padStart(2, "0")}-${String(to).padStart(2, "0")}`;
    const readFlag = () => { try { return localStorage.getItem(storageKey); } catch (_) { return null; } };
    const writeFlag = () => { try { localStorage.setItem(storageKey, "1"); } catch (_) { /* optional marker */ } };

    function rangeData(from, to) {
      const patterns = getPatterns();
      const inRange = patterns.filter(pattern => {
        const number = weightNumber(pattern.codigo);
        return !isGroupPattern(pattern) && number !== null && number >= from && number <= to;
      });
      const value = mode(inRange.map(pattern => String(pattern.valorNominal || "").trim())) || "20 kg";
      const sameValue = patterns.filter(pattern => !isGroupPattern(pattern) && weightNumber(pattern.codigo) !== null && String(pattern.valorNominal || "").trim() === value);
      return {
        valor: value,
        categoria: mode(sameValue.map(pattern => pattern.categoria)) || mode(inRange.map(pattern => pattern.categoria)) || "Pesas M2 de 20 kg",
        area: mode(inRange.map(pattern => pattern.area)) || "Masa",
        marca: mode(inRange.map(pattern => pattern.marca)),
        lugarUso: mode(inRange.map(pattern => pattern.lugarUso)) || "Campo"
      };
    }

    async function createInitial() {
      if (readFlag()) return 0;
      const patterns = getPatterns();
      if (!patterns.some(pattern => !isGroupPattern(pattern) && weightNumber(pattern.codigo) !== null)) return 0;
      const groups = RANGES.map(([from, to]) => ({ from, to, codigo: groupCode(from, to) }))
        .filter(group => !patterns.some(pattern => String(pattern.codigo).toUpperCase() === group.codigo))
        .map(group => ({ ...group, data: rangeData(group.from, group.to) }));
      if (!groups.length) { writeFlag(); return 0; }
      await saveMany(groups.map(group => ({
        codigo: group.codigo, area: group.data.area, categoria: group.data.categoria,
        estado: "Disponible", marca: group.data.marca, valorNominal: group.data.valor,
        observacion: `Grupo de pesas ${group.from} a ${group.to} (${group.data.valor}).`,
        modelo: "", serie: "", lugarUso: group.data.lugarUso, esGrupo: true,
        unidades: group.to - group.from + 1, rangoDesde: group.from, rangoHasta: group.to,
        actividades: { CAL: emptyActivity(), V: emptyActivity(), M: emptyActivity() }
      })));
      writeFlag();
      recentlyCreated = groups.map(group => group.codigo);
      return groups.length;
    }

    async function undoInitial() {
      if (!recentlyCreated.length) return false;
      await deleteMany(recentlyCreated);
      recentlyCreated = [];
      await onChanged();
      return true;
    }

    return Object.freeze({ createInitial, undoInitial });
  }

  global.Metrologia.services.initialWeightGroups = Object.freeze({ create });
})(window);
