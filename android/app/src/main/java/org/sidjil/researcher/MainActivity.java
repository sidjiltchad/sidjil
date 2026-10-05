package org.sidjil.researcher;

import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

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
    }
}
