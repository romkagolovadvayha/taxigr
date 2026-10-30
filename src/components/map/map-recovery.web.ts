/** One recovery attempt after a failure, or when an offline connection returns. */
export function watchMapRecovery(
  retry: () => void,
  target: EventTarget = window,
  online: () => boolean = () => navigator.onLine !== false,
): () => void {
  let stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    target.removeEventListener('online', recover);
  };
  const recover = () => {
    if (stopped || !online()) return;
    stop();
    retry();
  };
  const timer = setTimeout(recover, 1_500);
  target.addEventListener('online', recover);
  return stop;
}
