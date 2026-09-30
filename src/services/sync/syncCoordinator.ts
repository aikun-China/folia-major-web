import { getSyncConfig, isSyncConfigured, setSyncStatus } from './syncConfig';
import { getRemoteState, getRemoteSettings, testSyncConnection } from './syncClient';
import type { SyncProviderConfig } from './syncTypes';
import { applySyncedVisualSettings, buildSyncedSettingsRecord, readSyncableSettingsState } from './settingsSnapshot';
import {
    fetchRemoteSyncState,
    listAllRemoteThemeRecords,
    mergeLocalThemesIntoRecords,
    pushMissingLocalThemesToRemote,
    pushRemoteSettings,
    pushSyncLibraryBundleToRemote,
    saveSyncLibraryBundleToLocalCache,
} from './syncRepository';
import { parseSyncLibraryExportBundle } from './syncSchema';
import type { SyncLibraryExportBundle, SyncRemoteState } from './syncTypes';
import { SYNC_SCHEMA_VERSION } from './syncTypes';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import {
    getCurrentSyncUid,
    resolveNeteaseUidFromAccountStore,
    setCurrentSyncUid,
} from './syncIdentity';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore } from '../../stores/useTypographySettingsStore';
import { useLyricSettingsStore } from '../../stores/useLyricSettingsStore';
import { useHomeLayoutSettingsStore } from '../../stores/useHomeLayoutSettingsStore';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { useStageSettingsStore } from '../../stores/useStageSettingsStore';
import { useVideoLayerSettingsStore } from '../../stores/useVideoLayerSettingsStore';
import { useMotionSettingsStore } from '../../stores/useMotionSettingsStore';
import { useInteractionSettingsStore } from '../../stores/useInteractionSettingsStore';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { useAutomixSettingsStore } from '../../stores/useAutomixSettingsStore';
import { useLatticeSettingsStore } from '../../stores/useLatticeSettingsStore';
import { useGridViewSettingsStore } from '../../stores/useGridViewSettingsStore';
import { useDesktopSettingsStore } from '../../stores/useDesktopSettingsStore';

// src/services/sync/syncCoordinator.ts
// Coordinates startup theme sync and user-triggered manual sync commands.

const LOCAL_SETTINGS_UPDATED_AT_KEY = 'folia_sync_local_settings_updated_at_v1';
let applyingRemoteSettings = false;
let isSyncingInProgress = false;
let isInitializing = true; // 启动初始化期间不推送，避免本地默认值覆盖远程
let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 500;

// 所有需要监听变化的同步设置 store
const SYNCED_STORES = [
    useVisualizerSettingsStore,
    useTypographySettingsStore,
    useLyricSettingsStore,
    useHomeLayoutSettingsStore,
    usePlayerChromeSettingsStore,
    useThemeSettingsStore,
    useStageSettingsStore,
    useVideoLayerSettingsStore,
    useMotionSettingsStore,
    useInteractionSettingsStore,
    useAudioSettingsStore,
    useAutomixSettingsStore,
    useLatticeSettingsStore,
    useGridViewSettingsStore,
    useDesktopSettingsStore,
];

const isBrowser = () => typeof window !== 'undefined';

const getLocalSettingsUpdatedAt = () => (
    isBrowser() ? window.localStorage.getItem(LOCAL_SETTINGS_UPDATED_AT_KEY) : null
);

const setLocalSettingsUpdatedAt = (updatedAt: string) => {
    if (isBrowser()) {
        window.localStorage.setItem(LOCAL_SETTINGS_UPDATED_AT_KEY, updatedAt);
    }
};

const pushCurrentSettings = async () => {
    // 未登录网易云时设置仅保存在本地，不推送云端
    if (!isSyncConfigured() || !getCurrentSyncUid()) {
        return false;
    }

    const updatedAt = new Date().toISOString();
    const record = buildSyncedSettingsRecord(readSyncableSettingsState(), updatedAt);
    setLocalSettingsUpdatedAt(updatedAt);
    return await pushRemoteSettings(record);
};

