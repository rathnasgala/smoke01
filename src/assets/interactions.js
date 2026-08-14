function selectableFallback(control) {
  const region = control.closest('.gala-share');
  const fallback = region?.querySelector('.gala-share__fallback');
  fallback?.focus();
  fallback?.select();
  const status = region?.querySelector('.gala-share__status');
  if (status) status.textContent = 'Select and copy the URL shown.';
}

document.addEventListener('click', async (event) => {
  const dialogControl = event.target.closest('[data-open-dialog]');
  if (dialogControl) {
    const dialog = document.getElementById(dialogControl.dataset.openDialog);
    if (dialog instanceof HTMLDialogElement) dialog.showModal();
    return;
  }

  const reaction = event.target.closest('[data-reaction]');
  if (reaction) {
    const region = reaction.closest('[data-engagement-url]');
    if (!region) return;
    const active = reaction.getAttribute('aria-pressed') !== 'true';
    const saved = await mutateEngagement(region, active ? 'reaction.add' : 'reaction.remove', {
      articleId: region.dataset.articleId,
      reaction: reaction.dataset.reaction
    });
    if (!saved) return;
    reaction.setAttribute('aria-pressed', String(active));
    return;
  }

  const follow = event.target.closest('[data-follow-article]');
  if (follow) {
    const region = follow.closest('[data-engagement-url]');
    if (!region) return;
    const active = follow.getAttribute('aria-pressed') !== 'true';
    const saved = await mutateEngagement(region, active ? 'follow.add' : 'follow.remove', {
      targetType: 'articles', targetId: region.dataset.articleId
    });
    if (!saved) return;
    follow.setAttribute('aria-pressed', String(active));
    follow.textContent = active ? 'Unfollow article' : 'Follow article';
    return;
  }

  const reply = event.target.closest('[data-reply-comment]');
  if (reply) {
    const region = reply.closest('[data-engagement-url]');
    const form = region?.querySelector('[data-comment-create]');
    if (!form) return;
    form.dataset.parentCommentId = reply.dataset.replyComment;
    const context = form.querySelector('[data-comment-reply-context]');
    if (context) {
      context.hidden = false;
      context.textContent = `Replying to ${reply.dataset.replyAuthor || 'comment'}.`;
    }
    const cancel = form.querySelector('[data-cancel-reply]');
    if (cancel) cancel.hidden = false;
    form.querySelector('textarea')?.focus();
    return;
  }

  const cancelReply = event.target.closest('[data-cancel-reply]');
  if (cancelReply) {
    clearReply(cancelReply.closest('[data-comment-create]'));
    return;
  }

  const edit = event.target.closest('[data-edit-comment]');
  if (edit) {
    showCommentEditor(edit);
    return;
  }

  const cancelEdit = event.target.closest('[data-cancel-comment-edit]');
  if (cancelEdit) {
    cancelEdit.closest('[data-comment-editor]')?.remove();
    return;
  }

  const remove = event.target.closest('[data-delete-comment]');
  if (remove) {
    const region = remove.closest('[data-engagement-url]');
    if (!region) return;
    await mutateEngagement(region, 'comment.delete', {
      articleId: region.dataset.articleId,
      commentId: remove.dataset.deleteComment
    });
    return;
  }

  const moreComments = event.target.closest('[data-comments-cursor]');
  if (moreComments) {
    const region = moreComments.closest('[data-engagement-url]');
    if (!region) return;
    moreComments.disabled = true;
    await refreshEngagement(region, moreComments.dataset.commentsCursor, true);
    return;
  }

  const share = event.target.closest('[data-copy-url]');
  if (share) {
    const value = share.dataset.copyUrl;
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      selectableFallback(share);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      const status = share.closest('.gala-share')?.querySelector('.gala-share__status');
      if (status) status.textContent = 'Link copied.';
    } catch {
      selectableFallback(share);
    }
    return;
  }

  const copy = event.target.closest('[data-copy-code]');
  if (!copy) return;
  const code = copy.closest('.gala-code-block')?.querySelector('code');
  if (!code || !navigator.clipboard?.writeText || !window.isSecureContext) return;
  try {
    await navigator.clipboard.writeText(code.textContent);
    copy.textContent = 'Copied';
  } catch {
    copy.textContent = 'Select code to copy';
  }
});

