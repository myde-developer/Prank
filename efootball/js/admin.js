import { db } from "./firebase-config.js";
import { 
  ref, set, update, push, onValue, get, child 
} from "firebase/database";
import { generateRoundRobin, calculateStandings } from "./tournament-engine.js";

// ===== TOAST SYSTEM =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// ===== DOM REFS =====
const authPage = document.getElementById('auth-page');
const dashboard = document.getElementById('admin-dashboard');
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');
const registerTab = document.getElementById('register-tab');
const loginTab = document.getElementById('login-tab');
const registerEmail = document.getElementById('register-email');
const registerPassword = document.getElementById('register-password');
const registerConfirm = document.getElementById('register-confirm');
const registerCode = document.getElementById('register-code');
const registerBtn = document.getElementById('register-btn');
const registerError = document.getElementById('register-error');
const registerSuccess = document.getElementById('register-success');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');
const teamNameInput = document.getElementById('team-name-input');
const addTeamBtn = document.getElementById('add-team-btn');
const teamList = document.getElementById('team-list');
const activeCount = document.getElementById('active-count');
const generateBtn = document.getElementById('generate-btn');
const trimBtn = document.getElementById('trim-btn');
const statusMsg = document.getElementById('status-msg');
const matchesContainer = document.getElementById('matches-container');
const setCodeBtn = document.getElementById('set-code-btn');
const codeModal = document.getElementById('code-modal');
const adminCodeInput = document.getElementById('admin-code-input');
const saveCodeBtn = document.getElementById('save-code-btn');
const closeCodeModal = document.getElementById('close-code-modal');
const codeStatus = document.getElementById('code-status');
const currentCodeDisplay = document.getElementById('current-code-display');

// ===== HASHING =====
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== LOGIN STATE =====
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

// ===== TAB SWITCHING =====
registerTab.classList.add('active');
registerForm.style.display = 'block';
loginForm.style.display = 'none';

registerTab.addEventListener('click', () => {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.style.display = 'block';
  loginForm.style.display = 'none';
  registerError.textContent = '';
  registerSuccess.style.display = 'none';
  loginError.textContent = '';
});

loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.style.display = 'block';
  registerForm.style.display = 'none';
  loginError.textContent = '';
  registerError.textContent = '';
  registerSuccess.style.display = 'none';
});

// ===== CHECK LOGIN ON LOAD =====
if (isLoggedIn()) {
  authPage.style.display = 'none';
  dashboard.style.display = 'block';
  listenToData();
} else {
  authPage.style.display = 'flex';
  dashboard.style.display = 'none';
}

