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
  'Access-Control-Allow-Headers': 'Content-Type, X-QQ-Session, X-QQ-Cookie',
  'Access-Control-Max-Age': '86400',
};

// ===== qqbot 点歌插件适配层 =====
// npm 包任何形态（serverless 白名单 / Koa 路由表）都没有 /search 与 /getSongUrl，
// 但插件按这两个路径调用——在此直连 QQ 上游实现别名路由。
// 响应为超集形状：result/code/data 外加 url、playUrl 顶层冗余，兼容多种解析习惯。

const UPSTREAM_MUSICU = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const UPSTREAM_COMMON: Record<string, string> = {
  g_tk: '5381',
  loginUin: '0',
  hostUin: '0',
  inCharset: 'utf8',
  outCharset: 'utf-8',
  notice: '0',
  platform: 'yqq.json',
  needNewCode: '0',
};
// 固定 sign：开源实现的通用伪签名；上游风控对无 sign 请求直接 500。
const FIXED_SIGN = 'zzannc1o6o9b4i971602f3554385022046ab796512b7012';
// Workers 默认出站请求没有浏览器特征，UA/Referer 都参与风控评分。
const UPSTREAM_HEADERS: Record<string, string> = {
  Referer: 'https://y.qq.com/portal/player.html',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const pluginJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });

const upstreamError = (error: unknown): Response =>
  pluginJson(
    {
      result: 500,
      code: 502,
      success: false,
      errMsg: `upstream error: ${error instanceof Error ? error.message : String(error)}`,
    },
    502,
  );

const searchUpstream = async (
  keyword: string,
  pageNo: number,
  pageSize: number,
  debug = false,
): Promise<Response> => {
  // client_search_cp 对数据中心 IP 返回 500，改走 musicu.fcg 的网页端搜索模块（与取链同域，生产可达）。
  const data = {
    comm: { ct: 19, cv: 1859, uin: 0 },
    req_1: {
      module: 'music.search.SearchCgiService',
      method: 'DoSearchForQQMusicDesktop',
      param: { search_type: 0, query: keyword, page_num: pageNo, num_per_page: pageSize },
    },
  };
  const params = new URLSearchParams({
    format: 'json',
    sign: FIXED_SIGN,
    data: JSON.stringify(data),
    ...UPSTREAM_COMMON,
  });
  const upstream = await fetch(`${UPSTREAM_MUSICU}?${params}`, {
    headers: UPSTREAM_HEADERS,
  });
  const raw = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 响应（如风控页）保持 null，debug 透传原始 body。
  }
  const response = asRecord(parsed);
  const body = asRecord(asRecord(asRecord(asRecord(response.req_1).data).body));
  const song = asRecord(body.song);
  const rawList = Array.isArray(song.list) ? song.list : [];
  const total = Number(song.totalnum ?? rawList.length) || 0;
  // 新结构 → 经典字段映射（老客户端只认 songmid/songname/albummid 这些键）。
  const list = rawList.map(asRecord).map(item => {
    const file = asRecord(item.file);
    const album = asRecord(item.album);
    const songmid = typeof item.mid === 'string' ? item.mid : '';
    return {
      ...item,
      songmid,
      songname: item.name,
      songname_hilight: item.name,
      albumid: album.id,
      albummid: album.mid,
      albumname: album.name,
      media_mid: typeof file.mediaMid === 'string' && file.mediaMid ? file.mediaMid : songmid,
      size128: file.size_128mp3,
      size320: file.size_320mp3,
      sizeflac: file.size_flac,
    };
  });
  return pluginJson({
    result: 100,
    code: 0,
    success: true,
    data: { list, total, sum: total, pageNo, pageSize, key: keyword, t: 0, type: 'song', song },
    ...(debug ? { _debug: { upstreamStatus: upstream.status, upstreamBody: raw.slice(0, 800) } } : {}),
  });
};

const QQ_QUALITIES: Record<string, [string, string]> = {
  m4a: ['C400', '.m4a'],
  128: ['M500', '.mp3'],
  320: ['M800', '.mp3'],
  ape: ['A000', '.ape'],
  flac: ['F000', '.flac'],
};

// 取链多候选：主域被风控（purl 404）时依次回退到备用域与移动端 express 接口。
const MUSICU_HOSTS = ['https://u.y.qq.com/cgi-bin/musicu.fcg', 'https://c6.y.qq.com/cgi-bin/musicu.fcg'];
const UPSTREAM_EXPRESS = 'https://c.y.qq.com/base/fcgi-bin/fcg_music_express_mobile3.fcg';
const DEFAULT_GUID = '1429839143';

