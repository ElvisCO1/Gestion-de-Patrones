/* Estado visual del modal de registro de calibracion. */
(function (global) {
  'use strict';
  const namespace = global.Metrologia = global.Metrologia || {};
  namespace.modules = namespace.modules || {};

  function updatePreview(context) {
    const { document, addMonths, formatMonth } = context;
    const date = document.getElementById('modal-cal-fecha').value;
    const rawInterval = document.getElementById('modal-cal-intervalo').value;
    const interval = rawInterval ? parseInt(rawInterval, 10) : NaN;
    const preview = document.getElementById('modal-cal-preview');
    if (!date || !Number.isInteger(interval) || interval < 1) { preview.textContent = '-'; return; }
    preview.textContent = formatMonth(addMonths(date.slice(0, 7), interval));
  }

  function loadActivity(context, code) {
    const { document, patterns, getActivities, activityTypes, updatePreview } = context;
    const pattern = patterns.find((item) => item.codigo === code);
    if (!pattern) return;
    const key = document.getElementById('modal-cal-actividad').value;
    const activity = getActivities(pattern)[key];
    document.getElementById('modal-cal-intervalo').value = activity.frecuenciaMeses || 12;
    document.getElementById('modal-cal-documento').value = '';
    document.getElementById('modal-cal-tipo').innerHTML = activityTypes[key]
      .map(([value, text]) => `<option value="${value}"${(activity.tipoCalibracion || '') === value ? ' selected' : ''}>${text}</option>`).join('');
    updatePreview();
  }

  function open(context, code, initialKey) {
    const { document, patterns, today, loadActivity, setTargetCode } = context;
    if (!patterns.some((item) => item.codigo === code)) return false;
    setTargetCode(code);
    document.getElementById('modal-cal-codigo').textContent = code;
    document.getElementById('modal-cal-actividad').value = initialKey;
    document.getElementById('modal-cal-fecha').value = today();
    document.getElementById('modal-cal-error').style.display = 'none';
    loadActivity();
    document.getElementById('modal-calibracion').classList.add('open');
    return true;
  }

  namespace.modules.calibrationModal = Object.freeze({ updatePreview, loadActivity, open });
})(window);
