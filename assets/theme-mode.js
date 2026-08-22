const MODES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'gala-color-mode';

function storedMode() {
  try {
    const mode = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(mode) ? mode : 'system';
  } catch {
    return 'system';
  }
}

function applyMode(mode) {
  document.documentElement.dataset.mode = mode;
  const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  document.querySelectorAll('[data-theme-mode-toggle]').forEach((control) => {
    const label = control.querySelector?.('[data-theme-mode-label]');
    if (label) label.textContent = `Theme: ${mode}`;
    else control.textContent = `Theme: ${mode}`;
    control.setAttribute('aria-label', `Color mode: ${mode}. Activate for ${next}.`);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applyMode(storedMode());
  document.querySelectorAll('[data-theme-mode-toggle]').forEach((control) => {
    control.addEventListener('click', () => {
      const next = MODES[(MODES.indexOf(document.documentElement.dataset.mode) + 1) % MODES.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // The selected mode still applies for this page when storage is unavailable.
      }
      applyMode(next);
    });
  });
});
