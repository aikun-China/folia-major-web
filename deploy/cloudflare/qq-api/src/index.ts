import handleRequest, { type QqQrRelay, type QrEvent } from '@yakult-green-tea/qq-music-api/serverless';
import { QqQrChannel } from './qqQrChannel';

// DO 类必须从 main 入口导出：durable_objects binding 由 wrangler 在这里找实现。
export { QqQrChannel };

/**
 * 独立域名部署形态（qqmusicapi.aikun-bili.top 整域交由此 Worker）：
 * 前端直连本 Worker，没有主仓库整站 Worker 的 `/api/qq` 前缀，pathname 原样透传给后端。
 * 与主仓库 worker/qq.ts 的差异仅在前缀剥离与这里的 CORS 层（独立域名跨源直连必需）。
 */

export type Env = {
  QQ_SESSION_SECRET?: string;
  QQ_SESSION_SECRET_PREVIOUS?: string;
  /** QQ 扫码通道的 DO namespace；没绑定或没 secret 时只有微信扫码（能力声明不是错误）。 */
  QQ_QR_CHANNEL?: DurableObjectNamespaceLike;
};

/** 只声明用得到的那两个成员；不引入 @cloudflare/workers-types。 */
type DurableObjectNamespaceLike = {
  idFromName(name: string): DurableObjectIdLike;
  get(id: DurableObjectIdLike): { fetch(request: Request): Promise<Response> };
};

type DurableObjectIdLike = { toString(): string };

// 对象名不直接用 qrcodeId（它印在二维码图里，扫过的人都知道），用 HMAC 派生不可猜的名字。
const channelName = async (qrcodeId: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`qr:${qrcodeId}`));
  return [...new Uint8Array(mac)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

// 把 DO 包成后端认识的中性 QqQrRelay：协议与 codec 在 qq-music-api 包里，binding 细节留在这一层。
const createDurableObjectRelay = (namespace: DurableObjectNamespaceLike, secret: string): QqQrRelay => {
  const call = async (qrcodeId: string, operation: string, body?: unknown): Promise<Response> => {
    const stub = namespace.get(namespace.idFromName(await channelName(qrcodeId, secret)));
    return stub.fetch(
      new Request(`https://qq-qr-channel${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      }),
    );
  };
  const expectOk = async (response: Response, what: string): Promise<Record<string, unknown>> => {
    if (!response.ok) throw new Error(`QQ QR channel ${what} failed: HTTP ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };
  return {
    open: async (qrcodeId, image, ttlMs) => {
      await expectOk(await call(qrcodeId, '/open', { qrcodeId, image, ttlMs }), 'open');
    },
    image: async qrcodeId => String((await expectOk(await call(qrcodeId, '/image'), 'image')).image ?? ''),
    poll: async (qrcodeId, budgetMs) => {
      const body = await expectOk(await call(qrcodeId, '/poll', { budgetMs }), 'poll');
      return Array.isArray(body.events) ? (body.events as QrEvent[]) : [];
    },
    close: async qrcodeId => {
      await expectOk(await call(qrcodeId, '/close'), 'close');
    },
  };
};

// 有 binding **且**有 secret 才提供 relay：没 secret 时登录路由本来就 501，宣告必败通道只会让人白扫。
const relayFor = (env: Env): QqQrRelay | undefined =>
  env.QQ_QR_CHANNEL && env.QQ_SESSION_SECRET
    ? createDurableObjectRelay(env.QQ_QR_CHANNEL, env.QQ_SESSION_SECRET)
    : undefined;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-QQ-Session',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    // 后端路由表没有 `/`，根路径直接返回服务状态，兼作健康检查。
    if (url.pathname === '/') {
      return new Response(
        JSON.stringify(
          {
            name: 'folia-qq-music-api',
            status: 'ok',
            service: 'QQ 音乐 API（Folia / music.aikun-bili.top）',
            runtime: 'cloudflare-workers+durable-object',
            loginChannels: 'qq+wechat',
            endpoints: [
              '/login/channels',
              '/login/qr/key',
              '/login/qr/check',
              '/search/:key',
              '/getSongInfo/:id',
              '/getSongUrl/:id',
            ],
          },
          null,
          2,
        ),
        { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS } },
      );
    }
    const response = await handleRequest(
      // method / headers / body 全部保留：`X-QQ-Session` 就是靠这里带到后端的。
      new Request(new URL(`${url.pathname}${url.search}`, url.origin), request),
      {
        QQ_SESSION_SECRET: env.QQ_SESSION_SECRET,
        QQ_SESSION_SECRET_PREVIOUS: env.QQ_SESSION_SECRET_PREVIOUS,
      },
      { qqRelay: relayFor(env) },
    );
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
