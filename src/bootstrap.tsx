import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './i18n/config';
import './index.css';
import App from './App';
import AppSplashGate from './components/AppSplashGate';
import { initializeLocalCoverRuntime } from './services/localCoverRuntime';
import { initFoliumClients } from './mods/folium/clientLoader';
import { restoreSavedFoliumSelections } from './mods/folium/missingEntries';
import { installFoliumCommandPaletteSync } from './mods/folium/commandPaletteSync';
import { installFoliumHostEvents } from './mods/folium/hostEvents';
import { isMainAppSurface, isObsBrowserSourceSurface, isRemoteControlSurface, obsSourceKind } from './utils/appSurface';
// 副作用 import：store 在模块加载时就把 `<html data-reduce-motion>` 写好并保持同步。放在 bootstrap
// 而不是 App 里，是因为下面按 URL 挂的根不止 App —— 远程控制窗口的进度辉光也读这个属性。
import './stores/useMotionSettingsStore';

// OBS / 远程控制表面只在特定 URL 下使用，懒加载以减小主应用的初始包体积。
const RemoteControlApp = lazy(() => import('./components/remote/RemoteControlApp'));
const ObsBrowserSourceApp = lazy(() => import('./components/obs/ObsBrowserSourceApp'));
const ObsNowPlayingSourceApp = lazy(() => import('./components/obs/ObsNowPlayingSourceApp'));
const ObsPlayerCapSourceApp = lazy(() => import('./components/obs/ObsPlayerCapSourceApp'));

// src/bootstrap.tsx
// Mounts the React app after index.tsx installs runtime-level browser shims.

// A mod visualizer or background saved to localStorage can only survive a
// restart if its registry entry exists before the settings store validates the
// stored mode. The store initializes eagerly through the static import graph,
// so the mode it read may already have fallen back to a builtin; after mod
// clients register their entries we restore the saved selections
// (src/mods/folium/missingEntries.ts, which also re-runs on every mod reload).

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
const isObsBrowserSource = isObsBrowserSourceSurface;
// obsSource=now-playing / playercap: static OBS overlay that connects directly to NowPlaying / PlayerCap in the browser (no Electron SSE relay).
const isNowPlayingObsSource = isObsBrowserSource && obsSourceKind === 'now-playing';
const isPlayerCapObsSource = isObsBrowserSource && obsSourceKind === 'playercap';
const isRemoteControl = isRemoteControlSurface;
// Mod clients belong to the main app window only. The remote-control window
// also has the Electron bridge, but mod state pushes only reach the main
// window, so a client activated there would never be torn down.
const isMainApp = isMainAppSurface;
import { hideAppSplash } from './utils/appSplash';

const renderApp = () => {
    root.render(
      <React.StrictMode>
        <AppSplashGate>
          <Suspense fallback={null}>
            {isNowPlayingObsSource
              ? <ObsNowPlayingSourceApp />
              : isPlayerCapObsSource
                ? <ObsPlayerCapSourceApp />
                : isObsBrowserSource
                  ? <ObsBrowserSourceApp />
                  : isRemoteControl
                    ? <RemoteControlApp />
                    : <App />}
          </Suspense>
        </AppSplashGate>
      </React.StrictMode>
    );
    queueMicrotask(hideAppSplash);
};

const bootFolium = async () => {
    if (!isMainApp) return;
    installFoliumCommandPaletteSync();
    installFoliumHostEvents();
    await initFoliumClients();
    restoreSavedFoliumSelections();
};

renderApp();

void Promise.all([bootFolium(), initializeLocalCoverRuntime()]);
