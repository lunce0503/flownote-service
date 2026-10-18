'use strict';
const { app, BrowserWindow, Menu, shell, dialog, session } = require('electron');
const path = require('node:path');
const { PROFILES, profileForArgs, trustedUrl, externalUrl, safeDownloadName } = require('./policy.cjs');

const profile = profileForArgs(process.argv);
const origin = PROFILES[profile];
app.setName(profile === 'staging' ? 'Flownote Staging' : 'Flownote');
app.setPath('userData', path.join(app.getPath('appData'), profile === 'staging' ? 'Flownote-Staging' : 'Flownote'));
app.enableSandbox();
let window;

function openExternal(url) {
  if (externalUrl(url)) void shell.openExternal(url).catch(() => {});
}
function goBack() {
  if (!window || window.isDestroyed()) return;
  void window.webContents.executeJavaScript("(()=>{const close=document.querySelector('[data-android-menu-close]');if(close){close.click();return true;}return false;})()")
    .then(handled => { if (!handled && window && !window.isDestroyed() && window.webContents.navigationHistory.canGoBack()) window.webContents.navigationHistory.goBack(); })
    .catch(() => {});
}
function showConnectionError() {
  if (!window || window.isDestroyed()) return;
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Flownote</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#f7f3e8;color:#171714;font-family:system-ui}main{max-width:440px;padding:32px}h1{font-size:28px}p{line-height:1.7;color:#706b60}a{display:inline-block;padding:14px 24px;border-radius:12px;background:#171714;color:#f7f3e8;text-decoration:none}</style><main><h1>연결을 확인해 주세요</h1><p>인터넷에 연결한 뒤 다시 시도해 주세요.<br>저장된 로그인과 로컬 초안은 유지됩니다.</p><a href="${origin}">다시 시도</a></main></html>`;
  void window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`).catch(() => {});
}
function loadHome() { if (window && !window.isDestroyed()) void window.loadURL(origin).catch(() => {}); }

function createWindow() {
  window = new BrowserWindow({
    width: 1280, height: 900, minWidth: 700, minHeight: 560,
    title: profile === 'staging' ? 'Flownote · Staging' : 'Flownote',
    backgroundColor: '#f7f3e8', show: false, icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false, webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false },
  });
  window.webContents.setUserAgent(`${window.webContents.getUserAgent()} FlownoteDesktop/${app.getVersion()}`);
  window.once('ready-to-show', () => window.show());
  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedUrl(url, origin)) { event.preventDefault(); openExternal(url); }
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!trustedUrl(url, origin)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (trustedUrl(url, origin)) void window.loadURL(url).catch(() => {});
    else openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
    if (mainFrame && code !== -3) showConnectionError();
  });
  window.webContents.on('render-process-gone', showConnectionError);
  window.on('closed', () => { window = null; });
  window.webContents.on('page-title-updated', (event, title) => {
    event.preventDefault();
    window.setTitle(`${title || 'Flownote'}${profile === 'staging' ? ' · Staging' : ''} — Flownote`);
  });
  loadHome();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId('com.flownote.desktop');
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(trustedUrl(contents.getURL(), origin) && permission === 'clipboard-sanitized-write');
    });
    session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
      trustedUrl(requestingOrigin, origin) && permission === 'clipboard-sanitized-write');
    session.defaultSession.on('will-download', (event, item, contents) => {
      if (!contents || !trustedUrl(contents.getURL(), origin)) { event.preventDefault(); return; }
      item.setSaveDialogOptions({ title: 'Flownote 파일 저장', defaultPath: path.join(app.getPath('downloads'), safeDownloadName(item.getFilename())) });
      item.once('done', (_event, state) => {
        if (state === 'interrupted' && window && !window.isDestroyed()) void dialog.showMessageBox(window, { type: 'error', message: '다운로드를 완료하지 못했습니다.', detail: '연결을 확인한 뒤 다시 시도해 주세요.' });
      });
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Flownote', submenu: [{ label: '홈', accelerator: 'CmdOrCtrl+H', click: loadHome }, { type: 'separator' }, { role: 'quit', label: '종료' }] },
      { label: '편집', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '이동', submenu: [{ label: '뒤로', accelerator: 'Alt+Left', click: goBack }, { label: '앞으로', accelerator: 'Alt+Right', click: () => { if (window?.webContents.navigationHistory.canGoForward()) window.webContents.navigationHistory.goForward(); } }] },
      { label: '보기', submenu: [{ role: 'reload', label: '새로고침' }, { role: 'forceReload', label: '캐시 없이 새로고침' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen', label: '전체 화면' }] },
      { label: '도움말', submenu: [{ label: '릴리즈 및 설치 안내', click: () => openExternal('https://flownote-react.vercel.app/windows.html') }] },
    ]));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
