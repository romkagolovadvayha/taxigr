import { brandIdentity } from '../theme/tokens';
import { confirmLocationDisclosure, locationDisclosures } from './location-disclosure';

export function confirmVkPickupConsent(signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return confirmLocationDisclosure('pickup');

  const { title, message } = locationDisclosures.pickup;
  const heading = document.createElement('h2');
  heading.id = 'vk-pickup-location-title';
  heading.textContent = title;
  heading.style.margin = '0';
  dialog.setAttribute('aria-labelledby', heading.id);
  const description = document.createElement('p');
  description.textContent = message;
  description.style.whiteSpace = 'pre-line';
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px' });
  for (const [label, value] of [['Указать вручную', 'manual'], ['Разрешить', 'allow']] as const) {
    const button = document.createElement('button');
    button.textContent = label;
    button.type = 'button';
    button.addEventListener('click', () => dialog.close(value));
    Object.assign(button.style, { minHeight: '44px', padding: '0 12px', borderRadius: '12px', font: 'inherit' });
    if (value === 'allow') Object.assign(button.style, { border: '0', background: brandIdentity.background, color: brandIdentity.ink });
    actions.append(button);
  }
  Object.assign(dialog.style, {
    boxSizing: 'border-box', width: 'min(420px, calc(100% - 24px))', maxHeight: '85vh', overflow: 'auto',
    padding: '20px', border: '0', borderRadius: '20px', font: '16px/1.4 system-ui',
  });
  dialog.append(heading, description, actions);

  return new Promise(resolve => {
    const finish = (allowed: boolean) => {
      signal.removeEventListener('abort', cancel);
      dialog.remove();
      resolve(allowed);
    };
    const cancel = () => finish(false);
    dialog.addEventListener('close', () => finish(dialog.returnValue === 'allow'), { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    document.body.append(dialog);
    try { dialog.showModal(); } catch { cancel(); }
  });
}
