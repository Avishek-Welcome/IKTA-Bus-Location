#!/usr/bin/env bash
# Builds the IKTA Bus Android app (android/build/ikta-bus.apk) with the plain Android
# SDK tools: no Gradle, no libraries. Used by .github/workflows/android-apk.yml.
#
# Needs Java and, from the Android SDK: platforms/android-34 and build-tools (aapt2, d8,
# zipalign, apksigner). Each tool can be overridden: ANDROID_JAR, AAPT2, D8, ZIPALIGN, APKSIGNER.
#
# Signing (optional): KEYSTORE=path KEYSTORE_PASSWORD=... [KEY_ALIAS=ikta]
# Version: VERSION_CODE (whole number, must go up for every release) and VERSION_NAME.
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
BT=""
if [ -n "$SDK" ] && [ -d "$SDK/build-tools" ]; then BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"; fi
ANDROID_JAR="${ANDROID_JAR:-$SDK/platforms/android-34/android.jar}"
AAPT2="${AAPT2:-$BT/aapt2}"
D8="${D8:-$BT/d8}"
ZIPALIGN="${ZIPALIGN:-$BT/zipalign}"
APKSIGNER="${APKSIGNER:-$BT/apksigner}"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0.$VERSION_CODE}"
[ -f "$ANDROID_JAR" ] || { echo "android.jar not found at $ANDROID_JAR (install platforms;android-34 or set ANDROID_JAR)"; exit 1; }

rm -rf build && mkdir -p build/gen build/classes build/dex
echo "Resources…"
"$AAPT2" compile --dir res -o build/res.zip
"$AAPT2" link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml build/res.zip \
  --java build/gen --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

echo "Java…"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" \
  -d build/classes $(find src build/gen -name '*.java')
$D8 --release --min-api 24 --lib "$ANDROID_JAR" --output build/dex $(find build/classes -name '*.class')

echo "Packaging…"
cp build/base.apk build/unaligned.apk
(cd build/dex && zip -q ../unaligned.apk classes.dex)
"$ZIPALIGN" -f -p 4 build/unaligned.apk build/ikta-bus-unsigned.apk

if [ -n "${KEYSTORE:-}" ]; then
  "$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias "${KEY_ALIAS:-ikta}" \
    --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEYSTORE_PASSWORD \
    --out build/ikta-bus.apk build/ikta-bus-unsigned.apk
  "$APKSIGNER" verify build/ikta-bus.apk
  echo "Signed: android/build/ikta-bus.apk (version $VERSION_NAME, code $VERSION_CODE)"
else
  echo "Unsigned: android/build/ikta-bus-unsigned.apk (set KEYSTORE to sign)"
fi
