import { useVisualizerSettingsStore, type VisualizerSettingsState } from '../../stores/useVisualizerSettingsStore';
import { useTypographySettingsStore, type TypographySettingsState } from '../../stores/useTypographySettingsStore';
import { useLyricSettingsStore, type LyricSettingsState } from '../../stores/useLyricSettingsStore';
import { useHomeLayoutSettingsStore, type HomeLayoutSettingsState } from '../../stores/useHomeLayoutSettingsStore';
import { usePlayerChromeSettingsStore, type PlayerChromeSettingsState } from '../../stores/usePlayerChromeSettingsStore';
import { useThemeSettingsStore, type ThemeSettingsState } from '../../stores/useThemeSettingsStore';
import { useStageSettingsStore, type StageSettingsState } from '../../stores/useStageSettingsStore';
import { useVideoLayerSettingsStore, type VideoLayerSettingsState } from '../../stores/useVideoLayerSettingsStore';
import { useMotionSettingsStore, type MotionSettingsState } from '../../stores/useMotionSettingsStore';
import { useInteractionSettingsStore, type InteractionSettingsState } from '../../stores/useInteractionSettingsStore';
import { useAudioSettingsStore, type AudioSettingsState } from '../../stores/useAudioSettingsStore';
import { useAutomixSettingsStore, type AutomixSettingsState } from '../../stores/useAutomixSettingsStore';
import { useLatticeSettingsStore, type LatticeSettingsState } from '../../stores/useLatticeSettingsStore';
import { useGridViewSettingsStore, type GridViewSettingsState } from '../../stores/useGridViewSettingsStore';
import { useDesktopSettingsStore, type DesktopSettingsState } from '../../stores/useDesktopSettingsStore';
import type { SyncedSettingsRecord, SyncedVisualSettings } from './syncTypes';
import { SYNC_SCHEMA_VERSION } from './syncTypes';
import type { DualTheme } from '../../types';
import { applyVisualizerTuningsToSettings, collectVisualizerTunings } from '../../components/visualizer/tuningRegistry';
import {
    readStoredThemeAutoGenerateEnabled,
    readStoredThemeAutoSwitchEnabled,
    readStoredThemeGenerationSource,
    saveStoredThemeAutoGenerateEnabled,
    saveStoredThemeAutoSwitchEnabled,
    saveStoredThemeGenerationSource,
} from '../themePreferences';
import { readProviderSessionValue, writeProviderSessionValue } from '../onlineMusic/providerStorage';

const CUSTOM_THEME_PREFERRED_KEY = 'custom_theme_preferred';
const CUSTOM_DUAL_THEME_KEY = 'custom_dual_theme';

const readStoredCustomTheme = (): DualTheme | null => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(CUSTOM_DUAL_THEME_KEY);
    if (!saved) return null;
    try {
        return JSON.parse(saved) as DualTheme;
    } catch {
        return null;
    }
};

// src/services/sync/settingsSnapshot.ts
// Maps the settings stores to the syncable visual settings JSON document.
//
// The synced document is deliberately cross-domain — it is one visual config covering both the
// general settings and the visualizer ones — so this is the single place allowed to read both
// stores at once. The document's shape is unchanged by that split.

/** The two stores the synced visual document spans, read as one snapshot. */
export type SyncableSettingsState = VisualizerSettingsState
    & TypographySettingsState & LyricSettingsState
    & HomeLayoutSettingsState & PlayerChromeSettingsState & ThemeSettingsState
    & StageSettingsState & VideoLayerSettingsState & MotionSettingsState & InteractionSettingsState
    & AudioSettingsState & AutomixSettingsState & LatticeSettingsState
    & GridViewSettingsState & DesktopSettingsState;

