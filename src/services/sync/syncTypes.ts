import type { DualTheme, SubtitleContentMode, Theme, VisualizerBackgroundMode, VisualizerMode } from '../../types';
import type { VisualizerTuningBundle } from '../../components/visualizer/tuningRegistry';
import type { AudioEqualizerSettings } from '../../utils/audioEqualizer';
import type { TransitionMode } from '../../services/automix/transitionStrategy';
import type { PlayerControlSlotActionId } from '../../types/playerControlSlots';
import type { ThemeGenerationSource } from '../themePreferences';

// src/services/sync/syncTypes.ts
// Shared contracts for Folia's user-hosted sync server API.

export const SYNC_SCHEMA_VERSION = 2;
export const SYNC_PROVIDER = 'sync-server' as const;

export type SyncProvider = typeof SYNC_PROVIDER;
export type SyncStatusState = 'idle' | 'syncing' | 'success' | 'error';
export type SyncedThemeSource = 'manual' | 'auto' | 'fallback' | 'edited';

export type SyncProviderConfig = {
    provider: SyncProvider;
    enabled: boolean;
    workerBaseUrl: string;
    authToken: string;
};

export type SyncRuntimeStatus = {
    state: SyncStatusState;
    lastSyncAt: string | null;
    lastError: string | null;
};

