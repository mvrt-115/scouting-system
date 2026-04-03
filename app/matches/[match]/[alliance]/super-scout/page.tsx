'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, CloudOff, Loader2, Save, ShieldAlert, Database, Ban, Eye } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { queueSuperSubmission, saveSuperPayload } from '@/lib/offlineQueue';
import { isTeamOnDnpList, isTeamOnWatchList, getDnpReason, getWatchReason } from '@/components/GlobalWidgets';

type EventContext = {
  year: string;
  regional: string;
  regionalCode: string;
};

export default function SuperScoutPage() {
  const params = useParams();
  const router = useRouter();
  const matchNumber = String(params.match || '');
  const alliance = String(params.alliance || 'red');
  const { user, userData, isAuthChecking, isApproved } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [eventContext, setEventContext] = useState<EventContext>({ year: '', regional: '', regionalCode: '' });
  const [teams, setTeams] = useState<string[]>(['', '', '']);
  const [teamsLoadedFromSource, setTeamsLoadedFromSource] = useState(false);
  const [isSavingTeams, setIsSavingTeams] = useState(false);
  const [formData, setFormData] = useState({
    overallNotes: '',
    defenseNotes: '',
    teamSpecificNotes: {} as Record<string, string>,
  });

  const loadMatchContext = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const settingsDoc = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
      if (!settingsDoc.exists()) throw new Error('Missing event settings.');

      const settings = settingsDoc.data() as any;
      const nextContext = {
        year: String(settings.year || ''),
        regional: String(settings.regional || ''),
        regionalCode: String(settings.regionalCode || ''),
      };
      setEventContext(nextContext);

      let loadedTeams: string[] | null = null;
      let loadedFromSource = false;
      const apiKey = process.env.NEXT_PUBLIC_TBA_API_KEY;
      
      console.log('Debug - regionalCode:', nextContext.regionalCode, 'apiKey exists:', !!apiKey, 'matchNumber:', matchNumber);

      if (nextContext.regionalCode && apiKey) {
        try {
          // Fetch all matches for the event
          const eventUrl = `https://www.thebluealliance.com/api/v3/event/${nextContext.regionalCode}/matches/simple`;
          console.log('Debug - fetching event matches:', eventUrl);
          
          const response = await fetch(eventUrl, {
            headers: { 'X-TBA-Auth-Key': apiKey },
          });

          console.log('Debug - response status:', response.status);

          if (response.ok) {
            const matches = await response.json();
            console.log('Debug - got', matches.length, 'matches');
            
            // Find the qualification match
            const matchNum = parseInt(matchNumber, 10);
            const match = matches.find((m: any) => 
              m.comp_level === 'qm' && m.match_number === matchNum
            );
            
            if (match) {
              console.log('Debug - found match:', match.key);
              loadedTeams = (match?.alliances?.[alliance]?.team_keys || []).map((teamKey: string) => String(teamKey).replace(/^frc/, ''));
              console.log('Debug - loadedTeams:', loadedTeams);
              if (loadedTeams && loadedTeams.length > 0) {
                loadedFromSource = true;
              }
            } else {
              console.log('Debug - match not found in event matches');
            }
          } else {
            console.log('Debug - failed to fetch matches:', await response.text());
          }
        } catch (e) {
          console.log('Debug - TBA fetch failed:', e);
        }
      } else {
        console.log('Debug - missing regionalCode or apiKey');
      }

      setTeamsLoadedFromSource(loadedFromSource);
      const nextTeams = loadedTeams && loadedTeams.length > 0 ? loadedTeams.slice(0, 3) : ['', '', ''];
      while (nextTeams.length < 3) nextTeams.push('');
      setTeams(nextTeams);

      // Check for existing super scout report data
      if (user && nextContext.year && nextContext.regional) {
        try {
          const docId = `qm${matchNumber}_${alliance}_${user.uid}`;
          const existingDoc = await getDocFromServer(doc(db, `years/${nextContext.year}/regionals/${nextContext.regional}/super_scouting`, docId));
          if (existingDoc.exists()) {
            const existingData = existingDoc.data();
            const existingTeams = existingData.teams || nextTeams;
            setTeams(existingTeams);
            setFormData({
              overallNotes: existingData.data?.overallNotes || '',
              defenseNotes: existingData.data?.defenseNotes || '',
              teamSpecificNotes: existingData.data?.teamSpecificNotes || Object.fromEntries(existingTeams.filter(Boolean).map((t: string) => [t, ''])),
            });
          } else {
            setFormData((current) => ({
              ...current,
              teamSpecificNotes: Object.fromEntries(nextTeams.filter(Boolean).map((team) => [team, current.teamSpecificNotes[team] || ''])),
            }));
          }
        } catch {
          // If loading fails, just use default empty state
          setFormData((current) => ({
            ...current,
            teamSpecificNotes: Object.fromEntries(nextTeams.filter(Boolean).map((team) => [team, current.teamSpecificNotes[team] || ''])),
          }));
        }
      } else {
        setFormData((current) => ({
          ...current,
          teamSpecificNotes: Object.fromEntries(nextTeams.filter(Boolean).map((team) => [team, current.teamSpecificNotes[team] || ''])),
        }));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load match.');
    } finally {
      setIsLoading(false);
    }
  }, [alliance, matchNumber, user]);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    } else if (!isAuthChecking && user) {
      loadMatchContext();
    }
  }, [user, isAuthChecking, router, loadMatchContext]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncState = () => setIsOffline(!window.navigator.onLine);
    syncState();
    window.addEventListener('online', syncState);
    window.addEventListener('offline', syncState);
    return () => {
      window.removeEventListener('online', syncState);
      window.removeEventListener('offline', syncState);
    };
  }, []);

  const updateTeam = (index: number, value: string) => {
    setTeams((current) => {
      const next = [...current];
      const previousTeam = next[index];
      const trimmed = value.replace(/[^0-9]/g, '');
      next[index] = trimmed;

      setFormData((existing) => {
        const teamSpecificNotes = { ...existing.teamSpecificNotes };
        if (previousTeam && previousTeam !== trimmed) delete teamSpecificNotes[previousTeam];
        if (trimmed && !teamSpecificNotes[trimmed]) teamSpecificNotes[trimmed] = '';
        return { ...existing, teamSpecificNotes };
      });

      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;

    const cleanTeams = teams.map((team) => team.trim()).filter(Boolean);
    if (cleanTeams.length === 0) {
      setError('Enter teams.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      if (!eventContext.year || !eventContext.regional) throw new Error('Missing event settings.');

      const reportData = {
        matchNumber: parseInt(matchNumber, 10),
        alliance,
        teams: cleanTeams,
        scoutId: user.uid,
        scoutEmail: user.email,
        scoutName: userData?.name || user.displayName || user.email || 'Anonymous Scout',
        data: {
          ...formData,
          teamSpecificNotes: Object.fromEntries(cleanTeams.map((team) => [team, formData.teamSpecificNotes[team] || ''])),
        },
        createdAt: new Date().toISOString(),
      };

      const payload = {
        year: eventContext.year,
        regional: eventContext.regional,
        matchNumber: parseInt(matchNumber, 10),
        alliance,
        scoutUid: user.uid,
        docId: `qm${matchNumber}_${alliance}_${user.uid}`,
        reportData,
      };

      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        queueSuperSubmission(payload);
        setSuccess('Saved offline');
      } else {
        try {
          await saveSuperPayload(payload);
          setSuccess('Saved');
        } catch {
          queueSuperSubmission(payload);
          setSuccess('Saved offline');
        }
      }

      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const cleanTeams = useMemo(() => teams.filter(Boolean), [teams]);

  const handleSaveTeams = async () => {
    if (!eventContext.year || !eventContext.regional) {
      setError('Missing event settings.');
      return;
    }
    
    const cleanTeamsList = teams.map(t => t.trim()).filter(Boolean);
    if (cleanTeamsList.length === 0) {
      setError('Enter at least one team number.');
      return;
    }

    setIsSavingTeams(true);
    setError('');
    
    try {
      const matchTeamData = {
        matchNumber: parseInt(matchNumber, 10),
        alliance,
        teams: cleanTeamsList,
        updatedAt: new Date().toISOString(),
        source: 'manual_entry',
      };
      
      await setDoc(
        doc(db, `years/${eventContext.year}/regionals/${eventContext.regional}/match_teams`, `qm${matchNumber}_${alliance}`),
        matchTeamData
      );
      
      setTeamsLoadedFromSource(true);
      setSuccess('Teams saved for future reference');
    } catch (err: any) {
      setError(err?.message || 'Failed to save teams');
    } finally {
      setIsSavingTeams(false);
    }
  };

  if (isAuthChecking || isLoading) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  if (!isApproved) {
    return <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4"><ShieldAlert className="mb-5 h-14 w-14 text-purple-600" /><h1 className="text-center text-2xl font-extrabold text-slate-900 dark:text-white">Account Pending Approval</h1></div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300">
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>

      {isOffline ? <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"><CloudOff className="h-4 w-4" />Offline</div> : null}
      {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">{error}</div> : null}
      {success ? <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{success}</div> : null}

      {/* Single Card Layout */}
      <div className="rounded-2xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between border-b border-purple-100 pb-4 dark:border-zinc-800">
          <div>
            <h1 className="text-2xl font-black text-purple-950 dark:text-white">
              Match {matchNumber} <span className={`capitalize ${alliance === 'red' ? 'text-red-600' : 'text-blue-600'}`}>{alliance}</span>
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{eventContext.year} {eventContext.regional}</p>
          </div>
          <div className="flex items-center gap-2">
            {teams.map((team, index) => {
              const isDnp = team && isTeamOnDnpList(team);
              const isWatch = team && isTeamOnWatchList(team);
              const dnpReason = isDnp ? getDnpReason(team) : '';
              const watchReason = isWatch ? getWatchReason(team) : '';
              
              let inputClass = "w-16 rounded-lg border border-purple-200 bg-white px-2 py-2 text-center text-sm font-bold text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white";
              
              if (isDnp) {
                inputClass = "w-16 rounded-lg border-2 border-red-500 bg-red-50 px-2 py-2 text-center text-sm font-bold text-red-700 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-red-400 dark:bg-red-950/30 dark:text-red-300";
              } else if (isWatch) {
                inputClass = "w-16 rounded-lg border-2 border-emerald-500 bg-emerald-50 px-2 py-2 text-center text-sm font-bold text-emerald-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/30 dark:text-emerald-300";
              }
              
              return (
                <div key={`${index}_${team}`} className="relative group">
                  <input
                    value={team}
                    onChange={(event) => updateTeam(index, event.target.value)}
                    inputMode="numeric"
                    placeholder={`T${index + 1}`}
                    className={inputClass}
                    title={dnpReason || watchReason || ''}
                  />
                  {isDnp && (
                    <Ban className="absolute -top-2 -right-2 h-4 w-4 text-red-600" />
                  )}
                  {isWatch && (
                    <Eye className="absolute -top-2 -right-2 h-4 w-4 text-emerald-600" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Warning for manual teams */}
        {!teamsLoadedFromSource && cleanTeams.length > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
            <span className="text-xs text-amber-700 dark:text-amber-300">Teams not loaded from TBA</span>
            <button
              type="button"
              onClick={handleSaveTeams}
              disabled={isSavingTeams}
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-zinc-800 disabled:opacity-60"
            >
              {isSavingTeams ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
              Save Teams
            </button>
          </div>
        )}

        {/* Alliance Notes */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Alliance Notes</label>
          <textarea
            value={formData.overallNotes}
            onChange={(event) => setFormData((current) => ({ ...current, overallNotes: event.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            placeholder="Overall observations about the alliance..."
          />
        </div>

        {/* Defense Notes */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Defense Notes</label>
          <textarea
            value={formData.defenseNotes}
            onChange={(event) => setFormData((current) => ({ ...current, defenseNotes: event.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            placeholder="Describe defensive strategies, effectiveness, and observations..."
          />
        </div>

        {/* Team Notes */}
        <div className="space-y-3">
          <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">Team Notes</label>
          {cleanTeams.length > 0 ? (
            cleanTeams.map((team) => {
              const isDnp = isTeamOnDnpList(team);
              const isWatch = isTeamOnWatchList(team);
              const dnpReason = isDnp ? getDnpReason(team) : '';
              const watchReason = isWatch ? getWatchReason(team) : '';
              
              let cardClass = "rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/50";
              let badgeClass = "inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white";
              
              if (isDnp) {
                cardClass = "rounded-lg border-2 border-red-400 bg-red-50/70 p-3 dark:border-red-500/50 dark:bg-red-950/20";
                badgeClass = "inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white";
              } else if (isWatch) {
                cardClass = "rounded-lg border-2 border-emerald-400 bg-emerald-50/70 p-3 dark:border-emerald-500/50 dark:bg-emerald-950/20";
                badgeClass = "inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white";
              }
              
              return (
                <div key={team} className={cardClass}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className={badgeClass}>{team.slice(0, 2)}</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Team {team}</span>
                    {isDnp && (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
                        <Ban className="h-3 w-3" /> DNP
                      </span>
                    )}
                    {isWatch && (
                      <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        <Eye className="h-3 w-3" /> WATCH
                      </span>
                    )}
                  </div>
                  {(dnpReason || watchReason) && (
                    <p className="mb-2 text-xs text-slate-500 dark:text-slate-400 italic">
                      {dnpReason || watchReason}
                    </p>
                  )}
                  <textarea
                    value={formData.teamSpecificNotes[team] || ''}
                    onChange={(event) => setFormData((current) => ({ ...current, teamSpecificNotes: { ...current.teamSpecificNotes, [team]: event.target.value } }))}
                    rows={2}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-200"
                    placeholder={`Notes for team ${team}...`}
                  />
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-6 text-center text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-950/30 dark:text-slate-400">
              Enter team numbers above to add notes
            </div>
          )}
        </div>

        {/* Save Button */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Report
        </button>
      </div>
    </div>
  );
}
