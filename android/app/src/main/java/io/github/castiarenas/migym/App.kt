package io.github.castiarenas.migym

import android.app.Application

/** Arranca el servidor Node una sola vez por proceso (la Activity puede recrearse sin reiniciarlo). */
class App : Application() {
    override fun onCreate() {
        super.onCreate()
        NodeRunner.start(this)
    }
}
