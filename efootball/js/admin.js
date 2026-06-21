import { db } from "./firebase-config.js";
import {
  collection, query, where, getDocs, addDoc,
  updateDoc, doc, onSnapshot, orderBy
} from "firebase/firestore";
import { generateRoundRobin, calculateStandings } from "./tournament-engine.js";

// ===== DOM refs =====
const authPage = document.getElementById('auth-page');
const dashboard = document.getElementById('admin-dashboard');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginTab = document.getElementById('login-tab');
const registerTab = document.getElementById('register-tab');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerConfirm = document.getElementById('register-confirm');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const teamNameInput = document.getElementById('team-name-input');
const addTeamBtn = document.getElementById('add-team-btn');
const teamList = document.getElementById('team-list');
const activeCount = document.getElementById('active-count');
const generateBtn = document.getElementById('generate-btn');
const trimBtn = document.getElementById('trim-btn');
const statusMsg = document.getElementById('status-msg');
const matchesContainer = document.getElementById('matches-container');

// ===== SHA‑256 hashing =====
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== Login state =====
function isLoggedIn() {
  return localStorage.getItem('adminLoggedIn') === 'true';
}

function setLoggedIn(email) {
  localStorage.setItem('adminLoggedIn', 'true');
  localStorage.setItem('adminEmail', email);
}

function logout() {
  localStorage.removeItem('adminLoggedIn');
  localStorage.removeItem('adminEmail');
  location.reload();
}

// ===== Check login on load =====
if (isLoggedIn()) {
  authPage.style.display = 'none';
  dashboard.style.display = 'block';
  listenToData();
} else {
  authPage.style.display = 'flex';
  dashboard.style.display = 'none';
}

// ===== Tab switching =====
loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  registerError.textContent = '';
  registerSuccess.style.display = 'none';
});

registerTab.addEventListener('click', () => {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.style.display = 'block';
  loginForm.style.display = 'none';
  loginError.textContent = '';
});

// ===== REGISTER =====
registerBtn.addEventListener('click', async () => {
  const email = registerEmail.value.trim();
  const password = registerPassword.value.trim();
  const confirm = registerConfirm.value.trim();

  registerError.textContent = '';
  registerSuccess.style.display = 'none';

  if (!email || !password || !confirm) {
    registerError.textContent = 'Please fill in all fields.';
    return;
  }
  if (password.length < 6) {
    registerError.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (password !== confirm) {
    registerError.textContent = 'Passwords do not match.';
    return;
  }

  try {
    // Check if email already exists
    const q = query(collection(db, 'admins'), where('email', '==', email));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      registerError.textContent = 'Email already registered. Please login.';
      return;
    }

    // Hash password and save
    const hashedPassword = await hashPassword(password);
    await addDoc(collection(db, 'admins'), {
      email: email,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    });

    // Success!
    registerSuccess.style.display = 'block';
    registerSuccess.textContent = '✅ Registration successful! Please login.';
    registerError.textContent = '';
    
    // Clear fields
    registerEmail.value = '';
    registerPassword.value = '';
    registerConfirm.value = '';

    // Auto-switch to login tab after 2 seconds
    setTimeout(() => {
      loginTab.click();
    }, 1500);

  } catch (e) {
    console.error('Registration error:', e);
    registerError.textContent = 'Error: ' + e.message;
  }
});

// ===== LOGIN =====
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();

  loginError.textContent = '';

  if (!email || !password) {
    loginError.textContent = 'Please fill in both fields.';
    return;
  }

  try {
    const q = query(collection(db, 'admins'), where('email', '==', email));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      loginError.textContent = 'Account not found. Please register first.';
      return;
    }

    const adminDoc = snapshot.docs[0];
    const storedHash = adminDoc.data().passwordHash;
    const enteredHash = await hashPassword(password);

    if (enteredHash === storedHash) {
      setLoggedIn(email);
      authPage.style.display = 'none';
      dashboard.style.display = 'block';
      loginError.textContent = '';
      listenToData();
    } else {
      loginError.textContent = '❌ Incorrect password.';
    }
  } catch (e) {
    console.error('Login error:', e);
    loginError.textContent = 'Error: ' + e.message;
  }
});

