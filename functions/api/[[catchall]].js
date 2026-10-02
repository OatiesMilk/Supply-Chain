export async function onRequest(context) {
  // context.env.API_BASE_URL should be set in Cloudflare Pages settings
  // Example: https://supply-chain-backend.onrender.com
  const API_BASE_URL = context.env.API_BASE_URL;
  if (!API_BASE_URL) {
    return new Response("API_BASE_URL is not configured in Cloudflare Pages", { status: 500 });
  }

  // Rewrite the request URL to point to the backend
  const url = new URL(context.request.url);
  const targetUrl = new URL(url.pathname + url.search, API_BASE_URL);

  const newRequest = new Request(targetUrl, context.request);
  
  // Forward the request to the backend
  try {
    return await fetch(newRequest);
  } catch (error) {
    return new Response("Error connecting to backend API", { status: 502 });
  }
}
