import com.android.build.api.variant.FilterConfiguration
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// nodejs-mobile (libnode.so + headers) vive fuera del repo; se puede cambiar con -PnodejsMobile=<carpeta> o NODEJS_MOBILE_DIR.
val nodejsMobile: File = (findProperty("nodejsMobile") as String?)?.let(::file)
    ?: (System.getenv("NODEJS_MOBILE_DIR")?.let(::file)
        ?: rootDir.resolve("../../REA/tools/nodejs-mobile/24.20.0-0")).canonicalFile

if (!nodejsMobile.resolve("bin").isDirectory || !nodejsMobile.resolve("include/node/node.h").isFile) {
    throw GradleException("No encuentro nodejs-mobile en $nodejsMobile (hace falta bin/<abi>/libnode.so e include/node). Descomprimí el paquete y pasá -PnodejsMobile=<carpeta>.")
}

// Versión: sale de package.json (1.2.3 -> 10203 -> con el ABI: abi*10_000_000 + 10203). Se puede forzar con -PversionCode=N.
// Para publicar una actualización: subí "version" en package.json (o pasá -PversionCode mayor).
val pkg = groovy.json.JsonSlurper().parse(rootDir.resolve("../package.json")) as Map<*, *>
val appVersionName = pkg["version"] as String
val appVersionCode: Int = (findProperty("versionCode") as String?)?.toInt()
    ?: appVersionName.split(".").map { it.toInt() }.let { it[0] * 10000 + it[1] * 100 + it[2] }

// Credenciales de firma: android/keystore.properties (ignorado por git). Sin él, el release sale sin firmar.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "io.github.castiarenas.migym"
    compileSdk = 36
    buildToolsVersion = "36.0.0"
    ndkVersion = "28.2.13676358"

    defaultConfig {
        applicationId = "io.github.castiarenas.migym"
        // 24: el libnode.so de nodejs-mobile está compilado con API 24 (nota .note.android.ident del ELF)
        minSdk = 24
        targetSdk = 36
        // versionCode distinto = la app vuelve a copiar el proyecto Node al arrancar (ver NodeRunner).
        versionCode = appVersionCode
        versionName = appVersionName

        externalNativeBuild {
            cmake {
                arguments += listOf("-DANDROID_STL=c++_shared", "-DNODEJS_MOBILE_DIR=${nodejsMobile.invariantSeparatorsPath}")
                cppFlags += "-std=c++20"
            }
        }
    }

    // Un APK por ABI (sin universal). x86_64 solo con -PwithX86 (emulador).
    splits {
        abi {
            isEnable = true
            reset()
            include(*(listOf("arm64-v8a", "armeabi-v7a") + if (hasProperty("withX86")) listOf("x86_64") else emptyList()).toTypedArray())
            isUniversalApk = false
        }
    }

    externalNativeBuild {
        cmake {
            path = file("src/main/cpp/CMakeLists.txt")
            version = "3.31.6"
        }
    }

    // libnode.so se empaqueta tal cual desde el paquete de nodejs-mobile.
    sourceSets["main"].jniLibs.srcDir(nodejsMobile.resolve("bin"))

    signingConfigs {
        if (keystoreProps.isNotEmpty()) {
            val faltan = listOf("storeFile", "storePassword", "keyAlias", "keyPassword").filter { keystoreProps.getProperty(it).isNullOrBlank() }
            if (faltan.isNotEmpty()) throw GradleException("android/keystore.properties incompleto: faltan ${faltan.joinToString()}")
            create("release") {
                // rootProject.file: una ruta relativa se resuelve contra android/ (donde vive keystore.properties)
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        // libc++_shared.so lo aportan el NDK y libnode: se queda con una sola copia.
        jniLibs.pickFirsts += "**/libc++_shared.so"
        // Libs comprimidas en el APK (descarga más chica); Android las extrae al instalar y loadLibrary las encuentra en nativeLibraryDir.
        jniLibs.useLegacyPackaging = true
    }
}

// versionCode por ABI (abi*10_000_000 + base) para que arm32 y arm64 se actualicen por separado.
val abiCodes = mapOf("armeabi-v7a" to 1, "arm64-v8a" to 2, "x86_64" to 3)
androidComponents {
    onVariants { variant ->
        variant.outputs.forEach { out ->
            val abi = out.filters.find { it.filterType == FilterConfiguration.FilterType.ABI }?.identifier
            val base = out.versionCode.orNull ?: return@forEach
            abiCodes[abi]?.let { out.versionCode.set(it * 10_000_000 + base) }
        }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")
}
