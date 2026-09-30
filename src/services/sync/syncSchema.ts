import { sanitizeDualTheme } from '../themeSanitizer';
// 背景模式没有 mod 投稿通道，静态清单与活注册表在任何时刻都等价。
import { isBuiltinVisualizerBackgroundMode } from '../../types/visualizerModes';
import {
    SYNC_SCHEMA_VERSION,
    type SyncLibraryExportBundle,
    type SyncRemoteState,
    type SyncThemeBucketSummary,
    type SyncThemeManifest,
    type SyncedSettingsRecord,
    type SyncedVisualSettings,
    type SyncedThemeRecord,
} from './syncTypes';

// src/services/sync/syncSchema.ts
// Defensive parsing for JSON returned by user-hosted sync servers.

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isIsoDateString = (value: unknown): value is string => (
    typeof value === 'string' && !Number.isNaN(Date.parse(value))
);

const isSchemaCompatible = (value: unknown) => value === SYNC_SCHEMA_VERSION || value === 1;

const isFiniteNumber = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value)
);

const isStringArray = (value: unknown): value is string[] => (
    Array.isArray(value) && value.every(item => typeof item === 'string')
);

const isFontStyle = (value: unknown): value is SyncedVisualSettings['lyricsFontStyle'] => (
    value === 'sans' || value === 'serif' || value === 'mono'
);

const isVisualizerBackgroundMode = (value: unknown): value is NonNullable<SyncedVisualSettings['visualizerBackgroundMode']> => (
    isBuiltinVisualizerBackgroundMode(value)
);

