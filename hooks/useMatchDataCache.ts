'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

const CACHE_KEY = 'mvrt_match_data_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

interface CacheData {
  scoutingData: any[];
  superScoutData: any[];
  baMatches: any[];
  teams: any[];
  matchTeams: Record<string, { red?: string[]; blue?: string[] }>;
  eventContext: { year: string; regional: string; regionalCode: string };
  timestamp: number;
}

interface UseMatchDataCacheReturn {
  rows: any[];
  reports: any[];
  baMatches: any[];
  teams: any[];
  matchTeams: Record<string, { red?: string[]; blue?: string[] }>;
  eventContext: { year: string; regional: string; regionalCode: string };
  isLoading: boolean;
  isFromCache: boolean;
  refresh: () => Promise<void>;
}

function getStoredAuth(): { isApproved: boolean; userId: string | null } {
  if (typeof window === 'undefined') return { isApproved: false, userId: null };
  try {
    const stored = localStorage.getItem('mvrt_auth_state');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { isApproved: parsed.isApproved || false, userId: parsed.userId || null };
    }
  } catch {}
  return { isApproved: false, userId: null };
}

function loadFromCache(): CacheData | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (!stored) return null;
    const data: CacheData = JSON.parse(stored);
    if (Date.now() - data.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function saveToCache(data: Omit<CacheData, 'timestamp'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch (e) {
    console.warn('Failed to save match data to cache:', e);
  }
}

export function useMatchDataCache(isApproved: boolean, userId: string | null): UseMatchDataCacheReturn {
  const [rows, setRows] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [baMatches, setBaMatches] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [matchTeams, setMatchTeams] = useState<Record<string, { red?: string[]; blue?: string[] }>>({});
  const [eventContext, setEventContext] = useState({ year: '2026', regional: 'practice', regionalCode: 'practice' });
  const [isLoading, setIsLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setIsFromCache(false);

    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
      const year = settingsDoc.exists() ? String((settingsDoc.data() as any).year || '2026') : '2026';
      const regional = settingsDoc.exists() ? String((settingsDoc.data() as any).regional || 'practice') : 'practice';
      const regionalCode = settingsDoc.exists() ? String((settingsDoc.data() as any).regionalCode || regional) : regional;

      const ctx = { year, regional, regionalCode };
      setEventContext(ctx);

      // Fetch all match data from teams instead of root scouting_data
      const teamsSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/teams`));
      const teamsList = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Collect all match data from all teams
      const allMatchData: any[] = [];
      for (const team of teamsList) {
        const matchesSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/teams/${team.id}/matches`));
        matchesSnapshot.docs.forEach(doc => {
          allMatchData.push({ id: doc.id, teamNumber: team.id, ...(doc.data() as any) });
        });
      }
      
      const nextRows = allMatchData
        .sort((a, b) => (Number(a.teamNumber) || 0) - (Number(b.teamNumber) || 0) || (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));

      const superSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/super_scouting`));
      const nextReports = superSnapshot.docs
        .map(entry => ({ id: entry.id, ...(entry.data() as any) }))
        .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));

      const baMatchesSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/ba_matches`));
      const nextBaMatches = baMatchesSnapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }));

      const matchTeamsSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/match_teams`));

      // Build matchTeams map from match_teams collection
      const matchTeamsMap: Record<string, { red?: string[]; blue?: string[] }> = {};
      matchTeamsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.matchNumber && data.alliance && data.teams) {
          const key = `qm${data.matchNumber}`;
          if (!matchTeamsMap[key]) matchTeamsMap[key] = {};
          const alliance = data.alliance as 'red' | 'blue';
          matchTeamsMap[key][alliance] = data.teams;
        }
      });

      setRows(nextRows);
      setReports(nextReports);
      setBaMatches(nextBaMatches);
      setTeams(teamsList);
      setMatchTeams(matchTeamsMap);

      saveToCache({
        scoutingData: nextRows,
        superScoutData: nextReports,
        baMatches: nextBaMatches,
        teams: teamsList,
        matchTeams: matchTeamsMap,
        eventContext: ctx,
      });
    } catch (err) {
      console.error('Error fetching match data:', err);
      const cached = loadFromCache();
      if (cached) {
        setRows(cached.scoutingData);
        setReports(cached.superScoutData);
        setBaMatches(cached.baMatches);
        setTeams(cached.teams);
        setMatchTeams(cached.matchTeams || {});
        setEventContext(cached.eventContext);
        setIsFromCache(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = loadFromCache();
    if (cached) {
      setRows(cached.scoutingData);
      setReports(cached.superScoutData);
      setBaMatches(cached.baMatches);
      setTeams(cached.teams);
      setMatchTeams(cached.matchTeams || {});
      setEventContext(cached.eventContext);
      setIsFromCache(true);
    }
  }, []);

  useEffect(() => {
    if (isApproved && userId) {
      fetchData();
    } else if (!isApproved) {
      const cached = loadFromCache();
      if (cached) {
        setRows(cached.scoutingData);
        setReports(cached.superScoutData);
        setBaMatches(cached.baMatches);
        setTeams(cached.teams);
        setMatchTeams(cached.matchTeams || {});
        setEventContext(cached.eventContext);
        setIsFromCache(true);
      }
      setIsLoading(false);
    }
  }, [isApproved, userId, fetchData]);

  return { rows, reports, baMatches, teams, matchTeams, eventContext, isLoading, isFromCache, refresh: fetchData };
}