const codeBlocks = new Set(
  [...document.querySelectorAll('pre code')].map((code) => code.closest('pre')).filter(Boolean)
);
codeBlocks.forEach((pre) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'gala-code-block';
  pre.before(wrapper);
  wrapper.append(pre);
  const control = document.createElement('button');
  control.type = 'button';
  control.dataset.copyCode = '';
  control.textContent = 'Copy code';
  control.setAttribute('aria-label', 'Copy code block');
  wrapper.prepend(control);
});

function textElement(name, text, className) {
  const element = document.createElement(name);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function engagementCounts(data) {
  const reactionTotal = Object.values(data.reactions ?? {})
    .reduce((total, count) => total + (Number.isSafeInteger(count) ? count : 0), 0);
  return [
    ['Reactions', reactionTotal],
    ['Comments', Number.isSafeInteger(data.comments?.totalCount) ? data.comments.totalCount : 0],
    ['Views', Number.isSafeInteger(data.views?.count) ? data.views.count : 0]
  ];
}

function commentList(items, currentUser) {
  const roots = document.createElement('ol');
  roots.className = 'gala-comments';
  const nodes = new Map();
  for (const comment of items) {
    const item = document.createElement('li');
    item.dataset.commentId = comment.commentId;
    const author = comment.author?.displayName ?? '[deleted]';
    item.append(textElement('strong', author));
    const body = textElement('p', comment.deleted ? '[deleted]' : comment.body);
    body.dataset.commentBody = '';
    item.append(body);
    if (!comment.deleted && currentUser) {
      const actions = document.createElement('div');
      actions.className = 'gala-comment-actions';
      const reply = textElement('button', 'Reply');
      reply.type = 'button';
      reply.dataset.replyComment = comment.commentId;
      reply.dataset.replyAuthor = author;
      actions.append(reply);
      if (comment.author?.userId === currentUser.id) {
        const edit = textElement('button', 'Edit');
        edit.type = 'button';
        edit.dataset.editComment = comment.commentId;
        const remove = textElement('button', 'Delete');
        remove.type = 'button';
        remove.dataset.deleteComment = comment.commentId;
        actions.append(edit, remove);
      }
      item.append(actions);
    }
    nodes.set(comment.commentId, item);
  }
  for (const comment of items) {
    const item = nodes.get(comment.commentId);
    const parent = comment.parentCommentId ? nodes.get(comment.parentCommentId) : null;
    if (!parent) {
      roots.append(item);
      continue;
    }
    let replies = parent.querySelector(':scope > ol');
    if (!replies) {
      replies = document.createElement('ol');
      replies.className = 'gala-comment-replies';
      parent.append(replies);
    }
    replies.append(item);
  }
  return roots;
}

function renderEngagement(region, payload, appendComments = false) {
  const data = payload?.data;
  if (!data || typeof data !== 'object') throw new TypeError('Engagement data is invalid');
  const live = region.querySelector('[data-engagement-live]');
  if (!live) return;
  if (!appendComments) live.replaceChildren();

  if (!appendComments && data.profile) {
    const profile = document.createElement('section');
    profile.className = 'gala-engagement-profile';
    profile.setAttribute('aria-label', 'Author profile');
    profile.append(textElement('h2', data.profile.displayName));
    if (data.profile.username) profile.append(textElement('p', `@${data.profile.username}`));
    if (Number.isSafeInteger(data.profile.followerCount)) {
      profile.append(textElement('p', `${data.profile.followerCount} followers`));
    }
    live.append(profile);
  }

  if (!appendComments) {
    const summary = document.createElement('dl');
    for (const [label, value] of engagementCounts(data)) {
      const item = document.createElement('div');
      item.append(textElement('dt', label), textElement('dd', String(value)));
      summary.append(item);
    }
    live.append(summary);
  }

  if (Array.isArray(data.comments?.items) && data.comments.items.length > 0) {
    live.append(commentList(data.comments.items, sessionUser));
  }
  live.querySelector('[data-comments-cursor]')?.remove();
  if (data.comments?.nextCursor) {
    const more = textElement('button', 'Load more comments');
    more.type = 'button';
    more.dataset.commentsCursor = data.comments.nextCursor;
    live.append(more);
  }
  region.querySelector('[data-engagement-snapshot]')?.remove();
  region.querySelector('.gala-engagement__placeholder')?.remove();
}

function clearReply(form) {
  if (!form) return;
  delete form.dataset.parentCommentId;
  const context = form.querySelector('[data-comment-reply-context]');
  if (context) {
    context.hidden = true;
    context.textContent = '';
  }
  const cancel = form.querySelector('[data-cancel-reply]');
  if (cancel) cancel.hidden = true;
}

function showCommentEditor(control) {
  const item = control.closest('[data-comment-id]');
  if (!item || item.querySelector('[data-comment-editor]')) return;
  const form = document.createElement('form');
  form.dataset.commentEditor = control.dataset.editComment;
  const textarea = document.createElement('textarea');
  textarea.name = 'body';
  textarea.maxLength = 5000;
  textarea.required = true;
  textarea.value = item.querySelector('[data-comment-body]')?.textContent ?? '';
  const save = textElement('button', 'Save');
  save.type = 'submit';
  const cancel = textElement('button', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.cancelCommentEdit = '';
  form.append(textarea, save, cancel);
  item.append(form);
  textarea.focus();
}

async function refreshEngagement(region, commentsCursor = '', appendComments = false) {
  const status = region.querySelector('[data-engagement-status]');
  try {
    const requestUrl = new URL(region.dataset.engagementUrl);
    if (commentsCursor) requestUrl.searchParams.set('commentsCursor', commentsCursor);
    const response = await fetch(requestUrl, {
      headers: { Accept: 'application/json' },
      credentials: 'omit'
    });
    if (!response.ok) throw new Error(`Engagement returned HTTP ${response.status}`);
    const payload = await response.json();
    renderEngagement(region, payload, appendComments);
    if (status) status.textContent = payload.errors?.length
      ? 'Some engagement data is temporarily unavailable.' : '';
  } catch {
    if (status) status.textContent = 'Live engagement data is temporarily unavailable.';
  }
}

function viewCampaign() {
  const query = new URL(window.location.href).searchParams;
  const campaign = {};
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = query.get(name);
    if (value && [...value].length <= 128) campaign[name] = value;
  }
  return campaign;
}

function recordView(region) {
  const requestUrl = new URL(region.dataset.engagementUrl);
  requestUrl.pathname = requestUrl.pathname.replace(/\/engagement$/, '/views');
  fetch(requestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: document.documentElement.lang || undefined,
      referrer: document.referrer || undefined,
      campaign: viewCampaign()
    }),
    credentials: 'omit',
    keepalive: true
  }).catch(() => {});
}

