'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, getDocFromServer, collection, getDocs, query, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, ShieldAlert, CheckCircle2, Wrench, Bot, Target, MapPin, Brain, Trophy, Weight, Ruler, Upload, X, ImageIcon } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { queuePitSubmission, savePitPayload } from '@/lib/offlineQueue';

const sanitizeIdPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'web';

type YesNoMaybe = 'yes' | 'no' | 'maybe';

function PitScoutPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, userData, isAuthChecking, isApproved } = useAuth();

  const [isLoadingDefaults, setIsLoadingDefaults] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [year, setYear] = useState(searchParams.get('year') || '2026');
  const [regional, setRegional] = useState(searchParams.get('regional') || 'casnv');
  const [lastRegional, setLastRegional] = useState('');
  const [teamNumber, setTeamNumber] = useState(searchParams.get('team') || '');

  // Robot Specs
  const [drivetrain, setDrivetrain] = useState('');
  const [robotWeight, setRobotWeight] = useState('');
  const [dimensions, setDimensions] = useState('');

  // Gameplay Capabilities - 2026 REBUILT
  const [canScoreFuel, setCanScoreFuel] = useState<YesNoMaybe>('no');
  const [fuelCapacity, setFuelCapacity] = useState<'small' | 'medium' | 'large'>('small');
  const [canDriveOverBump, setCanDriveOverBump] = useState<YesNoMaybe>('no');
  const [canDriveUnderTrench, setCanDriveUnderTrench] = useState<YesNoMaybe>('no');
  const [canClimb, setCanClimb] = useState<YesNoMaybe>('no');
  const [canDeliverToOutpost, setCanDeliverToOutpost] = useState<YesNoMaybe>('no');

  // Autonomous
  const [hasAuto, setHasAuto] = useState<YesNoMaybe>('no');
  const [autoRoutine, setAutoRoutine] = useState('');
  const [autoReliability, setAutoReliability] = useState('');

  // Strategy & Notes
  const [playStyle, setPlayStyle] = useState<'offense' | 'defense' | 'hybrid'>('offense');
  const [humanPlayerSkill, setHumanPlayerSkill] = useState('');
  const [hpScoredPit, setHpScoredPit] = useState(0);
  const [driverExperience, setDriverExperience] = useState('');
  const [driverNotes, setDriverNotes] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [notes, setNotes] = useState('');
  const [improvedFromLast, setImprovedFromLast] = useState<YesNoMaybe>('no');

  // Check if team already has pit scout data
  const [pitScoutedTeams, setPitScoutedTeams] = useState<Set<string>>(new Set());
  const [allEventTeams, setAllEventTeams] = useState<string[]>([]);

  // Load all teams at event and check which are pit scouted
  useEffect(() => {
    const loadTeams = async () => {
      if (!year.trim() || !regional.trim()) return;
      try {
        // Get teams from match_teams collection
        const matchTeamsRef = collection(db, 'years', year.trim(), 'regionals', regional.trim().toLowerCase(), 'match_teams');
        const matchSnap = await getDocs(matchTeamsRef);
        const teamsSet = new Set<string>();
        matchSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.teams && Array.isArray(data.teams)) {
            data.teams.forEach((t: string) => teamsSet.add(String(t)));
          }
        });
        
        // Also check teams collection directly
        const teamsRef = collection(db, 'years', year.trim(), 'regionals', regional.trim().toLowerCase(), 'teams');
        const teamsSnap = await getDocs(teamsRef);
        teamsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (data.teamNumber) teamsSet.add(String(data.teamNumber));
        });
        
        const sortedTeams = Array.from(teamsSet).sort((a, b) => Number(a) - Number(b));
        setAllEventTeams(sortedTeams);

        // Check which teams have pit scouting data
        const scouted = new Set<string>();
        for (const team of sortedTeams) {
          const pitCollectionRef = collection(db, 'years', year.trim(), 'regionals', regional.trim().toLowerCase(), 'teams', team, 'pit_scouting');
          const q = query(pitCollectionRef, limit(1));
          const pitSnap = await getDocs(q);
          if (!pitSnap.empty) scouted.add(team);
        }
        setPitScoutedTeams(scouted);
      } catch (err) {
        console.error('Error loading teams:', err);
      }
    };
    loadTeams();
  }, [year, regional]);

  // Auto-advance to next unscouted team on Enter key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isSaving && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // Find next unscouted team
        const currentIndex = allEventTeams.indexOf(teamNumber);
        const nextTeam = allEventTeams.find((t, i) => i > currentIndex && !pitScoutedTeams.has(t));
        if (nextTeam) {
          setTeamNumber(nextTeam);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [allEventTeams, pitScoutedTeams, teamNumber, isSaving]);

  // Image Upload
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    const loadCurrentEvent = async () => {
      try {
        if (!searchParams.get('year') || !searchParams.get('regional')) {
          const settingsSnap = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
          if (settingsSnap.exists()) {
            const data = settingsSnap.data();
            if (!searchParams.get('year') && data.year) setYear(String(data.year));
            if (!searchParams.get('regional') && data.regional) setRegional(String(data.regional));
          }
        }
      } catch {
        // Keep defaults if settings cannot be read.
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

  const scoutName = useMemo(() => {
    return userData?.name || user?.displayName || user?.email || 'Web Scout';
  }, [user, userData]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const newImages = Array.from(files).filter(file => file.type.startsWith('image/'));
    setSelectedImages(prev => [...prev, ...newImages].slice(0, 5)); // Max 5 images
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) return;

    const trimmedYear = year.trim();
    const trimmedRegional = regional.trim().toLowerCase();
    const numericTeam = Number(teamNumber);

    if (!trimmedYear || !trimmedRegional || !Number.isFinite(numericTeam) || numericTeam <= 0) {
      setError('Enter a valid year, regional, and team number.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');
    setUploadingImages(false);

    try {
      const nowIso = new Date().toISOString();
      const identity = sanitizeIdPart(user.uid || scoutName);
      const docId = `${numericTeam}_${identity}`;

      // Upload images if online
      const imageUrls: string[] = [];
      const isOnline = typeof window !== 'undefined' && window.navigator.onLine;
      
      if (isOnline && selectedImages.length > 0) {
        setUploadingImages(true);
        for (let i = 0; i < selectedImages.length; i++) {
          const file = selectedImages[i];
          const storagePath = `years/${trimmedYear}/regionals/${trimmedRegional}/teams/${numericTeam}/pit_images/${docId}_${i}_${Date.now()}.${file.name.split('.').pop()}`;
          const storageRef = ref(storage, storagePath);
          
          await uploadBytes(storageRef, file);
          const downloadUrl = await getDownloadURL(storageRef);
          imageUrls.push(downloadUrl);
        }
        setUploadingImages(false);
      }

      const pitData = {
        teamNumber: numericTeam,
        scoutName,
        scoutUid: user.uid,
        drivetrain: drivetrain.trim(),
        robotWeight: robotWeight.trim(),
        dimensions: dimensions.trim(),
        canScoreFuel,
        fuelCapacity,
        canDriveOverBump,
        canDriveUnderTrench,
        canClimb,
        canDeliverToOutpost,
        hasAuto,
        autoRoutine: autoRoutine.trim(),
        autoReliability,
        lastRegional: lastRegional.trim(),
        playStyle,
        hpScoredPit,
        humanPlayerSkill,
        driverExperience,
        driverNotes: driverNotes.trim(),
        strengths: strengths.trim(),
        weaknesses: weaknesses.trim(),
        improvedFromLast,
        images: imageUrls,
        timestamp: nowIso,
      };

      const payload = {
        year: trimmedYear,
        regional: trimmedRegional,
        teamNumber: numericTeam,
        docId,
        pitData,
      };

      if (!isOnline) {
        queuePitSubmission(payload);
        setSuccess(`Saved offline Team ${numericTeam}${selectedImages.length > 0 ? ' (images not uploaded - offline)' : ''}`);
      } else {
        try {
          await savePitPayload(payload);
          setSuccess(`Saved Team ${numericTeam}${imageUrls.length > 0 ? ` with ${imageUrls.length} image(s)` : ''}`);
        } catch {
          queuePitSubmission(payload);
          setSuccess(`Saved offline Team ${numericTeam}`);
        }
      }
      setTeamNumber('');
      setDrivetrain('');
      setRobotWeight('');
      setDimensions('');
      setCanScoreFuel('no');
      setFuelCapacity('small');
      setCanDriveOverBump('no');
      setCanDriveUnderTrench('no');
      setCanClimb('no');
      setCanDeliverToOutpost('no');
      setHasAuto('no');
      setAutoRoutine('');
      setAutoReliability('');
      setHpScoredPit(0);
      setPlayStyle('offense');
      setHumanPlayerSkill('');
      setDriverExperience('');
      setDriverNotes('');
      setStrengths('');
      setWeaknesses('');
      setImprovedFromLast('no');
      setSelectedImages([]);
    } catch (err: any) {
      setError(err?.message || 'Failed to save pit scouting data.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isAuthChecking || isLoadingDefaults) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!isApproved) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4">
        <ShieldAlert className="mb-5 h-14 w-14 text-purple-600" />
        <h1 className="text-center text-2xl font-extrabold text-slate-900 dark:text-white">Account Pending Approval</h1>
        <p className="mt-2 max-w-md text-center text-slate-600 dark:text-slate-300">
          Your account exists but cannot submit scouting data until an admin approves it.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-2xl border border-purple-200/70 bg-gradient-to-r from-purple-600 to-purple-800 p-6 shadow-xl shadow-purple-900/10 dark:border-zinc-800 dark:from-purple-900 dark:to-zinc-900">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">Pit Scouting</h1>
              <p className="text-sm text-purple-100">Gather intel on robot capabilities and strategy</p>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {success}
          </div>
        ) : null}

        {allEventTeams.length > 0 && (
          <div className="mb-4 rounded-xl border border-purple-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-purple-900 dark:text-purple-200">
                Team Checklist ({pitScoutedTeams.size}/{allEventTeams.length} done)
              </h3>
              <span className="text-xs text-slate-500">Press Enter to jump to next</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allEventTeams.map(team => {
                const isScouted = pitScoutedTeams.has(team);
                const isCurrent = team === teamNumber;
                return (
                  <button
                    key={team}
                    type="button"
                    onClick={() => setTeamNumber(team)}
                    className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
                      isCurrent
                        ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                        : isScouted
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-purple-100 hover:text-purple-700 dark:bg-zinc-800 dark:text-slate-400'
                    }`}
                  >
                    {team}
                    {isScouted && <span className="ml-0.5">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pb-6">
          <PitSection icon={<MapPin className="h-5 w-5" />} title="Event Information">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Year">
                <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClassName} required />
              </Field>
              <Field label="Regional">
                <input value={regional} onChange={(e) => setRegional(e.target.value)} className={inputClassName} required />
              </Field>
              <Field label="Last Regional (if applicable)">
                <input value={lastRegional} onChange={(e) => setLastRegional(e.target.value)} className={inputClassName} placeholder="e.g. casnv, cafr" />
              </Field>
              <Field label="Team Number">
                <input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} inputMode="numeric" className={inputClassName} required />
              </Field>
            </div>
          </PitSection>

          <PitSection icon={<Bot className="h-5 w-5" />} title="Robot Specs">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Drivetrain">
                <select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value)} className={inputClassName}>
                  <option value="">Select...</option>
                  <option value="tank">Tank</option>
                  <option value="mecanum">Mecanum</option>
                  <option value="swerve">Swerve</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Weight (lbs)">
                <div className="relative">
                  <Weight className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={robotWeight} onChange={(e) => setRobotWeight(e.target.value)} inputMode="numeric" className={`${inputClassName} pl-9`} placeholder="e.g. 115" />
                </div>
              </Field>
              <Field label="Dimensions">
                <div className="relative">
                  <Ruler className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={dimensions} onChange={(e) => setDimensions(e.target.value)} className={`${inputClassName} pl-9`} placeholder="LxWxH" />
                </div>
              </Field>
            </div>
          </PitSection>

          <PitSection icon={<Target className="h-5 w-5" />} title="Gameplay">
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/30">
              <p className="text-xs text-blue-700 dark:text-blue-300">🔍 <strong>Scout Tip:</strong> Ask for specific numbers. Instead of &quot;Can you climb?&quot; ask &quot;How many points is your fastest climb?&quot; Specifics are harder to fake.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle3Field label="Score Fuel?" value={canScoreFuel} onChange={setCanScoreFuel} />
              <Toggle3Field label="Drive Over Bump?" value={canDriveOverBump} onChange={setCanDriveOverBump} />
              <Toggle3Field label="Drive Under Trench?" value={canDriveUnderTrench} onChange={setCanDriveUnderTrench} />
              <Toggle3Field label="Can Climb?" value={canClimb} onChange={setCanClimb} />
              <Toggle3Field label="Deliver to Outpost?" value={canDeliverToOutpost} onChange={setCanDeliverToOutpost} />
            </div>
            {canScoreFuel !== 'no' && (
              <div className="mt-4">
                <Field label="Fuel Capacity">
                  <select value={fuelCapacity} onChange={(e) => setFuelCapacity(e.target.value as any)} className={inputClassName}>
                    <option value="small">Small (~10)</option>
                    <option value="medium">Medium (~30)</option>
                    <option value="large">Large (50+)</option>
                  </select>
                </Field>
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-xs text-amber-700 dark:text-amber-300">💡 <strong>Reality Check:</strong> Ask: &quot;How many fuel did you score in your best match vs average match?&quot; Big gaps = exaggeration.</p>
                </div>
              </div>
            )}
          </PitSection>

          <PitSection icon={<Brain className="h-5 w-5" />} title="Autonomous">
            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle3Field label="Has Auto?" value={hasAuto} onChange={setHasAuto} />
              {hasAuto !== 'no' && (
                <Field label="Auto Reliability">
                  <textarea
                    value={autoReliability}
                    onChange={(e) => setAutoReliability(e.target.value)}
                    rows={2}
                    className={`${inputClassName} resize-y`}
                    placeholder="How consistent is their auto?"
                  />
                </Field>
              )}
            </div>
            {hasAuto !== 'no' && (
              <>
                <div className="mt-4">
                  <Field label="Auto Routine Description">
                    <textarea
                      value={autoRoutine}
                      onChange={(e) => setAutoRoutine(e.target.value)}
                      rows={3}
                      className={`${inputClassName} resize-y`}
                      placeholder="What does their auto do?"
                    />
                  </Field>
                </div>
                <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-700 dark:bg-purple-950/30">
                  <p className="text-xs text-purple-700 dark:text-purple-300">💡 <strong>Ask:</strong> How many points average? Ask about preload + taxi + scoring. Most teams overestimate - ask for specific numbers instead.</p>
                </div>
              </>
            )}
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ <strong>Reality Check:</strong> Ask: &quot;What percentage does your auto work?&quot; 90% = reliable, 50% = unreliable. Get the real number.</p>
            </div>
          </PitSection>

          <PitSection icon={<Trophy className="h-5 w-5" />} title="Drive Team">
            <div className="mb-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-700 dark:bg-purple-950/30">
              <p className="text-xs text-purple-700 dark:text-purple-300">💡 <strong>Ask indirectly:</strong> Instead of &quot;Are you good at defense?&quot; ask &quot;What&apos;s your strategy when opponent has fuel?&quot; Listen for awareness.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Driver Experience">
                <textarea
                  value={driverExperience}
                  onChange={(e) => setDriverExperience(e.target.value)}
                  rows={2}
                  className={`${inputClassName} resize-y`}
                  placeholder="Years, tournaments, skill level..."
                />
              </Field>
              <Field label="Human Player Skill">
                <textarea
                  value={humanPlayerSkill}
                  onChange={(e) => setHumanPlayerSkill(e.target.value)}
                  rows={2}
                  className={`${inputClassName} resize-y`}
                  placeholder="Accuracy, speed, consistency..."
                />
              </Field>
              <Field label="HP Scored (0-20)">
                <div className="rounded-xl border border-purple-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="mb-3 text-sm font-bold text-purple-950 dark:text-purple-200">{hpScoredPit}</div>
                  <input type="range" min="0" max="20" step="1" value={hpScoredPit} onChange={(e) => setHpScoredPit(Number(e.target.value))} className="w-full accent-purple-600" />
                </div>
                <p className="mt-1 text-xs text-slate-500">How many balls can their Human Player score?</p>
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Driver Notes">
                <textarea
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="Drive team experience, communication style..."
                />
              </Field>
            </div>
          </PitSection>

          <PitSection icon={<Target className="h-5 w-5" />} title="Strategy">
            <Field label="Play Style">
              <div className="flex gap-2">
                {(['offense', 'defense', 'hybrid'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setPlayStyle(style)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold capitalize ${
                      playStyle === style
                        ? 'border-purple-500 bg-purple-100 text-purple-900 dark:border-purple-400 dark:bg-purple-900/30 dark:text-purple-100'
                        : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </Field>
            <div className="mt-4">
              <Toggle3Field label="Improved from last regional?" value={improvedFromLast} onChange={setImprovedFromLast} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Strengths">
                <textarea
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="What do they do well?"
                />
              </Field>
              <Field label="Weaknesses">
                <textarea
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="Watch out for..."
                />
              </Field>
            </div>
          </PitSection>

          <PitSection icon={<ImageIcon className="h-5 w-5" />} title="Photos">
            <div className="space-y-4">
              <Field label={`Upload Images (${selectedImages.length}/5)`}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm font-bold text-purple-700 transition-colors hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-300 dark:hover:bg-zinc-800">
                  <Upload className="h-4 w-4" />
                  Choose Photos
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={selectedImages.length >= 5}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">Photos upload when saving (online only)</p>
              </Field>
              {selectedImages.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {selectedImages.map((file, index) => (
                    <div key={index} className="relative aspect-square rounded-lg border border-purple-200 bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Selected ${index + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PitSection>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadingImages ? 'Uploading...' : 'Saving...'}
              </span>
            ) : (
              `Save${selectedImages.length > 0 ? ` (${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''})` : ''}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm font-semibold text-slate-700 dark:text-slate-200 ${className}`}>
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Toggle3Field({ label, value, onChange }: { label: string; value: YesNoMaybe; onChange: (v: YesNoMaybe) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-1">
        {['yes', 'no', 'maybe'].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v as YesNoMaybe)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold capitalize ${
              value === v
                ? v === 'yes'
                  ? 'border-emerald-500 bg-emerald-100 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-900/30 dark:text-emerald-100'
                  : v === 'no'
                  ? 'border-slate-500 bg-slate-100 text-slate-900 dark:border-slate-400 dark:bg-slate-900/30 dark:text-slate-100'
                  : 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-400 dark:bg-amber-900/30 dark:text-amber-100'
                : 'border-slate-200 bg-white text-slate-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-slate-300'
            }`}
          >
            {v === 'maybe' ? '?' : v}
          </button>
        ))}
      </div>
    </Field>
  );
}

function PitSection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="mb-4 flex items-center gap-2 border-b border-purple-100 pb-3 dark:border-zinc-800">
        <span className="text-purple-600 dark:text-purple-400">{icon}</span>
        <h2 className="text-lg font-black text-purple-950 dark:text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

const inputClassName =
  'w-full rounded-lg border border-purple-200 bg-white px-3 py-2.5 text-sm text-purple-950 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white';

export default function PitScoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      }
    >
      <PitScoutPageInner />
    </Suspense>
  );
}
