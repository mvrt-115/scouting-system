'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Bot, Send, ListOrdered, ChevronRight, Loader2, Clock, Plus, Trash2, Save, Sparkles, AlertCircle, Paperclip, Mic, MicOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDocsFromServer, doc, setDoc, getDoc, getDocFromServer, query, where } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePageVisibility } from '@/hooks/usePageVisibility';

export default function Picklist() {
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hello! I am the MVRT Super Scout AI. I have access to all our scouting data and super scout reports. I can help you analyze team performance, compare capabilities, and build your optimal picklist. What would you like to know?' }
  ]);
  const [input, setInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [picklistSuggestion, setPicklistSuggestion] = useState<{
    suggestedOrder: string[];
    reasoning: string;
    added: string[];
    removed: string[];
  } | null>(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInput(prev => prev + ' ' + transcript);
          setIsRecording(false);
        };
        recognitionRef.current.onend = () => setIsRecording(false);
        recognitionRef.current.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsRecording(false);
        };
      } else {
        console.warn("Speech recognition not supported in this browser.");
      }
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };
  
  const [teams, setTeams] = useState<any[]>([]);
  const [picklist, setPicklist] = useState<any[]>([]);
  const [teamMatchesByTeam, setTeamMatchesByTeam] = useState<Record<string, any[]>>({});
  const [teamMatchDocCount, setTeamMatchDocCount] = useState(0);
  const [superScoutData, setSuperScoutData] = useState<any[]>([]);
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const { user, userData, isAuthChecking, isApproved } = useAuth();
  const { pageVisibility, isLoadingVisibility } = usePageVisibility();
  const router = useRouter();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Get current event
      const eventDoc = await getDocFromServer(doc(db, 'settings', 'currentEvent'));
      if (!eventDoc.exists()) {
        setError('Current event not set. Please set it in the Admin panel.');
        setIsLoading(false);
        return;
      }
      const event = eventDoc.data();
      setCurrentEvent(event);

      // 2. Get all teams for this event
      const teamsRef = collection(db, `years/${event.year}/regionals/${event.regional}/teams`);
      const teamsSnap = await getDocsFromServer(teamsRef);
      const teamsList = teamsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const sortedTeams = teamsList.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      setTeams(sortedTeams);

      // 3. Get per-team match docs (source of truth for match-by-match analysis)
      const matchEntries = await Promise.all(
        sortedTeams.map(async (team) => {
          const matchesRef = collection(db, `years/${event.year}/regionals/${event.regional}/teams/${team.id}/matches`);
          const matchesSnap = await getDocsFromServer(matchesRef);
          const matches = matchesSnap.docs.map((matchDoc) => ({
            id: matchDoc.id,
            ...matchDoc.data()
          }));
          return [String(team.id), matches] as const;
        })
      );

      const matchesByTeam = Object.fromEntries(matchEntries);
      setTeamMatchesByTeam(matchesByTeam);
      setTeamMatchDocCount(matchEntries.reduce((sum, [, matches]) => sum + matches.length, 0));

      // 4. Get super scout data
      const superScoutRef = collection(db, `years/${event.year}/regionals/${event.regional}/super_scouting`);
      const superScoutSnap = await getDocsFromServer(superScoutRef);
      setSuperScoutData(superScoutSnap.docs.map(doc => doc.data()));

      // 5. Get existing picklist - now under regional path
      const picklistDoc = await getDocFromServer(doc(db, `years/${event.year}/regionals/${event.regional}/picklists`, 'main'));
      if (picklistDoc.exists()) {
        const savedTeams = picklistDoc.data().teams || [];
        // Merge saved picklist with full team data
        const mergedPicklist = savedTeams.map((savedTeam: any) => {
          const fullTeam = sortedTeams.find((t: any) => String(t.id) === String(savedTeam.id));
          return fullTeam || savedTeam;
        });
        setPicklist(mergedPicklist);
      }
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    } else if (user && isApproved) {
      fetchData();
    }
  }, [user, isAuthChecking, isApproved, router, fetchData]);

  useEffect(() => {
    if (!isLoadingVisibility && !pageVisibility.showPicklist) {
      router.push('/dashboard');
    }
  }, [isLoadingVisibility, pageVisibility.showPicklist, router]);

  const handleSavePicklist = async () => {
    if (!currentEvent) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, `years/${currentEvent.year}/regionals/${currentEvent.regional}/picklists`, 'main'), {
        teams: picklist,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.email
      });
      alert('Picklist saved successfully!');
    } catch (err: any) {
      alert('Error saving picklist: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const addToPicklist = (team: any) => {
    if (picklist.find(t => t.id === team.id)) return;
    setPicklist([...picklist, team]);
  };

  const removeFromPicklist = (teamId: string) => {
    setPicklist(picklist.filter(t => t.id !== teamId));
  };

  const moveInPicklist = (index: number, direction: 'up' | 'down') => {
    const newPicklist = [...picklist];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newPicklist.length) return;
    
    const temp = newPicklist[index];
    newPicklist[index] = newPicklist[targetIndex];
    newPicklist[targetIndex] = temp;
    setPicklist(newPicklist);
  };

  const applyPicklistSuggestion = () => {
    if (!picklistSuggestion) return;
    
    // Build new picklist from suggested order
    const newPicklist = picklistSuggestion.suggestedOrder.map(teamId => {
      // First try to find in current picklist
      const existing = picklist.find(t => String(t.id) === String(teamId));
      if (existing) return existing;
      // Otherwise find in available teams
      return teams.find(t => String(t.id) === String(teamId));
    }).filter(Boolean);
    
    setPicklist(newPicklist);
    setShowSuggestionModal(false);
    setPicklistSuggestion(null);
  };

  const rejectPicklistSuggestion = () => {
    setShowSuggestionModal(false);
    setPicklistSuggestion(null);
  };

  const generateDataSummary = () => {
    const summary: any = {};

    const toNumber = (value: unknown) => {
      if (typeof value === 'number') return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const getClimbPoints = (level?: string) => {
      switch ((level || '').toLowerCase()) {
        case 'low':
          return 2;
        case 'mid':
          return 4;
        case 'high':
          return 6;
        case 'traversal':
        case 'deep':
          return 10;
        case 'shallow':
          return 5;
        default:
          return 0;
      }
    };

    const parseNumberList = (value: unknown) => {
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return 0;
      const matches = value.match(/-?\d+(?:\.\d+)?/g);
      if (!matches) return 0;
      return matches.reduce((sum, token) => sum + toNumber(token), 0);
    };

    const getField = (record: Record<string, any>, candidates: string[]) => {
      for (const key of candidates) {
        if (record[key] !== undefined) return record[key];
      }

      const entries = Object.entries(record);
      for (const key of candidates) {
        const normalizedCandidate = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const found = entries.find(([entryKey]) => entryKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedCandidate);
        if (found) return found[1];
      }

      return undefined;
    };

    const ensureTeamSummary = (team: string) => {
      if (!summary[team]) {
        summary[team] = {
          matches: 0,
          // Legacy score fields (for older games)
          auto: 0,
          teleop: 0,
          endgame: 0,
          autoMissed: 0,
          teleMissed: 0,
          autoTaxiCount: 0,
          defenseTotal: 0,
          drivingTotal: 0,
          cycleTimeTotal: 0,
          cycleTimeSamples: 0,
          // 2026 Rating fields
          ratings: {
            overall: [],
            auto: [],
            autoAccuracy: [],
            driver: [],
            speed: [],
            scoring: [],
            accuracy: [],
            defense: [],
            reliability: [],
          },
          hpAutoTotal: 0,
          hpTotal: 0,
          climbAttempts: 0,
          climbSuccesses: 0,
          roles: [],
          notes: [],
          superNotes: [],
          allianceNotes: [],
          matchBreakdown: []
        };
      }
      return summary[team];
    };

    // Primary source: match-by-match team docs in years/{year}/regionals/{regional}/teams/{team}/matches
    Object.entries(teamMatchesByTeam).forEach(([team, matches]) => {
      const teamSummary = ensureTeamSummary(team);
      const matchList = Array.isArray(matches) ? matches : [];

      matchList.forEach((matchDoc: any) => {
        const autoUpper = toNumber(getField(matchDoc, ['autoUpper', 'Auto Upper', 'auto upper']));
        const autoLower = toNumber(getField(matchDoc, ['autoLower', 'Auto Lower', 'auto lower']));
        const teleUpper = toNumber(getField(matchDoc, ['teleUpper', 'Tele Upper', 'tele upper']));
        const teleLower = toNumber(getField(matchDoc, ['teleLower', 'Tele Lower', 'tele lower']));

        const autoFuelScored = parseNumberList(getField(matchDoc, ['FUEL Scored in HUB', 'FUEL Scored in Auto HUB', 'FUEL Scored in Active HUB']));
        const teleFuelScored =
          parseNumberList(getField(matchDoc, ['FUEL Scored in Active HUB'])) +
          parseNumberList(getField(matchDoc, ['HP FUEL Scored'])) +
          parseNumberList(getField(matchDoc, ['FUEL Scored in End Game']));

        const autoScore = autoUpper + autoLower + autoFuelScored;
        const teleopScore = teleUpper + teleLower + teleFuelScored;

        const climbLevel = String(
          getField(matchDoc, ['climbLevel', 'Final Climb Level', 'Auto Climb Level']) || 'None'
        );
        const endgamePoints = getClimbPoints(climbLevel);

        const autoMissed = toNumber(getField(matchDoc, ['autoMissed'])) + parseNumberList(getField(matchDoc, ['FUEL Missed']));
        const teleMissed = toNumber(getField(matchDoc, ['teleMissed']));
        const autoTaxi = Boolean(getField(matchDoc, ['autoTaxi', 'Crossed Auto Line']));
        const defenseRating = toNumber(getField(matchDoc, ['defenseRating', 'Defense Rating']));
        const drivingSkill = toNumber(getField(matchDoc, ['drivingSkill', 'Defense Impact']));
        const cycleTime = toNumber(getField(matchDoc, ['cycleTimeMs', 'Intake to Score Cycle', 'Climb Time']));
        const comment =
          getField(matchDoc, ['comments', 'notes', 'Match Comments']) ||
          getField(matchDoc, ['Overall Notes']);

        // 2026 specific fields
        const overallRating = toNumber(getField(matchDoc, ['Overall Match Impact']));
        const autoRating = toNumber(getField(matchDoc, ['Auto Scoring Rating']));
        const autoAccuracyRating = toNumber(getField(matchDoc, ['Auto Accuracy Rating']));
        const driverRating = toNumber(getField(matchDoc, ['Driver Rating']));
        const speedRating = toNumber(getField(matchDoc, ['Speed Rating']));
        const scoringRating = toNumber(getField(matchDoc, ['Scoring Threat Rating']));
        const accuracyRating = toNumber(getField(matchDoc, ['Accuracy Rating']));
        const defenseRating2026 = toNumber(getField(matchDoc, ['Defense Rating']));
        const reliabilityRating = toNumber(getField(matchDoc, ['Robot Reliability Rating']));
        const hpAuto = toNumber(getField(matchDoc, ['Human Player Auto Count']));
        const hp = toNumber(getField(matchDoc, ['Human Player Count']));
        const climbAttempted = Boolean(getField(matchDoc, ['Climb Attempted']));
        const climbFailed = Boolean(getField(matchDoc, ['Climb Failed']));
        const role = String(getField(matchDoc, ['Primary Role']) || '');

        teamSummary.matches++;
        teamSummary.auto += autoScore;
        teamSummary.teleop += teleopScore;
        teamSummary.endgame += endgamePoints;
        teamSummary.autoMissed += autoMissed;
        teamSummary.teleMissed += teleMissed;
        teamSummary.autoTaxiCount += autoTaxi ? 1 : 0;
        teamSummary.defenseTotal += defenseRating;
        teamSummary.drivingTotal += drivingSkill;

        // Collect 2026 ratings
        if (overallRating > 0) teamSummary.ratings.overall.push(overallRating);
        if (autoRating > 0) teamSummary.ratings.auto.push(autoRating);
        if (autoAccuracyRating > 0) teamSummary.ratings.autoAccuracy.push(autoAccuracyRating);
        if (driverRating > 0) teamSummary.ratings.driver.push(driverRating);
        if (speedRating > 0) teamSummary.ratings.speed.push(speedRating);
        if (scoringRating > 0) teamSummary.ratings.scoring.push(scoringRating);
        if (accuracyRating > 0) teamSummary.ratings.accuracy.push(accuracyRating);
        if (defenseRating2026 > 0) teamSummary.ratings.defense.push(defenseRating2026);
        if (reliabilityRating > 0) teamSummary.ratings.reliability.push(reliabilityRating);

        teamSummary.hpAutoTotal += hpAuto;
        teamSummary.hpTotal += hp;
        if (climbAttempted) {
          teamSummary.climbAttempts++;
          if (!climbFailed) teamSummary.climbSuccesses++;
        }
        if (role) teamSummary.roles.push(role);

        if (cycleTime > 0) {
          teamSummary.cycleTimeTotal += cycleTime;
          teamSummary.cycleTimeSamples += 1;
        }

        if (comment) teamSummary.notes.push(String(comment));

        teamSummary.matchBreakdown.push({
          matchId: matchDoc.id || null,
          matchNumber: getField(matchDoc, ['matchNumber', 'match']) || null,
          autoScore,
          teleopScore,
          endgamePoints,
          autoTaxi,
          climbLevel,
          breakdown: Boolean(getField(matchDoc, ['brokeDown', 'Broke Down'])),
          fouls: toNumber(getField(matchDoc, ['foulsCommitted', 'Fouls Committed'])),
          comments: comment || null
        });
      });
    });

    // Add super scout reports
    superScoutData.forEach(d => {
      const teamsInReport = Array.isArray(d.teams) ? d.teams : [];
      teamsInReport.forEach((teamValue: string | number) => {
        const team = String(teamValue);
        const teamSummary = ensureTeamSummary(team);

        if (d.data.teamSpecificNotes?.[team]) {
          teamSummary.superNotes.push(d.data.teamSpecificNotes[team]);
        }

        const overallNotes = [d.data?.strategy, d.data?.coordination, d.data?.defense, d.data?.fouls, d.data?.overallNotes]
          .filter(Boolean)
          .join(' | ');
        if (overallNotes) {
          teamSummary.allianceNotes.push(`Match ${d.matchNumber || '?'} ${d.alliance || ''}: ${overallNotes}`.trim());
        }
      });
    });

    // Calculate averages and add team names
    Object.keys(summary).forEach(team => {
      const s = summary[team];
      if (s.matches > 0) {
        s.avgAuto = (s.auto / s.matches).toFixed(1);
        s.avgTeleop = (s.teleop / s.matches).toFixed(1);
        s.avgEndgame = (s.endgame / s.matches).toFixed(1);
        s.autoTaxiRate = ((s.autoTaxiCount / s.matches) * 100).toFixed(0) + '%';
        s.avgDefense = (s.defenseTotal / s.matches).toFixed(1);
        s.avgDriving = (s.drivingTotal / s.matches).toFixed(1);
        
        // 2026 rating averages
        s.avgRatings = {
          overall: s.ratings.overall.length > 0 ? (s.ratings.overall.reduce((a: number, b: number) => a + b, 0) / s.ratings.overall.length).toFixed(1) : '0.0',
          auto: s.ratings.auto.length > 0 ? (s.ratings.auto.reduce((a: number, b: number) => a + b, 0) / s.ratings.auto.length).toFixed(1) : '0.0',
          autoAccuracy: s.ratings.autoAccuracy.length > 0 ? (s.ratings.autoAccuracy.reduce((a: number, b: number) => a + b, 0) / s.ratings.autoAccuracy.length).toFixed(1) : '0.0',
          driver: s.ratings.driver.length > 0 ? (s.ratings.driver.reduce((a: number, b: number) => a + b, 0) / s.ratings.driver.length).toFixed(1) : '0.0',
          speed: s.ratings.speed.length > 0 ? (s.ratings.speed.reduce((a: number, b: number) => a + b, 0) / s.ratings.speed.length).toFixed(1) : '0.0',
          scoring: s.ratings.scoring.length > 0 ? (s.ratings.scoring.reduce((a: number, b: number) => a + b, 0) / s.ratings.scoring.length).toFixed(1) : '0.0',
          accuracy: s.ratings.accuracy.length > 0 ? (s.ratings.accuracy.reduce((a: number, b: number) => a + b, 0) / s.ratings.accuracy.length).toFixed(1) : '0.0',
          defense: s.ratings.defense.length > 0 ? (s.ratings.defense.reduce((a: number, b: number) => a + b, 0) / s.ratings.defense.length).toFixed(1) : '0.0',
          reliability: s.ratings.reliability.length > 0 ? (s.ratings.reliability.reduce((a: number, b: number) => a + b, 0) / s.ratings.reliability.length).toFixed(1) : '0.0',
        };
        s.avgHpAuto = (s.hpAutoTotal / s.matches).toFixed(1);
        s.avgHp = (s.hpTotal / s.matches).toFixed(1);
        s.climbRate = s.climbAttempts > 0 ? ((s.climbSuccesses / s.climbAttempts) * 100).toFixed(0) + '%' : '0%';
        s.preferredRole = s.roles.length > 0 ? s.roles.sort((a: string, b: string) =>
          s.roles.filter((v: string) => v === a).length - s.roles.filter((v: string) => v === b).length
        ).pop() : '-';
      } else {
        s.avgAuto = '0.0';
        s.avgTeleop = '0.0';
        s.avgEndgame = '0.0';
        s.autoTaxiRate = '0%';
        s.avgDefense = '0.0';
        s.avgDriving = '0.0';
        s.avgRatings = {
          overall: '0.0', auto: '0.0', autoAccuracy: '0.0', driver: '0.0',
          speed: '0.0', scoring: '0.0', accuracy: '0.0', defense: '0.0', reliability: '0.0'
        };
        s.avgHpAuto = '0.0';
        s.avgHp = '0.0';
        s.climbRate = '0%';
        s.preferredRole = '-';
      }

      s.avgCycleTimeMs = s.cycleTimeSamples > 0 ? Math.round(s.cycleTimeTotal / s.cycleTimeSamples) : 0;
      s.notes = s.notes.slice(0, 5);
      s.superNotes = s.superNotes.slice(0, 5);
      s.allianceNotes = s.allianceNotes.slice(0, 5);
      s.matchBreakdown = s.matchBreakdown
        .sort((a: any, b: any) => toNumber(a.matchNumber) - toNumber(b.matchNumber))
        .slice(0, 25);
      
      const teamInfo = teams.find(t => t.id === team);
      if (teamInfo) {
        s.teamName = teamInfo.name;
        s.city = teamInfo.city;
      }
    });

    return summary;
  };

  const buildAiContext = (userMessage: string, dataSummary: Record<string, any>) => {
    const requestedTeamNumbers = Array.from(new Set((userMessage.match(/\b\d{2,5}\b/g) || [])));
    const requestedTeams = requestedTeamNumbers.filter((team) => dataSummary[team]);

    const averagedSummary = Object.fromEntries(
      Object.entries(dataSummary).map(([team, stats]) => [
        team,
        {
          teamName: stats.teamName || null,
          city: stats.city || null,
          matches: stats.matches,
          // Legacy
          avgAuto: stats.avgAuto,
          avgTeleop: stats.avgTeleop,
          avgEndgame: stats.avgEndgame,
          avgDefense: stats.avgDefense,
          avgDriving: stats.avgDriving,
          // 2026 Ratings (0-10 scale)
          ratings: stats.avgRatings || {},
          avgHpAuto: stats.avgHpAuto,
          avgHp: stats.avgHp,
          climbRate: stats.climbRate,
          preferredRole: stats.preferredRole,
          avgCycleTimeMs: stats.avgCycleTimeMs,
          sampleNotes: [
            ...(stats.notes || []),
            ...(stats.superNotes || []),
            ...(stats.allianceNotes || [])
          ].slice(0, 3)
        }
      ])
    );

    const requestedTeamDetails = Object.fromEntries(
      requestedTeams.map((team) => [
        team,
        {
          teamName: dataSummary[team].teamName || null,
          matches: dataSummary[team].matches,
          matchBreakdown: dataSummary[team].matchBreakdown || [],
          notes: dataSummary[team].notes || [],
          superNotes: dataSummary[team].superNotes || [],
          allianceNotes: dataSummary[team].allianceNotes || []
        }
      ])
    );

    return {
      requestedTeams,
      averagedSummary,
      requestedTeamDetails
    };
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isAiLoading) return;
    
    const userMessage = input;
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsAiLoading(true);
    
    try {
      const dataSummary = generateDataSummary();
      const aiContext = buildAiContext(userMessage, dataSummary);
      const picklistDetail = picklist.map((team, index) => ({
        rank: index + 1,
        team: team.id,
        name: team.name || null
      }));

      const jsonExample = '{\n  "type": "picklist_suggestion",\n  "suggestedOrder": ["team1", "team2", "team3"],\n  "reasoning": "Brief explanation",\n  "added": ["teamX"],\n  "removed": ["teamY"]\n}';

      const systemInstruction = `You are the MVRT Super Scout AI assistant for FRC scouting. 
      Event Context: ${currentEvent ? `${currentEvent.year} ${currentEvent.regional} (${currentEvent.regionalCode})` : 'unknown'}
      Teams at Event: ${teams.length}
      Team Match Docs Loaded (from teams/{team}/matches): ${teamMatchDocCount}
      Super Scout Reports Loaded: ${superScoutData.length}

      IMPORTANT DATA SCOPE RULES:
      - Use averaged team stats for general ranking and comparison.
      - Match-level details are intentionally provided ONLY for specifically requested teams.
      - If no team was explicitly requested, do not assume per-match details.
      - If the user asks for deep analysis of a team that is not in requested details, ask them for the team number.

      Requested Specific Teams in this prompt: ${aiContext.requestedTeams.join(', ') || 'none'}

      Averaged Team Summary:
      ${JSON.stringify(aiContext.averagedSummary, null, 2)}

      Per-Match Requested Team Details:
      ${JSON.stringify(aiContext.requestedTeamDetails, null, 2)}
      
      Current Picklist with Rank: ${JSON.stringify(picklistDetail)}
      
      PICKLIST EDITING CAPABILITY:
      You can suggest changes to the picklist. When the user asks you to modify, reorder, create, or update the picklist, respond with a JSON block at the END of your message in this exact format:
      
      \`\`\`json
      ${jsonExample}
      \`\`\`
      
      - suggestedOrder: Array of team numbers in the recommended order (include ALL teams for the picklist)
      - reasoning: Brief explanation of the strategy
      - added: Teams being added (not in current picklist)
      - removed: Teams being removed (currently in picklist)
      
      If you're not making a picklist suggestion, do not include the JSON block.
      
      Your goal is to help the team build a winning alliance. 
      Analyze the data to identify top performers, consistent autonomous routines, strong defenders, and reliable endgames.
      Be specific with team numbers and data points. 
      If asked for a picklist recommendation, consider team synergy and the current picklist order.
      Keep your responses concise but insightful.`;

      let attachmentPayload: { mimeType: string; data: string } | null = null;

      // Add attachment if exists
      if (attachment) {
        const reader = new FileReader();
        const base64Data = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(attachment);
        });
        attachmentPayload = {
          mimeType: attachment.type,
          data: base64Data.split(',')[1]
        };
      }

      const response = await fetch('/api/ai/picklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction,
          messages,
          userMessage,
          attachment: attachmentPayload
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to generate AI response.');
      }

      const aiResponse = payload?.text || "I'm sorry, I couldn't process that request.";
      
      // Check for picklist suggestion in AI response
      const jsonMatch = aiResponse.match(/```json\s*({[\s\S]*?})\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.type === 'picklist_suggestion' && parsed.suggestedOrder) {
            setPicklistSuggestion({
              suggestedOrder: parsed.suggestedOrder,
              reasoning: parsed.reasoning || '',
              added: parsed.added || [],
              removed: parsed.removed || []
            });
            setShowSuggestionModal(true);
          }
        } catch (e) {
          console.error('Failed to parse AI picklist suggestion:', e);
        }
      }
      
      setMessages(prev => [...prev, { role: 'ai', content: aiResponse }]);
      setAttachment(null); // Clear attachment
    } catch (err: any) {
      console.error("AI Error:", err);
      setMessages(prev => [...prev, { role: 'ai', content: "Error: " + err.message }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  if (isAuthChecking || isLoadingVisibility) {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2 text-center">Account Pending Approval</h1>
        <p className="text-gray-600 dark:text-zinc-400 text-center max-w-md">
          Your account has been created successfully, but it needs to be approved by an administrator before you can access the scouting dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-4rem)] flex flex-col text-gray-900 dark:text-zinc-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100">Picklist & AI Analysis</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">
            {currentEvent ? `${currentEvent.year} ${currentEvent.regional}` : 'Loading event...'}
          </p>
        </div>
        <button 
          onClick={handleSavePicklist}
          disabled={isSaving || picklist.length === 0}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-2 rounded-lg font-bold transition-all shadow-md hover:shadow-lg"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          Save Picklist
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-700 rounded-lg p-4 flex items-center gap-3 text-red-700 dark:text-red-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Teams List Section */}
        <div className="w-full lg:w-1/4 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800 flex items-center justify-between">
            <h2 className="font-bold text-gray-700 dark:text-zinc-200">Available Teams</h2>
            <span className="text-xs bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 px-2 py-1 rounded-full">{teams.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {teams.filter(t => !picklist.find(p => p.id === t.id)).map((team) => (
              <div 
                key={team.id} 
                onClick={() => addToPicklist(team)}
                className="flex items-center justify-between p-3 hover:bg-purple-50 dark:hover:bg-zinc-800 rounded-lg cursor-pointer group transition-colors border border-transparent hover:border-purple-200 dark:hover:border-zinc-700"
              >
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-zinc-100">Team {team.id}</h3>
                  <p className="text-[10px] text-gray-500 dark:text-zinc-400 line-clamp-1">{team.name}</p>
                </div>
                <Plus className="h-4 w-4 text-gray-400 dark:text-zinc-500 group-hover:text-purple-600" />
              </div>
            ))}
          </div>
        </div>

        {/* Picklist Section */}
        <div className="flex-1 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-purple-50 dark:bg-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-5 w-5 text-purple-700" />
              <h2 className="font-bold text-purple-900 dark:text-purple-300">Draft Picklist</h2>
            </div>
            <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-full font-bold">{picklist.length} Teams</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {picklist.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-zinc-500 py-12">
                <ListOrdered className="h-12 w-12 mb-4 opacity-20" />
                <p>Your picklist is empty.</p>
                <p className="text-xs">Click teams on the left to add them.</p>
              </div>
            ) : (
              picklist.map((team, index) => (
                <div key={team.id} className="flex items-center gap-4 p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-sm hover:border-purple-300 transition-all group">
                  <span className="font-bold text-gray-400 dark:text-zinc-500 w-6">{index + 1}.</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 dark:text-zinc-100">Team {team.id}</h3>
                      <Link href={`/teams/${team.id}?year=${currentEvent?.year}&regional=${currentEvent?.regional}`} className="text-[10px] text-purple-600 hover:underline">
                        View Stats
                      </Link>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-zinc-400 line-clamp-1">{team.name}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => moveInPicklist(index, 'up')}
                      disabled={index === 0}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4 -rotate-90" />
                    </button>
                    <button 
                      onClick={() => moveInPicklist(index, 'down')}
                      disabled={index === picklist.length - 1}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </button>
                    <button 
                      onClick={() => removeFromPicklist(team.id)}
                      className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI Chat Section */}
        <div className="flex-1 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-purple-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-300" />
              <h2 className="font-bold">Super Scout AI</h2>
            </div>
            <Sparkles className="h-4 w-4 text-yellow-400 animate-pulse" />
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-zinc-950">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-2xl p-4 ${
                  msg.role === 'user' 
                    ? 'bg-purple-600 text-white rounded-tr-none shadow-md' 
                    : 'bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-tl-none shadow-sm'
                }`}>
                  <div
                    className={`text-sm leading-relaxed break-words [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1 ${
                      msg.role === 'user'
                        ? '[&_a]:text-white [&_a]:underline [&_code]:bg-purple-500 [&_pre]:bg-purple-700'
                        : '[&_a]:text-purple-700 dark:[&_a]:text-purple-300 [&_a]:underline [&_code]:bg-gray-100 dark:[&_code]:bg-zinc-800 [&_pre]:bg-gray-100 dark:[&_pre]:bg-zinc-800'
                    }`}
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isAiLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-2xl rounded-tl-none p-4 shadow-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  <p className="text-xs text-gray-500 dark:text-zinc-400">Analyzing scouting data...</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <form onSubmit={handleSend} className="flex gap-2">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-gray-400 dark:text-zinc-500 hover:text-purple-600">
                <Paperclip className="h-5 w-5" />
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              <button 
                type="button" 
                onClick={toggleRecording}
                className={`p-2 rounded-lg transition-all ${isRecording ? 'bg-red-100 text-red-600' : 'text-gray-400 dark:text-zinc-500 hover:text-purple-600'}`}
              >
                {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isAiLoading}
                placeholder="Ask about team stats, comparisons, or pick recommendations..."
                className="flex-1 border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-50 dark:disabled:bg-zinc-800"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isAiLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white p-2 rounded-lg transition-all flex items-center justify-center shadow-md active:scale-95"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* AI Picklist Suggestion Modal */}
      {showSuggestionModal && picklistSuggestion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-purple-50 dark:bg-zinc-800 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              <h3 className="font-bold text-purple-900 dark:text-purple-200">AI Picklist Suggestion</h3>
            </div>
            
            <div className="p-4 space-y-4">
              {picklistSuggestion.reasoning && (
                <div className="text-sm text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-lg">
                  <span className="font-semibold">Reasoning:</span> {picklistSuggestion.reasoning}
                </div>
              )}
              
              {picklistSuggestion.added.length > 0 && (
                <div className="text-sm">
                  <span className="font-semibold text-green-600 dark:text-green-400">Teams to Add:</span>{' '}
                  {picklistSuggestion.added.map(id => `Team ${id}`).join(', ')}
                </div>
              )}
              
              {picklistSuggestion.removed.length > 0 && (
                <div className="text-sm">
                  <span className="font-semibold text-red-600 dark:text-red-400">Teams to Remove:</span>{' '}
                  {picklistSuggestion.removed.map(id => `Team ${id}`).join(', ')}
                </div>
              )}
              
              <div>
                <div className="text-sm font-semibold mb-2">Suggested Order:</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {picklistSuggestion.suggestedOrder.map((teamId, index) => (
                    <div key={teamId} className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded">
                      <span className="text-sm font-bold text-purple-600 w-6">{index + 1}.</span>
                      <span className="text-sm">Team {teamId}</span>
                      {picklistSuggestion.added.includes(teamId) && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded">NEW</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-zinc-800 flex gap-2">
              <button
                onClick={applyPicklistSuggestion}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Save className="h-4 w-4" />
                Apply Changes
              </button>
              <button
                onClick={rejectPicklistSuggestion}
                className="flex-1 bg-gray-200 dark:bg-zinc-700 hover:bg-gray-300 dark:hover:bg-zinc-600 text-gray-800 dark:text-zinc-200 px-4 py-2 rounded-lg font-bold transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