export type SyncedVisualSettings = {
    followSystemTheme?: boolean;
    isDaylight?: boolean;
    // —— 主题偏好（localStorage 持久化，非 Zustand store） ——
    useCoverColorBg?: boolean;
    staticMode?: boolean;
    isCustomThemePreferred?: boolean;
    songThemeAutoSwitchEnabled?: boolean;
    songThemeAutoGenerateEnabled?: boolean;
    themeGenerationSource?: ThemeGenerationSource;
    customTheme?: DualTheme | null;
    visualizerMode?: VisualizerMode;
    randomVisualizerModePerSong?: boolean;
    visualizerBackgroundMode?: VisualizerBackgroundMode | null;
    backgroundOpacity?: number;
    visualizerOpacity?: number;
    hidePlayerTranslationSubtitle?: boolean;
    showSubtitleTranslation?: boolean;
    subtitleContentMode?: SubtitleContentMode;
    subtitleOverlayBackground?: boolean;
    subtitleUpcomingLyricsBlur?: boolean;
    lyricsFontStyle?: Theme['fontStyle'];
    lyricsFontScale?: number;
    lyricsFontWeight?: number | null;
    lyricsFontFallbackFamilies?: string[];
    subtitleFontInheritsLyrics?: boolean;
    subtitleFontStyle?: Theme['fontStyle'];
    subtitleFontWeight?: number | null;
    subtitleFontFamily?: string | null;
    subtitleFontFallbackFamilies?: string[];
    visualizerTunings?: VisualizerTuningBundle;
    classicTuning?: unknown;
    cadenzaTuning?: unknown;
    partitaTuning?: unknown;
    fumeTuning?: unknown;
    claddaghTuning?: unknown;
    cappellaTuning?: unknown;
    tiltTuning?: unknown;
    dioramaTuning?: unknown;
    monetBackgroundTuning?: unknown;
    nomandBackgroundTuning?: unknown;
    latentBackgroundTuning?: unknown;
    soraBackgroundTuning?: unknown;
    monetTuning?: unknown;
    pendoloTuning?: unknown;
    sonnetTuning?: unknown;
    temperaTuning?: unknown;
    urlBackgroundList?: unknown[];
    urlBackgroundSelectedId?: string | null;
    homeLayoutStyle?: 'carousel' | 'grid';
    grid3dCardStyle?: 'image' | 'card';
    // —— Stage / 视频层 ——
    webObsThemeMode?: 'static' | 'builtin' | 'ai';
    stageTrackPillMode?: 'auto' | 'always' | 'never';
    stageTrackPillTimeoutSec?: number;
    stageTrackPillOnHome?: boolean;
    videoLayerEnabled?: boolean;
    videoLayerUrl?: string;
    videoLayerOpacity?: number;
    videoLayerFit?: 'cover' | 'contain';
    // —— 动效 ——
    reducedMotionSurfaces?: Record<string, boolean>;
    followSystemReducedMotion?: boolean;
    // —— 交互 ——
    gridActionButtonSlideTarget?: 'filter' | 'command-palette';
    gridCommandPaletteHotkey?: boolean;
    customShortcutLetter?: string | null;
    customShortcutCommandId?: string | null;
    // —— 音频 ——
    audioQuality?: 'standard' | 'high' | 'lossless' | 'hires';
    enableMediaCache?: boolean;
    mediaCacheLimitGb?: number;
    queueAddBehavior?: 'append' | 'next';
    autoPlayOnLaunch?: boolean;
    enableTranscodeFallback?: boolean;
    neteaseScrobbleEnabled?: boolean;
    // —— 网易云登录凭证（localStorage，跨设备同步） ——
    neteaseCookie?: string | null;
    audioEqualizerSettings?: AudioEqualizerSettings;
    // —— 自动混音 / 过渡 ——
    automixEnabled?: boolean;
    transitionMode?: TransitionMode;
    crossfadeMaxSec?: number;
    transitionPerformance?: boolean;
    transitionAnimation?: boolean;
    transitionAnimationCard?: boolean;
    // —— 晶格 ——
    latticeVignette?: boolean;
    autoFocusOnSongChange?: boolean;
    latticeLightsOn?: boolean;
    latticePosterTintEnabled?: boolean;
    latticePosterTintUseCustomColor?: boolean;
    latticePosterTintColor?: string;
    latticePosterTintIntensity?: number;
    // —— 网格视图 ——
    gridViewFullBleedCover?: boolean;
    gridViewSquareCards?: boolean;
    gridViewMinCardScale?: number;
    gridViewMinCardOpacity?: number;
    // —— 桌面（跨设备通用偏好，设备特定项不同步） ——
    voiceInputPauseEnabled?: boolean;
    preventDisplaySleepDuringPlayback?: boolean;
    openPlayerOnLaunch?: boolean;
    // —— 首页布局 ——
    rememberHomeCardPosition?: boolean;
    showHomeTabPlaylist?: boolean;
    showHomeTabRadio?: boolean;
    showHomeTabAlbums?: boolean;
    showHomeTabLocal?: boolean;
    // —— 播放器外观 ——
    hidePlayerProgressBar?: boolean;
    playerBottomBarOffset?: number;
    playerControlSlotPrimary?: PlayerControlSlotActionId;
    playerControlSlotSecondary?: PlayerControlSlotActionId;
    hidePlayerRightPanelButton?: boolean;
    alwaysShowPlayerBackButton?: boolean;
    alwaysShowTrackSwitchButtons?: boolean;
    alwaysShowMainWindowTitlebar?: boolean;
    useNativeMacFullscreenButton?: boolean;
    transparentPlayerBackground?: boolean;
    enablePlayerPageNativeBlur?: boolean;
    autoHidePlayerChrome?: boolean;
    autoHideCursorWithPlayerChrome?: boolean;
    showOpenPanelCloseButton?: boolean;
};

export type SyncedSettingsRecord = {
    schemaVersion: number;
    updatedAt: string;
    data: SyncedVisualSettings;
};

export type SyncedThemeRecord = {
    fingerprint: string;
    theme: DualTheme;
    updatedAt: string;
    source: SyncedThemeSource;
};

export type SyncThemeBucketSummary = {
    bucketId: number;
    count: number;
    hash: string;
    updatedAt: string | null;
};

export type SyncThemeManifest = {
    schemaVersion: number;
    bucketCount: number;
    buckets: SyncThemeBucketSummary[];
};

export type SyncRemoteState = {
    schemaVersion: number;
    settingsUpdatedAt: string | null;
    themesUpdatedAt: string | null;
    themeCount: number;
};

export type WorkerHealthResponse = {
    ok: boolean;
    schemaVersion?: number;
    backend?: string;
};

export type SyncLibraryExportBundle = {
    kind: 'folia-sync-export';
    schemaVersion: number;
    exportedAt: string;
    settings: SyncedSettingsRecord | null;
    themes: SyncedThemeRecord[];
};
