# Folia（网页端）

[https://github.com/chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的二次开发版本 —— 本仓库的全部修改均以此为出处，与上游无从属关系。

- **线上实例**：[music.aikun-bili.top](https://music.aikun-bili.top)
- **安卓客户端**：[aikun-China/folia-major-apk](https://github.com/aikun-China/folia-major-apk)（WebView 混合壳，安装包见其 [Releases](https://github.com/aikun-China/folia-major-apk/releases)）

## 简介

Folia 是一款以全屏沉浸式歌词播放为核心的在线音乐播放器，支持网易云、酷狗、Navidrome 和本地音乐库，提供智能歌词匹配、AI 配色主题与多种全屏歌词动画。本项目基于上游二次开发，除下列修改外其余内容与上游保持一致。

## 相对上游的主要修改

- **设置同步重构**：删去「登录设备 / 全设备同步」，改为以网易云账号 UID 为唯一检索依据（请求头 `X-Sync-UID`，服务端按 UID 隔离数据）
- **同步策略**：未登录仅本地缓存；登录后优先云端设置，云端无数据则沿用本地设置
- **同步字段扩展**：主题偏好 7 项 + 网易云登录凭证（Cookie）跨设备同步，换设备免重新扫码
- **同步响应性**：localStorage 驱动的设置同步后即时刷新 UI（`folia-settings-synced` 事件）
- **敏感信息治理**：同步令牌改为 `VITE_SYNC_TOKEN` 环境变量注入，任何密钥不入库
- **部署署名**：设置 → 帮助页下方添加「由愛君_aikun部署」（[了解此人](https://aikun-bili.top)）
- **全云端部署**：Cloudflare Pages（前端）+ Vercel（网易云 API）+ Workers + D1（同步），一键脚本 `deploy-cloud.ps1`
- **构建修复**：修复上游 `vite.config.ts` 中 preview CDN 缓存配置被 Vite 忽略的问题

## 部署与本地开发

- 技术栈：React 19 + Vite 8 + TypeScript 7，Node.js ≥ 24
- 本地开发：`npm install` → `npm run dev`
- 云端部署：`deploy-cloud.ps1`（同步令牌经 `-SyncToken` 参数或 `SYNC_TOKEN` 环境变量传入，不入库）

## 许可

遵循上游项目的 AGPL-3.0 许可证。
