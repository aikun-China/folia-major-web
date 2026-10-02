import { useCallback, useEffect, useState } from 'react';
import { checkForAndroidUpdate, type AndroidLatestRelease } from '../services/androidUpdateService';
import { isFoliaAndroidApp } from '../utils/platform';

// src/hooks/useAndroidUpdateAutoCheck.ts
// APK 壳启动自动检查更新：延迟错开启动体验弹窗与首屏网络请求，仅在发现新版本时置位，
// 由调用方渲染 AndroidUpdateDialog；已是最新/检查失败一律静默，不打扰启动流程。

const AUTO_CHECK_DELAY_MS = 12000;

export function useAndroidUpdateAutoCheck(): [AndroidLatestRelease | null, () => void] {
    const [release, setRelease] = useState<AndroidLatestRelease | null>(null);

    useEffect(() => {
        if (!isFoliaAndroidApp()) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            checkForAndroidUpdate()
                .then((result) => {
                    if (!cancelled && result.kind === 'available') {
                        setRelease(result.release);
                    }
                })
                .catch(() => undefined);
        }, AUTO_CHECK_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, []);

    const dismiss = useCallback(() => setRelease(null), []);
    return [release, dismiss];
}
