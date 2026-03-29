'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2, ShieldAlert, CheckCircle2, CloudOff } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { queueScoutSubmission, saveScoutPayload } from '@/lib/offlineQueue';
import { StarRatingInput } from '@/components/StarRatingInput';
import { type FieldSelection, RebuiltFieldMapSelector } from '@/components/scouting/RebuiltFieldMap';

type MatchRole = 'offense' | 'defense' | 'mixed';
type ClimbLevel = 'None' | 'Level 1' | 'Level 2' | 'Level 3';
type ScoutSectionId = 'auton' | 'teleop' | 'endgame';

function ScoutPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, userData, isAuthChecking, isApproved } = useAuth();
  const hasInitializedQuery = useRef(false);

  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  const [year, setYear] = useState(searchParams.get('year') || '2026');
  const [regional, setRegional] = useState(searchParams.get('regional') || 'casnv');
  const [matchNumber, setMatchNumber] = useState(searchParams.get('match') || '');
  const [teamNumber, setTeamNumber] = useState(searchParams.get('team') || '');

  const [startingPositionMap, setStartingPositionMap] = useState<FieldSelection | null>(null);
  const [crossedAutoLine, setCrossedAutoLine] = useState(false);
  const [autoScoringRating, setAutoScoringRating] = useState(0);
  const [autoAccuracyRating, setAutoAccuracyRating] = useState(0);
  const [humanPlayerAutoCount, setHumanPlayerAutoCount] = useState(0);

  const [intakeConsistency, setIntakeConsistency] = useState(0);
  const [shooterConsistency, setShooterConsistency] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [scoringThreatRating, setScoringThreatRating] = useState(0);
  const [accuracyRating, setAccuracyRating] = useState(0);
  const [humanPlayerCount, setHumanPlayerCount] = useState(0);
  const [shootingPositionMaps, setShootingPositionMaps] = useState<FieldSelection[]>([]);
  const [defenseRating, setDefenseRating] = useState(0);
  const [defended, setDefended] = useState(false);
  const [wasDefended, setWasDefended] = useState(false);
  const [defenseQuality, setDefenseQuality] = useState(0);
  const [primaryRole, setPrimaryRole] = useState<MatchRole>('mixed');
  const [brokeInTeleop, setBrokeInTeleop] = useState(false);
  const [teleopComments, setTeleopComments] = useState('');

  const [climbLevel, setClimbLevel] = useState<ClimbLevel>('None');
  const [robotReliabilityRating, setRobotReliabilityRating] = useState(0);
  const [endgameScoringImpact, setEndgameScoringImpact] = useState(0);
  const [overallMatchImpact, setOverallMatchImpact] = useState(0);
  const [climbAttempted, setClimbAttempted] = useState(true);
  const [climbFailed, setClimbFailed] = useState(false);
  const [disabledInEndgame, setDisabledInEndgame] = useState(false);
  const [endgameComments, setEndgameComments] = useState('');
  const [activeSection, setActiveSection] = useState<ScoutSectionId>('auton');
  const [hasLoadedExistingSubmission, setHasLoadedExistingSubmission] = useState(false);

  useEffect(() => {
    const loadCurrentEvent = async () => {
      try {
        if (!searchParams.get('year') || !searchParams.get('regional')) {
          const settingsSnap = await getDoc(doc(db, 'settings', 'currentEvent'));
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            if (!searchParams.get('year') && data.year) setYear(String(data.year));
            if (!searchParams.get('regional') && data.regional) setRegional(String(data.regional));
          }
        }
      } catch {
      } finally {
        setIsLoadingDefaults(false);
      }
    };

    loadCurrentEvent();
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [isAuthChecking, router, user]);

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

  useEffect(() => {
    const nextYear = searchParams.get('year') || '2026';
    const nextRegional = searchParams.get('regional') || 'casnv';
    const nextMatchNumber = searchParams.get('match') || '';
    const nextTeamNumber = searchParams.get('team') || '';

    if (!hasInitializedQuery.current) {
      hasInitializedQuery.current = true;
      return;
    }

    setYear(nextYear);
    setRegional(nextRegional);
    setMatchNumber(nextMatchNumber);
    setTeamNumber(nextTeamNumber);

    setStartingPositionMap(null);
    setCrossedAutoLine(false);
    setAutoScoringRating(0);
    setAutoAccuracyRating(0);
    setHumanPlayerAutoCount(0);
    setIntakeConsistency(0);
    setShooterConsistency(0);
    setDriverRating(0);
    setSpeedRating(0);
    setScoringThreatRating(0);
    setAccuracyRating(0);
    setHumanPlayerCount(0);
    setShootingPositionMaps([]);
    setDefenseRating(0);
    setDefended(false);
    setWasDefended(false);
    setDefenseQuality(0);
    setPrimaryRole('mixed');
    setBrokeInTeleop(false);
    setTeleopComments('');
    setClimbLevel('None');
    setRobotReliabilityRating(0);
    setEndgameScoringImpact(0);
    setOverallMatchImpact(0);
    setClimbAttempted(true);
    setClimbFailed(false);
    setDisabledInEndgame(false);
    setEndgameComments('');
    setActiveSection('auton');
    setError('');
    setSuccess('');
    setHasLoadedExistingSubmission(false);
  }, [searchParams]);

  useEffect(() => {
    const loadExistingSubmission = async () => {
      if (!user || isLoadingDefaults || hasLoadedExistingSubmission) return;

      const trimmedYear = year.trim();
      const trimmedRegional = regional.trim().toLowerCase();
      const numericMatch = Number(matchNumber);
      const numericTeam = Number(teamNumber);

      if (!trimmedYear || !trimmedRegional || !Number.isFinite(numericMatch) || !Number.isFinite(numericTeam) || numericMatch <= 0 || numericTeam <= 0) {
        return;
      }

      try {
        const docId = `qm${numericMatch}_${user.uid}`;
        const existingSnap = await getDoc(doc(db, 'years', trimmedYear, 'regionals', trimmedRegional, 'teams', String(numericTeam), 'matches', docId));

        if (!existingSnap.exists()) {
          setHasLoadedExistingSubmission(true);
          return;
        }

        const data = existingSnap.data() as Record<string, any>;
        setStartingPositionMap(toPoint(data['Starting Position X'], data['Starting Position Y']));
        setCrossedAutoLine(Boolean(data['Crossed Auto Line']));
        setAutoScoringRating(Number(data['Auto Scoring Rating'] || 0));
        setAutoAccuracyRating(Number(data['Auto Accuracy Rating'] || 0));
        setHumanPlayerAutoCount(Number(data['Human Player Auto Count'] || 0));
        setIntakeConsistency(Number(data['Intake Consistency'] || 0));
        setShooterConsistency(Number(data['Shooter Consistency'] || 0));
        setDriverRating(Number(data['Driver Rating'] || 0));
        setSpeedRating(Number(data['Speed Rating'] || 0));
        setScoringThreatRating(Number(data['Scoring Threat Rating'] || 0));
        setAccuracyRating(Number(data['Accuracy Rating'] || 0));
        setHumanPlayerCount(Number(data['Human Player Count'] || 0));
        setShootingPositionMaps(
          Array.isArray(data['Shooting Positions'])
            ? data['Shooting Positions'].map((point: any) => toPoint(point?.x, point?.y)).filter((point: any): point is FieldSelection => Boolean(point))
            : []
        );
        setDefenseRating(Number(data['Defense Rating'] || 0));
        setDefended(Boolean(data['Defended']));
        setWasDefended(Boolean(data['Was Defended']));
        setDefenseQuality(Number(data['Defense Quality'] || 0));
        setPrimaryRole((data['Primary Role'] as MatchRole) || 'mixed');
        setBrokeInTeleop(Boolean(data['Broke In Teleop']));
        setTeleopComments(String(data['Teleop Comments'] || ''));
        setClimbLevel((data['Climb Level'] as ClimbLevel) || 'None');
        setRobotReliabilityRating(Number(data['Robot Reliability Rating'] || 0));
        setEndgameScoringImpact(Number(data['Endgame Scoring Impact'] || 0));
        setOverallMatchImpact(Number(data['Overall Match Impact'] || 0));
        setClimbAttempted(Boolean(data['Climb Attempted'] ?? true));
        setClimbFailed(Boolean(data['Climb Failed']));
        setDisabledInEndgame(Boolean(data['Disabled In Endgame']));
        setEndgameComments(String(data['Endgame Comments'] || ''));
        setActiveSection('auton');
        setSuccess('Loaded existing data for editing.');
      } catch {
      } finally {
        setHasLoadedExistingSubmission(true);
      }
    };

    loadExistingSubmission();
  }, [hasLoadedExistingSubmission, isLoadingDefaults, matchNumber, regional, teamNumber, user, year]);

  const scoutName = useMemo(() => userData?.name || user?.displayName || user?.email || 'Web Scout', [user, userData]);
  const isPractice = regional.trim().toLowerCase() === 'practice';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const trimmedYear = year.trim();
    const trimmedRegional = regional.trim().toLowerCase();
    const numericMatch = Number(matchNumber);
    const numericTeam = Number(teamNumber);

    if (!trimmedYear || !trimmedRegional || !Number.isFinite(numericMatch) || !Number.isFinite(numericTeam) || numericMatch <= 0 || numericTeam <= 0) {
      setError('Enter year, regional, match, and team.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      const nowIso = new Date().toISOString();
      const docId = `qm${numericMatch}_${user.uid}`;
      const primaryShotPoint = shootingPositionMaps[0] || null;

      const matchData = {
        matchNumber: numericMatch,
        teamNumber: numericTeam,
        year: trimmedYear,
        regional: trimmedRegional,
        timestamp: nowIso,
        scoutUid: user.uid,
        scoutName,
        'Starting Position X': startingPositionMap?.x || 0,
        'Starting Position Y': startingPositionMap?.y || 0,
        'Crossed Auto Line': crossedAutoLine,
        'Auto Scoring Rating': autoScoringRating,
        'Auto Accuracy Rating': autoAccuracyRating,
        'Human Player Auto Count': humanPlayerAutoCount,
        'Intake Consistency': intakeConsistency,
        'Shooter Consistency': shooterConsistency,
        'Driver Rating': driverRating,
        'Speed Rating': speedRating,
        'Scoring Threat Rating': scoringThreatRating,
        'Accuracy Rating': accuracyRating,
        'Shooting Position X': primaryShotPoint?.x || 0,
        'Shooting Position Y': primaryShotPoint?.y || 0,
        'Shooting Positions': shootingPositionMaps,
        'Human Player Count': humanPlayerCount,
        'Defense Rating': defenseRating,
        'Defended': defended,
        'Was Defended': wasDefended,
        'Defense Quality': defenseQuality,
        'Primary Role': primaryRole,
        'Broke In Teleop': brokeInTeleop,
        'Teleop Comments': teleopComments.trim(),
        'Climb Level': climbLevel,
        'Robot Reliability Rating': robotReliabilityRating,
        'Endgame Scoring Impact': endgameScoringImpact,
        'Overall Match Impact': overallMatchImpact,
        'Climb Attempted': climbAttempted,
        'Climb Failed': climbFailed,
        'Disabled In Endgame': disabledInEndgame,
        'Endgame Comments': endgameComments.trim(),
      };

      const payload = {
        year: trimmedYear,
        regional: trimmedRegional,
        teamNumber: numericTeam,
        matchNumber: numericMatch,
        scoutUid: user.uid,
        docId,
        matchData,
      };

      if (typeof window !== 'undefined' && !window.navigator.onLine) {
        queueScoutSubmission(payload);
        setSuccess(`Saved offline Match ${numericMatch} Team ${numericTeam}`);
      } else {
        try {
          await saveScoutPayload(payload);
          setSuccess(`Saved Match ${numericMatch} Team ${numericTeam}`);
        } catch {
          queueScoutSubmission(payload);
          setSuccess(`Saved offline Match ${numericMatch} Team ${numericTeam}`);
        }
      }

      setTimeout(() => router.push('/dashboard'), 900);
    } catch (err: any) {
      setError(err?.message || 'Failed to save scouting data.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isAuthChecking || isLoadingDefaults) {
    return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;
  }

  if (!isApproved) {
    return <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4"><ShieldAlert className="mb-5 h-14 w-14 text-purple-600" /><h1 className="text-center text-2xl font-extrabold text-slate-900 dark:text-white">Account Pending Approval</h1></div>;
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Show current scout attribution */}
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200">
          <span>Scout:</span>
          <span className="font-bold">{scoutName}</span>
        </div>
        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">{error}</div> : null}
        {isOffline ? <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"><CloudOff className="h-4 w-4" />Offline</div> : null}
        {success ? <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />{success}</div> : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-4">
            <Field label="Year"><input value={year} onChange={(e) => setYear(e.target.value)} className={inputClassName} required /></Field>
            <Field label="Regional"><input value={regional} onChange={(e) => setRegional(e.target.value)} className={inputClassName} required /></Field>
            <Field label="Match"><input value={matchNumber} onChange={(e) => setMatchNumber(e.target.value)} inputMode="numeric" placeholder={isPractice ? 'Enter practice match' : ''} className={inputClassName} required /></Field>
            <Field label="Team"><input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} inputMode="numeric" placeholder={isPractice ? 'Enter practice team' : ''} className={inputClassName} required /></Field>
          </section>

          <ScoutSectionNav activeSection={activeSection} onChange={setActiveSection} />

          <Section hidden={activeSection !== 'auton'}>
            <div className="space-y-4">
              <RebuiltFieldMapSelector label="Start Map" value={startingPositionMap} onChange={setStartingPositionMap} />
              <ToggleField label="Crossed Auto Line" value={crossedAutoLine} onChange={setCrossedAutoLine} />
              <StarRatingInput label="Auto Scoring" value={autoScoringRating} onChange={setAutoScoringRating} />
              <StarRatingInput label="Auto Accuracy" value={autoAccuracyRating} onChange={setAutoAccuracyRating} />
              <SliderField label="HP Auto" value={humanPlayerAutoCount} onChange={setHumanPlayerAutoCount} />
            </div>
          </Section>

          <Section hidden={activeSection !== 'teleop'}>
            <div className="space-y-4">
              <StarRatingInput label="Intake" value={intakeConsistency} onChange={setIntakeConsistency} />
              <StarRatingInput label="Shooter" value={shooterConsistency} onChange={setShooterConsistency} />
              <StarRatingInput label="Driver" value={driverRating} onChange={setDriverRating} />
              <StarRatingInput label="Speed" value={speedRating} onChange={setSpeedRating} />
              <StarRatingInput label="Scoring" value={scoringThreatRating} onChange={setScoringThreatRating} />
              <StarRatingInput label="Accuracy" value={accuracyRating} onChange={setAccuracyRating} />
              <RebuiltFieldMapSelector
                label="Shoot Map"
                values={shootingPositionMaps}
                onChangeMany={setShootingPositionMaps}
                helperText={`${shootingPositionMaps.length} shot${shootingPositionMaps.length === 1 ? '' : 's'} marked`}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShootingPositionMaps([])}
                  className="rounded-lg border border-purple-200 bg-white px-4 py-2 text-sm font-bold text-purple-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200"
                >
                  Clear Shots
                </button>
              </div>
              <SliderField label="HP Scored" value={humanPlayerCount} onChange={setHumanPlayerCount} />
              <StarRatingInput label="Defense" value={defenseRating} onChange={setDefenseRating} />
              <StarRatingInput label="Defense Quality" value={defenseQuality} onChange={setDefenseQuality} />
              <ToggleField label="Defended" value={defended} onChange={setDefended} />
              <ToggleField label="Was Defended" value={wasDefended} onChange={setWasDefended} />
              <ToggleField label="Broke" value={brokeInTeleop} onChange={setBrokeInTeleop} />
            </div>
            <div className="mt-4 space-y-4">
              <SimpleSelect label="Role" value={primaryRole} onChange={setPrimaryRole} options={['offense', 'defense', 'mixed']} />
              <Field label="Teleop Comments"><textarea value={teleopComments} onChange={(e) => setTeleopComments(e.target.value)} rows={4} className={`${inputClassName} resize-y`} /></Field>
            </div>
          </Section>

          <Section hidden={activeSection !== 'endgame'}>
            <div className="space-y-4">
              <SimpleSelect label="Climb Level" value={climbLevel} onChange={setClimbLevel} options={['None', 'Level 1', 'Level 2', 'Level 3']} />
              <StarRatingInput label="Reliability" value={robotReliabilityRating} onChange={setRobotReliabilityRating} />
              <StarRatingInput label="Endgame Impact" value={endgameScoringImpact} onChange={setEndgameScoringImpact} />
              <StarRatingInput label="Overall Impact" value={overallMatchImpact} onChange={setOverallMatchImpact} />
              <ToggleField label="Climb Attempted" value={climbAttempted} onChange={setClimbAttempted} />
              <ToggleField label="Climb Failed" value={climbFailed} onChange={setClimbFailed} />
              <ToggleField label="Disabled" value={disabledInEndgame} onChange={setDisabledInEndgame} />
            </div>
            <div className="mt-4">
              <Field label="Endgame Comments"><textarea value={endgameComments} onChange={(e) => setEndgameComments(e.target.value)} rows={4} className={`${inputClassName} resize-y`} /></Field>
            </div>
          </Section>

          <button type="submit" disabled={isSaving} className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save Scouting'}
          </button>
        </form>
      </div>
    </div>
  );
}

