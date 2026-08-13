import { db } from "./firebase-config.js";
import { ref, onValue } from "firebase/database";

const statusEl = document.getElementById('tournament-status');
const bracketContainer = document.getElementById('bracket-container');

let allMatches = [];
let allTeams = [];

// Listen to teams and matches
onValue(ref(db, 'teams'), (snapshot) => {
  allTeams = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    for (const key in data) {
      allTeams.push({ id: key, ...data[key] });
    }
  }
  renderBracket();
  updateStatus();
});

onValue(ref(db, 'matches'), (snapshot) => {
  allMatches = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    for (const key in data) {
      allMatches.push({ id: key, ...data[key] });
    }
  }
  renderBracket();
  updateStatus();
});

function updateStatus() {
  const total = allMatches.length;
  const played = allMatches.filter(m => m.status === 'played').length;
  statusEl.textContent = `${allTeams.filter(t => !t.eliminated).length} Teams • ${played}/${total} Matches Played`;
}

function renderBracket() {
  // Group matches by phase and tie
  const phases = ['playoff', 'round16', 'quarter', 'semi', 'final'];
  let html = '<div class="bracket">';
  for (const phase of phases) {
    const phaseMatches = allMatches.filter(m => m.phase === phase);
    if (phaseMatches.length === 0) continue;
    html += `<div class="bracket-round"><h3>${formatPhase(phase)}</h3>`;
    // Group by tieId
    const ties = {};
    phaseMatches.forEach(m => {
      const key = m.tieId || m.id;
      if (!ties[key]) ties[key] = [];
      ties[key].push(m);
    });
    for (const [tieId, matches] of Object.entries(ties)) {
      html += `<div class="bracket-tie">`;
      if (matches.length === 2) {
        // Two-legged
        const leg1 = matches.find(m => m.leg === 1);
        const leg2 = matches.find(m => m.leg === 2);
        const agg = computeAggregate(leg1, leg2);
        const winner = leg1.winner || leg2.winner || agg.winner;
        html += `
          <div class="match-leg">${leg1.homeTeam} ${leg1.status === 'played' ? leg1.homeScore : '?'} – ${leg1.status === 'played' ? leg1.awayScore : '?'} ${leg1.awayTeam}</div>
          <div class="match-leg">${leg2.homeTeam} ${leg2.status === 'played' ? leg2.homeScore : '?'} – ${leg2.status === 'played' ? leg2.awayScore : '?'} ${leg2.awayTeam}</div>
          <div class="aggregate">Aggregate: ${agg.homeAgg} – ${agg.awayAgg}</div>
          <div class="winner">${winner ? '🏆 ' + winner : 'TBD'}</div>
        `;
      } else if (matches.length === 1) {
        // Single match
        const m = matches[0];
        const winner = m.winner;
        html += `
          <div class="match-leg">${m.homeTeam} ${m.status === 'played' ? m.homeScore : '?'} – ${m.status === 'played' ? m.awayScore : '?'} ${m.awayTeam}</div>
          <div class="winner">${winner ? '🏆 ' + winner : 'TBD'}</div>
        `;
      }
      html += `</div>`;
    }
    html += `</div>`;
  }
  html += '</div>';
  bracketContainer.innerHTML = html;
}

function computeAggregate(m1, m2) {
  const homeAgg = (m1.status === 'played' ? m1.homeScore : 0) + (m2.status === 'played' ? m2.homeScore : 0);
  const awayAgg = (m1.status === 'played' ? m1.awayScore : 0) + (m2.status === 'played' ? m2.awayScore : 0);
  let winner = null;
  if (m1.winner) winner = m1.winner;
  else if (m2.winner) winner = m2.winner;
  else if (homeAgg > awayAgg) winner = m1.homeTeam;
  else if (awayAgg > homeAgg) winner = m1.awayTeam;
  return { homeAgg, awayAgg, winner };
}

function formatPhase(phase) {
  const map = {
    playoff: 'Playoff',
    round16: 'Round of 16',
    quarter: 'Quarter-finals',
    semi: 'Semi-finals',
    final: 'Final'
  };
  return map[phase] || phase;
}