import { db } from "./firebase-config.js";
import { 
  ref, set, update, push, onValue, get, child, remove 
} from "firebase/database";
import { shuffleArray, generateTwoLeggedTies, generateFinalMatch } from "./tournament-engine.js";

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
const generatePlayoffBtn = document.getElementById('generate-playoff-btn');
const generateNextBtn = document.getElementById('generate-next-btn');
const resetBtn = document.getElementById('reset-tournament-btn');
const statusMsg = document.getElementById('status-msg');
const tournamentPhaseEl = document.getElementById('tournament-phase');
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
let currentPhase = null;

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
    updatePhaseDisplay();
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
    updatePhaseDisplay();
    // Auto-process playoff results if all playoff matches are played
    autoProcessPlayoff();
  });

  const phaseRef = ref(db, 'tournament/phase');
  onValue(phaseRef, (snapshot) => {
    if (snapshot.exists()) {
      currentPhase = snapshot.val();
    } else {
      currentPhase = null;
    }
    updatePhaseDisplay();
  });
}

function updatePhaseDisplay() {
  const active = allTeams.filter(t => !t.eliminated).length;
  tournamentPhaseEl.textContent = `Active Teams: ${active} | Phase: ${currentPhase ? currentPhase.toUpperCase() : 'Not started'}`;
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

// ===== RENDER MATCHES (with tie resolution) =====
function renderMatches() {
  if (!allMatches.length) {
    matchesContainer.innerHTML = '<p class="empty">No matches scheduled yet.</p>';
    return;
  }
  let html = '';
  // Group by tieId
  const ties = {};
  allMatches.forEach(m => {
    const key = m.tieId || m.id;
    if (!ties[key]) ties[key] = [];
    ties[key].push(m);
  });

  for (const [tieId, matches] of Object.entries(ties)) {
    const first = matches[0];
    const phase = first.phase || 'unknown';
    const legCount = matches.length;
    const isTwoLegged = legCount === 2;
    const isPlayed = matches.every(m => m.status === 'played');
    const hasWinner = matches.some(m => m.winner);

    html += `<div class="match-admin-tie" data-tie="${tieId}">`;
    html += `<div class="tie-header"><strong>${phase.toUpperCase()}</strong> ${isTwoLegged ? '(Home & Away)' : '(Single)'}</div>`;

    matches.forEach((m, idx) => {
      const legLabel = m.leg ? `Leg ${m.leg}` : '';
      const homeScore = m.status === 'played' ? m.homeScore : '';
      const awayScore = m.status === 'played' ? m.awayScore : '';
      html += `
        <div class="match-admin-card" data-id="${m.id}">
          <span class="match-teams">${m.homeTeam} vs ${m.awayTeam} ${legLabel}</span>
          <div class="score-inputs">
            <input type="number" min="0" max="99" class="score-home" value="${homeScore}" ${m.status === 'played' ? 'disabled' : ''} />
            <span>–</span>
            <input type="number" min="0" max="99" class="score-away" value="${awayScore}" ${m.status === 'played' ? 'disabled' : ''} />
          </div>
          <button class="save-score-btn neon-btn small" data-id="${m.id}" ${m.status === 'played' ? 'disabled' : ''}>
            ${m.status === 'played' ? 'Saved' : 'Save Score'}
          </button>
          <span class="match-stage-badge">${m.status}</span>
        </div>
      `;
    });

    // If two-legged and both played, show aggregate and winner selection
    if (isTwoLegged && isPlayed && !hasWinner) {
      const agg = computeAggregate(matches[0], matches[1]);
      html += `<div class="aggregate-info">Aggregate: ${agg.homeAgg} – ${agg.awayAgg}</div>`;
      if (agg.homeAgg === agg.awayAgg) {
        html += `
          <div class="tie-resolution">
            <span>Tie! Select winner:</span>
            <select class="tie-winner-select" data-tie="${tieId}">
              <option value="">--</option>
              <option value="${matches[0].homeTeam}">${matches[0].homeTeam}</option>
              <option value="${matches[0].awayTeam}">${matches[0].awayTeam}</option>
            </select>
            <button class="resolve-tie-btn neon-btn small" data-tie="${tieId}">Resolve</button>
          </div>
        `;
      } else {
        // Winner already determined by aggregate, but we can auto-set
        const winner = agg.homeAgg > agg.awayAgg ? matches[0].homeTeam : matches[0].awayTeam;
        html += `<div class="winner-display">🏆 Winner: ${winner}</div>`;
        // Optionally auto-update winner field
        (async () => {
          for (const m of matches) {
            if (!m.winner) {
              await update(ref(db, `matches/${m.id}`), { winner });
            }
          }
        })();
      }
    } else if (isPlayed && !isTwoLegged && !hasWinner) {
      // Single match (playoff or final)
      const m = matches[0];
      if (m.homeScore !== m.awayScore) {
        const winner = m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam;
        html += `<div class="winner-display">🏆 Winner: ${winner}</div>`;
        (async () => {
          if (!m.winner) {
            await update(ref(db, `matches/${m.id}`), { winner });
          }
        })();
      } else {
        html += `
          <div class="tie-resolution">
            <span>Draw! Select winner:</span>
            <select class="tie-winner-select" data-tie="${tieId}">
              <option value="">--</option>
              <option value="${m.homeTeam}">${m.homeTeam}</option>
              <option value="${m.awayTeam}">${m.awayTeam}</option>
            </select>
            <button class="resolve-tie-btn neon-btn small" data-tie="${tieId}">Resolve</button>
          </div>
        `;
      }
    }

    html += `</div>`;
  }

  matchesContainer.innerHTML = html;

  // Attach event listeners for score saving
  document.querySelectorAll('.save-score-btn:not([disabled])').forEach(btn => {
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

  // Attach resolve tie listeners
  document.querySelectorAll('.resolve-tie-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const tieId = btn.dataset.tie;
      const select = document.querySelector(`.tie-winner-select[data-tie="${tieId}"]`);
      const winner = select.value;
      if (!winner) {
        showToast('❌ Please select a winner.', 'error');
        return;
      }
      await resolveTie(tieId, winner);
    });
  });
}

