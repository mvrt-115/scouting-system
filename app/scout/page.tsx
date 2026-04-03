'use client';

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc, getDocFromServer } from 'firebase/firestore';
import { Loader2, ShieldAlert, CheckCircle2, CloudOff, HelpCircle, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { queueScoutSubmission, saveScoutPayload } from '@/lib/offlineQueue';
import { StarRatingInput } from '@/components/StarRatingInput';
import { type FieldSelection, RebuiltFieldMapSelector } from '@/components/scouting/RebuiltFieldMap';

type MatchRole = 'offense' | 'defense' | 'mixed';
type ClimbLevel = 'None' | 'Level 1' | 'Level 2' | 'Level 3';
type ScoutSectionId = 'auton' | 'teleop' | 'endgame';

function StarRatingHint() {
  const [showHint, setShowHint] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'auto' | 'driver' | 'scoring' | 'defense' | 'reliability' | 'speed' | 'capabilities' | 'playstyle'>('general');
  
  const ratingDescriptions = [
    { range: '9-10', label: 'Elite', desc: 'Top-tier performance, championship caliber' },
    { range: '7-8', label: 'Strong', desc: 'Very good, reliable contributor' },
    { range: '5-6', label: 'Average', desc: 'Decent performance, meets expectations' },
    { range: '3-4', label: 'Weak', desc: 'Below average, inconsistent' },
    { range: '1-2', label: 'Poor', desc: 'Significant issues, needs improvement' },
    { range: '0', label: 'N/A', desc: 'No data or not applicable' },
  ];
  
  const fieldSpecificGuidance: Record<string, { title: string; guidance: Array<{score: string; desc: string}> }> = {
    auto: {
      title: 'Auto Scoring (20s Autonomous)',
      guidance: [
        { score: '9-10', desc: '4-5+ fuel scored consistently, precise hub alignment, never misses' },
        { score: '7-8', desc: '3-4 fuel reliably, good accuracy, minimal errors' },
        { score: '5-6', desc: '2-3 fuel average, occasional misses' },
        { score: '3-4', desc: '1-2 fuel, inconsistent, frequent misplacements' },
        { score: '1-2', desc: '0-1 fuel, major auto failures or no auto routine' },
      ]
    },
    driver: {
      title: 'Driver Skill (Bumps, Trenches, Hub Control)',
      guidance: [
        { score: '9-10', desc: 'Elite control over bumps/under trenches, precise hub alignment, fast cycles, never bumps into field elements or other robots' },
        { score: '7-8', desc: 'Good control, efficient navigation, rare alignment errors, minimal bumping' },
        { score: '5-6', desc: 'Average driving, some bump/trench issues, okay hub alignment, occasional collisions' },
        { score: '3-4', desc: 'Poor control, struggles with obstacles, slow cycles, frequently bumps into things' },
        { score: '1-2', desc: 'Unsafe driving, constant collisions, gets stuck on field elements, hurts alliance' },
      ]
    },
    scoring: {
      title: 'Fuel Scoring Volume & Accuracy (like 254)',
      guidance: [
        { score: '9-10', desc: 'Elite scorer like 254 - rapid fuel intake, pinpoint hub accuracy, high volume (15+ fuel per active period)' },
        { score: '7-8', desc: 'Solid scorer, good accuracy into hub, consistent 10-14 fuel per period' },
        { score: '5-6', desc: 'Moderate scorer, decent accuracy, 6-9 fuel per period' },
        { score: '3-4', desc: 'Low scorer, poor hub accuracy, frequent misses, 3-5 fuel per period' },
        { score: '1-2', desc: 'Minimal scoring (0-2 fuel), constant misses into hub, ineffective scoring attempts' },
      ]
    },
    defense: {
      title: 'Defense Rating (Positioning & Effectiveness)',
      guidance: [
        { score: '9-10', desc: 'Elite defender - holds position on their side, blocks fuel scoring, disrupts opponent cycles, smart positioning during shifts' },
        { score: '7-8', desc: 'Good defender - stays on their side, solid blocks, interferes with opponent hub access' },
        { score: '5-6', desc: 'Average defense - occasionally crosses to opponent side but effective when positioned correctly' },
        { score: '3-4', desc: 'Weak defense - just follows opponents around, poor positioning, ineffective blocks' },
        { score: '1-2', desc: 'No defense or harmful - chases opponents everywhere, leaves their side open, gets in alliance way' },
      ]
    },
    reliability: {
      title: 'Robot Reliability / Uptime',
      guidance: [
        { score: '9-10', desc: 'Never breaks, 100% field time, all mechanisms functional' },
        { score: '7-8', desc: 'Very reliable, rare minor issues, quick recovery' },
        { score: '5-6', desc: 'Mostly reliable, occasional mechanism stoppage' },
        { score: '3-4', desc: 'Frequent issues, dead on field multiple times per match' },
        { score: '1-2', desc: 'Constant breakdowns, barely moves or non-functional' },
      ]
    },
    speed: {
      title: 'Cycle Speed (Fuel Collection to Scoring)',
      guidance: [
        { score: '9-10', desc: 'Extremely fast cycles - depot/neutral zone to hub efficiently, fastest on field' },
        { score: '7-8', desc: 'Fast cycles, above average speed between collection and scoring' },
        { score: '5-6', desc: 'Average speed, standard cycle times between fuel intake and hub scoring' },
        { score: '3-4', desc: 'Slow cycles, sluggish movement between scoring and collecting' },
        { score: '1-2', desc: 'Very slow, significantly impacts match scoring potential' },
      ]
    },
    capabilities: {
      title: 'Capabilities (Climb, Trenches, Bumps, Fuel Handling)',
      guidance: [
        { score: '9-10', desc: 'High RUNG climb consistently, navigates trenches/bumps easily, handles fuel flawlessly' },
        { score: '7-8', desc: 'MID RUNG climb, handles most field elements well, good fuel control' },
        { score: '5-6', desc: 'LOW RUNG climb, occasional trench/bump issues, decent fuel handling' },
        { score: '3-4', desc: 'Parking only (no climb), struggles with obstacles, fuel handling issues' },
        { score: '1-2', desc: 'No climb, cannot navigate bumps/trenches, drops fuel constantly' },
      ]
    },
    playstyle: {
      title: 'Play Style / Role Execution',
      guidance: [
        { score: '9-10', desc: 'Clear role execution - offensive scorer, defensive specialist, or support/Human Player coordinator' },
        { score: '7-8', desc: 'Good role awareness, executes strategy well most of the match' },
        { score: '5-6', desc: 'Has a role but inconsistent execution, sometimes unsure when to score/defend' },
        { score: '3-4', desc: 'Unclear role, ineffective at both offense and defense' },
        { score: '1-2', desc: 'No clear role, ignores alliance strategy, hurts alliance performance' },
      ]
    },
  };
  
  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'auto', label: 'Auto' },
    { id: 'driver', label: 'Driver' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'defense', label: 'Defense' },
    { id: 'reliability', label: 'Reliability' },
    { id: 'speed', label: 'Speed' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'playstyle', label: 'Playstyle' },
  ] as const;
  
  const activeGuidance = fieldSpecificGuidance[activeTab];
  
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowHint(!showHint)}
        className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
        <span>Rating Guide</span>
      </button>
      
      {showHint && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-purple-200 bg-white p-3 shadow-xl dark:border-purple-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-purple-900 dark:text-purple-200">Star Rating Guide</span>
            <button onClick={() => setShowHint(false)} className="text-purple-400 hover:text-purple-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 mb-3 border-b border-purple-100 dark:border-purple-800 pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Content */}
          <div className="space-y-2">
            {activeTab === 'general' ? (
              <div className="space-y-1.5">
                {ratingDescriptions.map((item) => (
                  <div key={item.range} className="flex items-start gap-2 text-xs">
                    <span className="w-12 font-bold text-purple-700 dark:text-purple-300 shrink-0">{item.range}</span>
                    <span className="w-14 font-semibold text-purple-600 dark:text-purple-400 shrink-0">{item.label}</span>
                    <span className="text-slate-600 dark:text-slate-400">{item.desc}</span>
                  </div>
                ))}
              </div>
            ) : activeGuidance ? (
              <div>
                <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
                  {activeGuidance.title}
                </div>
                <div className="space-y-1.5">
                  {activeGuidance.guidance.map((item) => (
                    <div key={item.score} className="flex items-start gap-2 text-xs">
                      <span className="w-12 font-bold text-purple-700 dark:text-purple-300 shrink-0">{item.score}</span>
                      <span className="text-slate-600 dark:text-slate-400">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          
          <div className="mt-3 text-[10px] text-slate-500 dark:text-slate-400 italic border-t border-purple-100 dark:border-purple-800 pt-2">
            Ratings are based on scout observations during matches. All ratings are 0-10 scale.
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({ title, isOpen, onToggle, children }: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-purple-200/70 bg-white/85 shadow-xl shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 bg-purple-50/50 dark:bg-zinc-950/50 hover:bg-purple-100/50 dark:hover:bg-zinc-900/70 transition-colors"
      >
        <span className="text-lg font-bold text-purple-950 dark:text-white">{title}</span>
        <svg
          className={`w-5 h-5 text-purple-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="p-5">{children}</div>}
    </div>
  );
}

function ConfirmDialog({ isOpen, message, onConfirm, onCancel }: { isOpen: boolean; message: string; onConfirm: () => void; onCancel: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-purple-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="mb-4 text-lg font-bold text-purple-950 dark:text-white">Confirm Submission</h3>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">{message}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm font-bold text-purple-900 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-purple-200 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white hover:bg-purple-700"
          >
            Submit Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [avgAutoScore, setAvgAutoScore] = useState(0);
  const [humanPlayerAutoCount, setHumanPlayerAutoCount] = useState(0);

  const [intakeConsistency, setIntakeConsistency] = useState(0);
  const [shooterConsistency, setShooterConsistency] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [speedRating, setSpeedRating] = useState(0);
  const [accuracyRating, setAccuracyRating] = useState(0);
  const [humanPlayerCount, setHumanPlayerCount] = useState(0);
  const [shootingPositionMaps, setShootingPositionMaps] = useState<FieldSelection[]>([]);
  const [defenseRating, setDefenseRating] = useState(0);
  const [defended, setDefended] = useState(false);
  const [wasDefended, setWasDefended] = useState(false);
  const [defenseQuality, setDefenseQuality] = useState(0);
  const [primaryRole, setPrimaryRole] = useState<MatchRole>('mixed');
  const [brokeInTeleop, setBrokeInTeleop] = useState(false);
  const [disabledInTeleop, setDisabledInTeleop] = useState(false);

  const [climbLevel, setClimbLevel] = useState<ClimbLevel>('None');
  const [robotReliabilityRating, setRobotReliabilityRating] = useState(0);
  const [endgameScoringImpact, setEndgameScoringImpact] = useState(0);
  const [overallMatchImpact, setOverallMatchImpact] = useState(0);
  const [climbAttempted, setClimbAttempted] = useState(true);
  const [climbFailed, setClimbFailed] = useState(false);
  const [disabledInEndgame, setDisabledInEndgame] = useState(false);
  const [robotImproved, setRobotImproved] = useState(false);
  const [matchComments, setMatchComments] = useState('');
  const [activeSection, setActiveSection] = useState<ScoutSectionId>('auton');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const [hasLoadedExistingSubmission, setHasLoadedExistingSubmission] = useState(false);

  const ratingHints = {
    auto: {
      title: 'Auto Scoring (Points)',
      guidance: [
        { score: '9-10', desc: 'Elite: 70+ points, max efficiency, scores constantly' },
        { score: '7-8', desc: 'Strong: 50-69 points, consistent scoring, good pace' },
        { score: '5-6', desc: 'Decent: 30-49 points, some scoring, misses some' },
        { score: '3-4', desc: 'Weak: 10-29 points, minimal scoring, struggles' },
        { score: '1-2', desc: 'Poor: 0-9 points, barely scores or none at all' },
      ]
    },
    intake: {
      title: 'Intake (Picking Up Fuel)',
      guidance: [
        { score: '9-10', desc: 'Fast pickup from anywhere, never drops, handles multiple balls easily' },
        { score: '7-8', desc: 'Reliable pickup, rarely drops, good from depot' },
        { score: '5-6', desc: 'Decent pickup, occasional drops, works most of the time' },
        { score: '3-4', desc: 'Slow pickup, frequent drops, struggles with floor fuel' },
        { score: '1-2', desc: 'Cannot pick up fuel, drops everything, intake broken' },
      ]
    },
    shooter: {
      title: 'Shooter (Getting Fuel in Hub)',
      guidance: [
        { score: '9-10', desc: 'Every shot scores, consistent power, no jams, fast firing' },
        { score: '7-8', desc: 'Most shots score, reliable, occasional adjustment needed' },
        { score: '5-6', desc: 'Some shots miss, inconsistent power, occasional jams' },
        { score: '3-4', desc: 'Many misses, weak shots, frequent jams/mechanical issues' },
        { score: '1-2', desc: 'Almost nothing scores, constant jams, shooter barely works' },
      ]
    },
    driver: {
      title: 'Driver Skill (Navigation & Control)',
      guidance: [
        { score: '9-10', desc: 'Smooth over bumps, fast under trenches, precise hub alignment, never hits things' },
        { score: '7-8', desc: 'Good control, efficient routes, minimal bumping, decent alignment' },
        { score: '5-6', desc: 'Average driving, some hesitation on bumps/trenches, okay alignment' },
        { score: '3-4', desc: 'Struggles with obstacles, slow alignment, bumps into field elements' },
        { score: '1-2', desc: 'Cannot clear bumps/trenches, hits everything, unsafe driving' },
      ]
    },
    speed: {
      title: 'Speed (How Fast They Score)',
      guidance: [
        { score: '9-10', desc: 'Lightning fast: back-to-back scoring, minimal downtime, fastest robot' },
        { score: '7-8', desc: 'Fast cycles: quick transitions, little waiting, above average' },
        { score: '5-6', desc: 'Average speed: standard pace between shots, some downtime' },
        { score: '3-4', desc: 'Slow: long pauses, struggles to get to hub, lots of downtime' },
        { score: '1-2', desc: 'Very slow: barely scores, gets lost, significant dead time' },
      ]
    },
    accuracy: {
      title: 'Accuracy (Shots vs Misses)',
      guidance: [
        { score: '9-10', desc: 'Almost perfect: 90%+ make it in, no wasted shots' },
        { score: '7-8', desc: 'Good: 70-89% success, most attempts score' },
        { score: '5-6', desc: 'Average: 50-69% success, about half make it' },
        { score: '3-4', desc: 'Poor: 30-49% success, more misses than makes' },
        { score: '1-2', desc: 'Terrible: <30% success, constant misses, fuel everywhere' },
      ]
    },
    defense: {
      title: 'Defense (Blocking Opponents)',
      guidance: [
        { score: '9-10', desc: 'Elite: shuts down opponents, forces misses, smart positioning' },
        { score: '7-8', desc: 'Good: effective blocks, disrupts cycles, stays on their side' },
        { score: '5-6', desc: 'Average: some good plays, in right place sometimes' },
        { score: '3-4', desc: 'Poor: just chases, ineffective, out of position' },
        { score: '1-2', desc: 'Harmful: penalties, blocks own team, no effective defense' },
      ]
    },
    reliability: {
      title: 'Reliability (Does Robot Work?)',
      guidance: [
        { score: '9-10', desc: 'Perfect: everything works all match, no issues' },
        { score: '7-8', desc: 'Reliable: minor hiccups, quick recovery' },
        { score: '5-6', desc: 'Mostly works: occasional problems, one system may fail' },
        { score: '3-4', desc: 'Unreliable: frequent breakdowns, dead on field' },
        { score: '1-2', desc: 'Broken: constant failures, cannot complete match' },
      ]
    },
    overall: {
      title: 'Overall Impact (Would You Pick Them?)',
      guidance: [
        { score: '9-10', desc: 'Must-pick: game changer, carried match, elite performer' },
        { score: '7-8', desc: 'Strong pick: solid contributor, improves alliance' },
        { score: '5-6', desc: 'Okay pick: decent, does their job, replaceable' },
        { score: '3-4', desc: 'Weak pick: minimal help, better options exist' },
        { score: '1-2', desc: 'Avoid: hurt alliance, liability, do not pick' },
      ]
    },
  };

  const setOpenSections = (value: Set<ScoutSectionId>) => {
    const first = Array.from(value)[0];
    if (first) setActiveSection(first);
  };

  const checkMissingFields = () => {
    const missing: string[] = [];
    
    if (startingPositionMap === null) missing.push('Starting Position');
    if (autoScoringRating === 0) missing.push('Auto Scoring');
    if (intakeConsistency === 0) missing.push('Intake');
    if (shooterConsistency === 0) missing.push('Shooter');
    if (driverRating === 0) missing.push('Driver');
    if (speedRating === 0) missing.push('Speed');
    if (accuracyRating === 0) missing.push('Accuracy');
    if (defenseRating === 0 && defended) missing.push('Defense');
    if (climbAttempted && climbLevel === 'None') missing.push('Climb Level');
    if (robotReliabilityRating === 0) missing.push('Reliability');
    if (overallMatchImpact === 0) missing.push('Overall Impact');
    
    return missing;
  };

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
    setAvgAutoScore(0);
    setHumanPlayerAutoCount(0);
    setIntakeConsistency(0);
    setShooterConsistency(0);
    setDriverRating(0);
    setSpeedRating(0);
    setAccuracyRating(0);
    setHumanPlayerCount(0);
    setShootingPositionMaps([]);
    setDefenseRating(0);
    setDefended(false);
    setWasDefended(false);
    setDefenseQuality(0);
    setPrimaryRole('mixed');
    setBrokeInTeleop(false);
    setDisabledInTeleop(false);
    setClimbLevel('None');
    setRobotReliabilityRating(0);
    setEndgameScoringImpact(0);
    setOverallMatchImpact(0);
    setClimbAttempted(true);
    setClimbFailed(false);
    setDisabledInEndgame(false);
    setRobotImproved(false);
    setMatchComments('');
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
        const existingSnap = await getDocFromServer(doc(db, 'years', trimmedYear, 'regionals', trimmedRegional, 'teams', String(numericTeam), 'matches', docId));

        if (!existingSnap.exists()) {
          setHasLoadedExistingSubmission(true);
          return;
        }

        const data = existingSnap.data() as Record<string, any>;
        setStartingPositionMap(toPoint(data['Starting Position X'], data['Starting Position Y']));
        setCrossedAutoLine(Boolean(data['Crossed Auto Line']));
        setAutoScoringRating(Number(data['Auto Scoring Rating'] || 0));
        setHumanPlayerAutoCount(Number(data['Human Player Auto Count'] || 0));
        setIntakeConsistency(Number(data['Intake Consistency'] || 0));
        setShooterConsistency(Number(data['Shooter Consistency'] || 0));
        setDriverRating(Number(data['Driver Rating'] || 0));
        setSpeedRating(Number(data['Speed Rating'] || 0));
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
        setDisabledInTeleop(Boolean(data['Disabled In Teleop']));
        setClimbLevel((data['Climb Level'] as ClimbLevel) || 'None');
        setRobotReliabilityRating(Number(data['Robot Reliability Rating'] || 0));
        setEndgameScoringImpact(Number(data['Endgame Scoring Impact'] || 0));
        setOverallMatchImpact(Number(data['Overall Match Impact'] || 0));
        setClimbAttempted(Boolean(data['Climb Attempted'] ?? true));
        setClimbFailed(Boolean(data['Climb Failed']));
        setDisabledInEndgame(Boolean(data['Disabled In Endgame']));
        setRobotImproved(Boolean(data['Robot Improved']));
        setMatchComments(String(data['Match Comments'] || data['Endgame Comments'] || ''));
        setActiveSection('auton');
        setSuccess('Loaded existing data for editing.');
        setHasLoadedExistingSubmission(true);
        setHasLoadedExistingSubmission(true);
      } catch {
      } finally {
        setHasLoadedExistingSubmission(true);
      }
    };

    loadExistingSubmission();
  }, [hasLoadedExistingSubmission, isLoadingDefaults, matchNumber, regional, teamNumber, user, year]);

  const scoutName = useMemo(() => userData?.name || user?.displayName || user?.email || 'Web Scout', [user, userData]);
  const isPractice = regional.trim().toLowerCase() === 'practice';

  const handleSubmitClick = (event: FormEvent) => {
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
    
    const missing = checkMissingFields();
    if (missing.length > 0) {
      setConfirmMessage(`You have not filled out: ${missing.join(', ')}. Submit anyway?`);
      setShowConfirmDialog(true);
      return;
    }
    
    doSubmit();
  };

  const doSubmit = async () => {
    setShowConfirmDialog(false);
    setIsSaving(true);
    setError('');
    setSuccess('');

    const trimmedYear = year.trim();
    const trimmedRegional = regional.trim().toLowerCase();
    const numericMatch = Number(matchNumber);
    const numericTeam = Number(teamNumber);
    
    try {
      const nowIso = new Date().toISOString();
      const docId = `qm${numericMatch}_${user!.uid}`;
      const primaryShotPoint = shootingPositionMaps[0] || null;

      const matchData = {
        matchNumber: numericMatch,
        teamNumber: numericTeam,
        year: trimmedYear,
        regional: trimmedRegional,
        timestamp: nowIso,
        scoutUid: user!.uid,
        scoutName,
        'Starting Position X': startingPositionMap?.x || 0,
        'Starting Position Y': startingPositionMap?.y || 0,
        'Crossed Auto Line': crossedAutoLine,
        'Avg Auto Score': avgAutoScore,
        'Human Player Auto Count': humanPlayerAutoCount,
        'Intake Consistency': intakeConsistency,
        'Shooter Consistency': shooterConsistency,
        'Driver Rating': driverRating,
        'Speed Rating': speedRating,
        'Accuracy Rating': accuracyRating,
        'Shooting Position X': primaryShotPoint?.x || 0,
        'Shooting Position Y': primaryShotPoint?.y || 0,
        'Shooting Positions': shootingPositionMaps,
        'Human Player Count': humanPlayerCount,
        'Defense Rating': defenseRating,
        'Defended': defended,
        'Was Defended': wasDefended,
        'Primary Role': primaryRole,
        'Broke In Teleop': brokeInTeleop,
        'Disabled In Teleop': disabledInTeleop,
        'Climb Level': climbLevel,
        'Robot Reliability Rating': robotReliabilityRating,
        'Overall Match Impact': overallMatchImpact,
        'Climb Attempted': climbAttempted,
        'Climb Failed': climbFailed,
        'Disabled In Endgame': disabledInEndgame,
        'Robot Improved': robotImproved,
        'Match Comments': matchComments.trim(),
      };

      const payload = {
        year: trimmedYear,
        regional: trimmedRegional,
        teamNumber: numericTeam,
        matchNumber: numericMatch,
        scoutUid: user!.uid,
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

        <ConfirmDialog
          isOpen={showConfirmDialog}
          message={confirmMessage}
          onConfirm={doSubmit}
          onCancel={() => setShowConfirmDialog(false)}
        />

        <form onSubmit={handleSubmitClick} className="space-y-4 pb-28">
          <section className="grid gap-4 sm:grid-cols-4">
            <Field label="Year"><input value={year} onChange={(e) => setYear(e.target.value)} className={inputClassName} required /></Field>
            <Field label="Regional"><input value={regional} onChange={(e) => setRegional(e.target.value)} className={inputClassName} required /></Field>
            <Field label="Match"><input value={matchNumber} onChange={(e) => setMatchNumber(e.target.value)} inputMode="numeric" placeholder={isPractice ? 'Enter practice match' : ''} className={inputClassName} required /></Field>
            <Field label="Team"><input value={teamNumber} onChange={(e) => setTeamNumber(e.target.value)} inputMode="numeric" placeholder={isPractice ? 'Enter practice team' : ''} className={inputClassName} required /></Field>
          </section>

          <Section hidden={activeSection !== 'auton'}>
            <div className="space-y-4">
              <RebuiltFieldMapSelector label="Start Map" value={startingPositionMap} onChange={setStartingPositionMap} />
              <ToggleField label="Crossed Auto Line" value={crossedAutoLine} onChange={setCrossedAutoLine} />
              <StarRatingInput label="Auto Scoring" value={autoScoringRating} onChange={setAutoScoringRating} hint={ratingHints.auto} />
              <Field label="Avg Auto Score (0-140)">
                <div className="rounded-xl border border-purple-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="mb-3 text-sm font-bold text-purple-950 dark:text-purple-200">{avgAutoScore} pts</div>
                  <input type="range" min="0" max="140" step="1" value={avgAutoScore} onChange={(e) => setAvgAutoScore(Number(e.target.value))} className="w-full accent-purple-600" />
                  <div className="mt-2 flex justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span>0</span><span>35</span><span>70</span><span>105</span><span>140</span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">Estimated auto points: taxi + scoring + preload</p>
              </Field>
              <SliderField label="HP Auto" value={humanPlayerAutoCount} onChange={setHumanPlayerAutoCount} />
            </div>
          </Section>

          <Section hidden={activeSection !== 'teleop'}>
            {/* Shooting Map at top of Teleop */}
            <div className="space-y-4">
              <RebuiltFieldMapSelector
                label="Shoot Map"
                values={shootingPositionMaps}
                onChangeMany={setShootingPositionMaps}
                helperText={`${shootingPositionMaps.length} shot${shootingPositionMaps.length === 1 ? '' : 's'} marked`}
              />
              <div className="flex justify-end items-center">
                <button
                  type="button"
                  onClick={() => setShootingPositionMaps([])}
                  className="rounded-lg border border-purple-200 bg-white px-4 py-2 text-sm font-bold text-purple-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200"
                >
                  Clear Shots
                </button>
              </div>
              <StarRatingInput label="Intake" value={intakeConsistency} onChange={setIntakeConsistency} hint={ratingHints.intake} />
              <StarRatingInput label="Shooter" value={shooterConsistency} onChange={setShooterConsistency} hint={ratingHints.shooter} />
              <StarRatingInput label="Driver" value={driverRating} onChange={setDriverRating} hint={ratingHints.driver} />
              <StarRatingInput label="Speed" value={speedRating} onChange={setSpeedRating} hint={ratingHints.speed} />
              <StarRatingInput label="Accuracy" value={accuracyRating} onChange={setAccuracyRating} hint={ratingHints.accuracy} />
              <SliderField label="HP Scored" value={humanPlayerCount} onChange={setHumanPlayerCount} />
              <SimpleSelect label="Role" value={primaryRole} onChange={setPrimaryRole} options={['offense', 'defense', 'mixed']} />
              <ToggleField label="Did Defend" value={defended} onChange={setDefended} />
              {defended && (
                <StarRatingInput label="Defense" value={defenseRating} onChange={setDefenseRating} hint={ratingHints.defense} />
              )}
              <ToggleField label="Was Defended" value={wasDefended} onChange={setWasDefended} />
            </div>
          </Section>

          <Section hidden={activeSection !== 'endgame'}>
            <div className="space-y-4">
              <ToggleField label="Climb Attempted" value={climbAttempted} onChange={setClimbAttempted} />
              {climbAttempted && (
                <>
                  <SimpleSelect label="Climb Level" value={climbLevel} onChange={setClimbLevel} options={['None', 'Level 1', 'Level 2', 'Level 3']} />
                  <ToggleField label="Climb Failed" value={climbFailed} onChange={setClimbFailed} />
                </>
              )}
              <StarRatingInput label="Reliability" value={robotReliabilityRating} onChange={setRobotReliabilityRating} hint={ratingHints.reliability} />
              <StarRatingInput label="Overall Impact" value={overallMatchImpact} onChange={setOverallMatchImpact} hint={ratingHints.overall} />
              <ToggleField label="Disabled" value={disabledInEndgame} onChange={setDisabledInEndgame} />
              <ToggleField label="Robot Improved" value={robotImproved} onChange={setRobotImproved} />
              <Field label="Match Comments"><textarea value={matchComments} onChange={(e) => setMatchComments(e.target.value)} rows={4} className={`${inputClassName} resize-y`} /></Field>
            </div>
          </Section>

          {/* Bottom Navbar */}
          <ScoutSectionNav activeSection={activeSection} onChange={setActiveSection} />

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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-3xl rounded-xl border border-purple-200/70 bg-white/95 p-2 shadow-xl shadow-purple-900/20 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
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
