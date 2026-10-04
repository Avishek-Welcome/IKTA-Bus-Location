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

rm -f firebase-debug.log
if firebase deploy --only hosting --project "$PROJECT" --non-interactive; then
  ok "Website live at https://$PROJECT.web.app"
else
  warn "Hosting deploy failed. Copy the lines below and send them to Claude:"
  grep -iE "error|denied|quota|40[0-9]|50[0-9]|message" firebase-debug.log 2>/dev/null | tail -20
  exit 1
fi
