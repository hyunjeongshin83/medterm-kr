package kr.medit.medtermkr;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * MedTerm-KR 화면(assets/index.html)을 WebView 로 보여 주는 앱.
 * 화면·사전 데이터·검증 규칙이 모두 앱 안에 들어 있고, 인터넷 권한이 없어 바깥으로 나가는 통신이 없다.
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 개발용(디버그) 빌드에서만 크롬 원격 점검을 허용한다.
        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT); // 불러오는 동안 테마 배경색이 보이게(흰 번쩍임 방지)
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);          // React 화면이 필요로 한다
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);           // 기기 파일 접근 차단(file:///android_asset 는 이 설정과 상관없이 열린다)
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setBuiltInZoomControls(false);       // 확대·축소는 화면 안(그래프)에서 처리한다
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openOutside(request.getUrl());
            }
        });

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) {
            web.loadUrl(START_URL);
        }
    }

    /** 앱 안의 화면(file://)이면 그대로 두고, 웹 주소·메일·전화는 기기의 다른 앱으로 넘기고, 나머지는 막는다. */
    private boolean openOutside(Uri uri) {
        String scheme = uri.getScheme();
        if ("file".equals(scheme)) {
            return false;
        }
        if ("http".equals(scheme) || "https".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                // 열 수 있는 앱이 없으면 아무 일도 하지 않는다.
            }
        }
        return true;
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) {
            web.saveState(outState);
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
