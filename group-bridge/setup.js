const key = location.hash.slice(1) || sessionStorage.getItem('setup-key') || '';
if (key) sessionStorage.setItem('setup-key', key);
history.replaceState(null, '', '/');
const labels = { connecting: 'Подключение…', connected: 'Подключено', scan_qr: 'Ожидает подтверждения QR-кода', reconnecting: 'Повторное подключение…', group_missing: 'Нужная группа не найдена однозначно', logged_out: 'WhatsApp отключён — требуется повторная привязка', not_paired: 'Введите код из панели администратора', pair_again: 'Подключение отозвано — нужен новый код', retrying: 'Сервис временно недоступен. Повторяем автоматически.', group_not_allowed: 'Нужно проверить выбранные группы', password_required: 'MAX запрашивает пароль входа', queue_full: 'Очередь заполнена', group_lookup_error: 'Не удалось получить список групп', start_error: 'Не удалось запустить подключение', storage_error: 'Не удалось сохранить вход' };
labels.server_update_required = 'Ожидает публикации серверной части. Отправка в боты пока не включена';
let refreshTimer, refreshing = false, submitting = false, failures = 0, expired = false;
async function call(path, body) {
  const response = await fetch(path, { signal: AbortSignal.timeout(10_000), method: body ? 'POST' : 'GET', headers: { 'X-Setup-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) { let data; try { data = await response.json(); } catch {} if (response.status === 401) expired = true; throw new Error(data?.error === 'REQUEST_PAUSED' ? 'Подождите перед повторной попыткой.' : data?.error || 'Откройте ярлык «Заявки из групп» заново.'); }
  return response.json();
}
async function refresh() {
  clearTimeout(refreshTimer);
  if (refreshing || expired || document.hidden) return;
  refreshing = true;
  let delay = 10_000;
  try {
    const value = await call('/status');
    failures = 0;
    if ([value.max.state, value.whatsapp.state].some(state => ['scan_qr', 'connecting', 'password_required'].includes(state))) delay = 2000;
    for (const provider of ['max', 'whatsapp']) {
      document.getElementById(`${provider}-state`).textContent = labels[value[provider].state] || 'Проверка подключения';
      const qr = document.getElementById(`${provider}-qr`);
      qr.hidden = !value[provider].qr;
      if (value[provider].qr) qr.src = value[provider].qr; else qr.removeAttribute('src');
    }
    document.getElementById('password-form').hidden = value.max.state !== 'password_required';
    document.getElementById('max-account').textContent = value.max.accountId ? `ID аккаунта MAX: ${value.max.accountId}` : '';
    const maxBookingLabels = { connected: 'Личные ответы включены.', server_unavailable: 'Личные ответы не разрешены сервером для этого подключения.', send_failed: 'Одно из личных сообщений не удалось подтвердить.' };
    document.getElementById('max-booking-state').textContent = maxBookingLabels[value.maxBooking] || 'Личные ответы выключены.';
    document.getElementById('delivery-state').textContent = `${labels[value.delivery] || value.delivery}. В очереди: ${value.pending}.` + (value.lastDelivery ? ` Передано сервису: ${new Date(value.lastDelivery).toLocaleTimeString('ru')}.` : '');
    document.getElementById('pair-form').hidden = (value.paired && value.delivery !== 'pair_again') || value.delivery === 'server_update_required';
  } catch (error) { document.getElementById('result').textContent = error.message; delay = Math.min(60_000, 15_000 * 2 ** Math.min(failures++, 3)); }
  finally { refreshing = false; if (!expired && !document.hidden) refreshTimer = setTimeout(refresh, delay); }
}
async function submit(path, body) {
  if (submitting) return;
  submitting = true;
  const buttons = [...document.querySelectorAll('button')];
  buttons.forEach(button => { button.disabled = true; });
  try { await call(path, body); document.getElementById('result').textContent = 'Готово'; await refresh(); }
  catch (error) { document.getElementById('result').textContent = error.message; }
  finally { submitting = false; buttons.forEach(button => { button.disabled = false; }); }
}
document.getElementById('pair-form').onsubmit = event => { event.preventDefault(); void submit('/pair', { code: new FormData(event.target).get('code').trim() }); event.target.reset(); };
document.getElementById('password-form').onsubmit = event => { event.preventDefault(); const password = new FormData(event.target).get('password'); event.target.reset(); void submit('/max-password', { password }); };
document.getElementById('retry').onclick = () => void submit('/retry', {});
document.addEventListener('visibilitychange', () => { clearTimeout(refreshTimer); if (!document.hidden) void refresh(); });
void refresh();
