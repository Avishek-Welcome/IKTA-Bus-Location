// =====================================================================
//  IKTA Bus — Firebase configuration (project: ikta-bus)
//  Firebase web API keys are public identifiers, not secrets: access is
//  protected by Authentication + database.rules.json. Restrict the key to
//  your domains in Google Cloud Console → APIs & Services → Credentials.
//
//  Required in the Firebase console:
//   • Authentication → Sign-in method: enable Email/Password AND Anonymous
//   • Realtime Database: create it, then publish database.rules.json
//   • Authentication → Settings → Authorized domains: add your hosting domain
//
//  If you set apiKey back to 'YOUR_API_KEY', the app runs in DEMO MODE
//  (data stays in the browser, simulated buses move on the map).
// =====================================================================
export const firebaseConfig = {
  apiKey: 'AIzaSyDKthJipDpkYHsjyJ54veTL62tZEWJnnVw',
  authDomain: 'ikta-bus.firebaseapp.com',
  // Realtime Database URL. This is the default for a database created in
  // us-central1. If you chose another region, copy the URL shown at the top of
  // Firebase console → Realtime Database → Data, e.g.
  // 'https://ikta-bus-default-rtdb.asia-southeast1.firebasedatabase.app'
  databaseURL: 'https://ikta-bus-default-rtdb.firebaseio.com',
  projectId: 'ikta-bus',
  storageBucket: 'ikta-bus.firebasestorage.app',
  messagingSenderId: '25055916983',
  appId: '1:25055916983:web:8b289ef5a1a356b7836e32',
  measurementId: 'G-2Z3YMYHC44',
};

// Firebase JS SDK version loaded from the gstatic CDN (ES modules, no build step).
export const FIREBASE_SDK = '12.19.0';
