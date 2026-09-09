/* A text-based plate stays readable and preserves the actual vehicle number. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.conceptVehiclePlate = value => {
    const text = String(value ?? '').trim().toLocaleUpperCase('ru-RU');
    const match = text.replace(/[\s-]+/g, '').match(/^([АВЕКМНОРСТУХABEKMHOPCTYX])(\d{3})([АВЕКМНОРСТУХABEKMHOPCTYX]{2})(\d{2,3})$/u);
    if (!match) return `<span class="vehicle-plate-fallback">${escape(text || 'Номер не указан')}</span>`;
    const [, prefix, digits, suffix, region] = match;
    const label = `Государственный номер ${prefix} ${digits} ${suffix}, регион ${region}, Россия`;
    return `<span class="vehicle-plate" role="img" aria-label="${escape(label)}"><span class="vehicle-plate-main" aria-hidden="true"><span class="vehicle-plate-letter">${prefix}</span><span class="vehicle-plate-digits">${digits}</span><span class="vehicle-plate-letter">${suffix}</span></span><span class="vehicle-plate-region" aria-hidden="true"><span class="vehicle-plate-region-number">${region}</span><span class="vehicle-plate-country"><span>RUS</span><span class="vehicle-plate-flag"></span></span></span></span>`;
  };
  document.querySelectorAll('[data-vehicle-plate]').forEach(el => {
    el.innerHTML = window.conceptVehiclePlate(el.dataset.vehiclePlate);
  });
})();
