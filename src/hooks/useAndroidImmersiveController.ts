import { useEffect } from 'react';
import { isFoliaAndroidApp } from '../utils/platform';
import { hasBlockingWindow } from '../utils/keyboardTargets';
import { useAndroidImmersiveStore } from '../stores/useAndroidImmersiveStore';

// src/hooks/useAndroidImmersiveController.ts
// APK 端沉浸式全屏控制器，挂在 App 根部（App.tsx）。把两个条件合成一条原生指令：
// 用户开关（useAndroidImmersiveStore）且当前没有浮层（data-folia-keyboard-window 协议）。
//
// 浮层（ThemedDialog 系弹窗、PonderStage 离场层等）都按仓库约定自己挂
// data-folia-keyboard-window="true"，这里不去订阅任何具体弹窗，而是用 MutationObserver
// 盯 document 上该属性的出现/移除：出现任一浮层 → 调 setImmersiveMode(false) 临时恢复
// 状态栏，全部消失 → 恢复沉浸。开关翻转时整个 effect 重跑，状态自动对齐。
//
// 初始同步可能因时机丢失（桥晚于 effect 注入、WebView restoreState 重载、系统在窗口
// 事件之间清掉状态栏状态），所以除浮层观察外还在 visibilitychange/focus/pageshow 与
// 原生 onPageFinished 派发的 folia-android-page-ready 事件上重评估；桥尚未注入时短暂
// 轮询等待而不是静默放弃（否则初始同步会永久丢失，只剩手动翻转开关可救）。

const BRIDGE_RETRY_INTERVAL_MS = 400;
const BRIDGE_RETRY_MAX_ATTEMPTS = 25;

export const useAndroidImmersiveController = () => {
    const androidImmersiveEnabled = useAndroidImmersiveStore(state => state.androidImmersiveEnabled);

    useEffect(() => {
        if (!isFoliaAndroidApp()) {
            return;
        }

        let immersiveActive = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let disposed = false;

        const apply = (next: boolean) => {
            const bridge = window.foliaAndroid;
            if (!bridge) {
                return;
            }
            if (immersiveActive !== next) {
                immersiveActive = next;
                bridge.setImmersiveMode(next);
            }
        };

        const evaluate = () => apply(androidImmersiveEnabled && !hasBlockingWindow());

        const waitForBridge = (attempt: number) => {
            if (disposed) {
                return;
            }
            if (window.foliaAndroid || attempt >= BRIDGE_RETRY_MAX_ATTEMPTS) {
                evaluate();
                return;
            }
            retryTimer = setTimeout(() => waitForBridge(attempt + 1), BRIDGE_RETRY_INTERVAL_MS);
        };

        if (window.foliaAndroid) {
            evaluate();
        } else {
            waitForBridge(0);
        }

        const observer = new MutationObserver(evaluate);
        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-folia-keyboard-window'],
        });

        document.addEventListener('visibilitychange', evaluate);
        window.addEventListener('focus', evaluate);
        window.addEventListener('pageshow', evaluate);
        window.addEventListener('folia-android-page-ready', evaluate);

        return () => {
            disposed = true;
            if (retryTimer !== null) {
                clearTimeout(retryTimer);
            }
            observer.disconnect();
            document.removeEventListener('visibilitychange', evaluate);
            window.removeEventListener('focus', evaluate);
            window.removeEventListener('pageshow', evaluate);
            window.removeEventListener('folia-android-page-ready', evaluate);
            apply(false);
        };
    }, [androidImmersiveEnabled]);
};