const parseSyncedVisualSettings = (value: Record<string, unknown>): SyncedVisualSettings => {
    const settings: SyncedVisualSettings = {};

    if (typeof value.followSystemTheme === 'boolean') settings.followSystemTheme = value.followSystemTheme;
    if (typeof value.isDaylight === 'boolean') settings.isDaylight = value.isDaylight;
    if (typeof value.visualizerMode === 'string' && value.visualizerMode.trim()) settings.visualizerMode = value.visualizerMode;
    if (value.visualizerBackgroundMode === null) settings.visualizerBackgroundMode = null;
    else if (isVisualizerBackgroundMode(value.visualizerBackgroundMode)) settings.visualizerBackgroundMode = value.visualizerBackgroundMode;
    if (isFiniteNumber(value.backgroundOpacity)) settings.backgroundOpacity = value.backgroundOpacity;
    if (isFiniteNumber(value.visualizerOpacity)) settings.visualizerOpacity = value.visualizerOpacity;
    if (typeof value.hidePlayerTranslationSubtitle === 'boolean') settings.hidePlayerTranslationSubtitle = value.hidePlayerTranslationSubtitle;
    if (typeof value.showSubtitleTranslation === 'boolean') settings.showSubtitleTranslation = value.showSubtitleTranslation;
    if (value.subtitleContentMode === 'translation' || value.subtitleContentMode === 'romanization' || value.subtitleContentMode === 'none') {
        settings.subtitleContentMode = value.subtitleContentMode;
    }
    if (typeof value.subtitleOverlayBackground === 'boolean') settings.subtitleOverlayBackground = value.subtitleOverlayBackground;
    if (typeof value.subtitleUpcomingLyricsBlur === 'boolean') settings.subtitleUpcomingLyricsBlur = value.subtitleUpcomingLyricsBlur;
    if (isFontStyle(value.lyricsFontStyle)) settings.lyricsFontStyle = value.lyricsFontStyle;
    if (isFiniteNumber(value.lyricsFontScale)) settings.lyricsFontScale = value.lyricsFontScale;
    if (value.lyricsFontWeight === null) settings.lyricsFontWeight = null;
    else if (isFiniteNumber(value.lyricsFontWeight) && value.lyricsFontWeight >= 100 && value.lyricsFontWeight <= 900) settings.lyricsFontWeight = value.lyricsFontWeight;
    if (isStringArray(value.lyricsFontFallbackFamilies)) settings.lyricsFontFallbackFamilies = value.lyricsFontFallbackFamilies;
    if (typeof value.subtitleFontInheritsLyrics === 'boolean') settings.subtitleFontInheritsLyrics = value.subtitleFontInheritsLyrics;
    if (isFontStyle(value.subtitleFontStyle)) settings.subtitleFontStyle = value.subtitleFontStyle;
    if (value.subtitleFontWeight === null) settings.subtitleFontWeight = null;
    else if (isFiniteNumber(value.subtitleFontWeight) && value.subtitleFontWeight >= 100 && value.subtitleFontWeight <= 900) settings.subtitleFontWeight = value.subtitleFontWeight;
    if (value.subtitleFontFamily === null) settings.subtitleFontFamily = null;
    else if (typeof value.subtitleFontFamily === 'string') settings.subtitleFontFamily = value.subtitleFontFamily;
    if (isStringArray(value.subtitleFontFallbackFamilies)) settings.subtitleFontFallbackFamilies = value.subtitleFontFallbackFamilies;
    if (isRecord(value.visualizerTunings)) settings.visualizerTunings = value.visualizerTunings;
    if (value.classicTuning !== undefined) settings.classicTuning = value.classicTuning;
    if (value.cadenzaTuning !== undefined) settings.cadenzaTuning = value.cadenzaTuning;
    if (value.partitaTuning !== undefined) settings.partitaTuning = value.partitaTuning;
    if (value.fumeTuning !== undefined) settings.fumeTuning = value.fumeTuning;
    if (value.claddaghTuning !== undefined) settings.claddaghTuning = value.claddaghTuning;
    if (value.cappellaTuning !== undefined) settings.cappellaTuning = value.cappellaTuning;
    if (value.tiltTuning !== undefined) settings.tiltTuning = value.tiltTuning;
    if (value.dioramaTuning !== undefined) settings.dioramaTuning = value.dioramaTuning;
    if (value.monetBackgroundTuning !== undefined) settings.monetBackgroundTuning = value.monetBackgroundTuning;
    if (value.nomandBackgroundTuning !== undefined) settings.nomandBackgroundTuning = value.nomandBackgroundTuning;
    if (value.latentBackgroundTuning !== undefined) settings.latentBackgroundTuning = value.latentBackgroundTuning;
    if (value.soraBackgroundTuning !== undefined) settings.soraBackgroundTuning = value.soraBackgroundTuning;
    if (value.monetTuning !== undefined) settings.monetTuning = value.monetTuning;
    if (value.pendoloTuning !== undefined) settings.pendoloTuning = value.pendoloTuning;
    if (value.sonnetTuning !== undefined) settings.sonnetTuning = value.sonnetTuning;
    if (value.temperaTuning !== undefined) settings.temperaTuning = value.temperaTuning;
    if (Array.isArray(value.urlBackgroundList)) settings.urlBackgroundList = value.urlBackgroundList;
    if (value.urlBackgroundSelectedId === null) settings.urlBackgroundSelectedId = null;
    else if (typeof value.urlBackgroundSelectedId === 'string') settings.urlBackgroundSelectedId = value.urlBackgroundSelectedId;
    if (value.homeLayoutStyle === 'carousel' || value.homeLayoutStyle === 'grid') settings.homeLayoutStyle = 'grid';
    if (value.grid3dCardStyle === 'image' || value.grid3dCardStyle === 'card') settings.grid3dCardStyle = value.grid3dCardStyle;

    // —— Stage ——
    if (value.webObsThemeMode === 'static' || value.webObsThemeMode === 'builtin' || value.webObsThemeMode === 'ai') {
        settings.webObsThemeMode = value.webObsThemeMode;
    }
    if (value.stageTrackPillMode === 'auto' || value.stageTrackPillMode === 'always' || value.stageTrackPillMode === 'never') {
        settings.stageTrackPillMode = value.stageTrackPillMode;
    }
    if (isFiniteNumber(value.stageTrackPillTimeoutSec) && value.stageTrackPillTimeoutSec >= 3 && value.stageTrackPillTimeoutSec <= 60) {
        settings.stageTrackPillTimeoutSec = value.stageTrackPillTimeoutSec;
    }
    if (typeof value.stageTrackPillOnHome === 'boolean') settings.stageTrackPillOnHome = value.stageTrackPillOnHome;

    // —— 视频层 ——
    if (typeof value.videoLayerEnabled === 'boolean') settings.videoLayerEnabled = value.videoLayerEnabled;
    if (typeof value.videoLayerUrl === 'string') settings.videoLayerUrl = value.videoLayerUrl;
    if (isFiniteNumber(value.videoLayerOpacity)) settings.videoLayerOpacity = value.videoLayerOpacity;
    if (value.videoLayerFit === 'cover' || value.videoLayerFit === 'contain') settings.videoLayerFit = value.videoLayerFit;

    // —— 动效 ——
    if (isRecord(value.reducedMotionSurfaces)) {
        const surfaces: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(value.reducedMotionSurfaces)) {
            if (typeof val === 'boolean') surfaces[key] = val;
        }
        settings.reducedMotionSurfaces = surfaces;
    }
    if (typeof value.followSystemReducedMotion === 'boolean') settings.followSystemReducedMotion = value.followSystemReducedMotion;

    // —— 交互 ——
    if (value.gridActionButtonSlideTarget === 'filter' || value.gridActionButtonSlideTarget === 'command-palette') {
        settings.gridActionButtonSlideTarget = value.gridActionButtonSlideTarget;
    }
    if (typeof value.gridCommandPaletteHotkey === 'boolean') settings.gridCommandPaletteHotkey = value.gridCommandPaletteHotkey;
    if (value.customShortcutLetter === null) settings.customShortcutLetter = null;
    else if (typeof value.customShortcutLetter === 'string') settings.customShortcutLetter = value.customShortcutLetter;
    if (value.customShortcutCommandId === null) settings.customShortcutCommandId = null;
    else if (typeof value.customShortcutCommandId === 'string') settings.customShortcutCommandId = value.customShortcutCommandId;

    // —— 音频 ——
    if (value.audioQuality === 'standard' || value.audioQuality === 'high' || value.audioQuality === 'lossless' || value.audioQuality === 'hires') {
        settings.audioQuality = value.audioQuality;
    }
    if (typeof value.enableMediaCache === 'boolean') settings.enableMediaCache = value.enableMediaCache;
    if (isFiniteNumber(value.mediaCacheLimitGb) && value.mediaCacheLimitGb >= 0) settings.mediaCacheLimitGb = value.mediaCacheLimitGb;
    if (value.queueAddBehavior === 'append' || value.queueAddBehavior === 'next') settings.queueAddBehavior = value.queueAddBehavior;
    if (typeof value.autoPlayOnLaunch === 'boolean') settings.autoPlayOnLaunch = value.autoPlayOnLaunch;
    if (typeof value.enableTranscodeFallback === 'boolean') settings.enableTranscodeFallback = value.enableTranscodeFallback;
    if (typeof value.neteaseScrobbleEnabled === 'boolean') settings.neteaseScrobbleEnabled = value.neteaseScrobbleEnabled;
    if (isRecord(value.audioEqualizerSettings)) settings.audioEqualizerSettings = value.audioEqualizerSettings as SyncedVisualSettings['audioEqualizerSettings'];

    // —— 自动混音 / 过渡 ——
    if (typeof value.automixEnabled === 'boolean') settings.automixEnabled = value.automixEnabled;
    if (typeof value.transitionMode === 'string' && value.transitionMode.trim()) settings.transitionMode = value.transitionMode as SyncedVisualSettings['transitionMode'];
    if (isFiniteNumber(value.crossfadeMaxSec) && value.crossfadeMaxSec >= 0) settings.crossfadeMaxSec = value.crossfadeMaxSec;
    if (typeof value.transitionPerformance === 'boolean') settings.transitionPerformance = value.transitionPerformance;
    if (typeof value.transitionAnimation === 'boolean') settings.transitionAnimation = value.transitionAnimation;
    if (typeof value.transitionAnimationCard === 'boolean') settings.transitionAnimationCard = value.transitionAnimationCard;

    // —— 晶格 ——
    if (typeof value.latticeVignette === 'boolean') settings.latticeVignette = value.latticeVignette;
    if (typeof value.autoFocusOnSongChange === 'boolean') settings.autoFocusOnSongChange = value.autoFocusOnSongChange;
    if (typeof value.latticeLightsOn === 'boolean') settings.latticeLightsOn = value.latticeLightsOn;
    if (typeof value.latticePosterTintEnabled === 'boolean') settings.latticePosterTintEnabled = value.latticePosterTintEnabled;
    if (typeof value.latticePosterTintUseCustomColor === 'boolean') settings.latticePosterTintUseCustomColor = value.latticePosterTintUseCustomColor;
    if (typeof value.latticePosterTintColor === 'string') settings.latticePosterTintColor = value.latticePosterTintColor;
    if (isFiniteNumber(value.latticePosterTintIntensity)) settings.latticePosterTintIntensity = value.latticePosterTintIntensity;

    // —— 网格视图 ——
    if (typeof value.gridViewFullBleedCover === 'boolean') settings.gridViewFullBleedCover = value.gridViewFullBleedCover;
    if (typeof value.gridViewSquareCards === 'boolean') settings.gridViewSquareCards = value.gridViewSquareCards;
    if (isFiniteNumber(value.gridViewMinCardScale)) settings.gridViewMinCardScale = value.gridViewMinCardScale;
    if (isFiniteNumber(value.gridViewMinCardOpacity)) settings.gridViewMinCardOpacity = value.gridViewMinCardOpacity;

    // —— 桌面通用偏好 ——
    if (typeof value.voiceInputPauseEnabled === 'boolean') settings.voiceInputPauseEnabled = value.voiceInputPauseEnabled;
    if (typeof value.preventDisplaySleepDuringPlayback === 'boolean') settings.preventDisplaySleepDuringPlayback = value.preventDisplaySleepDuringPlayback;
    if (typeof value.openPlayerOnLaunch === 'boolean') settings.openPlayerOnLaunch = value.openPlayerOnLaunch;

    // —— 首页布局 ——
    if (typeof value.rememberHomeCardPosition === 'boolean') settings.rememberHomeCardPosition = value.rememberHomeCardPosition;
    if (typeof value.showHomeTabPlaylist === 'boolean') settings.showHomeTabPlaylist = value.showHomeTabPlaylist;
    if (typeof value.showHomeTabRadio === 'boolean') settings.showHomeTabRadio = value.showHomeTabRadio;
    if (typeof value.showHomeTabAlbums === 'boolean') settings.showHomeTabAlbums = value.showHomeTabAlbums;
    if (typeof value.showHomeTabLocal === 'boolean') settings.showHomeTabLocal = value.showHomeTabLocal;

    // —— 播放器外观 ——
    if (typeof value.hidePlayerProgressBar === 'boolean') settings.hidePlayerProgressBar = value.hidePlayerProgressBar;
    if (isFiniteNumber(value.playerBottomBarOffset)) settings.playerBottomBarOffset = value.playerBottomBarOffset;
    if (typeof value.playerControlSlotPrimary === 'string') settings.playerControlSlotPrimary = value.playerControlSlotPrimary as SyncedVisualSettings['playerControlSlotPrimary'];
    if (typeof value.playerControlSlotSecondary === 'string') settings.playerControlSlotSecondary = value.playerControlSlotSecondary as SyncedVisualSettings['playerControlSlotSecondary'];
    if (typeof value.hidePlayerRightPanelButton === 'boolean') settings.hidePlayerRightPanelButton = value.hidePlayerRightPanelButton;
    if (typeof value.alwaysShowPlayerBackButton === 'boolean') settings.alwaysShowPlayerBackButton = value.alwaysShowPlayerBackButton;
    if (typeof value.alwaysShowTrackSwitchButtons === 'boolean') settings.alwaysShowTrackSwitchButtons = value.alwaysShowTrackSwitchButtons;
    if (typeof value.alwaysShowMainWindowTitlebar === 'boolean') settings.alwaysShowMainWindowTitlebar = value.alwaysShowMainWindowTitlebar;
    if (typeof value.useNativeMacFullscreenButton === 'boolean') settings.useNativeMacFullscreenButton = value.useNativeMacFullscreenButton;
    if (typeof value.transparentPlayerBackground === 'boolean') settings.transparentPlayerBackground = value.transparentPlayerBackground;
    if (typeof value.enablePlayerPageNativeBlur === 'boolean') settings.enablePlayerPageNativeBlur = value.enablePlayerPageNativeBlur;
    if (typeof value.autoHidePlayerChrome === 'boolean') settings.autoHidePlayerChrome = value.autoHidePlayerChrome;
    if (typeof value.autoHideCursorWithPlayerChrome === 'boolean') settings.autoHideCursorWithPlayerChrome = value.autoHideCursorWithPlayerChrome;
    if (typeof value.showOpenPanelCloseButton === 'boolean') settings.showOpenPanelCloseButton = value.showOpenPanelCloseButton;

    return settings;
};