function ScoutSectionNav({ activeSection, onChange }: { activeSection: ScoutSectionId; onChange: (section: ScoutSectionId) => void }) {
  const sections: Array<{ id: ScoutSectionId; label: string }> = [
    { id: 'auton', label: 'Auton' },
    { id: 'teleop', label: 'Teleop' },
    { id: 'endgame', label: 'Endgame' },
  ];

  return (
    <div className="sticky top-[4.5rem] z-20 rounded-xl border border-purple-200/70 bg-white/90 p-2 shadow-lg shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="grid gap-2 sm:grid-cols-3">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onChange(section.id)}
            className={`rounded-lg px-4 py-3 text-center text-sm font-bold transition-colors ${
              activeSection === section.id
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-900 hover:bg-purple-100 dark:bg-zinc-950 dark:text-purple-200 dark:hover:bg-zinc-800'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({ hidden, children }: { hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return <section className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200"><span className="mb-2 block">{label}</span>{children}</label>;
}

function SimpleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: any) => void; options: string[] }) {
  return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)} className={inputClassName}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>;
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Field label={label}><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onChange(true)} className={toggleClassName(value)}>Yes</button><button type="button" onClick={() => onChange(false)} className={toggleClassName(!value)}>No</button></div></Field>;
}

function SliderField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <div className="rounded-xl border border-purple-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 text-sm font-bold text-purple-950 dark:text-purple-200">{value}</div>
        <input type="range" min="0" max="20" step="1" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-purple-600" />
      </div>
    </Field>
  );
}

const inputClassName = 'w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';
const toggleClassName = (active: boolean) => `rounded-lg border px-4 py-3 text-sm font-bold ${active ? 'border-purple-500 bg-purple-600 text-white' : 'border-purple-200 bg-white text-purple-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200'}`;

function toPoint(x: unknown, y: unknown): FieldSelection | null {
  const numericX = Number(x || 0);
  const numericY = Number(y || 0);
  if (numericX === 0 && numericY === 0) return null;
  return { x: numericX, y: numericY };
}

export default function ScoutPage() {
  return <Suspense fallback={<div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>}><ScoutPageInner /></Suspense>;
}
