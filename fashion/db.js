// db.js — Firebase Realtime Database data layer
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, push, remove,
  runTransaction, get
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

/* Live mirror of the database. Populated by subscribe(). */
export const DB = {
  settings:    null,
  contestants: {},
  orders:      {},
  ready:       { settings:false, contestants:false, orders:false },
};

const subs = new Set();
export function onData(cb){ subs.add(cb); return () => subs.delete(cb); }
function emit(){ subs.forEach(cb => { try { cb(); } catch(e){ console.error(e); } }); }

export function subscribe(){
  onValue(ref(db, 'settings'),
    s => { DB.settings = s.val() || null; DB.ready.settings = true; emit(); },
    e => console.error('settings subscribe failed', e));

  onValue(ref(db, 'contestants'),
    s => { DB.contestants = s.val() || {}; DB.ready.contestants = true; emit(); },
    e => console.error('contestants subscribe failed', e));

  onValue(ref(db, 'orders'),
    s => { DB.orders = s.val() || {}; DB.ready.orders = true; emit(); },
    e => console.error('orders subscribe failed', e));
}

/* ---------------- settings ---------------- */
export async function saveSettings(partial){
  await update(ref(db, 'settings'), partial);
}

/* ---------------- contestants ---------------- */
export async function createContestant(data){
  const r = push(ref(db, 'contestants'));
  await set(r, data);
  return r.key;
}
export async function updateContestant(id, data){
  await update(ref(db, 'contestants/' + id), data);
}
export async function deleteContestant(id){
  await remove(ref(db, 'contestants/' + id));
}

/* ---------------- orders ---------------- */
export async function createOrder(order){
  const r = push(ref(db, 'orders'));
  await set(r, order);
  return { id: r.key, ...order };
}

export async function setOrderStatus(orderId, status){
  const order = DB.orders[orderId];
  if (!order) throw new Error('Order not found');
  const prev = order.status || 'pending';
  if (prev === status) return;

  // 1) flip the order status
  await update(ref(db, 'orders/' + orderId), {
    status,
    confirmedAt: status === 'confirmed' ? Date.now() : null,
  });

  // 2) adjust the contestant's vote counter atomically
  const delta =
    (status === 'confirmed' ? order.votes : 0) -
    (prev   === 'confirmed' ? order.votes : 0);

  if (delta !== 0 && order.contestantId){
    await runTransaction(
      ref(db, 'contestants/' + order.contestantId + '/votes'),
      cur => Math.max(0, (Number(cur) || 0) + delta)
    );
  }
}

/* ---------------- bulk ---------------- */
export async function bulkSeed({ settings, contestants, orders }){
  await set(ref(db, 'settings'),    settings);
  await set(ref(db, 'contestants'), contestants || {});
  await set(ref(db, 'orders'),      orders      || {});
}

export async function wipeAll(){
  await remove(ref(db, 'contestants'));
  await remove(ref(db, 'orders'));
  await remove(ref(db, 'settings'));
}

export async function readAll(){
  const [s, c, o] = await Promise.all([
    get(ref(db, 'settings')),
    get(ref(db, 'contestants')),
    get(ref(db, 'orders')),
  ]);
  return { settings: s.val(), contestants: c.val() || {}, orders: o.val() || {} };
}