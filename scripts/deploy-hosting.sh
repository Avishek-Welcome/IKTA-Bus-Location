#!/usr/bin/env bash
# IKTA Bus — deploy (or re-deploy) the website to Firebase Hosting from Cloud Shell.
#   bash <(curl -sL https://raw.githubusercontent.com/Avishek-Welcome/IKTA-Bus-Location/claude/ikta-bus-web-app-id8b7f/scripts/deploy-hosting.sh)
set -uo pipefail
PROJECT="ikta-bus"
BRANCH="claude/ikta-bus-web-app-id8b7f"
DIR="$HOME/IKTA-Bus-Location"

ok()   { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }

if [ -d "$DIR/.git" ]; then
  # keep a databaseURL that setup-firebase.sh may have corrected locally
  git -C "$DIR" stash -q 2>/dev/null; git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD; git -C "$DIR" stash pop -q 2>/dev/null
else
  git clone -q -b "$BRANCH" https://github.com/Avishek-Welcome/IKTA-Bus-Location.git "$DIR"
fi
cd "$DIR" || exit 1

# Hosting uploads fail with Cloud Shell's automatic (ADC) credentials, so use a real Firebase login.
if ! firebase login:list 2>/dev/null | grep -q "@"; then
  warn "Sign in to Firebase once: open the link, choose your Google account, paste the code back here."
  firebase login --no-localhost || exit 1
fi
ok "Signed in to Firebase"

# Make sure the default Hosting site exists
if ! firebase hosting:sites:list --project "$PROJECT" 2>/dev/null | grep -q "$PROJECT"; then
  firebase hosting:sites:create "$PROJECT" --project "$PROJECT" --non-interactive >/dev/null 2>&1 \
    && ok "Hosting site created" || warn "Could not create the Hosting site automatically"
fi

# Cloud Shell has no working IPv6 route: Node's fetch tries IPv6 first and the file
# upload to upload-firebasehosting.googleapis.com times out. Force IPv4.
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
code="$(curl -4 -s -o /dev/null -m 15 -w '%{http_code}' https://upload-firebasehosting.googleapis.com/ || true)"
[ "$code" = "000" ] && warn "upload-firebasehosting.googleapis.com is not reachable over IPv4 either (network problem)" || ok "Upload server reachable (IPv4)"

for attempt in 1 2 3; do
  rm -f firebase-debug.log
  if firebase deploy --only hosting --project "$PROJECT" --non-interactive; then
    ok "Website live at https://$PROJECT.web.app"
    exit 0
  fi
  warn "Attempt $attempt failed; retrying in 10 s…"
  sleep 10
done
warn "Hosting deploy failed. Copy the lines below and send them to Claude:"
grep -iE "error|denied|quota|timeout|40[0-9]|50[0-9]" firebase-debug.log 2>/dev/null | tail -20
exit 1
