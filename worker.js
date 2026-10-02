export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const apiBaseUrl = env.API_BASE_URL || 'https://supply-chain-9fnl.onrender.com';
      const targetUrl = new URL(url.pathname + url.search, apiBaseUrl);

      try {
        return await fetch(new Request(targetUrl, request));
      } catch {
        return new Response('Error connecting to backend API', { status: 502 });
      }
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const isSpaRoute = request.method === 'GET'
      && !url.pathname.includes('.')
      && assetResponse.status === 404;

    if (isSpaRoute) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }

    return assetResponse;
  },
};