document.addEventListener('submit', async (event) => {
  const create = event.target.closest('[data-comment-create]');
  const editor = event.target.closest('[data-comment-editor]');
  if (!create && !editor) return;
  event.preventDefault();
  const form = create ?? editor;
  const region = form.closest('[data-engagement-url]');
  const body = form.elements.body?.value;
  if (!region || typeof body !== 'string' || body.trim() === '') return;
  if (create) {
    const saved = await mutateEngagement(region, 'comment.create', {
      articleId: region.dataset.articleId,
      parentCommentId: create.dataset.parentCommentId || null,
      body
    });
    if (!saved) return;
    create.reset();
    clearReply(create);
  } else {
    const saved = await mutateEngagement(region, 'comment.edit', {
      articleId: region.dataset.articleId,
      commentId: editor.dataset.commentEditor,
      body
    });
    if (!saved) return;
    editor.remove();
  }
});

let sessionUser = null;
const pendingEngagementWrites = new Map();

document.querySelectorAll('[data-engagement-url]').forEach((region) => {
  refreshEngagement(region);
  recordView(region);
});

const sessionFrame = document.querySelector('[data-gala-session-frame]');

function engagementErrorMessage(code) {
  if (code === 'AUTHENTICATION_REQUIRED' || code === 'INVALID_BEARER_TOKEN'
      || code === 'REAUTHENTICATION_REQUIRED') return 'Sign in again to continue.';
  if (code === 'ENGAGEMENT_RATE_LIMITED') return 'You are posting too quickly; try again shortly.';
  if (code === 'RESOURCE_NOT_FOUND') return 'That item is no longer available.';
  if (code === 'INVALID_ENGAGEMENT_WRITE' || code === 'INVALID_REQUEST') return 'Check your entry and try again.';
  if (code === 'ACCESS_DENIED') return 'That action is not available for this account.';
  if (code === 'IDEMPOTENCY_CONFLICT' || code === 'ENGAGEMENT_STATE_CONFLICT') return 'The item changed; reload and try again.';
  return 'The action could not be completed. Try again.';
}

