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

// 从全局账号 store 解析当前网易云登录 UID（未登录返回 null）
export const resolveNeteaseUidFromAccountStore = (): string | null => {
    const user = useOnlineProviderAccountStore.getState().accounts.netease?.user;
    return user?.id != null ? String(user.id) : null;
};
