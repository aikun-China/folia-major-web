import { create } from 'zustand';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';

// src/stores/useAndroidImmersiveStore.ts
// 沉浸式全屏开关（仅 APK 客户端可见）：默认开启，持久化到 localStorage。
// 设置面板的开关与 App 根部的 useAndroidImmersiveController 通过这里共享状态。

const STORAGE_KEY = 'android_immersive_enabled';

export type AndroidImmersiveState = {
    androidImmersiveEnabled: boolean;
    handleToggleAndroidImmersive: (enabled: boolean) => void;
};

export const useAndroidImmersiveStore = create<AndroidImmersiveState>((set) => ({
    androidImmersiveEnabled: getStoredBoolean(STORAGE_KEY, true),
    handleToggleAndroidImmersive: (enabled) => {
        set({ androidImmersiveEnabled: enabled });
        setStoredBoolean(STORAGE_KEY, enabled);
    },
}));
