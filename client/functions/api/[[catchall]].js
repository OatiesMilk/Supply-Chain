export async function onRequest(context) {
  // Use environment variable if set, otherwise fallback to the hardcoded Render URL for staging
  const API_BASE_URL = context.env.API_BASE_URL || "https://supply-chain-9fnl.onrender.com";

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
