cmake_minimum_required(VERSION 3.22)
project(migym)

# libnode.so por ABI, tal cual viene en el paquete de nodejs-mobile.
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION ${NODEJS_MOBILE_DIR}/bin/${ANDROID_ABI}/libnode.so)

add_library(native-lib SHARED native-lib.cpp)
target_include_directories(native-lib PRIVATE ${NODEJS_MOBILE_DIR}/include/node)
target_link_libraries(native-lib node log)
# Android 15+ exige páginas de 16 KB en las libs propias.
target_link_options(native-lib PRIVATE -Wl,-z,max-page-size=16384)
