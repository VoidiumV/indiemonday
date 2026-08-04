/**
 * Cloudflare Pages Function — same-origin proxy to the Apps Script API.
 *
 * WHY THIS EXISTS
 * The frontend used to call script.google.com directly from the browser
 * via a JSONP <script> tag. In practice, a lot of browsers, privacy
 * extensions (Brave Shields, uBlock Origin, Safari Intelligent Tracking
 * Prevention), and corporate/security proxies specifically block or
 * strip requests to script.google.com / script.googleusercontent.com,
 * because those domains are heavily abused by phishing kits and sit on
 * shared blocklists. For anyone caught by one of those, every list on
 * the site failed with "Network error contacting API for ...", and
 * staff logins silently dropped on reload too — the "am I still logged
 * in?" check (`verifySession`) is just another one of those blocked
 * requests, so it fails, and the frontend correctly (but incorrectly
 * for the visitor's actual situation) treats that as "not logged in".
 * That's what looked like an auto-logout on closing/reopening tabs —
 * it wasn't the 6-hour session TTL, it was this same request-blocking
 * issue showing up on the first API call after reload.
 *
 * WHAT THIS DOES
 * The browser now only ever talks to its own origin, at /api. This
 * function receives that request on Cloudflare's network and makes the
 * real call to Apps Script from there — server to server, which is
 * never subject to a visitor's local browser extensions or their
 * network's security appliances. It forwards every query param
 * unchanged (action, id, token, password, etc.) and passes the JSON
 * response straight back through.
 */

var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbzSd8HQAhYgwVCWWU3aRg_3lKQfpIjDgJgeHIHwOULrYrSdWCzBR0vSL2YOyTBZ6m49/exec';

export async function onRequestGet(context) {
  var incomingUrl = new URL(context.request.url);
  var target = new URL(API_BASE_URL);

  // Forward every query param the frontend sent (action, id, token,
  // password, etc). Drop "callback" — that was only ever needed for the
  // old JSONP transport, and Apps Script would otherwise wrap the JSON
  // response in a function call we no longer want.
  incomingUrl.searchParams.forEach(function (value, key) {
    if (key === 'callback') return;
    target.searchParams.set(key, value);
  });

  try {
    var apiRes = await fetch(target.toString(), { method: 'GET' });
    var text = await apiRes.text();

    return new Response(text, {
      status: apiRes.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        // Staff sessions and view counts are per-request state — never
        // let Cloudflare or the browser cache an /api response.
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: 'Could not reach the API: ' + String(err && err.message ? err.message : err)
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }
    );
  }
}