type VkeyAttempt = { upstreamStatus: number; upstreamBody: string; parsed: Record<string, any> };

const withCookie = (cookie?: string): Record<string, string> =>
  cookie ? { ...UPSTREAM_HEADERS, Cookie: cookie } : { ...UPSTREAM_HEADERS };

// 网页端同款 POST：Content-Type JSON 直发 body，无 sign（网页播放器即此形态）。
const attemptMusicuPost = async (data: Record<string, unknown>, cookie?: string): Promise<VkeyAttempt> => {
  const upstream = await fetch(UPSTREAM_MUSICU, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...withCookie(cookie) },
    body: JSON.stringify(data),
  });
  const raw = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 保持 null。
  }
  return { upstreamStatus: upstream.status, upstreamBody: raw, parsed: asRecord(parsed) };
};

const attemptMusicu = async (data: Record<string, unknown>, host: string, cookie?: string): Promise<VkeyAttempt> => {
  const params = new URLSearchParams({
    format: 'json',
    sign: FIXED_SIGN,
    data: JSON.stringify(data),
    ...UPSTREAM_COMMON,
  });
  const upstream = await fetch(`${host}?${params}`, {
    headers: withCookie(cookie),
  });
  const raw = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 保持 null。
  }
  return { upstreamStatus: upstream.status, upstreamBody: raw, parsed: asRecord(parsed) };
};

// 移动端 express 接口一次查一首，返回 midurlinfo 兼容形状（vkey 直接可拼 purl）。
const attemptExpress = async (songmid: string, filename: string, cookie?: string): Promise<VkeyAttempt> => {
  const params = new URLSearchParams({
    format: 'json',
    platform: 'yqq.json',
    cid: '205361747',
    songmid,
    filename,
    guid: DEFAULT_GUID,
    uin: '0',
    ...UPSTREAM_COMMON,
  });
  const upstream = await fetch(`${UPSTREAM_EXPRESS}?${params}`, {
    headers: { ...withCookie(cookie), Referer: 'https://c.y.qq.com/' },
  });
  const raw = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 保持 null。
  }
  const express = asRecord(parsed);
  const expressData = asRecord(express.data);
  const item = (Array.isArray(expressData.items) ? expressData.items : []).map(asRecord)[0];
  const vkey = typeof item?.vkey === 'string' ? item.vkey : '';
  const sip = Array.isArray(expressData.sip) ? (expressData.sip as string[]) : [];
  const purl = vkey
    ? `${filename}?guid=${DEFAULT_GUID}&vkey=${vkey}&uin=0&fromtag=8`
    : '';
  const converted = {
    req_0: {
      data: {
        sip,
        midurlinfo: [{ songmid, filename, purl }],
      },
    },
  };
  return { upstreamStatus: upstream.status, upstreamBody: raw, parsed: converted };
};

