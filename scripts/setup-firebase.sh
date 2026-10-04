#!/usr/bin/env bash
# =====================================================================
#  IKTA Bus — one-command Firebase setup (run in Google Cloud Shell)
#
#    bash <(curl -sL https://raw.githubusercontent.com/Avishek-Welcome/IKTA-Bus-Location/main/scripts/setup-firebase.sh)
#
#  It will:
#   1. download the app            5. publish database.rules.json
#   2. enable the needed APIs      6. deploy the website to Firebase Hosting
#   3. turn on Email/Password +    7. create the admin account
#      Anonymous sign-in           8. create 20 owner secret codes
#   4. find the Realtime Database URL and put it in js/firebase-config.js
#  Safe to run again: existing data is never deleted.
# =====================================================================
set -uo pipefail

PROJECT="ikta-bus"
BRANCH="${BRANCH:-main}"
REPO="https://github.com/Avishek-Welcome/IKTA-Bus-Location.git"
ADMIN_EMAIL="admin@admin.ikta-bus.app"
DIR="$HOME/IKTA-Bus-Location"

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m  ✖ %s\033[0m\n' "$*"; exit 1; }

# ---------------------------------------------------------------------
step "1/8  Downloading the IKTA Bus app"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q -B "$BRANCH" FETCH_HEAD || die "git update failed"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR" || die "git clone failed"
fi
cd "$DIR" || die "cannot enter $DIR"
ok "Code ready in $DIR"

gcloud config set project "$PROJECT" >/dev/null 2>&1
TOKEN="$(gcloud auth print-access-token 2>/dev/null)" || die "Not signed in to gcloud. Run: gcloud auth login"
API_KEY="$(grep -o "AIza[0-9A-Za-z_-]*" js/firebase-config.js | head -1)"
[ -n "$API_KEY" ] || die "apiKey not found in js/firebase-config.js"

# ---------------------------------------------------------------------
step "2/8  Enabling Google APIs (may take a minute)"
gcloud services enable identitytoolkit.googleapis.com firebasedatabase.googleapis.com \
  firebasehosting.googleapis.com firebase.googleapis.com --project "$PROJECT" \
  && ok "APIs enabled" || warn "Could not enable some APIs (continuing)"

if ! command -v firebase >/dev/null 2>&1; then
  npm install -g firebase-tools >/dev/null 2>&1 || die "Could not install firebase-tools"
fi
if ! firebase projects:list >/dev/null 2>&1; then
  warn "Firebase CLI needs you to sign in once: open the link, choose your Google account, paste the code back here."
  firebase login --no-localhost || die "firebase login failed"
fi
ok "Firebase CLI ready"
FB=(firebase --project "$PROJECT" --non-interactive)
# Cloud Shell has no IPv6 route; force IPv4 so Hosting uploads do not time out
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"

# ---------------------------------------------------------------------
step "3/8  Turning on Email/Password and Anonymous sign-in"
RESP="$(curl -s -X PATCH \
  -H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired,signIn.anonymous.enabled" \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true},"anonymous":{"enabled":true}}}')"
if echo "$RESP" | grep -q '"anonymous"'; then
  ok "Email/Password + Anonymous enabled"
else
  warn "Could not enable automatically. Do it by hand (30 s):"
  warn "https://console.firebase.google.com/project/$PROJECT/authentication/providers"
  warn "→ Get started → enable Email/Password and Anonymous, then press Enter here."
  read -r _
fi

# ---------------------------------------------------------------------
step "4/8  Finding the Realtime Database URL"
DBURL="$("${FB[@]}" database:instances:list --json 2>/dev/null | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try {
      const r = JSON.parse(s).result || [];
      const list = Array.isArray(r) ? r : r.instances || [];
      const db = list.find((i) => /default-rtdb/.test(i.name || i.instance || "")) || list[0];
      process.stdout.write((db && (db.databaseUrl || db.database_url)) || "");
    } catch { /* ignore */ }
  });')"
