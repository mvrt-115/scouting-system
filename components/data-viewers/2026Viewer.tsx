'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, Sparkles, Star, Table2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RebuiltFieldMapDisplay } from '@/components/scouting/RebuiltFieldMap';

type ViewerRow = Record<string, any>;
type SuperScoutReport = {
  id: string;
  matchNumber?: number;
  alliance?: string;
  teams?: string[];
  scoutName?: string;
  createdAt?: string;
  data?: Record<string, any>;
};
type XYPoint = { x: number; y: number };
type MatchScore = { id: string; matchNumber: number; red: number; blue: number; redTeams: string[]; blueTeams: string[] };
type TeamSummary = {
  teamNumber: string;
  matchCount: number;
  rank: number | null;
  averageMatchScore: number | null;
  averages: Record<string, number>;
  averageHpAuto: number;
  averageHp: number;
  preferredRole: string;
  climbRate: number;
  reliability: number;
  startPoints: XYPoint[];
  shotPoints: XYPoint[];
  matches: ViewerRow[];
  superNotes: string[];
  allianceNotes: string[];
  pitData?: any;
};

const ratingFields = [
  ['Auto Scoring Rating', 'Auto'],
  ['Auto Accuracy Rating', 'Auto Accuracy'],
  ['Driver Rating', 'Driver'],
  ['Speed Rating', 'Speed'],
  ['Scoring Threat Rating', 'Scoring'],
  ['Accuracy Rating', 'Accuracy'],
  ['Defense Rating', 'Defense'],
  ['Robot Reliability Rating', 'Reliability'],
  ['Overall Match Impact', 'Overall'],
] as const;

export function Year2026Viewer({
  rows,
  reports,
  baMatches,
  year,
  regional,
  regionalCode,
}: {
  rows: ViewerRow[];
  reports: SuperScoutReport[];
  baMatches: any[];
  year: string;
  regional: string;
  regionalCode: string;
}) {
  const [viewMode, setViewMode] = useState<'team' | 'match' | 'table'>('team');
  const [rankMap, setRankMap] = useState<Record<string, number>>({});
  const [aiSummary, setAiSummary] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  const matchScores = useMemo(() => normalizeMatchScores(baMatches), [baMatches]);
  const summaries = useMemo(() => buildSummaries(rows, reports, matchScores, rankMap), [rows, reports, matchScores, rankMap]);
  const matchGroups = useMemo(() => buildMatchGroups(rows, reports), [rows, reports]);
  const graphData = useMemo(
    () =>
      summaries.slice(0, 12).map((summary) => ({
        teamNumber: summary.teamNumber,
        overall: summary.averages['Overall Match Impact'] || 0,
        auto: summary.averages['Auto Scoring Rating'] || 0,
        score: summary.averageMatchScore || 0,
      })),
    [summaries]
  );

  useEffect(() => {
    const fetchRankings = async () => {
      if (regional === 'practice') {
        setRankMap({});
        return;
      }

      try {
        const apiKey = process.env.NEXT_PUBLIC_TBA_API_KEY;
        if (!apiKey) return;

        const response = await fetch(`https://www.thebluealliance.com/api/v3/event/${year}${regional}/rankings`, {
          headers: { 'X-TBA-Auth-Key': apiKey },
        });

        if (!response.ok) return;
        const data = await response.json();
        const nextRankMap: Record<string, number> = {};

        for (const entry of Array.isArray(data?.rankings) ? data.rankings : []) {
          const teamKey = String(entry?.team_key || '');
          const teamNumber = teamKey.replace('frc', '');
          if (teamNumber) nextRankMap[teamNumber] = Number(entry?.rank || 0);
        }

        setRankMap(nextRankMap);
      } catch {
        setRankMap({});
      }
    };

    fetchRankings();
  }, [regional, year]);

  const handleRunAi = async () => {
    setIsLoadingAi(true);
    try {
      const response = await fetch('/api/ai/data-viewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventContext: { year, regional, regionalCode },
          teamSummaries: summaries.slice(0, 24),
          matchReports: reports,
        }),
      });
      const data = await response.json();
      setAiSummary(String(data?.text || data?.error || 'No AI summary available.'));
    } catch {
      setAiSummary('AI summary is unavailable right now.');
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="sticky top-4 z-20 rounded-2xl border border-purple-200/70 bg-white/90 px-4 py-4 shadow-lg shadow-purple-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-purple-700 dark:text-purple-300">Data Viewer</div>
              <div className="text-xl font-black text-purple-950 dark:text-white">{year} {regional}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold text-purple-900 dark:text-purple-200" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setViewMode('team')} className={toggleClassName(viewMode === 'team')}>Teams</button>
            <button type="button" onClick={() => setViewMode('match')} className={toggleClassName(viewMode === 'match')}>Matches</button>
            <button type="button" onClick={() => setViewMode('table')} className={toggleClassName(viewMode === 'table')}>Table</button>
            <button type="button" onClick={handleRunAi} className="rounded-lg bg-purple-600 px-4 py-3 text-sm font-bold text-white">
              {isLoadingAi ? 'Loading...' : 'AI'}
            </button>
          </div>
        </div>
      </div>

      {aiSummary ? (
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-purple-800 dark:text-purple-300">
            <Sparkles className="h-4 w-4" />
            AI Summary
          </div>
          <div className="text-sm text-slate-700 dark:text-slate-200 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:bg-gray-100 dark:[&_code]:bg-zinc-800 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:bg-gray-100 dark:[&_pre]:bg-zinc-800 [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
          </div>
        </div>
      ) : null}

      {viewMode === 'team' ? <TeamView summaries={summaries} year={year} regional={regional} graphData={graphData} /> : null}
      {viewMode === 'match' ? <MatchView matchGroups={matchGroups} /> : null}
      {viewMode === 'table' ? <TableView summaries={summaries} graphData={graphData} year={year} regional={regional} /> : null}
    </div>
  );
}