// 设置变化时触发 debounce 推送，避免连续修改产生大量请求
const scheduleSettingsPush = () => {
    // 正在应用远程设置或初始化期间不推送，避免回写刚拉取的数据或本地默认值覆盖远程
    if (applyingRemoteSettings || isInitializing) return;
    if (!isSyncConfigured()) return;
    // 未登录网易云：纯本地模式，不推送
    if (!getCurrentSyncUid()) return;

    if (pushDebounceTimer) {
        clearTimeout(pushDebounceTimer);
    }
    pushDebounceTimer = setTimeout(() => {
        pushDebounceTimer = null;
        void pushCurrentSettings();
    }, PUSH_DEBOUNCE_MS);
};

export const initializeSyncCoordinator = () => {
    // UID 驱动的同步协调：仅登录同一网易云账号的设备共享设置（以 UID 为云端命名空间）。
    // 登录后云端优先；云端没有该账号数据时用本地设置初始化云端；
    // 未登录/登出后为纯本地模式（不拉不推）。
    const handleSyncIdentityChange = () => {
        const nextUid = resolveNeteaseUidFromAccountStore();
        if (nextUid === getCurrentSyncUid()) return;

        setCurrentSyncUid(nextUid);
        if (!nextUid) {
            console.info('[sync] NetEase account signed out, switching to local-only mode');
            return;
        }

        // 登录/切换账号：初始化期间不推送，先拉取该 UID 的云端设置（避免本地默认值覆盖远程）
        isInitializing = true;
        void syncNow({ syncThemes: true, applyRemoteSettings: true, pushSettings: false })
            .then(result => {
                // 云端没有该账号的设置数据时，用本地设置初始化云端（无云端信息则使用本地设置）
                if (result && !result.appliedRemoteSettings) {
                    void pushCurrentSettings();
                }
            })
            .finally(() => {
                isInitializing = false;
            });
    };

    // 订阅网易云账号 store（登录成功/登出/切换账号都会触发）
    const unsubscribeAccount = useOnlineProviderAccountStore.subscribe(handleSyncIdentityChange);
    // 启动时先检查一次当前登录态（缓存快照可能已填充账号信息）
    handleSyncIdentityChange();

    // 监听所有同步设置 store 的变化，实时推送到远程（带 debounce）
    const unsubscribers = SYNCED_STORES.map(store =>
        store.subscribe(() => scheduleSettingsPush())
    );

    return () => {
        unsubscribeAccount();
        unsubscribers.forEach(unsub => unsub());
        if (pushDebounceTimer) {
            clearTimeout(pushDebounceTimer);
            pushDebounceTimer = null;
        }
    };
};

export const testSyncProviderConnection = async (config: SyncProviderConfig) => {
    const response = await testSyncConnection(config);
    if (!response.ok) {
        return false;
    }

    return Boolean(await getRemoteState(config));
};

export const pullRemoteVisualSettings = async (remoteState?: SyncRemoteState | null) => {
    // 未登录网易云时不拉取远程设置（保持本地设置）
    if (!isSyncConfigured() || !getCurrentSyncUid()) {
        return false;
    }

    // 刷新时无条件拉取远程设置并应用，不比较 updatedAt
    const remoteSettings = await getRemoteSettings(getSyncConfig());
    if (!remoteSettings) {
        return false;
    }

    applyingRemoteSettings = true;
    try {
        applySyncedVisualSettings(readSyncableSettingsState(), remoteSettings.data);
        setLocalSettingsUpdatedAt(remoteSettings.updatedAt);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('folia-settings-synced'));
        }
        return true;
    } finally {
        applyingRemoteSettings = false;
    }
};

export type SyncNowResult = {
    uploadedThemeCount: number;
    downloadedThemeCount: number;
    checkedLocalThemeCount: number;
    diffBucketCount: number;
    skippedRemoteThemeScan: boolean;
    appliedRemoteSettings: boolean;
    pushedLocalSettings: boolean;
};

