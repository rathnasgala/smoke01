import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(
  new URL('./provider-fixtures/share-intents.v1.json', import.meta.url),
  'utf8'
));

const LABELS = Object.freeze({
  bluesky: 'Bluesky',
  x: 'X',
  'hacker-news': 'Hacker News',
  email: 'Email',
  mastodon: 'Mastodon'
});

export function resolveShareTargets({ configured, title, canonicalUrl, socialProfiles = {} }) {
  if (!Array.isArray(configured)) throw new TypeError('sharing.targets must be an array');
  if (typeof title !== 'string' || title.trim() === '') throw new TypeError('share title is required');
  const canonical = requireHttpsUrl(canonicalUrl, 'canonical URL');
  return configured.map((provider) => resolveProvider(provider, title, canonical, socialProfiles));
}

function resolveProvider(provider, title, canonical, socialProfiles) {
  const contract = fixture.providers?.[provider];
  if (contract?.status !== 'verified' || typeof contract.template !== 'string') {
    throw new TypeError(`Share target ${provider} has no verified public intent contract`);
  }
  let instance = '';
  if (contract.requiresInstance) {
    const profile = requireHttpsUrl(socialProfiles.mastodon, 'sharing.socialProfiles.mastodon');
    instance = profile.host;
  }
  const text = provider === 'bluesky' || provider === 'mastodon'
    ? `${title}\n${canonical.href}`
    : provider === 'email' ? canonical.href : title;
  const replacements = {
    text: encodeURIComponent(text),
    title: encodeURIComponent(title),
    url: encodeURIComponent(canonical.href),
    instance
  };
  const rendered = contract.template.replace(/\{(text|title|url|instance)\}/g,
    (placeholder, name) => replacements[name]);
  if (/\{[^}]+\}/.test(rendered)) throw new TypeError(`Share target ${provider} fixture is incomplete`);
  const destination = new URL(rendered);
  if (!['https:', 'mailto:'].includes(destination.protocol)) {
    throw new TypeError(`Share target ${provider} produced an unsafe URL`);
  }
  return Object.freeze({ provider, label: LABELS[provider], url: destination.href });
}

function requireHttpsUrl(value, field) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${field} must be an absolute HTTPS URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    throw new TypeError(`${field} must be an absolute credential-free HTTPS URL`);
  }
  return parsed;
}
