/**
 * Generates a single round-robin fixture list.
 * Returns an array of rounds, each round is an array of matches:
 *   { home: string, away: string }
 * If odd number of teams, adds a "BYE" (ignored later).
 */
export function generateRoundRobin(teamNames) {
  if (teamNames.length < 2) return [];
  const teams = [...teamNames];
  if (teams.length % 2 !== 0) teams.push("BYE");

  const rounds = [];
  const n = teams.length;
  const mid = n / 2;

  for (let round = 0; round < n - 1; round++) {
    const roundMatches = [];
    for (let i = 0; i < mid; i++) {
      const home = teams[i];
      const away = teams[n - 1 - i];
      if (home !== "BYE" && away !== "BYE") {
        // Alternate home/away for fairness
        if (i === 0 && round % 2 === 1) {
          roundMatches.push({ home: away, away: home });
        } else {
          roundMatches.push({ home, away });
        }
      }
    }
    rounds.push(roundMatches);
    // Rotate array (keep first fixed)
    teams.splice(1, 0, teams.pop());
  }
  return rounds;
}

/**
 * Generates a DOUBLE round-robin fixture list.
 * First half: normal fixtures.
 * Second half: mirrors first half with home/away swapped.
 * Returns an object: { firstHalf: [rounds], secondHalf: [rounds], totalRounds: number }
 */
export function generateDoubleRoundRobin(teamNames) {
  const firstHalf = generateRoundRobin(teamNames);
  const secondHalf = firstHalf.map(round =>
    round.map(match => ({ home: match.away, away: match.home }))
  );
  return {
    firstHalf,
    secondHalf,
    totalRounds: firstHalf.length * 2
  };
}

/**
 * Calculates standings from an array of matches (only 'played' ones).
 * Returns array sorted by: Points > Goal Difference > Goals For.
 * Each entry: { team, played, won, drawn, lost, gf, ga, gd, pts }
 */
export function calculateStandings(matches) {
  const stats = {};
  matches.forEach(m => {
    if (m.status !== 'played') return;
    const { homeTeam, awayTeam, homeScore, awayScore } = m;
    if (!stats[homeTeam]) stats[homeTeam] = { team: homeTeam, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    if (!stats[awayTeam]) stats[awayTeam] = { team: awayTeam, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };

    const h = stats[homeTeam];
    const a = stats[awayTeam];
    h.played += 1; a.played += 1;
    h.gf += homeScore; h.ga += awayScore;
    a.gf += awayScore; a.ga += homeScore;
    h.gd = h.gf - h.ga;
    a.gd = a.gf - a.ga;

    if (homeScore > awayScore) {
      h.won += 1; h.pts += 3;
      a.lost += 1;
    } else if (homeScore < awayScore) {
      a.won += 1; a.pts += 3;
      h.lost += 1;
    } else {
      h.drawn += 1; h.pts += 1;
      a.drawn += 1; a.pts += 1;
    }
  });
  return Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
}