export const syncNow = async (options: { syncThemes?: boolean; applyRemoteSettings?: boolean; pushSettings?: boolean } = {}): Promise<SyncNowResult | null> => {
    if (isSyncingInProgress) {
        console.warn('[sync] syncNow skipped: already in progress');
        return null;
    }

    // 未登录网易云：设置仅保存在本地，不做云端同步
    if (!getCurrentSyncUid()) {
        console.info('[sync] syncNow skipped: not logged in to NetEase, local-only mode');
        return null;
    }

    const config = getSyncConfig();
    console.info('[sync] syncNow called', { options, uid: getCurrentSyncUid(), enabled: config.enabled, hasUrl: Boolean(config.workerBaseUrl), hasToken: Boolean(config.authToken) });
    if (!isSyncConfigured(config)) {
        console.warn('[sync] Sync not configured, skipping', config);
        return null;
    }

    isSyncingInProgress = true;
    // 超时保护：30 秒后自动释放锁，防止请求挂起导致后续同步被阻塞
    const syncTimeout = setTimeout(() => {
        if (isSyncingInProgress) {
            console.warn('[sync] syncNow timed out, releasing lock');
            isSyncingInProgress = false;
        }
    }, 30000);

    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        const remoteState = await fetchRemoteSyncState();
        let themeSyncResult = {
            uploadedCount: 0,
            downloadedCount: 0,
            checkedLocalThemeCount: 0,
            diffBucketCount: 0,
            skippedRemoteThemeScan: true,
        };
        if (options.syncThemes ?? true) {
            themeSyncResult = await pushMissingLocalThemesToRemote(remoteState);
        }
        
        let appliedRemoteSettings = false;
        let pushedLocalSettings = false;
        if (options.applyRemoteSettings) {
            appliedRemoteSettings = await pullRemoteVisualSettings(remoteState);
        }
        if (options.pushSettings) {
            pushedLocalSettings = await pushCurrentSettings();
        }
        setSyncStatus({ state: 'success', lastSyncAt: new Date().toISOString(), lastError: null });
        const summary = {
            uploadedThemeCount: themeSyncResult.uploadedCount,
            downloadedThemeCount: themeSyncResult.downloadedCount,
            checkedLocalThemeCount: themeSyncResult.checkedLocalThemeCount,
            diffBucketCount: themeSyncResult.diffBucketCount,
            skippedRemoteThemeScan: themeSyncResult.skippedRemoteThemeScan,
            appliedRemoteSettings,
            pushedLocalSettings,
        };
        console.info('[sync] Sync completed', summary);
        if (summary.downloadedThemeCount > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('folia-themes-synced'));
        }
        return summary;
    } catch (error) {
        console.error('[sync] Sync failed:', error);
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        return null;
    } finally {
        clearTimeout(syncTimeout);
        isSyncingInProgress = false;
    }
};

export const exportSyncLibraryBundle = async (): Promise<SyncLibraryExportBundle> => {
    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        const settings = buildSyncedSettingsRecord(readSyncableSettingsState(), new Date().toISOString());
        const themes = await mergeLocalThemesIntoRecords(await listAllRemoteThemeRecords());
        const bundle: SyncLibraryExportBundle = {
            kind: 'folia-sync-export',
            schemaVersion: SYNC_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            settings,
            themes,
        };
        setSyncStatus({ state: 'success', lastSyncAt: bundle.exportedAt, lastError: null });
        console.info('[sync] Export completed', {
            themeCount: bundle.themes.length,
        });
        return bundle;
    } catch (error) {
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        throw error;
    }
};

export const isSyncLibraryExportBundle = (value: unknown): value is SyncLibraryExportBundle => (
    parseSyncLibraryExportBundle(value) !== null
);

export const importSyncLibraryBundle = async (
    bundle: unknown,
    options: { pushRemote?: boolean } = {},
) => {
    const validatedBundle = parseSyncLibraryExportBundle(bundle);
    if (!validatedBundle) {
        throw new Error('Invalid Folia sync export');
    }

    setSyncStatus({ state: 'syncing', lastError: null });
    try {
        await saveSyncLibraryBundleToLocalCache(validatedBundle);
        if (validatedBundle.settings) {
            applyingRemoteSettings = true;
            try {
                applySyncedVisualSettings(readSyncableSettingsState(), validatedBundle.settings.data);
                setLocalSettingsUpdatedAt(validatedBundle.settings.updatedAt);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('folia-settings-synced'));
                }
            } finally {
                applyingRemoteSettings = false;
            }
        }
        if (options.pushRemote ?? true) {
            await pushSyncLibraryBundleToRemote(validatedBundle);
        }
        setSyncStatus({ state: 'success', lastSyncAt: new Date().toISOString(), lastError: null });
        console.info('[sync] Import completed', {
            pushedRemote: options.pushRemote ?? true,
            themeCount: validatedBundle.themes.length,
            appliedSettings: Boolean(validatedBundle.settings),
        });
        return true;
    } catch (error) {
        setSyncStatus({ state: 'error', lastError: error instanceof Error ? error.message : String(error) });
        throw error;
    }
};
