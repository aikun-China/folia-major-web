// Pages Function: proxy /sync-api/* to Cloudflare Worker (folia-sync)
// Internal Cloudflare network call, avoids workers.dev being blocked in China
const WORKER_URL = 'https://folia-sync.761695424.workers.dev';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  // Build the target URL on the worker
  const path = params.path ? params.path.join('/') : '';
  const targetUrl = `${WORKER_URL}/${path}${url.search}`;

  // Forward headers (drop host, connection, content-length)
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  // Forward the request
  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  try {
    const response = await fetch(targetUrl, init);
    const respHeaders = new Headers(response.headers);
    // Remove CORS restrictions since this is same-origin proxy
    respHeaders.set('Access-Control-Allow-Origin', url.origin);
    respHeaders.set('Access-Control-Allow-Credentials', 'true');
    respHeaders.set('Vary', 'Origin');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: respHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Sync proxy failed', details: String(error) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
