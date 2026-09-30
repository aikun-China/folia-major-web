import { useEffect, useRef } from 'react';
import {
    ANDROID_AUDIO_INTENT_EVENT,
    tryImportPendingAudioIntent,
} from '../services/androidAudioImportService';

/**
 * APK 端 audio/* 唤起导入：挂载时消费一次（冷启动），
 * 之后监听原生热启动派发的事件（onNewIntent → CustomEvent）再次消费；
 * 导入成功后刷新本地曲库。浏览器/Electron 端在服务内短路为空操作。
 */
export const useAndroidAudioIntent = (onRefreshLocalSongs: () => Promise<void> | void) => {
    const refreshRef = useRef(onRefreshLocalSongs);

    useEffect(() => {
        refreshRef.current = onRefreshLocalSongs;
    }, [onRefreshLocalSongs]);

    useEffect(() => {
        let running = false;
        const attempt = async () => {
            if (running) {
                return;
            }
            running = true;
            try {
                const imported = await tryImportPendingAudioIntent();
                if (imported) {
                    await refreshRef.current();
                }
            } catch (error) {
                console.error('Failed to import audio from Android intent:', error);
            } finally {
                running = false;
            }
        };

        void attempt();
        window.addEventListener(ANDROID_AUDIO_INTENT_EVENT, attempt);
        return () => window.removeEventListener(ANDROID_AUDIO_INTENT_EVENT, attempt);
    }, []);
};