function TeamView({
  summaries,
  year,
  regional,
  graphData,
}: {
  summaries: TeamSummary[];
  year: string;
  regional: string;
  graphData: Array<{ teamNumber: string; overall: number; auto: number; score: number }>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        {summaries.map((summary, index) => (
          <Link
            key={summary.teamNumber}
            href={`/teams/${summary.teamNumber}?year=${year}&regional=${regional}`}
            className={`rounded-xl border bg-white/85 p-5 shadow-xl shadow-purple-900/5 transition-colors dark:bg-zinc-900/80 ${cardClassName(index)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-2xl font-black text-purple-950 dark:text-white">Team {summary.teamNumber}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm font-semibold text-purple-700 dark:text-purple-300">
                  <span>{summary.matchCount} matches</span>
                  <span>{summary.rank ? `Rank ${summary.rank}` : 'Unranked'}</span>
                  <span>{summary.averageMatchScore ? `${summary.averageMatchScore.toFixed(1)} avg score` : 'No match score'}</span>
                </div>
              </div>
              {index < 3 ? <MedalChip place={index} /> : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {ratingFields.map(([field, label]) => (
                <div key={field} className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div>
                  <VisualStars value={summary.averages[field] || 0} />
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MiniStat label="HP Auto" value={summary.averageHpAuto.toFixed(1)} />
              <MiniStat label="HP" value={summary.averageHp.toFixed(1)} />
              <MiniStat label="Role" value={summary.preferredRole} />
              <MiniStat label="Climb" value={`${summary.climbRate.toFixed(0)}%`} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <RebuiltFieldMapDisplay title="Auton Starts" activePoints={summary.startPoints} />
              <RebuiltFieldMapDisplay title="Teleop Shots" activePoints={summary.shotPoints} />
            </div>

            <div className="mt-4">
              <InfoPanel title="Super Scout Notes" lines={summary.superNotes} empty="No super scout notes." useMarkdown />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MatchView({ matchGroups }: { matchGroups: Array<{ key: string; matchNumber: number; rows: ViewerRow[]; reports: SuperScoutReport[] }> }) {
  return (
    <div className="space-y-4">
      {matchGroups.map((group) => (
        <details key={group.key} className="overflow-hidden rounded-xl border border-purple-200/70 bg-white/85 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
            <div>
              <div className="text-lg font-black text-purple-950 dark:text-white">Match {group.matchNumber}</div>
              <div className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                {group.rows.length} scout entries, {group.reports.length} super reports
              </div>
            </div>
            <ChevronDown className="h-5 w-5 text-purple-700 dark:text-purple-300" />
          </summary>
          <div className="border-t border-purple-100 px-5 py-4 dark:border-zinc-800">
            <div className="grid gap-4">
              <div className="space-y-4">
                {group.rows.map((row) => (
                  <ScoutMatchCard key={row.id} row={row} />
                ))}
              </div>
              <div className="space-y-4">
                {group.reports.map((report) => (
                  <SuperMatchCard key={report.id} report={report} rows={group.rows} />
                ))}
              </div>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function TableView({
  summaries,
  graphData,
  year,
  regional,
}: {
  summaries: TeamSummary[];
  graphData: Array<{ teamNumber: string; overall: number; auto: number; score: number }>;
  year: string;
  regional: string;
}) {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'rank', 'teamNumber', 'matchCount', 'overall', 'auto', 'driver', 'scoring', 'defense', 'climbRate', 'preferredRole',
    'pitFuel', 'pitBump', 'pitTrench', 'pitClimb', 'pitOutpost', 'pitAuto'
  ]));
  const [columnOrder, setColumnOrder] = useState<string[]>([
    'rank', 'teamNumber', 'matchCount', 'overall', 'auto', 'driver', 'scoring', 'defense', 'climbRate', 'preferredRole',
    'pitFuel', 'pitBump', 'pitTrench', 'pitClimb', 'pitOutpost', 'pitAuto'
  ]);
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [graphType, setGraphType] = useState<'scatter' | 'bar' | 'none'>('none');
  const [xAxis, setXAxis] = useState<string>('teamNumber');
  const [yAxis, setYAxis] = useState<string>('auto');
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved preferences from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tableViewPrefs');
      if (saved) {
        const prefs = JSON.parse(saved);
        if (prefs.visibleColumns) setVisibleColumns(new Set(prefs.visibleColumns));
        if (prefs.columnOrder) setColumnOrder(prefs.columnOrder);
        if (prefs.sortConfig) setSortConfig(prefs.sortConfig);
        if (prefs.graphType) setGraphType(prefs.graphType);
        if (prefs.xAxis) setXAxis(prefs.xAxis);
        if (prefs.yAxis) setYAxis(prefs.yAxis);
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsLoaded(true);
  }, []);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem('tableViewPrefs', JSON.stringify({
        visibleColumns: Array.from(visibleColumns),
        columnOrder,
        sortConfig,
        graphType,
        xAxis,
        yAxis,
      }));
    } catch {
      // Ignore localStorage errors
    }
  }, [visibleColumns, columnOrder, sortConfig, graphType, xAxis, yAxis, isLoaded]);

  const allColumns = [
    { key: 'rank', label: 'Rank', type: 'number' },
    { key: 'teamNumber', label: 'Team', type: 'team' },
    { key: 'matchCount', label: 'Matches', type: 'number' },
    { key: 'averageMatchScore', label: 'Avg Score', type: 'number' },
    { key: 'overall', label: 'Overall', type: 'rating', field: 'Overall Match Impact' },
    { key: 'auto', label: 'Auto', type: 'rating', field: 'Auto Scoring Rating' },
    { key: 'autoAccuracy', label: 'Auto Acc', type: 'rating', field: 'Auto Accuracy Rating' },
    { key: 'driver', label: 'Driver', type: 'rating', field: 'Driver Rating' },
    { key: 'speed', label: 'Speed', type: 'rating', field: 'Speed Rating' },
    { key: 'scoring', label: 'Scoring', type: 'rating', field: 'Scoring Threat Rating' },
    { key: 'accuracy', label: 'Accuracy', type: 'rating', field: 'Accuracy Rating' },
    { key: 'defense', label: 'Defense', type: 'rating', field: 'Defense Rating' },
    { key: 'reliability', label: 'Reliability', type: 'rating', field: 'Robot Reliability Rating' },
    { key: 'averageHp', label: 'HP', type: 'number' },
    { key: 'averageHpAuto', label: 'HP Auto', type: 'number' },
    { key: 'climbRate', label: 'Climb %', type: 'percent' },
    { key: 'preferredRole', label: 'Role', type: 'text' },
    { key: 'pitFuel', label: 'Pit FUEL', type: 'text' },
    { key: 'pitBump', label: 'Pit BUMP', type: 'text' },
    { key: 'pitTrench', label: 'Pit TRENCH', type: 'text' },
    { key: 'pitClimb', label: 'Pit CLIMB', type: 'text' },
    { key: 'pitOutpost', label: 'Pit OUTPOST', type: 'text' },
    { key: 'pitAuto', label: 'Pit AUTO', type: 'text' },
  ];

  const sortedSummaries = useMemo(() => {
    if (!sortConfig) return summaries;
    
    return [...summaries].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      
      if (sortConfig.key === 'rank') {
        aVal = a.rank || Infinity;
        bVal = b.rank || Infinity;
      } else if (sortConfig.key === 'teamNumber') {
        aVal = Number(a.teamNumber);
        bVal = Number(b.teamNumber);
      } else if (sortConfig.key === 'matchCount') {
        aVal = a.matchCount;
        bVal = b.matchCount;
      } else if (sortConfig.key === 'averageMatchScore') {
        aVal = a.averageMatchScore || 0;
        bVal = b.averageMatchScore || 0;
      } else if (sortConfig.key === 'overall') {
        aVal = a.averages['Overall Match Impact'] || 0;
        bVal = b.averages['Overall Match Impact'] || 0;
      } else if (sortConfig.key === 'auto') {
        aVal = a.averages['Auto Scoring Rating'] || 0;
        bVal = b.averages['Auto Scoring Rating'] || 0;
      } else if (sortConfig.key === 'autoAccuracy') {
        aVal = a.averages['Auto Accuracy Rating'] || 0;
        bVal = b.averages['Auto Accuracy Rating'] || 0;
      } else if (sortConfig.key === 'driver') {
        aVal = a.averages['Driver Rating'] || 0;
        bVal = b.averages['Driver Rating'] || 0;
      } else if (sortConfig.key === 'speed') {
        aVal = a.averages['Speed Rating'] || 0;
        bVal = b.averages['Speed Rating'] || 0;
      } else if (sortConfig.key === 'scoring') {
        aVal = a.averages['Scoring Threat Rating'] || 0;
        bVal = b.averages['Scoring Threat Rating'] || 0;
      } else if (sortConfig.key === 'accuracy') {
        aVal = a.averages['Accuracy Rating'] || 0;
        bVal = b.averages['Accuracy Rating'] || 0;
      } else if (sortConfig.key === 'defense') {
        aVal = a.averages['Defense Rating'] || 0;
        bVal = b.averages['Defense Rating'] || 0;
      } else if (sortConfig.key === 'reliability') {
        aVal = a.averages['Robot Reliability Rating'] || 0;
        bVal = b.averages['Robot Reliability Rating'] || 0;
      } else if (sortConfig.key === 'averageHp') {
        aVal = a.averageHp;
        bVal = b.averageHp;
      } else if (sortConfig.key === 'averageHpAuto') {
        aVal = a.averageHpAuto;
        bVal = b.averageHpAuto;
      } else if (sortConfig.key === 'climbRate') {
        aVal = a.climbRate;
        bVal = b.climbRate;
      } else if (sortConfig.key === 'preferredRole') {
        aVal = a.preferredRole;
        bVal = b.preferredRole;
      } else {
        return 0;
      }
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
    });
  }, [summaries, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (current?.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns(current => {
      const next = new Set(Array.from(current));
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const moveColumn = (key: string, direction: 'left' | 'right') => {
    setColumnOrder(current => {
      const index = current.indexOf(key);
      if (index === -1) return current;
      const newIndex = direction === 'left' ? Math.max(0, index - 1) : Math.min(current.length - 1, index + 1);
      const next = [...current];
      next.splice(index, 1);
      next.splice(newIndex, 0, key);
      return next;
    });
  };

  const getCellValue = (summary: TeamSummary, key: string) => {
    const pit = summary.pitData || {};
    switch (key) {
      case 'rank': return summary.rank || '-';
      case 'teamNumber': return summary.teamNumber;
      case 'matchCount': return summary.matchCount;
      case 'averageMatchScore': return summary.averageMatchScore?.toFixed(1) || '-';
      case 'overall': return summary.averages['Overall Match Impact'] || 0;
      case 'auto': return summary.averages['Auto Scoring Rating'] || 0;
      case 'autoAccuracy': return summary.averages['Auto Accuracy Rating'] || 0;
      case 'driver': return summary.averages['Driver Rating'] || 0;
      case 'speed': return summary.averages['Speed Rating'] || 0;
      case 'scoring': return summary.averages['Scoring Threat Rating'] || 0;
      case 'accuracy': return summary.averages['Accuracy Rating'] || 0;
      case 'defense': return summary.averages['Defense Rating'] || 0;
      case 'reliability': return summary.averages['Robot Reliability Rating'] || 0;
      case 'averageHp': return summary.averageHp.toFixed(1);
      case 'averageHpAuto': return summary.averageHpAuto.toFixed(1);
      case 'climbRate': return `${summary.climbRate.toFixed(0)}%`;
      case 'preferredRole': return summary.preferredRole;
      case 'pitFuel': return pit.canScoreFuel === 'yes' ? (pit.fuelCapacity || 'Yes') : '-';
      case 'pitBump': return pit.canDriveOverBump === 'yes' ? 'Yes' : '-';
      case 'pitTrench': return pit.canDriveUnderTrench === 'yes' ? 'Yes' : '-';
      case 'pitClimb': return pit.canClimb === 'yes' ? 'Yes' : '-';
      case 'pitOutpost': return pit.canDeliverToOutpost === 'yes' ? 'Yes' : '-';
      case 'pitAuto': return pit.hasAuto === 'yes' ? 'Yes' : '-';
      default: return '-';
    }
  };

  const renderCell = (summary: TeamSummary, key: string) => {
    const value = getCellValue(summary, key);
    const col = allColumns.find(c => c.key === key);
    
    if (col?.type === 'rating' && typeof value === 'number') {
      return <span className="text-sm font-bold text-purple-900 dark:text-purple-200">{value.toFixed(1)}</span>;
    }
    if (col?.type === 'percent' && typeof value === 'string') {
      return <span className="text-sm font-bold">{value}</span>;
    }
    if (key === 'teamNumber') {
      return (
        <Link href={`/teams/${summary.teamNumber}?year=${year}&regional=${regional}`} className="font-black text-purple-900 dark:text-purple-200 hover:underline">
          Team {value}
        </Link>
      );
    }
    return <span className="text-sm">{value}</span>;
  };

  const visibleOrderedColumns = columnOrder.filter(key => visibleColumns.has(key));

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowColumnPanel(!showColumnPanel)}
          className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-bold text-purple-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200"
        >
          {showColumnPanel ? 'Hide' : 'Show'} Columns
        </button>
        <select
          value={graphType}
          onChange={(e) => setGraphType(e.target.value as any)}
          className="rounded-lg border border-purple-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value="none">No Graph</option>
          <option value="scatter">Scatter Plot</option>
          <option value="bar">Bar Chart</option>
        </select>
        {graphType !== 'none' && (
          <>
            <span className="self-center text-sm font-bold text-slate-600 dark:text-slate-400">X: Team</span>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value)}
              className="rounded-lg border border-purple-200 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Y Axis</option>
              {allColumns.filter(c => c.type === 'rating' || c.type === 'number').map(c => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Column Panel */}
      {showColumnPanel && (
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-900/80">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">Column Order & Visibility</div>
          <div className="flex flex-wrap gap-2">
            {allColumns.map(col => (
              <div
                key={col.key}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${visibleColumns.has(col.key) ? 'border-purple-300 bg-purple-100 dark:border-purple-700 dark:bg-purple-900/40' : 'border-slate-200 bg-slate-50 dark:border-zinc-700 dark:bg-zinc-800'}`}
              >
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="h-3 w-3"
                />
                <span className={visibleColumns.has(col.key) ? 'font-semibold' : 'text-slate-500'}>{col.label}</span>
                {visibleColumns.has(col.key) && (
                  <>
                    <button onClick={() => moveColumn(col.key, 'left')} className="ml-1 text-xs hover:text-purple-600">←</button>
                    <button onClick={() => moveColumn(col.key, 'right')} className="text-xs hover:text-purple-600">→</button>
                </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl shadow-purple-900/5 dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-purple-100 dark:border-zinc-800">
                <th className="px-2 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedTeams.size === summaries.length}
                    onChange={() => {
                      if (selectedTeams.size === summaries.length) {
                        setSelectedTeams(new Set());
                      } else {
                        setSelectedTeams(new Set(summaries.map(s => s.teamNumber)));
                      }
                    }}
                    className="h-4 w-4"
                  />
                </th>
                {visibleOrderedColumns.map(key => {
                  const col = allColumns.find(c => c.key === key);
                  const isSorted = sortConfig?.key === key;
                  return (
                    <th
                      key={key}
                      onClick={() => handleSort(key)}
                      className="cursor-pointer px-3 py-3 text-xs font-black text-purple-900 dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-zinc-800"
                    >
                      <div className="flex items-center gap-1">
                        {col?.label}
                        {isSorted && (
                          <span className="text-purple-500">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedSummaries.map(summary => (
                <tr
                  key={summary.teamNumber}
                  className={`border-b border-purple-100/70 dark:border-zinc-800 ${selectedTeams.has(summary.teamNumber) ? 'bg-purple-50/50 dark:bg-purple-900/20' : ''}`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selectedTeams.has(summary.teamNumber)}
                      onChange={() => {
                        const next = new Set(selectedTeams);
                        if (next.has(summary.teamNumber)) next.delete(summary.teamNumber);
                        else next.add(summary.teamNumber);
                        setSelectedTeams(next);
                      }}
                      className="h-4 w-4"
                    />
                  </td>
                  {visibleOrderedColumns.map(key => (
                    <td key={key} className="px-3 py-2">
                      {renderCell(summary, key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Graphs */}
      {graphType !== 'none' && yAxis && (
        <div className="rounded-xl border border-purple-200/70 bg-white/85 p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900/80">
          {selectedTeams.size === 0 ? (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <p className="font-medium">Select teams from the table above to see the graph</p>
              <p className="text-xs mt-1 text-slate-400">Check the checkboxes next to team rows</p>
            </div>
          ) : summaries.filter(s => selectedTeams.has(s.teamNumber)).length === 0 ? (
            <div className="py-8 text-center text-sm text-red-500">
              Error: Selected teams not found in data
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-purple-800 dark:text-purple-300">
                Comparison Graph (Team vs {allColumns.find(c => c.key === yAxis)?.label}) · {selectedTeams.size} teams
              </div>
              {graphType === 'scatter' ? (
                <ScatterPlot data={sortedSummaries.filter(s => selectedTeams.has(s.teamNumber))} xKey="teamNumber" yKey={yAxis} allColumns={allColumns} />
              ) : (
                <BarChart data={sortedSummaries.filter(s => selectedTeams.has(s.teamNumber))} xKey="teamNumber" yKey={yAxis} allColumns={allColumns} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MiniVisualStars({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(10, Math.round(value)));
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={`h-3 w-3 ${i < Math.round(normalized / 2) ? 'fill-purple-500 text-purple-500' : 'text-purple-200 dark:text-purple-700'}`} />
        ))}
      </div>
      <span className="text-xs font-bold text-purple-900 dark:text-purple-200">{normalized}</span>
    </div>
  );
}

function ScatterPlot({ data, xKey, yKey, allColumns }: { data: TeamSummary[]; xKey: string; yKey: string; allColumns: any[] }) {
  const getValue = (summary: TeamSummary, key: string): number => {
    switch (key) {
      case 'rank': return summary.rank || 0;
      case 'teamNumber': return Number(summary.teamNumber);
      case 'matchCount': return summary.matchCount;
      case 'averageMatchScore': return summary.averageMatchScore || 0;
      case 'overall': return summary.averages['Overall Match Impact'] || 0;
      case 'auto': return summary.averages['Auto Scoring Rating'] || 0;
      case 'autoAccuracy': return summary.averages['Auto Accuracy Rating'] || 0;
      case 'driver': return summary.averages['Driver Rating'] || 0;
      case 'speed': return summary.averages['Speed Rating'] || 0;
      case 'scoring': return summary.averages['Scoring Threat Rating'] || 0;
      case 'accuracy': return summary.averages['Accuracy Rating'] || 0;
      case 'defense': return summary.averages['Defense Rating'] || 0;
      case 'reliability': return summary.averages['Robot Reliability Rating'] || 0;
      case 'averageHp': return summary.averageHp;
      case 'averageHpAuto': return summary.averageHpAuto;
      case 'climbRate': return summary.climbRate;
      default: return 0;
    }
  };

  const points = data.map(d => ({ x: getValue(d, xKey), y: getValue(d, yKey), team: d.teamNumber }));
  const maxX = Math.max(...points.map(p => p.x), 1);
  const maxY = Math.max(...points.map(p => p.y), 1);

  return (
    <div className="relative h-80 w-full">
      <svg className="h-full w-full">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={`${t * 100}%`} y1="0%" x2={`${t * 100}%`} y2="100%" stroke="currentColor" strokeOpacity="0.1" />
            <line x1="0%" y1={`${100 - t * 100}%`} x2="100%" y2={`${100 - t * 100}%`} stroke="currentColor" strokeOpacity="0.1" />
          </g>
        ))}
        {/* Points */}
        {points.map(p => (
          <g key={p.team}>
            <circle
              cx={`${(p.x / maxX) * 90 + 5}%`}
              cy={`${100 - (p.y / maxY) * 90 - 5}%`}
              r="8"
              className="fill-purple-500 stroke-purple-700 dark:fill-purple-400 dark:stroke-purple-200"
              strokeWidth="2"
            />
            <text
              x={`${(p.x / maxX) * 90 + 5}%`}
              y={`${100 - (p.y / maxY) * 90 - 12}%`}
              textAnchor="middle"
              className="fill-purple-900 text-xs font-bold dark:fill-purple-100"
            >
              {p.team}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600 dark:text-slate-400">
        {allColumns.find(c => c.key === xKey)?.label}
      </div>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-bold text-slate-600 dark:text-slate-400">
        {allColumns.find(c => c.key === yKey)?.label}
      </div>
    </div>
  );
}

function BarChart({ data, xKey, yKey, allColumns }: { data: TeamSummary[]; xKey: string; yKey: string; allColumns: any[] }) {
  const getValue = (summary: TeamSummary, key: string): number => {
    switch (key) {
      case 'rank': return summary.rank || 0;
      case 'teamNumber': return Number(summary.teamNumber);
      case 'matchCount': return summary.matchCount;
      case 'averageMatchScore': return summary.averageMatchScore || 0;
      case 'overall': return summary.averages['Overall Match Impact'] || 0;
      case 'auto': return summary.averages['Auto Scoring Rating'] || 0;
      case 'autoAccuracy': return summary.averages['Auto Accuracy Rating'] || 0;
      case 'driver': return summary.averages['Driver Rating'] || 0;
      case 'speed': return summary.averages['Speed Rating'] || 0;
      case 'scoring': return summary.averages['Scoring Threat Rating'] || 0;
      case 'accuracy': return summary.averages['Accuracy Rating'] || 0;
      case 'defense': return summary.averages['Defense Rating'] || 0;
      case 'reliability': return summary.averages['Robot Reliability Rating'] || 0;
      case 'averageHp': return summary.averageHp;
      case 'averageHpAuto': return summary.averageHpAuto;
      case 'climbRate': return summary.climbRate;
      default: return 0;
    }
  };

  const maxVal = Math.max(...data.map(d => getValue(d, yKey)), 1);

  return (
    <div className="space-y-2">
      {data.map(d => {
        const val = getValue(d, yKey);
        const width = (val / maxVal) * 100;
        return (
          <div key={d.teamNumber} className="flex items-center gap-2">
            <span className="w-16 text-xs font-bold">Team {d.teamNumber}</span>
            <div className="flex-1">
              <div className="h-6 overflow-hidden rounded-full bg-purple-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-700 transition-all"
                  style={{ width: `${Math.max(4, width)}%` }}
                />
              </div>
            </div>
            <span className="w-12 text-right text-xs font-bold">{val.toFixed(1)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ScoutMatchCard({ row }: { row: ViewerRow }) {
  const shotPoints = normalizeShotPoints(row);
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-black text-purple-950 dark:text-white">Team {row.teamNumber}</div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{row['Primary Role'] || '-'}</div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ratingFields.map(([field, label]) => (
          <div key={`${row.id}_${field}`} className="rounded-lg border border-purple-100 bg-white/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div>
            <VisualStars value={Number(row[field] || 0)} />
          </div>
        ))}
        <MiniStat label="HP Auto" value={String(Number(row['Human Player Auto Count'] || 0))} />
        <MiniStat label="HP" value={String(Number(row['Human Player Count'] || 0))} />
        <MiniStat label="Shots Marked" value={String(shotPoints.length)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RebuiltFieldMapDisplay title="Auton Start" activePoint={toPoint(row['Starting Position X'], row['Starting Position Y'])} />
        <RebuiltFieldMapDisplay title="Teleop Shots" activePoints={shotPoints} />
      </div>
      <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <div><span className="font-bold text-purple-900 dark:text-purple-200">Teleop:</span> {row['Teleop Comments'] || '-'}</div>
        <div><span className="font-bold text-purple-900 dark:text-purple-200">Endgame:</span> {row['Endgame Comments'] || '-'}</div>
      </div>
    </div>
  );
}

function SuperMatchCard({ report, rows }: { report: SuperScoutReport; rows: ViewerRow[] }) {
  const reportTeams = report.teams || [];
  const scoutComments = rows.filter((row) => reportTeams.includes(String(row.teamNumber || '')));

  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-black capitalize text-purple-950 dark:text-white">{report.alliance || 'Alliance'} Alliance</div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{report.scoutName || 'Super Scout'}</div>
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">Teams: {(report.teams || []).join(', ') || '-'}</div>
      
      {/* Scout Comments */}
      {scoutComments.length > 0 && (
        <div className="mt-3 space-y-2 border-b border-purple-200/50 pb-3 dark:border-zinc-700/50">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">Scout Comments</div>
          {scoutComments.map((row) => (
            <div key={row.id} className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-bold text-purple-900 dark:text-purple-200">Team {row.teamNumber}:</span>
              <div className="mt-0.5 pl-2">
                {row['Teleop Comments'] && <div className="break-words">Teleop: {String(row['Teleop Comments'])}</div>}
                {row['Endgame Comments'] && <div className="break-words">Endgame: {String(row['Endgame Comments'])}</div>}
                {!row['Teleop Comments'] && !row['Endgame Comments'] && <div className="text-slate-400">-</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Super Scout Team Notes */}
      <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">Super Scout Notes</div>
        <div className="space-y-1">
          {Object.entries(report.data?.teamSpecificNotes || {}).map(([team, note]) => (
            <div key={`${report.id}_${team}`} className="break-words">
              <span className="font-bold text-purple-900 dark:text-purple-200">Team {team}:</span> {String(note || '-')}
            </div>
          ))}
          {Object.keys(report.data?.teamSpecificNotes || {}).length === 0 ? <div>-</div> : null}
        </div>
      </div>
    </div>
  );
}

function buildSummaries(rows: ViewerRow[], reports: SuperScoutReport[], matchScores: MatchScore[], rankMap: Record<string, number>) {
  const byTeam = new Map<string, TeamSummary>();
  const roleBuckets = new Map<string, string[]>();
  const teamNotes = new Map<string, string[]>();
  const allianceNotes = new Map<string, string[]>();

  reports.forEach((report) => {
    Object.entries(report.data?.teamSpecificNotes || {}).forEach(([team, note]) => {
      const key = String(team);
      if (!teamNotes.has(key)) teamNotes.set(key, []);
      if (String(note || '').trim()) teamNotes.get(key)?.push(`M${report.matchNumber || '?'}: ${String(note).trim()}`);
    });

    const broadNotes = [report.data?.overallNotes, report.data?.defenseNotes]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .join(' | ');

    for (const team of report.teams || []) {
      const key = String(team);
      if (!allianceNotes.has(key)) allianceNotes.set(key, []);
      if (broadNotes) allianceNotes.get(key)?.push(`M${report.matchNumber || '?'} ${broadNotes}`);
    }
  });

  rows.forEach((row) => {
    const teamNumber = String(row.teamNumber || '');
    if (!teamNumber) return;

    const current =
      byTeam.get(teamNumber) || {
        teamNumber,
        matchCount: 0,
        rank: rankMap[teamNumber] || null,
        averageMatchScore: null,
        averages: {},
        averageHpAuto: 0,
        averageHp: 0,
        preferredRole: '',
        climbRate: 0,
        reliability: 0,
        startPoints: [],
        shotPoints: [],
        matches: [],
        superNotes: [],
        allianceNotes: [],
      };

    current.matchCount += 1;
    current.matches.push(row);
    ratingFields.forEach(([field]) => {
      current.averages[field] = (current.averages[field] || 0) + Number(row[field] || 0);
    });
    current.averageHpAuto += Number(row['Human Player Auto Count'] || 0);
    current.averageHp += Number(row['Human Player Count'] || 0);
    current.reliability += Number(row['Robot Reliability Rating'] || 0);
    if (row['Climb Attempted'] && !row['Climb Failed']) current.climbRate += 1;

    const startPoint = toPoint(row['Starting Position X'], row['Starting Position Y']);
    const shotPoints = normalizeShotPoints(row);
    if (startPoint) current.startPoints.push(startPoint);
    if (shotPoints.length > 0) current.shotPoints.push(...shotPoints);

    if (!roleBuckets.has(teamNumber)) roleBuckets.set(teamNumber, []);
    if (row['Primary Role']) roleBuckets.get(teamNumber)?.push(String(row['Primary Role']));

    byTeam.set(teamNumber, current);
  });

  return Array.from(byTeam.values())
    .map((summary) => {
      const averages = { ...summary.averages };
      ratingFields.forEach(([field]) => {
        averages[field] = summary.matchCount > 0 ? Number((averages[field] / summary.matchCount).toFixed(1)) : 0;
      });

      return {
        ...summary,
        rank: rankMap[summary.teamNumber] || null,
        averageMatchScore: getAverageMatchScore(summary.teamNumber, matchScores),
        averages,
        averageHpAuto: summary.matchCount > 0 ? Number((summary.averageHpAuto / summary.matchCount).toFixed(1)) : 0,
        averageHp: summary.matchCount > 0 ? Number((summary.averageHp / summary.matchCount).toFixed(1)) : 0,
        preferredRole: mostCommon(roleBuckets.get(summary.teamNumber) || []),
        climbRate: summary.matchCount > 0 ? (summary.climbRate / summary.matchCount) * 100 : 0,
        reliability: summary.matchCount > 0 ? Number((summary.reliability / summary.matchCount).toFixed(1)) : 0,
        superNotes: teamNotes.get(summary.teamNumber) || [],
        allianceNotes: allianceNotes.get(summary.teamNumber) || [],
        pitData: summary.pitData || {},
      };
    })
    .sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return Number(a.teamNumber) - Number(b.teamNumber);
    });
}

function buildMatchGroups(rows: ViewerRow[], reports: SuperScoutReport[]) {
  const matchMap = new Map<number, { key: string; matchNumber: number; rows: ViewerRow[]; reports: SuperScoutReport[] }>();
  rows.forEach((row) => {
    const matchNumber = Number(row.matchNumber || 0);
    if (!matchMap.has(matchNumber)) matchMap.set(matchNumber, { key: `match_${matchNumber}`, matchNumber, rows: [], reports: [] });
    matchMap.get(matchNumber)?.rows.push(row);
  });
  reports.forEach((report) => {
    const matchNumber = Number(report.matchNumber || 0);
    if (!matchMap.has(matchNumber)) matchMap.set(matchNumber, { key: `match_${matchNumber}`, matchNumber, rows: [], reports: [] });
    matchMap.get(matchNumber)?.reports.push(report);
  });
  return Array.from(matchMap.values()).sort((a, b) => a.matchNumber - b.matchNumber);
}

function normalizeShotPoints(row: ViewerRow) {
  const positions = Array.isArray(row['Shooting Positions']) ? row['Shooting Positions'] : [];
  const normalized = positions.map((point) => toPoint(point?.x, point?.y)).filter((point): point is XYPoint => Boolean(point));
  if (normalized.length > 0) return normalized;
  const fallback = toPoint(row['Shooting Position X'], row['Shooting Position Y']);
  return fallback ? [fallback] : [];
}

function normalizeMatchScores(matches: any[]): MatchScore[] {
  return matches
    .map((match) => {
      const matchNumber = Number(match.matchNumber || match?.match_number || 0);
      const redTeams = normalizeTeams(match?.alliances?.red?.teams || match?.red?.teams || match?.redTeams);
      const blueTeams = normalizeTeams(match?.alliances?.blue?.teams || match?.blue?.teams || match?.blueTeams);
      const red = Number(match?.alliances?.red?.score ?? match?.red?.score ?? match?.redScore ?? 0);
      const blue = Number(match?.alliances?.blue?.score ?? match?.blue?.score ?? match?.blueScore ?? 0);
      return { id: String(match.id || matchNumber), matchNumber, red, blue, redTeams, blueTeams };
    })
    .filter((match) => match.matchNumber > 0);
}

function normalizeTeams(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').replace('frc', '')).filter(Boolean);
}

function getAverageMatchScore(teamNumber: string, matchScores: MatchScore[]) {
  const scores = matchScores
    .map((match) => {
      if (match.redTeams.includes(teamNumber)) return match.red;
      if (match.blueTeams.includes(teamNumber)) return match.blue;
      return null;
    })
    .filter((score): score is number => typeof score === 'number');

  if (scores.length === 0) return null;
  return Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1));
}

function compactMatchSummary(match: ViewerRow) {
  return `M${match.matchNumber}: ${match['Primary Role'] || 'mixed'}, HP ${Number(match['Human Player Count'] || 0)}, overall ${(Number(match['Overall Match Impact'] || 0)).toFixed(1)}`;
}

function mostCommon(values: string[]) {
  if (values.length === 0) return '-';
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
}

function toPoint(x: unknown, y: unknown) {
  const numericX = Number(x || 0);
  const numericY = Number(y || 0);
  if (numericX === 0 && numericY === 0) return null;
  return { x: numericX, y: numericY };
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{label}</div>
      <div className="mt-1 text-sm font-bold text-purple-950 dark:text-white">{value}</div>
    </div>
  );
}

function InfoPanel({ title, lines, empty, useMarkdown }: { title: string; lines: string[]; empty: string; useMarkdown?: boolean }) {
  return (
    <div className="rounded-lg border border-purple-100 bg-purple-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-purple-700 dark:text-purple-300">{title}</div>
      <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
        {lines.length > 0 ? lines.map((line, index) => (
          <div key={`${title}_${index}`} className="break-words">
            {useMarkdown ? (
              <div className="[&_p]:my-1 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:bg-gray-100 dark:[&_code]:bg-zinc-800 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:bg-gray-100 dark:[&_pre]:bg-zinc-800 [&_table]:my-1 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_a]:text-purple-600 [&_a]:underline">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{line}</ReactMarkdown>
              </div>
            ) : (
              line
            )}
          </div>
        )) : <div>{empty}</div>}
      </div>
    </div>
  );
}

function GraphBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span>{label}</span>
        <span>{value.toFixed(1)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-purple-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-700" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function VisualStars({ value }: { value: number }) {
  const normalizedValue = Math.max(0, Math.min(10, Math.round(value)));
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="grid grid-cols-5 gap-1 text-purple-500 dark:text-purple-300 lg:grid-cols-10">
        {Array.from({ length: 10 }, (_, index) => index + 1).map((index) => (
          <Star key={index} className={`h-4 w-4 ${index <= normalizedValue ? 'fill-current' : ''}`} />
        ))}
      </div>
      <span className="text-sm font-bold text-purple-900 dark:text-purple-200">{normalizedValue}/10</span>
    </div>
  );
}

function MedalChip({ place }: { place: number }) {
  const labels = ['Gold', 'Silver', 'Bronze'];
  const styles = [
    'border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-100',
    'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
    'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100',
  ];
  return <div className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${styles[place]}`}>{labels[place]}</div>;
}

function cardClassName(index: number) {
  if (index === 0) return 'border-yellow-300 dark:border-yellow-700';
  if (index === 1) return 'border-slate-300 dark:border-slate-600';
  if (index === 2) return 'border-amber-300 dark:border-amber-700';
  return 'border-purple-200/70 dark:border-zinc-800';
}

const toggleClassName = (active: boolean) =>
  `rounded-lg px-4 py-3 text-sm font-bold transition-colors ${active ? 'bg-purple-600 text-white' : 'border border-purple-200 bg-purple-50 text-purple-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-purple-200'}`;
