'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { ImagePlus, Loader2, Save, Settings, Shield, Trash2, UserCog, ArrowRightLeft, Users, ArrowRight } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { PAGE_VISIBILITY_EVENT, type PageVisibility } from '@/hooks/usePageVisibility';

type AdminUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  approved?: boolean;
  createdAt?: string;
  photoURL?: string;
};

const defaultVisibility: PageVisibility = {
  showPicklist: false,
  showSuperScoutViewer: false,
  showDataViewer: false,
  showLegacyDataViewer: false,
};

const SETTINGS_STORAGE_KEY = 'mvrt-settings-draft-v1';

type SettingsDraft = {
  name: string;
  photoURL: string;
  regionalCode: string;
  selectedYear: string;
  selectedRegional: string;
  newRegional: string;
  pageVisibility: PageVisibility;
};

function readSettingsDraft(): SettingsDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const draft: SettingsDraft = {
      name: String((parsed as any).name || ''),
      photoURL: String((parsed as any).photoURL || ''),
      regionalCode: String((parsed as any).regionalCode || ''),
      selectedYear: String((parsed as any).selectedYear || '2026'),
      selectedRegional: String((parsed as any).selectedRegional || 'practice'),
      newRegional: String((parsed as any).newRegional || ''),
      pageVisibility: {
        ...defaultVisibility,
        ...((parsed as any).pageVisibility || {}),
      },
    };

    const isMeaningful =
      Boolean(draft.name.trim() || draft.photoURL.trim() || draft.regionalCode.trim() || draft.newRegional.trim()) ||
      draft.selectedYear !== '2026' ||
      draft.selectedRegional !== 'practice' ||
      Object.entries(draft.pageVisibility).some(([key, value]) => value !== defaultVisibility[key as keyof PageVisibility]);

    return isMeaningful ? draft : null;
  } catch {
    return null;
  }
}