// ===== ADMIN CODE FUNCTIONS =====
async function getAdminCode() {
  try {
    const snapshot = await get(child(ref(db), 'settings/adminCode'));
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (e) {
    console.error('Error fetching admin code:', e);
    return null;
  }
}

async function setAdminCode(newCode) {
  try {
    await set(ref(db, 'settings/adminCode'), newCode);
    return true;
  } catch (e) {
    console.error('Error setting admin code:', e);
    return false;
  }
}

async function displayCurrentCode() {
  const code = await getAdminCode();
  if (code) {
    currentCodeDisplay.textContent = `Current Admin Code: ${code}`;
  } else {
    currentCodeDisplay.textContent = 'No admin code set. Set one to allow other admins.';
  }
}

// ===== MODAL EVENTS =====
setCodeBtn.addEventListener('click', () => {
  codeModal.style.display = 'flex';
  adminCodeInput.value = '';
  codeStatus.textContent = '';
});

closeCodeModal.addEventListener('click', () => {
  codeModal.style.display = 'none';
});

codeModal.addEventListener('click', (e) => {
  if (e.target === codeModal) codeModal.style.display = 'none';
});

saveCodeBtn.addEventListener('click', async () => {
  const newCode = adminCodeInput.value.trim();
  if (!newCode) {
    codeStatus.textContent = 'Please enter a code.';
    codeStatus.style.color = '#cc3333';
    showToast('❌ Please enter a code.', 'error');
    return;
  }
  const success = await setAdminCode(newCode);
  if (success) {
    codeStatus.textContent = '✅ Admin code updated!';
    codeStatus.style.color = '#006600';
    showToast('✅ Admin code updated!', 'success');
    displayCurrentCode();
    setTimeout(() => { codeModal.style.display = 'none'; }, 1500);
  } else {
    codeStatus.textContent = '❌ Failed to update code.';
    codeStatus.style.color = '#cc3333';
    showToast('❌ Failed to update code.', 'error');
  }
});

// ===== REGISTER =====
registerBtn.addEventListener('click', async () => {
  const email = registerEmail.value.trim();
  const password = registerPassword.value.trim();
  const confirm = registerConfirm.value.trim();
  const enteredCode = registerCode.value.trim();

  registerError.textContent = '';
  registerSuccess.style.display = 'none';

  if (!email || !password || !confirm) {
    registerError.textContent = 'Please fill in all fields.';
    showToast('❌ Please fill in all fields.', 'error');
    return;
  }
  if (password.length < 6) {
    registerError.textContent = 'Password must be at least 6 characters.';
    showToast('❌ Password must be at least 6 characters.', 'error');
    return;
  }
  if (password !== confirm) {
    registerError.textContent = 'Passwords do not match.';
    showToast('❌ Passwords do not match.', 'error');
    return;
  }

  try {
    const existingCode = await getAdminCode();
    if (existingCode) {
      if (enteredCode !== existingCode) {
        registerError.textContent = 'Invalid admin code.';
        showToast('❌ Invalid admin code.', 'error');
        return;
      }
    }

    const adminsSnapshot = await get(child(ref(db), 'admins'));
    let exists = false;
    if (adminsSnapshot.exists()) {
      const admins = adminsSnapshot.val();
      for (const key in admins) {
        if (admins[key].email === email) {
          exists = true;
          break;
        }
      }
    }
    if (exists) {
      registerError.textContent = 'Email already registered.';
      showToast('❌ Email already registered.', 'error');
      return;
    }

    const hashedPassword = await hashPassword(password);
    const newAdminRef = push(ref(db, 'admins'));
    await set(newAdminRef, {
      email: email,
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    });

    registerSuccess.style.display = 'block';
    registerSuccess.textContent = '✅ Registration successful! Please login.';
    showToast('✅ Registration successful! Please login.', 'success');
    registerError.textContent = '';
    registerEmail.value = '';
    registerPassword.value = '';
    registerConfirm.value = '';
    registerCode.value = '';

    setTimeout(() => {
      loginTab.click();
    }, 1500);

  } catch (e) {
    console.error('Registration error:', e);
    registerError.textContent = 'Error: ' + e.message;
    showToast('❌ ' + e.message, 'error');
  }
});

// ===== LOGIN =====
loginBtn.addEventListener('click', async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  loginError.textContent = '';

  if (!email || !password) {
    loginError.textContent = 'Please fill in both fields.';
    showToast('❌ Please fill in both fields.', 'error');
    return;
  }

  try {
    const adminsSnapshot = await get(child(ref(db), 'admins'));
    if (!adminsSnapshot.exists()) {
      loginError.textContent = 'Account not found. Please register first.';
      showToast('❌ Account not found. Please register first.', 'error');
      return;
    }
    const admins = adminsSnapshot.val();
    let found = false;
    let storedHash = '';
    for (const key in admins) {
      if (admins[key].email === email) {
        storedHash = admins[key].passwordHash;
        found = true;
        break;
      }
    }
    if (!found) {
      loginError.textContent = 'Account not found. Please register first.';
      showToast('❌ Account not found. Please register first.', 'error');
      return;
    }
    const enteredHash = await hashPassword(password);
    if (enteredHash === storedHash) {
      setLoggedIn(email);
      authPage.style.display = 'none';
      dashboard.style.display = 'block';
      loginError.textContent = '';
      showToast('✅ Welcome back, ' + email + '!', 'success');
      listenToData();
      displayCurrentCode();
    } else {
      loginError.textContent = '❌ Incorrect password.';
      showToast('❌ Incorrect password.', 'error');
    }
  } catch (e) {
    console.error('Login error:', e);
    loginError.textContent = 'Error: ' + e.message;
    showToast('❌ ' + e.message, 'error');
  }
});

logoutBtn.addEventListener('click', () => {
  logout();
  showToast('✅ Logged out.', 'info');
});

// ===== STATE & LISTENERS =====
let allTeams = [];
let allMatches = [];

function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? '#cc3333' : '#006600';
}

function listenToData() {
  const teamsRef = ref(db, 'teams');
  onValue(teamsRef, (snapshot) => {
    allTeams = [];
    if (snapshot.exists()) {
      const data = snapshot.val();
      for (const key in data) {
        allTeams.push({ id: key, ...data[key] });
      }
    }
    renderTeams();
  });

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
    renderMatches();
  });
}

// ===== RENDER TEAMS =====
function renderTeams() {
  const active = allTeams.filter(t => !t.eliminated);
  const eliminated = allTeams.filter(t => t.eliminated);
  activeCount.textContent = active.length;
  let html = '';
  active.forEach(t => html += `<li>✅ ${t.name}</li>`);
  eliminated.forEach(t => html += `<li style="opacity:0.4; text-decoration:line-through;">❌ ${t.name}</li>`);
  teamList.innerHTML = html;
}

