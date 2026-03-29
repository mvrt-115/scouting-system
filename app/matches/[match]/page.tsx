'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, ArrowLeft, ShieldAlert, Database } from 'lucide-react';
import Link from 'next/link';

export default function MatchDataView() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const matchNumber = params.match as string;
  const urlYear = searchParams.get('year');
  const urlRegional = searchParams.get('regional');

  const { user, isAuthChecking } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [matchData, setMatchData] = useState<any>(null);
  const [teamAverages, setTeamAverages] = useState<Record<string, any>>({});
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

  const fetchMatchAndScoutingData = useCallback(async () => {
    setIsLoading(true);
    try {
      let year = urlYear;
      let regional = urlRegional;
      let tbaKey = process.env.NEXT_PUBLIC_TBA_API_KEY;

      // If year/regional aren't in URL, try to get from settings
      if (!year || !regional) {
        const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          year = data.year;
          regional = data.regional;
        } else {
          throw new Error("Missing year/regional parameters and no current event set.");
        }
      }

      // 1. Fetch match from TBA
      const matchKey = `${year}${regional}_qm${matchNumber}`;
      const response = await fetch(`https://www.thebluealliance.com/api/v3/match/${matchKey}`, {
        headers: {
          'X-TBA-Auth-Key': tbaKey || ''
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch match data from TBA. Match ${matchNumber} might not exist yet.`);
      }
      
      const tbaMatchData = await response.json();
      setMatchData(tbaMatchData);
      
      const redTeams = tbaMatchData.alliances.red.team_keys.map((k: string) => k.replace('frc', ''));
      const blueTeams = tbaMatchData.alliances.blue.team_keys.map((k: string) => k.replace('frc', ''));
      const allTeams = [...redTeams, ...blueTeams];

      // 2. Fetch scouting averages for these teams
      const averages: Record<string, any> = {};
      const metricsSet = new Set<string>();

      for (const teamId of allTeams) {
        const matchesRef = collection(db, `years/${year}/regionals/${regional}/teams/${teamId}/matches`);
        const matchesSnapshot = await getDocs(matchesRef);
        
        if (matchesSnapshot.empty) {
          averages[teamId] = null;
          continue;
        }
        
        const teamTotals: Record<string, number> = {};
        const matchCount = matchesSnapshot.size;
        
        matchesSnapshot.forEach(matchDoc => {
          const data = matchDoc.data();
          Object.keys(data).forEach(key => {
            if (typeof data[key] === 'number') {
              metricsSet.add(key);
              teamTotals[key] = (teamTotals[key] || 0) + data[key];
            }
          });
        });
        
        const teamAvg: any = { matchCount };
        Object.keys(teamTotals).forEach(key => {
          teamAvg[key] = Number((teamTotals[key] / matchCount).toFixed(2));
        });
        
        averages[teamId] = teamAvg;
      }

      setTeamAverages(averages);
      setAvailableMetrics(Array.from(metricsSet));
      
    } catch (err: any) {
      console.error("Error fetching match data:", err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [matchNumber, urlYear, urlRegional]);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    } else if (user) {
      fetchMatchAndScoutingData();
    }
  }, [user, isAuthChecking, router, fetchMatchAndScoutingData]);

  if (isAuthChecking || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-900 mb-2">Error Loading Match</h2>
          <p className="text-red-700 mb-6">{error}</p>
          <Link href="/dashboard" className="text-purple-600 font-medium hover:underline">
            Return to Data Viewer
          </Link>
        </div>
      </div>
    );
  }

  if (!matchData) return null;

  const redTeams = matchData.alliances.red.team_keys.map((k: string) => k.replace('frc', ''));
  const blueTeams = matchData.alliances.blue.team_keys.map((k: string) => k.replace('frc', ''));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-purple-600 hover:text-purple-800 flex items-center gap-2 font-medium w-fit">
          <ArrowLeft className="h-4 w-4" /> Back to Data Viewer
        </Link>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <h1 className="text-3xl font-bold text-gray-900">Match {matchNumber} Overview</h1>
          <p className="text-gray-600 mt-1">Comparing scouting averages for the teams in this match.</p>
        </div>

        <div className="p-6">
          {availableMetrics.length === 0 ? (
            <div className="text-center py-12">
              <Database className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No scouting data available for any teams in this match yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="p-3 text-sm font-semibold text-gray-600 sticky left-0 bg-gray-50 z-10">Metric</th>
                    {/* Red Alliance Headers */}
                    {redTeams.map((team: string) => (
                      <th key={`header-${team}`} className="p-3 text-sm font-bold text-red-700 bg-red-50 text-center border-l border-red-200">
                        <Link href={`/teams/${team}`} className="hover:underline">Team {team}</Link>
                      </th>
                    ))}
                    {/* Blue Alliance Headers */}
                    {blueTeams.map((team: string) => (
                      <th key={`header-${team}`} className="p-3 text-sm font-bold text-blue-700 bg-blue-50 text-center border-l border-blue-200">
                        <Link href={`/teams/${team}`} className="hover:underline">Team {team}</Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr className="hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white">Matches Scouted</td>
                    {redTeams.map((team: string) => (
                      <td key={`count-${team}`} className="p-3 text-center border-l border-gray-100">
                        {teamAverages[team] ? teamAverages[team].matchCount : 0}
                      </td>
                    ))}
                    {blueTeams.map((team: string) => (
                      <td key={`count-${team}`} className="p-3 text-center border-l border-gray-100">
                        {teamAverages[team] ? teamAverages[team].matchCount : 0}
                      </td>
                    ))}
                  </tr>
                  
                  {availableMetrics.map(metric => (
                    <tr key={metric} className="hover:bg-gray-50">
                      <td className="p-3 font-medium text-gray-900 sticky left-0 bg-white capitalize">
                        {metric.replace(/([A-Z])/g, ' $1').trim()}
                      </td>
                      {/* Red Alliance Data */}
                      {redTeams.map((team: string) => {
                        const val = teamAverages[team]?.[metric];
                        return (
                          <td key={`${metric}-${team}`} className="p-3 text-center border-l border-gray-100 font-mono">
                            {val !== undefined ? val : '-'}
                          </td>
                        );
                      })}
                      {/* Blue Alliance Data */}
                      {blueTeams.map((team: string) => {
                        const val = teamAverages[team]?.[metric];
                        return (
                          <td key={`${metric}-${team}`} className="p-3 text-center border-l border-gray-100 font-mono">
                            {val !== undefined ? val : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
