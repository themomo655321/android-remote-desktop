package com.antigravity.remotedesktop

import android.annotation.SuppressLint
import android.content.Context
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val PREFS_NAME = "PCRemotePrefs"
    private val KEY_LAST_IP = "last_ip"
    private val DEFAULT_PORT = "5000"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Keep screen on during remote session
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val savedIp = prefs.getString(KEY_LAST_IP, "192.168.1.21")

        // Prompt for IP or connect
        promptForHost(savedIp ?: "192.168.1.21")
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.apply {
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_NO_CACHE
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
        }
    }

    private fun promptForHost(currentIp: String) {
        val input = EditText(this).apply {
            setText(currentIp)
            hint = "e.g. 192.168.1.21"
            setSelection(text.length)
        }

        AlertDialog.Builder(this)
            .setTitle("Connect to Laptop Host")
            .setMessage("Enter your Windows laptop's local IP address:")
            .setView(input)
            .setPositiveButton("Connect") { _, _ ->
                val ip = input.text.toString().trim()
                if (ip.isNotEmpty()) {
                    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_LAST_IP, ip)
                        .apply()
                    loadRemoteUrl("http://$ip:$DEFAULT_PORT")
                }
            }
            .setNegativeButton("Default") { _, _ ->
                loadRemoteUrl("http://$currentIp:$DEFAULT_PORT")
            }
            .setCancelable(false)
            .show()
    }

    private fun loadRemoteUrl(url: String) {
        webView.loadUrl(url)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
