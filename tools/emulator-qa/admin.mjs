/**
 * Firebase Admin helpers for emulator e2e (Auth + Firestore).
 */
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT = 'milksha-qms-dev';

function ensureAdmin() {
  if (getApps().length) {
    return;
  }
  process.env.FIRESTORE_EMULATOR_HOST =
    process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST =
    process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  initializeApp({ projectId: PROJECT });
}

export async function mintCustomToken(claims) {
  ensureAdmin();
  const uid = `emu-${claims.role}-${claims.storeId}-${claims.deviceId || 'ctrl'}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
  return getAuth().createCustomToken(uid, claims);
}

export async function seedTodayBoard(storeId, board) {
  ensureAdmin();
  const db = getFirestore();
  await db.doc(`stores/${storeId}/board/today_board`).set(board);
}

export async function seedControlPending(storeId, deviceId, cmd) {
  ensureAdmin();
  const db = getFirestore();
  await db.doc(`stores/${storeId}/devices/${deviceId}/control/pending`).set(cmd);
}

export async function deleteControlPending(storeId, deviceId) {
  ensureAdmin();
  const db = getFirestore();
  await db.doc(`stores/${storeId}/devices/${deviceId}/control/pending`).delete();
}

export async function readTodayBoard(storeId) {
  ensureAdmin();
  const snap = await getFirestore().doc(`stores/${storeId}/board/today_board`).get();
  return snap.exists ? snap.data() : null;
}

export async function bumpBoardWithTickets(storeId, tickets, seq) {
  ensureAdmin();
  const now = new Date().toISOString();
  await seedTodayBoard(storeId, {
    storeId,
    businessDate: '2026-10-08',
    seq,
    updatedAt: now,
    source: 'A',
    tickets,
    clearedAt: tickets.length ? null : now,
  });
}

export { FieldValue };
