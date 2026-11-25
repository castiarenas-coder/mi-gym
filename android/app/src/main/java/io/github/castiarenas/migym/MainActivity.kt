package io.github.castiarenas.migym

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Process
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import java.net.HttpURLConnection
import java.net.URL
import kotlin.system.exitProcess

/** Pantalla única: un WebView a pantalla completa apuntando al servidor Node que corre adentro de la app. */
class MainActivity : ComponentActivity() {
    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private lateinit var splash: TextView
    private lateinit var errorBox: LinearLayout
    private lateinit var errorText: TextView
    private var lastBack = 0L
    private lateinit var descargas: Descargas

    // Selector de archivos del WebView (Importar respaldo, subir GIF o video propio).
    private var pendingChooser: ValueCallback<Array<Uri>>? = null
    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val cb = pendingChooser
        pendingChooser = null
        cb?.onReceiveValue(if (result.resultCode == Activity.RESULT_OK) WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data) else null)
    }

    @Volatile
    private var alive = true

    @Volatile
    private var shown = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        descargas = Descargas(applicationContext)

        root = FrameLayout(this).apply { setBackgroundColor(BG) }
        web = WebView(this).apply {
            setBackgroundColor(BG)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                allowFileAccess = false
                allowContentAccess = false
                @Suppress("DEPRECATION")
                allowUniversalAccessFromFileURLs = false
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    if (!request.isForMainFrame) return false
                    val u = request.url
                    val isWeb = u.scheme == "http" || u.scheme == "https"
                    // Dentro del WebView solo la app local.
                    if (isWeb && (u.host == "127.0.0.1" || u.host == "localhost") && u.port == NodeRunner.port) return false
                    // Afuera solo http/https (PayPal, GitHub…); intent:, file:, market:, javascript: etc. se descartan.
                    if (isWeb) openExternal(u)
                    return true
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    // El servidor local se cayó después de cargar: pantalla de error con Reintentar.
                    if (request.isForMainFrame) showError("Mi Gym no responde (${error.description})")
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    pendingChooser?.onReceiveValue(null)
                    pendingChooser = callback
                    return try {
                        chooser.launch(params.createIntent())
                        true
                    } catch (_: ActivityNotFoundException) {
                        pendingChooser = null
                        callback.onReceiveValue(null)
                        Toast.makeText(this@MainActivity, "No hay una app para elegir archivos", Toast.LENGTH_SHORT).show()
                        true
                    }
                }
            }
            setDownloadListener { url, _, contentDisposition, mimeType, _ -> descargas.descargar(url, contentDisposition, mimeType) }
            visibility = View.INVISIBLE
        }
        splash = TextView(this).apply {
            text = "Cargando Mi Gym…"
            setTextColor(Color.WHITE)
            textSize = 20f
            gravity = Gravity.CENTER
        }
        errorText = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 18f
            gravity = Gravity.CENTER
            setPadding(48, 48, 48, 48)
        }
        errorBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(BG)
            addView(errorText)
            addView(Button(context).apply {
                text = "Reintentar"
                setOnClickListener { restartApp() }
            })
            visibility = View.GONE
        }
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(splash, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(errorBox, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = onBack()
        })
        waitForServer()
    }

    // Espera a que el servidor conteste /api/salud y recién ahí carga la app; después sigue vigilando que Node no muera.
    private fun waitForServer() {
        Thread({
            val t0 = System.currentTimeMillis()
            while (alive) {
                NodeRunner.failure?.let { f ->
                    runOnUiThread { showError("No se pudo iniciar Mi Gym\n$f") }
                    return@Thread
                }
                if (!shown && healthy()) {
                    shown = true
                    runOnUiThread { showApp() }
                }
                if (!shown && System.currentTimeMillis() - t0 > 90_000) {
                    runOnUiThread { splash.text = "Mi Gym tarda en arrancar…\nSi sigue así, cerrá la app y volvé a abrirla." }
                }
                Thread.sleep(if (shown) 2000 else 500)
            }
        }, "migym-health").start()
    }

    private fun healthy(): Boolean = try {
        (URL("http://127.0.0.1:${NodeRunner.port}/api/salud").openConnection() as HttpURLConnection).run {
            setRequestProperty("Cookie", "mi_gym_token=${NodeRunner.token}")
            connectTimeout = 800
            readTimeout = 1500
            val ok = responseCode == 200
            disconnect()
            ok
        }
    } catch (_: Exception) {
        false
    }

    private fun showApp() {
        if (!alive) return
        // La clave entra por la URL una sola vez: el servidor la cambia por una cookie y redirige sin ella.
        web.loadUrl("http://127.0.0.1:${NodeRunner.port}/?mi_gym_token=${NodeRunner.token}")
        web.visibility = View.VISIBLE
        splash.visibility = View.GONE
        web.requestFocus()
    }

    private fun showError(msg: String) {
        if (!alive) return
        errorText.text = msg
        errorBox.visibility = View.VISIBLE
        splash.visibility = View.GONE
        web.visibility = View.INVISIBLE
    }

    // Reintentar: se mata el proceso y se relanza la app, así Node arranca de cero en un proceso nuevo.
    private fun restartApp() {
        val intent = packageManager.getLaunchIntentForPackage(packageName)!!
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        Process.killProcess(Process.myPid())
        exitProcess(0)
    }

    // Atrás: cierra la ventana abierta (Escape), luego vuelve a la pantalla anterior; en la primera pide un segundo toque para salir.
    private fun onBack() {
        if (web.visibility != View.VISIBLE) {
            finish()
            return
        }
        web.evaluateJavascript(CLOSE_MODAL_JS) { r ->
            when {
                r?.contains("handled") == true -> {}
                web.canGoBack() -> web.goBack()
                else -> {
                    val now = System.currentTimeMillis()
                    if (now - lastBack < 2000) {
                        finish()
                    } else {
                        lastBack = now
                        Toast.makeText(this, "Tocá otra vez para salir", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "No hay app para abrir este enlace", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        alive = false
        pendingChooser?.onReceiveValue(null)
        pendingChooser = null
        root.removeView(web)
        web.destroy()
        super.onDestroy()
    }

    private companion object {
        val BG = Color.parseColor("#0B0D10")

        // Si hay una ventana/diálogo abierto (aria-modal) le manda Escape, que la app ya entiende, y devuelve "handled".
        const val CLOSE_MODAL_JS = """(function(){
  if(document.querySelector('[aria-modal="true"]')){
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',keyCode:27,bubbles:true,cancelable:true}));
    return 'handled';}
  return 'none';})()"""
    }
}
