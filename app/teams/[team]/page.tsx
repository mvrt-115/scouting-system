'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Loader2, MessageSquare, Star } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useMatchDataCache } from '@/hooks/useMatchDataCache';
import { RebuiltFieldMapDisplay } from '@/components/scouting/RebuiltFieldMap';
import { doc, getDoc } from 'firebase/firestore';

export default function TeamPage({ params }: { params: Promise<{ team: string }> }) {
  const resolvedParams = use(params);
  const teamNumber = resolvedParams.team;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, userData, isAuthChecking, isApproved } = useAuth();

  const [year] = useState(searchParams.get('year') || '2026');
  const [regional] = useState(searchParams.get('regional') || 'casnv');
  const [comments, setComments] = useState<any[]>([]);
  const [pitScoutData, setPitScoutData] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [teamMatches, setTeamMatches] = useState<any[]>([]);
  const [baMatchesLocal, setBaMatchesLocal] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<'cache' | 'firebase' | null>(null);

  const { rows: cachedRows, baMatches, eventContext, isLoading: cacheLoading } = useMatchDataCache(
    Boolean(userData?.approved),
    user?.uid || null
  );

  // Try to use cached data first, fall back to direct Firebase fetch
  const matches = useMemo(() => {
    const ctxYear = eventContext.year;
    const ctxRegional = eventContext.regional;
    // Check if cache has matching context
    if (String(year) === String(ctxYear) && String(regional) === String(ctxRegional) && cachedRows.length > 0) {
      return cachedRows
        .filter(row => String(row.teamNumber) === String(teamNumber))
        .sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
    }
    // Otherwise use directly fetched data
    return teamMatches;
  }, [cachedRows, eventContext, regional, teamNumber, year, teamMatches]);

  const effectiveBaMatches = useMemo(() => {
    const ctxYear = eventContext.year;
    const ctxRegional = eventContext.regional;
    if (String(year) === String(ctxYear) && String(regional) === String(ctxRegional) && baMatches.length > 0) {
      return baMatches;
    }
    return baMatchesLocal;
  }, [baMatches, baMatchesLocal, eventContext, regional, year]);

  // Fetch data directly from Firebase if cache doesn't have it
  const fetchTeamDataFromFirebase = useCallback(async () => {
    if (!year || !regional || !teamNumber) return;
    
    setIsLoading(true);
    try {
      // Fetch match data for this team
      const matchesRef = collection(db, `years/${year}/regionals/${regional}/teams/${teamNumber}/matches`);
      const matchesSnap = await getDocs(matchesRef);
      const matchesData = matchesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => (Number(a.matchNumber) || 0) - (Number(b.matchNumber) || 0));
      
      setTeamMatches(matchesData);
      
      // Also fetch Blue Alliance matches for scores
      try {
        const eventDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
        if (eventDoc.exists()) {
          const eventData = eventDoc.data();
          const baMatchesRef = collection(db, `years/${eventData.year}/regionals/${eventData.regional}/ba_matches`);
          const baSnap = await getDocs(baMatchesRef);
          setBaMatchesLocal(baSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (e) {
        console.error('Failed to fetch BA matches:', e);
      }
      
      setDataSource('firebase');
    } catch (err) {
      console.error('Failed to fetch team data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [year, regional, teamNumber]);

  const fetchComments = useCallback(async () => {
    setIsLoading(true);
    try {
      const commentsSnapshot = await getDocs(collection(db, `years/${year}/regionals/${regional}/teams/${teamNumber}/comments`));
      setComments(commentsSnapshot.docs.map((entry) => ({ id: entry.id, ...(entry.data() as any) })).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
    } finally {
      setIsLoading(false);
    }
  }, [regional, teamNumber, year]);

  const fetchPitScoutData = useCallback(async () => {
    if (!year || !regional || !teamNumber) return;
    try {
      const path = `years/${year}/regionals/${regional}/teams/${teamNumber}/pit_scouting`;
      console.log('Fetching pit scout data from:', path);
      const pitRef = collection(db, path);
      const pitSnap = await getDocs(pitRef);
      console.log('Pit scout docs count:', pitSnap.docs.length);
      console.log('Pit scout docs:', pitSnap.docs.map(d => ({ id: d.id, data: d.data() })));
      const teamPitData = pitSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
      console.log('Processed pit scout data:', teamPitData);
      setPitScoutData(teamPitData);
    } catch (e) {
      console.error('Failed to fetch pit scout data:', e);
    }
  }, [year, regional, teamNumber]);

  useEffect(() => { if (!isAuthChecking && !user) router.push('/login'); }, [isAuthChecking, router, user]);
  useEffect(() => { 
    if (!isAuthChecking && isApproved) {
      fetchComments();
      fetchPitScoutData();
      // Only fetch from Firebase if cache doesn't have matching data
      const ctxYear = eventContext.year;
      const ctxRegional = eventContext.regional;
      if (!(String(year) === String(ctxYear) && String(regional) === String(ctxRegional) && cachedRows.length > 0)) {
        fetchTeamDataFromFirebase();
      }
    }
  }, [fetchComments, fetchPitScoutData, fetchTeamDataFromFirebase, isApproved, isAuthChecking, year, regional, eventContext, cachedRows]);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !auth.currentUser) return;
    const commentData = { text: newComment.trim(), authorId: auth.currentUser.uid, authorName: userData?.name || auth.currentUser.displayName || auth.currentUser.email || 'Scout', createdAt: new Date().toISOString() };
    const docRef = await addDoc(collection(db, `years/${year}/regionals/${regional}/teams/${teamNumber}/comments`), commentData);
    setComments((current) => [{ id: docRef.id, ...commentData }, ...current]);
    setNewComment('');
  };

  const isModern2026 = Number(year) >= 2026;
  if (isAuthChecking || isLoading || cacheLoading) return <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-purple-600" /></div>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href={isModern2026 ? '/data-viewer' : '/legacy-data-viewer'} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300"><ArrowLeft className="h-4 w-4" />Back</Link>
      {isModern2026 ? <TeamPage2026 teamNumber={teamNumber} year={year} regional={regional} matches={matches} baMatches={effectiveBaMatches} comments={comments} pitScoutData={pitScoutData} newComment={newComment} onCommentChange={setNewComment} onCommentSubmit={handleSubmitComment} /> : <TeamPageLegacy teamNumber={teamNumber} year={year} regional={regional} matches={matches} comments={comments} newComment={newComment} onCommentChange={setNewComment} onCommentSubmit={handleSubmitComment} />}
    </div>
  );
}

function TeamPage2026({ teamNumber, year, regional, matches, baMatches, comments, pitScoutData, newComment, onCommentChange, onCommentSubmit }: { teamNumber: string; year: string; regional: string; matches: any[]; baMatches: any[]; comments: any[]; pitScoutData: any[]; newComment: string; onCommentChange: (value: string) => void; onCommentSubmit: () => void }) {
  const averages = useMemo(() => averageRatings(matches), [matches]);
  const summary = useMemo(() => build2026TeamSummary(matches, teamNumber, baMatches), [baMatches, matches, teamNumber]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
        <h1 className="text-4xl font-black text-purple-950 dark:text-white">Team {teamNumber}</h1>
        <p className="mt-2 text-sm font-semibold text-purple-700 dark:text-purple-300">{year} {regional}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Matches" value={String(matches.length)} />
          <Stat label="Role" value={summary.preferredRole} />
          <Stat label="Avg HP" value={summary.averageHp.toFixed(1)} />
          <Stat label="Avg Score" value={summary.averageMatchScore ? summary.averageMatchScore.toFixed(1) : '-'} />
          <Stat label="Climb Rate" value={`${summary.climbRate.toFixed(0)}%`} />
        </div>
      </div>

      {/* Pit Scout Data Section */}
      {pitScoutData.length > 0 && (
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
          <h2 className="text-xl font-black text-purple-950 dark:text-white">Pit Scout Data</h2>
          <div className="mt-4 space-y-4">
            {pitScoutData.map((pit) => (
              <PitScoutCard key={pit.id} data={pit} />
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
          <h2 className="text-xl font-black text-purple-950 dark:text-white">Average Ratings</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(averages).map(([label, value]) => <div key={label} className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div><VisualStars value={value} /></div>)}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Stat label="Avg HP Auto" value={summary.averageHpAuto.toFixed(1)} />
            <Stat label="Reliability" value={summary.reliability.toFixed(1)} />
            <Stat label="Starts Marked" value={String(summary.startPoints.length)} />
            <Stat label="Shots Marked" value={String(summary.shotPoints.length)} />
          </div>
        </div>
        <div className="grid gap-4">
          <RebuiltFieldMapDisplay title="Auton Starts" activePoints={summary.startPoints} />
          <RebuiltFieldMapDisplay title="Teleop Shots" activePoints={summary.shotPoints} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
          <h2 className="text-xl font-black text-purple-950 dark:text-white">Matches</h2>
          <div className="mt-4 grid gap-4">
            {matches.map((match) => (
              <MatchDataCard key={match.id} match={match} pitScoutData={pitScoutData} />
            ))}
            {matches.length === 0 ? <div className="text-sm text-slate-500 dark:text-slate-400">No data</div> : null}
          </div>
        </div>

        <CommentsPanel comments={comments} matches={matches} reports={[]} newComment={newComment} onCommentChange={onCommentChange} onCommentSubmit={onCommentSubmit} />
      </div>
    </div>
  );
}

function TeamPageLegacy({ teamNumber, year, regional, matches, comments, newComment, onCommentChange, onCommentSubmit }: { teamNumber: string; year: string; regional: string; matches: any[]; comments: any[]; newComment: string; onCommentChange: (value: string) => void; onCommentSubmit: () => void }) {
  const matchKeys = Array.from(new Set(matches.flatMap((match) => Object.keys(match).filter((key) => !['id', 'timestamp', 'scoutUid'].includes(key)))));
  return <div className="space-y-6"><div className="rounded-xl border border-purple-200/70 bg-white/85 p-6 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80"><h1 className="text-4xl font-black text-purple-950 dark:text-white">Team {teamNumber}</h1><p className="mt-2 text-sm font-semibold text-purple-700 dark:text-purple-300">{year} {regional}</p></div><div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80"><h2 className="text-xl font-black text-purple-950 dark:text-white">Matches</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-b border-purple-200 dark:border-zinc-800"><th className="px-3 py-3 text-sm font-bold text-purple-900 dark:text-purple-200">Match</th>{matchKeys.map((key) => <th key={key} className="px-3 py-3 text-sm font-bold text-purple-900 dark:text-purple-200">{key}</th>)}</tr></thead><tbody>{matches.map((match) => <tr key={match.id} className="border-b border-purple-100/70 text-sm dark:border-zinc-800"><td className="px-3 py-3 font-bold text-purple-950 dark:text-white">{match.matchNumber || match.id}</td>{matchKeys.map((key) => <td key={key} className="px-3 py-3 text-slate-700 dark:text-slate-200">{formatValue(match[key])}</td>)}</tr>)}</tbody></table></div></div><CommentsPanel comments={comments} matches={matches} reports={[]} newComment={newComment} onCommentChange={onCommentChange} onCommentSubmit={onCommentSubmit} /></div></div>;
}

function CommentsPanel({ comments, matches, reports, newComment, onCommentChange, onCommentSubmit }: { comments: any[]; matches: any[]; reports: any[]; newComment: string; onCommentChange: (value: string) => void; onCommentSubmit: () => void }) {
  // Collect all comments from different sources
  const allComments = useMemo(() => {
    const collected: Array<{id: string; text: string; author: string; source: string; matchNumber?: number; timestamp?: string}> = [];
    
    // Regular comments from comments collection
    comments.forEach((comment) => {
      collected.push({
        id: `comment_${comment.id}`,
        text: comment.text,
        author: comment.authorName || 'Scout',
        source: 'General',
        timestamp: comment.createdAt,
      });
    });
    
    // Scout comments from match data
    matches.forEach((match) => {
      const matchNum = match.matchNumber || match.id;
      if (match['Teleop Comments']) {
        collected.push({
          id: `scout_teleop_${match.id}`,
          text: match['Teleop Comments'],
          author: match.scoutName || 'Scout',
          source: `M${matchNum} Teleop`,
          matchNumber: matchNum,
          timestamp: match.timestamp,
        });
      }
      if (match['Endgame Comments']) {
        collected.push({
          id: `scout_endgame_${match.id}`,
          text: match['Endgame Comments'],
          author: match.scoutName || 'Scout',
          source: `M${matchNum} Endgame`,
          matchNumber: matchNum,
          timestamp: match.timestamp,
        });
      }
    });
    
    // Super scout comments
    reports.forEach((report) => {
      const matchNum = report.matchNumber || '?';
      
      // Team specific notes
      Object.entries(report.data?.teamSpecificNotes || {}).forEach(([team, note]) => {
        if (String(note || '').trim()) {
          collected.push({
            id: `super_team_${report.id}_${team}`,
            text: String(note),
            author: report.scoutName || 'Super Scout',
            source: `M${matchNum} Super (Team ${team})`,
            matchNumber: matchNum,
            timestamp: report.createdAt,
          });
        }
      });
      
      // Overall notes
      if (report.data?.overallNotes) {
        collected.push({
          id: `super_overall_${report.id}`,
          text: String(report.data.overallNotes),
          author: report.scoutName || 'Super Scout',
          source: `M${matchNum} Super (Overall)`,
          matchNumber: matchNum,
          timestamp: report.createdAt,
        });
      }
      
      // Defense notes
      if (report.data?.defenseNotes) {
        collected.push({
          id: `super_defense_${report.id}`,
          text: String(report.data.defenseNotes),
          author: report.scoutName || 'Super Scout',
          source: `M${matchNum} Super (Defense)`,
          matchNumber: matchNum,
          timestamp: report.createdAt,
        });
      }
    });
    
    // Sort by timestamp, newest first
    return collected.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [comments, matches, reports]);
  
  return (
    <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-purple-600" />
        <h2 className="text-xl font-black text-purple-950 dark:text-white">All Comments ({allComments.length})</h2>
      </div>
      
      <div className="mt-4 max-h-[500px] space-y-3 overflow-y-auto">
        {allComments.map((comment) => (
          <div key={comment.id} className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900 dark:text-purple-200">{comment.author}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{comment.source}</span>
            </div>
            <p className="mt-2 text-slate-700 dark:text-slate-200">{comment.text}</p>
          </div>
        ))}
        {allComments.length === 0 && (
          <div className="text-sm text-slate-500 dark:text-slate-400">No comments yet.</div>
        )}
      </div>
      
      <textarea 
        value={newComment} 
        onChange={(event) => onCommentChange(event.target.value)} 
        rows={4} 
        className="mt-4 w-full rounded-lg border border-purple-200 bg-white px-4 py-3 text-sm text-purple-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white" 
      />
      <button 
        onClick={onCommentSubmit} 
        className="mt-3 inline-flex items-center rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white"
      >
        Add Comment
      </button>
    </div>
  );
}

function averageRatings(matches: any[]) { const fields = [['Auto', 'Auto Scoring Rating'], ['Auto Accuracy', 'Auto Accuracy Rating'], ['Driver', 'Driver Rating'], ['Speed', 'Speed Rating'], ['Scoring', 'Scoring Threat Rating'], ['Accuracy', 'Accuracy Rating'], ['Defense', 'Defense Rating'], ['Reliability', 'Robot Reliability Rating'], ['Overall', 'Overall Match Impact']] as const; return Object.fromEntries(fields.map(([label, key]) => { const total = matches.reduce((sum, match) => sum + Number(match[key] || 0), 0); return [label, matches.length ? total / matches.length : 0]; })); }
function build2026TeamSummary(matches: any[], teamNumber: string, baMatches: any[]) { const roleCounts = new Map<string, number>(); const startPoints: Array<{ x: number; y: number }> = []; const shotPoints: Array<{ x: number; y: number }> = []; let averageHpAuto = 0; let averageHp = 0; let climbSuccess = 0; let reliability = 0; matches.forEach((match) => { averageHpAuto += Number(match['Human Player Auto Count'] || 0); averageHp += Number(match['Human Player Count'] || 0); reliability += Number(match['Robot Reliability Rating'] || 0); const role = String(match['Primary Role'] || ''); const startPoint = toPoint(match['Starting Position X'], match['Starting Position Y']); const nextShotPoints = normalizeShotPoints(match); if (role) roleCounts.set(role, (roleCounts.get(role) || 0) + 1); if (startPoint) startPoints.push(startPoint); if (nextShotPoints.length > 0) shotPoints.push(...nextShotPoints); if (match['Climb Attempted'] && !match['Climb Failed']) climbSuccess += 1; }); const scores = baMatches.map((match) => getMatchScoreForTeam(match, teamNumber)).filter((score): score is number => typeof score === 'number'); const count = matches.length || 1; return { averageHpAuto: averageHpAuto / count, averageHp: averageHp / count, climbRate: (climbSuccess / count) * 100, reliability: reliability / count, preferredRole: getTopCount(roleCounts), startPoints, shotPoints, averageMatchScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null }; }
function getTopCount(map: Map<string, number>) { return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'; }
function toPoint(x: unknown, y: unknown) { const numericX = Number(x || 0); const numericY = Number(y || 0); if (numericX === 0 && numericY === 0) return null; return { x: numericX, y: numericY }; }
function normalizeShotPoints(match: any) { const positions = Array.isArray(match['Shooting Positions']) ? match['Shooting Positions'] : []; const normalized = positions.map((point) => toPoint(point?.x, point?.y)).filter((point): point is { x: number; y: number } => Boolean(point)); if (normalized.length > 0) return normalized; const fallback = toPoint(match['Shooting Position X'], match['Shooting Position Y']); return fallback ? [fallback] : []; }
function getMatchScoreForTeam(match: any, teamNumber: string) { const redTeams = normalizeTeams(match?.alliances?.red?.teams || match?.red?.teams || match?.redTeams); const blueTeams = normalizeTeams(match?.alliances?.blue?.teams || match?.blue?.teams || match?.blueTeams); if (redTeams.includes(teamNumber)) return Number(match?.alliances?.red?.score ?? match?.red?.score ?? match?.redScore ?? 0); if (blueTeams.includes(teamNumber)) return Number(match?.alliances?.blue?.score ?? match?.blue?.score ?? match?.blueScore ?? 0); return null; }
function normalizeTeams(value: any): string[] { if (!Array.isArray(value)) return []; return value.map((entry) => String(entry || '').replace('frc', '')).filter(Boolean); }
function VisualStars({ value }: { value: number }) { const normalizedValue = Math.max(0, Math.min(10, Math.round(value))); return <div className="mt-2 flex items-center gap-2"><div className="flex flex-wrap gap-0.5 text-purple-500 dark:text-purple-300">{Array.from({ length: 10 }, (_, index) => index + 1).map((index) => <Star key={index} className={`h-3 w-3 ${index <= normalizedValue ? 'fill-current' : ''}`} />)}</div><span className="text-sm font-bold text-purple-900 dark:text-purple-200">{normalizedValue}/10</span></div>; }
function Stat({ label, value }: { label: string; value: unknown }) { return <div className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div><div className="mt-1 text-sm font-bold text-purple-950 dark:text-white">{String(value)}</div></div>; }
function InlineStarStat({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"><div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div><VisualStars value={value} /></div>; }
function PitScoutCard({ data }: { data: any }) {
  const pit = data.pitData || data;
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="flex items-center justify-between">
        <div className="font-bold text-purple-950 dark:text-white">Scout: {pit.scoutName || 'Unknown'}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(pit.timestamp).toLocaleDateString()}</div>
      </div>
      
      <div className="mt-3 grid gap-2 text-sm">
        {/* Robot Specs */}
        <div className="flex flex-wrap gap-2">
          {pit.drivetrain && <span className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">{pit.drivetrain}</span>}
          {pit.robotWeight && <span className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">{pit.robotWeight} lbs</span>}
          {pit.dimensions && <span className="rounded bg-purple-100 px-2 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-900/40 dark:text-purple-200">{pit.dimensions}</span>}
        </div>
        
        {/* Capabilities */}
        <div className="mt-2 flex flex-wrap gap-2">
          {pit.canScoreFuel === 'yes' && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">FUEL: {pit.fuelCapacity || '?'}</span>}
          {pit.canDriveOverBump === 'yes' && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">BUMP</span>}
          {pit.canDriveUnderTrench === 'yes' && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">TRENCH</span>}
          {pit.canClimb === 'yes' && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Climbs</span>}
          {pit.canDeliverToOutpost === 'yes' && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">OUTPOST</span>}
        </div>
        
        {/* Auto */}
        {pit.hasAuto === 'yes' && (
          <div className="mt-2">
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Auto: {pit.autoRoutine || 'Has auto'} (Reliability: {pit.autoReliability || 0}/10)</span>
          </div>
        )}
        
        {/* Play Style */}
        {pit.playStyle && (
          <div className="mt-2">
            <span className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold capitalize text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">{pit.playStyle}</span>
            {pit.humanPlayerSkill > 0 && <span className="ml-2 text-xs text-slate-600 dark:text-slate-400">HP Skill: {pit.humanPlayerSkill}/10</span>}
          </div>
        )}
        
        {/* Notes */}
        {(pit.strengths || pit.weaknesses || pit.notes) && (
          <div className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
            {pit.strengths && <p><span className="font-semibold text-emerald-700 dark:text-emerald-400">Strengths:</span> {pit.strengths}</p>}
            {pit.weaknesses && <p><span className="font-semibold text-red-700 dark:text-red-400">Weaknesses:</span> {pit.weaknesses}</p>}
            {pit.notes && <p><span className="font-semibold text-purple-700 dark:text-purple-400">Notes:</span> {pit.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function formatValue(value: unknown) { if (value === undefined || value === null || value === '') return '-'; if (typeof value === 'boolean') return value ? 'Yes' : 'No'; return String(value); }

function MatchDataCard({ match, pitScoutData = [] }: { match: any; pitScoutData?: any[] }) {
  // Define fields to exclude from auto-display (already shown or internal)
  const excludedFields = ['id', 'timestamp', 'scoutUid', 'scoutName', 'teamNumber', 'matchNumber', 'year', 'regional', 'Starting Position X', 'Starting Position Y', 'Shooting Positions', 'Shooting Position X', 'Shooting Position Y', 'Teleop Comments', 'Endgame Comments', 'Primary Role'];
  
  // Get all other fields
  const otherFields = Object.entries(match).filter(([key, value]) => !excludedFields.includes(key) && value !== undefined && value !== null && value !== '' && typeof value !== 'object');
  
  // Categorize fields
  const ratings: Array<[string, any]> = [];
  const booleans: Array<[string, any]> = [];
  const numbers: Array<[string, any]> = [];
  const text: Array<[string, any]> = [];
  
  otherFields.forEach(([key, value]) => {
    if (key.includes('Rating') || key.includes('Impact')) {
      ratings.push([key, value]);
    } else if (typeof value === 'boolean') {
      booleans.push([key, value]);
    } else if (typeof value === 'number' || !isNaN(Number(value))) {
      numbers.push([key, value]);
    } else {
      text.push([key, value]);
    }
  });
  
  const hasStart = toPoint(match['Starting Position X'], match['Starting Position Y']);
  const shotPoints = normalizeShotPoints(match);
  
  return (
    <div className="rounded-xl border border-purple-200/70 bg-white/90 p-5 shadow-lg shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-purple-100 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600 text-white shadow-md">
            <span className="text-lg font-black">M{match.matchNumber || match.id}</span>
          </div>
          <div>
            <div className="font-black text-purple-950 dark:text-white">Match {match.matchNumber || match.id}</div>
            <div className="text-xs font-semibold text-purple-600 dark:text-purple-300">
              {match['Primary Role'] || 'No role'} • {match.scoutName || 'Unknown Scout'}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {hasStart && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              Start
            </span>
          )}
          {shotPoints.length > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
              {shotPoints.length} Shot{shotPoints.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        <StatBadge label="HP Auto" value={match['Human Player Auto Count'] ?? 0} color="amber" />
        <StatBadge label="HP" value={match['Human Player Count'] ?? 0} color="purple" />
        <StatBadge label="Starts" value={hasStart ? '✓' : '✗'} color={hasStart ? 'emerald' : 'slate'} />
        <StatBadge label="Shots" value={shotPoints.length} color="blue" />
      </div>
      
      {/* Pit Scout Data */}
      {pitScoutData.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 dark:text-purple-400">Pit Scout Data</div>
          <div className="flex flex-wrap gap-2">
            {pitScoutData.map((pit, idx) => {
              const p = pit.pitData || pit;
              return (
                <div key={pit.id || idx} className="flex flex-wrap gap-1">
                  {p.canScoreFuel === 'yes' && (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      FUEL: {p.fuelCapacity || '?'}
                    </span>
                  )}
                  {p.canDriveOverBump === 'yes' && (
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">BUMP</span>
                  )}
                  {p.canDriveUnderTrench === 'yes' && (
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">TRENCH</span>
                  )}
                  {p.canClimb === 'yes' && (
                    <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">CLIMB</span>
                  )}
                  {p.canDeliverToOutpost === 'yes' && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">OUTPOST</span>
                  )}
                  {p.hasAuto === 'yes' && (
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">AUTO</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Ratings */}
      {ratings.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 dark:text-purple-400">Ratings</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ratings.map(([key, value]) => {
              const label = key.replace(' Rating', '').replace(' Match Impact', '');
              return (
                <div key={key} className="rounded-lg border border-purple-100 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">{label}</div>
                  <VisualStars value={Number(value)} />
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Booleans & Climb */}
      {(booleans.length > 0 || match['Climb Level']) && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-purple-500 dark:text-purple-400">Capabilities</div>
          <div className="flex flex-wrap gap-2">
            {booleans.map(([key, value]) => (
              <span 
                key={key} 
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  value 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' 
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {value ? '✓' : '✗'} {key.replace(/([A-Z])/g, ' $1').trim()}
              </span>
            ))}
            {match['Climb Level'] && (
              <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                Climb: {match['Climb Level']}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Field Maps */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RebuiltFieldMapDisplay title="Auton Start" activePoint={hasStart} />
        <RebuiltFieldMapDisplay title="Teleop Shots" activePoints={shotPoints} />
      </div>
      
      {/* Comments */}
      {(match['Teleop Comments'] || match['Endgame Comments']) && (
        <div className="mt-4 space-y-2">
          {match['Teleop Comments'] && (
            <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/50 p-3 dark:bg-blue-900/20">
              <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">Teleop</div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{match['Teleop Comments']}</p>
            </div>
          )}
          {match['Endgame Comments'] && (
            <div className="rounded-lg border-l-4 border-purple-500 bg-purple-50/50 p-3 dark:bg-purple-900/20">
              <div className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">Endgame</div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{match['Endgame Comments']}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorClasses: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    slate: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
  
  return (
    <div className={`flex flex-col items-center rounded-lg p-2 ${colorClasses[color] || colorClasses.slate}`}>
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      <span className="text-lg font-black">{value}</span>
    </div>
  );
}