function sendEngagementWrite(operation, payload) {
  if (!sessionFrame || !sessionUser) return Promise.reject(new Error('AUTHENTICATION_REQUIRED'));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pendingEngagementWrites.set(requestId, { resolve, reject });
    sessionFrame.contentWindow.postMessage({
      type: 'gala-engagement-write', requestId, operation, payload
    }, new URL(sessionFrame.src).origin);
  });
}

async function mutateEngagement(region, operation, payload) {
  const status = region.querySelector('[data-engagement-status]');
  try {
    if (status) status.textContent = 'Saving…';
    await sendEngagementWrite(operation, payload);
    if (status) status.textContent = 'Saved.';
    await refreshEngagement(region);
    return true;
  } catch (error) {
    if (status) status.textContent = engagementErrorMessage(error.message);
    return false;
  }
}

if (sessionFrame) {
  const sessionOrigin = new URL(sessionFrame.src).origin;
  window.addEventListener('message', (event) => {
    if (event.origin !== sessionOrigin || event.source !== sessionFrame.contentWindow) return;
    if (event.data?.type === 'gala-engagement-result') {
      const pending = pendingEngagementWrites.get(event.data.requestId);
      if (!pending) return;
      pendingEngagementWrites.delete(event.data.requestId);
      if (event.data.ok === true) pending.resolve(event.data.result);
      else pending.reject(new Error(event.data.error?.code || 'ENGAGEMENT_WRITE_FAILED'));
      return;
    }
    if (event.data?.type !== 'gala-session') return;
    sessionUser = event.data.user && typeof event.data.user.id === 'string' ? event.data.user : null;
    const control = document.querySelector('[data-user-control]');
    const displayName = sessionUser?.displayName;
    if (control) {
      control.setAttribute('aria-label', displayName
        ? `Account: ${displayName}` : 'Sign in or view account');
      control.title = displayName ? `Account: ${displayName}` : 'Account';
    }
    document.querySelectorAll('[data-engagement-url]').forEach((region) => {
      const actions = region.querySelector('[data-engagement-actions]');
      const signIn = region.querySelector('[data-engagement-sign-in]');
      if (actions) actions.hidden = !sessionUser;
      if (signIn) signIn.hidden = Boolean(sessionUser);
      refreshEngagement(region);
    });
  });
}
