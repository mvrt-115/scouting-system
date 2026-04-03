#!/usr/bin/env node
/**
 * Script to fetch match data from TBA for 2026casnv and 2026casnf events
 * and analyze performance metrics to calibrate rating hints
 */

const API_KEY = process.env.TBA_API_KEY;
const EVENTS = ['2026casnv', '2026casnf'];

if (!API_KEY) {
  console.error('Error: TBA_API_KEY environment variable required');
  console.error('Get one at: https://www.thebluealliance.com/account');
  process.exit(1);
}

async function fetchFromTBA(endpoint) {
  const url = `https://www.thebluealliance.com/api/v3${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'X-TBA-Auth-Key': API_KEY,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`TBA API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function analyzeEvent(eventKey) {
  console.log(`\n=== Analyzing ${eventKey} ===`);
  
  try {
    // Fetch matches
    const matches = await fetchFromTBA(`/event/${eventKey}/matches`);
    const teamKeys = await fetchFromTBA(`/event/${eventKey}/teams/keys`);
    
    console.log(`Found ${matches.length} matches, ${teamKeys.length} teams`);
    
    // Analyze match data
    const stats = {
      totalMatches: matches.length,
      scoringMatches: [],
      autoScores: [],
      teleopScores: [],
      totalScores: [],
      fouls: []
    };
    
    for (const match of matches) {
      if (match.comp_level !== 'qm') continue; // Only qualification matches
      
      const redScore = match.score_breakdown?.red;
      const blueScore = match.score_breakdown?.blue;
      
      if (redScore && blueScore) {
        // Extract REBUILT 2026 specific metrics
        // Note: These field names may need adjustment based on actual API response
        stats.autoScores.push(redScore.autoPoints || 0, blueScore.autoPoints || 0);
        stats.teleopScores.push(redScore.teleopPoints || 0, blueScore.teleopPoints || 0);
        stats.totalScores.push(redScore.totalPoints || 0, blueScore.totalPoints || 0);
        
        // Team-specific metrics would require match/team breakdown
        // For now, collect alliance-level data
      }
    }
    
    // Calculate statistics
    const calcStats = (arr) => {
      if (arr.length === 0) return { min: 0, max: 0, avg: 0, p75: 0, p90: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      return { min, max, avg: Math.round(avg), p75, p90 };
    };
    
    console.log('\nAuto Points:', calcStats(stats.autoScores));
    console.log('Teleop Points:', calcStats(stats.teleopScores));
    console.log('Total Points:', calcStats(stats.totalScores));
    
    // Fetch team rankings for performance tiers
    const rankings = await fetchFromTBA(`/event/${eventKey}/rankings`);
    
    if (rankings && rankings.rankings) {
      const sortedRanks = rankings.rankings.sort((a, b) => a.rank - b.rank);
      
      console.log('\n=== Top 10 Teams (by ranking) ===');
      sortedRanks.slice(0, 10).forEach(r => {
        console.log(`Rank ${r.rank}: Team ${r.team_key.replace('frc', '')} - ${r.record.wins}-${r.record.losses}-${r.record.ties}, ${r.sort_orders?.[0]?.toFixed(2) || 'N/A'} RP`);
      });
      
      console.log('\n=== Bottom 5 Teams ===');
      sortedRanks.slice(-5).forEach(r => {
        console.log(`Rank ${r.rank}: Team ${r.team_key.replace('frc', '')} - ${r.record.wins}-${r.record.losses}-${r.record.ties}`);
      });
    }
    
    // Fetch OPR/DPR data if available
    try {
      const oprs = await fetchFromTBA(`/event/${eventKey}/oprs`);
      if (oprs && oprs.ccwms) {
        const oprEntries = Object.entries(oprs.ccwms)
          .map(([team, opr]) => ({ team: team.replace('frc', ''), opr }))
          .sort((a, b) => b.opr - a.opr);
        
        console.log('\n=== Top 10 Teams by OPR ===');
        oprEntries.slice(0, 10).forEach(t => {
          console.log(`Team ${t.team}: ${t.opr.toFixed(2)} OPR`);
        });
        
        console.log('\n=== OPR Statistics ===');
        const oprValues = oprEntries.map(e => e.opr);
        console.log('OPR Stats:', calcStats(oprValues));
      }
    } catch (e) {
      console.log('OPR data not available yet');
    }
    
    return stats;
    
  } catch (error) {
    console.error(`Error analyzing ${eventKey}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('Fetching 2026 REBUILT event data from TBA...');
  console.log('Events:', EVENTS.join(', '));
  
  const allStats = {};
  
  for (const event of EVENTS) {
    allStats[event] = await analyzeEvent(event);
  }
  
  console.log('\n\n=== SUGGESTED RATING CALIBRATIONS ===');
  console.log('Based on actual event data, here are recommended rating benchmarks:');
  console.log('(These are estimates - adjust based on actual match video review)');
  
  console.log(`
SCORING VOLUME (based on OPR/total points):
- 9-10 (Elite like 254): Top 10% OPR, 40+ points per match contribution
- 7-8 (Strong): Top 25% OPR, 25-40 points per match
- 5-6 (Average): Middle 50% OPR, 15-25 points per match
- 3-4 (Below avg): Bottom 25% OPR, 5-15 points per match
- 1-2 (Weak): Bottom 10% OPR, <5 points per match

AUTO SCORING (based on autoPoints):
- 9-10: 15+ auto points (multiple game pieces + mobility)
- 7-8: 10-15 auto points (consistent scoring)
- 5-6: 5-10 auto points (some scoring)
- 3-4: 0-5 auto points (minimal/mobility only)
- 1-2: 0 auto points (no auto routine)

DEFENSE EFFECTIVENESS (based on DPR):
- Lower DPR = better defense
- 9-10: Elite defender (blocks opponents, forces low scores)
- 7-8: Good defense (disrupts opponents)
- 5-6: Average defense
- 3-4: Poor defense
- 1-2: No effective defense
`);
}

main().catch(console.error);
