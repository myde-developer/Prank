/**
 * Helper: Shuffle array (Fisher-Yates)
 */
export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate two‑legged ties for a given phase.
 * Returns an array of tie objects:
 *   { homeTeam, awayTeam, phase, leg1, leg2 }
 * where leg1/leg2 contain match details.
 */
export function generateTwoLeggedTies(teamNames, phase) {
  const shuffled = shuffleArray(teamNames);
  const ties = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const home = shuffled[i];
    const away = shuffled[i+1];
    ties.push({
      homeTeam: home,
      awayTeam: away,
      phase: phase,
      leg1: {
        home: home,
        away: away,
        status: 'pending',
        homeScore: 0,
        awayScore: 0
      },
      leg2: {
        home: away,
        away: home,
        status: 'pending',
        homeScore: 0,
        awayScore: 0
      }
    });
  }
  return ties;
}

/**
 * Generate a single final match.
 */
export function generateFinalMatch(teamNames) {
  if (teamNames.length !== 2) throw new Error('Final needs exactly 2 teams.');
  return {
    homeTeam: teamNames[0],
    awayTeam: teamNames[1],
    phase: 'final',
    leg: null,
    status: 'pending',
    homeScore: 0,
    awayScore: 0,
    winner: null
  };
}

/**
 * Compute aggregate score from two matches (leg1, leg2).
 * Returns { homeAgg, awayAgg, winner }.
 */
export function computeAggregate(match1, match2) {
  const homeAgg = match1.homeScore + match2.homeScore;
  const awayAgg = match1.awayScore + match2.awayScore;
  let winner = null;
  if (homeAgg > awayAgg) winner = match1.homeTeam;
  else if (awayAgg > homeAgg) winner = match1.awayTeam;
  return { homeAgg, awayAgg, winner };
}

/**
 * Rank losing teams from playoff matches by GD, GF.
 * Returns array of team names (best N).
 */
export function getBestLosers(playoffMatches, numToQualify) {
  const losers = [];
  playoffMatches.forEach(m => {
    if (m.status !== 'played') return;
    let loser, gd, gf;
    if (m.homeScore > m.awayScore) {
      loser = m.awayTeam;
      gd = m.awayScore - m.homeScore;
      gf = m.awayScore;
    } else if (m.awayScore > m.homeScore) {
      loser = m.homeTeam;
      gd = m.homeScore - m.awayScore;
      gf = m.homeScore;
    } else {
      // draw – not expected, skip
      return;
    }
    losers.push({ team: loser, gd, gf });
  });
  losers.sort((a,b) => b.gd - a.gd || b.gf - a.gf);
  return losers.slice(0, numToQualify).map(l => l.team);
}