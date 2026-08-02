/**
 * Cloudflare Pages Function — per-page Open Graph / Twitter Card tags.
 *
 * WHY THIS EXISTS
 * Indie Monday is a client-rendered single-page app: every URL (e.g.
 * /interview-12) is actually served the same static index.html, and the
 * real title/image only appears after JavaScript runs and fetches data
 * from the Apps Script API. That's fine for real visitors, but link-preview
 * bots (Facebook, Twitter/X, Slack, Discord, iMessage, etc.) don't run JS —
 * they only ever see the raw HTML you send them. Without this, every shared
 * link shows the same generic site-wide preview instead of the artist's
 * name/photo.
 *
 * WHAT THIS DOES
 * For requests to /interview-* or /article-*(/weekly-*) whose User-Agent
 * matches a known crawler, this fetches that post's data from the same
 * Apps Script API the frontend uses, then rewrites the <title> and
 * <meta property="og:..."> / <meta name="twitter:..."> tags in the HTML
 * response before it goes out — using HTMLRewriter, which streams the
 * rewrite without re-downloading or re-parsing the whole page.
 * Regular visitors (non-bot User-Agents) are untouched and get the normal
 * cached SPA response.
 *
 * ONE-TIME SETUP
 * 1. Commit this file as-is to your repo at: functions/_middleware.js
 *    (sibling to index.html and _redirects — Cloudflare Pages auto-detects
 *    anything under a top-level "functions" folder, no build config needed).
 * 2. Set API_BASE_URL below to the EXACT same Apps Script /exec URL you put
 *    in index.html's API_BASE_URL.
 * 3. Push to your connected branch — Cloudflare Pages redeploys automatically.
 * 4. Test it: use a tool like https://www.opengraph.xyz or
 *    https://cards-dev.twitter.com/validator against a real interview URL
 *    (a plain browser visit won't show you the bot-only behavior).
 */

var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbwEHBMF7-ZXETA3ThI_BShWek5AcFXBKkDPXx2LWWTTQ2FI86i2WFH4SYSv82mB1ZbN/exec';

var BOT_UA_PATTERN = /(facebookexternalhit|twitterbot|slackbot|discordbot|linkedinbot|whatsapp|telegrambot|pinterest|redditbot|skypeuripreview|vkshare|w3c_validator|embedly|quora link preview|outbrain|nuzzel|flipboard|tumblr|bitlybot|iframely)/i;

export async function onRequest(context) {
  var request = context.request;
  var url = new URL(request.url);
  var path = url.pathname.replace(/^\/+|\/+$/g, '');

  var isInterview = path.indexOf('interview-') === 0;
  var isWeekly = path.indexOf('article-') === 0 || path.indexOf('weekly-') === 0;

  // Not a shareable post page — nothing to inject, hand off as normal.
  if (!isInterview && !isWeekly) {
    return context.next();
  }

  var ua = (request.headers.get('user-agent') || '');
  if (!BOT_UA_PATTERN.test(ua)) {
    return context.next();
  }

  if (!API_BASE_URL || API_BASE_URL.indexOf('PASTE_YOUR') === 0) {
    // Not configured yet — fall through rather than break the page.
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
    // API call failed — fall through to the default site-wide tags rather
    // than serve a broken page.
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
