'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, deleteDoc, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { 
  Loader2, Calendar, CheckCircle, Clock, ArrowRightLeft, 
  Users, ArrowRight, X, ChevronDown, ChevronUp, Shield
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

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

type AssignmentWithTeam = Assignment & {
  teamNumber?: string;
};

export default function AssignmentsPage() {
  const router = useRouter();
  const { user, isAuthChecking, isAdmin } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [myAssignments, setMyAssignments] = useState<AssignmentWithTeam[]>([]);
  const [matchTeams, setMatchTeams] = useState<Record<string, MatchTeams>>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedTransferAssignments, setSelectedTransferAssignments] = useState<Set<string>>(new Set());
  const [selectedTransferUser, setSelectedTransferUser] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferUI, setShowTransferUI] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [year, setYear] = useState('2026');

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

  const loadMyAssignments = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Get current event settings
      const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
      const settings = settingsDoc.data() as any;
      const currentYear = String(settings?.year || '2026');
      const currentRegional = String(settings?.regional || 'practice');
      setYear(currentYear);

      // Load match teams data
      const matchTeamsSnapshot = await getDocs(collection(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`));
      const matchTeamsMap: Record<string, MatchTeams> = {};
      matchTeamsSnapshot.docs.forEach((doc) => {
        const data = doc.data() as any;
        const matchNum = String(data.matchNumber || '');
        if (matchNum) {
          if (!matchTeamsMap[matchNum]) {
            matchTeamsMap[matchNum] = { matchNumber: matchNum, red: [], blue: [] };
          }
          if (data.alliance === 'red' || doc.id.includes('red')) {
            matchTeamsMap[matchNum].red = data.teams || [];
          } else if (data.alliance === 'blue' || doc.id.includes('blue')) {
            matchTeamsMap[matchNum].blue = data.teams || [];
          }
        }
      });
      setMatchTeams(matchTeamsMap);

      // Load my assignments with team numbers
      const assignmentsQuery = query(
        collection(db, `years/${currentYear}/assignments`),
        where('userId', '==', user.uid)
      );
      const assignmentsSnap = await getDocs(assignmentsQuery);
      const assignments: AssignmentWithTeam[] = assignmentsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as Assignment))
        .map((assignment) => {
          const matchNum = String(assignment.matchNumber || '');
          const teams = matchTeamsMap[matchNum];
          let teamNumber: string | undefined;
          
          if (teams && assignment.position) {
            // Extract position index (e.g., "red_1" -> 0)
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

      // Load all approved users for transfer
      const usersSnap = await getDocs(collection(db, 'users'));
      const users = usersSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as User))
        .filter((u) => u.approved && u.id !== user.uid)
        .sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
      setAllUsers(users);
    } catch (e) {
      console.error('Error loading assignments:', e);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadMyAssignments();
    }
  }, [user, loadMyAssignments]);

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
      await loadMyAssignments();
    } catch (err: any) {
      setError(err?.message || 'Failed to transfer assignments');
    } finally {
      setIsTransferring(false);
    }
  };

  // Group assignments by status
  const pendingAssignments = useMemo(
    () => myAssignments.filter((a) => a.status === 'pending'),
    [myAssignments]
  );
  const completedAssignments = useMemo(
    () => myAssignments.filter((a) => a.status === 'completed'),
    [myAssignments]
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
            <h1 className="mt-3 text-3xl font-black text-white">Your Schedule</h1>
            <p className="mt-2 max-w-2xl text-sm text-purple-100">
              View your scouting assignments and transfer them if needed.
            </p>
          </div>
          <div className="flex items-start gap-2">
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

              {pendingAssignments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-8 text-center text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-slate-400">
                  No pending assignments
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
                    />
                  ))}
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

          {/* Transfer Section - Right Column */}
          <div className="flex flex-col gap-6">
            <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center gap-3">
                <ArrowRightLeft className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Transfer Assignments</h2>
              </div>

              <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                Need to step away? Transfer your pending assignments to another scout.
              </p>

              {pendingCount === 0 ? (
                <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-6 text-center text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-slate-400">
                  No assignments to transfer
                </div>
              ) : !showTransferUI ? (
                <button
                  type="button"
                  onClick={() => setShowTransferUI(true)}
                  disabled={selectedTransferAssignments.size === 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Transfer Selected ({selectedTransferAssignments.size})
                </button>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <span className="mb-1.5 block">Transfer To</span>
                    <select
                      value={selectedTransferUser}
                      onChange={(e) => setSelectedTransferUser(e.target.value)}
                      className="w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                    >
                      <option value="">Select a scout...</option>
                      {allUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.email || u.id}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowTransferUI(false);
                        setSelectedTransferUser('');
                      }}
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleTransferAssignments}
                      disabled={!selectedTransferUser || isTransferring}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                    >
                      {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Transfer
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <h3 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Quick Actions</h3>
              <div className="space-y-2">
                <Link
                  href="/scout"
                  className="flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm font-semibold text-purple-800 transition-colors hover:bg-purple-100 dark:border-purple-700 dark:bg-purple-900/20 dark:text-purple-200 dark:hover:bg-purple-900/30"
                >
                  <span>Start Scouting</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/dashboard"
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200 dark:hover:bg-zinc-800"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
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
}: {
  assignment: AssignmentWithTeam;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
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
    </div>
  );
}

function getDoc(ref: any) {
  // Helper to avoid import issues
  return import('firebase/firestore').then((m) => m.getDoc(ref));
}
