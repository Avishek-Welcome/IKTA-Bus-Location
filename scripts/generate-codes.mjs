#!/usr/bin/env node
// Generate one-time IKTA Bus owner registration codes (no dependencies).
//   node scripts/generate-codes.mjs 20 > secret-codes.json
// Import the JSON in Firebase console → Realtime Database → ⋮ → Import JSON
// **at the /secretCodes location only when it is empty** (import replaces that node).
// To add codes to an existing list, use admin.html instead.
import { webcrypto as crypto } from 'node:crypto';

const n = Math.max(1, Math.min(1000, Number(process.argv[2]) || 10));
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@%&*+=?-_~^'; // Firebase keys cannot contain . $ # [ ] /
const rnd = (k) => crypto.getRandomValues(new Uint32Array(1))[0] % k;

function code() {
  for (;;) {
    const pool = [...new Set(LETTERS + DIGITS + SPECIAL)];
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const c = pool.slice(0, 10).join(''); // 10 characters, none repeated
    if (/[A-Za-z]/.test(c) && /\d/.test(c) && /[^A-Za-z0-9]/.test(c)) return c;
  }
}
const out = {};
while (Object.keys(out).length < n) out[code()] = { used: false, createdAt: Date.now() };
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
process.stderr.write(`Generated ${n} codes:\n${Object.keys(out).join('\n')}\n`);
