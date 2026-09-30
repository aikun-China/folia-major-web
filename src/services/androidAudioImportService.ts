import { isFoliaAndroidApp } from '../utils/platform';
import { importLocalFiles } from './localMusicService';

/** 与 MainActivity.onNewIntent 派发的事件名保持一致（热启动通知页面重新消费）。 */
export const ANDROID_AUDIO_INTENT_EVENT = 'folia-android-audio-intent';

/** 与 MainActivity.onActivityResult 派发的事件名保持一致（detail: 'ok' | 'cancel'）。 */
export const ANDROID_FOLDER_PICKED_EVENT = 'folia-android-folder-picked';

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

type AndroidBridge = NonNullable<Window['foliaAndroid']>;

/** 按块读取桥会话并组装成 File；读不到任何字节时返回 null。 */
const assembleFileFromChunks = (
    bridge: AndroidBridge,
    token: string,
    name: string,
    mimeType: string,
    size: number,
): File | null => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    const knownSize = size > 0 ? size : null;
    let received = 0;
    for (;;) {
        let base64 = '';
        try {
            base64 = bridge.readAudioChunk(token, received, AUDIO_CHUNK_SIZE);
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
        return null;
    }
    return new File(parts, name, { type: mimeType || '' });
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

    const file = assembleFileFromChunks(bridge, info.token, info.name || 'audio-import', info.mimeType, info.size);
    if (!file) {
        return false;
    }
    const importedSongs = await importLocalFiles([file]);
    return importedSongs.length > 0;
};

/**
 * 消费原生侧 SAF 文件夹选择结果（listAudioFolderEntries）：
 * 逐文件分块组装，并手动注入 webkitRelativePath——SAF 文件没有该属性，而导入管线
 * 靠它推导目录层级与根文件夹名（首段即所选文件夹名），随后走统一导入管线落库。
 * 全部失败返回 false。
 */
export const tryImportPickedAudioFolder = async (): Promise<boolean> => {
    if (!isFoliaAndroidApp()) {
        return false;
    }
    const bridge = window.foliaAndroid;
    if (!bridge?.listAudioFolderEntries) {
        return false;
    }

    let entries: FoliaAndroidFolderEntryInfo[] = [];
    try {
        const raw = bridge.listAudioFolderEntries();
        entries = raw ? (JSON.parse(raw) as FoliaAndroidFolderEntryInfo[]) : [];
    } catch {
        entries = [];
    }
    if (entries.length === 0) {
        return false;
    }

    const files: File[] = [];
    for (const entry of entries) {
        if (!entry?.token) {
            continue;
        }
        const file = assembleFileFromChunks(bridge, entry.token, entry.name, entry.mimeType, entry.size);
        if (!file) {
            continue;
        }
        (file as File & { webkitRelativePath?: string; }).webkitRelativePath = entry.relativePath;
        files.push(file);
    }
    if (files.length === 0) {
        return false;
    }
    const importedSongs = await importLocalFiles(files);
    return importedSongs.length > 0;
};

/**
 * 拉起原生 SAF 文件夹选择器并等待用户选择完成后导入：
 * resolve true = 完成了至少一首导入；false = 不可用/用户取消/选择为空/导入失败。
 * 原生侧在启动失败与用户取消时都会派发 cancel 事件，Promise 不会悬挂。
 */
export const pickAndroidFolderAndImport = async (): Promise<boolean> => {
    const bridge = window.foliaAndroid;
    if (!isFoliaAndroidApp() || !bridge?.pickAudioFolder || !bridge.listAudioFolderEntries) {
        return false;
    }

    return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (imported: boolean) => {
            if (settled) return;
            settled = true;
            window.removeEventListener(ANDROID_FOLDER_PICKED_EVENT, onPicked);
            resolve(imported);
        };
        const onPicked = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== 'ok') {
                finish(false);
                return;
            }
            tryImportPickedAudioFolder()
                .then(finish)
                .catch(() => finish(false));
        };
        window.addEventListener(ANDROID_FOLDER_PICKED_EVENT, onPicked);
        if (!bridge.pickAudioFolder()) {
            finish(false);
        }
    });
};
