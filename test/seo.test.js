import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalUrl,
  articleHreflang,
  hreflangCluster,
  postSeo,
  renderAtomFeed,
  renderSitemap,
  siteUrl,
  sortFeedPosts
} from '../lib/seo.js';

test('composes topology prefixes without hardcoded root assumptions', () => {
  assert.equal(siteUrl({
    canonicalBaseUrl: 'https://example.com/',
    pathPrefix: '',
    relativePath: '/'
  }), 'https://example.com/');
  assert.equal(siteUrl({
    canonicalBaseUrl: 'https://example.com/',
    pathPrefix: '/blog',
    relativePath: '/en/hello-world/'
  }), 'https://example.com/blog/en/hello-world/');
  assert.equal(siteUrl({
    canonicalBaseUrl: 'https://user.github.io/',
    pathPrefix: '/repository',
    relativePath: '/post/'
  }), 'https://user.github.io/repository/post/');
  assert.equal(siteUrl({
    canonicalBaseUrl: 'https://example.com/',
    pathPrefix: '/notes',
    relativePath: '/fr-CA/café/'
  }), 'https://example.com/notes/fr-CA/caf%C3%A9/');
});

test('rejects a path-bearing canonical base instead of double-counting the prefix', () => {
  assert.throws(() => siteUrl({
    canonicalBaseUrl: 'https://example.com/blog',
    pathPrefix: '/blog',
    relativePath: '/post/'
  }), /pathPrefix/);
});

test('refuses paths that can escape or reinterpret the configured topology prefix', () => {
  const base = { canonicalBaseUrl: 'https://example.com/', pathPrefix: '/blog' };
  assert.throws(() => siteUrl({ ...base, relativePath: '/../admin/' }), /dot segments/);
  assert.throws(() => siteUrl({ ...base, relativePath: '/post/?preview=true' }), /query or fragment/);
  assert.throws(() => siteUrl({ ...base, pathPrefix: '/blog/../other', relativePath: '/post/' }), /dot segments/);
});

test('uses self canonical by default and permits an HTTPS override', () => {
  assert.equal(canonicalUrl({ pageUrl: 'https://example.com/post/' }), 'https://example.com/post/');
  assert.equal(canonicalUrl({
    pageUrl: 'https://example.com/post/',
    canonicalOverride: 'https://dev.example/article'
  }), 'https://dev.example/article');
  assert.throws(() => canonicalUrl({ pageUrl: 'http://example.com/' }), /HTTPS/);
  assert.throws(
    () => canonicalUrl({ pageUrl: 'https://user:secret@example.com/post/' }),
    /credentials/
  );
});

test('creates reciprocal self-referential variants and x-default', () => {
  const variants = [
    { language: 'en', url: 'https://example.com/en/post/' },
    { language: 'fr', url: 'https://example.com/fr/post/' }
  ];
  assert.deepEqual(hreflangCluster(variants, 'https://example.com/en/post/'), [
    { hreflang: 'en', href: 'https://example.com/en/post/' },
    { hreflang: 'fr', href: 'https://example.com/fr/post/' },
    { hreflang: 'x-default', href: 'https://example.com/en/post/' }
  ]);
  assert.throws(() => hreflangCluster([
    { language: 'en', url: 'https://user:secret@example.com/en/post/' }
  ], 'https://example.com/'), /credentials/);
  assert.throws(() => hreflangCluster([
    { language: 'iw', url: 'https://example.com/he/post/' },
    { language: 'he', url: 'https://example.com/he/post/' }
  ], 'https://example.com/he/post/'), /Duplicate or invalid hreflang: he/);
});

test('uses the site root as x-default when the default language variant is absent', () => {
  const links = articleHreflang([{
    id: '01K00000000000000000000000', source: 'index.fr.md', language: 'fr',
    pageUrl: 'https://example.com/blog/fr/post/', publicationState: 'published'
  }], {
    site: { defaultLanguage: 'en' },
    hosting: { canonicalBaseUrl: 'https://example.com', pathPrefix: '/blog' }
  }).get('index.fr.md');
  assert.deepEqual(links, [
    { hreflang: 'fr', href: 'https://example.com/blog/fr/post/' },
    { hreflang: 'x-default', href: 'https://example.com/blog/' }
  ]);
});

test('matches the default language to a canonical-equivalent published variant', () => {
  const links = articleHreflang([{
    id: '01K00000000000000000000000', source: 'index.he.md', language: 'he',
    pageUrl: 'https://example.com/he/post/', publicationState: 'published'
  }], {
    site: { defaultLanguage: 'iw' },
    hosting: { canonicalBaseUrl: 'https://example.com', pathPrefix: '/' }
  }).get('index.he.md');

  assert.deepEqual(links, [
    { hreflang: 'he', href: 'https://example.com/he/post/' },
    { hreflang: 'x-default', href: 'https://example.com/he/post/' }
  ]);
});

