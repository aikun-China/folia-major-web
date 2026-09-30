// Pages Function: proxy /ncm-api/* to Vercel Netease Cloud Music API
const NCM_API_URL = 'https://netease-api-three-gray.vercel.app';
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 800;

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);

  const path = params.path ? params.path.join('/') : '';
  const targetUrl = `${NCM_API_URL}/${path}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');
  // Vercel doesn't like these headers
  headers.delete('expect');
  headers.delete('origin');
  headers.delete('referer');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  const isIdempotent = request.method === 'GET' || request.method === 'HEAD';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(targetUrl, init);
      // Retry on server errors for idempotent requests
      if (isIdempotent && response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      const respHeaders = new Headers(response.headers);
      // Allow credentials (cookies) for same-origin proxy
      respHeaders.set('Access-Control-Allow-Origin', url.origin);
      respHeaders.set('Access-Control-Allow-Credentials', 'true');
      respHeaders.set('Vary', 'Origin');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    } catch (error) {
      // Retry on network failures for idempotent requests
      if (isIdempotent && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      return new Response(JSON.stringify({ error: 'NCM API proxy failed', details: String(error) }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
}

