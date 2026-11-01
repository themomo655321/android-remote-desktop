package com.antigravity.remotedesktop

import android.annotation.SuppressLint
import android.app.ProgressDialog
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val PREFS_NAME = "PCRemotePrefs"
    private val KEY_LAST_IP = "last_ip"

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var pendingApkFile: File? = null
    private var backPressedOnce = false

    private val GITHUB_REPO = "themomo655321/android-remote-desktop"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()

        // Load the offline Connection Hub Dashboard instantly
        loadDashboard()

        // Silent background check for updates
        checkForAppUpdates(silentIfLatest = true)
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
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
                allowFileAccess = true
            }

            addJavascriptInterface(WebAppInterface(this@MainActivity), "AndroidHost")

            webViewClient = object : WebViewClient() {
                override fun onReceivedError(
                    view: WebView?,
                    request: WebResourceRequest?,
                    error: WebResourceError?
                ) {
                    if (request?.isForMainFrame == true) {
                        mainHandler.post {
                            Toast.makeText(
                                this@MainActivity,
                                "Could not connect to laptop. Check firewall and IP.",
                                Toast.LENGTH_LONG
                            ).show()
                            loadDashboard()
                        }
                    }
                }
            }

            webChromeClient = WebChromeClient()
        }
    }

    fun loadDashboard() {
        webView.loadUrl("file:///android_asset/index.html")
    }

    fun loadRemoteUrl(url: String) {
        webView.loadUrl(url)
    }

    // --- In-App Auto Update System ---

    fun checkForAppUpdates(silentIfLatest: Boolean = false) {
        executor.execute {
            try {
                val apiUrl = "https://api.github.com/repos/$GITHUB_REPO/releases/latest"
                val connection = (URL(apiUrl).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8000
                    readTimeout = 8000
                    setRequestProperty("Accept", "application/vnd.github+json")
                    setRequestProperty("User-Agent", "PCRemote-Android")
                }

                if (connection.responseCode == 200) {
                    val jsonStr = connection.inputStream.bufferedReader().use { it.readText() }
                    val releaseObj = JSONObject(jsonStr)
                    val latestTag = releaseObj.optString("tag_name", "").replace("v", "").trim()
                    val releaseNotes = releaseObj.optString("body", "Bug fixes and performance improvements.")

                    var apkDownloadUrl = ""
                    val assets = releaseObj.optJSONArray("assets")
                    if (assets != null) {
                        for (i in 0 until assets.length()) {
                            val asset = assets.getJSONObject(i)
                            if (asset.getString("name").endsWith(".apk", ignoreCase = true)) {
                                apkDownloadUrl = asset.getString("browser_download_url")
                                break
                            }
                        }
                    }

                    val currentVersion = packageManager.getPackageInfo(packageName, 0).versionName.replace("v", "").trim()

                    if (isNewerVersion(latestTag, currentVersion) && apkDownloadUrl.isNotEmpty()) {
                        mainHandler.post {
                            showUpdateAvailableDialog(latestTag, releaseNotes, apkDownloadUrl)
                        }
                    } else if (!silentIfLatest) {
                        mainHandler.post {
                            Toast.makeText(this, "PC Remote is up to date (v$currentVersion)", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } catch (e: Exception) {
                if (!silentIfLatest) {
                    mainHandler.post {
                        Toast.makeText(this, "Could not check updates: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun isNewerVersion(latest: String, current: String): Boolean {
        try {
            val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }
            val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }
            val maxLen = maxOf(latestParts.size, currentParts.size)

            for (i in 0 until maxLen) {
                val l = latestParts.getOrElse(i) { 0 }
                val c = currentParts.getOrElse(i) { 0 }
                if (l > c) return true
                if (l < c) return false
            }
        } catch (e: Exception) {
            return latest != current
        }
        return false
    }

    private fun showUpdateAvailableDialog(version: String, notes: String, downloadUrl: String) {
        AlertDialog.Builder(this)
            .setTitle("🚀 Update Available (v$version)")
            .setMessage("A new version of PC Remote is available:\n\n$notes\n\nWould you like to download and update now?")
            .setPositiveButton("Update Now") { _, _ ->
                downloadAndInstallApk(downloadUrl, version)
            }
            .setNegativeButton("Later", null)
            .show()
    }

    private fun downloadAndInstallApk(downloadUrl: String, version: String) {
        val progressDialog = ProgressDialog(this).apply {
            setTitle("Downloading Update")
            setMessage("Downloading PC Remote v$version...")
            setProgressStyle(ProgressDialog.STYLE_HORIZONTAL)
            max = 100
            setCancelable(false)
            show()
        }

        executor.execute {
            try {
                val url = URL(downloadUrl)
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    instanceFollowRedirects = true
                    connectTimeout = 15000
                    readTimeout = 15000
                }

                val totalLength = conn.contentLength
                val apkFile = File(cacheDir, "PCRemote_v$version.apk")
                if (apkFile.exists()) apkFile.delete()

                conn.inputStream.use { input ->
                    FileOutputStream(apkFile).use { output ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        var totalRead: Long = 0

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            totalRead += bytesRead
                            if (totalLength > 0) {
                                val progress = (totalRead * 100 / totalLength).toInt()
                                mainHandler.post { progressDialog.progress = progress }
                            }
                        }
                    }
                }

                mainHandler.post {
                    progressDialog.dismiss()
                    pendingApkFile = apkFile
                    promptInstallApk(apkFile)
                }

            } catch (e: Exception) {
                mainHandler.post {
                    progressDialog.dismiss()
                    Toast.makeText(this, "Update download failed: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun promptInstallApk(apkFile: File) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!packageManager.canRequestPackageInstalls()) {
                AlertDialog.Builder(this)
                    .setTitle("Permission Required")
                    .setMessage("To install the updated PC Remote app, please allow 'Install unknown apps' permission.")
                    .setPositiveButton("Open Settings") { _, _ ->
                        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                            data = Uri.parse("package:$packageName")
                        }
                        startActivityForResult(intent, 1234)
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
                return
            }
        }

        launchInstallerIntent(apkFile)
    }

    private fun launchInstallerIntent(apkFile: File) {
        try {
            val apkUri = FileProvider.getUriForFile(
                this,
                "$packageName.provider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }
            startActivity(installIntent)
        } catch (e: Exception) {
            Toast.makeText(this, "Could not open installer: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1234) {
            pendingApkFile?.let {
                if (it.exists()) promptInstallApk(it)
            }
        }
    }

    override fun onBackPressed() {
        val currentUrl = webView.url ?: ""
        if (!currentUrl.startsWith("file:///android_asset/")) {
            // Return to the main Connection Hub Dashboard
            loadDashboard()
            Toast.makeText(this, "Returned to Connection Hub", Toast.LENGTH_SHORT).show()
        } else {
            if (backPressedOnce) {
                super.onBackPressed()
                return
            }
            this.backPressedOnce = true
            Toast.makeText(this, "Press BACK again to exit", Toast.LENGTH_SHORT).show()
            mainHandler.postDelayed({ backPressedOnce = false }, 2000)
        }
    }

    // JavaScript interface for Web UI
    class WebAppInterface(private val activity: MainActivity) {
        @JavascriptInterface
        fun checkForUpdates() {
            activity.checkForAppUpdates(silentIfLatest = false)
        }

        @JavascriptInterface
        fun switchLaptop(targetHost: String) {
            activity.mainHandler.post {
                val ip = targetHost.split(":")[0]
                activity.getSharedPreferences(activity.PREFS_NAME, Context.MODE_PRIVATE)
                    .edit()
                    .putString(activity.KEY_LAST_IP, ip)
                    .apply()
                activity.loadRemoteUrl("http://$targetHost")
            }
        }

        @JavascriptInterface
        fun openDashboard() {
            activity.mainHandler.post {
                activity.loadDashboard()
            }
        }
    }
}