function computeAggregate(m1, m2) {
  const homeAgg = (m1.status === 'played' ? m1.homeScore : 0) + (m2.status === 'played' ? m2.homeScore : 0);
  const awayAgg = (m1.status === 'played' ? m1.awayScore : 0) + (m2.status === 'played' ? m2.awayScore : 0);
  return { homeAgg, awayAgg };
}

async function resolveTie(tieId, winnerTeam) {
  const matches = allMatches.filter(m => m.tieId === tieId);
  for (const m of matches) {
    await update(ref(db, `matches/${m.id}`), { winner: winnerTeam });
  }
  showToast(`✅ Winner ${winnerTeam} selected.`, 'success');
  // After resolving, maybe generate next round if all ties resolved
  await autoAdvanceTournament();
}

// ===== SAVE/UPDATE SCORE =====
async function saveMatchResult(matchId, homeScore, awayScore) {
  try {
    await update(ref(db, `matches/${matchId}`), {
      homeScore,
      awayScore,
      status: 'played'
    });
    setStatus('Score saved/updated!');
    showToast('✅ Score saved/updated!', 'success');
  } catch (e) { 
    setStatus(e.message, true);
    showToast('❌ ' + e.message, 'error');
  }
}

// ===== GENERATE PLAYOFF =====
generatePlayoffBtn.addEventListener('click', async () => {
  await generatePlayoff();
});

async function generatePlayoff() {
  const active = allTeams.filter(t => !t.eliminated);
  if (active.length !== 18) {
    showToast('❌ Need exactly 18 active teams for playoff.', 'error');
    return;
  }
  // Clear previous matches (optional) – we'll remove all matches first
  await removeAllMatches();
  // Shuffle and pair
  const names = active.map(t => t.name);
  const shuffled = shuffleArray([...names]);
  const pairs = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    pairs.push([shuffled[i], shuffled[i+1]]);
  }
  // Create matches
  for (const [home, away] of pairs) {
    const newMatchRef = push(ref(db, 'matches'));
    await set(newMatchRef, {
      homeTeam: home,
      awayTeam: away,
      phase: 'playoff',
      leg: null,
      status: 'pending',
      homeScore: 0,
      awayScore: 0,
      winner: null,
      tieId: null
    });
  }
  await set(ref(db, 'tournament/phase'), 'playoff');
  showToast('✅ Playoff generated!', 'success');
}

