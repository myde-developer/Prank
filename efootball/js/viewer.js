import { db } from "./firebase-config.js";
import { ref, onValue } from "firebase/database";
import { calculateStandings } from "./tournament-engine.js";

const statusEl = document.getElementById('tournament-status');
const standingsBody = document.getElementById('standings-body');
const matchList = document.getElementById('match-list');

let allTeams = [];
let allMatches = [];

// ---- Listen to teams ----
const teamsRef = ref(db, 'teams');
onValue(teamsRef, (snapshot) => {
  allTeams = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    for (const key in data) {
      allTeams.push({ id: key, ...data[key] });
    }
  }
  updateStatus();
  renderStandings(); // re-render standings when teams change
});

// ---- Listen to matches ----
const matchesRef = ref(db, 'matches');
onValue(matchesRef, (snapshot) => {
  allMatches = [];
  if (snapshot.exists()) {
    const data = snapshot.val();
    for (const key in data) {
      allMatches.push({ id: key, ...data[key] });
    }
  }
  allMatches.sort((a, b) => (a.round || 0) - (b.round || 0));
  renderStandings();
  renderMatchList();
  updateStatus();
});

function updateStatus() {
  const active = allTeams.filter(t => !t.eliminated).length;
  const total = allMatches.filter(m => m.status === 'played').length;
  statusEl.textContent = `${active} Teams • ${total} Matches Played`;
}

// ---- Render Standings ----
function renderStandings() {
  // 1. Get active teams (not eliminated)
  const activeTeams = allTeams.filter(t => !t.eliminated);

  // 2. Get played group matches
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');

  // 3. Build stats object with all active teams initialized to 0
  const stats = {};
  activeTeams.forEach(t => {
    stats[t.name] = {
      team: t.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0
    };
  });

  // 4. Process played matches (add stats)
  groupPlayed.forEach(m => {
    const { homeTeam, awayTeam, homeScore, awayScore } = m;
    // Skip if team is not in active list (shouldn't happen, but safe)
    if (!stats[homeTeam] || !stats[awayTeam]) return;

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

  // 5. Convert to array and sort (Points > GD > GF)
  const sorted = Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });

  // 6. Render table
  let html = '';
  if (sorted.length === 0) {
    html = '<tr><td colspan="10">No teams added yet.</td></tr>';
  } else {
    sorted.forEach((s, i) => {
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
  }
  standingsBody.innerHTML = html;
}

// ---- Render Match List (unchanged) ----
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