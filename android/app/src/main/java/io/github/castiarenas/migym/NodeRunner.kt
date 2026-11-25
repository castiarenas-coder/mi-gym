package io.github.castiarenas.migym

import android.content.Context
import android.util.Log
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.security.SecureRandom

/**
 * Prepara los archivos del servidor y arranca Node (nodejs-mobile) adentro del proceso.
 * Node solo puede iniciarse una vez por proceso: [start] es idempotente (la Activity se puede recrear).
 *
 * Carpetas (todas en el almacenamiento interno de la app):
 *   files/nodejs-project/   servidor + app web + node_modules + catálogo; se recopia del APK cuando cambia la versión
 *   files/datos/            base de datos, medios propios y respaldos; NUNCA se toca al actualizar
 */
object NodeRunner {
    private const val TAG = "MiGym"
    private const val PREFERIDO = 8788
    private var started = false

    /** Puerto del servidor local: el 8788 si está libre (así el origen de la web, y lo que guarda, no cambia) y si no, uno libre. */
    @Volatile
    var port: Int = PREFERIDO
        private set

    /** Motivo del fallo de arranque (la pantalla de carga lo muestra). */
    @Volatile
    var failure: String? = null
        private set

    /** Clave de esta corrida: solo la app (WebView) la conoce; otras apps del equipo no pueden usar el servidor local. */
    val token: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

    init {
        System.loadLibrary("native-lib")
    }

    /** Lo llama el hilo nativo cuando Node termina (puerto ocupado, excepción, sin memoria…). */
    @Suppress("unused")
    fun onNodeExit(code: Int) {
        failure = "Node terminó con código $code"
    }

    private external fun startNode(args: Array<String>, env: Array<String>)

    private fun libre(p: Int): Boolean = try {
        ServerSocket(p, 1, InetAddress.getByName("127.0.0.1")).use { true }
    } catch (_: Exception) {
        false
    }

    private fun elegirPuerto(): Int =
        if (libre(PREFERIDO)) PREFERIDO else ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }

    @Synchronized
    fun start(ctx: Context) {
        if (started) return
        started = true
        port = elegirPuerto()
        // La copia de assets puede tardar (miles de archivos: catálogo y node_modules): fuera del hilo principal.
        Thread({
            try {
                val files = ctx.filesDir
                val project = File(files, "nodejs-project")
                syncProject(ctx, project)
                launch(ctx, project, File(files, "datos"))
            } catch (e: Throwable) {
                Log.e(TAG, "no se pudo arrancar el servidor", e)
                failure = e.message ?: e.toString()
            }
        }, "migym-boot").start()
    }

    // El proyecto se recopia solo cuando cambia el versionCode del APK o el armado (marca en .version, que se escribe al terminar).
    private fun syncProject(ctx: Context, project: File) {
        val code = "${versionCode(ctx)}:${buildId(ctx)}"
        val marker = File(project, ".version")
        if (marker.exists() && marker.readText().trim() == code) return
        Log.i(TAG, "copiando nodejs-project ($code)")
        project.deleteRecursively()
        copyAsset(ctx, "nodejs-project", project)
        marker.writeText(code)
    }

    private fun launch(ctx: Context, project: File, data: File) {
        data.mkdirs()
        val catalogo = File(project, "catalogo")
        val env = arrayOf(
            "MI_GYM_DATA=${data.absolutePath}",
            "MI_GYM_IMG=${File(catalogo, "img").absolutePath}",
            "MI_GYM_CATALOGO=${catalogo.absolutePath}",
            "MI_GYM_INSTALADO=1",
            "MI_GYM_PLATAFORMA=android",
            "MI_GYM_PORT=$port",
            "MI_GYM_TOKEN=$token",
            "NODE_ENV=production",
            "HOME=${ctx.filesDir.absolutePath}",
            "TMPDIR=${ctx.cacheDir.absolutePath}",
        )
        val args = arrayOf("node", "--max-old-space-size=256", File(project, "server/index.js").absolutePath)
        startNode(args, env)
    }

    private fun buildId(ctx: Context): String =
        try { ctx.assets.open("nodejs-project/build-id.txt").use { it.readBytes().toString(Charsets.UTF_8).trim() } } catch (_: Exception) { "sin-id" }

    private fun versionCode(ctx: Context): Long =
        ctx.packageManager.getPackageInfo(ctx.packageName, 0).longVersionCode

    private fun copyAsset(ctx: Context, path: String, dest: File) {
        val children = ctx.assets.list(path) ?: emptyArray()
        if (children.isEmpty()) {
            dest.parentFile?.mkdirs()
            ctx.assets.open(path).use { input -> dest.outputStream().use { input.copyTo(it, 64 * 1024) } }
        } else {
            dest.mkdirs()
            for (c in children) copyAsset(ctx, "$path/$c", File(dest, c))
        }
    }
}
