// IKTA Bus — backend selector. Pages talk only to this interface, so the
// same UI runs on Firebase (production) or the in-browser demo backend.
import { firebaseConfig, FIREBASE_SDK } from './firebase-config.js';

export const isDemo = !firebaseConfig?.apiKey || /^YOUR_/i.test(firebaseConfig.apiKey);
const instances = {};

/**
 * Connect with an isolated auth session per role ('passenger' | 'driver' | 'owner' | 'admin').
 * Each role uses its own named Firebase app, so a phone can be signed in as a
 * driver and still use the passenger map anonymously without the sessions clashing.
 */
export function connect(role) {
  if (!instances[role]) {
    instances[role] = (isDemo ? import('./backend-demo.js') : import('./backend-firebase.js'))
      .then((m) => m.create(firebaseConfig, role, FIREBASE_SDK));
  }
  return instances[role];
}

export function demoBanner() {
  if (!isDemo || document.querySelector('.demo-banner')) return;
  const b = document.createElement('div');
  b.className = 'demo-banner';
  b.textContent = 'Demo mode · add your Firebase config in js/firebase-config.js';
  const page = document.querySelector('.page');
  if (page) page.prepend(b); else document.body.appendChild(b);
}
