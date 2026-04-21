 D:
 cd "new ALpha-battle\Alpha-Reborn"
 adb logcat -c
 adb logcat | findstr /R "ReactNative Reanimated Skia Worklets AndroidRuntime fatal exception"