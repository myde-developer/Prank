// components.js
export function buildStandingsTable(standings) {
  let html = `<table class="standings-table"><thead><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>`;
  standings.forEach((club, idx) => {
    let zoneClass = '';
    if (idx < 4) zoneClass = 'champions-league';
    if (idx >= standings.length - 3) zoneClass = 'relegation';
    html += `<tr class="${zoneClass}">
      <td>${idx+1}</td><td><strong>${club.name}</strong></td>
      <td>${club.played}</td><td>${club.won}</td><td>${club.drawn}</td>
      <td>${club.lost}</td><td>${club.gd}</td><td class="pts">${club.points}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

export function buildFixtureCard(f, isResult = false) {
  return `<div class="fixture-card glass-card">
    <div>${f.homeTeam} vs ${f.awayTeam}</div>
    <div class="match-score">${isResult ? f.homeScore + ' - ' + f.awayScore : f.date || 'TBD'}</div>
    <div><i class="fas fa-clock"></i> ${f.matchweek || 'Week ' + f.week}</div>
  </div>`;
}