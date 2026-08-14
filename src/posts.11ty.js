import { renderMarkdownDocument } from '../lib/render-markdown.js';
import { articleHreflang, postSeo } from '../lib/seo.js';
import { engagementFor } from '../lib/engagement-snapshot.js';
import { resolveShareTargets } from '../lib/share-targets.js';

export default class ValidatedPostPages {
  data() {
    return {
      pagination: {
        data: 'buildManifest.posts',
        size: 1,
        alias: 'post'
      },
      layout: 'layouts/post.njk',
      permalink: ({ post }) => `${post.relativeUrl}index.html`,
      eleventyComputed: {
        hreflangLinks: ({ buildManifest, post, site }) => {
          if (buildManifest?.posts == null || post?.source == null
              || site?.site?.defaultLanguage == null) return [];
          return articleHreflang(buildManifest.posts, site).get(post.source) ?? [];
        },
        engagement: ({ engagementSnapshot, post }) => engagementFor(engagementSnapshot, post.id),
        shareTargets: ({ post, site }) => post?.publicationState === 'published'
          ? resolveShareTargets({
              configured: site.sharing.targets,
              title: post.frontmatter.title,
              canonicalUrl: post.canonicalUrl,
              socialProfiles: site.sharing.socialProfiles
            })
          : [],
        postTableOfContents: ({ post }) => post?.publicationState === 'published'
          ? renderedDocument(post).tableOfContents
          : [],
        seo: ({ post, site }) => post?.publicationState === 'published'
          ? postSeo({ post, site, renderedHtml: renderedDocument(post).html })
          : null
      }
    };
  }

  render({ post }) {
    if (post.publicationState === 'tombstoned') {
      return `<p>POST deleted on ${post.frontmatter.deleteDate}</p>`;
    }
    return renderedDocument(post).html;
  }
}

const renderedDocuments = new WeakMap();

function renderedDocument(post) {
  let document = renderedDocuments.get(post);
  if (!document) {
    document = renderMarkdownDocument(post.body);
    renderedDocuments.set(post, document);
  }
  return document;
}