if [ -z "$DBURL" ]; then
  warn "No Realtime Database found. Create it here (choose any location, start in locked mode):"
  warn "https://console.firebase.google.com/project/$PROJECT/database"
  warn "Then run this script again."
  exit 1
fi
DBURL="${DBURL%/}"
CURRENT="$(grep -o "databaseURL: '[^']*'" js/firebase-config.js | sed "s/databaseURL: '//; s/'$//")"
if [ "$CURRENT" != "$DBURL" ]; then
  sed -i "s#databaseURL: '[^']*'#databaseURL: '$DBURL'#" js/firebase-config.js
  ok "Database URL updated to $DBURL"
  warn "Tell Claude this URL so it is saved in GitHub too: $DBURL"
else
  ok "Database URL is correct: $DBURL"
fi

# ---------------------------------------------------------------------
step "5/8  Publishing security rules"
"${FB[@]}" deploy --only database && ok "Rules published" || die "Rules deploy failed"

step "6/8  Deploying the website to Firebase Hosting"
if ! "${FB[@]}" deploy --only hosting; then
  warn "Hosting deploy failed (rules and data setup continue). Afterwards run:"
  warn "bash <(curl -sL https://raw.githubusercontent.com/Avishek-Welcome/IKTA-Bus-Location/$BRANCH/scripts/deploy-hosting.sh)"
else
  ok "Website live at https://$PROJECT.web.app"
fi

# ---------------------------------------------------------------------
step "7/8  Creating the admin account ($ADMIN_EMAIL, sign in with user ID: admin)"
while :; do
  read -r -s -p "  Choose an admin password (8+ chars, upper, lower, number, special): " PW; echo
  if node -e 'const p=process.argv[1];process.exit(p.length>=8&&/[A-Z]/.test(p)&&/[a-z]/.test(p)&&/\d/.test(p)&&/[^A-Za-z0-9]/.test(p)?0:1)' "$PW"; then break; fi
  warn "Password too weak, try again."
done
BODY="$(node -e 'console.log(JSON.stringify({email:process.argv[1],password:process.argv[2],returnSecureToken:true}))' "$ADMIN_EMAIL" "$PW")"
RESP="$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY" -H "Content-Type: application/json" -d "$BODY")"
if echo "$RESP" | grep -q EMAIL_EXISTS; then
  RESP="$(curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" -H "Content-Type: application/json" -d "$BODY")"
fi
ADMIN_UID="$(echo "$RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).localId||"")}catch{}})')"
unset PW BODY
[ -n "$ADMIN_UID" ] || die "Admin account failed: $(echo "$RESP" | head -c 300)"
"${FB[@]}" database:set "/admins/$ADMIN_UID" --data true --force >/dev/null && ok "Admin ready (uid $ADMIN_UID)" || die "Could not save admin flag"

# ---------------------------------------------------------------------
step "8/8  Creating 20 one-time owner secret codes"
CODES_JSON="$(mktemp)"
node scripts/generate-codes.mjs 20 > "$CODES_JSON" 2>/dev/null
"${FB[@]}" database:update /secretCodes "$CODES_JSON" --force >/dev/null && ok "Codes saved in the database" || warn "Could not save codes (use admin.html instead)"
node -e 'console.log(Object.keys(require(process.argv[1])).join("\n"))' "$CODES_JSON" > "$HOME/ikta-secret-codes.txt"
rm -f "$CODES_JSON"
printf '  Codes (also saved to ~/ikta-secret-codes.txt):\n'; sed 's/^/    /' "$HOME/ikta-secret-codes.txt"

# ---------------------------------------------------------------------
printf '\n\033[1;32m🎉 IKTA Bus is set up!\033[0m\n'
cat <<EOF
  Passenger : https://$PROJECT.web.app/
  Owner     : https://$PROJECT.web.app/owner.html   (register with one of the codes above)
  Driver    : https://$PROJECT.web.app/driver.html  (login created by the owner)
  Admin     : https://$PROJECT.web.app/admin.html   (user ID: admin + the password you chose)
EOF
