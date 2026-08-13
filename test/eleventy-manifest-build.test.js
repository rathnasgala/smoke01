import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const templateRoot = fileURLToPath(new URL('..', import.meta.url));
const eleventy = path.join(templateRoot, 'node_modules', '@11ty', 'eleventy', 'cmd.cjs');

async function fixture({ manifest = true } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'gala-eleventy-manifest-'));
  for (const item of ['src', 'lib', 'static']) {
    await cp(path.join(templateRoot, item), path.join(root, item), { recursive: true });
  }
  for (const item of ['eleventy.config.js', 'site.config.yml', 'custom.css']) {
    await cp(path.join(templateRoot, item), path.join(root, item));
  }
  await writeFile(path.join(root, 'site.config.yml'), `schemaVersion: 1
site:
  id: 01K00000000000000000000010
  name: Fixture Site
  defaultLanguage: en
  timezone: UTC
hosting:
  provider: github-pages
  topology: domain-subpath
  canonicalBaseUrl: https://example.com
  pathPrefix: /blog
design:
  theme: editorial
  layout: article-first
  palette: default
sharing:
  targets: []
  socialProfiles: {}
`);
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await symlink(path.join(templateRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await mkdir(path.join(root, 'content', 'posts', 'not-validated'), { recursive: true });
  await writeFile(
    path.join(root, 'content', 'posts', 'not-validated', 'index.en.md'),
    '---\ntitle: Must not emit\n---\nBody\n'
  );
  await mkdir(path.join(root, 'content', 'posts', 'validated', 'media'), { recursive: true });
  await writeFile(
    path.join(root, 'content', 'posts', 'validated', 'media', 'cover image.png'),
    'validated-image'
  );
  if (manifest) {
    await mkdir(path.join(root, '.gala', 'build'), { recursive: true });
    await writeFile(path.join(root, '.gala', 'build', 'validated-posts.json'), JSON.stringify({
      schemaVersion: 1,
      evaluationDate: '2026-06-15',
      redirects: [
        {
          id: '01K00000000000000000000000',
          language: 'en',
          relativeUrl: '/en/old-validated/',
          pageUrl: 'https://example.com/blog/en/old-validated/',
          targetUrl: 'https://example.com/blog/en/validated/'
        }
      ],
      posts: [
        {
          source: 'content/posts/validated/index.en.md',
          id: '01K00000000000000000000000',
          rawFrontmatter: {
            title: 'Validated', publishAfterDate: '2026-06-15', language: 'en',
            coverImage: 'media/cover image.png'
          },
          frontmatter: {
            title: 'Validated', publishAfterDate: '2026-06-15', language: 'en',
            coverImage: 'media/cover image.png'
          },
          contentBody: 'Validated **body**.',
          body: 'Validated **body**.',
          slug: 'validated',
          language: 'en',
          relativeUrl: '/en/validated/',
          pageUrl: 'https://example.com/blog/en/validated/',
          canonicalUrl: 'https://canonical.example/validated?source=gala&language=en',
          media: [{
            source: 'content/posts/validated/media/cover image.png',
            output: 'en/validated/media/cover image.png'
          }],
          publicationState: 'published'
        },
        {
          source: 'content/posts/validated/index.fr.md',
          id: '01K00000000000000000000000',
          rawFrontmatter: { title: 'Validé', publishAfterDate: '2026-06-15', language: 'fr' },
          frontmatter: { title: 'Validé', publishAfterDate: '2026-06-15', language: 'fr' },
          contentBody: 'Corps **validé**.',
          body: 'Corps **validé**.',
          slug: 'validated',
          language: 'fr',
          relativeUrl: '/fr/validated/',
          pageUrl: 'https://example.com/blog/fr/validated/',
          canonicalUrl: 'https://example.com/blog/fr/validated/',
          publicationState: 'published'
        },
        {
          source: 'content/posts/without-snapshot/index.de.md',
          id: '01K00000000000000000000002',
          rawFrontmatter: {
            title: 'Without snapshot', publishAfterDate: '2026-06-15', language: 'de'
          },
          frontmatter: {
            title: 'Without snapshot', publishAfterDate: '2026-06-15', language: 'de'
          },
          contentBody: 'No snapshot entry.',
          body: 'No snapshot entry.',
          slug: 'without-snapshot',
          language: 'de',
          relativeUrl: '/de/without-snapshot/',
          pageUrl: 'https://example.com/blog/de/without-snapshot/',
          canonicalUrl: 'https://example.com/blog/de/without-snapshot/',
          publicationState: 'published'
        },
        {
          source: 'content/posts/deleted/index.fr.md',
          id: '01K00000000000000000000001',
          rawFrontmatter: {
            title: 'Deleted', publishAfterDate: '2026-06-01',
            deleteDate: '2026-06-14', language: 'fr'
          },
          frontmatter: {
            title: 'Deleted', publishAfterDate: '2026-06-01',
            deleteDate: '2026-06-14', language: 'fr'
          },
          contentBody: 'Deleted body.',
          body: null,
          slug: 'deleted-post',
          language: 'fr',
          relativeUrl: '/fr/deleted-post/',
          pageUrl: 'https://example.com/blog/fr/deleted-post/',
          canonicalUrl: 'https://example.com/blog/fr/deleted-post/',
          publicationState: 'tombstoned'
        }
      ]
    }));
    await writeFile(path.join(root, '.engagement-snapshot.json'), JSON.stringify({
      schemaVersion: 1,
      refreshedAt: '2026-06-15T00:00:00Z',
      articles: {
        '01K00000000000000000000000': { reactions: 2, comments: 3, views: 5 }
      }
    }));
  }
  return root;
}

test('Eleventy emits only current manifest pages and renders tombstones in place', async () => {
  const root = await fixture();
  await execute(process.execPath, [eleventy], {
    cwd: root,
    env: {
      ...process.env,
      GALA_PATH_PREFIX: '/wrong-environment-prefix/',
      GALA_BUILD_INSTANT: '2026-06-15T12:30:00Z'
    }
  });

  const published = await readFile(path.join(root, '_site', 'en', 'validated', 'index.html'), 'utf8');
  assert.match(published, /<strong>body<\/strong>/);
  assert.match(published, /href="\/blog\/assets\/theme\.css"/);
  assert.doesNotMatch(published, /wrong-environment-prefix/);
  assert.match(
    published,
    /<link rel="canonical" href="https:\/\/canonical.example\/validated\?source=gala&amp;language=en">/
  );
  assert.match(
    published,
    /data-copy-url="https:\/\/canonical.example\/validated\?source=gala&amp;language=en"/
  );
  assert.match(published, /<meta name="description" content="Validated body\.">/);
  assert.match(published, /<meta property="og:type" content="article">/);
  assert.match(published, /<meta property="og:url" content="https:\/\/canonical\.example\/validated\?source=gala&amp;language=en">/);
  assert.match(published, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(
    published,
    /<meta property="og:image" content="https:\/\/example\.com\/blog\/en\/validated\/media\/cover%20image\.png">/
  );
  assert.match(published, /"@type":"BlogPosting"/);
  assert.match(published, /"@type":"BreadcrumbList"/);
  assert.match(published, /href="https:\/\/example\.com\/blog\/feed\/en\.xml"/);
  assert.match(
    published,
    /class="gala-share__fallback" value="https:\/\/canonical.example\/validated\?source=gala&amp;language=en"/
  );
  assert.match(
    published,
    /rel="alternate" hreflang="en" href="https:\/\/example.com\/blog\/en\/validated\/"/
  );
  assert.match(
    published,
    /rel="alternate" hreflang="x-default" href="https:\/\/example.com\/blog\/en\/validated\/"/
  );
  assert.match(published, /data-language-preference/);
  assert.match(published, /data-engagement-snapshot/);
  assert.match(published, /<dt>Reactions<\/dt><dd>2<\/dd>/);
  assert.match(published, /<dt>Comments<\/dt><dd>3<\/dd>/);
  assert.match(published, /<dt>Views<\/dt><dd>5<\/dd>/);
  const withoutSnapshot = await readFile(
    path.join(root, '_site', 'de', 'without-snapshot', 'index.html'),
    'utf8'
  );
  assert.match(withoutSnapshot, /class="gala-engagement__placeholder" role="status"/);
  assert.match(withoutSnapshot, /Engagement data unavailable/);
  assert.doesNotMatch(withoutSnapshot, /<dd>0<\/dd>/);
  assert.match(
    withoutSnapshot,
    /rel="alternate" hreflang="x-default" href="https:\/\/example.com\/blog\/"/
  );
  assert.match(published, /value="en"[^>]* selected/);
  assert.match(published, /data-url="https:\/\/example.com\/blog\/fr\/validated\/"/);
  const tombstone = await readFile(path.join(root, '_site', 'fr', 'deleted-post', 'index.html'), 'utf8');
  assert.match(tombstone, /POST deleted on 2026-06-14/);
  assert.match(tombstone, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(tombstone, /data-copy-url=/);
  const sitemap = await readFile(path.join(root, '_site', 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /<loc>https:\/\/example.com\/blog\/en\/validated\/<\/loc>/);
  assert.match(sitemap, /hreflang="x-default"/);
  assert.doesNotMatch(sitemap, /deleted-post/);
  const index = await readFile(path.join(root, '_site', 'index.html'), 'utf8');
  assert.match(index, /class="gala-card-index"/);
  assert.match(index, /href="\/blog\/en\/validated\/"/);
  assert.match(index, />Validated<\/a>/);
  assert.match(index, />Validé<\/a>/);
  assert.doesNotMatch(index, /Deleted/);
  const searchIndex = JSON.parse(await readFile(
    path.join(root, '_site', 'search-index.json'),
    'utf8'
  ));
  assert.deepEqual(
    searchIndex.entries.map(({ title }) => title),
    ['Validated', 'Validé', 'Without snapshot']
  );
  assert.equal(searchIndex.entries.find(({ title }) => title === 'Validated').body, 'Validated **body**.');
  assert.equal(searchIndex.entries.some(({ title }) => title === 'Deleted'), false);
  const search = await readFile(path.join(root, '_site', 'search', 'index.html'), 'utf8');
  assert.match(search, /data-gala-search/);
  assert.match(search, /data-index-url="\/blog\/search-index\.json"/);
  assert.match(search, /src="\/blog\/assets\/search\.js"/);
  const settings = await readFile(path.join(root, '_site', 'settings', 'index.html'), 'utf8');
  assert.match(settings, /Reader settings/);
  assert.match(settings, /option value="en"/);
  assert.match(settings, /option value="fr"/);
  assert.match(settings, /page URL always controls the content/);
  const englishFeed = await readFile(path.join(root, '_site', 'feed', 'en.xml'), 'utf8');
  assert.match(englishFeed, /<updated>2026-06-15T12:30:00\.000Z<\/updated>/);
  assert.match(englishFeed, /<id>urn:gala:article:01K00000000000000000000000:en<\/id>/);
  assert.match(englishFeed, /&lt;p&gt;Validated &lt;strong&gt;body&lt;\/strong&gt;\.&lt;\/p&gt;/);
  assert.doesNotMatch(englishFeed, /Deleted/);
  const frenchFeed = await readFile(path.join(root, '_site', 'feed', 'fr.xml'), 'utf8');
  assert.match(frenchFeed, /Validé/);
  assert.doesNotMatch(frenchFeed, /Deleted/);
  const englishIndex = await readFile(path.join(root, '_site', 'en', 'index.html'), 'utf8');
  assert.match(englishIndex, /Fixture Site — en/);
  assert.match(englishIndex, /href="https:\/\/example\.com\/blog\/en\/validated\/"/);
  assert.equal(
    await readFile(path.join(root, '_site', 'en', 'validated', 'media', 'cover image.png'), 'utf8'),
    'validated-image'
  );
  const redirect = await readFile(
    path.join(root, '_site', 'en', 'old-validated', 'index.html'),
    'utf8'
  );
  assert.match(redirect, /http-equiv="refresh" content="0; url=https:\/\/example.com\/blog\/en\/validated\/"/);
  assert.match(redirect, /rel="canonical" href="https:\/\/example.com\/blog\/en\/validated\/"/);
  await assert.rejects(
    () => readFile(path.join(root, '_site', 'not-validated', 'index.html')),
    { code: 'ENOENT' }
  );
});

test('Eleventy fails hard instead of globbing content when the manifest is missing', async () => {
  const root = await fixture({ manifest: false });
  await assert.rejects(
    () => execute(process.execPath, [eleventy], { cwd: root }),
    /Validated build manifest is missing/
  );
});

test('Eleventy refuses a validated media path replaced by a symbolic link', async () => {
  const root = await fixture();
  const media = path.join(root, 'content', 'posts', 'validated', 'media', 'cover image.png');
  const outside = path.join(root, 'outside.png');
  await writeFile(outside, 'outside-image');
  await unlink(media);
  await symlink(outside, media);

  await assert.rejects(
    () => execute(process.execPath, [eleventy], { cwd: root }),
    /Validated media source is no longer a regular file/
  );
});