async function removeAllMatches() {
  const snapshot = await get(ref(db, 'matches'));
  if (snapshot.exists()) {
    const updates = {};
    const keys = Object.keys(snapshot.val());
    for (const key of keys) {
      updates[key] = null;
    }
    await update(ref(db, 'matches'), updates);
  }
}

// ===== AUTO-PROCESS PLAYOFF =====
async function autoProcessPlayoff() {
  if (currentPhase !== 'playoff') return;
  const playoffMatches = allMatches.filter(m => m.phase === 'playoff');
  if (playoffMatches.length !== 9) return;
  const allPlayed = playoffMatches.every(m => m.status === 'played' && m.winner);
  if (!allPlayed) return;

  // Determine winners and losers
  const winners = [];
  const losers = [];
  for (const m of playoffMatches) {
    if (m.winner) {
      winners.push(m.winner);
      const loser = m.homeTeam === m.winner ? m.awayTeam : m.homeTeam;
      // compute goal difference for loser
      const loserScore = m.homeTeam === loser ? m.homeScore : m.awayScore;
      const winnerScore = m.homeTeam === m.winner ? m.homeScore : m.awayScore;
      const gd = loserScore - winnerScore;
      const gf = loserScore;
      losers.push({ team: loser, gd, gf });
    } else {
      // not resolved yet
      return;
    }
  }

  // Sort losers by GD, GF
  losers.sort((a,b) => b.gd - a.gd || b.gf - a.gf);
  const bestLosers = losers.slice(0, 7).map(l => l.team);
  const eliminated = losers.slice(7).map(l => l.team);

  // Eliminate bottom 2
  for (const team of eliminated) {
    const teamObj = allTeams.find(t => t.name === team);
    if (teamObj) {
      await update(ref(db, `teams/${teamObj.id}`), { eliminated: true });
    }
  }

  // Qualified for Round of 16: winners + best losers
  const qualified = [...winners, ...bestLosers];
  if (qualified.length !== 16) {
    showToast('❌ Error: qualified teams != 16', 'error');
    return;
  }

  // Generate Round of 16
  await generateRoundOf16(qualified);
}

// ===== GENERATE ROUND OF 16 =====
async function generateRoundOf16(teams) {
  const shuffled = shuffleArray([...teams]);
  const ties = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const home = shuffled[i];
    const away = shuffled[i+1];
    const tieId = push(ref(db, 'ties')).key;
    // Leg 1
    const leg1Ref = push(ref(db, 'matches'));
    await set(leg1Ref, {
      homeTeam: home,
      awayTeam: away,
      phase: 'round16',
      leg: 1,
      tieId: tieId,
      status: 'pending',
      homeScore: 0,
      awayScore: 0,
      winner: null
    });
    // Leg 2 (swap)
    const leg2Ref = push(ref(db, 'matches'));
    await set(leg2Ref, {
      homeTeam: away,
      awayTeam: home,
      phase: 'round16',
      leg: 2,
      tieId: tieId,
      status: 'pending',
      homeScore: 0,
      awayScore: 0,
      winner: null
    });
    ties.push(tieId);
  }
  await set(ref(db, 'tournament/phase'), 'round16');
  showToast(`✅ Round of 16 generated (${ties.length} ties).`, 'success');
}

// ===== GENERATE NEXT ROUND (automatically after all ties resolved) =====
generateNextBtn.addEventListener('click', async () => {
  await autoAdvanceTournament();
});

