// src/services/androidUpdateService.ts
// Folia 安卓壳内置更新检测：网页端负责「比对 + 弹窗」，原生端负责「下载 + 唤起安装器」。
// 数据源为 folia-major-apk 仓库的 GitHub Release（latest），Release tag 与原生 versionName 对齐。

export const APK_RELEASE_API_URL = 'https://api.github.com/repos/aikun-China/folia-major-apk/releases/latest';

export interface AndroidLatestRelease {
    tagName: string;
    versionName: string;
    releaseNotes: string;
    apkDownloadUrl: string;
    apkFileName: string;
    htmlUrl: string;
}

export type AndroidUpdateCheckResult =
    | { kind: 'up-to-date'; currentVersion: string; latestVersion: string; }
    | { kind: 'available'; release: AndroidLatestRelease; currentVersion: string; }
    | { kind: 'error'; message: string; };

const stripLeadingV = (value: string): string => value.trim().replace(/^v/i, '');

/**
 * 语义化版本段比较：按 '.' 分段逐段取数值比较，段数不足按 0 处理。
 * 返回正数表示 a > b，0 表示相等，负数表示 a < b。
 */
export const compareVersionStrings = (a: string, b: string): number => {
    const partsA = stripLeadingV(a).split('.').map(part => Number.parseInt(part, 10) || 0);
    const partsB = stripLeadingV(b).split('.').map(part => Number.parseInt(part, 10) || 0);
    const length = Math.max(partsA.length, partsB.length);
    for (let index = 0; index < length; index += 1) {
        const valueA = partsA[index] ?? 0;
        const valueB = partsB[index] ?? 0;
        if (valueA !== valueB) {
            return valueA - valueB;
        }
    }
    return 0;
};

export const getFoliaAndroidBridge = (): FoliaAndroidBridge | null => {
    if (typeof window === 'undefined') return null;
    return (window as typeof window & { foliaAndroid?: FoliaAndroidBridge; }).foliaAndroid ?? null;
};

/** 读取壳内 APK 自身的版本信息；非安卓壳环境返回 null。 */
export const getNativeAppInfo = (): FoliaAndroidAppInfo | null => {
    const bridge = getFoliaAndroidBridge();
    if (!bridge) return null;
    try {
        const parsed = JSON.parse(bridge.getAppInfo()) as FoliaAndroidAppInfo;
        return parsed?.versionName ? parsed : null;
    } catch {
        return null;
    }
};

const resolveApkAsset = (assets: Array<{ name?: string; browser_download_url?: string; }>): {
    apkDownloadUrl: string;
    apkFileName: string;
} | null => {
    for (const asset of assets) {
        const url = asset.browser_download_url;
        const name = asset.name || '';
        if (!url || !name.toLowerCase().endsWith('.apk')) continue;
        return { apkDownloadUrl: url, apkFileName: name };
    }
    return null;
};

/** 拉取 GitHub latest Release；无 Release 或仓库不可达时返回 null（由调用方转为错误文案）。 */
export const fetchLatestRelease = async (): Promise<AndroidLatestRelease | null> => {
    const response = await fetch(APK_RELEASE_API_URL, {
        headers: {
            Accept: 'application/vnd.github+json',
        },
    });
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
    }

    const payload = await response.json() as {
        tag_name?: string;
        body?: string;
        html_url?: string;
        prerelease?: boolean;
        draft?: boolean;
        assets?: Array<{ name?: string; browser_download_url?: string; }>;
    };
    if (payload.draft || !payload.tag_name) {
        return null;
    }

    // APK 资产缺失时回退到源码 zip 直链之外的兜底：没有 APK 就无法安装，视为不可更新。
    const apkAsset = resolveApkAsset(payload.assets || []);
    if (!apkAsset) {
        return null;
    }

    return {
        tagName: payload.tag_name,
        versionName: stripLeadingV(payload.tag_name),
        releaseNotes: (payload.body || '').trim(),
        htmlUrl: payload.html_url || APK_RELEASE_API_URL,
        ...apkAsset,
    };
};

/** 完整检查流程：读原生版本 → 拉 Release → 比对。 */
export const checkForAndroidUpdate = async (): Promise<AndroidUpdateCheckResult> => {
    const appInfo = getNativeAppInfo();
    if (!appInfo) {
        return { kind: 'error', message: 'native-bridge-missing' };
    }

    try {
        const release = await fetchLatestRelease();
        if (!release) {
            return { kind: 'error', message: 'no-release' };
        }

        if (compareVersionStrings(appInfo.versionName, release.versionName) >= 0) {
            return { kind: 'up-to-date', currentVersion: appInfo.versionName, latestVersion: release.versionName };
        }

        return { kind: 'available', release, currentVersion: appInfo.versionName };
    } catch (error) {
        console.error('[AndroidUpdate] Check failed:', error);
        return { kind: 'error', message: 'network' };
    }
};

/** 轮询原生 DownloadManager 的更新包下载进度。 */
export const pollDownloadProgress = (): FoliaAndroidDownloadProgress => {
    const bridge = getFoliaAndroidBridge();
    if (!bridge) {
        return { status: 'idle', received: 0, total: 0 };
    }
    try {
        const parsed = JSON.parse(bridge.getDownloadProgress()) as FoliaAndroidDownloadProgress;
        return parsed ?? { status: 'idle', received: 0, total: 0 };
    } catch {
        return { status: 'idle', received: 0, total: 0 };
    }
};