export const readSyncableSettingsState = (): SyncableSettingsState => ({
    ...useVisualizerSettingsStore.getState(),
    ...useTypographySettingsStore.getState(),
    ...useLyricSettingsStore.getState(),
    ...useHomeLayoutSettingsStore.getState(),
    ...usePlayerChromeSettingsStore.getState(),
    ...useThemeSettingsStore.getState(),
    ...useStageSettingsStore.getState(),
    ...useVideoLayerSettingsStore.getState(),
    ...useMotionSettingsStore.getState(),
    ...useInteractionSettingsStore.getState(),
    ...useAudioSettingsStore.getState(),
    ...useAutomixSettingsStore.getState(),
    ...useLatticeSettingsStore.getState(),
    ...useGridViewSettingsStore.getState(),
    ...useDesktopSettingsStore.getState(),
});

export const buildSyncedVisualSettings = (state: SyncableSettingsState): SyncedVisualSettings => ({
    followSystemTheme: state.followSystemTheme,
    isDaylight: state.isDaylight,
    useCoverColorBg: state.useCoverColorBg,
    staticMode: state.staticMode,
    isCustomThemePreferred: typeof window !== 'undefined' ? window.localStorage.getItem(CUSTOM_THEME_PREFERRED_KEY) === 'true' : false,
    songThemeAutoSwitchEnabled: readStoredThemeAutoSwitchEnabled(),
    songThemeAutoGenerateEnabled: readStoredThemeAutoGenerateEnabled(),
    themeGenerationSource: readStoredThemeGenerationSource(),
    customTheme: readStoredCustomTheme(),
    visualizerMode: state.visualizerMode,
    randomVisualizerModePerSong: state.randomVisualizerModePerSong,
    visualizerBackgroundMode: state.visualizerBackgroundMode,
    backgroundOpacity: state.backgroundOpacity,
    visualizerOpacity: state.visualizerOpacity,
    hidePlayerTranslationSubtitle: state.hidePlayerTranslationSubtitle,
    showSubtitleTranslation: state.showSubtitleTranslation,
    subtitleContentMode: state.subtitleContentMode,
    subtitleOverlayBackground: state.subtitleOverlayBackground,
    subtitleUpcomingLyricsBlur: state.subtitleUpcomingLyricsBlur,
    lyricsFontStyle: state.lyricsFontStyle,
    lyricsFontScale: state.lyricsFontScale,
    lyricsFontWeight: state.lyricsFontWeight,
    lyricsFontFallbackFamilies: state.lyricsFontFallbackFamilies,
    subtitleFontInheritsLyrics: state.subtitleFontInheritsLyrics,
    subtitleFontStyle: state.subtitleFontStyle,
    subtitleFontWeight: state.subtitleFontWeight,
    subtitleFontFamily: state.subtitleFontFamily,
    subtitleFontFallbackFamilies: state.subtitleFontFallbackFamilies,
    visualizerTunings: collectVisualizerTunings(state as unknown as Record<string, unknown>),
    classicTuning: state.classicTuning,
    cadenzaTuning: state.cadenzaTuning,
    partitaTuning: state.partitaTuning,
    fumeTuning: state.fumeTuning,
    claddaghTuning: state.claddaghTuning,
    cappellaTuning: state.cappellaTuning,
    tiltTuning: state.tiltTuning,
    dioramaTuning: state.dioramaTuning,
    monetBackgroundTuning: state.monetBackgroundTuning,
    nomandBackgroundTuning: state.nomandBackgroundTuning,
    latentBackgroundTuning: state.latentBackgroundTuning,
    soraBackgroundTuning: state.soraBackgroundTuning,
    monetTuning: state.monetTuning,
    pendoloTuning: state.pendoloTuning,
    sonnetTuning: state.sonnetTuning,
    temperaTuning: state.temperaTuning,
    urlBackgroundList: state.urlBackgroundList,
    urlBackgroundSelectedId: state.urlBackgroundSelectedId,
    homeLayoutStyle: state.homeLayoutStyle,
    grid3dCardStyle: state.grid3dCardStyle,
    // —— Stage（仅展示偏好，不含本机 OBS/PlayerCap 连接配置） ——
    webObsThemeMode: state.webObsThemeMode,
    stageTrackPillMode: state.stageTrackPillMode,
    stageTrackPillTimeoutSec: state.stageTrackPillTimeoutSec,
    stageTrackPillOnHome: state.stageTrackPillOnHome,
    // —— 视频层（不含本地文件句柄，跨设备无法传递） ——
    videoLayerEnabled: state.videoLayerEnabled,
    videoLayerUrl: state.videoLayerUrl,
    videoLayerOpacity: state.videoLayerOpacity,
    videoLayerFit: state.videoLayerFit,
    // —— 动效（不含 systemPrefersReducedMotion，那是本机系统偏好） ——
    reducedMotionSurfaces: state.reducedMotionSurfaces,
    followSystemReducedMotion: state.followSystemReducedMotion,
    // —— 交互 ——
    gridActionButtonSlideTarget: state.gridActionButtonSlideTarget,
    gridCommandPaletteHotkey: state.gridCommandPaletteHotkey,
    customShortcutLetter: state.customShortcutLetter,
    customShortcutCommandId: state.customShortcutCommandId,
    // —— 音频（不含音量/静音/循环/输出设备，那些是播放状态或设备特定） ——
    audioQuality: state.audioQuality,
    enableMediaCache: state.enableMediaCache,
    mediaCacheLimitGb: state.mediaCacheLimitGb,
    queueAddBehavior: state.queueAddBehavior,
    autoPlayOnLaunch: state.autoPlayOnLaunch,
    enableTranscodeFallback: state.enableTranscodeFallback,
    neteaseScrobbleEnabled: state.neteaseScrobbleEnabled,
    neteaseCookie: readProviderSessionValue('netease', 'cookie', ['netease_cookie']),
    audioEqualizerSettings: state.audioEqualizerSettings,
    // —— 自动混音 / 过渡 ——
    automixEnabled: state.automixEnabled,
    transitionMode: state.transitionMode,
    crossfadeMaxSec: state.crossfadeMaxSec,
    transitionPerformance: state.transitionPerformance,
    transitionAnimation: state.transitionAnimation,
    transitionAnimationCard: state.transitionAnimationCard,
    // —— 晶格 ——
    latticeVignette: state.latticeVignette,
    autoFocusOnSongChange: state.autoFocusOnSongChange,
    latticeLightsOn: state.latticeLightsOn,
    latticePosterTintEnabled: state.latticePosterTintEnabled,
    latticePosterTintUseCustomColor: state.latticePosterTintUseCustomColor,
    latticePosterTintColor: state.latticePosterTintColor,
    latticePosterTintIntensity: state.latticePosterTintIntensity,
    // —— 网格视图 ——
    gridViewFullBleedCover: state.gridViewFullBleedCover,
    gridViewSquareCards: state.gridViewSquareCards,
    gridViewMinCardScale: state.gridViewMinCardScale,
    gridViewMinCardOpacity: state.gridViewMinCardOpacity,
    // —— 桌面通用偏好 ——
    voiceInputPauseEnabled: state.voiceInputPauseEnabled,
    preventDisplaySleepDuringPlayback: state.preventDisplaySleepDuringPlayback,
    openPlayerOnLaunch: state.openPlayerOnLaunch,
    // —— 首页布局 ——
    rememberHomeCardPosition: state.rememberHomeCardPosition,
    showHomeTabPlaylist: state.showHomeTabPlaylist,
    showHomeTabRadio: state.showHomeTabRadio,
    showHomeTabAlbums: state.showHomeTabAlbums,
    showHomeTabLocal: state.showHomeTabLocal,
    // —— 播放器外观 ——
    hidePlayerProgressBar: state.hidePlayerProgressBar,
    playerBottomBarOffset: state.playerBottomBarOffset,
    playerControlSlotPrimary: state.playerControlSlotPrimary,
    playerControlSlotSecondary: state.playerControlSlotSecondary,
    hidePlayerRightPanelButton: state.hidePlayerRightPanelButton,
    alwaysShowPlayerBackButton: state.alwaysShowPlayerBackButton,
    alwaysShowTrackSwitchButtons: state.alwaysShowTrackSwitchButtons,
    alwaysShowMainWindowTitlebar: state.alwaysShowMainWindowTitlebar,
    useNativeMacFullscreenButton: state.useNativeMacFullscreenButton,
    transparentPlayerBackground: state.transparentPlayerBackground,
    enablePlayerPageNativeBlur: state.enablePlayerPageNativeBlur,
    autoHidePlayerChrome: state.autoHidePlayerChrome,
    autoHideCursorWithPlayerChrome: state.autoHideCursorWithPlayerChrome,
    showOpenPanelCloseButton: state.showOpenPanelCloseButton,
});