function writeSettingsDraft(draft: SettingsDraft) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage quota or privacy errors.
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, userData, isAuthChecking, isAdmin } = useAuth();

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingAdmin, setIsSavingAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [regionalCode, setRegionalCode] = useState('');
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedRegional, setSelectedRegional] = useState('practice');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableRegionals, setAvailableRegionals] = useState<{ code: string; name: string }[]>([]);
  const [newRegional, setNewRegional] = useState('');
  const [pageVisibility, setPageVisibility] = useState<PageVisibility>(defaultVisibility);
  const [hasInitializedSettings, setHasInitializedSettings] = useState(false);

  useEffect(() => {
    if (!user || hasInitializedSettings || isAuthChecking) return;

    const draft = readSettingsDraft();

    if (draft) {
      setName(draft.name);
      setPhotoURL(draft.photoURL);
      setRegionalCode(draft.regionalCode);
      setSelectedYear(draft.selectedYear);
      setSelectedRegional(draft.selectedRegional);
      setNewRegional(draft.newRegional);
      setPageVisibility(draft.pageVisibility);
    } else {
      setName(userData?.name || user.displayName || '');
      setPhotoURL(userData?.photoURL || user.photoURL || '');
      setRegionalCode('');
      setSelectedYear('2026');
      setSelectedRegional('practice');
      setNewRegional('');
      setPageVisibility({
        ...defaultVisibility,
        ...(userData?.pageVisibility || {}),
      });
    }

    setHasInitializedSettings(true);
  }, [hasInitializedSettings, isAuthChecking, user, userData]);

  useEffect(() => {
    if (!hasInitializedSettings) return;

    writeSettingsDraft({
      name,
      photoURL,
      regionalCode,
      selectedYear,
      selectedRegional,
      newRegional,
      pageVisibility,
    });
  }, [hasInitializedSettings, name, photoURL, regionalCode, selectedYear, selectedRegional, newRegional, pageVisibility]);

  useEffect(() => {
    if (!user || !hasInitializedSettings || !userData) return;
    const isDifferent = JSON.stringify(pageVisibility) !== JSON.stringify(userData.pageVisibility || defaultVisibility);
    if (!isDifferent) return;
    void setDoc(
      doc(db, 'users', user.uid),
      {
        pageVisibility,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(() => {
      // Local draft already persists the change; Firebase will sync on the next successful save.
    });
  }, [hasInitializedSettings, pageVisibility, user, userData]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);

  // Non-admin: Transfer assignments state
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<Set<string>>(new Set());
  const [availableScouts, setAvailableScouts] = useState<AdminUser[]>([]);
  const [selectedTransferScout, setSelectedTransferScout] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferUI, setShowTransferUI] = useState(false);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

  const removeExpiredPendingUsers = useCallback(async () => {
    const now = Date.now();
    const usersSnapshot = await getDocsFromServer(collection(db, 'users'));
    const staleUsers = usersSnapshot.docs
      .map((userDoc) => ({ id: userDoc.id, ...(userDoc.data() as any) }))
      .filter((entry: any) => {
        if (entry.approved) return false;
        const createdAt = new Date(entry.createdAt || 0).getTime();
        return createdAt > 0 && now - createdAt > 24 * 60 * 60 * 1000;
      });

    await Promise.all(
      staleUsers.map(async (entry: any) => {
        await deleteDoc(doc(db, 'users', entry.id));
        const assignmentsSnapshot = await getDocsFromServer(query(collection(db, 'assignments'), where('userId', '==', entry.id)));
        await Promise.all(assignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(doc(db, 'assignments', assignmentDoc.id))));
      })
    );

    return staleUsers.length;
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoadingAdmin(true);
    try {
      const removedCount = await removeExpiredPendingUsers();

      const [settingsDoc, usersSnapshot, yearsSnapshot] = await Promise.all([
        getDocFromServer(doc(db, 'settings', 'currentEvent')),
        getDocsFromServer(collection(db, 'users')),
        getDocsFromServer(collection(db, 'years')),
      ]);

      if (settingsDoc.exists()) {
        setRegionalCode(String((settingsDoc.data() as any).regionalCode || ''));
        setSelectedYear(String((settingsDoc.data() as any).year || '2026'));
        setSelectedRegional(String((settingsDoc.data() as any).regional || 'practice'));
      }

      const nextYears = yearsSnapshot.docs.map((entry) => entry.id).sort((a, b) => b.localeCompare(a));
      setAvailableYears(nextYears.length > 0 ? nextYears : ['2026']);

      const nextUsers = usersSnapshot.docs
        .map((userDoc) => ({ id: userDoc.id, ...(userDoc.data() as any) }))
        .sort((a: any, b: any) => Number(Boolean(a.approved)) - Number(Boolean(b.approved)) || String(a.email || '').localeCompare(String(b.email || '')));

      setUsers(nextUsers);
      if (removedCount > 0) {
        setMessage(`Removed ${removedCount} old pending account${removedCount === 1 ? '' : 's'}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load admin settings.');
    } finally {
      setIsLoadingAdmin(false);
    }
  }, [isAdmin, removeExpiredPendingUsers]);

  const ensurePracticeRegional = useCallback(async (yearValue: string) => {
    const nowIso = new Date().toISOString();
    await setDoc(doc(db, 'years', yearValue), { year: Number(yearValue) || yearValue, updatedAt: nowIso }, { merge: true });
    await setDoc(doc(db, `years/${yearValue}/regionals`, 'practice'), {
      code: 'practice',
      name: 'Practice',
      updatedAt: nowIso,
    }, { merge: true });
  }, []);

  const loadRegionals = useCallback(async (yearValue: string) => {
    await ensurePracticeRegional(yearValue);
    const snapshot = await getDocsFromServer(collection(db, `years/${yearValue}/regionals`));
    const nextRegionals = snapshot.docs
      .map((entry) => ({ code: entry.id, name: String((entry.data() as any).name || entry.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    setAvailableRegionals(nextRegionals);
  }, [ensurePracticeRegional]);

  useEffect(() => {
    if (isAdmin) {
      loadRegionals(selectedYear);
    }
  }, [isAdmin, loadRegionals, selectedYear]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    setIsSavingProfile(true);
    setError('');
    setMessage('');

    try {
      writeSettingsDraft({
        name: name.trim(),
        photoURL: photoURL.trim(),
        regionalCode,
        selectedYear,
        selectedRegional,
        newRegional,
        pageVisibility,
      });

      // Only set photoURL in Auth if it's a valid URL (not base64)
      const trimmedPhotoURL = photoURL.trim();
      const isValidUrl = /^https?:\/\//i.test(trimmedPhotoURL);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: isValidUrl ? trimmedPhotoURL : undefined,
        });
      }

      const existingUser = await getDocFromServer(doc(db, 'users', user.uid));
      await setDoc(
        doc(db, 'users', user.uid),
        {
          email: user.email,
          approved: existingUser.exists() ? existingUser.data().approved : false,
          role: existingUser.exists() ? existingUser.data().role || 'pending' : 'pending',
          name: name.trim(),
          photoURL: trimmedPhotoURL,
          pageVisibility,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setMessage('Saved');
    } catch (err: any) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setMessage('Saved locally. Changes will stay on this device until you are online.');
        setError('');
      } else {
        setError(err?.message || 'Failed to save.');
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveAdmin = async () => {
    setIsSavingAdmin(true);
    setError('');
    setMessage('');

    try {
      await ensurePracticeRegional(selectedYear);
      
      // Require regional code for practice regionals too
      const trimmedRegionalCode = regionalCode.trim().toLowerCase();
      if (!trimmedRegionalCode && selectedRegional === 'practice') {
        throw new Error('Practice regionals require a valid regional code (e.g., 2026casv for reference)');
      }
      
      const normalizedRegional = selectedRegional === 'practice' ? 'practice' : selectedRegional;
      const normalizedRegionalCode = trimmedRegionalCode || `${selectedYear}${normalizedRegional}`;
      const nextRegionalCode = normalizedRegional === 'practice' ? trimmedRegionalCode : normalizedRegionalCode;

      await setDoc(
        doc(db, 'settings', 'currentEvent'),
        {
          regionalCode: normalizedRegionalCode,
          year: selectedYear,
          regional: normalizedRegional,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      writeSettingsDraft({
        name,
        photoURL,
        regionalCode: nextRegionalCode,
        selectedYear,
        selectedRegional: normalizedRegional,
        newRegional,
        pageVisibility,
      });

      setRegionalCode(nextRegionalCode);
      setSelectedRegional(normalizedRegional);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(PAGE_VISIBILITY_EVENT, { detail: pageVisibility }));
      }
      setMessage('Saved');
    } catch (err: any) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setMessage('Saved locally. Admin settings will sync when you are online.');
        setError('');
      } else {
        setError(err?.message || 'Failed to save admin settings.');
      }
    } finally {
      setIsSavingAdmin(false);
    }
  };

  const handleUpdateUser = async (userId: string, updates: Partial<AdminUser>) => {
    await updateDoc(doc(db, 'users', userId), updates as any);
    setUsers((current) => current.map((entry) => (entry.id === userId ? { ...entry, ...updates } : entry)));
  };

  const handleDeleteUser = async (entry: AdminUser) => {
    await deleteDoc(doc(db, 'users', entry.id));
    // Delete user's assignments across all years (simplified - in practice you might want to track which years)
    const yearsSnapshot = await getDocsFromServer(collection(db, 'years'));
    await Promise.all(yearsSnapshot.docs.map(async (yearDoc) => {
      const yearId = yearDoc.id;
      const assignmentsSnapshot = await getDocsFromServer(query(collection(db, `years/${yearId}/assignments`), where('userId', '==', entry.id)));
      await Promise.all(assignmentsSnapshot.docs.map((assignmentDoc) => deleteDoc(doc(db, `years/${yearId}/assignments`, assignmentDoc.id))));
    }));
    setUsers((current) => current.filter((userEntry) => userEntry.id !== entry.id));
  };

  // Real-time listener for assignments and available scouts - fetch server-first then listen
  useEffect(() => {
    if (!user || isAdmin || !selectedYear) return;

    let unsubscribeAssignments: (() => void) | undefined;
    let unsubscribeUsers: (() => void) | undefined;

    const setupListeners = async () => {
      // First fetch assignments from server
      try {
        const assignmentsQuery = query(
          collection(db, `years/${selectedYear}/assignments`),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocsFromServer(assignmentsQuery);
        const myAssigns = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => {
            const aNum = Number(a.matchNumber) || 0;
            const bNum = Number(b.matchNumber) || 0;
            return aNum - bNum;
          });
        setMyAssignments(myAssigns);
      } catch (error) {
        console.error('Error fetching assignments from server:', error);
      }

      // First fetch users from server
      try {
        const usersSnapshot = await getDocsFromServer(collection(db, 'users'));
        const otherScouts = usersSnapshot.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((u: any) => u.id !== user.uid && u.approved && (u.role === 'scout' || u.role === 'super_scout'));
        setAvailableScouts(otherScouts);
      } catch (error) {
        console.error('Error fetching users from server:', error);
      }

      // Then set up listeners for updates
      const assignmentsQuery = query(
        collection(db, `years/${selectedYear}/assignments`),
        where('userId', '==', user.uid)
      );

      unsubscribeAssignments = onSnapshot(assignmentsQuery, { includeMetadataChanges: true }, (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          const myAssigns = snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => {
              const aNum = Number(a.matchNumber) || 0;
              const bNum = Number(b.matchNumber) || 0;
              return aNum - bNum;
            });
          setMyAssignments(myAssigns);
        }
      }, (error) => {
        console.error('Error listening to assignments:', error);
      });

      unsubscribeUsers = onSnapshot(collection(db, 'users'), { includeMetadataChanges: true }, (snapshot) => {
        if (!snapshot.metadata.fromCache) {
          const otherScouts = snapshot.docs
            .map((d) => ({ id: d.id, ...(d.data() as any) }))
            .filter((u: any) => u.id !== user.uid && u.approved && (u.role === 'scout' || u.role === 'super_scout'));
          setAvailableScouts(otherScouts);
        }
      }, (error) => {
        console.error('Error listening to users:', error);
      });
    };

    setupListeners();

    return () => {
      unsubscribeAssignments?.();
      unsubscribeUsers?.();
    };
  }, [user, isAdmin, selectedYear]);

  const handleTransferAssignments = async () => {
    if (!selectedTransferScout || selectedAssignments.size === 0) return;
    setIsTransferring(true);
    setError('');
    setMessage('');
    try {
      const targetScout = availableScouts.find(s => s.id === selectedTransferScout);
      if (!targetScout) throw new Error('Target scout not found');
      
      const assignmentsToTransfer = myAssignments.filter(a => selectedAssignments.has(a.id));
      
      // Transfer selected assignments to new scout
      await Promise.all(assignmentsToTransfer.map(async (assignment) => {
        await updateDoc(doc(db, `years/${selectedYear}/assignments`, assignment.id), {
          userId: selectedTransferScout,
          userName: targetScout.name || targetScout.email || '',
          userEmail: targetScout.email || '',
          updatedAt: new Date().toISOString(),
        });
      }));
      
      setMessage(`Transferred ${assignmentsToTransfer.length} assignment(s) to ${targetScout.name || targetScout.email}`);
      setSelectedAssignments(new Set());
      setShowTransferUI(false);
      setSelectedTransferScout('');
      // No need to update state - onSnapshot will update automatically
    } catch (err: any) {
      setError(err?.message || 'Failed to transfer assignments');
    } finally {
      setIsTransferring(false);
    }
  };

  const pendingCount = useMemo(() => users.filter((entry) => !entry.approved).length, [users]);

  const handleAddRegional = async () => {
    const code = newRegional.trim().toLowerCase();
    if (!code) return;
    await ensurePracticeRegional(selectedYear);
    await setDoc(doc(db, `years/${selectedYear}/regionals`, code), {
      code,
      name: code.toUpperCase(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    setNewRegional('');
    setSelectedRegional(code);
    writeSettingsDraft({
      name,
      photoURL,
      regionalCode,
      selectedYear,
      selectedRegional: code,
      newRegional: '',
      pageVisibility,
    });
    await loadRegionals(selectedYear);
  };

  const handleProfileImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setError('');

    try {
      const result = await resizeImage(file);

      setPhotoURL(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload image.');
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  if (isAuthChecking) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-3xl font-black text-purple-950 dark:text-white">Settings</h1>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <Link 
                href="/admin" 
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
              <Link 
                href="/assignments" 
                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-700"
              >
                <Users className="h-4 w-4" />
                Assignments
              </Link>
            </div>
          )}
        </div>
      </div>

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

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={handleProfileSubmit} className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row">
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-purple-200 bg-purple-100 dark:border-zinc-700 dark:bg-zinc-800">
              {photoURL ? (
                <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${photoURL})` }} aria-label="Profile" />
              ) : (
                <Shield className="h-10 w-10 text-purple-500" />
              )}
            </div>
            <div className="w-full">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{user?.email}</p>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-purple-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200">
                {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Upload Picture
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileImageUpload} />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} className={inputClassName} />
            </Field>

            <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="mb-3 text-sm font-bold text-purple-950 dark:text-white">Page View</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['showDataViewer', 'Data Viewer'],
                  ['showLegacyDataViewer', 'Legacy Viewer'],
                  ['showPicklist', 'Picklist'],
                  ['showSuperScoutViewer', 'AI / Super'],
                ].map(([key, label]) => {
                  const visibilityKey = key as keyof PageVisibility;
                  const enabled = pageVisibility[visibilityKey];

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPageVisibility((current) => ({ ...current, [visibilityKey]: !current[visibilityKey] }))}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold ${
                        enabled
                          ? 'border-purple-300 bg-purple-100 text-purple-950 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-100'
                          : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200'
                      }`}
                    >
                      <span>{label}</span>
                      <span>{enabled ? 'On' : 'Off'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button type="submit" disabled={isSavingProfile} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60">
            {isSavingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </button>
        </form>

        {isAdmin ? (
          <section className="space-y-6">
            <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center gap-3">
                <Settings className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Admin</h2>
              </div>

              <div className="space-y-4">
                <Field label="Regional Code">
                  <input
                    value={regionalCode}
                    onChange={(event) => setRegionalCode(event.target.value)}
                    className={inputClassName}
                    placeholder={selectedRegional === 'practice' ? 'Enter event code (e.g., 2026casv)' : '2026caoec'}
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Year">
                    <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className={inputClassName}>
                      {availableYears.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                    </select>
                  </Field>
                  <Field label="Regional">
                    <select value={selectedRegional} onChange={(event) => setSelectedRegional(event.target.value)} className={inputClassName}>
                      {availableRegionals.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
                    </select>
                  </Field>
                </div>

                <div className="flex gap-3">
                  <input value={newRegional} onChange={(event) => setNewRegional(event.target.value)} placeholder="Add regional" className={inputClassName} />
                  <button type="button" onClick={handleAddRegional} className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white">
                    Add
                  </button>
                </div>

                <Link 
                  href="/admin" 
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700"
                >
                  <Shield className="h-4 w-4" />
                  Open Admin Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <button type="button" onClick={handleSaveAdmin} disabled={isSavingAdmin} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60">
                  {isSavingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Admin
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <UserCog className="h-5 w-5 text-purple-600" />
                  <h2 className="text-xl font-black text-purple-950 dark:text-white">User Management</h2>
                </div>
                <div className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">
                  Pending {pendingCount}
                </div>
              </div>

              {isLoadingAdmin ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                </div>
              ) : (
                <div className="space-y-3">
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
                          onChange={(event) => setUsers((current) => current.map((userEntry) => (userEntry.id === entry.id ? { ...userEntry, name: event.target.value } : userEntry)))}
                          onBlur={() => handleUpdateUser(entry.id, { name: entry.name || '' })}
                          className={inputClassName}
                          placeholder="Name"
                        />
                        <select
                          value={entry.role || 'pending'}
                          onChange={(event) => handleUpdateUser(entry.id, { role: event.target.value })}
                          className={inputClassName}
                        >
                          <option value="pending">Pending</option>
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleUpdateUser(entry.id, { approved: !entry.approved, role: entry.approved ? entry.role || 'pending' : entry.role === 'pending' ? 'user' : entry.role })}
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
          </section>
        ) : (
          // Non-admin: Transfer Assignments Section
          <section className="space-y-6">
            <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
              <div className="mb-4 flex items-center gap-3">
                <ArrowRightLeft className="h-5 w-5 text-purple-600" />
                <h2 className="text-xl font-black text-purple-950 dark:text-white">Transfer Assignments</h2>
              </div>
              
              <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                Transfer your pending assignments to another scout (e.g., for bathroom breaks or if you need to leave).
              </p>

              {myAssignments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-purple-200 bg-purple-50/50 px-4 py-6 text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/40 dark:text-slate-400">
                  You have no pending assignments to transfer.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                    <div className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-2">
                      Select assignments to transfer:
                    </div>
                    <div className="space-y-2">
                      {[...myAssignments]
                        .sort((a: any, b: any) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0))
                        .map((assignment) => (
                        <label key={assignment.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-white/50 dark:hover:bg-zinc-900/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedAssignments.has(assignment.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedAssignments);
                              if (e.target.checked) {
                                newSet.add(assignment.id);
                              } else {
                                newSet.delete(assignment.id);
                              }
                              setSelectedAssignments(newSet);
                            }}
                            className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-200">
                            Match {assignment.matchNumber} - {assignment.role === 'super_scout' ? `Super Scout (${assignment.alliance})` : `Scout (Team ${assignment.teamNumber || assignment.position})`}
                          </span>
                        </label>
                      ))}
                    </div>
                    {selectedAssignments.size > 0 && (
                      <div className="mt-2 text-xs text-purple-600 dark:text-purple-300">
                        {selectedAssignments.size} selected
                      </div>
                    )}
                  </div>

                  {!showTransferUI ? (
                    <button
                      type="button"
                      onClick={() => setShowTransferUI(true)}
                      disabled={selectedAssignments.size === 0}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Users className="h-4 w-4" />
                      Transfer Selected ({selectedAssignments.size})
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <Field label="Select Scout">
                        <select
                          value={selectedTransferScout}
                          onChange={(e) => setSelectedTransferScout(e.target.value)}
                          className={inputClassName}
                        >
                          <option value="">Choose a scout...</option>
                          {availableScouts.map((scout) => (
                            <option key={scout.id} value={scout.id}>
                              {scout.name || scout.email || scout.id}
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
                          disabled={!selectedTransferScout || isTransferring}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                        >
                          {isTransferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
                          Transfer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}

async function resizeImage(file: File) {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('Failed to load image.'));
    nextImage.src = source;
  });

  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Image upload is not available on this device.');
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

const inputClassName =
  'w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';
