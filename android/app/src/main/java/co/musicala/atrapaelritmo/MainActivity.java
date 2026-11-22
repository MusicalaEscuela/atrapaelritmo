package co.musicala.atrapaelritmo;

import android.app.Activity;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return openGameAsset(request.getUrl());
            }
        });
        setContentView(webView);
        webView.loadUrl("https://" + HOST + "/index.html");
    }

    // An HTTPS origin lets the WebView load ES modules and retain local storage.
    private WebResourceResponse openGameAsset(Uri url) {
        if (!"https".equals(url.getScheme()) || !HOST.equals(url.getHost())) return null;
        String path = url.getPath();
        if (path == null || !path.matches("/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_.-]+")) return null;

        String mimeType;
        if (path.endsWith(".html")) mimeType = "text/html";
        else if (path.endsWith(".css")) mimeType = "text/css";
        else if (path.endsWith(".js")) mimeType = "text/javascript";
        else if (path.endsWith(".png")) mimeType = "image/png";
        else if (path.endsWith(".wav")) mimeType = "audio/wav";
        else return null;

        try {
            return new WebResourceResponse(mimeType, mimeType.startsWith("text/") ? "UTF-8" : null,
                    getAssets().open(path.substring(1)));
        } catch (IOException missingAsset) {
            return null;
        }
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }
}
