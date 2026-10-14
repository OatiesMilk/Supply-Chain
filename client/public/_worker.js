// AUD-003: the Worker serves the frontend, so the browser security headers for
// the HTML are set here. Keep this policy identical to CONTENT_SECURITY_POLICY
// in server/src/middleware/security.ts (server/tests/security.test.ts checks it).
const CONTENT_SECURITY_POLICY = "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data: blob:;font-src 'self' data:;connect-src 'self';frame-src 'self' blob:;object-src 'none';base-uri 'self';form-action 'self';frame-ancestors 'self' https://teams.microsoft.com https://*.teams.microsoft.com https://teams.cloud.microsoft https://*.skype.com";

function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  secured.headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  secured.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('Referrer-Policy', 'no-referrer');
  secured.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  return secured;
}

// The API believes a forwarded client address only when it comes with the
// secret it shares with this Worker, so strip any copy the browser sent.
function apiHeaders(request, env) {
  const headers = new Headers(request.headers);
  headers.delete('x-mg-proxy-secret');
  headers.delete('x-mg-client-ip');
  const clientIp = request.headers.get('cf-connecting-ip');
  if (env.PROXY_SHARED_SECRET && clientIp) {
    headers.set('x-mg-proxy-secret', env.PROXY_SHARED_SECRET);
    headers.set('x-mg-client-ip', clientIp);
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // No built-in fallback host: an unset target must fail visibly instead
      // of quietly sending this deployment's traffic to whichever API was
      // once written here.
      if (!env.API_BASE_URL) {
        return Response.json({ error: 'API proxy is not configured' }, { status: 503 });
      }

      try {
        const targetUrl = new URL(url.pathname + url.search, env.API_BASE_URL);
        return await fetch(new Request(new Request(targetUrl, request), { headers: apiHeaders(request, env) }));
      } catch {
        return new Response('Error connecting to backend API', { status: 502 });
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const isSpaRoute = request.method === 'GET'
      && !url.pathname.includes('.')
      && assetResponse.status === 404;

    if (isSpaRoute) {
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request)));
    }

    return withSecurityHeaders(assetResponse);
  },
};
