package com.mayday.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    companion object {
        private const val LIVE_APP_URL = "https://namanbuildsstuff.github.io/Mayday/"
        private const val OFFLINE_APP_URL = "file:///android_asset/www/index.html"
    }

    private lateinit var webView: WebView
    private lateinit var loadingBar: ProgressBar

    private var pendingWidgetAction: String? = null
    private var isPageReady = false
    private var loadedOfflineFallback = false

    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val granted = results[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            results[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
        pendingGeoCallback = null
        pendingGeoOrigin = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        loadingBar = findViewById(R.id.loading_bar)

        pendingWidgetAction = intent?.getStringExtra(MaydayPrefs.EXTRA_WIDGET_ACTION)

        requestInitialPermissions()
        configureWebView()
        setupBackNavigation()

        webView.loadUrl(LIVE_APP_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val action = intent.getStringExtra(MaydayPrefs.EXTRA_WIDGET_ACTION)
        if (!action.isNullOrEmpty()) {
            pendingWidgetAction = action
            if (isPageReady) {
                dispatchPendingWidgetAction()
            }
        }
    }

    override fun onPause() {
        super.onPause()
        if (isPageReady) {
            syncLocalStorageToWidgets()
        }
    }

    private fun requestInitialPermissions() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.bg_base))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString MayDayAndroid/1.0"
        }

        webView.addJavascriptInterface(MaydayJsBridge(), "MaydayAndroid")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress >= 100) {
                    loadingBar.visibility = View.GONE
                } else {
                    loadingBar.visibility = View.VISIBLE
                    loadingBar.progress = newProgress
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (origin == null || callback == null) return
                val hasLoc = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    ) == PackageManager.PERMISSION_GRANTED

                if (hasLoc) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    permissionLauncher.launch(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        )
                    )
                }
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val scheme = uri.scheme.orEmpty().lowercase()

                // Always open phone dialer pre-filled (ACTION_DIAL)
                if (scheme == "tel") {
                    val dialIntent = Intent(Intent.ACTION_DIAL, uri)
                    startActivity(dialIntent)
                    return true
                }

                // Keep MayDay app URLs inside WebView; open external links (e.g. Google Maps) natively
                if (scheme == "http" || scheme == "https") {
                    val host = uri.host.orEmpty().lowercase()
                    if (host == "namanbuildsstuff.github.io") {
                        return false
                    }
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    } catch (_: Exception) {
                        // Ignore if no handler installed
                    }
                    return true
                }

                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                isPageReady = true
                installWidgetSyncBridge()
                dispatchPendingWidgetAction()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true && !loadedOfflineFallback) {
                    loadedOfflineFallback = true
                    webView.loadUrl(OFFLINE_APP_URL)
                }
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isPageReady) {
                    webView.evaluateJavascript(
                        """
                        (function() {
                          var openModals = document.querySelectorAll('.modal-backdrop:not(.is-hidden)');
                          if (openModals.length > 0) {
                            openModals.forEach(function(m) { m.classList.add('is-hidden'); });
                            return 'closed_modal';
                          }
                          if (typeof state !== 'undefined' && state.activeView && state.activeView !== 'home' && typeof switchView === 'function') {
                            switchView('home');
                            return 'switched_home';
                          }
                          return 'exit';
                        })();
                        """.trimIndent()
                    ) { result ->
                        if (result != null && result.contains("exit")) {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    /**
     * Injects a lightweight observer into WebView without altering any PWA source files.
     * Whenever the user saves an Emergency Contact or changes their State, native widgets update immediately.
     */
    private fun installWidgetSyncBridge() {
        val js = """
            (function() {
              if (window.__maydayAndroidBridgeInstalled) {
                if (window.__maydaySyncToAndroid) window.__maydaySyncToAndroid();
                return;
              }
              window.__maydayAndroidBridgeInstalled = true;
              window.__maydaySyncToAndroid = function() {
                try {
                  if (window.MaydayAndroid) {
                    window.MaydayAndroid.syncState(
                      localStorage.getItem('mayday_ice_contact_v1') || '',
                      localStorage.getItem('mayday_user_votes_v2') || ''
                    );
                  }
                } catch (e) {}
              };
              var origSet = Storage.prototype.setItem;
              Storage.prototype.setItem = function(k, v) {
                origSet.apply(this, arguments);
                if (k === 'mayday_ice_contact_v1' || k === 'mayday_user_votes_v2') {
                  window.__maydaySyncToAndroid();
                }
              };
              var origRemove = Storage.prototype.removeItem;
              Storage.prototype.removeItem = function(k) {
                origRemove.apply(this, arguments);
                if (k === 'mayday_ice_contact_v1') {
                  window.__maydaySyncToAndroid();
                }
              };
              window.__maydaySyncToAndroid();
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun syncLocalStorageToWidgets() {
        webView.evaluateJavascript(
            "if (window.__maydaySyncToAndroid) window.__maydaySyncToAndroid();",
            null
        )
    }

    private fun dispatchPendingWidgetAction() {
        val action = pendingWidgetAction ?: return
        pendingWidgetAction = null

        val js = when (action) {
            MaydayPrefs.ACTION_OPEN_MAP -> "if (typeof switchView === 'function') switchView('map');"
            MaydayPrefs.ACTION_OPEN_MEDICAL -> "if (typeof openMedicalModal === 'function') openMedicalModal();"
            MaydayPrefs.ACTION_OPEN_CONTACT -> "if (typeof openEmergencyContactModal === 'function') openEmergencyContactModal();"
            MaydayPrefs.ACTION_OPEN_HOME -> "if (typeof switchView === 'function') switchView('home');"
            else -> return
        }

        webView.postDelayed({
            webView.evaluateJavascript(js, null)
        }, 250)
    }

    inner class MaydayJsBridge {
        @JavascriptInterface
        fun syncState(iceJson: String, prefsJson: String) {
            try {
                if (iceJson.isNotBlank()) {
                    val obj = JSONObject(iceJson)
                    val name = obj.optString("name", "Emergency")
                    val phone = obj.optString("phone", "")
                    MaydayPrefs.saveEmergencyContact(applicationContext, name, phone)
                } else {
                    MaydayPrefs.saveEmergencyContact(applicationContext, null, null)
                }
            } catch (_: Exception) {
                // Ignore malformed JSON
            }

            try {
                if (prefsJson.isNotBlank()) {
                    val obj = JSONObject(prefsJson)
                    val userState = obj.optString("userState", "")
                    if (userState.isNotBlank()) {
                        MaydayPrefs.saveUserState(applicationContext, userState)
                    }
                }
            } catch (_: Exception) {
                // Ignore malformed JSON
            }
        }
    }
}
