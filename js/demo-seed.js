// IKTA Bus — demo data (North Kolkata corridor) + simulated buses.
// Only used while js/firebase-config.js still holds placeholder values.
import { buildPath } from './common.js';

export const DEMO_ACCOUNTS = {
  owner: { userId: 'demo_owner', password: 'Demo@1234' },
  driver: { userId: 'driver_dn12', password: 'Drive@1234' },
  admin: { userId: 'admin', password: 'Admin@1234' },
};
export const DEMO_CODES = ['K7@p2Q!x9M', 'A4%tR8&zW1', 'Z9*mB3+qL6', 'H2=vN5?cT8', 'P6~dF1^kY3'];

const STOPS = {
  s01: ['Barasat (Champadali More)', 22.7231, 88.4813],
  s02: ['Hridaypur', 22.7065, 88.4723],
  s03: ['Madhyamgram Chowmatha', 22.6960, 88.4590],
  s04: ['Birati', 22.6705, 88.4390],
  s05: ['Airport Gate No. 1', 22.6445, 88.4305],
  s06: ['Kaikhali', 22.6290, 88.4318],
  s07: ['Baguiati', 22.6162, 88.4258],
  s08: ['Dum Dum Park', 22.6055, 88.4150],
  s09: ['Ultadanga', 22.5870, 88.3920],
  s10: ['Sealdah', 22.5675, 88.3705],
  s11: ['Nagerbazar', 22.6232, 88.4140],
  s12: ['Dum Dum Station', 22.6215, 88.3925],
  s13: ['Chinar Park', 22.6215, 88.4475],
  s14: ['City Centre 2, New Town', 22.5880, 88.4800],
};
const ROUTES = {
  DN12: { busName: 'DN 12', stops: ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'] },
  DN8: { busName: 'DN 8', stops: ['s01', 's02', 's03', 's04', 's05', 's11', 's12'] },
  L38: { busName: 'L38', stops: ['s01', 's03', 's05', 's06', 's13', 's14'] },
};
// reg, busName, simulated speed (m/s), start phase (0..2 → ping-pong along route)
const BUSES = [
  ['WB 23A 4567', 'DN 12', 7.0, 0.15],
  ['WB 23A 4589', 'DN 12', 6.4, 0.55],
  ['WB 23B 1201', 'DN 12', 8.0, 1.30],
  ['WB 23C 3344', 'DN 12', 6.8, 1.85],
  ['WB 19C 7766', 'DN 8', 7.2, 0.30],
  ['WB 19C 7790', 'DN 8', 6.6, 1.45],
  ['WB 25B 1123', 'L38', 7.5, 0.70],
  ['WB 25B 1188', 'L38', 6.0, 1.60],
  ['WB 23A 9999', 'DN 12', 0, 0], // real driver account in the demo — not simulated
];
const k = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function seedDemo({ write, sha, authKey }) {
  const now = Date.now();
  const ownerUid = 'demo_owner_uid', driverUid = 'demo_driver_uid', adminUid = 'demo_admin_uid';
  const acct = async (role, { userId, password }, uid) =>
    write(`_auth/${authKey(`${userId}@${role}.ikta-bus.app`)}`, { uid, pw: await sha(password), email: `${userId}@${role}.ikta-bus.app` });
  await acct('owner', DEMO_ACCOUNTS.owner, ownerUid);
  await acct('driver', DEMO_ACCOUNTS.driver, driverUid);
  await acct('admin', DEMO_ACCOUNTS.admin, adminUid);
  write(`admins/${adminUid}`, true);

  for (const [id, [name, lat, lng]] of Object.entries(STOPS)) write(`stops/${id}`, { name, lat, lng, createdAt: now, createdBy: 'seed' });
  for (const [key, r] of Object.entries(ROUTES)) {
    write(`routes/${key}`, { busName: r.busName, stops: r.stops, source: r.stops[0], destination: r.stops.at(-1), updatedAt: now });
  }
  write(`owners/${ownerUid}`, { name: 'Demo Transport Co.', userId: DEMO_ACCOUNTS.owner.userId, phone: '+91 98300 00000', code: 'U8-jE4_wS7', createdAt: now });
  write('usernames/demo_owner', { uid: ownerUid, role: 'owner' });
  for (const [reg, name, speed] of BUSES) {
    write(`buses/${k(reg)}`, { regNo: reg, busName: name, busKey: k(name), ownerUid, ownerName: 'Demo Transport Co.', sim: speed > 0, createdAt: now });
    write(`owners/${ownerUid}/buses/${k(reg)}`, true);
  }
  write('buses/WB23A9999/driverUid', driverUid);
  write('buses/WB23A9999/driverName', 'Rahul Das');
  write(`drivers/${driverUid}`, { name: 'Rahul Das', phone: '+91 98300 11111', userId: DEMO_ACCOUNTS.driver.userId, ownerUid, regKey: 'WB23A9999', regNo: 'WB 23A 9999', busName: 'DN 12', busKey: 'DN12', createdAt: now });
  write('usernames/driver_dn12', { uid: driverUid, role: 'driver', ownerUid });
  write(`ownerDrivers/${ownerUid}/${driverUid}`, { userId: DEMO_ACCOUNTS.driver.userId, password: DEMO_ACCOUNTS.driver.password, name: 'Rahul Das', regKey: 'WB23A9999' });

  for (const c of DEMO_CODES) write(`secretCodes/${c}`, { used: false, createdAt: now });
  write('secretCodes/U8-jE4_wS7', { used: true, usedBy: ownerUid, usedByName: 'Demo Transport Co.', usedByUserId: 'demo_owner', usedAt: now, createdAt: now });

  const levels = ['empty', 'moderate', 'crowded', 'packed', 'moderate', 'empty'];
  BUSES.filter((b) => b[2] > 0).forEach(([reg], i) => write(`crowd/${k(reg)}`, { level: levels[i % levels.length], ts: now - i * 4 * 60000, count: 3 + i }));
}

/** Deterministic simulation: every open tab computes identical positions, so no coordination is needed. */
export function startSimulation(api) {
  let paths = null;
  const tick = async () => {
    if (!paths) {
      const [stops, routes] = await Promise.all([api.get('stops'), api.get('routes')]);
      if (!stops || !routes) return;
      paths = {};
      for (const [key, r] of Object.entries(routes)) {
        const pts = (r.stops || []).map((id) => stops[id]).filter(Boolean);
        if (pts.length > 1) paths[key] = buildPath(pts);
      }
    }
    const t = Date.now() / 1000;
    const upd = {};
    for (const [reg, name, speed, phase] of BUSES) {
      const path = paths[k(name)];
      if (!speed || !path) continue;
      const L = path.length;
      let s = (phase * L + speed * t) % (2 * L);
      const fwd = s < L;
      if (!fwd) s = 2 * L - s;
      // locate segment
      let i = 0;
      while (i < path.cum.length - 2 && path.cum[i + 1] < s) i++;
      const a = path.points[i], b = path.points[i + 1];
      const f = (s - path.cum[i]) / ((path.cum[i + 1] - path.cum[i]) || 1);
      const lat = a.lat + (b.lat - a.lat) * f, lng = a.lng + (b.lng - a.lng) * f;
      const from = fwd ? a : b, to = fwd ? b : a;
      const heading = (Math.atan2((to.lng - from.lng) * Math.cos((lat * Math.PI) / 180), to.lat - from.lat) * 180 / Math.PI + 360) % 360;
      upd[k(reg)] = {
        lat: +lat.toFixed(6), lng: +lng.toFixed(6), speed, heading: Math.round(heading), acc: 8,
        ts: Date.now(), online: true, dir: fwd ? 'fwd' : 'rev', busName: name, busKey: k(name), regNo: reg, sim: true,
      };
    }
    await api.update('live', upd);
  };
  tick();
  return setInterval(tick, 2000);
}
