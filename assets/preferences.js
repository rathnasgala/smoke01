const LANGUAGE_STORAGE_KEY = 'gala-language-preference';

function storedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function optionFor(control, language) {
  return [...control.options].find((option) => option.value === language);
}

document.addEventListener('DOMContentLoaded', () => {
  const stored = storedLanguage();
  document.querySelectorAll('[data-language-preference]').forEach((control) => {
    if (stored != null && optionFor(control, stored) != null) control.value = stored;
    control.addEventListener('change', () => {
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, control.value);
      } catch {
        // Selection and explicit navigation still work when storage is unavailable.
      }
      if (!control.hasAttribute('data-navigate-on-selection')) return;
      const selected = optionFor(control, control.value);
      if (selected?.dataset.url) window.location.assign(selected.dataset.url);
    });
  });
});