test('sitemap includes every alternate and escapes untrusted metadata', () => {
  const sitemap = renderSitemap([{
    url: 'https://example.com/en/post/',
    lastModified: '2026-06-15',
    xDefaultUrl: 'https://example.com/en/post/',
    variants: [
      { language: 'en', url: 'https://example.com/en/post/' },
      { language: 'fr', url: 'https://example.com/fr/post/?x=1&y=2' }
    ]
  }]);
  assert.match(sitemap, /xmlns:xhtml=/);
  assert.match(sitemap, /hreflang="en"/);
  assert.match(sitemap, /hreflang="fr"/);
  assert.match(sitemap, /hreflang="x-default"/);
  assert.match(sitemap, /x=1&amp;y=2/);
});

test('Atom feed carries full escaped HTML and canonical links', () => {
  const feed = renderAtomFeed({
    id: 'https://example.com/feed/en.xml',
    title: 'Example & Notes',
    author: 'Example Author',
    updated: '2026-06-15T00:00:00Z',
    selfUrl: 'https://example.com/feed/en.xml',
    entries: [{
      id: '01K00000000000000000000000',
      title: 'A < B',
      updated: '2026-06-15T00:00:00Z',
      url: 'https://example.com/en/post/',
      html: '<p>Full content</p>'
    }]
  });
  assert.match(feed, /Example &amp; Notes/);
  assert.match(feed, /<author><name>Example Author<\/name><\/author>/);
  assert.match(feed, /A &lt; B/);
  assert.match(feed, /&lt;p&gt;Full content&lt;\/p&gt;/);
});

test('orders feeds by declared publication date then descending ULID without catch-up rewriting', () => {
  const posts = [
    { id: '01K00000000000000000000001', frontmatter: { publishAfterDate: '2026-06-14' } },
    { id: '01K00000000000000000000000', frontmatter: { publishAfterDate: '2026-06-15' } },
    { id: '01K00000000000000000000002', frontmatter: { publishAfterDate: '2026-06-15' } }
  ];
  assert.deepEqual(sortFeedPosts(posts).map(({ id }) => id), [
    '01K00000000000000000000002',
    '01K00000000000000000000000',
    '01K00000000000000000000001'
  ]);
  assert.deepEqual(posts.map(({ id }) => id), [
    '01K00000000000000000000001',
    '01K00000000000000000000000',
    '01K00000000000000000000002'
  ]);
});

test('builds complete SEO metadata with approved fallbacks and absolute post-local media', () => {
  const site = {
    site: { name: 'Example Site', author: 'Default Author' },
    hosting: { canonicalBaseUrl: 'https://example.com', pathPrefix: '/blog' }
  };
  const seo = postSeo({
    site,
    renderedHtml: '<p>First <strong>paragraph</strong> &amp; enough words for metadata.</p>',
    post: {
      language: 'en',
      pageUrl: 'https://example.com/blog/en/post/',
      canonicalUrl: 'https://canonical.example/post',
      frontmatter: {
        title: 'A < Post',
        publishAfterDate: '2026-06-10',
        editHistory: ['2026-06-12 Corrected copy'],
        coverImage: 'media/cover image.png'
      }
    }
  });

  assert.equal(seo.description, 'First paragraph & enough words for metadata.');
  assert.equal(seo.descriptionFallback, true);
  assert.equal(seo.author, 'Default Author');
  assert.equal(seo.imageUrl, 'https://example.com/blog/en/post/media/cover%20image.png');
  assert.equal(seo.twitterCard, 'summary_large_image');
  assert.equal(seo.datePublished, '2026-06-10');
  assert.equal(seo.dateModified, '2026-06-12');
  assert.deepEqual(seo.breadcrumbList.itemListElement.map(({ item }) => item), [
    'https://example.com/blog/',
    'https://example.com/blog/en/',
    'https://example.com/blog/en/post/'
  ]);
  assert.equal(seo.blogPosting.author.name, 'Default Author');
  assert.equal(seo.blogPosting.image, seo.imageUrl);
  assert.doesNotMatch(seo.structuredDataJson, /<\/script/i);
});

test('uses authored descriptions and text-only cards while falling back from author to site title', () => {
  const seo = postSeo({
    site: {
      site: { name: 'Site Title' },
      hosting: { canonicalBaseUrl: 'https://example.com', pathPrefix: '/' }
    },
    renderedHtml: '<p>Ignored body.</p>',
    post: {
      language: 'fr',
      pageUrl: 'https://example.com/fr/post/',
      canonicalUrl: 'https://example.com/fr/post/',
      frontmatter: {
        title: 'Post', description: 'Authored description', author: '',
        publishAfterDate: '2026-06-10', editHistory: []
      }
    }
  });
  assert.equal(seo.description, 'Authored description');
  assert.equal(seo.descriptionFallback, false);
  assert.equal(seo.author, 'Site Title');
  assert.equal(seo.imageUrl, null);
  assert.equal(seo.twitterCard, 'summary');
  assert.equal(seo.dateModified, '2026-06-10');
  assert.equal('image' in seo.blogPosting, false);
});
