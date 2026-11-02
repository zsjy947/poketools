package com.poketools.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 应用主窗口：全屏 WebView 加载内置资产 www/index.html。
 *
 * 资产经虚拟 https 域（appassets.poketools）由 shouldInterceptRequest 从
 * assets/www/ 提供——不用 file:// 直载：前端数据层（web/src/data/core.ts）
 * 以 fetch() 读取 JSON 分片，file:// 页面的 fetch 被 WebView 拒绝；虚拟域下
 * 页面与分片同源，fetch / localStorage / ES module（严格 MIME）全部原生可用。
 *
 * 前端完全离线：无后端探测会自动落入本地数据引擎（api.ts _localMode），
 * 应用不申请任何权限。
 */
public class MainActivity extends Activity {

    /** 虚拟资产域（.poketools 保留 TLD，公网不可解析） */
    private static final String START_URL = "https://" + Assets.HOST + "/index.html";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);          // 图鉴进度 / 自定义食谱等 localStorage
        webView.setBackgroundColor(0xFFEEF1F6);       // 与前端 body 底色一致，避免启动白闪
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                                                              WebResourceRequest request) {
                return Assets.intercept(getAssets(), request.getUrl());
            }
        });
        webView.loadUrl(START_URL);
        setContentView(webView);
    }

    /**
     * 返回键：先交给前端（关闭打开中的弹层），前端未处理时 WebView 后退
     * （hash 路由的历史栈天然兼容），都没有则退出应用。
     */
    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(window.__onBackPressed ? window.__onBackPressed() : false)",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if ("true".equals(value) || "\"true\"".equals(value)) {
                            return; // 前端已消费（关闭了弹层）
                        }
                        if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}

/** assets/www/ → 虚拟 https 域的静态资源服务（MIME 严格匹配，模块脚本必需）。 */
final class Assets {

    /** 虚拟资产域（.poketools 保留 TLD，公网不可解析） */
    static final String HOST = "appassets.poketools";

    private Assets() {
    }

    static WebResourceResponse intercept(AssetManager am, Uri url) {
        if (!HOST.equals(url.getHost())) {
            return null; // 非虚拟域交 WebView 默认处理（离线下必然失败，无外链需求）
        }
        String path = url.getPath();
        if (path == null || path.isEmpty() || path.equals("/")) {
            path = "index.html";
        } else {
            path = path.substring(1);
        }
        if (path.contains("..")) {
            return notFound(); // 路径穿越守卫
        }
        try {
            InputStream in = am.open("www/" + path);
            String mime = mimeOf(path);
            return new WebResourceResponse(mime, encodingOf(mime), in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static String mimeOf(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".map")) return "application/json";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".otf")) return "font/otf";
        if (lower.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private static String encodingOf(String mime) {
        return (mime.startsWith("text/") || mime.equals("application/json")
                || mime.equals("image/svg+xml") || mime.equals("application/manifest+json"))
                ? "utf-8" : null;
    }

    private static WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                headers, new ByteArrayInputStream(new byte[0]));
    }
}