const songUrlUpstream = async (
  songmid: string,
  quality = '128',
  mediaId?: string,
  cookie?: string,
  debug = false,
  attemptPrelude: string[] = [],
): Promise<Response> => {
  const songmidList = songmid
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  if (!songmidList.length) {
    return pluginJson({ result: 500, code: 400, success: false, errMsg: 'no songmid' }, 400);
  }
  const [prefix, ext] = QQ_QUALITIES[quality] ?? QQ_QUALITIES[128] ?? ['M500', '.mp3'];
  // 标准文件名：{prefix}{mediaMid?}{songmid}{ext}，songmid 只出现一次；npm 包的重复拼接写法依赖上游模糊命中，数据中心 IP 会 404。
  const filenameList = songmidList.map(mid => `${prefix}${mediaId || ''}${mid}${ext}`);
  const data = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: filenameList,
        guid: DEFAULT_GUID,
        songmid: songmidList,
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20',
      },
    },
    loginUin: '0',
    comm: { uin: '0', format: 'json', ct: 24, cv: 0 },
  };
  const attempts: Array<() => Promise<VkeyAttempt>> = [
    () => attemptMusicuPost(data, cookie),
    ...MUSICU_HOSTS.map(host => () => attemptMusicu(data, host, cookie)),
    ...songmidList.map((mid, index) => () => attemptExpress(mid, filenameList[index], cookie)),
  ];
  let picked: VkeyAttempt | undefined;
  const attemptLog: string[] = [...attemptPrelude];
  for (const run of attempts) {
    const attempt = await run();
    const info = asRecord(asRecord(asRecord(attempt.parsed.req_0).data));
    const midurlinfo = Array.isArray(info.midurlinfo) ? info.midurlinfo : [];
    const hasUrl = midurlinfo.map(asRecord).some(item => typeof item.purl === 'string' && item.purl);
    attemptLog.push(`${attempt.upstreamStatus}:${hasUrl ? 'hit' : 'miss'}:${attempt.upstreamBody.slice(0, 120)}`);
    if (hasUrl) {
      picked = attempt;
      break;
    }
    if (!picked) {
      picked = attempt;
    }
  }
  const chosen = picked ?? { upstreamStatus: 502, upstreamBody: 'all vkey attempts failed', parsed: {} };
  const info = asRecord(asRecord(asRecord(chosen.parsed.req_0).data));
  const sip = Array.isArray(info.sip) ? (info.sip as string[]) : [];
  const domain = sip.find(item => !item.startsWith('http://ws')) ?? sip[0] ?? '';
  const playUrl: Record<string, { url: string; error?: string }> = {};
  let url = '';
  let vkey = '';
  for (const item of (Array.isArray(info.midurlinfo) ? info.midurlinfo : []).map(asRecord)) {
    const purl = typeof item.purl === 'string' ? item.purl : '';
    const full = purl ? `${domain}${purl}` : '';
    playUrl[String(item.songmid ?? '')] = purl ? { url: full } : { url: '', error: '暂无播放链接' };
    if (full && !url) {
      url = full;
      vkey = new URLSearchParams(purl.split('?')[1] ?? '').get('vkey') ?? '';
    }
  }
  return pluginJson({
    result: 100,
    code: 0,
    success: true,
    data: { url, vkey, domain, playUrl },
    url,
    playUrl,
    ...(debug
      ? { _debug: { attempts: attemptLog, upstreamStatus: chosen.upstreamStatus, upstreamBody: chosen.upstreamBody.slice(0, 1600) } }
      : {}),
  });
};

// 登录态取链：sealed 会话（qqmusic_session=...）是本服务的 AES-GCM 会话令牌，不是 QQ 登录
// cookie——原样当 Cookie 头传上游无效。转发给包的 /getMusicPlay 认证链路：authTokenOf 从
// ?cookie= 剥出 token → 解封凭据 → 以 Android App 形态（App UA + 四元组 Cookie +
// music.vkey.GetVkey 模块）请求上游。数据中心 IP 的匿名取链被 104003 身份风控，只有这条链能解。
// 响应 {data:{playUrl}} 重塑成 /getSongUrl 超集；拿不到播放链接时返回 note 交匿名候选链兜底。
type AuthSongUrlOutcome = { response?: Response; note?: string };

const authenticatedSongUrl = async (
  env: Env,
  origin: string,
  songmid: string,
  quality: string,
  mediaId: string | undefined,
  cookie: string,
  debug = false,
): Promise<AuthSongUrlOutcome> => {
  const forward = new URL(`${origin}/getMusicPlay/${encodeURIComponent(songmid)}`);
  forward.searchParams.set('quality', quality);
  if (mediaId) forward.searchParams.set('mediaId', mediaId);
  forward.searchParams.set('cookie', cookie);
  const response = await handleRequest(
    new Request(forward),
    {
      QQ_SESSION_SECRET: env.QQ_SESSION_SECRET,
      QQ_SESSION_SECRET_PREVIOUS: env.QQ_SESSION_SECRET_PREVIOUS,
    },
    { qqRelay: relayFor(env) },
  );
  const raw = await response.text();
  const note = `package-auth:miss(${response.status}):${raw.slice(0, 160)}`;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 非 JSON 响应按失败处理，落匿名链兜底。
  }
  // 包返回 playUrl[mid] = { url: 完整链接, error: false | '暂无播放链接' }；
  // error:false 归一化为匿名形状（成功不带 error 字段），domain/vkey 从完整链接反解。
  const playUrlRaw = asRecord(asRecord(asRecord(parsed).data).playUrl);
  const playUrl: Record<string, { url: string; error?: string }> = {};
  let link = '';
  let vkey = '';
  let domain = '';
  for (const [mid, entry] of Object.entries(playUrlRaw)) {
    const info = asRecord(entry);
    const full = typeof info.url === 'string' ? info.url : '';
    if (full) {
      playUrl[mid] = { url: full };
      if (!link) {
        link = full;
        domain = full.slice(0, full.lastIndexOf('/') + 1);
        vkey = new URLSearchParams(full.split('?')[1] ?? '').get('vkey') ?? '';
      }
    } else {
      playUrl[mid] = {
        url: '',
        error: typeof info.error === 'string' && info.error ? info.error : '暂无播放链接',
      };
    }
  }
  if (!link) return { note };
  return {
    response: pluginJson({
      result: 100,
      code: 0,
      success: true,
      data: { url: link, vkey, domain, playUrl },
      url: link,
      playUrl,
      ...(debug
        ? {
            _debug: {
              path: 'package-authenticated',
              packageStatus: response.status,
              packageBody: raw.slice(0, 600),
            },
          }
        : {}),
    }),
  };
};

