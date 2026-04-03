'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, deleteDoc, doc, getDocFromServer, getDocsFromServer, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { 
  Loader2, Calendar, CheckCircle, Clock, ArrowRightLeft, 
  Users, ArrowRight, X, ChevronDown, ChevronUp, Shield, RefreshCw, Plus, Trash2
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useOfflineMode } from '@/hooks/useOfflineMode';

type User = {
  id: string;
  email?: string;
  name?: string;
  approved?: boolean;
};

type Assignment = {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  role: 'scout' | 'super_scout';
  matchNumber: string;
  position?: string;
  alliance?: string;
  status: 'pending' | 'completed';
  regional: string;
  year: string;
};

type MatchTeams = {
  matchNumber: string;
  red?: string[];
  blue?: string[];
};

type ManualAssignment = {
  id: string;
  matchNumber: string;
  teamNumber?: string;
  alliance?: 'red' | 'blue';
  position?: string;
  role: 'scout' | 'super_scout';
  status: 'pending' | 'completed';
  isLocal: true;
};

type AssignmentWithTeam = (Assignment | ManualAssignment) & {
  teamNumber?: string;
  isLocal?: boolean;
};

export default function AssignmentsPage() {
  const router = useRouter();
  const { user, isAuthChecking, isAdmin, isOfflineMode } = useAuth();
  const { isOnline } = useOfflineMode();

  const [isLoading, setIsLoading] = useState(true);
  const [myAssignments, setMyAssignments] = useState<AssignmentWithTeam[]>([]);
  const [matchTeams, setMatchTeams] = useState<Record<string, MatchTeams>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedTransferAssignments, setSelectedTransferAssignments] = useState<Set<string>>(new Set());
  const [selectedTransferUser, setSelectedTransferUser] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferUI, setShowTransferUI] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<ManualAssignment[]>([]);
  const [showAddManual, setShowAddManual] = useState(false);
  const [newManualMatch, setNewManualMatch] = useState('');
  const [newManualTeam, setNewManualTeam] = useState('');
  const [newManualRole, setNewManualRole] = useState<'scout' | 'super_scout'>('scout');
  const [newManualAlliance, setNewManualAlliance] = useState<'red' | 'blue'>('red');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [quickMatchScout, setQuickMatchScout] = useState('');
  const [quickTeamScout, setQuickTeamScout] = useState('');
  const [quickMatchSuper, setQuickMatchSuper] = useState('');
  const [quickAllianceSuper, setQuickAllianceSuper] = useState<'red' | 'blue'>('red');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [year, setYear] = useState('2026');
  const [regional, setRegional] = useState('practice');

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

  useEffect(() => {
    if (!user) return;
    
    // Skip Firebase loading in offline mode - use local storage only
    if (isOfflineMode) {
      setIsLoading(false);
      setMyAssignments([]);
      return;
    }
    
    setIsLoading(true);
    
    // Set a 5-second timeout to auto-enable offline mode if Firebase is slow
    const timeoutId = setTimeout(() => {
      console.log('Assignments loading timeout - switching to offline mode');
      localStorage.setItem('offline-mode', 'true');
      window.location.reload(); // Reload to trigger offline mode
    }, 5000);

    // Get current event settings first
    const loadInitialData = async () => {
      try {
        const settingsDoc = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
      const settings = settingsDoc.data() as any;
      const currentYear = String(settings?.year || '2026');
      const currentRegional = String(settings?.regional || 'practice');
      setYear(currentYear);
      setRegional(currentRegional);

      // Load match teams data
      const matchTeamsSnapshot = await getDocsFromServer(collection(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`));
      const matchTeamsMap: Record<string, MatchTeams> = {};
      matchTeamsSnapshot.docs.forEach((d) => {
        const data = d.data() as any;
        const matchNum = String(data.matchNumber || '');
        if (matchNum) {
          if (!matchTeamsMap[matchNum]) {
            matchTeamsMap[matchNum] = { matchNumber: matchNum, red: [], blue: [] };
          }
          if (data.alliance === 'red' || d.id.includes('red')) {
            matchTeamsMap[matchNum].red = data.teams || [];
          } else if (data.alliance === 'blue' || d.id.includes('blue')) {
            matchTeamsMap[matchNum].blue = data.teams || [];
          }
        }
      });
      setMatchTeams(matchTeamsMap);

      // Load all approved users for transfer
      const usersSnap = await getDocsFromServer(collection(db, 'users'));
      const users = usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as User))
        .filter((u) => u.approved && u.id !== user.uid)
        .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
      setAllUsers(users);

      // Set up real-time listener for assignments using loaded values
      const assignmentsQuery = query(
        collection(db, `years/${currentYear}/assignments`),
        where('userId', '==', user.uid),
        where('regional', '==', currentRegional)
      );

      // First fetch from server
      getDocsFromServer(assignmentsQuery).then((snapshot) => {
        const assignments: AssignmentWithTeam[] = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as Assignment))
          .map((assignment) => {
            const matchNum = String(assignment.matchNumber || '');
            const teams = matchTeams[matchNum];
            let teamNumber: string | undefined;
            
            if (teams && assignment.position) {
              const posMatch = assignment.position.match(/_(\d)$/);
              if (posMatch) {
                const posIndex = parseInt(posMatch[1], 10) - 1;
                if (assignment.position.startsWith('red') && teams.red?.[posIndex]) {
                  teamNumber = teams.red[posIndex];
                } else if (assignment.position.startsWith('blue') && teams.blue?.[posIndex]) {
                  teamNumber = teams.blue[posIndex];
                }
              }
            }
            
            return { ...assignment, teamNumber };
          })
          .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
        setMyAssignments(assignments);
        setIsLoading(false);
        clearTimeout(timeoutId); // Clear timeout on success
      }).catch((error) => {
        console.error('Error fetching assignments from server:', error);
        setIsLoading(false);
      });
      
      // Then set up listener for updates (only apply non-cache updates)
      const unsubscribe = onSnapshot(assignmentsQuery, { includeMetadataChanges: true }, (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          const assignments: AssignmentWithTeam[] = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() } as Assignment))
            .map((assignment) => {
              const matchNum = String(assignment.matchNumber || '');
              const teams = matchTeams[matchNum];
              let teamNumber: string | undefined;
              
              if (teams && assignment.position) {
                const posMatch = assignment.position.match(/_(\d)$/);
                if (posMatch) {
                  const posIndex = parseInt(posMatch[1], 10) - 1;
                  if (assignment.position.startsWith('red') && teams.red?.[posIndex]) {
                    teamNumber = teams.red[posIndex];
                  } else if (assignment.position.startsWith('blue') && teams.blue?.[posIndex]) {
                    teamNumber = teams.blue[posIndex];
                  }
                }
              }
              
              return { ...assignment, teamNumber };
            })
            .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
          setMyAssignments(assignments);
        }
      }, (error) => {
        console.error('Error listening to assignments:', error);
      });

      return () => {
        unsubscribe();
        clearTimeout(timeoutId); // Clear timeout on unmount
      };
    } catch (err) {
      clearTimeout(timeoutId); // Clear timeout on error
      console.error('Error loading initial data:', err);
      setIsLoading(false);
    }
  };

    loadInitialData();
  }, [user, isOfflineMode]);

  const handleTransferAssignments = async () => {
    if (!selectedTransferUser || selectedTransferAssignments.size === 0 || !user) return;
    setIsTransferring(true);
    setError('');
    setMessage('');
    try {
      const targetUser = allUsers.find((u) => u.id === selectedTransferUser);
      if (!targetUser) throw new Error('Target user not found');

      const assignmentsToTransfer = myAssignments.filter((a) => selectedTransferAssignments.has(a.id));

      await Promise.all(
        assignmentsToTransfer.map(async (assignment) => {
          await updateDoc(doc(db, `years/${year}/assignments`, assignment.id), {
            userId: selectedTransferUser,
            userName: targetUser.name || targetUser.email || '',
            userEmail: targetUser.email || '',
            updatedAt: new Date().toISOString(),
          });
        })
      );

      setMessage(`Transferred ${assignmentsToTransfer.length} assignment(s) to ${targetUser.name || targetUser.email}`);
      setSelectedTransferAssignments(new Set());
      setShowTransferUI(false);
      setSelectedTransferUser('');
      // No need to reload - onSnapshot will update automatically
    } catch (err: any) {
      setError(err?.message || 'Failed to transfer assignments');
    } finally {
      setIsTransferring(false);
    }
  };

  const MANUAL_ASSIGNMENTS_KEY = `manual-assignments-${user?.uid || 'guest'}`;

  // Load manual assignments from localStorage
  useEffect(() => {
    if (!user) return;
    try {
      const stored = localStorage.getItem(MANUAL_ASSIGNMENTS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setManualAssignments(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setManualAssignments([]);
    }
  }, [user, MANUAL_ASSIGNMENTS_KEY]);

  // Save manual assignments to localStorage
  useEffect(() => {
    if (!user) return;
    localStorage.setItem(MANUAL_ASSIGNMENTS_KEY, JSON.stringify(manualAssignments));
  }, [manualAssignments, user, MANUAL_ASSIGNMENTS_KEY]);

  const addManualAssignment = () => {
    if (!newManualMatch.trim()) return;
    
    const newAssignment: ManualAssignment = {
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      matchNumber: newManualMatch.trim(),
      teamNumber: newManualTeam.trim() || undefined,
      role: newManualRole,
      alliance: newManualRole === 'super_scout' ? newManualAlliance : undefined,
      status: 'pending',
      isLocal: true,
    };
    
    setManualAssignments(prev => [...prev, newAssignment]);
    setNewManualMatch('');
    setNewManualTeam('');
    setShowAddManual(false);
  };

  const addQuickAssignment = (role: 'scout' | 'super_scout') => {
    if (role === 'scout') {
      if (!quickMatchScout.trim() || !quickTeamScout.trim()) return;
      
      const newAssignment: ManualAssignment = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        matchNumber: quickMatchScout.trim(),
        teamNumber: quickTeamScout.trim(),
        role: 'scout',
        status: 'pending',
        isLocal: true,
      };
      
      setManualAssignments(prev => [...prev, newAssignment]);
      setQuickMatchScout('');
      setQuickTeamScout('');
    } else {
      if (!quickMatchSuper.trim()) return;
      
      const newAssignment: ManualAssignment = {
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        matchNumber: quickMatchSuper.trim(),
        role: 'super_scout',
        alliance: quickAllianceSuper,
        status: 'pending',
        isLocal: true,
      };
      
      setManualAssignments(prev => [...prev, newAssignment]);
      setQuickMatchSuper('');
    }
  };

  const removeManualAssignment = (id: string) => {
    setManualAssignments(prev => prev.filter(a => a.id !== id));
  };

  const handleSyncAssignments = async () => {
    if (manualAssignments.length === 0 || !user) return;
    setIsSyncing(true);
    setSyncMessage('');
    setError('');
    
    try {
      // Sync manual assignments to server
      const syncPromises = manualAssignments.map(async (assignment) => {
        const assignmentData = {
          userId: user.uid,
          userName: user.displayName || user.email || '',
          userEmail: user.email || '',
          matchNumber: assignment.matchNumber,
          teamNumber: assignment.teamNumber,
          role: assignment.role,
          alliance: assignment.alliance,
          position: assignment.position,
          status: 'pending',
          regional,
          year,
          createdAt: new Date().toISOString(),
          isManual: true,
        };
        
        await setDoc(doc(db, `years/${year}/assignments`, assignment.id), assignmentData);
      });
      
      await Promise.all(syncPromises);
      
      // Clear local assignments after successful sync
      setManualAssignments([]);
      setSyncMessage(`Successfully synced ${manualAssignments.length} assignment(s) to server`);
    } catch (err: any) {
      setError(err?.message || 'Failed to sync assignments');
    } finally {
      setIsSyncing(false);
    }
  };

  // Combine server and manual assignments
  const allAssignments = useMemo(() => {
    // Filter out manual assignments that have matching server assignments
    const unsyncedManual = manualAssignments.filter(manual => 
      !myAssignments.some(server => 
        server.matchNumber === manual.matchNumber && 
        (manual.role === 'super_scout' 
          ? server.alliance === manual.alliance 
          : server.teamNumber === manual.teamNumber)
      )
    );
    return [...myAssignments, ...unsyncedManual];
  }, [myAssignments, manualAssignments]);

  // Group assignments by status
  const pendingAssignments = useMemo(
    () => allAssignments.filter((a) => a.status === 'pending'),
    [allAssignments]
  );
  const completedAssignments = useMemo(
    () => allAssignments.filter((a) => a.status === 'completed'),
    [allAssignments]
  );

  const pendingCount = pendingAssignments.length;
  const completedCount = completedAssignments.length;

  if (isAuthChecking || (!user && !isAdmin)) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="rounded-2xl border border-purple-200/70 bg-gradient-to-r from-purple-600 to-purple-800 p-6 shadow-xl shadow-purple-900/10 dark:border-zinc-800 dark:from-purple-900 dark:to-zinc-900">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              <Calendar className="h-3 w-3" />
              My Assignments
            </div>
            {isOfflineMode && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-amber-500/80 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
                OFFLINE MODE
              </div>
            )}
            <h1 className="mt-3 text-3xl font-black text-white">Your Schedule</h1>
            <p className="mt-2 max-w-2xl text-sm text-purple-100">
              View your scouting assignments and transfer them if needed.
            </p>
          </div>
          <div className="flex items-start gap-2">
            {isOfflineMode && (
              <button
                onClick={() => {
                  localStorage.removeItem('offline-mode');
                  window.location.href = '/login';
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500/80 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-amber-500"
              >
                Exit Offline Mode
              </button>
            )}
            {manualAssignments.length > 0 && !isOfflineMode && (
              <button
                onClick={handleSyncAssignments}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/80 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync ({manualAssignments.length})
              </button>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            >
              <ArrowRight className="h-4 w-4" />
              Dashboard
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <Clock className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{pendingCount}</div>
                <div className="text-xs text-purple-200">Pending Assignments</div>
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                <CheckCircle className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <div className="text-2xl font-black text-white">{completedCount}</div>
                <div className="text-xs text-purple-200">Completed</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Action Bar - Always visible */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!showAddManual ? (
          <button
            onClick={() => setShowAddManual(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 hover:scale-105"
          >
            <Plus className="h-5 w-5" />
            Add Manual Assignment
          </button>
        ) : (
          <div className="w-full rounded-xl border border-purple-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center gap-2 mb-3">
              <Plus className="h-5 w-5 text-emerald-600" />
              <span className="font-bold text-purple-950 dark:text-white">Add Manual Assignment</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Match # *</label>
                <input
                  type="text"
                  value={newManualMatch}
                  onChange={(e) => setNewManualMatch(e.target.value)}
                  placeholder="e.g., 1"
                  className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Team # (opt)</label>
                <input
                  type="text"
                  value={newManualTeam}
                  onChange={(e) => setNewManualTeam(e.target.value)}
                  placeholder="e.g., 254"
                  className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Role</label>
                <select
                  value={newManualRole}
                  onChange={(e) => setNewManualRole(e.target.value as 'scout' | 'super_scout')}
                  className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                >
                  <option value="scout">Scout</option>
                  <option value="super_scout">Super Scout</option>
                </select>
              </div>
              {newManualRole === 'super_scout' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Alliance</label>
                  <select
                    value={newManualAlliance}
                    onChange={(e) => setNewManualAlliance(e.target.value as 'red' | 'blue')}
                    className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  >
                    <option value="red">Red</option>
                    <option value="blue">Blue</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  setShowAddManual(false);
                  setNewManualMatch('');
                  setNewManualTeam('');
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={addManualAssignment}
                disabled={!newManualMatch.trim()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                Add Assignment
              </button>
            </div>
          </div>
        )}
        
        {manualAssignments.length > 0 && !showAddManual && (
          <button
            onClick={handleSyncAssignments}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:scale-105 disabled:opacity-50"
          >
            {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
            Sync {manualAssignments.length} Local
          </button>
        )}
      </div>

      {/* Alerts */}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      {syncMessage ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200">
          {syncMessage}
        </div>
      ) : null}

      {/* Quick Add Assignments - Full width, always visible at TOP */}
      <div className="mt-6 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mb-4 flex items-center gap-3">
          <Plus className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-black text-purple-950 dark:text-white">Quick Add Assignments</h2>
          {manualAssignments.length > 0 && (
            <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              {manualAssignments.length} local
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Scout Assignment Card */}
          <div className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                Scout
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="text"
                value={quickMatchScout}
                onChange={(e) => setQuickMatchScout(e.target.value)}
                placeholder="Match #"
                className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
              <input
                type="text"
                value={quickTeamScout}
                onChange={(e) => setQuickTeamScout(e.target.value)}
                placeholder="Team #"
                className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <button
              onClick={() => addQuickAssignment('scout')}
              disabled={!quickMatchScout.trim() || !quickTeamScout.trim()}
              className="w-full rounded-lg bg-purple-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              Add Match {quickMatchScout || 'X'} Team {quickTeamScout || 'X'}
            </button>
          </div>

          {/* Super Scout Assignment Card */}
          <div className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex items-center gap-2 mb-3">
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                Super Scout
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="text"
                value={quickMatchSuper}
                onChange={(e) => setQuickMatchSuper(e.target.value)}
                placeholder="Match #"
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              />
              <select
                value={quickAllianceSuper}
                onChange={(e) => setQuickAllianceSuper(e.target.value as 'red' | 'blue')}
                className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm text-indigo-950 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
              >
                <option value="red">Red Alliance</option>
                <option value="blue">Blue Alliance</option>
              </select>
            </div>
            <button
              onClick={() => addQuickAssignment('super_scout')}
              disabled={!quickMatchSuper.trim()}
              className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              Add Match {quickMatchSuper || 'X'} {quickAllianceSuper === 'red' ? 'Red' : 'Blue'} Alliance
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          {/* Assignments List - Left Column */}
          <div className="flex flex-col gap-6">
            {/* Pending Assignments */}
            <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-500" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Pending</h2>
                <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  {pendingCount}
                </span>
              </div>

              {pendingAssignments.length === 0 && !showAddManual ? (
                <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-6 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No pending assignments</p>
                  
                  <button
                    onClick={() => setShowAddManual(true)}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add Manual Assignment
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingAssignments.map((assignment) => (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      selectable
                      selected={selectedTransferAssignments.has(assignment.id)}
                      onToggle={() => {
                        const newSet = new Set(selectedTransferAssignments);
                        if (newSet.has(assignment.id)) {
                          newSet.delete(assignment.id);
                        } else {
                          newSet.add(assignment.id);
                        }
                        setSelectedTransferAssignments(newSet);
                      }}
                      onDelete={assignment.isLocal ? () => removeManualAssignment(assignment.id) : undefined}
                    />
                  ))}
                  
                  {/* Always show Add Manual button at bottom of list */}
                  {!showAddManual ? (
                    <button
                      onClick={() => setShowAddManual(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-purple-300 bg-purple-50/30 px-4 py-3 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-50 hover:border-purple-400 dark:border-purple-700 dark:bg-purple-900/10 dark:text-purple-300 dark:hover:bg-purple-900/20"
                    >
                      <Plus className="h-4 w-4" />
                      Add Manual Assignment
                    </button>
                  ) : (
                    <div className="rounded-lg border border-purple-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Match #</label>
                          <input
                            type="text"
                            value={newManualMatch}
                            onChange={(e) => setNewManualMatch(e.target.value)}
                            placeholder="e.g., 1"
                            className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Team # (optional)</label>
                          <input
                            type="text"
                            value={newManualTeam}
                            onChange={(e) => setNewManualTeam(e.target.value)}
                            placeholder="e.g., 254"
                            className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Role</label>
                          <select
                            value={newManualRole}
                            onChange={(e) => setNewManualRole(e.target.value as 'scout' | 'super_scout')}
                            className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                          >
                            <option value="scout">Scout</option>
                            <option value="super_scout">Super Scout</option>
                          </select>
                        </div>
                        {newManualRole === 'super_scout' && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Alliance</label>
                            <select
                              value={newManualAlliance}
                              onChange={(e) => setNewManualAlliance(e.target.value as 'red' | 'blue')}
                              className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                            >
                              <option value="red">Red</option>
                              <option value="blue">Blue</option>
                            </select>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => {
                            setShowAddManual(false);
                            setNewManualMatch('');
                            setNewManualTeam('');
                          }}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={addManualAssignment}
                          disabled={!newManualMatch.trim()}
                          className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Completed Assignments */}
            <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Completed</h2>
                <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  {completedCount}
                </span>
              </div>

              {completedAssignments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-8 text-center text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-slate-400">
                  No completed assignments yet
                </div>
              ) : (
                <div className="space-y-3">
                  {completedAssignments.map((assignment) => (
                    <AssignmentCard key={assignment.id} assignment={assignment} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  selectable,
  selected,
  onToggle,
  onDelete,
}: {
  assignment: AssignmentWithTeam;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  const isScout = assignment.role === 'scout';
  const isRed = assignment.alliance === 'red' || assignment.position?.startsWith('red');
  const isBlue = assignment.alliance === 'blue' || assignment.position?.startsWith('blue');

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${
        selectable ? 'cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-900/10' : ''
      } ${selected ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-zinc-700'} ${
        isRed ? 'border-l-4 border-l-red-400' : isBlue ? 'border-l-4 border-l-blue-400' : ''
      }`}
      onClick={selectable ? onToggle : undefined}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
          className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              isScout
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
            }`}
          >
            {isScout ? 'Scout' : 'Super'}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              assignment.status === 'completed'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {assignment.status}
          </span>
          {assignment.isLocal && (
            <span className="rounded px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Local
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
          {assignment.teamNumber ? `Team ${assignment.teamNumber}` : 'Team TBD'}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Match {assignment.matchNumber}</span>
          {(assignment.position || assignment.alliance) && (
            <span className={`font-medium ${isRed ? 'text-red-600' : isBlue ? 'text-blue-600' : ''}`}>
              {assignment.position?.replace('_', ' ') || assignment.alliance}
            </span>
          )}
        </div>
      </div>
      {onDelete && assignment.isLocal && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function getDoc(ref: any) {
  // Helper to avoid import issues
  return import('firebase/firestore').then((m) => m.getDoc(ref));
}