// ===== ADD TEAM =====
addTeamBtn.addEventListener('click', async () => {
  const name = teamNameInput.value.trim();
  if (!name) {
    showToast('❌ Enter a team name.', 'error');
    return;
  }
  try {
    const newTeamRef = push(ref(db, 'teams'));
    await set(newTeamRef, { name, eliminated: false });
    teamNameInput.value = '';
    setStatus(`Added ${name}`);
    showToast('✅ Team added: ' + name, 'success');
  } catch (e) { 
    setStatus(e.message, true);
    showToast('❌ ' + e.message, 'error');
  }
});

// ===== RENDER MATCHES =====
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
        showToast('❌ Enter valid scores (0-99)', 'error');
        return;
      }
      await saveMatchResult(id, home, away);
    });
  });
}

async function saveMatchResult(matchId, homeScore, awayScore) {
  try {
    await update(ref(db, `matches/${matchId}`), {
      homeScore, awayScore, status: 'played'
    });
    setStatus('Score saved!');
    showToast('✅ Score saved!', 'success');
  } catch (e) { 
    setStatus(e.message, true);
    showToast('❌ ' + e.message, 'error');
  }
}

// ===== GENERATE NEXT ROUND =====
generateBtn.addEventListener('click', async () => {
  const active = allTeams.filter(t => !t.eliminated);
  if (active.length < 2) {
    showToast('❌ Need at least 2 active teams.', 'error');
    return;
  }

  const groupMatches = allMatches.filter(m => m.stage === 'group');
  const semiMatches = allMatches.filter(m => m.stage === 'semi');
  const finalMatches = allMatches.filter(m => m.stage === 'final');

  if (active.length === 4) {
    if (semiMatches.length === 0) {
      await generateSemiLeg(active, 1);
      showToast('✅ Semi Final Leg 1 generated.', 'success');
      return;
    }
    const leg1 = semiMatches.filter(m => m.leg === 1);
    const leg1Played = leg1.every(m => m.status === 'played');
    if (leg1Played && leg1.length > 0) {
      const leg2 = semiMatches.filter(m => m.leg === 2);
      if (leg2.length === 0) {
        await generateSemiLeg(active, 2);
        showToast('✅ Semi Final Leg 2 generated.', 'success');
        return;
      }
      const leg2Played = leg2.every(m => m.status === 'played');
      if (leg2Played && finalMatches.length === 0) {
        await generateFinal(active, semiMatches);
        showToast('✅ Final generated!', 'success');
        return;
      }
      if (leg2Played && finalMatches.length > 0) {
        showToast('🏆 Tournament complete!', 'info');
        return;
      }
      showToast('⏳ Please finish Leg 2 first.', 'info');
      return;
    }
    showToast('⏳ Please finish Leg 1 first.', 'info');
    return;
  }

  if (active.length > 4) {
    const lastRound = groupMatches.reduce((max, m) => Math.max(max, m.round), 0);
    const nextRound = lastRound + 1;
    const names = active.map(t => t.name);
    const allRounds = generateRoundRobin(names);
    if (nextRound > allRounds.length) {
      showToast('⏳ All rounds generated. Time to trim bottom 2.', 'info');
      return;
    }
    const roundFixtures = allRounds[nextRound - 1];
    if (!roundFixtures || roundFixtures.length === 0) {
      showToast('❌ No fixtures to generate.', 'error');
      return;
    }
    for (const f of roundFixtures) {
      const newMatchRef = push(ref(db, 'matches'));
      await set(newMatchRef, {
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
    showToast(`✅ Round ${nextRound} generated.`, 'success');
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
    const newMatchRef = push(ref(db, 'matches'));
    await set(newMatchRef, {
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
  const newMatchRef = push(ref(db, 'matches'));
  await set(newMatchRef, {
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
  if (active.length <= 4) {
    showToast('❌ Cannot trim when 4 or fewer remain.', 'error');
    return;
  }
  const groupPlayed = allMatches.filter(m => m.stage === 'group' && m.status === 'played');
  const standings = calculateStandings(groupPlayed);
  const sorted = standings.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    return b.gf - a.gf;
  });
  const bottom = sorted.slice(-2);
  if (bottom.length < 2) {
    showToast('❌ Not enough played matches.', 'error');
    return;
  }
  for (const team of bottom) {
    const teamDoc = allTeams.find(t => t.name === team.team);
    if (teamDoc && !teamDoc.eliminated) {
      await update(ref(db, `teams/${teamDoc.id}`), { eliminated: true });
    }
  }
  setStatus(`Eliminated: ${bottom.map(b => b.team).join(', ')}`);
  showToast(`✅ Eliminated: ${bottom.map(b => b.team).join(', ')}`, 'success');
});