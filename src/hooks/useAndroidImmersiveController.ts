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

export const useAndroidImmersiveController = () => {
    const androidImmersiveEnabled = useAndroidImmersiveStore(state => state.androidImmersiveEnabled);

    useEffect(() => {
        if (!isFoliaAndroidApp()) {
            return;
        }
        const bridge = window.foliaAndroid;
        if (!bridge) {
            return;
        }

        let immersiveActive = false;
        const apply = (next: boolean) => {
            if (immersiveActive !== next) {
                immersiveActive = next;
                bridge.setImmersiveMode(next);
            }
        };

        const evaluate = () => apply(androidImmersiveEnabled && !hasBlockingWindow());
        evaluate();

        const observer = new MutationObserver(evaluate);
        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-folia-keyboard-window'],
        });

        return () => {
            observer.disconnect();
            apply(false);
        };
    }, [androidImmersiveEnabled]);
};
