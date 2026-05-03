#!/usr/bin/env bash
# Build, install, and launch Karvo on the first connected iPhone.
# Usage: ./scripts/deploy-ios.sh <Debug|Release>
#   Debug   -> com.karvo.app.dev  ("Karvo Dev")
#   Release -> com.karvo.app      ("Karvo")
set -euo pipefail

CONFIG="${1:-}"
case "$CONFIG" in
  Debug)
    BUNDLE_ID="com.karvo.app.dev"
    APP_LABEL="Karvo Dev"
    ;;
  Release)
    BUNDLE_ID="com.karvo.app"
    APP_LABEL="Karvo"
    ;;
  *)
    echo "usage: $0 <Debug|Release>" >&2
    exit 2
    ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# CocoaPods installs the native dependency wiring; without ios/Pods the
# project will fail to load its base xcconfig files.
if [ ! -d ios/Pods ]; then
  echo "▸ ios/Pods missing — running pod install …"
  # Force UTF-8 locale: Ruby 4.x + cocoapods 1.16 fails with
  # Encoding::CompatibilityError on Pod::Config#installation_root otherwise.
  ( cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install )
fi

if [ "$CONFIG" = "Debug" ]; then
  cat <<'EOF'
ℹ️  Debug builds load JS from the Metro bundler at runtime.
   If Metro is not running, start it in another terminal first:
       npm start

EOF
fi

# Pick the first paired iPhone. xcodebuild and devicectl use different
# identifiers for the same device, so extract both:
#   hardwareProperties.udid -> xcodebuild -destination 'id=…'
#   identifier              -> xcrun devicectl --device …
DEVICE_INFO="$(xcrun devicectl list devices --json-output - 2>/dev/null \
  | python3 -c '
import json, sys
data = json.load(sys.stdin)
for d in data.get("result", {}).get("devices", []):
    if d.get("connectionProperties", {}).get("pairingState") != "paired":
        continue
    if d.get("hardwareProperties", {}).get("platform") != "iOS":
        continue
    print(d["hardwareProperties"]["udid"] + "\t" + d["identifier"])
    break
')"

if [ -z "$DEVICE_INFO" ]; then
  echo "❌ No paired iPhone found. Plug it in, trust the Mac, and try again." >&2
  exit 1
fi

XCODE_DEVICE_ID="$(printf '%s' "$DEVICE_INFO" | cut -f1)"
DEVICECTL_ID="$(printf '%s' "$DEVICE_INFO" | cut -f2)"

DERIVED="$REPO_ROOT/build"
APP_PATH="$DERIVED/Build/Products/$CONFIG-iphoneos/Zones.app"

echo "▸ Building $APP_LABEL ($CONFIG) for device $XCODE_DEVICE_ID …"
xcodebuild \
  -workspace ios/Zones.xcworkspace \
  -scheme Zones \
  -configuration "$CONFIG" \
  -destination "id=$XCODE_DEVICE_ID" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  build

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Build did not produce $APP_PATH" >&2
  exit 1
fi

echo "▸ Installing $APP_LABEL on device …"
xcrun devicectl device install app --device "$DEVICECTL_ID" "$APP_PATH"

echo "▸ Launching $APP_LABEL …"
xcrun devicectl device process launch --device "$DEVICECTL_ID" "$BUNDLE_ID"

echo "✅ $APP_LABEL is running on your iPhone."