export const parseSyncedSettingsRecord = (value: unknown): SyncedSettingsRecord | null => {
    if (!isRecord(value) || !isSchemaCompatible(value.schemaVersion) || !isIsoDateString(value.updatedAt) || !isRecord(value.data)) {
        return null;
    }

    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        updatedAt: value.updatedAt,
        data: parseSyncedVisualSettings(value.data),
    };
};

export const parseSyncedThemeRecord = (value: unknown): SyncedThemeRecord | null => {
    if (!isRecord(value)
        || typeof value.fingerprint !== 'string'
        || !value.fingerprint
        || !isIsoDateString(value.updatedAt)
        || !isRecord(value.theme)
    ) {
        return null;
    }

    return {
        fingerprint: value.fingerprint,
        theme: sanitizeDualTheme(value.theme),
        updatedAt: value.updatedAt,
        source: value.source === 'auto' || value.source === 'fallback' || value.source === 'edited'
            ? value.source
            : 'manual',
    };
};

export const parseSyncedThemeRecords = (value: unknown): SyncedThemeRecord[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map(parseSyncedThemeRecord)
        .filter((record): record is SyncedThemeRecord => Boolean(record));
};

export const parseSyncLibraryExportBundle = (value: unknown): SyncLibraryExportBundle | null => {
    if (!isRecord(value)
        || value.kind !== 'folia-sync-export'
        || !isSchemaCompatible(value.schemaVersion)
        || !isIsoDateString(value.exportedAt)
        || !Array.isArray(value.themes)
    ) {
        return null;
    }

    const themes = value.themes.map(parseSyncedThemeRecord);
    if (themes.some(theme => !theme)) {
        return null;
    }

    const settings = value.settings === null
        ? null
        : parseSyncedSettingsRecord(value.settings);
    if (value.settings !== null && !settings) {
        return null;
    }

    return {
        kind: 'folia-sync-export',
        schemaVersion: SYNC_SCHEMA_VERSION,
        exportedAt: value.exportedAt,
        settings,
        themes: themes as SyncedThemeRecord[],
    };
};