logoutBtn.addEventListener('click', logout);

// ===== State =====
let allTeams = [];
let allMatches = [];

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#ff6b6b' : '#00ffcc';
}

// ===== Firestore listeners =====
function listenToData() {
  onSnapshot(collection(db, 'teams'), (snap) => {
    allTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeams();
  });

  const q = query(collection(db, 'matches'), orderBy('round', 'asc'));
  onSnapshot(q, (snap) => {
    allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMatches();
  });
}

// ===== Render teams =====
function renderTeams() {
  const active = allTeams.filter(t => !t.eliminated);
  const eliminated = allTeams.filter(t => t.eliminated);
  activeCount.textContent = active.length;
  let html = '';
  active.forEach(t => html += `<li>✅ ${t.name}</li>`);
  eliminated.forEach(t => html += `<li style="opacity:0.4; text-decoration:line-through;">❌ ${t.name}</li>`);
  teamList.innerHTML = html;
}

// ===== Add team =====
addTeamBtn.addEventListener('click', async () => {
  const name = teamNameInput.value.trim();
  if (!name) return alert('Enter a team name');
  try {
    await addDoc(collection(db, 'teams'), { name, eliminated: false });
    teamNameInput.value = '';
    setStatus(`Added ${name}`);
  } catch (e) { setStatus(e.message, true); }
});

// ===== Render matches =====
function renderMatches() {
  if (!allMatches.length) {
    matchesContainer.innerHTML = '<p class="empty">No matches scheduled yet.</p>';
    return;
  }
  let html = '';
  allMatches.forEach(m => {
    const isPending = m.status === 'pending';
    const hs = isPending ? '' : m.homeScore;
    const as = isPending ? '' : m.awayScore;
    html += `
      <div class="match-admin-card" data-id="${m.id}">
        <span class="match-teams">${m.homeTeam} vs ${m.awayTeam}</span>
        <div class="score-inputs">
          <input type="number" min="0" max="99" class="score-home" value="${hs}" ${isPending ? '' : 'disabled'} />
          <span>–</span>
          <input type="number" min="0" max="99" class="score-away" value="${as}" ${isPending ? '' : 'disabled'} />
        </div>
        <button class="save-score-btn neon-btn small" data-id="${m.id}" ${isPending ? '' : 'disabled'}>
          ${isPending ? 'Save Score' : '✓ Played'}
        </button>
        <span class="match-stage-badge">${m.stage === 'semi' ? '🔹 Semi' : m.stage === 'final' ? '🏆 Final' : `R${m.round}`}</span>
      </div>
    `;
  });
  matchesContainer.innerHTML = html;

  document.querySelectorAll('.save-score-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.match-admin-card');
      const id = card.dataset.id;
      const homeInput = card.querySelector('.score-home');
      const awayInput = card.querySelector('.score-away');
      const home = parseInt(homeInput.value);
      const away = parseInt(awayInput.value);
      if (isNaN(home) || isNaN(away) || home < 0 || away < 0) {
        return alert('Enter valid scores (0-99)');
      }
      await saveMatchResult(id, home, away);
    });
  });
}

async function saveMatchResult(matchId, homeScore, awayScore) {
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      homeScore, awayScore, status: 'played'
    });
    setStatus('Score saved!');
  } catch (e) { setStatus(e.message, true); }
}

