import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = 3000;
const API_TARGET = 'http://127.0.0.1:3300';
const SYNC_TARGET = 'http://127.0.0.1:8787';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
};

// 带 hash 的静态资源：长期缓存
const HASHED_RE = /^\/assets\/.+-[A-Za-z0-9_-]+\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico|wasm)$/;

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';

  // API 代理
  if (url.startsWith('/ncm-api')) {
    const targetPath = url.replace(/^\/ncm-api/, '');
    const targetUrl = new URL(targetPath || '/', API_TARGET);

    try {
      // 读取请求体（如果有）
      let body = undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks);
        if (body.length === 0) body = undefined;
      }

      // 过滤掉不兼容的 header，只传递必要的
      const skipHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'expect']);
      const proxyHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!skipHeaders.has(key.toLowerCase())) {
          proxyHeaders[key] = value;
        }
      }

      const apiRes = await fetch(targetUrl, {
        method: req.method,
        headers: proxyHeaders,
        body: body ? body.toString('utf8') : undefined,
        redirect: 'manual',
      });

      res.writeHead(apiRes.status, Object.fromEntries(apiRes.headers));
      const buf = Buffer.from(await apiRes.arrayBuffer());
      res.end(buf);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    }
    return;
  }

  // Sync API 代理（多设备同步服务器）
  if (url.startsWith('/sync-api')) {
    const targetPath = url.replace(/^\/sync-api/, '');
    const targetUrl = new URL(targetPath || '/', SYNC_TARGET);
    console.log(`[sync-proxy] ${req.method} ${targetPath} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);

    try {
      // 读取请求体（如果有）
      let body = undefined;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks);
        if (body.length === 0) body = undefined;
      }

      // 过滤掉不兼容的 header，只传递必要的
      const skipHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'expect']);
      const proxyHeaders = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!skipHeaders.has(key.toLowerCase())) {
          proxyHeaders[key] = value;
        }
      }

      const apiRes = await fetch(targetUrl, {
        method: req.method,
        headers: proxyHeaders,
        body: body ? body.toString('utf8') : undefined,
        redirect: 'manual',
      });

      res.writeHead(apiRes.status, Object.fromEntries(apiRes.headers));
      const buf = Buffer.from(await apiRes.arrayBuffer());
      res.end(buf);
    } catch (err) {
      console.error('[sync-proxy error]', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Bad Gateway: ' + err.message);
    }
    return;
  }

  // 静态文件
  let filePath = path.join(DIST_DIR, url === '/' ? 'index.html' : url);
  // 防止路径穿越
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 缓存策略
    const relPath = '/' + path.relative(DIST_DIR, filePath).replace(/\\/g, '/');
    // 所有静态资源都使用 no-cache, must-revalidate，确保 Cloudflare 每次回源验证
    // 避免 immutable 缓存导致用户长期获取旧版本
    const cacheControl = 'public, max-age=0, must-revalidate';

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
        return;
      }
      const headers = {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      };
      // HTML 文件额外添加防缓存头，确保手机端也能获取最新版本
      if (ext === '.html') {
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Preview server running at http://localhost:${PORT}`);
  console.log(`  API proxy:   /ncm-api   -> ${API_TARGET}`);
  console.log(`  Sync proxy:  /sync-api  -> ${SYNC_TARGET}`);
  console.log(`  Static cache: /assets/* (hashed) = 1 year immutable`);
});