// 插件可能 GET 也可能 POST；POST 的 JSON/表单体在此合并进参数集。
const pluginParams = async (request: Request, url: URL): Promise<URLSearchParams> => {
  const merged = new URLSearchParams(url.searchParams);
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') ?? '';
    try {
      if (contentType.includes('application/json')) {
        for (const [key, value] of Object.entries(asRecord(await request.json()))) {
          if (value !== null && value !== undefined) merged.set(key, String(value));
        }
      } else if (contentType.includes('form')) {
        new URLSearchParams(await request.text()).forEach((value, key) => merged.set(key, value));
      }
    } catch {
      // body 解析失败时按纯 query 处理。
    }
  }
  return merged;
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
    // 别名路由先行：body 只在这里消费，避免污染后续 handleRequest 的透传。
    const searchMatch = url.pathname.match(/^\/search(?:\/([^/]+))?\/?$/i);
    const songUrlMatch = url.pathname.match(/^\/getSongUrl(?:\/([^/]+))?\/?$/i);
    if (searchMatch || songUrlMatch) {
      const params = await pluginParams(request, url);
      if (searchMatch) {
        const keyword =
          (searchMatch[1] ? safeDecode(searchMatch[1]) : '') ||
          params.get('key') ||
          params.get('keyword') ||
          params.get('w') ||
          '';
        if (!keyword.trim()) {
          return pluginJson({ result: 500, code: 400, success: false, errMsg: '关键词不能为空' }, 400);
        }
        const pageNo = Number(params.get('pageNo') ?? params.get('page') ?? '1') || 1;
        const pageSize = Math.min(Number(params.get('pageSize') ?? params.get('limit') ?? '20') || 20, 100);
        const debug = params.get('debug') === '1' || params.get('debug') === 'true';
        try {
          return await searchUpstream(keyword.trim(), pageNo, pageSize, debug);
        } catch (error) {
          return upstreamError(error);
        }
      }
      const songmid =
        (songUrlMatch && songUrlMatch[1] ? safeDecode(songUrlMatch[1]) : '') ||
        params.get('songmid') ||
        params.get('songId') ||
        params.get('id') ||
        '';
      if (!songmid.trim()) {
        return pluginJson({ result: 500, code: 400, success: false, errMsg: 'no songmid' }, 400);
      }
      // 登录态分流：sealed 会话（qqmusic_session=...）转发包认证链路（解封 + Android 形态取链），
      // 其余值（人工配置的原始 QQ cookie 片段）仍以 Cookie 头直传匿名候选链；认证失败落匿名兜底。
      const cookie =
        request.headers.get('x-qq-cookie') || params.get('cookie') || params.get('q') || undefined;
      const quality = params.get('quality') ?? '128';
      const mediaId = params.get('mediaId') ?? undefined;
      const debug = params.get('debug') === '1' || params.get('debug') === 'true';
      const sealed = typeof cookie === 'string' && /(?:^|;\s*)qqmusic_session=/.test(cookie);
      let authNote: string | undefined;
      if (sealed && cookie) {
        try {
          const outcome = await authenticatedSongUrl(
            env,
            url.origin,
            songmid.trim(),
            quality,
            mediaId,
            cookie,
            debug,
          );
          if (outcome.response) return outcome.response;
          authNote = outcome.note;
        } catch (error) {
          // 认证链路异常（如 secret 未配置）不致命：落回匿名候选链。
          authNote = `package-auth:error:${error instanceof Error ? error.message : String(error)}`;
        }
      }
      try {
        return await songUrlUpstream(
          songmid.trim(),
          quality,
          mediaId,
          sealed ? undefined : cookie,
          debug,
          authNote ? [authNote] : [],
        );
      } catch (error) {
        return upstreamError(error);
      }
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
