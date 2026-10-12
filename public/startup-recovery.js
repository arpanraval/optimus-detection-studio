// This watchdog belongs only to the pre-React surface. Never reload automatically.
(() => {
  const recovery = document.getElementById('startup-recovery');
  const timer = window.setTimeout(() => {
    if (recovery?.isConnected) recovery.hidden = false;
  }, 30000);
  document.getElementById('startup-retry')?.addEventListener('click', () => window.location.reload());
  const observer = new MutationObserver(() => {
    if (!recovery?.isConnected) {
      window.clearTimeout(timer);
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById('root'), { childList: true });
})();
