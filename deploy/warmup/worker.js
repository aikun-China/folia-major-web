/**
 * Folia Warmup Worker
 * 定时 ping Vercel NCM API 和 Cloudflare Sync Worker，防止冷启动
 */

const NCM_API_URL = 'https://netease-api-three-gray.vercel.app';
const SYNC_WORKER_URL = 'https://folia-sync.761695424.workers.dev';

async function warmup() {
  const results = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    // 1. Ping Vercel NCM API (主要冷启动源)
    try {
      const res = await fetch(`${NCM_API_URL}/search?keywords=warmup`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'folia-warmup' }
      });
      results.push({ ncm: res.status });
    } catch (e) {
      results.push({ ncm_error: String(e).slice(0, 100) });
    }

    // 2. Ping Sync Worker
    try {
      const res = await fetch(`${SYNC_WORKER_URL}/health`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'folia-warmup' }
      });
      results.push({ sync: res.status });
    } catch (e) {
      results.push({ sync_error: String(e).slice(0, 100) });
    }
  } finally {
    clearTimeout(timeout);
  }

  console.log('[warmup]', JSON.stringify(results));
  return results;
}

export default {
  // Cron 触发器入口
  async scheduled(event, env, ctx) {
    ctx.waitUntil(warmup());
  },

  // HTTP 入口（手动触发/调试）
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/warmup') {
      const results = await warmup();
      return new Response(JSON.stringify({ ok: true, results }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('folia-warmup worker alive', { status: 200 });
  }
};
