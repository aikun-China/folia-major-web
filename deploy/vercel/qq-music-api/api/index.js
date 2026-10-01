import handleRequest from '@yakult-green-tea/qq-music-api/serverless';

export const config = { runtime: 'edge' };

// 独立域名跨源部署：主仓库 api/qq.js 走同源 `/api/qq` 不需要 CORS，
// 这里作为外部 API 服务被前端 `VITE_QQ_API_BASE` 直连（credentials: omit），
// 必须补 `Access-Control-Allow-Origin: *`，浏览器才能读取响应体。
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-QQ-Session',
    'Access-Control-Max-Age': '86400',
};

export default async function handler(request) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const params = new URLSearchParams(url.search);
    const path = params.get('path') ?? '';
    params.delete('path');
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const search = params.toString();
    const target = new URL(`${normalized}${search ? `?${search}` : ''}`, url.origin);
    // 用原请求构造新请求，method / headers / body 全部保留：`X-QQ-Session` 靠这里带到后端。
    const response = await handleRequest(new Request(target, request), {
        QQ_SESSION_SECRET: process.env.QQ_SESSION_SECRET,
        QQ_SESSION_SECRET_PREVIOUS: process.env.QQ_SESSION_SECRET_PREVIOUS,
    });
    const headers = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
