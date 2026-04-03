'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Clock, ClipboardList, Edit3, Eye, Plus, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDocsFromServer, query, where, doc, getDoc, getDocFromServer, setDoc, onSnapshot, addDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

type ManualAssignment = {
  id: string;
  matchNumber: string;
  teamNumber?: string;
  role: 'scout' | 'super_scout';
  alliance?: 'red' | 'blue';
  status: 'pending' | 'completed';
  isLocal: boolean;
};

export default function Dashboard() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentData, setAssignmentData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentYear, setCurrentYear] = useState('2026');
  const [currentRegional, setCurrentRegional] = useState('casnv');
  const [manualAssignments, setManualAssignments] = useState<ManualAssignment[]>([]);
  const [quickMatchScout, setQuickMatchScout] = useState('');
  const [quickTeamScout, setQuickTeamScout] = useState('');
  const [quickMatchSuper, setQuickMatchSuper] = useState('');
  const [quickAllianceSuper, setQuickAllianceSuper] = useState<'red' | 'blue'>('red');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  
  const { user, isAuthChecking, isApproved, role, isOfflineMode } = useAuth();
  const router = useRouter();

  // Load manual assignments from localStorage
  useEffect(() => {
    if (!user) return;
    const key = `manual-assignments-${user.uid || 'guest'}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setManualAssignments(JSON.parse(stored));
      } catch {
        setManualAssignments([]);
      }
    }
  }, [user]);

  // Save manual assignments to localStorage
  useEffect(() => {
    if (!user) return;
    const key = `manual-assignments-${user.uid || 'guest'}`;
    localStorage.setItem(key, JSON.stringify(manualAssignments));
  }, [manualAssignments, user]);

  const addQuickAssignment = (roleType: 'scout' | 'super_scout') => {
    if (roleType === 'scout') {
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

  const handleSyncAssignments = async () => {
    if (manualAssignments.length === 0 || !user) return;
    setIsSyncing(true);
    setSyncMessage('');
    
    try {
      const assignmentsRef = collection(db, `years/${currentYear}/assignments`);
      for (const assignment of manualAssignments) {
        await addDoc(assignmentsRef, {
          userId: user.uid,
          matchNumber: assignment.matchNumber,
          teamNumber: assignment.teamNumber,
          role: assignment.role,
          alliance: assignment.alliance,
          status: 'pending',
          createdAt: new Date().toISOString(),
          year: currentYear,
          regional: currentRegional,
        });
      }
      setManualAssignments([]);
      setSyncMessage(`Synced ${manualAssignments.length} assignments successfully!`);
      setTimeout(() => setSyncMessage(''), 3000);
    } catch (err) {
      console.error('Error syncing assignments:', err);
      setSyncMessage('Failed to sync. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchSettings = useCallback(async () => {
    try {
      const settingsDoc = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.year) setCurrentYear(data.year);
        if (data.regional) setCurrentRegional(data.regional);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  }, []);

  // Real-time listener for assignments - fetch server-first then listen
  useEffect(() => {
    if (!user || !isApproved) return;

    let unsubscribe: (() => void) | undefined;

    const processAssignments = async (fetchedAssignments: any[]) => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_TBA_API_KEY;
        const settingsDoc = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
        const regionalCode = settingsDoc.exists() ? (settingsDoc.data() as any)?.regionalCode : '';

        // Fetch match teams data
        const matchTeamsSnapshot = await getDocsFromServer(collection(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`));
        const matchTeamsMap: Record<string, { red?: string[]; blue?: string[] }> = {};
        matchTeamsSnapshot.docs.forEach((d) => {
          const data = d.data() as any;
          const matchNum = String(data.matchNumber || '');
          if (matchNum) {
            if (!matchTeamsMap[matchNum]) {
              matchTeamsMap[matchNum] = {};
            }
            if (data.alliance === 'red' || d.id.includes('red')) {
              matchTeamsMap[matchNum].red = data.teams || [];
            } else if (data.alliance === 'blue' || d.id.includes('blue')) {
              matchTeamsMap[matchNum].blue = data.teams || [];
            }
          }
        });

        const normalizedAssignments = await Promise.all(fetchedAssignments.filter((assignment) => {
          if (!(assignment.role === 'scout' || assignment.role === 'super_scout')) {
            return false;
          }

          const assignmentRegional = String(
            assignment.regional || (assignment.type === 'practice' ? 'practice' : '')
          ).toLowerCase();
          const selectedRegional = String(currentRegional || '').toLowerCase();

          if (selectedRegional === 'practice') {
            return assignmentRegional === 'practice' || assignment.type === 'practice';
          }

          return assignmentRegional === selectedRegional;
        }).map(async (assignment) => {
          // Add team number for scout assignments
          if (assignment.role === 'scout' && assignment.position) {
            const matchNum = String(assignment.matchNumber || '');
            let teams = matchTeamsMap[matchNum];
            
            // If not in cache, try fetching from Blue Alliance
            if (!teams && apiKey && regionalCode) {
              try {
                const matchNumInt = parseInt(matchNum, 10);
                const matchKeyFormats = [
                  `${regionalCode}_qm${matchNum}`,
                  `${regionalCode}_qm${matchNumInt.toString().padStart(2, '0')}`,
                  `${regionalCode}_qm${matchNumInt.toString().padStart(3, '0')}`,
                ];
                
                for (const matchKey of matchKeyFormats) {
                  try {
                    const response = await fetch(`https://www.thebluealliance.com/api/v3/match/${matchKey}/simple`, {
                      headers: { 'X-TBA-Auth-Key': apiKey },
                    });

                    if (response.ok) {
                      const matchData = await response.json();
                      const redTeams = (matchData?.alliances?.red?.team_keys || []).map((t: string) => t.replace(/^frc/, ''));
                      const blueTeams = (matchData?.alliances?.blue?.team_keys || []).map((t: string) => t.replace(/^frc/, ''));
                      if (redTeams.length > 0 || blueTeams.length > 0) {
                        teams = { red: redTeams, blue: blueTeams };
                        break;
                      }
                    }
                  } catch {
                    // Continue to next format
                  }
                }
              } catch {
                // TBA fetch failed, continue without teams
              }
            }
            
            if (teams && assignment.position) {
              const posMatch = assignment.position.match(/_(\d)$/);
              if (posMatch) {
                const posIndex = parseInt(posMatch[1], 10) - 1;
                if (assignment.position.startsWith('red') && teams.red?.[posIndex]) {
                  assignment.teamNumber = teams.red[posIndex];
                } else if (assignment.position.startsWith('blue') && teams.blue?.[posIndex]) {
                  assignment.teamNumber = teams.blue[posIndex];
                }
              }
            }
          }
          return assignment;
        }));
        
        // Sort by match number
        normalizedAssignments.sort((a, b) => {
          const matchA = parseInt(String(a.matchNumber || '0'), 10) || 0;
          const matchB = parseInt(String(b.matchNumber || '0'), 10) || 0;
          if (matchA !== matchB) return matchA - matchB;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        setAssignments(normalizedAssignments);
        setIsLoading(false);
      } catch (err) {
        console.error('Error processing assignments:', err);
        setIsLoading(false);
      }
    };

    const setupListener = async () => {
      setIsLoading(true);

      const assignmentsRef = collection(db, `years/${currentYear}/assignments`);
      const q = query(assignmentsRef, where('userId', '==', user.uid));

      // First fetch from server
      try {
        const snapshot = await getDocsFromServer(q);
        const fetchedAssignments: any[] = [];
        snapshot.forEach((d) => {
          fetchedAssignments.push({ id: d.id, ...d.data() });
        });
        await processAssignments(fetchedAssignments);
      } catch (error) {
        console.error('Error fetching assignments from server:', error);
        setIsLoading(false);
      }

      // Then set up listener for updates
      unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, async (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          const fetchedAssignments: any[] = [];
          snapshot.forEach((d) => {
            fetchedAssignments.push({ id: d.id, ...d.data() });
          });
          await processAssignments(fetchedAssignments);
        }
      }, (error) => {
        console.error('Error listening to assignments:', error);
        setError('Failed to load assignments.');
        setIsLoading(false);
      });
    };

    setupListener();

    return () => unsubscribe?.();
  }, [currentRegional, currentYear, user, isApproved]);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [user, isAuthChecking, router]);

  useEffect(() => {
    if (!isAuthChecking && isApproved) {
      fetchSettings();
    }
  }, [isAuthChecking, isApproved, fetchSettings]);

  if (isAuthChecking) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4">
        <Clock className="h-16 w-16 text-purple-600 mb-6" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">Account Pending Approval</h1>
        <p className="text-gray-600 text-center max-w-md">
          Your account has been created successfully, but it needs to be approved by an administrator before you can access the scouting dashboard.
        </p>
      </div>
    );
  }

  const roleDisplay = role === 'super_scout' ? 'Super Scout' : role === 'admin' ? 'Admin' : 'Scout';

  const sortedAssignments = [...assignments].sort((a, b) => {
    const matchA = parseInt(String(a.matchNumber || '0'), 10) || 0;
    const matchB = parseInt(String(b.matchNumber || '0'), 10) || 0;
    if (matchA !== matchB) return matchA - matchB;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const assignmentShifts: Array<{ id: string; startMatch: number; endMatch: number; label: string; assignments: any[] }> = [];
  sortedAssignments.forEach((assignment) => {
    const matchNumber = parseInt(String(assignment.matchNumber || '0'), 10) || 0;
    const lastShift = assignmentShifts[assignmentShifts.length - 1];

    const canAppend =
      Boolean(lastShift) &&
      (
        matchNumber === lastShift.endMatch ||
        (lastShift.endMatch > 0 && matchNumber > 0 && matchNumber === lastShift.endMatch + 1)
      );

    if (!canAppend) {
      assignmentShifts.push({
        id: `shift_${assignmentShifts.length + 1}_${matchNumber}`,
        startMatch: matchNumber,
        endMatch: matchNumber,
        label: '',
        assignments: [assignment]
      });
    } else {
      if (matchNumber > lastShift.endMatch) {
        lastShift.endMatch = matchNumber;
      }

      lastShift.assignments.push(assignment);
    }
  });

  let numberedShift = 1;
  assignmentShifts.forEach((shift) => {
    if (shift.startMatch === shift.endMatch) {
      shift.label = `Shift ${numberedShift}: Match ${shift.startMatch}`;
    } else {
      shift.label = `Shift ${numberedShift}: Match ${shift.startMatch}-${shift.endMatch}`;
    }
    numberedShift += 1;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">Welcome back, {roleDisplay}.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Offline/Online Toggle */}
          <button
            onClick={() => {
              if (isOfflineMode) {
                localStorage.removeItem('offline-mode');
                window.location.reload();
              } else {
                localStorage.setItem('offline-mode', 'true');
                window.location.reload();
              }
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              isOfflineMode 
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300' 
                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
            }`}
          >
            {isOfflineMode ? <WifiOff className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
            {isOfflineMode ? 'Offline Mode' : 'Online Mode'}
          </button>
          
          {manualAssignments.length > 0 && (
            <button
              onClick={handleSyncAssignments}
              disabled={isSyncing || isOfflineMode}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-700 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            >
              {isSyncing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              Sync {manualAssignments.length} Local
            </button>
          )}
        </div>
      </div>

      {/* Quick Add Assignments */}
      <div className="mb-8 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="mb-4 flex items-center gap-3">
          <Plus className="h-5 w-5 text-emerald-600" />
          <h2 className="text-xl font-black text-purple-950 dark:text-white">Quick Add Assignments</h2>
          {manualAssignments.length > 0 && (
            <span className="ml-auto rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              {manualAssignments.length} local
            </span>
          )}
        </div>

        {syncMessage && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200">
            {syncMessage}
          </div>
        )}

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

      <div className="space-y-8">
        {/* Assignments Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">Scout and Super Scout Assignments</h2>
          </div>
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
              <p className="text-gray-500 dark:text-zinc-400">Loading assignments...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-red-800 font-medium mb-1">Error</h3>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          ) : assignments.length === 0 && manualAssignments.length === 0 ? (
            <div className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-8 text-center">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">No Assignments</h3>
              <p className="text-gray-500 dark:text-zinc-400 mt-2">You don&apos;t have any pending assignments right now.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Manual Assignments - Show First */}
              {manualAssignments.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs dark:bg-emerald-900/40">LOCAL</span>
                    Manual Assignments ({manualAssignments.length})
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {manualAssignments.map((assignment) => (
                      <div key={assignment.id} className="bg-white dark:bg-zinc-900 border-2 border-emerald-200 dark:border-emerald-800 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            {assignment.role === 'super_scout' ? (
                              <h3 className={`text-2xl font-bold capitalize ${assignment.alliance === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                                {assignment.alliance} Alliance
                              </h3>
                            ) : (
                              <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-300">Team {assignment.teamNumber}</h3>
                            )}
                            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Match {assignment.matchNumber}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Local
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-300 mb-4">
                          {assignment.role === 'super_scout' ? 'Super Scout' : 'Scout'}
                        </p>
                        {assignment.role === 'super_scout' ? (
                          <Link 
                            href={`/matches/${assignment.matchNumber}/${assignment.alliance}/super-scout`}
                            className="block text-center w-full py-2 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            Start Super Scouting
                          </Link>
                        ) : (
                          <Link
                            href={`/scout?year=${currentYear}&regional=${currentRegional}&match=${encodeURIComponent(String(assignment.matchNumber))}&team=${encodeURIComponent(String(assignment.teamNumber || ''))}`}
                            className="block text-center w-full py-2 rounded-md text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            Start Scouting
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Assignments */}
              {assignmentShifts.map((shift) => (
                <div key={shift.id}>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-zinc-200 mb-3">{shift.label}</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {shift.assignments.map((assignment) => (
                      <div key={assignment.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            {assignment.role === 'super_scout' ? (
                              <h3 className={`text-2xl font-bold capitalize ${assignment.alliance === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                                {assignment.alliance} Alliance
                              </h3>
                            ) : (
                              <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-300">Team {assignment.teamNumber}</h3>
                            )}
                            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Match {assignment.matchNumber}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            assignment.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {assignment.status === 'completed' ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-300 mb-4">
                          {assignment.role === 'super_scout' ? 'Super Scout' : 'Scout'}
                        </p>
                        {assignment.role === 'super_scout' ? (
                          <Link 
                            href={`/matches/${assignment.matchNumber}/${assignment.alliance}/super-scout`}
                            className={`block text-center w-full py-2 rounded-md text-sm font-medium transition-colors ${assignmentData[assignment.id] ? 'inline-flex items-center justify-center gap-2 border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200 dark:hover:bg-zinc-800' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                          >
                            {assignmentData[assignment.id] ? (
                              <><Edit3 className="h-4 w-4" />Edit Report</>
                            ) : 'Start Super Scouting'}
                          </Link>
                        ) : (
                          <div>
                            {/* Data Preview */}
                            {assignmentData[assignment.id] && (
                              <div className="mb-3 rounded-md bg-purple-50/50 dark:bg-zinc-800/50 p-2 text-xs space-y-1">
                                <DataPreviewRow label="Auto" value={assignmentData[assignment.id]['Auto Scoring Rating']} />
                                <DataPreviewRow label="Driver" value={assignmentData[assignment.id]['Driver Rating']} />
                                <DataPreviewRow label="Overall" value={assignmentData[assignment.id]['Overall Match Impact']} />
                                <DataPreviewRow label="Climb" value={assignmentData[assignment.id]['Climb Level']} />
                              </div>
                            )}
                            <Link
                              href={`/scout?year=${encodeURIComponent(String(assignment.year || currentYear))}&regional=${encodeURIComponent(String(assignment.regional || (assignment.type === 'practice' ? 'practice' : currentRegional)))}${Number(assignment.matchNumber) > 0 ? `&match=${encodeURIComponent(String(assignment.matchNumber))}` : ''}${Number(assignment.teamNumber) > 0 ? `&team=${encodeURIComponent(String(assignment.teamNumber))}` : ''}`}
                              className={`block text-center w-full py-2 rounded-md text-sm font-medium transition-colors ${assignmentData[assignment.id] ? 'inline-flex items-center justify-center gap-2 border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200 dark:hover:bg-zinc-800' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                            >
                              {assignmentData[assignment.id] ? (
                                <><Edit3 className="h-4 w-4" />Edit Data</>
                              ) : 'Start Scouting'}
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function DataPreviewRow({ label, value }: { label: string; value: any }) {
  const displayValue = value !== undefined && value !== null && value !== '' ? value : '-';
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-zinc-400">{label}:</span>
      <span className="font-medium text-purple-900 dark:text-purple-200">{displayValue}</span>
    </div>
  );
}