export const parseSyncRemoteState = (value: unknown): SyncRemoteState | null => {
    if (!isRecord(value) || !isSchemaCompatible(value.schemaVersion)) {
        return null;
    }

    const settingsUpdatedAt = typeof value.settingsUpdatedAt === 'string' ? value.settingsUpdatedAt : null;
    const themesUpdatedAt = typeof value.themesUpdatedAt === 'string' ? value.themesUpdatedAt : null;
    if ((value.settingsUpdatedAt != null && !isIsoDateString(settingsUpdatedAt))
        || (value.themesUpdatedAt != null && !isIsoDateString(themesUpdatedAt))
        || typeof value.themeCount !== 'number'
        || !Number.isFinite(value.themeCount)
    ) {
        return null;
    }

    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        settingsUpdatedAt,
        themesUpdatedAt,
        themeCount: Math.max(0, Math.trunc(value.themeCount)),
    };
};

const parseThemeBucketSummary = (value: unknown): SyncThemeBucketSummary | null => {
    if (!isRecord(value)
        || typeof value.bucketId !== 'number'
        || !Number.isInteger(value.bucketId)
        || value.bucketId < 0
        || typeof value.count !== 'number'
        || !Number.isFinite(value.count)
        || typeof value.hash !== 'string'
    ) {
        return null;
    }

    const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null;
    if (value.updatedAt != null && !isIsoDateString(updatedAt)) {
        return null;
    }

    return {
        bucketId: value.bucketId,
        count: Math.max(0, Math.trunc(value.count)),
        hash: value.hash,
        updatedAt,
    };
};

export const parseSyncThemeManifest = (value: unknown): SyncThemeManifest | null => {
    if (!isRecord(value)
        || !isSchemaCompatible(value.schemaVersion)
        || typeof value.bucketCount !== 'number'
        || !Number.isInteger(value.bucketCount)
        || !Array.isArray(value.buckets)
    ) {
        return null;
    }

    const buckets = value.buckets.map(parseThemeBucketSummary);
    if (buckets.some(bucket => !bucket)) {
        return null;
    }

    return {
        schemaVersion: SYNC_SCHEMA_VERSION,
        bucketCount: value.bucketCount,
        buckets: buckets as SyncThemeBucketSummary[],
    };
};
