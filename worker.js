export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Intercept requests to /api/*
    if (url.pathname.startsWith('/api/')) {
      const API_BASE_URL = env.API_BASE_URL || "https://supply-chain-9fnl.onrender.com";
      const targetUrl = new URL(url.pathname + url.search, API_BASE_URL);
      const newRequest = new Request(targetUrl, request);
      
      try {
        return await fetch(newRequest);
      } catch (error) {
        return new Response("Error connecting to backend API", { status: 502 });
      }
    }
    
    // For all other requests, serve the static assets
    return env.ASSETS.fetch(request);
  }
};
