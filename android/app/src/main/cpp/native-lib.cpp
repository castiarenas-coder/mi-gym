// Puente JNI: arranca Node (nodejs-mobile) en un hilo propio y manda su stdout/stderr al logcat.
// Node solo se puede iniciar una vez por proceso: NodeRunner.kt cuida de no llamarlo dos veces.
// Si node::Start devuelve (puerto ocupado, excepción, falta de memoria), avisa a NodeRunner.onNodeExit(código).
#include <jni.h>
#include <android/log.h>
#include <pthread.h>
#include <unistd.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include "node.h"

#define TAG "MiGym-Node"

static int pipe_fds[2];
static JavaVM* g_vm = nullptr;
static jobject g_runner = nullptr;  // referencia global a NodeRunner (object de Kotlin)

// Lee lo que Node escribe en stdout/stderr y lo pasa al logcat línea por línea.
static void* log_thread(void*) {
    char buf[2048];
    ssize_t n;
    std::string line;
    while ((n = read(pipe_fds[0], buf, sizeof(buf) - 1)) > 0) {
        for (ssize_t i = 0; i < n; i++) {
            if (buf[i] == '\n') {
                __android_log_write(ANDROID_LOG_INFO, TAG, line.c_str());
                line.clear();
            } else {
                line += buf[i];
            }
        }
    }
    // última línea sin salto de línea
    if (!line.empty()) __android_log_write(ANDROID_LOG_INFO, TAG, line.c_str());
    return nullptr;
}

static bool redirect_output() {
    setvbuf(stdout, nullptr, _IOLBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipe_fds) != 0) {
        __android_log_print(ANDROID_LOG_ERROR, TAG, "pipe falló");
        return false;
    }
    if (dup2(pipe_fds[1], STDOUT_FILENO) < 0 || dup2(pipe_fds[1], STDERR_FILENO) < 0) {
        __android_log_print(ANDROID_LOG_ERROR, TAG, "dup2 falló");
        return false;
    }
    pthread_t t;
    if (pthread_create(&t, nullptr, log_thread, nullptr) != 0) {
        __android_log_print(ANDROID_LOG_ERROR, TAG, "no se pudo crear el hilo de log");
        return false;
    }
    pthread_detach(t);
    return true;
}

struct StartArgs {
    std::vector<std::string> args;
};

// Le avisa a Kotlin que Node terminó (hilo nativo: hay que engancharse a la VM).
static void report_exit(int rc) {
    if (!g_vm || !g_runner) return;
    JNIEnv* env = nullptr;
    bool attached = false;
    if (g_vm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        if (g_vm->AttachCurrentThread(&env, nullptr) != JNI_OK) return;
        attached = true;
    }
    jclass cls = env->GetObjectClass(g_runner);
    jmethodID m = env->GetMethodID(cls, "onNodeExit", "(I)V");
    if (m) env->CallVoidMethod(g_runner, m, static_cast<jint>(rc));
    if (env->ExceptionCheck()) env->ExceptionClear();
    env->DeleteLocalRef(cls);
    if (attached) g_vm->DetachCurrentThread();
}

static void* node_thread(void* p) {
    auto* sa = static_cast<StartArgs*>(p);
    // node::Start quiere argv contiguo en memoria.
    size_t total = 0;
    for (auto& a : sa->args) total += a.size() + 1;
    char* block = static_cast<char*>(calloc(total, 1));
    std::vector<char*> argv;
    char* cur = block;
    for (auto& a : sa->args) {
        memcpy(cur, a.c_str(), a.size());
        argv.push_back(cur);
        cur += a.size() + 1;
    }
    int rc = node::Start(static_cast<int>(argv.size()), argv.data());
    __android_log_print(ANDROID_LOG_ERROR, TAG, "node terminó con código %d", rc);
    delete sa;
    report_exit(rc);
    return nullptr;
}

static std::string to_std(JNIEnv* env, jstring s) {
    const char* c = env->GetStringUTFChars(s, nullptr);
    std::string r(c);
    env->ReleaseStringUTFChars(s, c);
    return r;
}

extern "C" JNIEXPORT void JNICALL
Java_io_github_castiarenas_migym_NodeRunner_startNode(JNIEnv* env, jobject self, jobjectArray args, jobjectArray envVars) {
    env->GetJavaVM(&g_vm);
    g_runner = env->NewGlobalRef(self);

    // envVars viene como "CLAVE=valor": se exportan antes de arrancar Node.
    jsize ne = env->GetArrayLength(envVars);
    for (jsize i = 0; i < ne; i++) {
        std::string kv = to_std(env, (jstring)env->GetObjectArrayElement(envVars, i));
        auto eq = kv.find('=');
        if (eq != std::string::npos) setenv(kv.substr(0, eq).c_str(), kv.substr(eq + 1).c_str(), 1);
    }
    auto* sa = new StartArgs();
    jsize na = env->GetArrayLength(args);
    for (jsize i = 0; i < na; i++) sa->args.push_back(to_std(env, (jstring)env->GetObjectArrayElement(args, i)));

    // Sin log no es fatal: se sigue igual.
    redirect_output();

    // Node necesita más pila que la del hilo por defecto.
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 2 * 1024 * 1024);
    pthread_t t;
    if (pthread_create(&t, &attr, node_thread, sa) != 0) {
        __android_log_print(ANDROID_LOG_ERROR, TAG, "no se pudo crear el hilo de Node");
        delete sa;
        report_exit(-1);
        return;
    }
    pthread_detach(t);
}
