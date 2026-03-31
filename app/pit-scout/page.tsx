'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Loader2, ShieldAlert, CheckCircle2, Wrench, Bot, Target, MapPin, Brain, Trophy, MessageSquare, Weight, Ruler, Upload, X, ImageIcon, Users } from 'lucide-react';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { queuePitSubmission, savePitPayload } from '@/lib/offlineQueue';
import { StarRatingInput } from '@/components/StarRatingInput';

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
  const [autoReliability, setAutoReliability] = useState(0);

  // Strategy & Notes
  const [playStyle, setPlayStyle] = useState<'offense' | 'defense' | 'hybrid'>('offense');
  const [humanPlayerSkill, setHumanPlayerSkill] = useState(0);
  const [driverExperience, setDriverExperience] = useState(0);
  const [driverNotes, setDriverNotes] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [notes, setNotes] = useState('');

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
        playStyle,
        humanPlayerSkill,
        driverExperience,
        driverNotes: driverNotes.trim(),
        strengths: strengths.trim(),
        weaknesses: weaknesses.trim(),
        notes: notes.trim(),
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
      setAutoReliability(0);
      setPlayStyle('offense');
      setHumanPlayerSkill(0);
      setDriverExperience(0);
      setDriverNotes('');
      setStrengths('');
      setWeaknesses('');
      setNotes('');
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section icon={<MapPin className="h-5 w-5" />} title="Event Information">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Year">
                <input value={year} onChange={(e) => setYear(e.target.value)} className={inputClassName} required />
              </Field>
              <Field label="Regional">
                <input value={regional} onChange={(e) => setRegional(e.target.value)} className={inputClassName} required />
              </Field>
              <Field label="Team Number">
                <input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} inputMode="numeric" className={inputClassName} required />
              </Field>
            </div>
          </Section>

          <Section icon={<Bot className="h-5 w-5" />} title="Robot Specifications">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Drivetrain Type">
                <select value={drivetrain} onChange={(e) => setDrivetrain(e.target.value)} className={inputClassName}>
                  <option value="">Select...</option>
                  <option value="tank">Tank (6 wheel)</option>
                  <option value="mecanum">Mecanum</option>
                  <option value="swerve">Swerve</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Robot Weight (lbs)">
                <div className="relative">
                  <Weight className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={robotWeight} onChange={(e) => setRobotWeight(e.target.value)} inputMode="numeric" className={`${inputClassName} pl-9`} placeholder="e.g. 115" />
                </div>
              </Field>
              <Field label="Dimensions (L x W x H)">
                <div className="relative">
                  <Ruler className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={dimensions} onChange={(e) => setDimensions(e.target.value)} className={`${inputClassName} pl-9`} placeholder="e.g. 28x32x24" />
                </div>
              </Field>
            </div>
          </Section>

          <Section icon={<Target className="h-5 w-5" />} title="Gameplay Capabilities - REBUILT">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle3Field label="Score Fuel in Hub?" value={canScoreFuel} onChange={setCanScoreFuel} />
              <Toggle3Field label="Drive Over BUMP?" value={canDriveOverBump} onChange={setCanDriveOverBump} />
              <Toggle3Field label="Drive Under TRENCH?" value={canDriveUnderTrench} onChange={setCanDriveUnderTrench} />
            </div>

            {canScoreFuel !== 'no' && (
              <div className="mt-4">
                <Field label="Fuel Capacity (how many FUEL can they hold?)">
                  <select value={fuelCapacity} onChange={(e) => setFuelCapacity(e.target.value as any)} className={inputClassName}>
                    <option value="small">Small (~10)</option>
                    <option value="medium">Medium (~30)</option>
                    <option value="large">Large (50+)</option>
                  </select>
                </Field>
              </div>
            )}
            
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Toggle3Field label="Can Climb Tower?" value={canClimb} onChange={setCanClimb} />
              <Toggle3Field label="Deliver to OUTPOST?" value={canDeliverToOutpost} onChange={setCanDeliverToOutpost} />
            </div>
          </Section>

          <Section icon={<Brain className="h-5 w-5" />} title="Autonomous">
            <div className="grid gap-4 sm:grid-cols-2">
              <Toggle3Field label="Has Auto Routine?" value={hasAuto} onChange={setHasAuto} />
              {hasAuto !== 'no' && (
                <Field label="Auto Reliability">
                  <StarRatingInput label="" value={autoReliability} onChange={setAutoReliability} />
                </Field>
              )}
            </div>
            {hasAuto !== 'no' && (
              <div className="mt-4">
                <Field label="Describe Auto Routine">
                  <textarea
                    value={autoRoutine}
                    onChange={(e) => setAutoRoutine(e.target.value)}
                    rows={3}
                    className={`${inputClassName} resize-y`}
                    placeholder="What does their auto do? (score FUEL, drive over BUMP, position for TRENCH, etc.)"
                  />
                </Field>
              </div>
            )}
          </Section>

          <Section icon={<Trophy className="h-5 w-5" />} title="Drive Team">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Driver Experience">
                <StarRatingInput label="" value={driverExperience} onChange={setDriverExperience} />
                <p className="mt-1 text-xs text-slate-500">Rate the driver&apos;s skill and experience</p>
              </Field>
              <Field label="Human Player Skill">
                <StarRatingInput label="" value={humanPlayerSkill} onChange={setHumanPlayerSkill} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Driver Notes">
                <textarea
                  value={driverNotes}
                  onChange={(e) => setDriverNotes(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="Describe the drive team experience, communication style, or any notable observations..."
                />
              </Field>
            </div>
          </Section>

          <Section icon={<Target className="h-5 w-5" />} title="Strategy & Assessment">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Play Style">
                <div className="flex gap-2">
                  {(['offense', 'defense', 'hybrid'] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setPlayStyle(style)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold capitalize ${
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
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Strengths">
                <textarea
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="What does this team do well?"
                />
              </Field>
              <Field label="Weaknesses / Concerns">
                <textarea
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  rows={3}
                  className={`${inputClassName} resize-y`}
                  placeholder="What should we watch out for?"
                />
              </Field>
            </div>
          </Section>

          <Section icon={<ImageIcon className="h-5 w-5" />} title="Robot Photos">
            <div className="space-y-4">
              <Field label="Upload Images (Max 5)">
                <div className="flex items-center gap-4">
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
                  <span className="text-sm text-slate-500">
                    {selectedImages.length}/5 selected
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Photos will be uploaded when you save (online only)</p>
              </Field>

              {selectedImages.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition-transform hover:scale-110"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          <Section icon={<MessageSquare className="h-5 w-5" />} title="Additional Notes">
            <Field label="General Notes">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className={`${inputClassName} resize-y`}
                placeholder="Repair concerns, unique mechanisms, programming languages, drive team experience, or anything else noteworthy..."
              />
            </Field>
          </Section>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-xl bg-purple-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadingImages ? 'Uploading images...' : 'Saving...'}
              </span>
            ) : (
              `Save Pit Scouting${selectedImages.length > 0 ? ` (${selectedImages.length} image${selectedImages.length > 1 ? 's' : ''})` : ''}`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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
