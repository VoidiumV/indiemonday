/**
 * Cloudflare Pages Function
 */

var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbz1iYYp6t_XWZVyve3HcEHMeGML3hNkMQdOoITRggvB7c45zml4XMnkBuBL7h1nAbMA/exec';

var BOT_UA_PATTERN = /(facebookexternalhit|twitterbot|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|pinterest|redditbot|skypeuripreview|vkshare|w3c_validator|embedly|quora link preview|outbrain|nuzzel|flipboard|tumblr|bitlybot|iframely)/i;

export async function onRequest(context) {
  var request = context.request;
  var url = new URL(request.url);
  var path = url.pathname.replace(/^\/+|\/+$/g, '');

  var isInterview = path.indexOf('interview-') === 0;
  var isWeekly = path.indexOf('article-') === 0 || path.indexOf('weekly-') === 0;

  if (!isInterview && !isWeekly) {
    return context.next();
  }

  var ua = (request.headers.get('user-agent') || '');
  if (!BOT_UA_PATTERN.test(ua)) {
    return context.next();
  }

  if (!API_BASE_URL || API_BASE_URL.indexOf('PASTE_YOUR') === 0) {
    return context.next();
  }

  var id = isInterview
    ? path.slice('interview-'.length)
    : (path.indexOf('article-') === 0 ? path.slice('article-'.length) : path.slice('weekly-'.length));
  var action = isInterview ? 'post' : 'weeklyPost';

  var meta = null;
  try {
    var apiUrl = API_BASE_URL + (API_BASE_URL.indexOf('?') === -1 ? '?' : '&') +
      'action=' + action + '&id=' + encodeURIComponent(id);
    var apiRes = await fetch(apiUrl);
    var data = await apiRes.json();

    if (data && !data.isLocked) {
      if (isInterview) {
        var artistName = String(data.artist || 'Interview').replace(/\(Audio\)/gi, '').replace(/\(Double\)/gi, '').trim();
        meta = {
          title: artistName + ' — Indie Monday',
          description: data.interviewer ? 'Interviewed by ' + data.interviewer + '.' : 'An Indie Monday interview.',
          image: data.image || ''
        };
      } else {
        var issueLabel = data.issueNum ? ('Issue #' + String(data.issueNum).replace(/[^0-9]/g, '')) : 'Weekly Post';
        meta = {
          title: 'Indie Monday — ' + issueLabel,
          description: data.author ? 'Written by ' + data.author + '.' : 'This week on Indie Monday.',
          image: data.image || ''
        };
      }
    }
  } catch (e) {
    return context.next();
  }

  if (!meta) {
    return context.next();
  }

  var response = await context.next();
  var pageUrl = url.toString();

  var rewriter = new HTMLRewriter()
    .on('title', {
      element: function (el) {
        el.setInnerContent(meta.title);
      }
    })
    .on('head', {
      element: function (el) {
        el.append(metaTag('og:title', meta.title), { html: true });
        el.append(metaTag('og:description', meta.description), { html: true });
        el.append(metaTag('og:type', 'article'), { html: true });
        el.append(metaTag('og:url', pageUrl), { html: true });
        if (meta.image) el.append(metaTag('og:image', meta.image), { html: true });

        el.append(metaTagName('twitter:card', meta.image ? 'summary_large_image' : 'summary'), { html: true });
        el.append(metaTagName('twitter:title', meta.title), { html: true });
        el.append(metaTagName('twitter:description', meta.description), { html: true });
        if (meta.image) el.append(metaTagName('twitter:image', meta.image), { html: true });
      }
    });

  return rewriter.transform(response);
}

function metaTag(property, content) {
  return '<meta property="' + escapeAttr(property) + '" content="' + escapeAttr(content) + '">';
}

function metaTagName(name, content) {
  return '<meta name="' + escapeAttr(name) + '" content="' + escapeAttr(content) + '">';
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
