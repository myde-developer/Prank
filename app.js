// app.js
import { db, COLLECTIONS } from './firebase.js';
import { initAuth, getCurrentUser, userIsAdmin, logout, login, register, googleSignIn } from './auth.js';
import { buildStandingsTable, buildFixtureCard } from './components.js';
import { hideLoader, startCountdown } from './animations.js';
import { addClub, deleteClub, addFixture, recordResult } from './admin.js';
import { collection, getDocs, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global state
let currentPage = "home";
let allClubs = [], allFixtures = [], allMatches = [], leagueTable = [];

// DOM Elements & Router
const views = document.querySelectorAll('.page-view');
const navLinks = document.querySelectorAll('[data-page]');

async function loadPage(page) {
  views.forEach(v => v.classList.remove('active'));
  document.getElementById(`${page}-view`).classList.add('active');
  currentPage = page;
  // Render dynamic content
  if (page === 'home') await renderHome();
  if (page === 'table') await renderLeagueTable();
  if (page === 'fixtures') await renderFixtures(false);
  if (page === 'results') await renderFixtures(true);
  if (page === 'clubs') await renderClubs();
  if (page === 'news') await renderNews();
  if (page === 'admin-dashboard') await renderAdminDashboard();
  if (page === 'login-register') renderAuthForms();
}

// Listeners & Initialization
async function init() {
  initAuth();
  window.addEventListener('authChanged', async () => {
    await loadPage(currentPage);
    if (userIsAdmin()) document.getElementById('adminDashboardLink').style.display = 'flex';
  });
  document.querySelectorAll('[data-page]').forEach(link => {
    link.addEventListener('click', (e) => { e.preventDefault(); loadPage(link.dataset.page); });
  });
  document.getElementById('darkModeToggle').addEventListener('click', () => document.body.classList.toggle('light'));
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());
  hideLoader();
  loadPage('home');
  // realtime standings subscription
  onSnapshot(collection(db, COLLECTIONS.stats), () => { if(currentPage === 'table') renderLeagueTable(); });
}

async function renderHome() {
  const container = document.getElementById('home-view');
  const nextFixture = allFixtures.find(f => !f.played);
  container.innerHTML = `<div class="glass-card"><h2>⚡ Matchday Central</h2><div id="countdown"></div></div>`;
  if(nextFixture && nextFixture.date) startCountdown(nextFixture.date, 'countdown');
  container.innerHTML += `<div class="glass-card"><h3>Latest News</h3><div id="news-preview"></div></div>`;
  const newsSnap = await getDocs(query(collection(db, COLLECTIONS.news), orderBy("date", "desc")));
  const preview = newsSnap.docs.slice(0,3).map(d => `<p>📰 ${d.data().title}</p>`).join('');
  document.getElementById('news-preview').innerHTML = preview;
}

async function renderLeagueTable() {
  const statsSnap = await getDocs(collection(db, COLLECTIONS.stats));
  const standings = statsSnap.docs.map(d => d.data()).sort((a,b)=> b.points - a.points || b.gd - a.gd);
  document.getElementById('table-view').innerHTML = `<div class="glass-card"><h2>🏆 League Standings</h2>${buildStandingsTable(standings)}</div>`;
}

async function renderFixtures(showResults) {
  const matchesSnap = await getDocs(collection(db, COLLECTIONS.matches));
  const matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const filtered = matches.filter(m => showResults ? m.played : !m.played);
  const html = filtered.map(m => buildFixtureCard(m, showResults)).join('');
  document.getElementById(`${showResults ? 'results' : 'fixtures'}-view`).innerHTML = `<div class="glass-card"><h2>${showResults ? '📋 Results' : '📅 Upcoming Fixtures'}</h2>${html || '<p>No data</p>'}</div>`;
}

async function renderAdminDashboard() {
  if(!userIsAdmin()) return (window.location.href = '#');
  const clubsSnap = await getDocs(collection(db, COLLECTIONS.clubs));
  let clubsHtml = clubsSnap.docs.map(d => `<div>${d.data().name} <button class="btn-danger" data-id="${d.id}">Delete</button></div>`).join('');
  document.getElementById('admin-dashboard-view').innerHTML = `
    <div class="glass-card"><h2>Admin Panel</h2>
      <div class="admin-grid">
        <div><h3>➕ Add Club</h3><input id="clubName" placeholder="Club name"><button id="addClubBtn">Create</button></div>
        <div><h3>🏟️ Add Fixture</h3><select id="homeClub"></select> vs <select id="awayClub"></select><button id="addFixtureBtn">Schedule</button></div>
        <div><h3>🎯 Record Result</h3><select id="matchSelect"></select><input id="homeScore" placeholder="Home"> - <input id="awayScore" placeholder="Away"><button id="recordBtn">Submit</button></div>
      </div>
      <h3>Clubs Management</h3><div id="clubList">${clubsHtml}</div>
    </div>`;
  // populate club selects & event listeners...
}

function renderAuthForms() {
  document.getElementById('login-register-view').innerHTML = `
    <div class="glass-card"><h2>Login / Register</h2><input id="authEmail" placeholder="Email"><input id="authPass" type="password" placeholder="Password"><button id="loginBtn">Login</button><button id="registerBtn">Register</button><button id="googleBtn">Google Sign-In</button></div>`;
  document.getElementById('loginBtn')?.addEventListener('click', () => login(document.getElementById('authEmail').value, document.getElementById('authPass').value));
  document.getElementById('registerBtn')?.addEventListener('click', () => register(document.getElementById('authEmail').value, document.getElementById('authPass').value, 'Fan'));
  document.getElementById('googleBtn')?.addEventListener('click', googleSignIn);
}

// Load initial data
window.addEventListener('DOMContentLoaded', init);