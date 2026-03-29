'use client';

import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type QueueType = 'scout' | 'pit' | 'super';

type QueueEntry = {
  id: string;
  type: QueueType;
  payload: any;
  createdAt: string;
};

const STORAGE_KEY = 'mvrt-offline-queue-v1';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readQueue(): QueueEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueueEntry[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event('offline-queue-updated'));
}

function makeEntry(type: QueueType, payload: any): QueueEntry {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
}

export function getOfflineQueueCount() {
  return readQueue().length;
}

export function queueScoutSubmission(payload: any) {
  const queue = readQueue();
  queue.push(makeEntry('scout', payload));
  writeQueue(queue);
}

export function queuePitSubmission(payload: any) {
  const queue = readQueue();
  queue.push(makeEntry('pit', payload));
  writeQueue(queue);
}

export function queueSuperSubmission(payload: any) {
  const queue = readQueue();
  queue.push(makeEntry('super', payload));
  writeQueue(queue);
}

export async function saveScoutPayload(payload: any) {
  const nowIso = new Date().toISOString();
  const { year, regional, teamNumber, matchNumber, scoutUid, matchData } = payload;
  const docId = payload.docId || `qm${matchNumber}_${scoutUid}`;

  // Create year and regional if they don't exist
  await setDoc(doc(db, 'years', year), { year: Number(year) || year, updatedAt: nowIso }, { merge: true });
  await setDoc(doc(db, `years/${year}/regionals`, regional), { code: regional, name: String(regional).toUpperCase(), updatedAt: nowIso }, { merge: true });
  
  // Create team doc
  await setDoc(doc(db, `years/${year}/regionals/${regional}/teams`, String(teamNumber)), {
    teamNumber,
    lastUpdated: nowIso,
  }, { merge: true });

  // Save match data - this is the single source of truth
  await setDoc(doc(db, `years/${year}/regionals/${regional}/teams/${teamNumber}/matches`, docId), matchData);

  // Update assignment status if exists
  const assignmentQuery = query(
    collection(db, `years/${year}/assignments`), 
    where('userId', '==', scoutUid),
    where('role', '==', 'scout'),
    where('matchNumber', '==', String(matchNumber)),
    where('teamNumber', '==', String(teamNumber))
  );
  const assignmentSnapshot = await getDocs(assignmentQuery);
  
  if (!assignmentSnapshot.empty) {
    await updateDoc(doc(db, `years/${year}/assignments`, assignmentSnapshot.docs[0].id), {
      status: 'completed',
      completedAt: nowIso,
    });
  }
}

export async function savePitPayload(payload: any) {
  const nowIso = new Date().toISOString();
  const { year, regional, teamNumber, docId, pitData } = payload;

  // Create year and regional if they don't exist
  await setDoc(doc(db, 'years', year), { year: Number(year) || year, updatedAt: nowIso }, { merge: true });
  await setDoc(doc(db, `years/${year}/regionals`, regional), { code: regional, name: String(regional).toUpperCase(), updatedAt: nowIso }, { merge: true });
  
  // Create team doc
  await setDoc(doc(db, `years/${year}/regionals/${regional}/teams`, String(teamNumber)), {
    teamNumber,
    lastUpdated: nowIso,
  }, { merge: true });

  // Save pit scouting data directly under team - no redundant root collection
  await setDoc(doc(db, `years/${year}/regionals/${regional}/teams/${teamNumber}/pit_scouting`, docId || 'data'), pitData);
}

export async function saveSuperPayload(payload: any) {
  const { year, regional, matchNumber, alliance, scoutUid, reportData } = payload;
  const docId = payload.docId || `qm${matchNumber}_${alliance}_${scoutUid}`;
  const nowIso = new Date().toISOString();

  // Save super scout report
  await setDoc(doc(db, `years/${year}/regionals/${regional}/super_scouting`, docId), reportData);

  // Store match-team mapping for offline access (from super scout data)
  if (reportData.teams && Array.isArray(reportData.teams) && reportData.teams.length > 0) {
    const cleanTeams = reportData.teams.map((t: string) => String(t).trim()).filter(Boolean);
    const matchTeamData = {
      matchNumber: parseInt(matchNumber, 10),
      alliance,
      teams: cleanTeams,
      updatedAt: nowIso,
      source: 'super_scout',
    };
    // Store in match_teams collection for easy lookup
    await setDoc(doc(db, `years/${year}/regionals/${regional}/match_teams`, `qm${matchNumber}_${alliance}`), matchTeamData, { merge: true });
  }

  // Update assignment status
  const assignmentQuery = query(
    collection(db, `years/${year}/assignments`),
    where('userId', '==', scoutUid),
    where('role', '==', 'super_scout'),
    where('matchNumber', '==', String(matchNumber)),
    where('alliance', '==', alliance)
  );
  const assignmentSnapshot = await getDocs(assignmentQuery);

  if (!assignmentSnapshot.empty) {
    await updateDoc(doc(db, `years/${year}/assignments`, assignmentSnapshot.docs[0].id), {
      status: 'completed',
      completedAt: nowIso,
    });
  }
}

export async function flushOfflineQueue() {
  const queue = readQueue();
  if (queue.length === 0) {
    return { synced: 0, failed: 0 };
  }

  const failed: QueueEntry[] = [];
  let synced = 0;

  for (const entry of queue) {
    try {
      if (entry.type === 'scout') {
        await saveScoutPayload(entry.payload);
      } else if (entry.type === 'pit') {
        await savePitPayload(entry.payload);
      } else if (entry.type === 'super') {
        await saveSuperPayload(entry.payload);
      }
      synced += 1;
    } catch {
      failed.push(entry);
    }
  }

  writeQueue(failed);
  return { synced, failed: failed.length };
}