async function autoAdvanceTournament() {
  // Check current phase and if all matches in that phase are resolved
  if (!currentPhase) {
    showToast('❌ No tournament phase active.', 'error');
    return;
  }
  const phaseMatches = allMatches.filter(m => m.phase === currentPhase);
  if (phaseMatches.length === 0) {
    showToast('❌ No matches in current phase.', 'error');
    return;
  }
  // Check if all matches have a winner (for playoff) or all ties have winners (for two-legged)
  let allResolved = true;
  const ties = {};
  phaseMatches.forEach(m => {
    const key = m.tieId || m.id;
    if (!ties[key]) ties[key] = [];
    ties[key].push(m);
  });
  for (const [key, matches] of Object.entries(ties)) {
    const hasWinner = matches.some(m => m.winner);
    if (!hasWinner) {
      allResolved = false;
      break;
    }
  }
  if (!allResolved) {
    showToast('❌ Please resolve all ties (select winners) before proceeding.', 'error');
    return;
  }

  // Determine winners of this phase
  const winners = [];
  for (const [key, matches] of Object.entries(ties)) {
    // find winner from any match
    const winnerMatch = matches.find(m => m.winner);
    if (winnerMatch) {
      winners.push(winnerMatch.winner);
    }
  }
  if (winners.length === 0) {
    showToast('❌ No winners found.', 'error');
    return;
  }

  // Map phase to next phase
  const phaseMap = {
    'playoff': 'round16',
    'round16': 'quarter',
    'quarter': 'semi',
    'semi': 'final'
  };
  const nextPhase = phaseMap[currentPhase];
  if (!nextPhase) {
    // If final, declare champion
    if (currentPhase === 'final') {
      const champion = winners[0];
      showToast(`🏆 Champion: ${champion}!`, 'success');
      await set(ref(db, 'tournament/champion'), champion);
      return;
    }
    showToast('❌ Unknown phase.', 'error');
    return;
  }

  // Generate next phase
  if (nextPhase === 'final') {
    if (winners.length !== 2) {
      showToast('❌ Need exactly 2 winners for final.', 'error');
      return;
    }
    const finalMatch = {
      homeTeam: winners[0],
      awayTeam: winners[1],
      phase: 'final',
      leg: null,
      tieId: null,
      status: 'pending',
      homeScore: 0,
      awayScore: 0,
      winner: null
    };
    const refMatch = push(ref(db, 'matches'));
    await set(refMatch, finalMatch);
    await set(ref(db, 'tournament/phase'), 'final');
    showToast('✅ Final generated!', 'success');
  } else {
    // Two-legged rounds
    const shuffled = shuffleArray([...winners]);
    const ties = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      const home = shuffled[i];
      const away = shuffled[i+1];
      const tieId = push(ref(db, 'ties')).key;
      const leg1Ref = push(ref(db, 'matches'));
      await set(leg1Ref, {
        homeTeam: home,
        awayTeam: away,
        phase: nextPhase,
        leg: 1,
        tieId: tieId,
        status: 'pending',
        homeScore: 0,
        awayScore: 0,
        winner: null
      });
      const leg2Ref = push(ref(db, 'matches'));
      await set(leg2Ref, {
        homeTeam: away,
        awayTeam: home,
        phase: nextPhase,
        leg: 2,
        tieId: tieId,
        status: 'pending',
        homeScore: 0,
        awayScore: 0,
        winner: null
      });
      ties.push(tieId);
    }
    await set(ref(db, 'tournament/phase'), nextPhase);
    showToast(`✅ ${nextPhase.toUpperCase()} generated (${ties.length} ties).`, 'success');
  }
}

// ===== RESET TOURNAMENT =====
resetBtn.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to reset the tournament? All matches will be deleted and teams will be reactivated.')) return;
  try {
    await removeAllMatches();
    // Reactivate all teams
    for (const team of allTeams) {
      await update(ref(db, `teams/${team.id}`), { eliminated: false });
    }
    await remove(ref(db, 'tournament'));
    showToast('✅ Tournament reset.', 'success');
  } catch (e) {
    showToast('❌ Error resetting: ' + e.message, 'error');
  }
});