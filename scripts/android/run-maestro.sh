#!/usr/bin/env bash
set -euo pipefail

flow="${1:-ci-login}"
case "$flow" in
  ci-login)
    flow_file=".maestro/flows/ci-login.yaml"
    ;;
  first-run-setup)
    flow_file=".maestro/flows/first-run-setup.yaml"
    for variable in SETUP_TOKEN OWNER_USERNAME OWNER_PASSWORD; do
      if [[ -z "${!variable:-}" ]]; then
        echo "$variable is required for the first-run setup flow." >&2
        exit 2
      fi
    done
    ;;
  *)
    echo "Usage: scripts/android/run-maestro.sh [ci-login|first-run-setup]" >&2
    exit 2
    ;;
esac

for executable in adb maestro curl; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    echo "Missing required Android controller command: $executable" >&2
    exit 1
  fi
done

mapfile -t connected_devices < <(adb devices | awk '$2 == "device" { print $1 }')
serial="${ANDROID_SERIAL:-}"
if [[ -z "$serial" ]]; then
  if [[ "${#connected_devices[@]}" -ne 1 ]]; then
    echo "Set ANDROID_SERIAL when exactly one authorized physical device is not attached." >&2
    exit 1
  fi
  serial="${connected_devices[0]}"
fi

if [[ "$serial" == emulator-* ]]; then
  echo "Android release evidence requires a physical device, not $serial." >&2
  exit 1
fi
if ! printf '%s\n' "${connected_devices[@]}" | grep -Fxq "$serial"; then
  echo "ANDROID_SERIAL is not an authorized connected device: $serial" >&2
  exit 1
fi

abi="$(adb -s "$serial" shell getprop ro.product.cpu.abi | tr -d '\r')"
emulated="$(adb -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r')"
if [[ "$abi" != "arm64-v8a" || "$emulated" == "1" ]]; then
  echo "Physical ARM64 is required; serial=$serial abi=$abi qemu=$emulated." >&2
  exit 1
fi

browser_app_id="${BROWSER_APP_ID:-com.android.chrome}"
if ! adb -s "$serial" shell pm path "$browser_app_id" | grep -q '^package:'; then
  echo "Browser package is not installed on $serial: $browser_app_id" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
safe_serial="${serial//[^A-Za-z0-9._-]/_}"
evidence_directory="${NIXHOST_ANDROID_EVIDENCE_DIR:-$PWD/artifacts/android}/maestro-$safe_serial-$timestamp"
mkdir -p "$evidence_directory"

adb -s "$serial" forward tcp:3001 tcp:3001
trap 'adb -s "$serial" forward --remove tcp:3001 >/dev/null 2>&1 || true' EXIT
curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null

{
  echo "timestamp=$timestamp"
  echo "serial=$serial"
  echo "manufacturer=$(adb -s "$serial" shell getprop ro.product.manufacturer | tr -d '\r')"
  echo "model=$(adb -s "$serial" shell getprop ro.product.model | tr -d '\r')"
  echo "android=$(adb -s "$serial" shell getprop ro.build.version.release | tr -d '\r')"
  echo "abi=$abi"
  echo "maestro=$(maestro --version)"
  echo "browser_app_id=$browser_app_id"
  echo "flow=$flow"
} | tee "$evidence_directory/device.txt"

maestro_arguments=(
  --device "$serial"
  test
  -e "BROWSER_APP_ID=$browser_app_id"
  -e "NIXHOST_URL=http://127.0.0.1:3001"
)
if [[ "$flow" == "first-run-setup" ]]; then
  maestro_arguments+=(
    -e "SETUP_TOKEN=$SETUP_TOKEN"
    -e "OWNER_USERNAME=$OWNER_USERNAME"
    -e "OWNER_PASSWORD=$OWNER_PASSWORD"
  )
fi
maestro "${maestro_arguments[@]}" "$flow_file" 2>&1 | tee "$evidence_directory/maestro.log"
