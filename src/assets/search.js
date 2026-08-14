document.querySelectorAll('[data-gala-search]').forEach((search) => {
  const form = search.querySelector('form');
  const query = form?.elements.namedItem('q');
  const status = search.querySelector('[data-search-status]');
  const results = search.querySelector('[data-search-results]');
  const indexUrl = search.dataset.indexUrl;
  let index;

  const normalize = (value) => String(value ?? '').normalize('NFKC').toLocaleLowerCase();

  function render(entries, term) {
    results.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('li');
      const article = document.createElement('article');
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = entry.url;
      link.lang = entry.language;
      link.textContent = entry.title;
      heading.append(link);
      article.append(heading);
      if (entry.description) {
        const description = document.createElement('p');
        description.textContent = entry.description;
        article.append(description);
      }
      item.append(article);
      results.append(item);
    }
    status.textContent = `${entries.length} result${entries.length === 1 ? '' : 's'} for “${term}”.`;
  }

  async function run(rawTerm) {
    const term = rawTerm.trim();
    if (term === '') {
      results.replaceChildren();
      status.textContent = 'Enter a search term.';
      return;
    }
    status.textContent = 'Searching…';
    try {
      index ??= fetch(indexUrl, { headers: { Accept: 'application/json' } }).then(async (response) => {
        if (!response.ok) throw new Error(`Search index returned HTTP ${response.status}`);
        const payload = await response.json();
        if (payload?.schemaVersion !== 1 || !Array.isArray(payload.entries)) {
          throw new TypeError('Search index schema is unsupported');
        }
        return payload.entries;
      });
      const needle = normalize(term);
      const matches = (await index).filter((entry) => normalize([
        entry.title,
        entry.description,
        entry.language,
        ...(Array.isArray(entry.tags) ? entry.tags : []),
        entry.body
      ].join('\n')).includes(needle));
      render(matches, term);
    } catch {
      results.replaceChildren();
      status.textContent = 'Search is temporarily unavailable.';
    }
  }

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = query.value;
    const location = new URL(window.location.href);
    if (term.trim() === '') location.searchParams.delete('q');
    else location.searchParams.set('q', term);
    window.history.replaceState(null, '', location);
    run(term);
  });

  const initial = new URLSearchParams(window.location.search).get('q') ?? '';
  if (query) query.value = initial;
  run(initial);
});
