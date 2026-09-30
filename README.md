# Folia（网页端 · 二次开发）

本仓库基于 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 二次开发，**全部修改均以此为出处**，与上游无从属关系。

- **线上实例**：[music.aikun-bili.top](https://music.aikun-bili.top)
- **安卓客户端**：[aikun-China/folia-major-apk](https://github.com/aikun-China/folia-major-apk)（WebView 壳封装本网页端，安装包见其 [Releases](https://github.com/aikun-China/folia-major-apk/releases)）

## 简介

Folia 是一款以全屏沉浸式歌词播放为核心的在线音乐播放器，支持网易云、酷狗、Navidrome 和本地音乐库。本项目以上游源码为基座二次开发，除下述修改外其余内容与上游保持一致。

## 相对上游的主要修改

以下清单提炼自开发实录（2026-09-27 ~ 2026-09-30）：

### 1. 设置同步重构 —— 以网易云账号 UID 为唯一检索依据（核心）

- 优化登陆凭证缓存与个性设置同步策略
- 新增 `src/services/sync/syncIdentity.ts`：从网易云登录态提取 UID
- `src/services/sync/syncClient.ts`：请求头注入 `X-Sync-UID`，服务端按 UID 隔离数据
- 新增 `src/services/sync/syncCoordinator.ts`：登录后先拉取云端设置，云端无数据则推送本地设置完成初始化；登出 / 未登录时为纯本地模式
- `src/services/sync/syncRepository.ts`：推送前增加 UID 门控
- 同步字段扩展 8 项（`syncTypes.ts`）：7 项主题偏好（封面取色背景、自定义主题、歌曲主题自动切换 / 自动生成、主题生成来源等）+ 网易云登录凭证 `neteaseCookie`（换设备免重新扫码；仅在远端有值时覆盖，避免误清本地有效 Cookie）
- 同步响应性修复：localStorage 驱动的设置同步写入后派发 `folia-settings-synced` 事件，`useThemeController` 监听并即时刷新 UI

### 2. 登录持久化与扫码修复

- 新增 `loginRefresh` API（`/login/refresh` 续期）；检测到 Cookie 过期（301/401/403）时自动续期并重试
- 匿名 Cookie 逻辑精细化：仅非登录端点兜底使用，认证失败时自动清理失效 Cookie
- `VITE_NETEASE_API_BASE` 改为相对路径 `/ncm-api`，前端与 API 同源，解决跨域 `SameSite` 导致扫码授权后网页停留在 801 的问题
- dev 代理 `/ncm-api` → 本地 API，`allowedHosts` 放行 `*.aikun-bili.top` 隧道域名

### 3. 全云端 Serverless 部署架构

本机不再运行任何服务，全部迁移云端：

| 组件 | 说明 |
|---|---|
| Cloudflare Pages | 前端托管（`music.aikun-bili.top`，CNAME → `folia-music.pages.dev`） |
| Vercel | 网易云 API（serverless 适配层，`maxDuration: 30`，依赖官方 npm 包 `@neteasecloudmusicapienhanced/api`） |
| Cloudflare Worker + D1 | 设置同步服务（`sync.aikun-bili.top`，D1 binding `FOLIA_SYNC_DB`，令牌经 `wrangler secret` 配置） |
| Warmup Worker | Cron `*/5` 每 5 分钟保活 NCM API 与同步 Worker（NCM 冷启动 18s+ → 1.5–3s）优化加载速度 |
| Pages Functions | `functions/ncm-api`：同源代理，5xx / 网络失败自动重试 2 次，登录 Cookie 同源携带；`functions/sync-api`：同源代理，绕开 workers.dev 国内被墙问题 |

- `vite.config.ts`：禁用 PWA 插件，根治 Service Worker 缓存导致的「卡旧加载页」；preview 为带 hash 的静态资源注入一年期 `immutable` 缓存，由 Cloudflare CDN 承担回源
- `package.json`：`build` 脚本改为先编译 `api-ts`（`tsc -p api-ts/tsconfig.json`）再执行 `vite build`
- 一键云端部署脚本 `deploy-cloud.ps1`（Vercel API → Workers + D1 → 前端构建 → Pages 发布引导）

### 4. 其他

- `vite.config.ts` 修复上游既有类型错误：`configurePreviewServer` 被误放在 preview 配置对象内（TS2353，且运行时被 Vite 忽略、CDN 缓存逻辑从未生效），封装为 `previewCacheHeadersPlugin()` 插件注册后功能真正生效
- 敏感信息治理：同步令牌改为 `VITE_SYNC_TOKEN` 环境变量注入（未设置时同步自动禁用）；部署脚本经 `-SyncToken` 参数或 `$env:SYNC_TOKEN` 传入，缺失即报错；任何令牌不入库

## 部署与本地开发

- **环境**：Node.js ≥ 24（`package.json` engines 约定）
- **本地开发**：`npm install` → `npm run dev`；`.env.local` 中 `VITE_NETEASE_API_BASE=/ncm-api` 时需同时运行本地 API（`npx cross-env PORT=3300 api`），也可直接指向云端 API 地址
- **检查 / 构建**：`npm run typecheck` / `npm run build`
- **云端部署**：`deploy-cloud.ps1`（同步令牌经 `-SyncToken` 参数传入，不入库）

## 许可

[AGPL-3.0](LICENSE)（与上游一致）。
