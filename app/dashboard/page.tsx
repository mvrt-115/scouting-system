'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Clock, ClipboardList, Edit3, Eye } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function Dashboard() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentData, setAssignmentData] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentYear, setCurrentYear] = useState('2026');
  const [currentRegional, setCurrentRegional] = useState('casnv');
  
  const { user, isAuthChecking, isApproved, role } = useAuth();
  const router = useRouter();

  const fetchSettings = useCallback(async () => {
    try {
      const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        if (data.year) setCurrentYear(data.year);
        if (data.regional) setCurrentRegional(data.regional);
      }
    } catch (err) {
      console.error("Error fetching settings:", err);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError('');
    try {
      // Fetch match teams data first
      const matchTeamsSnapshot = await getDocs(collection(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`));
      const matchTeamsMap: Record<string, { red?: string[]; blue?: string[] }> = {};
      matchTeamsSnapshot.docs.forEach((doc) => {
        const data = doc.data() as any;
        const matchNum = String(data.matchNumber || '');
        if (matchNum) {
          if (!matchTeamsMap[matchNum]) {
            matchTeamsMap[matchNum] = {};
          }
          if (data.alliance === 'red' || doc.id.includes('red')) {
            matchTeamsMap[matchNum].red = data.teams || [];
          } else if (data.alliance === 'blue' || doc.id.includes('blue')) {
            matchTeamsMap[matchNum].blue = data.teams || [];
          }
        }
      });

      // Fetch assignments from the new path: years/{year}/assignments
      const assignmentsRef = collection(db, `years/${currentYear}/assignments`);
      const q = query(assignmentsRef, where('userId', '==', user.uid));
      const querySnapshot = await getDocs(q);
      
      const fetchedAssignments: any[] = [];
      querySnapshot.forEach((doc) => {
        fetchedAssignments.push({ id: doc.id, ...doc.data() });
      });

      const apiKey = process.env.NEXT_PUBLIC_TBA_API_KEY;
      const settingsDoc = await getDoc(doc(db, 'settings', 'currentEvent'));
      const regionalCode = settingsDoc.exists() ? (settingsDoc.data() as any)?.regionalCode : '';

      const normalizedAssignments = await Promise.all(fetchedAssignments.filter((assignment) => {
        if (!(assignment.role === 'scout' || assignment.role === 'super_scout')) {
          return false;
        }

        const assignmentRegional = String(
          assignment.regional || (assignment.type === 'practice' ? 'practice' : '')
        ).toLowerCase();
        const selectedRegional = String(currentRegional || '').toLowerCase();

        if (selectedRegional === 'practice') {
          return assignmentRegional === 'practice' || assignment.type === 'practice';
        }

        return assignmentRegional === selectedRegional;
      }).map(async (assignment) => {
        // Add team number for scout assignments
        if (assignment.role === 'scout' && assignment.position) {
          const matchNum = String(assignment.matchNumber || '');
          let teams = matchTeamsMap[matchNum];
          
          // If not in cache, try fetching from Blue Alliance
          if (!teams && apiKey && regionalCode) {
            try {
              const matchNumInt = parseInt(matchNum, 10);
              const matchKeyFormats = [
                `${regionalCode}_qm${matchNum}`,
                `${regionalCode}_qm${matchNumInt.toString().padStart(2, '0')}`,
                `${regionalCode}_qm${matchNumInt.toString().padStart(3, '0')}`,
              ];
              
              for (const matchKey of matchKeyFormats) {
                try {
                  const response = await fetch(`https://www.thebluealliance.com/api/v3/match/${matchKey}/simple`, {
                    headers: { 'X-TBA-Auth-Key': apiKey },
                  });

                  if (response.ok) {
                    const matchData = await response.json();
                    const redTeams = (matchData?.alliances?.red?.team_keys || []).map((t: string) => t.replace(/^frc/, ''));
                    const blueTeams = (matchData?.alliances?.blue?.team_keys || []).map((t: string) => t.replace(/^frc/, ''));
                    if (redTeams.length > 0 || blueTeams.length > 0) {
                      teams = { red: redTeams, blue: blueTeams };
                      // Cache for future use
                      await setDoc(
                        doc(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`, `qm${matchNum}_red`),
                        { matchNumber: matchNum, alliance: 'red', teams: redTeams, updatedAt: new Date().toISOString() }
                      );
                      await setDoc(
                        doc(db, `years/${currentYear}/regionals/${currentRegional}/match_teams`, `qm${matchNum}_blue`),
                        { matchNumber: matchNum, alliance: 'blue', teams: blueTeams, updatedAt: new Date().toISOString() }
                      );
                      break;
                    }
                  }
                } catch {
                  // Continue to next format
                }
              }
            } catch {
              // TBA fetch failed, continue without teams
            }
          }
          
          if (teams && assignment.position) {
            const posMatch = assignment.position.match(/_(\d)$/);
            if (posMatch) {
              const posIndex = parseInt(posMatch[1], 10) - 1;
              if (assignment.position.startsWith('red') && teams.red?.[posIndex]) {
                assignment.teamNumber = teams.red[posIndex];
              } else if (assignment.position.startsWith('blue') && teams.blue?.[posIndex]) {
                assignment.teamNumber = teams.blue[posIndex];
              }
            }
          }
        }
        return assignment;
      }));
      
      // Sort by match number first so assignment cards are grouped in match order.
      normalizedAssignments.sort((a, b) => {
        const matchA = parseInt(String(a.matchNumber || '0'), 10) || 0;
        const matchB = parseInt(String(b.matchNumber || '0'), 10) || 0;
        if (matchA !== matchB) return matchA - matchB;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      
      setAssignments(normalizedAssignments);

      // Fetch existing scouting data for each assignment
      const dataMap: Record<string, any> = {};
      await Promise.all(
        normalizedAssignments.map(async (assignment) => {
          const year = String(assignment.year || currentYear);
          const regional = String(assignment.regional || currentRegional).toLowerCase();
          
          if (assignment.role === 'scout') {
            const matchNum = Number(assignment.matchNumber);
            const teamNum = Number(assignment.teamNumber);
            if (!matchNum || !teamNum) return;
            
            try {
              const docId = `qm${matchNum}_${user.uid}`;
              const docRef = doc(db, `years/${year}/regionals/${regional}/teams/${teamNum}/matches`, docId);
              const snap = await getDoc(docRef);
              if (snap.exists()) {
                dataMap[assignment.id] = snap.data();
              }
            } catch (e) {
              console.error('Error fetching scouting data:', e);
            }
          } else if (assignment.role === 'super_scout') {
            const matchNum = Number(assignment.matchNumber);
            const alliance = String(assignment.alliance);
            if (!matchNum || !alliance) return;
            
            try {
              const docId = `qm${matchNum}_${alliance}_${user.uid}`;
              const docRef = doc(db, `years/${year}/regionals/${regional}/super_scouting`, docId);
              const snap = await getDoc(docRef);
              if (snap.exists()) {
                dataMap[assignment.id] = snap.data();
              }
            } catch (e) {
              console.error('Error fetching super scout data:', e);
            }
          }
        })
      );
      setAssignmentData(dataMap);
    } catch (err: any) {
      console.error("Error fetching assignments:", err);
      setError("Failed to load assignments.");
    } finally {
      setIsLoading(false);
    }
  }, [currentRegional, currentYear, user]);

  useEffect(() => {
    if (!isAuthChecking && !user) {
      router.push('/login');
    }
  }, [user, isAuthChecking, router]);

  useEffect(() => {
    if (!isAuthChecking && isApproved) {
      fetchSettings();
    }
  }, [isAuthChecking, isApproved, fetchSettings]);

  useEffect(() => {
    if (!isAuthChecking && isApproved) {
      if (user) {
        fetchAssignments();
      }
    }
  }, [isAuthChecking, isApproved, user, fetchAssignments]);

  if (isAuthChecking) {
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
        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">Account Pending Approval</h1>
        <p className="text-gray-600 text-center max-w-md">
          Your account has been created successfully, but it needs to be approved by an administrator before you can access the scouting dashboard.
        </p>
      </div>
    );
  }

  const roleDisplay = role === 'super_scout' ? 'Super Scout' : role === 'admin' ? 'Admin' : 'Scout';

  const sortedAssignments = [...assignments].sort((a, b) => {
    const matchA = parseInt(String(a.matchNumber || '0'), 10) || 0;
    const matchB = parseInt(String(b.matchNumber || '0'), 10) || 0;
    if (matchA !== matchB) return matchA - matchB;

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const assignmentShifts: Array<{ id: string; startMatch: number; endMatch: number; label: string; assignments: any[] }> = [];
  sortedAssignments.forEach((assignment) => {
    const matchNumber = parseInt(String(assignment.matchNumber || '0'), 10) || 0;
    const lastShift = assignmentShifts[assignmentShifts.length - 1];

    const canAppend =
      Boolean(lastShift) &&
      (
        matchNumber === lastShift.endMatch ||
        (lastShift.endMatch > 0 && matchNumber > 0 && matchNumber === lastShift.endMatch + 1)
      );

    if (!canAppend) {
      assignmentShifts.push({
        id: `shift_${assignmentShifts.length + 1}_${matchNumber}`,
        startMatch: matchNumber,
        endMatch: matchNumber,
        label: '',
        assignments: [assignment]
      });
    } else {
      if (matchNumber > lastShift.endMatch) {
        lastShift.endMatch = matchNumber;
      }

      lastShift.assignments.push(assignment);
    }
  });

  let numberedShift = 1;
  assignmentShifts.forEach((shift) => {
    if (shift.startMatch === shift.endMatch) {
      shift.label = `Shift ${numberedShift}: Match ${shift.startMatch}`;
    } else {
      shift.label = `Shift ${numberedShift}: Match ${shift.startMatch}-${shift.endMatch}`;
    }
    numberedShift += 1;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="text-gray-600 dark:text-zinc-400 mt-1">Welcome back, {roleDisplay}.</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Assignments Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-100">Scout and Super Scout Assignments</h2>
            <button 
              onClick={fetchAssignments}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              Refresh
            </button>
          </div>
          
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-4" />
              <p className="text-gray-500 dark:text-zinc-400">Loading assignments...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-red-800 font-medium mb-1">Error</h3>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg p-8 text-center">
              <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">No Assignments</h3>
              <p className="text-gray-500 dark:text-zinc-400 mt-2">You don&apos;t have any pending assignments right now.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {assignmentShifts.map((shift) => (
                <div key={shift.id}>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-zinc-200 mb-3">{shift.label}</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {shift.assignments.map((assignment) => (
                      <div key={assignment.id} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            {assignment.role === 'super_scout' ? (
                              <h3 className={`text-2xl font-bold capitalize ${assignment.alliance === 'red' ? 'text-red-600' : 'text-blue-600'}`}>
                                {assignment.alliance} Alliance
                              </h3>
                            ) : (
                              <h3 className="text-2xl font-bold text-purple-900 dark:text-purple-300">Team {assignment.teamNumber}</h3>
                            )}
                            <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">Match {assignment.matchNumber}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            assignment.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {assignment.status === 'completed' ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-300 mb-4">
                          {assignment.role === 'super_scout' ? 'Super Scout' : 'Scout'}
                        </p>
                        {assignment.role === 'super_scout' ? (
                          <Link 
                            href={`/matches/${assignment.matchNumber}/${assignment.alliance}/super-scout`}
                            className={`block text-center w-full py-2 rounded-md text-sm font-medium transition-colors ${assignmentData[assignment.id] ? 'inline-flex items-center justify-center gap-2 border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200 dark:hover:bg-zinc-800' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                          >
                            {assignmentData[assignment.id] ? (
                              <><Edit3 className="h-4 w-4" />Edit Report</>
                            ) : 'Start Super Scouting'}
                          </Link>
                        ) : (
                          <div>
                            {/* Data Preview */}
                            {assignmentData[assignment.id] && (
                              <div className="mb-3 rounded-md bg-purple-50/50 dark:bg-zinc-800/50 p-2 text-xs space-y-1">
                                <DataPreviewRow label="Auto" value={assignmentData[assignment.id]['Auto Scoring Rating']} />
                                <DataPreviewRow label="Driver" value={assignmentData[assignment.id]['Driver Rating']} />
                                <DataPreviewRow label="Overall" value={assignmentData[assignment.id]['Overall Match Impact']} />
                                <DataPreviewRow label="Climb" value={assignmentData[assignment.id]['Climb Level']} />
                              </div>
                            )}
                            <Link
                              href={`/scout?year=${encodeURIComponent(String(assignment.year || currentYear))}&regional=${encodeURIComponent(String(assignment.regional || (assignment.type === 'practice' ? 'practice' : currentRegional)))}${Number(assignment.matchNumber) > 0 ? `&match=${encodeURIComponent(String(assignment.matchNumber))}` : ''}${Number(assignment.teamNumber) > 0 ? `&team=${encodeURIComponent(String(assignment.teamNumber))}` : ''}`}
                              className={`block text-center w-full py-2 rounded-md text-sm font-medium transition-colors ${assignmentData[assignment.id] ? 'inline-flex items-center justify-center gap-2 border border-purple-200 bg-white text-purple-700 hover:bg-purple-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-purple-200 dark:hover:bg-zinc-800' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                            >
                              {assignmentData[assignment.id] ? (
                                <><Edit3 className="h-4 w-4" />Edit Data</>
                              ) : 'Start Scouting'}
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

function DataPreviewRow({ label, value }: { label: string; value: any }) {
  const displayValue = value !== undefined && value !== null && value !== '' ? value : '-';
  return (
    <div className="flex justify-between">
      <span className="text-gray-500 dark:text-zinc-400">{label}:</span>
      <span className="font-medium text-purple-900 dark:text-purple-200">{displayValue}</span>
    </div>
  );
}
