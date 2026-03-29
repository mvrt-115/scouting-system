'use client';

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { Loader2, AlertCircle, Database, Search, Filter, BarChart3, Plus, ClipboardList, FileText, Download } from 'lucide-react';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const LEGACY_YEAR_CUTOFF = 2026;

function isLegacyYear(value: string) {
  const numericYear = Number(value);
  return Number.isFinite(numericYear) && numericYear > 0 && numericYear < LEGACY_YEAR_CUTOFF;
}

function sortYearsDesc(values: string[]) {
  return [...values].sort((a, b) => Number(b) - Number(a) || b.localeCompare(a));
}

export default function DataViewer({ year, regional }: { year: string, regional: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoadedTeams, setHasLoadedTeams] = useState(false);

  const [selectedYear, setSelectedYear] = useState(year || '');
  const [selectedRegional, setSelectedRegional] = useState(regional || '');
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [availableRegionals, setAvailableRegionals] = useState<string[]>([]);
  
  const [teamsData, setTeamsData] = useState<any[]>([]);
  const [regionalAverages, setRegionalAverages] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'teams' | 'regional'>('teams');
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Graphing state
  const [graphs, setGraphs] = useState<string[]>([]);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [selectedMetricToAdd, setSelectedMetricToAdd] = useState('');

  const handleYearChange = (nextYear: string) => {
    setSelectedYear(nextYear);
    setSelectedRegional('');
    setHasLoadedTeams(false);
    setTeamsData([]);
    setRegionalAverages([]);
    setAvailableRegionals([]);
    setAvailableMetrics([]);
    setSelectedMetricToAdd('');
    setGraphs([]);
    setViewMode('teams');
    setError('');
  };

  const fetchYears = useCallback(async () => {
    try {
      const yearsSnapshot = await getDocs(collection(db, 'years'));
      let years = sortYearsDesc(yearsSnapshot.docs.map((doc) => doc.id).filter(isLegacyYear));

      if (years.length === 0) {
        const scoutingSnapshot = await getDocs(query(collection(db, 'scouting_data'), limit(2000)));
        const scoutingYears = Array.from(
          new Set(
            scoutingSnapshot.docs
              .map((entry) => String((entry.data() as any).year || ''))
              .filter(isLegacyYear)
          )
        );
        years = sortYearsDesc(scoutingYears);
      }

      if (years.length > 0) {
        setAvailableYears(years);
        if (!selectedYear || !years.includes(selectedYear)) {
          setSelectedYear(years[0]);
        }
      } else {
        setAvailableYears([]);
      }
    } catch (err) {
      console.error('Failed to fetch years for Data Viewer:', err);
    }
  }, []);

  const fetchRegionals = useCallback(async () => {
    if (!selectedYear) {
      setAvailableRegionals([]);
      return;
    }

    try {
      const regionalsSnapshot = await getDocs(collection(db, `years/${selectedYear}/regionals`));
      let regionals = regionalsSnapshot.docs.map((doc) => doc.id).sort((a, b) => a.localeCompare(b));

      if (regionals.length === 0) {
        const scoutingSnapshot = await getDocs(query(collection(db, 'scouting_data'), limit(2000)));
        const scoutingRegionals = Array.from(
          new Set(
            scoutingSnapshot.docs
              .map((entry) => ({
                year: String((entry.data() as any).year || ''),
                regional: String((entry.data() as any).regional || '').trim(),
              }))
              .filter((entry) => entry.year === selectedYear && Boolean(entry.regional))
              .map((entry) => entry.regional)
          )
        ).sort((a, b) => a.localeCompare(b));
        regionals = scoutingRegionals;
      }

      setAvailableRegionals(regionals);
      if (regionals.length > 0 && (!selectedRegional || !regionals.includes(selectedRegional))) {
        setSelectedRegional(regionals[0]);
      } else if (regionals.length === 0) {
        setSelectedRegional('');
      }
    } catch (err) {
      console.error('Failed to fetch regionals for Data Viewer:', err);
      setAvailableRegionals([]);
    }
  }, [selectedYear]);

  const fetchTeamsData = useCallback(async () => {
    if (!selectedYear || !selectedRegional) return;
    
    setIsLoading(true);
    setError('');
    setViewMode('teams');
    try {
      const apiKey = process.env.NEXT_PUBLIC_TBA_API_KEY;
      let rankingsMap: Record<string, number> = {};
      let teams: any[] = [];

      if (apiKey) {
        try {
          const teamsResponse = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedYear}${selectedRegional}/teams`, {
            headers: { 'X-TBA-Auth-Key': apiKey },
          });

          if (teamsResponse.ok) {
            const data = await teamsResponse.json();

            try {
              const rankingsResponse = await fetch(`https://www.thebluealliance.com/api/v3/event/${selectedYear}${selectedRegional}/rankings`, {
                headers: { 'X-TBA-Auth-Key': apiKey },
              });
              if (rankingsResponse.ok) {
                const rankingsData = await rankingsResponse.json();
                if (rankingsData && rankingsData.rankings) {
                  rankingsData.rankings.forEach((r: any) => {
                    rankingsMap[String(r.team_key || '').replace('frc', '')] = Number(r.rank || 0);
                  });
                }
              }
            } catch (e) {
              console.error('Failed to fetch rankings', e);
            }

            teams = data.map((team: any) => ({
              id: team.team_number.toString(),
              name: team.nickname || team.name,
              city: team.city,
              state_prov: team.state_prov,
              country: team.country,
              rookie_year: team.rookie_year,
              rank: rankingsMap[team.team_number?.toString()] || 9999,
            }));
          }
        } catch (tbaError) {
          console.error('TBA team fetch failed, falling back to Firestore', tbaError);
        }
      }

      if (teams.length === 0) {
        const teamsSnapshot = await getDocs(collection(db, `years/${selectedYear}/regionals/${selectedRegional}/teams`));
        teams = teamsSnapshot.docs.map((entry) => ({
          id: entry.id,
          name: String((entry.data() as any).name || `Team ${entry.id}`),
          city: String((entry.data() as any).city || ''),
          state_prov: String((entry.data() as any).state_prov || ''),
          country: String((entry.data() as any).country || ''),
          rookie_year: (entry.data() as any).rookie_year,
          rank: Number((entry.data() as any).rank || 9999),
        }));
      }

      teams.sort((a: any, b: any) => a.rank - b.rank || Number(a.id) - Number(b.id));
      setTeamsData(teams);
      setHasLoadedTeams(true);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError(err.message || "Failed to load data from The Blue Alliance.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedRegional]);

  useEffect(() => {
    fetchYears();
  }, [fetchYears]);

  useEffect(() => {
    fetchRegionals();
  }, [fetchRegionals]);

  useEffect(() => {
    if (!selectedYear || !selectedRegional) return;
    if (isLoading || hasLoadedTeams) return;
    fetchTeamsData();
  }, [fetchTeamsData, hasLoadedTeams, isLoading, selectedRegional, selectedYear]);

  useEffect(() => {
    setHasLoadedTeams(false);
    setTeamsData([]);
    setError('');
  }, [selectedYear, selectedRegional]);

  const fetchRegionalData = useCallback(async () => {
    if (!selectedYear || !selectedRegional) return;
    
    setIsLoading(true);
    setError('');
    setViewMode('regional');
    try {
      // Fetch all teams that have been scouted in this regional
      const teamsRef = collection(db, `years/${selectedYear}/regionals/${selectedRegional}/teams`);
      const teamsSnapshot = await getDocs(teamsRef);
      
      const averages: any[] = [];
      const metricsSet = new Set<string>();
      
      let teamsToFetch = Array.from(new Set([
        ...teamsSnapshot.docs.map(doc => doc.id),
        ...teamsData.map(t => t.id)
      ]));

      for (const teamId of teamsToFetch) {
        const matchesRef = collection(db, `years/${selectedYear}/regionals/${selectedRegional}/teams/${teamId}/matches`);
        const matchesSnapshot = await getDocs(matchesRef);
        
        const teamTotals: Record<string, number> = {};
        const teamComments: string[] = [];
        const matchCount = matchesSnapshot.size;
        
        if (!matchesSnapshot.empty) {
          matchesSnapshot.forEach(matchDoc => {
            const data = matchDoc.data();
            Object.keys(data).forEach(key => {
              if (
                typeof data[key] === 'number' && 
                key !== 'team' && key !== 'teamNumber' && 
                key !== 'match' && key !== 'matchNumber' && 
                key !== 'year' && key !== 'timestamp'
              ) {
                metricsSet.add(key);
                teamTotals[key] = (teamTotals[key] || 0) + data[key];
              } else if (typeof data[key] === 'boolean') {
                metricsSet.add(key);
                teamTotals[key] = (teamTotals[key] || 0) + (data[key] ? 1 : 0);
              } else if (typeof data[key] === 'string' && (key.toLowerCase().includes('comment') || key.toLowerCase() === 'notes')) {
                if (data[key].trim()) {
                  teamComments.push(data[key]);
                }
              }
            });
          });
        }
        
        const teamAverages: any = { id: teamId };
        if (matchCount > 0) {
          Object.keys(teamTotals).forEach(key => {
            teamAverages[key] = Number((teamTotals[key] / matchCount).toFixed(2));
          });
        }
        teamAverages.matchCount = matchCount;
        teamAverages.comments = teamComments;
        
        averages.push(teamAverages);
      }
      
      averages.sort((a, b) => parseInt(a.id) - parseInt(b.id));
      setRegionalAverages(averages);
      
      const metricsArray = Array.from(metricsSet);
      setAvailableMetrics(metricsArray);
      if (metricsArray.length > 0 && !selectedMetricToAdd) {
        setSelectedMetricToAdd(metricsArray[0]);
      }
      setHasLoadedTeams(true);
      
    } catch (err: any) {
      console.error("Error fetching regional data:", err);
      setError(err.message || "Failed to load regional data from Firestore.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedRegional, teamsData, selectedMetricToAdd]);

  const addGraph = () => {
    if (selectedMetricToAdd && !graphs.includes(selectedMetricToAdd)) {
      setGraphs([...graphs, selectedMetricToAdd]);
    }
  };

  const downloadCurrentData = () => {
    const sourceRows = viewMode === 'regional' ? filteredAverages : filteredTeams;
    const filename = `${selectedYear || 'event'}_${selectedRegional || 'regional'}_${viewMode === 'regional' ? 'regional' : 'teams'}.json`;
    const blob = new Blob([JSON.stringify(sourceRows, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const removeGraph = (metric: string) => {
    setGraphs(graphs.filter(g => g !== metric));
  };

  const filteredTeams = teamsData.filter(team => 
    team.id.includes(searchQuery) || 
    (team.name && team.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredAverages = regionalAverages.filter(team => 
    team.id.includes(searchQuery)
  );

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-gray-500" />
          <h2 className="font-bold text-gray-700 dark:text-zinc-100">Data Viewer</h2>
        </div>
        <div className="flex items-center gap-2">
          {viewMode === 'regional' && (
            <button
              onClick={fetchTeamsData}
              className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
            >
              <ClipboardList className="h-4 w-4" /> View Teams
            </button>
          )}
          <button 
            onClick={fetchRegionalData}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 text-sm"
          >
            <BarChart3 className="h-4 w-4" /> View Regional Data
          </button>
          <button
            onClick={downloadCurrentData}
            className="bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-200 px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2 text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" /> Download Data
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-500"
            >
              {availableYears.length === 0 && <option value="">No years found</option>}
              {availableYears.map((yearOption) => (
                <option key={yearOption} value={yearOption}>{yearOption}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Regional</label>
            <select
              value={selectedRegional}
              onChange={(e) => setSelectedRegional(e.target.value)}
              className="w-full border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-500"
              disabled={!selectedYear || availableRegionals.length === 0}
            >
              {availableRegionals.length === 0 && <option value="">No regionals found</option>}
              {availableRegionals.map((regionalOption) => (
                <option key={regionalOption} value={regionalOption}>{regionalOption}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={async () => {
                await fetchTeamsData();
                setHasLoadedTeams(true);
              }}
              disabled={!selectedYear || !selectedRegional || isLoading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg font-semibold text-sm"
            >
              Refresh Selection
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
            <p className="text-gray-500 dark:text-zinc-400">Loading data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-medium mb-1">Error</h3>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        ) : viewMode === 'teams' ? (
          !hasLoadedTeams ? (
            <div className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-8 text-center">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">Ready To Load</h3>
              <p className="text-gray-500 dark:text-zinc-400 mt-2">Choose year and regional, then press Refresh Selection.</p>
            </div>
          ) : (
          filteredTeams.length === 0 ? (
            <div className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-8 text-center">
              <Database className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">No Data Found</h3>
              <p className="text-gray-500 dark:text-zinc-400 mt-2">No teams found for {selectedYear} {selectedRegional}.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800 border-y border-gray-200 dark:border-zinc-700">
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Rank</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Team Number</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Name</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Location</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-zinc-700">
                  {filteredTeams.map((team) => (
                    <tr key={team.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800">
                      <td className="p-3 font-bold text-gray-900 dark:text-zinc-100">{team.rank !== 9999 ? team.rank : '-'}</td>
                      <td className="p-3 font-bold text-purple-900 dark:text-purple-300">{team.id}</td>
                      <td className="p-3 font-medium text-gray-900 dark:text-zinc-100">{team.name || 'N/A'}</td>
                      <td className="p-3 text-gray-600 dark:text-zinc-400">
                        {[team.city, team.state_prov, team.country].filter(Boolean).join(', ') || 'N/A'}
                      </td>
                      <td className="p-3 text-right">
                        <Link 
                          href={`/teams/${team.id}?year=${selectedYear}&regional=${selectedRegional}`} 
                          className="text-purple-600 hover:text-purple-800 dark:text-purple-400 text-sm font-medium"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
          )
        ) : (
          // Regional Averages View
          <div>
            <div className="mb-8 bg-purple-50 dark:bg-zinc-800 p-4 rounded-xl border border-purple-100 dark:border-zinc-700 flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-purple-900 dark:text-purple-300 mb-1">Select Metric to Graph</label>
                <select 
                  value={selectedMetricToAdd}
                  onChange={(e) => setSelectedMetricToAdd(e.target.value)}
                  className="w-full border border-purple-200 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-purple-500 bg-white dark:bg-zinc-900"
                >
                  {availableMetrics.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={addGraph}
                disabled={!selectedMetricToAdd || graphs.includes(selectedMetricToAdd)}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Graph
              </button>
            </div>

            {graphs.length > 0 && (
              <div className="space-y-8 mb-12">
                {graphs.map(metric => (
                  <div key={metric} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100 capitalize">{metric.replace(/([A-Z])/g, ' $1').trim()} Average</h3>
                      <button onClick={() => removeGraph(metric)} className="text-red-500 hover:text-red-700 text-sm font-medium">Remove</button>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={filteredAverages}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="id" />
                          <YAxis />
                          <Tooltip 
                            cursor={{fill: '#f3e8ff'}}
                            contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                          />
                          <Legend />
                          <Bar dataKey={metric} fill="#9333ea" radius={[4, 4, 0, 0]} name="Average" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto">
              <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-4">Regional Averages Table</h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-zinc-800 border-y border-gray-200 dark:border-zinc-700">
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300 sticky left-0 bg-gray-50 dark:bg-zinc-800">Team</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Matches</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300">Comments</th>
                    {availableMetrics.map(metric => (
                      <th key={metric} className="p-3 text-sm font-semibold text-gray-600 dark:text-zinc-300 capitalize">
                        {metric.replace(/([A-Z])/g, ' $1').trim()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-zinc-700">
                  {filteredAverages.map((team) => (
                    <tr key={team.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800">
                      <td className="p-3 font-bold text-purple-900 dark:text-purple-300 sticky left-0 bg-white dark:bg-zinc-900 group-hover:bg-gray-50 dark:group-hover:bg-zinc-800">
                        <Link href={`/teams/${team.id}?year=${selectedYear}&regional=${selectedRegional}`} className="hover:underline">{team.id}</Link>
                      </td>
                      <td className="p-3 text-gray-600 dark:text-zinc-400">{team.matchCount}</td>
                      <td className="p-3 text-xs text-gray-500 dark:text-zinc-500 max-w-xs">
                        {team.comments && team.comments.length > 0 ? (
                          <div className="line-clamp-2 italic">
                            &quot;{team.comments[team.comments.length - 1]}&quot;
                            {team.comments.length > 1 && <span className="text-purple-600 dark:text-purple-400 font-bold ml-1">+{team.comments.length - 1} more</span>}
                          </div>
                        ) : '-'}
                      </td>
                      {availableMetrics.map(metric => (
                        <td key={metric} className="p-3 text-gray-900 dark:text-zinc-100 font-medium">
                          {team[metric] !== undefined ? team[metric] : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
