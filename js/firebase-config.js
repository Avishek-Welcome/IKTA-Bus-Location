// =====================================================================
//  IKTA Bus — Firebase configuration
//  1. Create a project at https://console.firebase.google.com
//  2. Add a Web app and paste its config below.
//  3. Enable Authentication → Email/Password AND Anonymous.
//  4. Create a Realtime Database and publish database.rules.json.
//
//  While apiKey still starts with "YOUR_", the app runs in DEMO MODE:
//  data lives in this browser (localStorage) and simulated buses move
//  on the map, so every screen can be tried without a backend.
// =====================================================================
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
};

// Firebase JS SDK version loaded from the gstatic CDN (ES modules, no build step).
export const FIREBASE_SDK = '10.14.1';
