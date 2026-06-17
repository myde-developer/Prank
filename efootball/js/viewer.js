import { db } from "./firebase-config.js";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { calculateStandings } from "./tournament-engine.js";

const statusEl = document.getElementById('tournament-status');
const standingsBody = document.getElementById('standings-body');
const matchList = document.getElementById('match-list');

let allTeams = [];
let allMatches = [];

onSnapshot(collection(db, 'teams'), (snap) => {
  allTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  updateStatus();
});

const q = query(collection(db, 'matches'), orderBy('round', 'asc'));
onSnapshot(q, (snap) => {
  allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderStandings();
  renderMatchList();
  updateStatus();
});

function updateStatus() {
  const active = allTeams.filter(t => !t.eliminated).length;
  const total = allMatches.filter(m => m.status === 'played').length;
  statusEl.textContent = `${active} Teams • ${total} Matches Played`;
}

function renderStandings() {
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');
  const standings = calculateStandings(groupPlayed);
  let html = '';
  standings.forEach((s, i) => {
    html += `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${s.team}</strong></td>
        <td>${s.played}</td>
        <td>${s.won}</td>
        <td>${s.drawn}</td>
        <td>${s.lost}</td>
        <td>${s.gf}</td>
        <td>${s.ga}</td>
        <td>${s.gd}</td>
        <td><strong>${s.pts}</strong></td>
      </tr>
    `;
  });
  standingsBody.innerHTML = html || '<tr><td colspan="10">No matches played yet.</td></tr>';
}

function renderMatchList() {
  let html = '';
  let lastStage = '';
  let lastRound = -1;

  allMatches.forEach(m => {
    let header = '';
    const round = m.round || 0;

    if (m.stage === 'group') {
      if (round !== lastRound) {
        header = `<h3 class="round-header">Round ${round}</h3>`;
        lastRound = round;
      }
      lastStage = 'group';
    } else if (m.stage === 'semi') {
      if (lastStage !== 'semi') {
        header = `<h2 class="phase-header semi-header">⚡ Semi Finals</h2>`;
        lastStage = 'semi';
      }
      lastRound = -1;
    } else if (m.stage === 'final') {
      if (lastStage !== 'final') {
        header = `<h2 class="phase-header final-header">🏆 Final</h2>`;
        lastStage = 'final';
      }
      lastRound = -1;
    }

    const isPlayed = m.status === 'played';
    const homeScore = isPlayed ? m.homeScore : '?';
    const awayScore = isPlayed ? m.awayScore : '?';
    const scoreDisplay = isPlayed
      ? `<span class="score">${homeScore} – ${awayScore}</span>`
      : `<span class="vs">vs</span>`;

    const isKnockout = (m.stage === 'semi' || m.stage === 'final');
    html += `
      ${header}
      <div class="match-card ${isKnockout ? 'knockout-match' : ''}">
        <span class="team home">${m.homeTeam}</span>
        ${scoreDisplay}
        <span class="team away">${m.awayTeam}</span>
        ${!isPlayed ? '<span class="badge pending">Upcoming</span>' : ''}
      </div>
    `;
  });

  matchList.innerHTML = html || '<p class="empty">No matches scheduled yet.</p>';
}