export const buildSyncedSettingsRecord = (
    state: SyncableSettingsState,
    updatedAt = new Date().toISOString(),
): SyncedSettingsRecord => ({
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt,
    data: buildSyncedVisualSettings(state),
});

export const getSyncedSettingsSignature = (state: SyncableSettingsState) => (
    JSON.stringify(buildSyncedVisualSettings(state))
);

export const applySyncedVisualSettings = (
    state: SyncableSettingsState,
    settings: SyncedVisualSettings,
) => {
    if (settings.followSystemTheme !== undefined) state.setFollowSystemTheme(Boolean(settings.followSystemTheme));
    if (settings.isDaylight !== undefined) state.setDaylightPreference(Boolean(settings.isDaylight));
    if (settings.useCoverColorBg !== undefined) state.handleToggleCoverColorBg(Boolean(settings.useCoverColorBg));
    if (settings.staticMode !== undefined) state.handleToggleStaticMode(Boolean(settings.staticMode));
    if (settings.isCustomThemePreferred !== undefined && typeof window !== 'undefined') {
        window.localStorage.setItem(CUSTOM_THEME_PREFERRED_KEY, String(settings.isCustomThemePreferred));
    }
    if (settings.songThemeAutoSwitchEnabled !== undefined) saveStoredThemeAutoSwitchEnabled(Boolean(settings.songThemeAutoSwitchEnabled));
    if (settings.songThemeAutoGenerateEnabled !== undefined) saveStoredThemeAutoGenerateEnabled(Boolean(settings.songThemeAutoGenerateEnabled));
    if (settings.themeGenerationSource !== undefined) saveStoredThemeGenerationSource(settings.themeGenerationSource);
    if (settings.customTheme !== undefined && typeof window !== 'undefined') {
        if (settings.customTheme === null) {
            window.localStorage.removeItem(CUSTOM_DUAL_THEME_KEY);
        } else {
            window.localStorage.setItem(CUSTOM_DUAL_THEME_KEY, JSON.stringify(settings.customTheme));
        }
    }
    if (settings.visualizerMode !== undefined) state.handleSetVisualizerMode(settings.visualizerMode);
    if (settings.randomVisualizerModePerSong !== undefined) state.handleToggleRandomVisualizerModePerSong(Boolean(settings.randomVisualizerModePerSong));
    if (settings.visualizerBackgroundMode === null) {
        state.handleResetVisualizerBackgroundMode();
    } else if (settings.visualizerBackgroundMode !== undefined) {
        state.handleSetVisualizerBackgroundMode(settings.visualizerBackgroundMode);
    }
    if (settings.backgroundOpacity !== undefined) state.handleSetBackgroundOpacity(settings.backgroundOpacity);
    if (settings.visualizerOpacity !== undefined) state.handleSetVisualizerOpacity(settings.visualizerOpacity);
    if (settings.hidePlayerTranslationSubtitle !== undefined) state.handleToggleHidePlayerTranslationSubtitle(Boolean(settings.hidePlayerTranslationSubtitle));
    if (settings.showSubtitleTranslation !== undefined) state.handleToggleShowSubtitleTranslation(Boolean(settings.showSubtitleTranslation));
    if (settings.subtitleContentMode !== undefined) state.handleSetSubtitleContentMode(settings.subtitleContentMode);
    if (settings.subtitleOverlayBackground !== undefined) state.handleToggleSubtitleOverlayBackground(Boolean(settings.subtitleOverlayBackground));
    if (settings.subtitleUpcomingLyricsBlur !== undefined) state.handleToggleSubtitleUpcomingLyricsBlur(Boolean(settings.subtitleUpcomingLyricsBlur));
    if (settings.lyricsFontStyle !== undefined) state.handleSetLyricsFontStyle(settings.lyricsFontStyle);
    if (settings.lyricsFontScale !== undefined) state.handleSetLyricsFontScale(settings.lyricsFontScale);
    if (settings.lyricsFontWeight !== undefined) state.handleSetLyricsFontWeight(settings.lyricsFontWeight);
    if (settings.lyricsFontFallbackFamilies !== undefined) state.handleSetLyricsFontFallbackFamilies(settings.lyricsFontFallbackFamilies);
    if (settings.subtitleFontInheritsLyrics !== undefined) state.handleSetSubtitleFontInheritsLyrics(Boolean(settings.subtitleFontInheritsLyrics));
    if (settings.subtitleFontStyle !== undefined) state.handleSetSubtitleFontStyle(settings.subtitleFontStyle);
    if (settings.subtitleFontWeight !== undefined) state.handleSetSubtitleFontWeight(settings.subtitleFontWeight);
    if (settings.subtitleFontFamily !== undefined) state.handleSetSubtitleFontFamily(settings.subtitleFontFamily);
    if (settings.subtitleFontFallbackFamilies !== undefined) state.handleSetSubtitleFontFallbackFamilies(settings.subtitleFontFallbackFamilies);
    if (settings.visualizerTunings !== undefined) {
        applyVisualizerTuningsToSettings(state as unknown as Record<string, unknown>, settings.visualizerTunings);
    }
    if (settings.visualizerTunings === undefined && settings.classicTuning !== undefined) state.handleSetClassicTuning(settings.classicTuning as Parameters<SyncableSettingsState['handleSetClassicTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.cadenzaTuning !== undefined) state.handleSetCadenzaTuning(settings.cadenzaTuning as Parameters<SyncableSettingsState['handleSetCadenzaTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.partitaTuning !== undefined) state.handleSetPartitaTuning(settings.partitaTuning as Parameters<SyncableSettingsState['handleSetPartitaTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.fumeTuning !== undefined) state.handleSetFumeTuning(settings.fumeTuning as Parameters<SyncableSettingsState['handleSetFumeTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.claddaghTuning !== undefined) state.handleSetCladdaghTuning(settings.claddaghTuning as Parameters<SyncableSettingsState['handleSetCladdaghTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.cappellaTuning !== undefined) state.handleSetCappellaTuning(settings.cappellaTuning as Parameters<SyncableSettingsState['handleSetCappellaTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.tiltTuning !== undefined) state.handleSetTiltTuning(settings.tiltTuning as Parameters<SyncableSettingsState['handleSetTiltTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.dioramaTuning !== undefined) state.handleSetDioramaTuning(settings.dioramaTuning as Parameters<SyncableSettingsState['handleSetDioramaTuning']>[0]);
    if (settings.monetBackgroundTuning !== undefined) state.handleSetMonetBackgroundTuning(settings.monetBackgroundTuning as Parameters<SyncableSettingsState['handleSetMonetBackgroundTuning']>[0]);
    if (settings.nomandBackgroundTuning !== undefined) state.handleSetNomandBackgroundTuning(settings.nomandBackgroundTuning as Parameters<SyncableSettingsState['handleSetNomandBackgroundTuning']>[0]);
    if (settings.latentBackgroundTuning !== undefined) state.handleSetLatentBackgroundTuning(settings.latentBackgroundTuning as Parameters<SyncableSettingsState['handleSetLatentBackgroundTuning']>[0]);
    if (settings.soraBackgroundTuning !== undefined) state.handleSetSoraBackgroundTuning(settings.soraBackgroundTuning as Parameters<SyncableSettingsState['handleSetSoraBackgroundTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.monetTuning !== undefined) state.handleSetMonetTuning(settings.monetTuning as Parameters<SyncableSettingsState['handleSetMonetTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.pendoloTuning !== undefined) state.handleSetPendoloTuning(settings.pendoloTuning as Parameters<SyncableSettingsState['handleSetPendoloTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.sonnetTuning !== undefined) state.handleSetSonnetTuning(settings.sonnetTuning as Parameters<SyncableSettingsState['handleSetSonnetTuning']>[0]);
    if (settings.visualizerTunings === undefined && settings.temperaTuning !== undefined) state.handleSetTemperaTuning(settings.temperaTuning as Parameters<SyncableSettingsState['handleSetTemperaTuning']>[0]);
    if (settings.urlBackgroundList !== undefined) state.handleSetUrlBackgroundList(settings.urlBackgroundList as Parameters<SyncableSettingsState['handleSetUrlBackgroundList']>[0]);
    if (settings.urlBackgroundSelectedId !== undefined) state.handleSetUrlBackgroundSelectedId(settings.urlBackgroundSelectedId);
    if (settings.homeLayoutStyle !== undefined) state.handleSetHomeLayoutStyle(settings.homeLayoutStyle);
    if (settings.grid3dCardStyle !== undefined) state.handleSetGrid3dCardStyle(settings.grid3dCardStyle);
    // —— Stage ——
    if (settings.webObsThemeMode !== undefined) state.setWebObsThemeMode(settings.webObsThemeMode);
    if (settings.stageTrackPillMode !== undefined) state.handleSetStageTrackPillMode(settings.stageTrackPillMode);
    if (settings.stageTrackPillTimeoutSec !== undefined) state.handleSetStageTrackPillTimeoutSec(settings.stageTrackPillTimeoutSec);
    if (settings.stageTrackPillOnHome !== undefined) state.handleToggleStageTrackPillOnHome(Boolean(settings.stageTrackPillOnHome));
    // —— 视频层 ——
    if (settings.videoLayerEnabled !== undefined) state.setVideoLayerEnabled(Boolean(settings.videoLayerEnabled));
    if (settings.videoLayerUrl !== undefined) state.setVideoLayerUrl(settings.videoLayerUrl);
    if (settings.videoLayerOpacity !== undefined) state.setVideoLayerOpacity(settings.videoLayerOpacity);
    if (settings.videoLayerFit !== undefined) state.setVideoLayerFit(settings.videoLayerFit);
    // —— 动效 ——
    if (settings.followSystemReducedMotion !== undefined) state.handleToggleFollowSystemReducedMotion(Boolean(settings.followSystemReducedMotion));
    if (settings.reducedMotionSurfaces !== undefined) {
        for (const [surface, enabled] of Object.entries(settings.reducedMotionSurfaces)) {
            state.handleToggleReducedMotionSurface(surface as Parameters<SyncableSettingsState['handleToggleReducedMotionSurface']>[0], Boolean(enabled));
        }
    }
    // —— 交互 ——
    if (settings.gridActionButtonSlideTarget !== undefined) state.setGridActionButtonSlideTarget(settings.gridActionButtonSlideTarget);
    if (settings.gridCommandPaletteHotkey !== undefined) state.handleToggleGridCommandPaletteHotkey(Boolean(settings.gridCommandPaletteHotkey));
    if (settings.customShortcutLetter !== undefined) state.setCustomShortcutLetter(settings.customShortcutLetter);
    if (settings.customShortcutCommandId !== undefined) state.setCustomShortcutCommandId(settings.customShortcutCommandId);
    // —— 音频 ——
    if (settings.audioQuality !== undefined) state.setAudioQuality(settings.audioQuality);
    if (settings.enableMediaCache !== undefined) state.handleToggleMediaCache(Boolean(settings.enableMediaCache));
    if (settings.mediaCacheLimitGb !== undefined) state.handleSetMediaCacheLimitGb(settings.mediaCacheLimitGb);
    if (settings.queueAddBehavior !== undefined) state.handleSetQueueAddBehavior(settings.queueAddBehavior);
    if (settings.autoPlayOnLaunch !== undefined) state.handleToggleAutoPlayOnLaunch(Boolean(settings.autoPlayOnLaunch));
    if (settings.enableTranscodeFallback !== undefined) state.handleToggleTranscodeFallback(Boolean(settings.enableTranscodeFallback));
    if (settings.neteaseScrobbleEnabled !== undefined) state.handleToggleNeteaseScrobble(Boolean(settings.neteaseScrobbleEnabled));
    if (typeof settings.neteaseCookie === 'string' && settings.neteaseCookie) {
        writeProviderSessionValue('netease', 'cookie', settings.neteaseCookie);
    }
    if (settings.audioEqualizerSettings !== undefined) state.handleSetAudioEqualizerSettings(settings.audioEqualizerSettings as Parameters<SyncableSettingsState['handleSetAudioEqualizerSettings']>[0]);
    // —— 自动混音 / 过渡 ——
    if (settings.automixEnabled !== undefined) state.handleToggleAutomix(Boolean(settings.automixEnabled));
    if (settings.transitionMode !== undefined) state.handleSetTransitionMode(settings.transitionMode);
    if (settings.crossfadeMaxSec !== undefined) state.handleSetCrossfadeMaxSec(settings.crossfadeMaxSec);
    if (settings.transitionPerformance !== undefined) state.handleToggleTransitionPerformance(Boolean(settings.transitionPerformance));
    if (settings.transitionAnimation !== undefined) state.handleToggleTransitionAnimation(Boolean(settings.transitionAnimation));
    if (settings.transitionAnimationCard !== undefined) state.handleToggleTransitionAnimationCard(Boolean(settings.transitionAnimationCard));
    // —— 晶格 ——
    if (settings.latticeVignette !== undefined) state.handleToggleLatticeVignette(Boolean(settings.latticeVignette));
    if (settings.autoFocusOnSongChange !== undefined) state.handleToggleAutoFocusOnSongChange(Boolean(settings.autoFocusOnSongChange));
    if (settings.latticeLightsOn !== undefined) state.handleToggleLatticeLights(Boolean(settings.latticeLightsOn));
    if (settings.latticePosterTintEnabled !== undefined) state.handleToggleLatticePosterTint(Boolean(settings.latticePosterTintEnabled));
    if (settings.latticePosterTintUseCustomColor !== undefined) state.handleToggleLatticePosterTintCustomColor(Boolean(settings.latticePosterTintUseCustomColor));
    if (settings.latticePosterTintColor !== undefined) state.handleSetLatticePosterTintColor(settings.latticePosterTintColor);
    if (settings.latticePosterTintIntensity !== undefined) state.handleSetLatticePosterTintIntensity(settings.latticePosterTintIntensity);
    // —— 网格视图 ——
    if (settings.gridViewFullBleedCover !== undefined) state.handleToggleGridViewFullBleedCover(Boolean(settings.gridViewFullBleedCover));
    if (settings.gridViewSquareCards !== undefined) state.handleToggleGridViewSquareCards(Boolean(settings.gridViewSquareCards));
    if (settings.gridViewMinCardScale !== undefined) state.handleSetGridViewMinCardScale(settings.gridViewMinCardScale);
    if (settings.gridViewMinCardOpacity !== undefined) state.handleSetGridViewMinCardOpacity(settings.gridViewMinCardOpacity);
    // —— 桌面通用偏好 ——
    if (settings.voiceInputPauseEnabled !== undefined) state.handleToggleVoiceInputPause(Boolean(settings.voiceInputPauseEnabled));
    if (settings.preventDisplaySleepDuringPlayback !== undefined) state.handleTogglePreventDisplaySleepDuringPlayback(Boolean(settings.preventDisplaySleepDuringPlayback));
    if (settings.openPlayerOnLaunch !== undefined) state.handleToggleOpenPlayerOnLaunch(Boolean(settings.openPlayerOnLaunch));
    // —— 首页布局 ——
    if (settings.rememberHomeCardPosition !== undefined) state.handleToggleRememberHomeCardPosition(Boolean(settings.rememberHomeCardPosition));
    if (settings.showHomeTabPlaylist !== undefined) state.handleToggleHomeTabPlaylist(Boolean(settings.showHomeTabPlaylist));
    if (settings.showHomeTabRadio !== undefined) state.handleToggleHomeTabRadio(Boolean(settings.showHomeTabRadio));
    if (settings.showHomeTabAlbums !== undefined) state.handleToggleHomeTabAlbums(Boolean(settings.showHomeTabAlbums));
    if (settings.showHomeTabLocal !== undefined) state.handleToggleHomeTabLocal(Boolean(settings.showHomeTabLocal));
    // —— 播放器外观 ——
    if (settings.hidePlayerProgressBar !== undefined) state.handleToggleHidePlayerProgressBar(Boolean(settings.hidePlayerProgressBar));
    if (settings.playerBottomBarOffset !== undefined) state.handleSetPlayerBottomBarOffset(settings.playerBottomBarOffset);
    if (settings.playerControlSlotPrimary !== undefined) state.handleSetPlayerControlSlot('primary', settings.playerControlSlotPrimary);
    if (settings.playerControlSlotSecondary !== undefined) state.handleSetPlayerControlSlot('secondary', settings.playerControlSlotSecondary);
    if (settings.hidePlayerRightPanelButton !== undefined) state.handleToggleHidePlayerRightPanelButton(Boolean(settings.hidePlayerRightPanelButton));
    if (settings.alwaysShowPlayerBackButton !== undefined) state.handleToggleAlwaysShowPlayerBackButton(Boolean(settings.alwaysShowPlayerBackButton));
    if (settings.alwaysShowTrackSwitchButtons !== undefined) state.handleToggleAlwaysShowTrackSwitchButtons(Boolean(settings.alwaysShowTrackSwitchButtons));
    if (settings.alwaysShowMainWindowTitlebar !== undefined) state.handleToggleAlwaysShowMainWindowTitlebar(Boolean(settings.alwaysShowMainWindowTitlebar));
    if (settings.useNativeMacFullscreenButton !== undefined) state.handleToggleNativeMacFullscreenButton(Boolean(settings.useNativeMacFullscreenButton));
    if (settings.transparentPlayerBackground !== undefined) state.handleToggleTransparentPlayerBackground(Boolean(settings.transparentPlayerBackground));
    if (settings.enablePlayerPageNativeBlur !== undefined) state.handleTogglePlayerPageNativeBlur(Boolean(settings.enablePlayerPageNativeBlur));
    if (settings.autoHidePlayerChrome !== undefined) state.handleToggleAutoHidePlayerChrome(Boolean(settings.autoHidePlayerChrome));
    if (settings.autoHideCursorWithPlayerChrome !== undefined) state.handleToggleAutoHideCursorWithPlayerChrome(Boolean(settings.autoHideCursorWithPlayerChrome));
    if (settings.showOpenPanelCloseButton !== undefined) state.handleToggleOpenPanelCloseButton(Boolean(settings.showOpenPanelCloseButton));
};
