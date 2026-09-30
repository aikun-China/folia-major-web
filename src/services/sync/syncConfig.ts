import { SYNC_PROVIDER, type SyncProviderConfig, type SyncRuntimeStatus } from './syncTypes';

// src/services/sync/syncConfig.ts
// Local persistence for user-owned sync server settings and runtime status.

const SYNC_CONFIG_STORAGE_KEY = 'folia_sync_config_v1';
const SYNC_STATUS_STORAGE_KEY = 'folia_sync_status_v1';
const SYNC_CONFIG_EVENT = 'folia-sync-config-changed';
const SYNC_STATUS_EVENT = 'folia-sync-status-changed';

// 内置同步配置：所有设备自动使用此配置，无需手动输入
// Cloudflare Pages 部署时通过 VITE_SYNC_API_BASE 环境变量指向 Workers
// 本地开发时使用相对路径 /sync-api，由 preview-server.mjs 代理到 sync-server
const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
const SYNC_API_BASE = (viteEnv && viteEnv.VITE_SYNC_API_BASE) ? viteEnv.VITE_SYNC_API_BASE : '/sync-api';
// 同步令牌通过 VITE_SYNC_TOKEN 环境变量注入（.env.local / Cloudflare Pages 环境变量），
// 禁止写入源码仓库；未设置时 authToken 为空，isSyncConfigured 会自动判定同步未启用。
const SYNC_AUTH_TOKEN = (viteEnv && viteEnv.VITE_SYNC_TOKEN) ? viteEnv.VITE_SYNC_TOKEN : '';

const DEFAULT_CONFIG: SyncProviderConfig = {
    provider: SYNC_PROVIDER,
    enabled: true,
    workerBaseUrl: SYNC_API_BASE,
    authToken: SYNC_AUTH_TOKEN,
};

const DEFAULT_STATUS: SyncRuntimeStatus = {
    state: 'idle',
    lastSyncAt: null,
    lastError: null,
};

const isBrowser = () => typeof window !== 'undefined';

const readJson = <T,>(key: string, fallback: T): T => {
    if (!isBrowser()) {
        return fallback;
    }

    const stored = window.localStorage.getItem(key);
    if (!stored) {
        return fallback;
    }

    try {
        return JSON.parse(stored) as T;
    } catch {
        return fallback;
    }
};

const emitEvent = (eventName: string) => {
    if (isBrowser()) {
        window.dispatchEvent(new Event(eventName));
    }
};

export const getSyncConfig = (): SyncProviderConfig => {
    // 内置配置始终优先，忽略 localStorage 中的所有用户配置
    // URL、Token、启用状态全部使用内置值，确保所有设备一致
    return {
        ...DEFAULT_CONFIG,
        provider: SYNC_PROVIDER,
        enabled: DEFAULT_CONFIG.enabled,
    };
};

export const saveSyncConfig = (config: SyncProviderConfig) => {
    if (!isBrowser()) {
        return;
    }

    window.localStorage.setItem(SYNC_CONFIG_STORAGE_KEY, JSON.stringify({
        provider: SYNC_PROVIDER,
        enabled: config.enabled,
        workerBaseUrl: config.workerBaseUrl.trim().replace(/\/+$/, ''),
        authToken: config.authToken.trim(),
    }));
    emitEvent(SYNC_CONFIG_EVENT);
};

export const isSyncConfigured = (config = getSyncConfig()) => (
    config.enabled && Boolean(config.workerBaseUrl && config.authToken)
);

export const getSyncStatus = (): SyncRuntimeStatus => readJson(SYNC_STATUS_STORAGE_KEY, DEFAULT_STATUS);

export const setSyncStatus = (patch: Partial<SyncRuntimeStatus>) => {
    if (!isBrowser()) {
        return;
    }

    const next = {
        ...getSyncStatus(),
        ...patch,
    };
    window.localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(next));
    emitEvent(SYNC_STATUS_EVENT);
};

export const subscribeSyncConfig = (listener: () => void) => {
    if (!isBrowser()) {
        return () => undefined;
    }

    window.addEventListener(SYNC_CONFIG_EVENT, listener);
    return () => window.removeEventListener(SYNC_CONFIG_EVENT, listener);
};

export const subscribeSyncStatus = (listener: () => void) => {
    if (!isBrowser()) {
        return () => undefined;
    }

    window.addEventListener(SYNC_STATUS_EVENT, listener);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, listener);
};
