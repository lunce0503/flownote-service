package com.flownote.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;

import java.io.OutputStream;

/** Full web product hosted on its HTTPS origin. No native JavaScript interface is exposed. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 10, SAVE_FILE = 11;
    private static final int IVORY = Color.rgb(247, 243, 232);
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingDownload;
    private View fullscreenView;
    private WebChromeClient.CustomViewCallback fullscreenCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(IVORY);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        setContentView(root);
        web = new WebView(this);
        web.setBackgroundColor(IVORY);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " FlownoteAndroid/1.0.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setProgressTintList(android.content.res.ColorStateList.valueOf(Color.rgb(23, 23, 20)));
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3)));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(android.view.Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(28), dp(28), dp(28));
        errorPanel.setBackgroundColor(IVORY);
        TextView message = new TextView(this);
        message.setText("연결을 확인해 주세요\n인터넷에 연결한 뒤 다시 시도할 수 있습니다.");
        message.setTextSize(18);
        message.setTextColor(Color.rgb(23, 23, 20));
        message.setGravity(android.view.Gravity.CENTER);
        errorPanel.addView(message);
        Button retry = new Button(this);
        retry.setText("다시 시도");
        retry.setOnClickListener(view -> { errorPanel.setVisibility(View.GONE); web.reload(); });
        errorPanel.addView(retry);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) return false;
                openExternal(request.getUrl());
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                progress.setVisibility(View.VISIBLE);
                errorPanel.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                if (trusted(Uri.parse(url))) view.evaluateJavascript(
                    "if(!window.__flownoteDownloadListener){window.__flownoteDownloadListener=true;document.addEventListener('click',e=>{"
                    + "const a=e.target instanceof Element?e.target.closest('a[download]'):null;"
                    + "if(a)window.__flownoteDownloadFile={url:a.href,name:a.download}},true)}", null);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) { errorPanel.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, android.webkit.WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) {
                    errorPanel.setVisibility(View.VISIBLE);
                    progress.setVisibility(View.GONE);
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return; }
                fullscreenView = view;
                fullscreenCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
            }
            @Override public void onHideCustomView() { exitFullscreen(); }
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trusted(Uri.parse(view.getUrl() == null ? "" : view.getUrl()))) return false;
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                String[] types = java.util.Arrays.stream(params.getAcceptTypes())
                    .flatMap(value -> java.util.Arrays.stream(value.split(",")))
                    .map(String::trim).filter(value -> value.contains("/")).toArray(String[]::new);
                if (types.length > 0) intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try { startActivityForResult(intent, PICK_FILE); }
                catch (ActivityNotFoundException error) { callback.onReceiveValue(null); fileCallback = null; }
                return true;
            }
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("확인", (dialog, which) -> result.confirm())
                    .setNegativeButton("취소", (dialog, which) -> result.cancel()).setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setDownloadListener(this::download);
        if (state == null || web.restoreState(state) == null) web.loadUrl(BuildConfig.WEB_URL);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(0, this::goBack);
    }

    private boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && Uri.parse(BuildConfig.WEB_URL).getHost().equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private void openExternal(Uri uri) {
        if (!java.util.Arrays.asList("https", "mailto", "tel").contains(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException error) { toast("이 링크를 열 수 있는 앱이 없습니다."); }
    }

    private void download(String url, String userAgent, String disposition, String mime, long length) {
        if (pendingDownload != null) { toast("진행 중인 파일 저장을 먼저 완료해 주세요."); return; }
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            if (!trusted(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) return;
            // Read the selected browser download through a one-shot callback, never a JS bridge.
            String script = "(async()=>{try{const b=await(await fetch(" + JSONObject.quote(url) + ")).blob();"
                + "if(b.size>33554432)return '';return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)})}catch(e){return ''}})()";
            // evaluateJavascript does not await promises: poll a private per-download page value.
            String key = "__flownoteDownload" + System.nanoTime();
            web.evaluateJavascript("window[" + JSONObject.quote(key) + "]=null;" + script + ".then(v=>window[" + JSONObject.quote(key) + "]=v)", null);
            web.evaluateJavascript("window.__flownoteDownloadFile?.url===" + JSONObject.quote(url)
                + "?window.__flownoteDownloadFile.name:null", value -> {
                String name = URLUtil.guessFileName(url, disposition, mime);
                try {
                    Object decoded = new org.json.JSONTokener(value).nextValue();
                    if (decoded instanceof String && !((String) decoded).isEmpty()) name = (String) decoded;
                } catch (Exception ignored) { }
                readDownload(key, name, mime, 0);
            });
            return;
        }
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme())) return;
        try {
            DownloadManager.Request request = new DownloadManager.Request(uri).setMimeType(mime)
                .setTitle(URLUtil.guessFileName(url, disposition, mime))
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, disposition, mime));
            request.addRequestHeader("User-Agent", userAgent);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            toast("다운로드를 시작했습니다.");
        } catch (RuntimeException error) { toast("다운로드를 시작할 수 없습니다."); }
    }

    private void readDownload(String key, String name, String mime, int attempt) {
        if (isFinishing() || isDestroyed()) return;
        web.evaluateJavascript("window[" + JSONObject.quote(key) + "]", value -> {
            if ("null".equals(value) && attempt < 100) {
                web.postDelayed(() -> readDownload(key, name, mime, attempt + 1), 100);
                return;
            }
            web.evaluateJavascript("delete window[" + JSONObject.quote(key) + "]", null);
            try {
                String data = new org.json.JSONTokener(value).nextValue().toString();
                if (!data.startsWith("data:") || !data.contains(";base64,")) throw new IllegalArgumentException();
                pendingDownload = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
                startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime == null ? "application/octet-stream" : mime.split(";")[0]).putExtra(Intent.EXTRA_TITLE, name), SAVE_FILE);
            } catch (Exception error) { pendingDownload = null; toast("파일을 저장할 수 없습니다. 32MB 이하의 파일을 선택해 주세요."); }
        });
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && fileCallback != null) {
            java.util.ArrayList<Uri> uris = new java.util.ArrayList<>();
            if (result == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
                } else if (data.getData() != null) uris.add(data.getData());
            }
            // The system picker grants only the user-selected content URIs.
            uris.removeIf(uri -> !"content".equals(uri.getScheme()));
            fileCallback.onReceiveValue(uris.isEmpty() ? null : uris.toArray(new Uri[0]));
            fileCallback = null;
        }
        if (request == SAVE_FILE) {
            byte[] bytes = pendingDownload;
            pendingDownload = null;
            if (result == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                new Thread(() -> {
                    try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                        if (stream == null) throw new java.io.IOException();
                        stream.write(bytes);
                        runOnUiThread(() -> toast("파일을 저장했습니다."));
                    } catch (Exception error) { runOnUiThread(() -> toast("파일 저장에 실패했습니다.")); }
                }).start();
            }
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void toast(String message) { Toast.makeText(this, message, Toast.LENGTH_LONG).show(); }
    private void exitFullscreen() {
        if (fullscreenView == null) return;
        ((ViewGroup) fullscreenView.getParent()).removeView(fullscreenView);
        fullscreenView = null;
        web.setVisibility(View.VISIBLE);
        WebChromeClient.CustomViewCallback callback = fullscreenCallback;
        fullscreenCallback = null;
        if (callback != null) callback.onCustomViewHidden();
    }
    private void goBack() {
        if (fullscreenView != null) { exitFullscreen(); return; }
        web.evaluateJavascript("(()=>{const close=document.querySelector('[data-android-menu-close]');if(close){close.click();return true;}return false;})()", handled -> {
            if (isFinishing() || isDestroyed() || "true".equals(handled)) return;
            if (web.canGoBack()) web.goBack(); else finish();
        });
    }
    @Override public void onBackPressed() { goBack(); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        pendingDownload = null;
        ((ViewGroup) web.getParent()).removeView(web);
        web.destroy();
        super.onDestroy();
    }
}