// ===== Generate next round =====
generateBtn.addEventListener('click', async () => {
  const active = allTeams.filter(t => !t.eliminated);
  if (active.length < 2) return setStatus('Need at least 2 active teams.', true);

  const groupMatches = allMatches.filter(m => m.stage === 'group');
  const semiMatches = allMatches.filter(m => m.stage === 'semi');
  const finalMatches = allMatches.filter(m => m.stage === 'final');

  if (active.length === 4) {
    if (semiMatches.length === 0) {
      await generateSemiLeg(active, 1);
      return setStatus('Semi Final Leg 1 generated.');
    }
    const leg1 = semiMatches.filter(m => m.leg === 1);
    const leg1Played = leg1.every(m => m.status === 'played');
    if (leg1Played && leg1.length > 0) {
      const leg2 = semiMatches.filter(m => m.leg === 2);
      if (leg2.length === 0) {
        await generateSemiLeg(active, 2);
        return setStatus('Semi Final Leg 2 generated.');
      }
      const leg2Played = leg2.every(m => m.status === 'played');
      if (leg2Played && finalMatches.length === 0) {
        await generateFinal(active, semiMatches);
        return setStatus('Final generated!');
      }
      if (leg2Played && finalMatches.length > 0) {
        return setStatus('Tournament complete!');
      }
      return setStatus('Please finish Leg 2 first.');
    }
    return setStatus('Please finish Leg 1 first.');
  }

  if (active.length > 4) {
    const lastRound = groupMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const nextRound = lastRound + 1;
    const names = active.map(t => t.name);
    const allRounds = generateRoundRobin(names);
    if (nextRound > allRounds.length) {
      return setStatus('All rounds generated. Time to trim bottom 2.', true);
    }
    const roundFixtures = allRounds[nextRound - 1];
    if (!roundFixtures || roundFixtures.length === 0) {
      return setStatus('No fixtures to generate.', true);
    }
    for (const f of roundFixtures) {
      await addDoc(collection(db, 'matches'), {
        homeTeam: f.home,
        awayTeam: f.away,
        round: nextRound,
        stage: 'group',
        status: 'pending',
        homeScore: 0,
        awayScore: 0,
        leg: 0
      });
    }
    setStatus(`Round ${nextRound} generated (${roundFixtures.length} matches).`);
  }
});

async function generateSemiLeg(activeTeams, leg) {
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');
  const standings = calculateStandings(groupPlayed);
  const sorted = activeTeams.sort((a, b) => {
    const aPts = standings.find(s => s.team === a.name)?.pts || 0;
    const bPts = standings.find(s => s.team === b.name)?.pts || 0;
    return bPts - aPts;
  });
  const matchups = [
    { home: sorted[0].name, away: sorted[3].name },
    { home: sorted[1].name, away: sorted[2].name }
  ];
  for (const m of matchups) {
    await addDoc(collection(db, 'matches'), {
      homeTeam: m.home,
      awayTeam: m.away,
      round: 99,
      stage: 'semi',
      status: 'pending',
      homeScore: 0,
      awayScore: 0,
      leg: leg
    });
  }
}

async function generateFinal(activeTeams, semiMatches) {
  const leg1 = semiMatches.filter(m => m.leg === 1);
  const leg2 = semiMatches.filter(m => m.leg === 2);
  const winners = [];
  for (let i = 0; i < leg1.length; i++) {
    const m1 = leg1[i];
    const m2 = leg2[i];
    const home1 = m1.homeTeam, away1 = m1.awayTeam;
    let goals1 = (home1 === m1.homeTeam ? m1.homeScore : m1.awayScore) +
                 (home1 === m2.homeTeam ? m2.homeScore : m2.awayScore);
    let goals2 = (away1 === m1.homeTeam ? m1.homeScore : m1.awayScore) +
                 (away1 === m2.homeTeam ? m2.homeScore : m2.awayScore);
    if (goals1 > goals2) winners.push(home1);
    else if (goals2 > goals1) winners.push(away1);
    else winners.push(home1);
  }
  await addDoc(collection(db, 'matches'), {
    homeTeam: winners[0],
    awayTeam: winners[1],
    round: 100,
    stage: 'final',
    status: 'pending',
    homeScore: 0,
    awayScore: 0,
    leg: 0
  });
}

trimBtn.addEventListener('click', async () => {
  const active = allTeams.filter(t => !t.eliminated);
  if (active.length <= 4) return setStatus('Cannot trim when 4 or fewer remain.', true);
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');
  const standings = calculateStandings(groupPlayed);
  const sorted = standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
  const bottom = sorted.slice(-2);
  if (bottom.length < 2) return setStatus('Not enough played matches.', true);
  for (const team of bottom) {
    const teamDoc = allTeams.find(t => t.name === team.team);
    if (teamDoc && !teamDoc.eliminated) {
      await updateDoc(doc(db, 'teams', teamDoc.id), { eliminated: true });
    }
  }
  setStatus(`Eliminated: ${bottom.map(b => b.team).join(', ')}`);
});