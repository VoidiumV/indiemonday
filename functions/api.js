/**
 * Cloudflare Pages Function
 */

var API_BASE_URL = 'https://script.google.com/macros/s/AKfycbz1iYYp6t_XWZVyve3HcEHMeGML3hNkMQdOoITRggvB7c45zml4XMnkBuBL7h1nAbMA/exec';

export async function onRequestGet(context) {
  var incomingUrl = new URL(context.request.url);
  var target = new URL(API_BASE_URL);

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
