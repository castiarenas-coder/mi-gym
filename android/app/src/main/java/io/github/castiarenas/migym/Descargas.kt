package io.github.castiarenas.migym

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * "Exportar mis datos" es un enlace de descarga del servidor local. El WebView no baja archivos solo: esta clase
 * lo recibe como DownloadListener, lo trae del servidor y lo guarda en la carpeta Descargas del celular
 * (Android 10+, con MediaStore) o abre el menú de compartir (Android 9 o menos, sin pedir permisos).
 */
class Descargas(private val ctx: Context) {
    private val main = Handler(Looper.getMainLooper())

    fun descargar(url: String, contentDisposition: String?, mimeType: String?) {
        // Solo del servidor local de la app.
        val u = Uri.parse(url)
        if ((u.host != "127.0.0.1" && u.host != "localhost") || u.port != NodeRunner.port) return
        Thread({
            try {
                val nombre = nombreSeguro(URLUtil.guessFileName(url, contentDisposition, mimeType))
                val con = URL(url).openConnection() as HttpURLConnection
                CookieManager.getInstance().getCookie(url)?.let { con.setRequestProperty("Cookie", it) }
                con.connectTimeout = 3000
                con.readTimeout = 30000
                try {
                    if (con.responseCode != 200) throw IllegalStateException("el servidor respondió ${con.responseCode}")
                    val tipo = mimeType?.takeIf { it.isNotBlank() } ?: con.contentType ?: "application/octet-stream"
                    con.inputStream.use { entrada ->
                        if (Build.VERSION.SDK_INT >= 29) guardarEnDescargas(nombre, tipo, entrada) else compartir(nombre, tipo, entrada)
                    }
                } finally {
                    con.disconnect()
                }
            } catch (e: Exception) {
                Log.e(TAG, "no se pudo guardar el archivo", e)
                aviso("No se pudo guardar el archivo. Probá de nuevo.")
            }
        }, "migym-descarga").start()
    }

    // Sin barras ni caracteres raros: el nombre sale de una cabecera.
    private fun nombreSeguro(n: String): String =
        n.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").trim().ifEmpty { "mi-gym.json" }

    private fun guardarEnDescargas(nombre: String, tipo: String, entrada: InputStream) {
        val resolver = ctx.contentResolver
        val valores = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, nombre)
            put(MediaStore.Downloads.MIME_TYPE, tipo)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val destino = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, valores) ?: throw IllegalStateException("MediaStore no creó el archivo")
        try {
            (resolver.openOutputStream(destino) ?: throw IllegalStateException("no se pudo abrir el archivo")).use { salida ->
                entrada.copyTo(salida, 64 * 1024)
            }
            resolver.update(destino, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
        } catch (e: Exception) {
            resolver.delete(destino, null, null)
            throw e
        }
        aviso("Guardado en Descargas: $nombre")
    }

    private fun compartir(nombre: String, tipo: String, entrada: InputStream) {
        val dir = File(ctx.cacheDir, "exportados").apply { mkdirs() }
        val archivo = File(dir, nombre)
        archivo.outputStream().use { entrada.copyTo(it, 64 * 1024) }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.compartir", archivo)
        val enviar = Intent(Intent.ACTION_SEND).apply {
            type = tipo
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        main.post {
            ctx.startActivity(Intent.createChooser(enviar, "Guardar o enviar el respaldo").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    private fun aviso(texto: String) = main.post { Toast.makeText(ctx, texto, Toast.LENGTH_LONG).show() }

    private companion object {
        const val TAG = "MiGym"
    }
}
