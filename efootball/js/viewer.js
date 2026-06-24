import { db } from "./firebase-config.js";
import { ref, onValue } from "firebase/database";
import { calculateStandings } from "./tournament-engine.js";

const statusEl = document.getElementById('tournament-status');
const standingsBody = document.getElementById('standings-body');
const weekTabs = document.getElementById('week-tabs');
const weekMatches = document.getElementById('week-matches');

let allTeams = [];
let allMatches = [];
let currentWeek = 1;

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
  renderStandings();
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
  renderWeekTabs();
  renderWeekMatches(currentWeek);
  updateStatus();
});

function updateStatus() {
  const active = allTeams.filter(t => !t.eliminated).length;
  const total = allMatches.filter(m => m.status === 'played').length;
  statusEl.textContent = `${active} Teams • ${total} Matches Played`;
}

// ---- Render Standings (shows all active teams) ----
function renderStandings() {
  const activeTeams = allTeams.filter(t => !t.eliminated);
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');

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

  groupPlayed.forEach(m => {
    const { homeTeam, awayTeam, homeScore, awayScore } = m;
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

  const sorted = Object.values(stats).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });

  let html = '';
  if (sorted.length === 0) {
    html = '<tr><td colspan="10">No teams added yet.</td></tr>';
  } else {
    sorted.forEach((s, i) => {
      const isChampion = i === 0 && s.played > 0 && allTeams.filter(t => !t.eliminated).length > 1;
      html += `
        <tr>
          <td>${i + 1} ${isChampion ? '🏆' : ''}</td>
          <td class="team-name"><strong>${s.team}</strong></td>
          <td>${s.played}</td>
          <td>${s.won}</td>
          <td>${s.drawn}</td>
          <td>${s.lost}</td>
          <td>${s.gf}</td>
          <td>${s.ga}</td>
          <td>${s.gd}</td>
          <td class="pts"><strong>${s.pts}</strong></td>
        </tr>
      `;
    });
  }
  standingsBody.innerHTML = html;
}

// ---- Render Week Tabs ----
function renderWeekTabs() {
  const groupMatches = allMatches.filter(m => m.stage === 'group');
  const weeks = new Set();
  groupMatches.forEach(m => weeks.add(m.round));
  const sortedWeeks = Array.from(weeks).sort((a, b) => a - b);

  if (sortedWeeks.length === 0) {
    weekTabs.innerHTML = '<p class="empty">No fixtures scheduled yet.</p>';
    return;
  }

  let tabsHtml = '';
  sortedWeeks.forEach(week => {
    const active = week === currentWeek ? 'active' : '';
    tabsHtml += `<button class="week-tab ${active}" data-week="${week}">Week ${week}</button>`;
  });
  weekTabs.innerHTML = tabsHtml;

  // Attach click events
  document.querySelectorAll('.week-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const week = parseInt(btn.dataset.week);
      currentWeek = week;
      // Update active class
      document.querySelectorAll('.week-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderWeekMatches(week);
    });
  });

  // If currentWeek is not in the list, set to first
  if (!sortedWeeks.includes(currentWeek)) {
    currentWeek = sortedWeeks[0];
    document.querySelectorAll('.week-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`.week-tab[data-week="${currentWeek}"]`)?.classList.add('active');
    renderWeekMatches(currentWeek);
  }
}

// ---- Render Matches for a specific Week ----
function renderWeekMatches(week) {
  const weekMatchesData = allMatches.filter(m => m.stage === 'group' && m.round === week);
  if (weekMatchesData.length === 0) {
    weekMatches.innerHTML = '<p class="empty">No matches for this week.</p>';
    return;
  }

  let html = '';
  weekMatchesData.forEach(m => {
    const isPlayed = m.status === 'played';
    const homeScore = isPlayed ? m.homeScore : '?';
    const awayScore = isPlayed ? m.awayScore : '?';
    const scoreDisplay = isPlayed
      ? `<span class="score">${homeScore} – ${awayScore}</span>`
      : `<span class="vs">vs</span>`;
    html += `
      <div class="match-card">
        <span class="team home">${m.homeTeam}</span>
        ${scoreDisplay}
        <span class="team away">${m.awayTeam}</span>
        ${!isPlayed ? '<span class="badge pending">Upcoming</span>' : ''}
      </div>
    `;
  });
  weekMatches.innerHTML = html;
}