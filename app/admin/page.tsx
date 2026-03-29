'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { 
  Loader2, Plus, Save, Trash2, Search, Users, Calendar, Filter, X, ChevronDown, ChevronUp, 
  Shield, BarChart3, CheckCircle, Clock, UserCheck, Settings, ArrowRightLeft, ArrowRight 
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';

type User = {
  id: string;
  email?: string;
  name?: string;
  role?: 'pending' | 'user' | 'admin';
  approved?: boolean;
  createdAt?: string;
  photoURL?: string;
};

type RegionalOption = {
  code: string;
  name: string;
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

export default function AdminPage() {
  const router = useRouter();
  const { user, isAuthChecking, isAdmin } = useAuth();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Event settings
  const [year, setYear] = useState('2026');
  const [regional, setRegional] = useState('practice');
  const [regionalCode, setRegionalCode] = useState('');
  const [newRegional, setNewRegional] = useState('');
  const [years, setYears] = useState<string[]>([]);
  const [regionals, setRegionals] = useState<RegionalOption[]>([]);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignmentRole, setAssignmentRole] = useState<'scout' | 'super_scout'>('scout');
  const [assignPosition, setAssignPosition] = useState('red_1');
  const [assignAlliance, setAssignAlliance] = useState('red');
  const [assignMatch, setAssignMatch] = useState('');
  
  // View and filter states
  const [viewMode, setViewMode] = useState<'by-user' | 'by-match'>('by-user');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'scout' | 'super_scout'>('all');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedMatches, setExpandedMatches] = useState<Set<string>>(new Set());
  
  // Bulk delete state
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Transfer state (for admins)
  const [transferAssignments, setTransferAssignments] = useState<Assignment[]>([]);
  const [selectedTransferAssignments, setSelectedTransferAssignments] = useState<Set<string>>(new Set());
  const [selectedTransferUser, setSelectedTransferUser] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferUI, setShowTransferUI] = useState(false);
  const [transferFilter, setTransferFilter] = useState<'all' | 'pending'>('pending');

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    } else if (!isAuthChecking && user && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isAuthChecking, router, user]);

  const ensurePracticeRegional = useCallback(async (selectedYear: string) => {
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, 'years', selectedYear), { year: Number(selectedYear) || selectedYear, updatedAt: nowIso }, { merge: true });
    await setDoc(doc(db, `years/${selectedYear}/regionals`, 'practice'), {
      code: 'practice',
      name: 'Practice',
      updatedAt: nowIso,
    }, { merge: true });
  }, []);

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    const snapshot = await getDocs(collection(db, 'users'));
    const nextUsers = snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as any) }))
      .sort((a: any, b: any) => Number(Boolean(a.approved)) - Number(Boolean(b.approved)) || String(a.email || '').localeCompare(String(b.email || '')));
    setUsers(nextUsers);
    setIsLoadingUsers(false);
  }, []);

  const loadYears = useCallback(async () => {
    const snapshot = await getDocs(collection(db, 'years'));
    const nextYears = snapshot.docs.map((entry) => entry.id).sort((a, b) => b.localeCompare(a));
    const fallbackYears = nextYears.length > 0 ? nextYears : ['2026'];
    setYears(fallbackYears);
    if (!fallbackYears.includes(year)) {
      setYear(fallbackYears[0]);
    }
  }, [year]);

  const loadRegionals = useCallback(async (selectedYear: string) => {
    await ensurePracticeRegional(selectedYear);
    const snapshot = await getDocs(collection(db, `years/${selectedYear}/regionals`));
    const nextRegionals = snapshot.docs
      .map((entry) => ({ code: entry.id, name: String((entry.data() as any).name || entry.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setRegionals(nextRegionals);
  }, [ensurePracticeRegional]);

  const loadAssignments = useCallback(async () => {
    const snapshot = await getDocs(collection(db, `years/${year}/assignments`));
    const nextAssignments = snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as any) }))
      .filter((a: any) => a.regional === regional || a.year === year)
      .sort((a: any, b: any) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
    setAssignments(nextAssignments);
  }, [year, regional]);

  const loadCurrentEvent = useCallback(async () => {
    const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      setYear(String(data.year || '2026'));
      setRegional(String(data.regional || 'practice'));
      setRegionalCode(String(data.regionalCode || ''));
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadYears();
      loadCurrentEvent();
    }
  }, [isAdmin, loadUsers, loadYears, loadCurrentEvent]);

  useEffect(() => {
    if (isAdmin && year) {
      loadRegionals(year);
      loadAssignments();
    }
  }, [isAdmin, year, regional, loadRegionals, loadAssignments]);

  // Load transfer assignments
  const loadTransferAssignments = useCallback(async () => {
    const snapshot = await getDocs(collection(db, `years/${year}/assignments`));
    const allAssignments = snapshot.docs
      .map((entry) => ({ id: entry.id, ...(entry.data() as any) }))
      .sort((a: any, b: any) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
    setTransferAssignments(allAssignments);
  }, [year]);

  useEffect(() => {
    if (isAdmin && year) {
      loadTransferAssignments();
    }
  }, [isAdmin, year, loadTransferAssignments]);

  const handleSaveEvent = async () => {
    setIsSavingEvent(true);
    setError('');
    setMessage('');
    try {
      await ensurePracticeRegional(year);
      
      const trimmedRegionalCode = regionalCode.trim().toLowerCase();
      if (!trimmedRegionalCode && regional === 'practice') {
        throw new Error('Practice regionals require a valid regional code');
      }
      
      const normalizedRegional = regional === 'practice' ? 'practice' : regional;
      const normalizedRegionalCode = trimmedRegionalCode || `${year}${normalizedRegional}`;

      await setDoc(
        doc(db, 'settings', 'currentEvent'),
        {
          regionalCode: normalizedRegionalCode,
          year,
          regional: normalizedRegional,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setMessage('Event settings saved');
    } catch (err: any) {
      setError(err?.message || 'Failed to save event settings');
    } finally {
      setIsSavingEvent(false);
    }
  };

  const handleAddRegional = async () => {
    const code = newRegional.trim().toLowerCase();
    if (!code) return;
    await ensurePracticeRegional(year);
    await setDoc(doc(db, `years/${year}/regionals`, code), {
      code,
      name: code.toUpperCase(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    setNewRegional('');
    setRegional(code);
    await loadRegionals(year);
  };

  const handleCreateAssignment = async () => {
    if (!selectedUserId || !assignMatch) return;
    setIsSavingAssignment(true);
    setError('');
    setMessage('');
    try {
      const targetUser = users.find((u) => u.id === selectedUserId);
      if (!targetUser) throw new Error('Target user not found');

      // Parse match range (e.g., "1-5" or "1,3,5" or just "5")
      const matchNumbers = parseMatchRange(assignMatch);
      if (matchNumbers.length === 0) throw new Error('Invalid match number format');

      const assignmentsToCreate: Omit<Assignment, 'id'>[] = matchNumbers.map((matchNum) => ({
        userId: selectedUserId,
        userName: targetUser?.name || targetUser?.email || '',
        userEmail: targetUser?.email || '',
        role: assignmentRole,
        matchNumber: String(matchNum),
        position: assignmentRole === 'scout' ? assignPosition : undefined,
        alliance: assignmentRole === 'super_scout' ? assignAlliance : undefined,
        status: 'pending',
        regional,
        year,
      }));

      await Promise.all(
        assignmentsToCreate.map((assignmentData) =>
          addDoc(collection(db, `years/${year}/assignments`), assignmentData)
        )
      );

      setMessage(`Created ${assignmentsToCreate.length} assignment(s)`);
      setAssignMatch('');
      await loadAssignments();
      await loadTransferAssignments();
    } catch (err: any) {
      setError(err?.message || 'Failed to create assignment');
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    await deleteDoc(doc(db, `years/${year}/assignments`, assignmentId));
    await loadAssignments();
    await loadTransferAssignments();
  };

  const handleBulkDelete = async () => {
    if (selectedForDelete.size === 0) return;
    setIsBulkDeleting(true);
    setError('');
    setMessage('');
    try {
      await Promise.all(
        Array.from(selectedForDelete).map((id) =>
          deleteDoc(doc(db, `years/${year}/assignments`, id))
        )
      );
      setMessage(`Deleted ${selectedForDelete.size} assignment(s)`);
      setSelectedForDelete(new Set());
      await loadAssignments();
      await loadTransferAssignments();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete assignments');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    await updateDoc(doc(db, 'users', userId), updates as any);
    setUsers((current) => current.map((entry) => (entry.id === userId ? { ...entry, ...updates } : entry)));
  };

  const handleDeleteUser = async (entry: User) => {
    await deleteDoc(doc(db, 'users', entry.id));
    // Delete user's assignments
    const yearsSnapshot = await getDocs(collection(db, 'years'));
    await Promise.all(yearsSnapshot.docs.map(async (yearDoc) => {
      const yearId = yearDoc.id;
      const assignmentsSnapshot = await getDocs(query(collection(db, `years/${yearId}/assignments`), where('userId', '==', entry.id)));
      await Promise.all(assignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(doc(db, `years/${yearId}/assignments`, assignmentDoc.id))));
    }));
    setUsers((current) => current.filter((userEntry) => userEntry.id !== entry.id));
  };

  const handleTransferAssignments = async () => {
    if (!selectedTransferUser || selectedTransferAssignments.size === 0) return;
    setIsTransferring(true);
    setError('');
    setMessage('');
    try {
      const targetUser = users.find(u => u.id === selectedTransferUser);
      if (!targetUser) throw new Error('Target user not found');
      
      const assignmentsToTransfer = transferAssignments.filter(a => selectedTransferAssignments.has(a.id));
      
      await Promise.all(assignmentsToTransfer.map(async (assignment) => {
        await updateDoc(doc(db, `years/${year}/assignments`, assignment.id), {
          userId: selectedTransferUser,
          userName: targetUser.name || targetUser.email || '',
          userEmail: targetUser.email || '',
          updatedAt: new Date().toISOString(),
        });
      }));
      
      setMessage(`Transferred ${assignmentsToTransfer.length} assignment(s) to ${targetUser.name || targetUser.email}`);
      setSelectedTransferAssignments(new Set());
      setShowTransferUI(false);
      setSelectedTransferUser('');
      await loadAssignments();
      await loadTransferAssignments();
    } catch (err: any) {
      setError(err?.message || 'Failed to transfer assignments');
    } finally {
      setIsTransferring(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const total = assignments.length;
    const pending = assignments.filter((a) => a.status === 'pending').length;
    const completed = assignments.filter((a) => a.status === 'completed').length;
    const scouts = new Set(assignments.map((a) => a.userId)).size;
    return { total, pending, completed, scouts };
  }, [assignments]);

  const pendingCount = useMemo(() => users.filter((entry) => !entry.approved).length, [users]);

  // Filtered assignments for display
  const filteredAssignments = useMemo(() => {
    return assignments
      .filter((a) => {
        if (statusFilter !== 'all' && a.status !== statusFilter) return false;
        if (roleFilter !== 'all' && a.role !== roleFilter) return false;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesUser = (a.userName || a.userEmail || '').toLowerCase().includes(query);
          const matchesMatch = String(a.matchNumber).includes(query);
          if (!matchesUser && !matchesMatch) return false;
        }
        return true;
      })
      .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
  }, [assignments, statusFilter, roleFilter, searchQuery]);

  // Group by user or match
  const groupedByUser = useMemo(() => {
    const grouped: Record<string, Assignment[]> = {};
    filteredAssignments.forEach((a) => {
      if (!grouped[a.userId]) grouped[a.userId] = [];
      grouped[a.userId].push(a);
    });
    return grouped;
  }, [filteredAssignments]);

  const groupedByMatch = useMemo(() => {
    const grouped: Record<string, Assignment[]> = {};
    filteredAssignments.forEach((a) => {
      if (!grouped[a.matchNumber]) grouped[a.matchNumber] = [];
      grouped[a.matchNumber].push(a);
    });
    return grouped;
  }, [filteredAssignments]);

  // Transfer assignments filtered
  const filteredTransferAssignments = useMemo(() => {
    return transferAssignments.filter(a => {
      if (transferFilter === 'pending' && a.status !== 'pending') return false;
      return true;
    });
  }, [transferAssignments, transferFilter]);

  const toggleExpandUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleExpandMatch = (matchNumber: string) => {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      if (next.has(matchNumber)) next.delete(matchNumber);
      else next.add(matchNumber);
      return next;
    });
  };

  if (isAuthChecking || (!user && !isAdmin)) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const currentEventCode = regional === 'practice' ? 'practice' : `${year}${regional}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="rounded-2xl border border-purple-200/70 bg-gradient-to-r from-purple-600 to-purple-800 p-6 shadow-xl shadow-purple-900/10 dark:border-zinc-800 dark:from-purple-900 dark:to-zinc-900">
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              <Shield className="h-3 w-3" />
              Admin Dashboard
            </div>
            <h1 className="mt-3 text-3xl font-black text-white">Admin Center</h1>
          </div>
          <Link 
            href="/settings" 
            className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/30"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>

      </div>

      {/* Alerts */}
      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">{error}</div> : null}
      {message ? <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200">{message}</div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3 lg:items-stretch">
        {/* Left Column - Event Settings & User Management */}
        <div className="flex flex-col gap-6">
          {/* Event Settings */}
          <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="mb-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-black text-purple-950 dark:text-white">Event Settings</h2>
            </div>

            <div className="space-y-4">
              <Field label="Regional Code">
                <input
                  value={regionalCode}
                  onChange={(e) => setRegionalCode(e.target.value)}
                  className={inputClassName}
                  placeholder={regional === 'practice' ? 'Enter event code (e.g., 2026casv)' : '2026caoec'}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Year">
                  <select value={year} onChange={(e) => setYear(e.target.value)} className={inputClassName}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Field>
                <Field label="Regional">
                  <select value={regional} onChange={(e) => setRegional(e.target.value)} className={inputClassName}>
                    {regionals.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </Field>
              </div>

              <div className="flex gap-3">
                <input value={newRegional} onChange={(e) => setNewRegional(e.target.value)} placeholder="Add regional" className={inputClassName} />
                <button type="button" onClick={handleAddRegional} className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white">
                  Add
                </button>
              </div>

              <button 
                type="button" 
                onClick={handleSaveEvent} 
                disabled={isSavingEvent} 
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
              >
                {isSavingEvent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Event Settings
              </button>
            </div>
          </div>

          {/* User Management */}
          <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Users</h2>
              </div>
              <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                Pending {pendingCount}
              </div>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {users.map((entry) => (
                  <div key={entry.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{entry.name || entry.email || entry.id}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{entry.email}</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs font-bold ${entry.approved ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                        {entry.approved ? 'Approved' : 'Pending'}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        value={entry.name || ''}
                        onChange={(e) => setUsers((current) => current.map((userEntry) => (userEntry.id === entry.id ? { ...userEntry, name: e.target.value } : userEntry)))}
                        onBlur={() => handleUpdateUser(entry.id, { name: entry.name || '' })}
                        className={inputClassName}
                        placeholder="Name"
                      />
                      <select
                        value={entry.role || 'pending'}
                        onChange={(e) => handleUpdateUser(entry.id, { role: e.target.value as 'pending' | 'user' | 'admin' })}
                        className={inputClassName}
                      >
                        <option value="pending">Pending</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleUpdateUser(entry.id, { approved: !entry.approved, role: entry.approved ? entry.role || 'pending' : 'user' })}
                        className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white"
                      >
                        {entry.approved ? 'Revoke' : 'Approve'}
                      </button>
                    </div>

                    {!entry.approved ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteUser(entry)}
                        className="inline-flex items-center gap-2 self-start rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Pending
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Middle Column - Create Assignment & Transfer */}
        <div className="flex flex-col gap-6">
          {/* Create Assignment */}
          <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="mb-4 flex items-center gap-3">
              <Plus className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-black text-purple-950 dark:text-white">Create Assignment</h2>
            </div>

            <div className="space-y-4">
              <Field label="User">
                <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className={inputClassName}>
                  <option value="">Select user...</option>
                  {users.filter(u => u.approved).map((u) => (
                    <option key={u.id} value={u.id}>{u.name || u.email || u.id}</option>
                  ))}
                </select>
              </Field>

              <Field label="Role">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignmentRole('scout')}
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm font-bold ${assignmentRole === 'scout' ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/30 dark:text-purple-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200'}`}
                  >
                    Scout
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignmentRole('super_scout')}
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm font-bold ${assignmentRole === 'super_scout' ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/30 dark:text-purple-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200'}`}
                  >
                    Super Scout
                  </button>
                </div>
              </Field>

              {assignmentRole === 'scout' ? (
                <Field label="Position">
                  <select value={assignPosition} onChange={(e) => setAssignPosition(e.target.value)} className={inputClassName}>
                    <option value="red_1">Red 1</option>
                    <option value="red_2">Red 2</option>
                    <option value="red_3">Red 3</option>
                    <option value="blue_1">Blue 1</option>
                    <option value="blue_2">Blue 2</option>
                    <option value="blue_3">Blue 3</option>
                  </select>
                </Field>
              ) : (
                <Field label="Alliance">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignAlliance('red')}
                      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-bold ${assignAlliance === 'red' ? 'border-red-500 bg-red-100 text-red-900 dark:border-red-400 dark:bg-red-900/30 dark:text-red-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200'}`}
                    >
                      Red Alliance
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignAlliance('blue')}
                      className={`flex-1 rounded-lg border px-4 py-3 text-sm font-bold ${assignAlliance === 'blue' ? 'border-blue-500 bg-blue-100 text-blue-900 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200'}`}
                    >
                      Blue Alliance
                    </button>
                  </div>
                </Field>
              )}

              <Field label="Match Number(s)">
                <input
                  type="text"
                  value={assignMatch}
                  onChange={(e) => setAssignMatch(e.target.value)}
                  placeholder="e.g., 1, 3, 5-10"
                  className={inputClassName}
                />
                <p className="mt-1 text-xs text-slate-500">Use commas for individual matches or dash for ranges (e.g., "1,3,5-10")</p>
              </Field>

              <button
                type="button"
                onClick={handleCreateAssignment}
                disabled={isSavingAssignment || !selectedUserId || !assignMatch}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
              >
                {isSavingAssignment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Assignment
              </button>
            </div>
          </div>

          {/* Transfer Assignments */}
          <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="mb-4 flex items-center gap-3">
              <ArrowRightLeft className="h-5 w-5 text-purple-600" />
              <h2 className="text-xl font-black text-purple-950 dark:text-white">Transfer Assignments</h2>
            </div>
            
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              Transfer assignments between users. Useful for reassigning duties.
            </p>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setTransferFilter('pending')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${transferFilter === 'pending' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200' : 'border border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'}`}
              >
                Pending Only
              </button>
              <button
                type="button"
                onClick={() => setTransferFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${transferFilter === 'all' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200' : 'border border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'}`}
              >
                All Assignments
              </button>
            </div>

            {filteredTransferAssignments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-6 text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-slate-400">
                No assignments available to transfer.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/50 max-h-[200px] overflow-y-auto">
                  <div className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-2">
                    Select assignments to transfer:
                  </div>
                  <div className="space-y-2">
                    {filteredTransferAssignments.map((assignment) => (
                      <label key={assignment.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/50 dark:hover:bg-zinc-900/50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTransferAssignments.has(assignment.id)}
                          onChange={(e) => {
                            const newSet = new Set(selectedTransferAssignments);
                            if (e.target.checked) {
                              newSet.add(assignment.id);
                            } else {
                              newSet.delete(assignment.id);
                            }
                            setSelectedTransferAssignments(newSet);
                          }}
                          className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          Match {assignment.matchNumber} - {assignment.userName || assignment.userEmail || 'Unknown'} ({assignment.role === 'super_scout' ? 'Super' : 'Scout'})
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {!showTransferUI ? (
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
                    <Field label="Transfer To">
                      <select
                        value={selectedTransferUser}
                        onChange={(e) => setSelectedTransferUser(e.target.value)}
                        className={inputClassName}
                      >
                        <option value="">Select user...</option>
                        {users.filter(u => u.approved).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name || u.email || u.id}
                          </option>
                        ))}
                      </select>
                    </Field>
                    
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowTransferUI(false)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200"
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
            )}
          </div>
        </div>

        {/* Right Column - Assignment List */}
        <div className="flex flex-col gap-6">
          <div className="flex-1 rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Assignments</h2>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {currentEventCode}
              </div>
            </div>

            {/* Filters */}
            <div className="mb-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users or matches..."
                  className={`${inputClassName} pl-10`}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={`${inputClassName} w-auto`}>
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)} className={`${inputClassName} w-auto`}>
                  <option value="all">All Roles</option>
                  <option value="scout">Scout</option>
                  <option value="super_scout">Super Scout</option>
                </select>
              </div>
            </div>

            {/* View Toggle */}
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('by-user')}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${viewMode === 'by-user' ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/30 dark:text-purple-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'}`}
              >
                By User
              </button>
              <button
                type="button"
                onClick={() => setViewMode('by-match')}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${viewMode === 'by-match' ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/30 dark:text-purple-100' : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'}`}
              >
                By Match
              </button>
            </div>

            {/* Bulk Delete Toolbar */}
            {selectedForDelete.size > 0 && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/50">
                <span className="text-sm font-bold text-red-700 dark:text-red-200">
                  {selectedForDelete.size} selected
                </span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {isBulkDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete Selected
                </button>
              </div>
            )}

            {/* Assignment List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {filteredAssignments.length === 0 ? (
                <EmptyState />
              ) : viewMode === 'by-user' ? (
                Object.entries(groupedByUser).map(([userId, userAssignments]) => {
                  const userInfo = users.find((u) => u.id === userId);
                  const isExpanded = expandedUsers.has(userId);
                  return (
                    <div key={userId} className="rounded-lg border border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900">
                      <button onClick={() => toggleExpandUser(userId)} className="flex w-full items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{userInfo?.name || userInfo?.email || userId}</span>
                          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">{userAssignments.length}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-slate-200 p-3 dark:border-zinc-700 space-y-2">
                          {userAssignments.map((assignment) => (
                            <AssignmentCard 
                              key={assignment.id} 
                              assignment={assignment} 
                              onDelete={() => handleDeleteAssignment(assignment.id)} 
                              compact 
                              selectable
                              selected={selectedForDelete.has(assignment.id)}
                              onToggle={() => {
                                const newSet = new Set(selectedForDelete);
                                if (newSet.has(assignment.id)) {
                                  newSet.delete(assignment.id);
                                } else {
                                  newSet.add(assignment.id);
                                }
                                setSelectedForDelete(newSet);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                Object.entries(groupedByMatch).map(([matchNumber, matchAssignments]) => {
                  const isExpanded = expandedMatches.has(matchNumber);
                  return (
                    <div key={matchNumber} className="rounded-lg border border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900">
                      <button onClick={() => toggleExpandMatch(matchNumber)} className="flex w-full items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">Match {matchNumber}</span>
                          <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">{matchAssignments.length}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-slate-200 p-3 dark:border-zinc-700 space-y-2">
                          {matchAssignments.map((assignment) => (
                            <AssignmentCard 
                              key={assignment.id} 
                              assignment={assignment} 
                              onDelete={() => handleDeleteAssignment(assignment.id)} 
                              compact 
                              selectable
                              selected={selectedForDelete.has(assignment.id)}
                              onToggle={() => {
                                const newSet = new Set(selectedForDelete);
                                if (newSet.has(assignment.id)) {
                                  newSet.delete(assignment.id);
                                } else {
                                  newSet.add(assignment.id);
                                }
                                setSelectedForDelete(newSet);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentCard({ 
  assignment, 
  onDelete, 
  compact, 
  selectable, 
  selected, 
  onToggle 
}: { 
  assignment: Assignment; 
  onDelete: () => void; 
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const isScout = assignment.role === 'scout';
  const isRed = assignment.alliance === 'red' || assignment.position?.startsWith('red');
  const isBlue = assignment.alliance === 'blue' || assignment.position?.startsWith('blue');

  return (
    <div className={`flex items-center gap-3 rounded-lg border bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 ${isRed ? 'border-l-4 border-l-red-400' : isBlue ? 'border-l-4 border-l-blue-400' : ''} ${selectable ? 'cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-900/10' : ''} ${selected ? 'border-purple-500 ring-2 ring-purple-500/20' : 'border-slate-200 dark:border-zinc-700'}`}>
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
      <div className="min-w-0 flex-1" onClick={selectable ? onToggle : undefined}>
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${isScout ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'}`}>
            {isScout ? 'Scout' : 'Super'}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${assignment.status === 'completed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
            {assignment.status}
          </span>
        </div>
        {!compact && <div className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{assignment.userName || assignment.userEmail}</div>}
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Match {assignment.matchNumber}</span>
          {(assignment.position || assignment.alliance) && (
            <span className={`font-medium ${isRed ? 'text-red-600' : isBlue ? 'text-blue-600' : ''}`}>{assignment.position || assignment.alliance}</span>
          )}
        </div>
      </div>
      <button type="button" onClick={onDelete} className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-300">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-purple-200 bg-purple-50/50 px-4 py-12 dark:border-zinc-700 dark:bg-zinc-950/40">
      <Filter className="h-12 w-12 text-slate-300 dark:text-slate-600" />
      <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">No assignments found</p>
      <p className="text-xs text-slate-400 dark:text-slate-500">Try adjusting your filters</p>
    </div>
  );
}

function parseMatchRange(input: string): number[] {
  const result = new Set<number>();
  const parts = input.split(/[,\s]+/).filter(Boolean);
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        for (let i = start; i <= end; i++) {
          result.add(i);
        }
      }
    } else {
      const num = Number(part);
      if (!isNaN(num) && num > 0) {
        result.add(num);
      }
    }
  }
  
  return Array.from(result).sort((a, b) => a - b);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

const inputClassName = 'w-full rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
