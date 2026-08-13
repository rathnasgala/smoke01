import { markdownLibrary } from './lib/render-markdown.js';
import { readBuildManifest } from './lib/build-manifest.js';
import { loadSiteConfiguration } from './lib/site-config.js';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

async function verifiedMediaSource(postSource, mediaSource) {
  const metadata = await lstat(mediaSource);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Validated media source is no longer a regular file: ${mediaSource}`);
  }
  const [postDirectory, source] = await Promise.all([
    realpath(path.dirname(postSource)),
    realpath(mediaSource)
  ]);
  const relative = path.relative(postDirectory, source);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Validated media source escaped its post folder: ${mediaSource}`);
  }
  return source;
}

export default async function (eleventyConfig) {
  const [manifest, site] = await Promise.all([readBuildManifest(), loadSiteConfiguration()]);
  eleventyConfig.setLibrary('md', markdownLibrary);
  eleventyConfig.addPassthroughCopy({ static: '/' });
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });
  eleventyConfig.addPassthroughCopy('custom.css');
  for (const post of manifest.posts) {
    for (const copy of post.media ?? []) {
      const source = await verifiedMediaSource(post.source, copy.source);
      eleventyConfig.addPassthroughCopy({ [source]: copy.output });
    }
  }
  eleventyConfig.addCollection('posts', (collectionApi) =>
    collectionApi.getAll().filter((item) => item.data.post?.publicationState === 'published')
  );

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    pathPrefix: site.hosting.pathPrefix === '' ? '/' : site.hosting.pathPrefix
  };
}
