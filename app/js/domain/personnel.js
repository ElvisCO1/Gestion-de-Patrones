/* Reglas de personal, responsables de laboratorio y actas de pesas. */
(function (global) {
  "use strict";

  const TECHNICIAN_ROLE = "tecnico";
  const SUPERVISOR_ROLE = "supervisor";

  function create({ getTechnicians, getPatterns, normalizeArea }) {
    function roleOf(person) {
      return person?.rol === SUPERVISOR_ROLE ? SUPERVISOR_ROLE : TECHNICIAN_ROLE;
    }
    function isSupervisor(person) { return roleOf(person) === SUPERVISOR_ROLE; }
    function isTechnician(person) { return roleOf(person) === TECHNICIAN_ROLE; }
    function roleName(role) { return role === SUPERVISOR_ROLE ? "Encargado de laboratorio" : "Técnico"; }
    function laboratoriesOf(person) {
      return Array.isArray(person?.laboratorios) ? person.laboratorios.filter(Boolean) : [];
    }
    function activeTechnicians() {
      return getTechnicians().filter(person => person.activo !== false && isTechnician(person));
    }
    function activeSupervisors() {
      return getTechnicians().filter(person => person.activo !== false && isSupervisor(person));
    }
    function supervisorsForLaboratory(area) {
      const areaKey = normalizeArea(area);
      if (!areaKey) return [];
      return activeSupervisors()
        .filter(person => laboratoriesOf(person).some(lab => normalizeArea(lab) === areaKey))
        .map(person => person.nombre)
        .sort((first, second) => first.localeCompare(second, "es"));
    }
    function supervisorsForLaboratories(areas) {
      const seen = new Set();
      const names = [];
      (areas || []).forEach(area => supervisorsForLaboratory(area).forEach(name => {
        if (!seen.has(name)) { seen.add(name); names.push(name); }
      }));
      return names.sort((first, second) => first.localeCompare(second, "es"));
    }
    function isWeightCategory(category) {
      const normalized = String(category || "").normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      return /^pesas?\b/.test(normalized) || /^juegos? de pesas?\b/.test(normalized);
    }
    function nominalValueForCertificate(row) {
      if (!row || !isWeightCategory(row.categoria)) return "";
      const stored = String(row.valorNominal || "").trim();
      if (stored) return stored;
      const pattern = getPatterns().find(item => item.codigo === row.codigo);
      return pattern ? String(pattern.valorNominal || pattern.valor || "").trim() : "";
    }
    function certificateEquipmentText(row) {
      const category = String(row?.categoria || "").trim();
      const nominalValue = nominalValueForCertificate(row);
      return nominalValue ? `${category} - ${nominalValue}` : category;
    }
    return Object.freeze({ roleOf, isSupervisor, isTechnician, roleName, laboratoriesOf,
      activeTechnicians, activeSupervisors, supervisorsForLaboratory,
      supervisorsForLaboratories, isWeightCategory, nominalValueForCertificate,
      certificateEquipmentText });
  }

  global.Metrologia.modules.personnel = Object.freeze({ TECHNICIAN_ROLE, SUPERVISOR_ROLE, create });
})(window);
