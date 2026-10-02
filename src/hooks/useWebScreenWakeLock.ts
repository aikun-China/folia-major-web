import { useEffect } from 'react';

// src/hooks/useWebScreenWakeLock.ts
// Web/安卓壳侧的屏幕常亮：开启"播放时阻止休眠"且正在播放时，把页面挂到
// Screen Wake Lock 上，暂停/停止后释放。Electron renderer 不走这里——桌面端由
// powerSaveBlocker 链路负责（useElectronDisplaySleepBlocker），避免两套机制叠加。
// WebView Android 84+ 支持该 API；不支持的旧壳在 feature 检测处静默退出。

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: 'screen') => Promise<WakeLockSentinelLike> };

export function useWebScreenWakeLock(enabled: boolean, isPlaying: boolean) {
    useEffect(() => {
        if (!enabled || !isPlaying) return;
        if (window.electron) return;
        const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
        if (!wakeLock) return;

        let sentinel: WakeLockSentinelLike | null = null;
        let disposed = false;

        const acquire = async () => {
            if (disposed || sentinel || document.visibilityState !== 'visible') return;
            try {
                const next = await wakeLock.request('screen');
                if (disposed) {
                    // 等待期间 effect 已清理：立即归还，不留悬挂锁。
                    void next.release().catch(() => undefined);
                    return;
                }
                sentinel = next;
            } catch {
                // 系统拒绝（省电模式/低电量/页面不可见等）：静默放弃本轮，
                // visibilitychange 回到前台时会再试。
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            // 页面隐藏期间系统已自动释放旧 sentinel；回到前台重新申请。
            sentinel = null;
            void acquire();
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        void acquire();

        return () => {
            disposed = true;
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            sentinel?.release().catch(() => undefined);
            sentinel = null;
        };
    }, [enabled, isPlaying]);
}
