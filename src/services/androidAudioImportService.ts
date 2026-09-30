import { isFoliaAndroidApp } from '../utils/platform';
import { importLocalFiles } from './localMusicService';

/** 与 MainActivity.onNewIntent 派发的事件名保持一致（热启动通知页面重新消费）。 */
export const ANDROID_AUDIO_INTENT_EVENT = 'folia-android-audio-intent';

/** 单块 1MB：桥同步调用 + Base64 往返的吞吐/内存折中，百 MB 级 FLAC 也在秒级完成。 */
const AUDIO_CHUNK_SIZE = 1024 * 1024;

const base64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

/**
 * 消费原生侧待处理的 audio/* 唤起 intent：
 * consumePendingAudioIntent 取文件信息 → 按块 readAudioChunk 组装 File → 走统一导入管线落库。
 * 有待处理文件且至少导入成功一首时返回 true。
 */
export const tryImportPendingAudioIntent = async (): Promise<boolean> => {
    if (!isFoliaAndroidApp()) {
        return false;
    }
    const bridge = window.foliaAndroid;
    if (!bridge) {
        return false;
    }

    let info: FoliaAndroidImportFileInfo | null = null;
    try {
        const raw = bridge.consumePendingAudioIntent();
        info = raw ? (JSON.parse(raw) as FoliaAndroidImportFileInfo) : null;
    } catch {
        info = null;
    }
    if (!info || !info.token) {
        return false;
    }

    const parts: Uint8Array<ArrayBuffer>[] = [];
    const knownSize = info.size > 0 ? info.size : null;
    let received = 0;
    for (;;) {
        let base64 = '';
        try {
            base64 = bridge.readAudioChunk(info.token, received, AUDIO_CHUNK_SIZE);
        } catch {
            break;
        }
        if (!base64) {
            break;
        }
        const bytes = base64ToUint8Array(base64);
        parts.push(bytes);
        received += bytes.length;
        if (knownSize !== null && received >= knownSize) {
            break;
        }
    }
    if (received === 0) {
        return false;
    }

    const file = new File(parts, info.name || 'audio-import', { type: info.mimeType || '' });
    const importedSongs = await importLocalFiles([file]);
    return importedSongs.length > 0;
};
