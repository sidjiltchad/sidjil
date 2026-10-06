package org.sidjil.researcher;

import android.os.Bundle;
import android.content.pm.ApplicationInfo;
import android.util.Log;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Install the Android 12+ splash contract before BridgeActivity creates
        // the WebView. The condition is deliberately false: the web shell owns
        // its own loading and offline states, so native startup must never wait
        // for a network/session request.
        SplashScreen.installSplashScreen(this)
                .setKeepOnScreenCondition(() -> false);
        super.onCreate(savedInstanceState);
        configureSessionCookies();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        installStatusBarInsetsBridge();
    }

    /**
     * The production API is on app.sidjil.org while the Capacitor shell is
     * served from https://localhost.  Keep the server's HttpOnly/Secure
     * SameSite policy, but allow WebView to retain that explicit native
     * session cookie instead of dropping it as a third-party cookie.
     */
    private void configureSessionCookies() {
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            Log.d("SidjilAuth", "WebView session cookies enabled; third-party policy allowed for API session cookie");
        }
    }

    private void installStatusBarInsetsBridge() {
        View decorView = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, insets) -> {
            Insets statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars());
            float density = getResources().getDisplayMetrics().density;
            float cssPx = density > 0 ? statusBars.top / density : statusBars.top;
            if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                Log.d("SidjilInsets", "statusBars().top=" + statusBars.top + "px density=" + density + " css=" + cssPx + "px");
            }
            publishStatusBarInsets(statusBars.top, cssPx, density);
            return insets;
        });
        ViewCompat.requestApplyInsets(decorView);
    }

    private void publishStatusBarInsets(int rawPx, float cssPx, float density) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;
        String script = "(function(){"
                + "var root=document.documentElement;"
                + "root.style.setProperty('--sidjil-status-bar-inset-top','" + cssPx + "px');"
                + "root.style.setProperty('--sidjil-header-safe-top','" + cssPx + "px');"
                + "window.dispatchEvent(new CustomEvent('sidjil:native-insets',{detail:{statusBarInsetTopPx:" + rawPx + ",statusBarInsetTopCssPx:" + cssPx + ",density:" + density + "}}));"
                + "})();";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }
}
