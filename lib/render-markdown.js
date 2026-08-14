import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import sanitizeHtml from 'sanitize-html';
import { createHighlighter } from 'shiki';
import GithubSlugger from 'github-slugger';
import { randomBytes } from 'node:crypto';

const SHIKI_THEMES = Object.freeze({ light: 'github-light', dark: 'github-dark' });
const SHIKI_LANGUAGES = Object.freeze([
  'bash', 'css', 'html', 'java', 'javascript', 'json', 'jsx', 'markdown',
  'shellscript', 'sql', 'typescript', 'tsx', 'yaml'
]);
const highlighter = await createHighlighter({
  themes: Object.values(SHIKI_THEMES),
  langs: SHIKI_LANGUAGES
});

const ADMONITION_TYPES = new Set(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);

function admonitions(markdown) {
  markdown.core.ruler.after('block', 'gala_admonitions', (state) => {
    for (let index = 0; index < state.tokens.length - 2; index += 1) {
      const open = state.tokens[index];
      const inline = state.tokens[index + 2];
      if (open.type !== 'blockquote_open' || inline?.type !== 'inline') continue;

      const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)](?:\n|$)/);
      if (!match || !ADMONITION_TYPES.has(match[1])) continue;

      open.tag = 'aside';
      open.attrSet('class', `admonition admonition-${match[1].toLowerCase()}`);
      open.attrSet('role', 'note');
      inline.content = inline.content.slice(match[0].length);
      if (inline.children?.[0]?.type === 'text') {
        inline.children[0].content = inline.children[0].content.replace(
          /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)](?:\n|$)/,
          ''
        );
      }

      let depth = 1;
      for (let cursor = index + 1; cursor < state.tokens.length; cursor += 1) {
        if (state.tokens[cursor].type === 'blockquote_open') depth += 1;
        if (state.tokens[cursor].type === 'blockquote_close') depth -= 1;
        if (depth === 0) {
          state.tokens[cursor].tag = 'aside';
          break;
        }
      }
    }
  });
}

function headingAnchors(markdown) {
  markdown.core.ruler.push('gala_heading_anchors', (state) => {
    const slugger = new GithubSlugger();
    const toc = [];
    for (let index = 0; index < state.tokens.length - 1; index += 1) {
      const open = state.tokens[index];
      if (open.type !== 'heading_open') continue;
      const inline = state.tokens[index + 1];
      const id = slugger.slug(inline.content);
      open.attrSet('id', id);
      if (open.tag === 'h2' || open.tag === 'h3') toc.push({ id, text: inline.content });
    }
    state.env.galaToc = toc.length >= 3 ? toc : [];
  });
}

const markdown = new MarkdownIt({ html: true, linkify: true, typographer: false })
  .use(footnote)
  .use(admonitions)
  .use(headingAnchors);

const defaultFence = markdown.renderer.rules.fence.bind(markdown.renderer.rules);
markdown.renderer.rules.fence = (tokens, index, options, environment, self) => {
  const language = tokens[index].info.trim().split(/\s+/, 1)[0].toLowerCase();
  if (!SHIKI_LANGUAGES.includes(language)) {
    return defaultFence(tokens, index, options, environment, self);
  }
  const highlights = environment.galaHighlights ??= [];
  const token = randomBytes(18).toString('hex');
  highlights.push(highlighter.codeToHtml(tokens[index].content, {
    lang: language,
    themes: SHIKI_THEMES,
    defaultColor: false
  }));
  const tokensByIndex = environment.galaHighlightTokens ??= [];
  tokensByIndex.push(token);
  return `<div class="gala-highlight-placeholder" data-highlight-token="${token}"></div>`;
};

const sanitizeOptions = {
  allowedTags: [
    'a', 'abbr', 'aside', 'blockquote', 'br', 'code', 'del', 'div', 'em',
    'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img',
    'li', 'mark', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'sup', 'table',
    'tbody', 'td', 'th', 'thead', 'tr', 'ul'
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    aside: ['class', 'role'],
    code: ['class'],
    div: ['class', 'id', 'data-highlight-token'],
    h1: ['id'],
    h2: ['id'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
    li: ['id'],
    ol: ['class'],
    span: ['class'],
    sup: ['class'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope']
  },
  allowedClasses: {
    aside: [
      'admonition', 'admonition-note', 'admonition-tip', 'admonition-important',
      'admonition-warning', 'admonition-caution'
    ],
    div: ['gala-highlight-placeholder'],
    code: [/^language-[a-z0-9_-]+$/],
    ol: ['footnotes-list'],
    span: ['footnote-backref'],
    sup: ['footnote-ref']
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: {
    a: ['https', 'mailto'],
    img: ['https']
  },
  allowProtocolRelative: false,
  enforceHtmlBoundary: true
};

function render(source, inline, suppliedEnvironment) {
  const environment = suppliedEnvironment ?? {};
  environment.galaHighlights = [];
  environment.galaHighlightTokens = [];
  const unsafe = inline
    ? markdown.renderInline(source, environment)
    : markdown.render(source, environment);
  let safe = sanitizeHtml(unsafe, sanitizeOptions);
  for (let index = 0; index < environment.galaHighlights.length; index += 1) {
    safe = safe.replace(
      `<div class="gala-highlight-placeholder" data-highlight-token="${environment.galaHighlightTokens[index]}"></div>`,
      environment.galaHighlights[index]
    );
  }
  return safe;
}

export function renderMarkdown(source) {
  if (typeof source !== 'string') throw new TypeError('Markdown source must be a string');
  return render(source, false);
}

export function renderMarkdownDocument(source) {
  if (typeof source !== 'string') throw new TypeError('Markdown source must be a string');
  const environment = {};
  const html = render(source, false, environment);
  return Object.freeze({ html, tableOfContents: Object.freeze(environment.galaToc ?? []) });
}

export const markdownLibrary = Object.assign(Object.create(markdown), {
  render(source, environment) {
    return render(source, false, environment);
  },
  renderInline(source, environment) {
    return render(source, true, environment);
  }
});
