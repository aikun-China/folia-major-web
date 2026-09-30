// src/utils/platform.ts
// One place to answer "is this a Mac", so keyboard handling and the shortcut hints the user reads
// can never disagree about it. Detection is by user agent because the renderer runs both in a
// browser and in Electron, and `window.electron?.platform` only exists in the latter.

export const isMacPlatform = typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('mac');

/**
 * The modifier a shortcut declared as `ctrl` actually uses here: Cmd on macOS, Ctrl elsewhere.
 * Shortcuts are declared once with `ctrl` and translated at the point of use, rather than each
 * declaration carrying a per-platform variant.
 */
export const isPrimaryModifierPressed = (event: KeyboardEvent): boolean => (
    isMacPlatform ? event.metaKey : event.ctrlKey
);

/** The modifier that must stay *up* for a primary-modifier shortcut to be unambiguous. */
export const isSecondaryModifierPressed = (event: KeyboardEvent): boolean => (
    isMacPlatform ? event.ctrlKey : event.metaKey
);

/** Label for the primary modifier, for shortcut hints shown in the UI. */
export const PRIMARY_MODIFIER_LABEL = isMacPlatform ? 'Cmd' : 'Ctrl';

/**
 * Folia 安卓壳（APK）探测：壳在页面加载前注入 window.foliaAndroid 桥，但为了容错
 * （桥注入失败或脚本执行早于 onCreate 完成），运行时惰性探测而不是模块加载期快照。
 */
export const isFoliaAndroidApp = (): boolean => (
    typeof window !== 'undefined'
    && Boolean((window as typeof window & { foliaAndroid?: unknown; }).foliaAndroid)
);

/** 安卓壳下才参与渲染的通用判定（设置项、帮助页动作等）。 */
export const isAndroidShellTarget = (): boolean => (
    typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('android')
    && isFoliaAndroidApp()
);

/**
 * 纯 UA 级安卓判定（含普通安卓浏览器，不要求壳注入桥）。惰性求值：
 * 目录上传（webkitdirectory）在安卓 Chromium 上不受支持，能力检测命不中这一点，
 * 需要用 UA 在运行时区分"支持目录上传的桌面浏览器"与"安卓降级多选"。
 */
export const isAndroidUserAgent = (): boolean => (
    typeof navigator !== 'undefined'
    && navigator.userAgent.toLowerCase().includes('android')
);
