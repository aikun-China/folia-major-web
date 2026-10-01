import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThemedDialog from '../../shared/ThemedDialog';
import {
    checkForAndroidUpdate,
    getFoliaAndroidBridge,
    pollDownloadProgress,
    type AndroidLatestRelease,
    type AndroidUpdateCheckResult,
} from '../../../services/androidUpdateService';

// src/components/modal/settings/AndroidUpdateDialog.tsx
// 安卓壳内置更新检测弹窗：打开即查 GitHub Release，发现新版本后交由原生 DownloadManager
// 下载（进度轮询 window.foliaAndroid.getDownloadProgress），完成后一键唤起系统安装器。

type AndroidUpdateDialogProps = {
    isOpen: boolean;
    isDaylight?: boolean;
    onClose: () => void;
};

type DownloadPhase = 'idle' | 'downloading' | 'ready' | 'failed';

const POLL_INTERVAL_MS = 600;

const AndroidUpdateDialog: React.FC<AndroidUpdateDialogProps> = ({ isOpen, isDaylight = false, onClose }) => {
    const { t } = useTranslation();
    const [isChecking, setIsChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<AndroidUpdateCheckResult | null>(null);
    const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>('idle');
    const [progress, setProgress] = useState({ received: 0, total: 0 });
    const [installHintVisible, setInstallHintVisible] = useState(false);
    const pollTimerRef = useRef<number | null>(null);

    const stopPolling = useCallback(() => {
        if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        stopPolling();
        pollTimerRef.current = window.setInterval(() => {
            const snapshot = pollDownloadProgress();
            setProgress({ received: snapshot.received, total: snapshot.total });
            if (snapshot.status === 'success') {
                stopPolling();
                setDownloadPhase('ready');
            } else if (snapshot.status === 'failed') {
                stopPolling();
                setDownloadPhase('failed');
            }
        }, POLL_INTERVAL_MS);
    }, [stopPolling]);

    const startCheck = useCallback(async () => {
        setIsChecking(true);
        setCheckResult(null);
        setDownloadPhase('idle');
        setProgress({ received: 0, total: 0 });
        setInstallHintVisible(false);
        try {
            const result = await checkForAndroidUpdate();
            setCheckResult(result);
            // 打开时若已有原生下载在进行（例如上次中途退出弹窗），无缝续接进度。
            if (result.kind === 'available') {
                const snapshot = pollDownloadProgress();
                if (snapshot.status === 'success') {
                    setDownloadPhase('ready');
                    setProgress({ received: snapshot.received, total: snapshot.total });
                } else if (snapshot.status === 'running' || snapshot.status === 'paused') {
                    setDownloadPhase('downloading');
                    setProgress({ received: snapshot.received, total: snapshot.total });
                    startPolling();
                }
            }
        } catch (error) {
            console.error('[AndroidUpdate] Unexpected check failure:', error);
            setCheckResult({ kind: 'error', message: 'network' });
        } finally {
            setIsChecking(false);
        }
    }, [startPolling]);

    useEffect(() => {
        if (!isOpen) {
            stopPolling();
            return;
        }
        void startCheck();
    }, [isOpen, startCheck, stopPolling]);

    useEffect(() => stopPolling, [stopPolling]);

    const handleStartDownload = () => {
        if (checkResult?.kind !== 'available') return;
        const bridge = getFoliaAndroidBridge();
        if (!bridge) return;
        const started = bridge.downloadUpdate(checkResult.release.apkDownloadUrl, checkResult.release.apkFileName);
        if (!started) {
            setDownloadPhase('failed');
            return;
        }
        setDownloadPhase('downloading');
        setProgress({ received: 0, total: 0 });
        startPolling();
    };

    const handleCancelDownload = () => {
        stopPolling();
        getFoliaAndroidBridge()?.cancelUpdateDownload();
        setDownloadPhase('idle');
        setProgress({ received: 0, total: 0 });
    };

    const handleInstall = () => {
        const bridge = getFoliaAndroidBridge();
        if (!bridge) return;
        const launched = bridge.installDownloadedUpdate();
        if (!launched) {
            setInstallHintVisible(true);
        }
    };

    const release: AndroidLatestRelease | null = checkResult?.kind === 'available' ? checkResult.release : null;
    const currentVersion = checkResult && checkResult.kind !== 'error' ? checkResult.currentVersion : '';
    const latestVersion = release?.versionName
        ?? (checkResult?.kind === 'up-to-date' ? checkResult.latestVersion : '');
    const hasKnownTotal = progress.total > 0;
    const progressPercent = hasKnownTotal
        ? Math.min(100, Math.round((progress.received / progress.total) * 100))
        : 0;
    const progressLabel = hasKnownTotal
        ? `${progressPercent}%`
        : `${(progress.received / (1024 * 1024)).toFixed(1)} MB`;

    const textPrimary = isDaylight ? 'text-zinc-900' : 'text-white';
    const textSecondary = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    const versionRowClass = `flex items-center justify-between rounded-xl bg-white/5 px-4 py-2.5 text-sm ${textPrimary}`;
    const cancelBtnClass = isDaylight
        ? 'bg-zinc-100/80 hover:bg-zinc-200 border-zinc-200 text-zinc-700'
        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white';
    const primaryBtnClass = isDaylight
        ? 'bg-zinc-900 hover:bg-zinc-800 text-white'
        : 'bg-white hover:bg-zinc-100 text-zinc-900';

    const renderVersionRow = (labelKey: string, version: string) => (
        <div className={versionRowClass}>
            <span className={textSecondary}>{t(labelKey)}</span>
            <span className="font-mono">{version}</span>
        </div>
    );

    const renderBody = () => {
        if (isChecking || !checkResult) {
            return (
                <div className={`flex items-center gap-3 py-4 text-sm ${textSecondary}`}>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('androidUpdate.checking')}
                </div>
            );
        }

        if (checkResult.kind === 'error') {
            return (
                <p className={`py-2 text-sm ${textSecondary}`}>
                    {t(checkResult.message === 'no-release' ? 'androidUpdate.errorNoRelease' : 'androidUpdate.errorNetwork')}
                </p>
            );
        }

        return (
            <div className="space-y-3">
                {renderVersionRow('androidUpdate.currentVersion', currentVersion)}
                {renderVersionRow('androidUpdate.latestVersion', latestVersion)}

                {checkResult.kind === 'up-to-date' && (
                    <p className="text-sm font-medium text-emerald-400">{t('androidUpdate.upToDate')}</p>
                )}

                {release && downloadPhase === 'downloading' && (
                    <div className="space-y-2 pt-1">
                        <div className={`flex items-center justify-between text-xs ${textSecondary}`}>
                            <span>{t('androidUpdate.downloading')}</span>
                            <span className="font-mono">{progressLabel}</span>
                        </div>
                        <div className={`h-2 w-full overflow-hidden rounded-full ${isDaylight ? 'bg-zinc-200' : 'bg-white/10'}`}>
                            {hasKnownTotal ? (
                                <div
                                    className="h-full rounded-full bg-current transition-all duration-300"
                                    style={{ width: `${progressPercent}%`, color: 'var(--accent-color, #8b8bff)' }}
                                />
                            ) : (
                                <div className="h-full w-1/3 animate-pulse rounded-full bg-current" style={{ color: 'var(--accent-color, #8b8bff)' }} />
                            )}
                        </div>
                    </div>
                )}

                {release && downloadPhase === 'ready' && (
                    <p className="text-sm font-medium text-emerald-400">{t('androidUpdate.readyToInstall')}</p>
                )}

                {release && downloadPhase === 'failed' && (
                    <p className="text-sm font-medium text-red-400">{t('androidUpdate.downloadFailed')}</p>
                )}

                {release && installHintVisible && (
                    <p className="text-xs leading-relaxed text-amber-400">{t('androidUpdate.installPermissionHint')}</p>
                )}

                {release && release.releaseNotes && (
                    <div className="pt-1">
                        <h4 className={`mb-1.5 text-xs font-semibold uppercase tracking-wider ${textSecondary}`}>
                            {t('androidUpdate.releaseNotes')}
                        </h4>
                        <div
                            className={`max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-white/5 p-3 text-xs leading-relaxed custom-scrollbar ${textSecondary}`}
                        >
                            {release.releaseNotes}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderFooter = () => {
        if (isChecking || !checkResult) {
            return null;
        }

        if (checkResult.kind === 'error') {
            return (
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${cancelBtnClass}`}
                    >
                        {t('androidUpdate.close')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void startCheck()}
                        className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${primaryBtnClass}`}
                    >
                        {t('androidUpdate.retry')}
                    </button>
                </>
            );
        }

        if (checkResult.kind === 'up-to-date') {
            return (
                <button
                    type="button"
                    onClick={onClose}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${primaryBtnClass}`}
                >
                    {t('androidUpdate.close')}
                </button>
            );
        }

        // available：按下载阶段给出操作
        if (downloadPhase === 'downloading') {
            return (
                <button
                    type="button"
                    onClick={handleCancelDownload}
                    className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${cancelBtnClass}`}
                >
                    {t('androidUpdate.cancelDownload')}
                </button>
            );
        }

        if (downloadPhase === 'ready') {
            return (
                <>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${cancelBtnClass}`}
                    >
                        {t('androidUpdate.later')}
                    </button>
                    <button
                        type="button"
                        onClick={handleInstall}
                        className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${primaryBtnClass}`}
                    >
                        {t('androidUpdate.installNow')}
                    </button>
                </>
            );
        }

        return (
            <>
                {downloadPhase === 'failed' ? (
                    <button
                        type="button"
                        onClick={handleCancelDownload}
                        className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${cancelBtnClass}`}
                    >
                        {t('androidUpdate.close')}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onClose}
                        className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-colors ${cancelBtnClass}`}
                    >
                        {t('androidUpdate.later')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={handleStartDownload}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${primaryBtnClass}`}
                >
                    {downloadPhase === 'failed' ? t('androidUpdate.retry') : t('androidUpdate.updateNow')}
                </button>
            </>
        );
    };

    const dialogTitle = downloadPhase === 'ready' && checkResult?.kind === 'available'
        ? t('androidUpdate.readyTitle')
        : t('androidUpdate.title');

    return (
        <ThemedDialog
            isOpen={isOpen}
            onClose={onClose}
            isDaylight={isDaylight}
            title={dialogTitle}
            children={renderBody()}
            footer={renderFooter()}
        />
    );
};

export default AndroidUpdateDialog;
