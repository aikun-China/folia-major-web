import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';

// src/services/sync/syncIdentity.ts
// 网易云 UID 驱动的同步身份管理。
// 只有登录网易云账号的设备才参与设置云同步，UID 作为云端数据的命名空间；
// 未登录/登出后保持纯本地模式（设置仅缓存在本地）。

const SYNC_UID_HEADER = 'X-Sync-UID';

let currentUid: string | null = null;

export const getSyncUidHeaderName = (): string => SYNC_UID_HEADER;

export const getCurrentSyncUid = (): string | null => currentUid;

export const setCurrentSyncUid = (uid: string | null) => {
    currentUid = uid;
};

// 从全局账号 store 解析当前网易云登录 UID（未登录或未经服务端验证返回 null）
// verified 门禁：只有本会话内通过 omni.getLoginStatus 交叉验证过的账号才允许参与同步，
// 防止启动时快照恢复出的本地缓存身份（未经验证）触发自动同步。
export const resolveNeteaseUidFromAccountStore = (): string | null => {
    const account = useOnlineProviderAccountStore.getState().accounts.netease;
    if (!account?.verified || account.user?.id == null) return null;
    return String(account.user.id);
};
