import { useEffect } from 'react';
import type { RefObject } from 'react';
import { PlayerState } from '../types';
import type { SongResult } from '../types';
import { getSongAlbumLabel, getSongArtistLabel, getSongCoverUrl } from '../services/onlineMusic/songMetadata';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { isFoliaAndroidApp } from '../utils/platform';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';

// src/hooks/useAndroidPlaybackBridge.ts
// APK 壳侧的 useMediaSessionBridge 对应物：把播放快照推给原生前台服务
// （媒体通知卡片 + 锁屏控制的数据源），并把原生传输命令路由回播放器。
// 浏览器/Electron 环境为空操作。与原生 PlaybackService 约定配套。

export const ANDROID_MEDIA_COMMAND_EVENT = 'folia-android-media-command';

/** 进度推送节流：桥调用是同步阻塞的，timeupdate 约 4Hz，压到 1Hz 足够通知栏进度展示。 */
const SNAPSHOT_PUSH_INTERVAL_MS = 1000;

const EMPTY_SNAPSHOT: FoliaAndroidPlaybackSnapshot = {
    hasTrack: false,
    playing: false,
    title: '',
    artist: '',
    album: '',
    durationSec: 0,
    positionSec: 0,
};

type UseAndroidPlaybackBridgeOptions = {
    audioRef: RefObject<HTMLAudioElement | null>;
    getDisplayAudioElement?: () => HTMLAudioElement | null;
    currentSong: SongResult | null;
    playerState: PlayerState;
    isNowPlayingStageActive: boolean;
    unknownArtistLabel: string;
    mediaSessionPlayRef: RefObject<() => Promise<void>>;
    mediaSessionPauseRef: RefObject<() => void>;
    mediaSessionPrevRef: RefObject<() => void>;
    mediaSessionNextRef: RefObject<() => Promise<void> | void>;
    isNowPlayingControlDisabledRef: RefObject<boolean>;
};

export const useAndroidPlaybackBridge = ({
    audioRef,
    getDisplayAudioElement,
    currentSong,
    playerState,
    isNowPlayingStageActive,
    unknownArtistLabel,
    mediaSessionPlayRef,
    mediaSessionPauseRef,
    mediaSessionPrevRef,
    mediaSessionNextRef,
    isNowPlayingControlDisabledRef,
}: UseAndroidPlaybackBridgeOptions) => {
    // 原生命令（通知栏/锁屏按钮、音频焦点丢失、耳机拔出）→ 播放器。
    // 守卫与 useMediaSessionBridge 的 action handler 保持一致。
    useEffect(() => {
        if (!isFoliaAndroidApp() || !window.foliaAndroid) {
            return;
        }
        const handleCommand = (event: Event) => {
            const command = (event as CustomEvent<string>).detail;
            if (command === 'play') {
                if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                    return;
                }
                mediaSessionPlayRef.current().catch((e) => {
                    console.error('Android media play failed', e);
                });
            } else if (command === 'pause') {
                if (isNowPlayingControlDisabledRef.current || !audioRef.current) {
                    return;
                }
                mediaSessionPauseRef.current();
            } else if (command === 'prev') {
                if (isNowPlayingControlDisabledRef.current) {
                    return;
                }
                mediaSessionPrevRef.current();
            } else if (command === 'next') {
                if (isNowPlayingControlDisabledRef.current) {
                    return;
                }
                void mediaSessionNextRef.current();
            }
        };
        window.addEventListener(ANDROID_MEDIA_COMMAND_EVENT, handleCommand);
        return () => window.removeEventListener(ANDROID_MEDIA_COMMAND_EVENT, handleCommand);
    }, [audioRef, isNowPlayingControlDisabledRef, mediaSessionNextRef, mediaSessionPauseRef, mediaSessionPlayRef, mediaSessionPrevRef]);

    // 快照推送：曲目/状态变化即时推，进度经 timeupdate 按 1Hz 节流推。
    // 快照描述的是 DISPLAYED 轨道（与 useMediaSessionBridge 同一套输入），混音过渡期元数据与进度同源。
    useEffect(() => {
        const bridge = window.foliaAndroid;
        if (!isFoliaAndroidApp() || !bridge) {
            return;
        }

        const buildSnapshot = (): FoliaAndroidPlaybackSnapshot => {
            const audio = getDisplayAudioElement?.() ?? audioRef.current;
            const hasTrack = !!currentSong && !isNowPlayingStageActive;
            const timeSec = audio && Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
            // 歌词/封面从播放 store 现读（不入 effect 依赖），1Hz 快照推送不引发 React 重渲染；
            // 歌词行复用舞台歌词同一取词函数，保证通知卡片与页面歌词一致。
            const store = usePlaybackStore.getState();
            const lyricLines = store.lyrics?.lines ?? [];
            const lyricIndex = lyricLines.length > 0 ? findLatestActiveLineIndex(lyricLines, timeSec) : -1;
            return {
                hasTrack,
                playing: hasTrack && playerState === PlayerState.PLAYING,
                title: currentSong?.name ?? '',
                artist: currentSong ? (getSongArtistLabel(currentSong) || unknownArtistLabel) : '',
                album: currentSong ? getSongAlbumLabel(currentSong) : '',
                durationSec: audio && Number.isFinite(audio.duration) ? Math.max(0, Math.floor(audio.duration)) : 0,
                positionSec: timeSec,
                artworkUrl: store.cachedCoverUrl || getSongCoverUrl(currentSong) || '',
                currentLyricLine: lyricIndex >= 0 ? (lyricLines[lyricIndex]?.fullText ?? '') : '',
            };
        };

        const push = () => {
            try {
                bridge.setPlaybackSnapshot(JSON.stringify(buildSnapshot()));
            } catch (error) {
                console.warn('[AndroidPlayback] Failed to push snapshot', error);
            }
        };

        let lastPushedAt = 0;
        const pushThrottled = () => {
            const now = Date.now();
            if (now - lastPushedAt < SNAPSHOT_PUSH_INTERVAL_MS) {
                return;
            }
            lastPushedAt = now;
            push();
        };

        push();
        const audio = getDisplayAudioElement?.() ?? audioRef.current;
        audio?.addEventListener('timeupdate', pushThrottled);
        audio?.addEventListener('loadedmetadata', push);
        audio?.addEventListener('play', push);
        audio?.addEventListener('pause', push);
        audio?.addEventListener('ended', push);

        return () => {
            audio?.removeEventListener('timeupdate', pushThrottled);
            audio?.removeEventListener('loadedmetadata', push);
            audio?.removeEventListener('play', push);
            audio?.removeEventListener('pause', push);
            audio?.removeEventListener('ended', push);
            // 页面卸载/刷新：撤掉媒体通知卡片。
            try {
                bridge.setPlaybackSnapshot(JSON.stringify(EMPTY_SNAPSHOT));
            } catch {
                /* bridge 已随页面销毁，忽略 */
            }
        };
    }, [audioRef, currentSong, getDisplayAudioElement, isNowPlayingStageActive, playerState, unknownArtistLabel]);
};
