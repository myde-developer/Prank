// ==================== FIREBASE & GLOBALS ====================
const firebaseConfig = {
    apiKey: "AIzaSyBmy0tmvaYcw9KsQQRH7RLKcXC8EN6WFqY",
    authDomain: "dls-premier-league.firebaseapp.com",
    projectId: "dls-premier-league",
    storageBucket: "dls-premier-league.firebasestorage.app",
    messagingSenderId: "975087030284",
    appId: "1:975087030284:web:7708718fffd9180c009e29"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let teams = {}, fixtures = [], knockoutMatches = [], tournamentPhase = 'league';
let currentSelectedRound = 1, isAdmin = false, tournamentPassword = "";
let tickerInterval = null, currentTickerFactIndex = 0, tickerFacts = [];
let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
let currentPenaltyTeam = null, pendingAssignFixtureId = null, pendingAssignSide = null, currentViewerFixtureId = null;
let currentPredictionFixtureId = null, currentBanterFixtureId = null;
let currentEditingEventsFixture = null, pendingEvents = [];
let currentSortable = null;
let autoStartNextRound = false;
let roundStartTimes = {};   // stores timestamp when admin starts a round

// ==================== HELPERS ====================
function showToast(msg) {
    const c = document.getElementById("toast-container");
    if (c) { let t = document.createElement("div"); t.className = "toast"; t.innerText = msg; c.appendChild(t); setTimeout(() => t.remove(), 2500); }
}
function saveToStorage() { 
    db.ref('tournament_data').set({ teams, fixtures, knockoutMatches, tournamentPhase, password: tournamentPassword, roundStartTimes, autoStartNextRound }); 
}

// ==================== RANDOMIZED FIXTURE GENERATION ====================
function generateRandomRoundRobin(teamNames) {
    let n = teamNames.length;
    let hasBye = false;
    if (n % 2 !== 0) {
        teamNames.push("BYE");
        n++;
        hasBye = true;
    }
    
    // Randomly shuffle the initial team order
    let shuffled = [...teamNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    const numRounds = n - 1;
    const halfSize = n / 2;
    const rounds = [];
    
    for (let round = 0; round < numRounds; round++) {
        const roundFixtures = [];
        for (let i = 0; i < halfSize; i++) {
            const home = shuffled[i];
            const away = shuffled[n - 1 - i];
            if (home !== "BYE" && away !== "BYE") {
                // Randomly decide home/away
                if (Math.random() < 0.5) {
                    roundFixtures.push({ home, away });
                } else {
                    roundFixtures.push({ home: away, away: home });
                }
            }
        }
        rounds.push(roundFixtures);
        
        // Rotate the array (standard round‑robin rotation)
        const last = shuffled.pop();
        shuffled.splice(1, 0, last);
    }
    
    // Optional: shuffle the order of rounds for extra unpredictability
    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }
    
    return rounds;
}

// ==================== TIME LIMIT (ADMIN‑CONTROLLED) ====================
function expireOldFixtures() {
    const now = Date.now();
    let changed = false;
    fixtures.forEach(f => {
        if (!f.played && !f.cancelled) {
            const startTime = roundStartTimes[f.round];
            if (startTime) {
                const deadline = startTime + 2 * 24 * 60 * 60 * 1000;
                if (now > deadline) {
                    f.cancelled = true;
                    changed = true;
                    showToast(`⏰ Round ${f.round} match cancelled: ${f.home} vs ${f.away} (time limit exceeded)`);
                }
            }
        }
    });
    knockoutMatches.forEach(k => {
        if (!k.played && !k.cancelled && k.deadline && now > k.deadline) {
            k.cancelled = true;
            changed = true;
            showToast(`⏰ Knockout match cancelled: ${k.home} vs ${k.away} (time limit exceeded)`);
        }
    });
    if (changed) {
        updateTableCalculations();
        renderTable();
        renderFixtures();
        renderKnockoutBracket();
        saveToStorage();
    }
// ==================== TIME LIMIT (ADMIN‑CONTROLLED) ====================
function expireOldFixtures() {
    const now = Date.now();
    let changed = false;
    
    // Cancel expired league fixtures
    fixtures.forEach(f => {
        if (!f.played && !f.cancelled) {
            const startTime = roundStartTimes[f.round];
            if (startTime) {
                const deadline = startTime + 2 * 24 * 60 * 60 * 1000;
                if (now > deadline) {
                    f.cancelled = true;
                    changed = true;
                    showToast(`⏰ Round ${f.round} match cancelled: ${f.home} vs ${f.away} (time limit exceeded)`);
                }
            }
        }
    });
    
    // Cancel expired knockout matches
    knockoutMatches.forEach(k => {
        if (!k.played && !k.cancelled && k.deadline && now > k.deadline) {
            k.cancelled = true;
            changed = true;
            showToast(`⏰ Knockout match cancelled: ${k.home} vs ${k.away} (time limit exceeded)`);
        }
    });
    
    if (changed) {
        updateTableCalculations();
        renderTable();
        renderFixtures();
        renderKnockoutBracket();
        saveToStorage();
    }
    
    // ========== AUTO-START NEXT ROUND (Feature #6) ==========
    if (autoStartNextRound && tournamentPhase === 'league') {
        const currentRound = currentSelectedRound;
        // Get all fixtures of current round that involve non‑relegated teams
        const roundFixtures = fixtures.filter(f => f.round === currentRound && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
        if (roundFixtures.length === 0) return;
        
        const allResolved = roundFixtures.every(f => f.played || f.cancelled);
        if (allResolved) {
            const nextRound = currentRound + 1;
            const nextRoundExists = fixtures.some(f => f.round === nextRound);
            // Only start next round if it exists and hasn't been started yet
            if (nextRoundExists && !roundStartTimes[nextRound]) {
                startRound(nextRound);
            }
        }
    }
}
}

// ==================== DATABASE + LIVE ALERTS ====================
function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.teams && data.fixtures) {
            if (data.password) tournamentPassword = data.password;
            teams = data.teams;
            fixtures = data.fixtures;
            knockoutMatches = data.knockoutMatches || [];
            tournamentPhase = data.tournamentPhase || 'league';
            roundStartTimes = data.roundStartTimes || {};
            autoStartNextRound = data.autoStartNextRound || false;
            
            // Sync the toggle button UI based on loaded setting
            const toggleBtn = document.getElementById('auto-start-toggle');
            const toggleDot = document.getElementById('auto-start-dot');
            if (toggleBtn && toggleDot) {
                if (autoStartNextRound) {
                    toggleBtn.classList.remove('bg-gray-300');
                    toggleBtn.classList.add('bg-indigo-600');
                    toggleDot.classList.remove('translate-x-0');
                    toggleDot.classList.add('translate-x-4');
                } else {
                    toggleBtn.classList.remove('bg-indigo-600');
                    toggleBtn.classList.add('bg-gray-300');
                    toggleDot.classList.remove('translate-x-4');
                    toggleDot.classList.add('translate-x-0');
                }
            }
            
            updateTableCalculations();
            renderTable();
            renderGameweekTabs();
            renderFixtures();
            renderKnockoutBracket();
            renderRelegatedTeams();
            generateTickerFacts();
            checkAndCelebrateChampion();
            document.getElementById('setup-section')?.classList.add('hidden');
            document.getElementById('dashboard-section')?.classList.remove('hidden');
            document.getElementById('admin-toggle-container')?.classList.remove('hidden');
            document.getElementById('deadline-clock')?.classList.remove('hidden');
            document.title = `DLS | ${Object.keys(teams).length} teams`;
            initSortable();
            expireOldFixtures();
            startDeadlineClock();
        } else {
            tournamentPassword = "1234";
            roundStartTimes = {};
            autoStartNextRound = false;
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('admin-toggle-container')?.classList.add('hidden');
            document.getElementById('deadline-clock')?.classList.add('hidden');
            document.getElementById('news-ticker').innerHTML = "⚽ Ready to create your league";
        }
    }, () => showToast("Firebase connection issue"));
    
    db.ref('tournament_data/fixtures').on('child_changed', (snapshot) => {
        const updated = snapshot.val();
        if (updated && updated.played === true && updated.homeScore !== null) {
            showToast(`📢 Result: ${updated.home} ${updated.homeScore}-${updated.awayScore} ${updated.away}`);
        }
    });
}

// ==================== TICKER ====================
function updateTickerFacts() {
    if (!tickerFacts.length) return;
    const el = document.getElementById('news-ticker');
    if (!el) return;
    el.classList.add('slide-out');
    setTimeout(() => {
        currentTickerFactIndex = (currentTickerFactIndex + 1) % tickerFacts.length;
        el.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-white rounded-full animate-pulse"></span> ${tickerFacts[currentTickerFactIndex]}</span>`;
        el.classList.remove('slide-out');
        el.classList.add('slide-in');
        setTimeout(() => el.classList.remove('slide-in'), 500);
    }, 500);
}
function generateTickerFacts() {
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    const totalTeams = activeTeams.length;
    const totalMatchesPlayed = fixtures.filter(f => f.played && !teams[f.home]?.relegated && !teams[f.away]?.relegated).length;
    const totalMatches = fixtures.filter(f => !teams[f.home]?.relegated && !teams[f.away]?.relegated).length;
    let leader = null, topScorer = null, biggestWin = null;
    if (totalTeams) {
        const sorted = activeTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
        if (sorted.length) leader = sorted[0];
        const sortedGF = activeTeams.sort((a, b) => b.gf - a.gf);
        if (sortedGF.length) topScorer = sortedGF[0];
    }
    fixtures.forEach(f => { if (f.played && f.homeScore !== null && !teams[f.home]?.relegated && !teams[f.away]?.relegated) { const total = f.homeScore + f.awayScore; if (!biggestWin || total > biggestWin.total) biggestWin = { home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore, total }; } });
    tickerFacts = [`🏆 DLS Vawulence Academy Hub`, `⚽ ${totalTeams} teams`, `📊 ${totalMatchesPlayed}/${totalMatches} played`, leader ? `👑 Leader: ${leader.name} (${leader.pts} pts)` : null, topScorer ? `🔥 Top scorer: ${topScorer.name} (${topScorer.gf} goals)` : null, biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore}-${biggestWin.awayScore} ${biggestWin.away}` : null, `🔮 Predict matches & post banter!`].filter(f => f);
    if (tickerFacts.length) {
        const el = document.getElementById('news-ticker');
        if (el) el.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-white rounded-full animate-pulse"></span> ${tickerFacts[0]}</span>`;
        currentTickerFactIndex = 0;
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateTickerFacts, 6000);
    }
}

// ==================== ADMIN MODE ====================
function handleAdminToggleClick() { if (!isAdmin) { document.getElementById('admin-password-input').value = ""; document.getElementById('password-error').classList.add('hidden'); document.getElementById('password-modal').classList.remove('hidden'); } else deactivateAdminMode(); }
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }
function verifyAdminPassword() { const val = document.getElementById('admin-password-input').value; if (val === tournamentPassword) { closePasswordModal(); activateAdminMode(); } else document.getElementById('password-error').classList.remove('hidden'); }
function activateAdminMode() { isAdmin = true; updateAdminUIElements(); showToast("Admin mode ACTIVE"); initSortable(); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); showToast("Admin mode deactivated"); }
function updateAdminUIElements() {
    const btn = document.getElementById('admin-btn'), dot = document.getElementById('admin-btn-dot'), statusText = document.getElementById('admin-status-text'), resetContainer = document.getElementById('admin-reset-container'), thActions = document.getElementById('th-admin-actions'), hint = document.getElementById('admin-table-hint'), relegationZone = document.getElementById('relegation-zone');
   const autoStartContainer = document.getElementById('auto-start-container');
if (autoStartContainer) {
    if (isAdmin) autoStartContainer.classList.remove('hidden');
    else autoStartContainer.classList.add('hidden');
}
    const floatMenu = document.getElementById('floating-admin-menu');
    if (isAdmin) {
        btn?.classList.replace('bg-gray-300', 'bg-indigo-600'); dot?.classList.replace('translate-x-0', 'translate-x-5');
        if (statusText) { statusText.innerText = "⚡ ADMIN MODE"; statusText.classList.replace('text-gray-600', 'text-indigo-600'); }
        if (resetContainer) resetContainer.classList.remove('hidden'); if (thActions) thActions.classList.remove('hidden'); if (hint) hint.classList.remove('hidden');
        if (relegationZone) relegationZone.classList.remove('hidden');
        if (floatMenu) floatMenu.classList.remove('hidden');
        renderRelegatedTeams();
    } else {
        btn?.classList.replace('bg-indigo-600', 'bg-gray-300'); dot?.classList.replace('translate-x-5', 'translate-x-0');
        if (statusText) { statusText.innerText = "🔒 READ ONLY"; statusText.classList.replace('text-indigo-600', 'text-gray-600'); }
        if (resetContainer) resetContainer.classList.add('hidden'); if (thActions) thActions.classList.add('hidden'); if (hint) hint.classList.add('hidden');
        if (relegationZone) relegationZone.classList.add('hidden');
        if (floatMenu) floatMenu.classList.add('hidden');
    }
    renderTable(); renderGameweekTabs(); renderFixtures();
}

// ==================== PASSWORD CHANGE ====================
function openChangePasswordModal() { if (!isAdmin) return; document.getElementById('new-password').value = ''; document.getElementById('confirm-password').value = ''; document.getElementById('password-match-error').classList.add('hidden'); document.getElementById('change-password-modal').classList.remove('hidden'); }
function closeChangePasswordModal() { document.getElementById('change-password-modal').classList.add('hidden'); }
function updateMasterPassword() { const newPass = document.getElementById('new-password').value.trim(), confirmPass = document.getElementById('confirm-password').value.trim(); if (!newPass) { showToast('Password cannot be empty'); return; } if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; } tournamentPassword = newPass; saveToStorage(); showToast('Master password updated!'); closeChangePasswordModal(); }

// ==================== ADVANCED PENALTY ====================
function openPenaltyModal(teamName) { if (!isAdmin) return; currentPenaltyTeam = teamName; const team = teams[teamName]; document.getElementById('penalty-team-name').innerText = teamName; document.getElementById('current-penalty').innerText = team.deductedPoints || 0; document.getElementById('penalty-modal').classList.remove('hidden'); }
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); currentPenaltyTeam = null; }
function adjustPenalty(delta) { if (!currentPenaltyTeam) return; const team = teams[currentPenaltyTeam]; let newVal = (team.deductedPoints || 0) + delta; if (newVal < 0) newVal = 0; team.deductedPoints = newVal; document.getElementById('current-penalty').innerText = newVal; saveToStorage(); renderTable(); showToast(`${currentPenaltyTeam} penalty now ${newVal} pts`); }
function clearPenaltyPoints() { if (!currentPenaltyTeam) return; teams[currentPenaltyTeam].deductedPoints = 0; document.getElementById('current-penalty').innerText = "0"; saveToStorage(); renderTable(); showToast(`Penalty cleared for ${currentPenaltyTeam}`); closePenaltyModal(); }

// ==================== TOURNAMENT SETUP ====================
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter 2-20 teams"); return; }
    const container = document.getElementById('team-inputs-container');
    container.innerHTML = "";
    for (let i = 1; i <= count; i++) { container.innerHTML += `<div class="bg-gray-50 p-3 rounded-xl border border-gray-200"><div class="flex items-center gap-2"><span class="bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${i}</span><input type="text" id="team-input-${i}" placeholder="Club name" class="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm"></div></div>`; }
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
}
function initializeTournament() {
    const count = parseInt(document.getElementById('team-count').value);
    const pass = document.getElementById('tournament-password').value.trim();
    if (pass) tournamentPassword = pass;
    
    // Collect team names
    let list = [];
    for (let i = 1; i <= count; i++) {
        let name = document.getElementById(`team-input-${i}`).value.trim();
        if (name === "") name = `Team ${i}`;
        list.push({ name });
    }
    
    // Create teams object (no BYE team yet)
    teams = {};
    list.forEach(item => {
        teams[item.name] = { 
            name: item.name, 
            mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, 
            deductedPoints: 0, formHistory: [], relegated: false 
        };
    });
    
    // Generate random round‑robin fixtures
    const teamNames = Object.keys(teams);
    const rounds = generateRandomRoundRobin(teamNames);
    
    // Flatten rounds into fixtures array
    fixtures = [];
    let fixtureId = 0;
    rounds.forEach((roundFixtures, roundIndex) => {
        roundFixtures.forEach(({ home, away }) => {
            fixtures.push({
                id: fixtureId++,
                round: roundIndex + 1,
                home: home,
                away: away,
                homeScore: null,
                awayScore: null,
                played: false,
                cancelled: false,
                comment: null,
                predictions: [],
                banter: [],
                events: [],
                report: null,
                deadline: null
            });
        });
    });
    
    tournamentPhase = 'league';
    knockoutMatches = [];
    roundStartTimes = {};
    autoStartNextRound = false;
    currentSelectedRound = 1;
    saveToStorage();
    showToast("Tournament launched with random, unpredictable fixtures!");
}

// ==================== ADMIN: START ROUND ====================
function startRound(roundNumber) {
    if (!isAdmin) return;
    if (roundStartTimes[roundNumber] && roundStartTimes[roundNumber] !== null) {
        showToast(`Round ${roundNumber} already started!`);
        return;
    }
    // Optional: prevent starting next round if previous round still active
    if (roundNumber > 1) {
        const prevRound = roundNumber - 1;
        const prevStart = roundStartTimes[prevRound];
        if (prevStart) {
            const prevDeadline = prevStart + 2 * 24 * 60 * 60 * 1000;
            const prevFixtures = fixtures.filter(f => f.round === prevRound);
            const allFinished = prevFixtures.every(f => f.played || f.cancelled);
            if (!allFinished && Date.now() < prevDeadline) {
                showToast(`Cannot start Round ${roundNumber} – previous round still active!`);
                return;
            }
        }
    }
    roundStartTimes[roundNumber] = Date.now();
    saveToStorage();
    renderGameweekTabs();
    renderFixtures();
    showToast(`⏱️ Round ${roundNumber} started! 2‑day deadline begins now.`);
}

// ==================== FIXTURE MANAGEMENT ====================
function shuffleRound(roundNumber) {
    if (!isAdmin) return;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    if (!roundFixtures.length) return;
    const teamsInRound = [];
    roundFixtures.forEach(f => { if (f.home !== 'BYE') teamsInRound.push(f.home); if (f.away !== 'BYE') teamsInRound.push(f.away); });
    let uniqueTeams = [...new Set(teamsInRound)];
    for (let i = uniqueTeams.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uniqueTeams[i], uniqueTeams[j]] = [uniqueTeams[j], uniqueTeams[i]]; }
    const newPairs = [];
    for (let i = 0; i < uniqueTeams.length; i += 2) { if (i + 1 < uniqueTeams.length) { if (Math.random() < 0.5) newPairs.push({ home: uniqueTeams[i], away: uniqueTeams[i + 1] }); else newPairs.push({ home: uniqueTeams[i + 1], away: uniqueTeams[i] }); } }
    roundFixtures.forEach((f, idx) => { if (idx < newPairs.length) { f.home = newPairs[idx].home; f.away = newPairs[idx].away; f.homeScore = null; f.awayScore = null; f.played = false; f.comment = null; f.cancelled = false; } });
    saveToStorage(); showToast(`Round ${roundNumber} shuffled!`); renderGameweekTabs(); renderFixtures(); renderTable(); generateTickerFacts();
}
function swapFixture(fixtureId) { if (!isAdmin) return; const f = fixtures.find(f => f.id === fixtureId); [f.home, f.away] = [f.away, f.home]; f.homeScore = null; f.awayScore = null; f.played = false; f.comment = null; f.cancelled = false; saveToStorage(); showToast(`Swapped ${f.home} vs ${f.away}`); renderFixtures(); renderTable(); generateTickerFacts(); }
function editFixtureTeamName(fixtureId, side) { if (!isAdmin) return; const fixture = fixtures.find(f => f.id === fixtureId); const dropdown = document.getElementById('team-select-dropdown'); dropdown.innerHTML = '<option value="">— Cancel / No change —</option>'; const otherSide = side === 'home' ? fixture.away : fixture.home; const teamNames = Object.values(teams).filter(t => !t.relegated).map(t => t.name).sort(); teamNames.forEach(name => { if (name !== otherSide) { const opt = document.createElement('option'); opt.value = name; opt.textContent = name; dropdown.appendChild(opt); } }); const byeOpt = document.createElement('option'); byeOpt.value = 'BYE_REMOVE'; byeOpt.textContent = '— Remove team (set to BYE) —'; dropdown.appendChild(byeOpt); pendingAssignFixtureId = fixtureId; pendingAssignSide = side; document.getElementById('team-select-modal').classList.remove('hidden'); }
function closeTeamSelectModal() { document.getElementById('team-select-modal').classList.add('hidden'); pendingAssignFixtureId = null; pendingAssignSide = null; }
function confirmTeamSelection() {
    if (pendingAssignFixtureId === null) return;
    const selected = document.getElementById('team-select-dropdown').value;
    if (selected === '') { closeTeamSelectModal(); return; }
    const fixture = fixtures.find(f => f.id === pendingAssignFixtureId);
    const side = pendingAssignSide;
    if (selected === 'BYE_REMOVE') {
        if (side === 'home') fixture.home = 'BYE'; else fixture.away = 'BYE';
        fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null; fixture.cancelled = false;
        delete fixture.vacantHome; delete fixture.vacantAway;
        saveToStorage(); showToast(`Removed team, set to BYE`); renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
        return;
    }
    const newTeam = selected;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    if (teams[newTeam]?.relegated) { showToast(`Cannot assign a relegated team.`); closeTeamSelectModal(); return; }
    const round = fixture.round;
    const otherFixtures = fixtures.filter(f => f.round === round && f.id !== fixture.id);
    if (otherFixtures.some(f => f.home === newTeam || f.away === newTeam)) { showToast(`Team "${newTeam}" already has a fixture in this round!`); closeTeamSelectModal(); return; }
    if (side === 'home') { fixture.home = newTeam; delete fixture.vacantHome; }
    else { fixture.away = newTeam; delete fixture.vacantAway; }
    fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null; fixture.cancelled = false;
    saveToStorage(); showToast(`Assigned ${newTeam} to ${side} side.`); renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
}

// ==================== STANDINGS & KNOCKOUT TRIGGER ====================
function updateTableCalculations() {
    for (let t in teams) { if (!teams[t].relegated) { teams[t] = { ...teams[t], mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, formHistory: [] }; } }
    fixtures.forEach(f => {
        if (f.played && !f.cancelled && teams[f.home] && teams[f.away] && !teams[f.home].relegated && !teams[f.away].relegated && f.home !== "VACANT" && f.away !== "VACANT") {
            const h = f.home, a = f.away, hS = parseInt(f.homeScore), aS = parseInt(f.awayScore);
            teams[h].mp++; teams[a].mp++;
            teams[h].gf += hS; teams[h].ga += aS; teams[a].gf += aS; teams[a].ga += hS;
            if (hS > aS) { teams[h].w++; teams[h].pts += 3; teams[a].l++; teams[h].formHistory.push('W'); teams[a].formHistory.push('L'); }
            else if (aS > hS) { teams[a].w++; teams[a].pts += 3; teams[h].l++; teams[h].formHistory.push('L'); teams[a].formHistory.push('W'); }
            else { teams[h].d++; teams[h].pts += 1; teams[a].d++; teams[a].pts += 1; teams[h].formHistory.push('D'); teams[a].formHistory.push('D'); }
            if (teams[h].formHistory.length > 10) teams[h].formHistory.shift();
            if (teams[a].formHistory.length > 10) teams[a].formHistory.shift();
        }
    });
    for (let t in teams) { teams[t].pts = Math.max(0, teams[t].pts - (teams[t].deductedPoints || 0)); teams[t].gd = teams[t].gf - teams[t].ga; }
    
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    if (activeTeams.length === 4 && tournamentPhase === 'league' && knockoutMatches.length === 0) {
        startKnockoutStage(activeTeams);
    }
}

// ==================== KNOCKOUT STAGE ====================
function startKnockoutStage(activeTeams) {
    const sorted = [...activeTeams].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const now = Date.now();
    generateSemiFinalLegs(sorted[0].name, sorted[3].name, sorted[1].name, sorted[2].name, now);
}
function generateSemiFinalLegs(team1, team4, team2, team3, baseTime) {
    const leg1Deadline = baseTime + 2 * 24 * 60 * 60 * 1000;
    const leg2Deadline = baseTime + 4 * 24 * 60 * 60 * 1000;
    const semiId = Date.now();
    const semiMatches = [
        { id: semiId, round: 'semi_leg1', home: team1, away: team4, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg1Deadline, semiId: semiId, leg: 1, pair: 1 },
        { id: semiId + 1, round: 'semi_leg2', home: team4, away: team1, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg2Deadline, semiId: semiId, leg: 2, pair: 1 },
        { id: semiId + 2, round: 'semi_leg1', home: team2, away: team3, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg1Deadline, semiId: semiId + 1, leg: 1, pair: 2 },
        { id: semiId + 3, round: 'semi_leg2', home: team3, away: team2, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg2Deadline, semiId: semiId + 1, leg: 2, pair: 2 }
    ];
    knockoutMatches = semiMatches;
    tournamentPhase = 'knockout';
    saveToStorage();
    renderKnockoutBracket();
    showToast("🏆 Only 4 teams left! Two‑leg semi‑finals begin.");
}
function checkSemiFinalsCompletion() {
    const semis = knockoutMatches.filter(k => k.round === 'semi_leg1' || k.round === 'semi_leg2');
    if (semis.length !== 4) return;
    const allPlayed = semis.every(s => s.played || s.cancelled);
    if (!allPlayed) return;
    const pairs = {};
    semis.forEach(s => { if (!pairs[s.pair]) pairs[s.pair] = []; pairs[s.pair].push(s); });
    const winners = [];
    for (let pair in pairs) {
        const legs = pairs[pair];
        if (legs.length !== 2) { winners.push(null); continue; }
        const leg1 = legs.find(l => l.leg === 1);
        const leg2 = legs.find(l => l.leg === 2);
        if (!leg1 || !leg2 || leg1.cancelled || leg2.cancelled) { winners.push(null); continue; }
        const aggHome = (leg1.homeScore || 0) + (leg2.awayScore || 0);
        const aggAway = (leg1.awayScore || 0) + (leg2.homeScore || 0);
        if (aggHome > aggAway) winners.push(leg1.home);
        else if (aggAway > aggHome) winners.push(leg1.away);
        else { winners.push(leg1.home); showToast(`Semi‑final tied aggregate. ${leg1.home} advances on random draw.`); }
    }
    if (winners.length === 2 && winners[0] && winners[1]) generateFinalLegs(winners[0], winners[1]);
    else showToast("Semi‑finals incomplete or cancelled. Cannot generate final.");
}
function generateFinalLegs(teamA, teamB) {
    const now = Date.now();
    const leg1Deadline = now + 2 * 24 * 60 * 60 * 1000;
    const leg2Deadline = now + 4 * 24 * 60 * 60 * 1000;
    const finalId = Date.now();
    const finalLegs = [
        { id: finalId, round: 'final_leg1', home: teamA, away: teamB, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg1Deadline, finalId: finalId, leg: 1 },
        { id: finalId + 1, round: 'final_leg2', home: teamB, away: teamA, homeScore: null, awayScore: null, played: false, cancelled: false, events: [], report: null, deadline: leg2Deadline, finalId: finalId, leg: 2 }
    ];
    knockoutMatches = knockoutMatches.filter(k => k.round !== 'final_leg1' && k.round !== 'final_leg2');
    knockoutMatches.push(...finalLegs);
    saveToStorage();
    renderKnockoutBracket();
    showToast("🏆 Final set! Two legs to decide the champion.");
}
function checkFinalCompletion() {
    const legs = knockoutMatches.filter(k => k.round === 'final_leg1' || k.round === 'final_leg2');
    if (legs.length !== 2) return;
    if (!legs.every(l => l.played || l.cancelled)) return;
    const leg1 = legs.find(l => l.leg === 1);
    const leg2 = legs.find(l => l.leg === 2);
    if (!leg1 || !leg2) return;
    if (leg1.cancelled || leg2.cancelled) { showToast("Final legs cancelled. No champion crowned."); return; }
    const aggHome = (leg1.homeScore || 0) + (leg2.awayScore || 0);
    const aggAway = (leg1.awayScore || 0) + (leg2.homeScore || 0);
    let champion = null;
    if (aggHome > aggAway) champion = leg1.home;
    else if (aggAway > aggHome) champion = leg1.away;
    else { champion = leg1.home; showToast("Aggregate tie! Champion decided by random draw."); }
    db.ref('tournament_data/champion').set({ name: champion, date: new Date().toISOString() });
    if (typeof confetti === 'function') confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 } });
    showToast(`🏆 ${champion} are the ultimate champions! 🏆`);
}
function checkAndCelebrateChampion() { /* handled in checkFinalCompletion */ }

// ==================== RENDER KNOCKOUT BRACKET ====================
function renderKnockoutBracket() {
    const container = document.getElementById('knockout-bracket');
    const section = document.getElementById('knockout-section');
    if (!container) return;
    if (tournamentPhase !== 'knockout' || knockoutMatches.length === 0) {
        section?.classList.add('hidden');
        return;
    }
    section?.classList.remove('hidden');
    container.innerHTML = '';
    const semiLegs = knockoutMatches.filter(k => k.round === 'semi_leg1' || k.round === 'semi_leg2');
    const finalLegs = knockoutMatches.filter(k => k.round === 'final_leg1' || k.round === 'final_leg2');
    if (semiLegs.length) {
        const pairs = {};
        semiLegs.forEach(leg => { if (!pairs[leg.pair]) pairs[leg.pair] = []; pairs[leg.pair].push(leg); });
        const semiDiv = document.createElement('div');
        semiDiv.className = 'space-y-4';
        semiDiv.innerHTML = '<h3 class="font-semibold text-sm text-gray-600">Semi‑finals (two legs)</h3>';
        for (const pair in pairs) {
            const legs = pairs[pair].sort((a,b) => a.leg - b.leg);
            semiDiv.innerHTML += `<div class="border-l-2 border-indigo-200 pl-3 mb-2"><p class="text-xs font-mono text-gray-500 mb-1">Match ${pair}</p>${legs.map(leg => renderKnockoutMatchCard(leg)).join('')}</div>`;
        }
        container.appendChild(semiDiv);
    }
    if (finalLegs.length) {
        const finalDiv = document.createElement('div');
        finalDiv.className = 'space-y-3';
        finalDiv.innerHTML = '<h3 class="font-semibold text-sm text-gray-600">Final (two legs)</h3>';
        finalLegs.sort((a,b) => a.leg - b.leg).forEach(leg => { finalDiv.innerHTML += renderKnockoutMatchCard(leg); });
        container.appendChild(finalDiv);
    }
}
function renderKnockoutMatchCard(m) {
    const played = m.played;
    const cancelled = m.cancelled;
    let scoreHtml = '', actionsHtml = '';
    if (cancelled) scoreHtml = `<span class="text-rose-500 text-xs font-bold">CANCELLED</span>`;
    else if (played) {
        scoreHtml = `<span class="font-mono font-bold">${m.homeScore} - ${m.awayScore}</span>`;
        if (isAdmin) actionsHtml = `<div class="mt-1 flex gap-1"><button onclick="showMatchCommentForKnockout(${m.id})" class="text-[9px] bg-gray-100 px-1 py-0.5 rounded">📖</button><button onclick="editKnockoutResult(${m.id})" class="text-[9px] bg-indigo-100 px-1 py-0.5 rounded">✏️</button></div>`;
    } else {
        if (isAdmin) scoreHtml = `<div class="flex items-center gap-1"><input type="number" id="ko-home-${m.id}" placeholder="0" class="w-10 text-center bg-white border rounded text-xs"><span>:</span><input type="number" id="ko-away-${m.id}" placeholder="0" class="w-10 text-center bg-white border rounded text-xs"><button onclick="saveKnockoutResult(${m.id})" class="bg-indigo-600 text-white text-[9px] px-1 py-0.5 rounded">Save</button></div>`;
        else scoreHtml = `<span class="text-gray-400 text-xs">Not played yet</span>`;
    }
    const legLabel = m.leg ? ` (Leg ${m.leg})` : '';
    return `<div class="bg-gray-50 p-2 rounded-lg border"><div class="flex justify-between items-center"><span class="font-medium text-sm">${m.home}</span><span>vs</span><span class="font-medium text-sm">${m.away}</span></div><div class="text-center mt-1">${scoreHtml}</div>${actionsHtml}<div class="text-right text-[9px] text-gray-400">${m.round}${legLabel}</div></div>`;
}

// ==================== KNOCKOUT ADMIN ACTIONS ====================
function saveKnockoutResult(matchId) {
    if (!isAdmin) return;
    const match = knockoutMatches.find(m => m.id === matchId);
    if (!match) return;
    const homeScore = document.getElementById(`ko-home-${matchId}`).value;
    const awayScore = document.getElementById(`ko-away-${matchId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    match.homeScore = parseInt(homeScore);
    match.awayScore = parseInt(awayScore);
    match.played = true;
    match.cancelled = false;
    match.events = [];
    match.report = `🎉 ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`;
    saveToStorage();
    showToast(`Knockout result saved: ${match.home} ${match.homeScore}-${match.awayScore} ${match.away}`);
    renderKnockoutBracket();
    if (match.round === 'semi_leg1' || match.round === 'semi_leg2') checkSemiFinalsCompletion();
    if (match.round === 'final_leg1' || match.round === 'final_leg2') checkFinalCompletion();
    // Mini confetti for knockout as well
    if (typeof confetti === 'function') {
        confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 }, startVelocity: 12, colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'] });
    }
}
function showMatchCommentForKnockout(matchId) {
    const match = knockoutMatches.find(m => m.id === matchId);
    if (!match || !match.played) return;
    currentViewerFixtureId = matchId;
    document.getElementById('viewer-match-name').innerHTML = `${match.home} vs ${match.away}`;
    document.getElementById('viewer-score').innerText = `${match.homeScore} - ${match.awayScore}`;
    document.getElementById('viewer-comment').innerText = match.report || 'No report.';
    const eventsDiv = document.getElementById('viewer-events');
    const eventsContainer = document.getElementById('viewer-events-container');
    if (match.events && match.events.length) {
        eventsContainer.classList.remove('hidden');
        eventsDiv.innerHTML = match.events.map(ev => `<div>${ev.minute}′ ⚽ ${ev.team} - ${ev.player}</div>`).join('');
    } else eventsContainer.classList.add('hidden');
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
}
function editKnockoutResult(matchId) {
    if (!isAdmin) return;
    const match = knockoutMatches.find(m => m.id === matchId);
    if (!match || !match.played) return;
    pendingFixtureId = matchId;
    pendingHomeScore = match.homeScore;
    pendingAwayScore = match.awayScore;
    document.getElementById('comment-match-name').innerText = `${match.home} vs ${match.away}`;
    document.getElementById('comment-text').value = match.report || '';
    document.getElementById('comment-modal').classList.remove('hidden');
    window._editingKnockout = true;
}
const originalConfirmComment = confirmComment;
window.confirmComment = function() {
    if (window._editingKnockout && pendingFixtureId !== null) {
        const finalReport = document.getElementById('comment-text').value.trim();
        if (finalReport === "") { alert("Report cannot be empty"); return; }
        const match = knockoutMatches.find(m => m.id === pendingFixtureId);
        if (match) { match.report = finalReport; saveToStorage(); showToast("Knockout match report updated"); }
        closeCommentModal(true);
        pendingFixtureId = null;
        window._editingKnockout = false;
        renderKnockoutBracket();
        return;
    }
    originalConfirmComment();
};

// ==================== RENDER LEAGUE TABLE ====================
function renderTable() {
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    const sorted = activeTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = "";
    sorted.forEach((team, idx) => {
        const pos = idx + 1;
        let recent = team.formHistory.slice(-5);
        while (recent.length < 5) recent.unshift('-');
        const formHtml = `<div class="flex gap-1 justify-center">${recent.map(r => r === 'W' ? '<span class="w-4 h-4 bg-emerald-100 text-emerald-700 rounded-full text-[8px] font-bold flex items-center justify-center">W</span>' : r === 'L' ? '<span class="w-4 h-4 bg-rose-100 text-rose-600 rounded-full text-[8px] font-bold flex items-center justify-center">L</span>' : r === 'D' ? '<span class="w-4 h-4 bg-amber-100 text-amber-700 rounded-full text-[8px] font-bold flex items-center justify-center">D</span>' : '<span class="w-4 h-4 bg-gray-100 text-gray-400 rounded-full text-[8px] flex items-center justify-center">-</span>').join('')}</div>`;
        const penaltyBadge = team.deductedPoints > 0 ? `<span class="ml-1 text-[8px] bg-rose-50 text-rose-600 px-1 rounded-full">-${team.deductedPoints}</span>` : "";
        const actionBtn = isAdmin ? `<td class="py-2 px-1 text-center"><button onclick="event.stopPropagation(); openPenaltyModal('${team.name}')" class="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full hover:bg-amber-100">⚖️</button> <button onclick="event.stopPropagation(); relegateTeam('${team.name}')" class="text-[9px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full hover:bg-orange-100">⬇️ Relegate</button></td>` : "";
        tbody.innerHTML += `<tr class="hover:bg-gray-50 transition ${pos === 1 ? 'champions-row' : (pos > sorted.length - 2 ? 'relegation-row' : '')}" onclick="showTeamDetails('${team.name}')"><td class="py-2 px-2 text-center font-bold text-xs ${pos === 1 ? 'text-indigo-600' : ''}">${pos}</td><td class="py-2 px-2"><span class="font-semibold text-xs">${team.name}</span>${penaltyBadge}</td><td class="py-2 px-1 text-center text-xs">${team.mp}</td><td class="py-2 px-1 text-center text-emerald-600 text-xs">${team.w}</td><td class="py-2 px-1 text-center text-xs">${team.d}</td><td class="py-2 px-1 text-center text-rose-500 text-xs">${team.l}</td><td class="py-2 px-1 text-center text-xs">${team.gf}</td><td class="py-2 px-1 text-center text-xs">${team.ga}</td><td class="py-2 px-1 text-center font-mono text-xs ${team.gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${team.gd > 0 ? '+' + team.gd : team.gd}</td><td class="py-2 px-2 text-center font-black text-indigo-600 text-xs">${team.pts}</td><td class="py-2 px-2 text-center">${formHtml}</td>${actionBtn}</tr>`;
    });
    const phaseIndicator = document.getElementById('phase-indicator');
    if (phaseIndicator) phaseIndicator.innerText = tournamentPhase === 'league' ? '🏆 League Phase' : '🥇 Knockout Stage';
    generateTickerFacts();
}

// ==================== RENDER GAMEWEEK TABS ====================
function renderGameweekTabs() {
    const container = document.getElementById('gameweek-tabs');
    if (!fixtures.length) return;
    const total = Math.max(...fixtures.map(f => f.round));
    container.innerHTML = "";
    for (let r = 1; r <= total; r++) {
        const startTime = roundStartTimes[r];
        const roundFixtures = fixtures.filter(f => f.round === r && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
        const allResolved = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
        
        let statusHtml = '';
        let startBtnHtml = '';
        
        if (allResolved) {
            statusHtml = `<span class="text-[9px] font-mono text-green-600 ml-1">✅ Completed</span>`;
        } else if (startTime) {
            const deadline = startTime + 2 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            if (now < deadline) {
                const hoursLeft = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60)));
                const minutesLeft = Math.floor(((deadline - now) % (1000 * 60 * 60)) / (1000 * 60));
                statusHtml = `<span class="text-[9px] font-mono text-green-600 ml-1">⏳ ${hoursLeft}h ${minutesLeft}m</span>`;
            } else {
                statusHtml = `<span class="text-[9px] font-mono text-red-500 ml-1">⌛ Expired</span>`;
            }
        } else {
            if (isAdmin && tournamentPhase === 'league') {
                startBtnHtml = `<button onclick="startRound(${r})" class="ml-1 text-[9px] bg-green-100 text-green-700 px-1 py-0.5 rounded-full hover:bg-green-200">▶ Start</button>`;
            } else {
                statusHtml = `<span class="text-[9px] font-mono text-gray-400 ml-1">⏸ Not started</span>`;
            }
        }
        
        const active = r === currentSelectedRound;
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 text-[11px] font-mono rounded-full transition shrink-0 flex items-center gap-1 ${active ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
        btn.innerHTML = `GW ${r} ${statusHtml} ${startBtnHtml}`;
        btn.onclick = () => { currentSelectedRound = r; renderGameweekTabs(); renderFixtures(); };
        container.appendChild(btn);
    }
    if (isAdmin && tournamentPhase === 'league') {
        const shuffleBtn = document.createElement('button');
        shuffleBtn.className = 'px-3 py-1 text-[11px] font-mono rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition ml-2 shrink-0';
        shuffleBtn.innerText = '🔄 Shuffle Round';
        shuffleBtn.onclick = () => shuffleRound(currentSelectedRound);
        container.appendChild(shuffleBtn);
    }
}

// ==================== RENDER FIXTURES ====================
function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    const scheduleSection = document.getElementById('schedule-section');
    if (tournamentPhase !== 'league') {
        if (scheduleSection) scheduleSection.classList.add('hidden');
        container.innerHTML = '<div class="text-center text-gray-400 py-8">🏆 League phase completed. Knockout stage is active above.</div>';
        return;
    }
    if (scheduleSection) scheduleSection.classList.remove('hidden');
    container.innerHTML = "";

    fixtures.filter(f => f.round === currentSelectedRound && !teams[f.home]?.relegated && !teams[f.away]?.relegated).forEach(f => {
        const played = f.played;
        const cancelled = f.cancelled;
        const roundStart = roundStartTimes[f.round];
        let roundActive = false;
        let deadlineWarning = '';
        if (cancelled) {
            container.innerHTML += `<div class="bg-gray-100 p-3 rounded-xl border border-red-200"><div class="flex justify-between items-center"><span class="line-through">${f.home}</span><span class="text-red-500 text-xs">CANCELLED</span><span class="line-through">${f.away}</span></div></div>`;
            return;
        }
        if (roundStart) {
            const deadline = roundStart + 2 * 24 * 60 * 60 * 1000;
            if (Date.now() < deadline) {
                roundActive = true;
                const hoursLeft = Math.max(0, Math.floor((deadline - Date.now()) / (1000 * 60 * 60)));
                if (hoursLeft < 24) deadlineWarning = `<span class="text-amber-500 text-[9px] ml-1">⏰ ${hoursLeft}h left</span>`;
            } else {
                deadlineWarning = `<span class="text-red-500 text-[9px] ml-1">⌛ Expired</span>`;
            }
        } else {
            deadlineWarning = `<span class="text-gray-400 text-[9px] ml-1">⏸ Not started</span>`;
        }

        if (isAdmin) {
            let homeDisplay = f.home === "VACANT" ? `<span class="font-semibold text-sm text-red-500 cursor-pointer" onclick="editFixtureTeamName(${f.id}, 'home')">[VACANT]</span>` : `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'home')">${f.home}</span>`;
            let awayDisplay = f.away === "VACANT" ? `<span class="font-semibold text-sm text-red-500 cursor-pointer" onclick="editFixtureTeamName(${f.id}, 'away')">[VACANT]</span>` : `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'away')">${f.away}</span>`;
            const saveDisabled = !roundActive ? 'disabled' : '';
            const saveOpacity = !roundActive ? 'opacity-50' : '';
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full fixture-card" data-fixture-id="${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 flex items-center justify-center gap-2 text-center">${homeDisplay}</div><div class="flex items-center justify-center"><div class="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full"><input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"><span class="text-gray-400">:</span><input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"></div>${deadlineWarning}</div><div class="flex-1 flex items-center justify-center gap-2 text-center">${awayDisplay}</div></div><div class="mt-2 flex justify-center gap-1"><button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">🔄 Swap</button><button onclick="saveResult(${f.id})" class="text-[10px] font-bold ${saveOpacity} bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full hover:bg-indigo-100" ${saveDisabled}>💾 Save</button><button onclick="showMatchComment(${f.id})" class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full hover:bg-gray-200">📖</button><button onclick="openBanterModal(${f.id})" class="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded-full hover:bg-purple-100">🤣 Banter</button></div></div>`;
        } else {
            const homeName = f.home === "VACANT" ? "TBD" : f.home;
            const awayName = f.away === "VACANT" ? "TBD" : f.away;
            const predictionBtn = (!played && !roundActive) 
                ? `<span class="text-[11px] text-gray-400 px-3 py-1 rounded-full bg-gray-100">⏸ Not started</span>`
                : (played 
                    ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>`
                    : `<button onclick="openPredictionsModal(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predictions</button>`
                );
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full fixture-card" data-fixture-id="${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${homeName}</div><div class="flex justify-center">${predictionBtn}${deadlineWarning}</div><div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${awayName}</div></div><div class="mt-2 flex justify-center gap-1"><button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">📖</button><button onclick="openBanterModal(${f.id})" class="text-[11px] bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full">🤣 Banter</button></div></div>`;
        }
    });
    initSortable();
    if (window.deadlineInterval) clearInterval(window.deadlineInterval);
    window.deadlineInterval = setInterval(() => { expireOldFixtures(); renderFixtures(); }, 60000);
}
// ==================== SORTABLE (DRAG & DROP) ====================
function initSortable() {
    if (currentSortable) currentSortable.destroy();
    const container = document.getElementById('fixtures-container');
    if (!container || !isAdmin || tournamentPhase !== 'league') return;
    currentSortable = new Sortable(container, {
        animation: 150,
        handle: '.fixture-card',
        onEnd: function() {
            const newOrder = [];
            document.querySelectorAll('#fixtures-container .fixture-card').forEach(card => { newOrder.push(parseInt(card.dataset.fixtureId)); });
            const roundFixtures = fixtures.filter(f => f.round === currentSelectedRound);
            const orderedFixtures = newOrder.map(id => fixtures.find(f => f.id === id));
            let idx = 0;
            for (let f of orderedFixtures) { const globalIndex = fixtures.findIndex(x => x.id === f.id); fixtures[globalIndex] = f; }
            saveToStorage();
            renderFixtures();
        }
    });
}

// ==================== TEAM DETAILS (ADVANCED STATS) ====================
function showTeamDetails(teamName) {
    const team = teams[teamName];
    if (!team) return;
    document.getElementById('team-modal-name').innerText = team.name;
    document.getElementById('modal-mp').innerText = team.mp;
    document.getElementById('modal-pts').innerText = team.pts;
    document.getElementById('modal-w').innerText = team.w;
    document.getElementById('modal-d').innerText = team.d;
    document.getElementById('modal-l').innerText = team.l;
    document.getElementById('modal-gf').innerText = team.gf;
    document.getElementById('modal-ga').innerText = team.ga;
    const gd = team.gd;
    document.getElementById('modal-gd').innerHTML = `<span class="${gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${gd > 0 ? '+' + gd : gd}</span>`;
    document.getElementById('modal-penalty').innerText = team.deductedPoints ? `-${team.deductedPoints}` : 'None';
    let recent = team.formHistory.slice(-5);
    while (recent.length < 5) recent.unshift('-');
    document.getElementById('modal-form').innerHTML = recent.map(r => r === 'W' ? '<span class="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold flex items-center justify-center">W</span>' : r === 'L' ? '<span class="w-6 h-6 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold flex items-center justify-center">L</span>' : r === 'D' ? '<span class="w-6 h-6 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold flex items-center justify-center">D</span>' : '<span class="w-6 h-6 bg-gray-100 text-gray-400 rounded-full text-[10px] flex items-center justify-center">-</span>').join('');
    let cleanSheets = 0, homeWins=0, homeDraws=0, homeLosses=0, homeGF=0, homeGA=0, awayWins=0, awayDraws=0, awayLosses=0, awayGF=0, awayGA=0;
    fixtures.forEach(f => {
        if (!f.played) return;
        if (f.home === teamName) {
            if (f.homeScore === 0) cleanSheets++;
            if (f.homeScore > f.awayScore) homeWins++;
            else if (f.homeScore === f.awayScore) homeDraws++;
            else homeLosses++;
            homeGF += f.homeScore;
            homeGA += f.awayScore;
        }
        if (f.away === teamName) {
            if (f.awayScore === 0) cleanSheets++;
            if (f.awayScore > f.homeScore) awayWins++;
            else if (f.awayScore === f.homeScore) awayDraws++;
            else awayLosses++;
            awayGF += f.awayScore;
            awayGA += f.homeScore;
        }
    });
    const avgGF = (team.gf / (team.mp || 1)).toFixed(2);
    document.getElementById('modal-clean-sheets').innerText = cleanSheets;
    document.getElementById('modal-avg-gf').innerText = avgGF;
    document.getElementById('modal-home-record').innerHTML = `${homeWins}-${homeDraws}-${homeLosses} (GF:${homeGF} GA:${homeGA})`;
    document.getElementById('modal-away-record').innerHTML = `${awayWins}-${awayDraws}-${awayLosses} (GF:${awayGF} GA:${awayGA})`;
    const ppg = (team.pts / (team.mp || 1)).toFixed(1);
    let summary = ppg >= 2.3 ? '🔥 Title contenders!' : ppg >= 1.8 ? '👍 Solid season.' : ppg >= 1.2 ? '⚖️ Mid-table consistency.' : '⚠️ Needs improvement.';
    if (team.deductedPoints > 0) summary += ` (Includes -${team.deductedPoints} pts penalty)`;
    document.getElementById('modal-summary').innerText = summary;
    document.getElementById('team-modal').classList.remove('hidden');
}
function closeTeamModal() { document.getElementById('team-modal').classList.add('hidden'); }

// ==================== RICH MATCH REPORT & RANDOM EVENTS ====================
function generateRichReport(home, away, homeScore, awayScore, events) {
    const goalEvents = events.filter(e => e.type === 'goal');
    let report = '';
    if (homeScore === awayScore) {
        const templates = [`🤝 ${home} and ${away} shared the spoils in a ${homeScore}-${awayScore} draw.`, `⚖️ Neither side could break the deadlock – ${homeScore}-${awayScore}.`, `🔄 Points shared as ${home} ${homeScore} : ${awayScore} ${away}.`];
        report = templates[Math.floor(Math.random() * templates.length)];
    } else {
        const winner = homeScore > awayScore ? home : away;
        const loser = homeScore > awayScore ? away : home;
        const margin = Math.abs(homeScore - awayScore);
        if (margin >= 3) report = `🔥 ${winner} demolished ${loser} ${Math.max(homeScore,awayScore)}-${Math.min(homeScore,awayScore)}!`;
        else if (margin === 2) report = `📈 ${winner} secured a comfortable win over ${loser}.`;
        else report = `⚡ ${winner} edged past ${loser} in a tight contest.`;
    }
    if (goalEvents.length > 0) {
        const first = goalEvents[0];
        report += ` The opener came in the ${first.minute}′ through ${first.player} (${first.team}).`;
        if (goalEvents.length > 1) { const last = goalEvents[goalEvents.length-1]; report += ` ${last.player} sealed it at ${last.minute}′.`; }
    } else if (homeScore === 0 && awayScore === 0) { report += ` A rare goalless affair with no clear chances.`; }
    const flavours = [`${home} dominated possession but lacked precision.`, `${away} defended deep and hit on the counter.`, `The match was a midfield battle from start to finish.`, `Both goalkeepers produced world-class saves.`, `End-to-end action thrilled the crowd.`, `Set pieces proved decisive today.`];
    report += ` ${flavours[Math.floor(Math.random() * flavours.length)]}`;
    return report;
}
function generateRandomEvents(home, away, homeScore, awayScore) {
    const events = [];
    const totalGoals = homeScore + awayScore;
    const goalDistribution = [];
    for (let i = 0; i < homeScore; i++) goalDistribution.push(home);
    for (let i = 0; i < awayScore; i++) goalDistribution.push(away);
    for (let i = goalDistribution.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [goalDistribution[i], goalDistribution[j]] = [goalDistribution[j], goalDistribution[i]]; }
    let usedMinutes = new Set();
    for (let i = 0; i < goalDistribution.length; i++) {
        let minute;
        do { minute = Math.floor(Math.random() * 90) + 1; } while (usedMinutes.has(minute));
        usedMinutes.add(minute);
        events.push({ minute, type: 'goal', team: goalDistribution[i], player: `Player ${Math.floor(Math.random() * 30) + 1}` });
    }
    events.sort((a,b) => a.minute - b.minute);
    return events;
}

// ==================== SAVE RESULT (LEAGUE) ====================
function saveResult(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save match with BYE team."); return; }
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    const events = generateRandomEvents(fixture.home, fixture.away, pendingHomeScore, pendingAwayScore);
    const report = generateRichReport(fixture.home, fixture.away, pendingHomeScore, pendingAwayScore, events);
    window._pendingEvents = events;
    window._pendingReport = report;
    document.getElementById('comment-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('comment-text').value = report;
    document.getElementById('comment-modal').classList.remove('hidden');
}
function closeCommentModal(save = false) {
    document.getElementById('comment-modal').classList.add('hidden');
    if (!save) { pendingFixtureId = null; window._pendingEvents = null; window._pendingReport = null; }
}
function confirmComment() {
    if (pendingFixtureId === null) return;
    const finalReport = document.getElementById('comment-text').value.trim();
    if (finalReport === "") { alert("Report cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    fixture.report = finalReport;
    fixture.events = window._pendingEvents || [];
    if (!fixture.predictions) fixture.predictions = [];
    if (!fixture.banter) fixture.banter = [];
    updateTableCalculations();
    saveToStorage();
    showToast(`Saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`);
    // Mini confetti on every match save
    if (typeof confetti === 'function') {
        confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 }, startVelocity: 12, colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'] });
    }
    closeCommentModal(true);
    pendingFixtureId = null;
    window._pendingEvents = null;
    window._pendingReport = null;
    renderTable();
    renderFixtures();
    generateTickerFacts();
}
function showMatchComment(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f) return;
    currentViewerFixtureId = fixtureId;
    document.getElementById('viewer-match-name').innerHTML = `${f.home} vs ${f.away}`;
    document.getElementById('viewer-score').innerText = f.played ? `${f.homeScore} - ${f.awayScore}` : 'Not played yet';
    document.getElementById('viewer-comment').innerText = f.report || (f.played ? 'No report available.' : 'Match not played.');
    const eventsContainer = document.getElementById('viewer-events-container');
    const eventsDiv = document.getElementById('viewer-events');
    if (f.events && f.events.length > 0) {
        eventsContainer.classList.remove('hidden');
        eventsDiv.innerHTML = f.events.map(ev => `<div class="flex justify-between border-b border-gray-200 py-1"><span class="font-mono w-12">${ev.minute}′</span><span class="flex-1">⚽ ${ev.team} - ${ev.player}</span></div>`).join('');
    } else eventsContainer.classList.add('hidden');
    const editBtn = document.getElementById('viewer-edit-btn');
    const editEventsBtn = document.getElementById('viewer-edit-events-btn');
    if (isAdmin && f.played) { editBtn.classList.remove('hidden'); editEventsBtn.classList.remove('hidden'); }
    else { editBtn.classList.add('hidden'); editEventsBtn.classList.add('hidden'); }
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
}
function closeCommentViewer() { document.getElementById('comment-viewer-modal').classList.add('hidden'); currentViewerFixtureId = null; }
function editViewerComment() {
    if (!isAdmin || currentViewerFixtureId === null) return;
    const f = fixtures.find(f => f.id === currentViewerFixtureId);
    if (!f.played) return;
    pendingFixtureId = currentViewerFixtureId;
    pendingHomeScore = f.homeScore;
    pendingAwayScore = f.awayScore;
    document.getElementById('comment-match-name').innerText = `${f.home} vs ${f.away}`;
    document.getElementById('comment-text').value = f.report || '';
    document.getElementById('comment-modal').classList.remove('hidden');
    closeCommentViewer();
}

// ==================== EVENT EDITOR (ADMIN) ====================
function editViewerEvents() {
    if (!isAdmin || currentViewerFixtureId === null) return;
    const f = fixtures.find(f => f.id === currentViewerFixtureId);
    if (!f.played) return;
    currentEditingEventsFixture = f.id;
    pendingEvents = [...(f.events || [])];
    document.getElementById('event-match-name').innerText = `${f.home} vs ${f.away}`;
    const teamSelect = document.getElementById('new-event-team');
    teamSelect.innerHTML = `<option value="${f.home}">${f.home}</option><option value="${f.away}">${f.away}</option>`;
    renderEventsList();
    document.getElementById('event-editor-modal').classList.remove('hidden');
    closeCommentViewer();
}
function renderEventsList() {
    const container = document.getElementById('events-list-container');
    if (!container) return;
    container.innerHTML = '';
    pendingEvents.sort((a,b) => a.minute - b.minute).forEach((ev, idx) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-white p-2 rounded border';
        div.innerHTML = `<span class="font-mono w-12">${ev.minute}′</span><span class="flex-1">⚽ ${ev.team} - ${ev.player}</span><button onclick="removeEvent(${idx})" class="text-red-500 text-sm">🗑️</button>`;
        container.appendChild(div);
    });
}
function addEvent() {
    const minute = parseInt(document.getElementById('new-event-minute').value);
    const team = document.getElementById('new-event-team').value;
    const player = document.getElementById('new-event-player').value.trim();
    if (isNaN(minute) || minute < 1 || minute > 120) { alert("Minute must be 1-120"); return; }
    if (!player) { alert("Enter player name"); return; }
    pendingEvents.push({ minute, type: 'goal', team, player });
    renderEventsList();
    document.getElementById('new-event-minute').value = '';
    document.getElementById('new-event-player').value = '';
}
function removeEvent(idx) { pendingEvents.splice(idx, 1); renderEventsList(); }
function saveEventsAndClose() {
    if (currentEditingEventsFixture === null) return;
    const f = fixtures.find(f => f.id === currentEditingEventsFixture);
    f.events = pendingEvents;
    saveToStorage();
    showToast("Events updated");
    closeEventEditor();
    if (currentViewerFixtureId === currentEditingEventsFixture) showMatchComment(currentViewerFixtureId);
}
function closeEventEditor() { document.getElementById('event-editor-modal').classList.add('hidden'); currentEditingEventsFixture = null; pendingEvents = []; }

// ==================== RELEGATION (MANUAL) ====================
function relegateTeam(teamName) {
    if (!isAdmin) return;
    if (tournamentPhase !== 'league') { showToast("Cannot relegate during knockout stage."); return; }
    const team = teams[teamName];
    if (!team) return;
    if (team.relegated) { showToast(`${teamName} is already relegated.`); return; }
    if (confirm(`Relegate ${teamName}? They will be removed from all future fixtures, leaving vacant slots for you to reassign.`)) {
        team.relegated = true;
        fixtures.forEach(f => {
            if (!f.played && !f.cancelled) {
                if (f.home === teamName) { f.home = "VACANT"; f.vacantHome = true; }
                if (f.away === teamName) { f.away = "VACANT"; f.vacantAway = true; }
            }
        });
        saveToStorage();
        showToast(`${teamName} relegated. Vacant slots created in their future fixtures.`);
        updateTableCalculations();
        renderTable();
        renderGameweekTabs();
        renderFixtures();
        renderRelegatedTeams();
        generateTickerFacts();
    }
}
function restoreTeam(teamName) {
    if (!isAdmin) return;
    if (tournamentPhase !== 'league') { showToast("Cannot restore during knockout stage."); return; }
    const team = teams[teamName];
    if (!team || !team.relegated) return;
    if (confirm(`Restore ${teamName} to the league? They will reappear in the table, but future fixtures are missing. You may need to re-add them manually via "Edit Fixture".`)) {
        team.relegated = false;
        saveToStorage();
        showToast(`${teamName} restored.`);
        updateTableCalculations();
        renderTable();
        renderGameweekTabs();
        renderFixtures();
        renderRelegatedTeams();
        generateTickerFacts();
    }
}
function renderRelegatedTeams() {
    const container = document.getElementById('relegated-teams-list');
    if (!container) return;
    const relegated = Object.values(teams).filter(t => t.relegated);
    if (relegated.length === 0) { container.innerHTML = '<p class="text-sm text-gray-400 italic">No relegated teams</p>'; return; }
    container.innerHTML = relegated.map(team => `<div class="bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-2"><span class="text-sm font-medium text-red-700">${team.name}</span><button onclick="restoreTeam('${team.name}')" class="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-0.5 rounded-full">↺ Restore</button></div>`).join('');
}

// ==================== PREDICTIONS ====================
function openPredictionsModal(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f) return;
    currentPredictionFixtureId = fixtureId;
    document.getElementById('prediction-match-name').innerText = `${f.home} vs ${f.away}`;
    document.getElementById('prediction-nickname').value = '';
    document.getElementById('prediction-home-score').value = '';
    document.getElementById('prediction-away-score').value = '';
    document.getElementById('predictions-list').innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Loading predictions...</div>';
    document.getElementById('predictions-modal').classList.remove('hidden');
    renderPredictions(fixtureId);
}
function closePredictionsModal() { document.getElementById('predictions-modal').classList.add('hidden'); currentPredictionFixtureId = null; }
function renderPredictions(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    const container = document.getElementById('predictions-list');
    if (!f.predictions || f.predictions.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">🤔 No predictions yet. Be the first!</div>'; return; }
    container.innerHTML = '';
    [...f.predictions].reverse().forEach((pred, idx) => {
        const originalIdx = f.predictions.length - 1 - idx;
        const date = new Date(pred.timestamp).toLocaleString();
        const deleteBtn = isAdmin ? `<button onclick="deletePrediction(${fixtureId}, ${originalIdx})" class="prediction-delete-btn text-xs text-rose-500 hover:text-rose-700 ml-2">🗑️</button>` : '';
        container.innerHTML += `<div class="prediction-item"><div class="flex justify-between items-start"><div class="flex-1"><div class="flex items-center gap-2 flex-wrap"><span class="font-semibold text-sm text-gray-800">${escapeHtml(pred.nickname || 'Anonymous')}</span><span class="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${pred.homeScore} - ${pred.awayScore}</span></div><p class="text-[10px] text-gray-400 mt-1">${date}</p></div>${deleteBtn}</div></div>`;
    });
}
function submitPrediction() {
    if (!currentPredictionFixtureId) return;
    const nickname = document.getElementById('prediction-nickname').value.trim();
    const homeScore = parseInt(document.getElementById('prediction-home-score').value);
    const awayScore = parseInt(document.getElementById('prediction-away-score').value);
    if (isNaN(homeScore) || isNaN(awayScore)) { alert("Please enter valid scores."); return; }
    if (nickname === "") { alert("Please enter your name."); return; }
    const f = fixtures.find(f => f.id === currentPredictionFixtureId);
    if (!f) return;
    if (!f.predictions) f.predictions = [];
    f.predictions.push({ nickname: nickname.slice(0,20), homeScore, awayScore, timestamp: Date.now() });
    saveToStorage();
    renderPredictions(currentPredictionFixtureId);
    document.getElementById('prediction-nickname').value = '';
    document.getElementById('prediction-home-score').value = '';
    document.getElementById('prediction-away-score').value = '';
    showToast("Prediction submitted!");
}
function deletePrediction(fixtureId, index) {
    if (!isAdmin) return;
    const f = fixtures.find(f => f.id === fixtureId);
    if (f && f.predictions && f.predictions[index]) { f.predictions.splice(index,1); saveToStorage(); renderPredictions(fixtureId); showToast("Prediction deleted"); }
}

function toggleAutoStart() {
    if (!isAdmin) return;
    autoStartNextRound = !autoStartNextRound;
    const btn = document.getElementById('auto-start-toggle');
    const dot = document.getElementById('auto-start-dot');
    if (autoStartNextRound) {
        btn.classList.replace('bg-gray-300', 'bg-indigo-600');
        dot.classList.replace('translate-x-0', 'translate-x-4');
        showToast("Auto‑start enabled");
    } else {
        btn.classList.replace('bg-indigo-600', 'bg-gray-300');
        dot.classList.replace('translate-x-4', 'translate-x-0');
        showToast("Auto‑start disabled");
    }
    saveToStorage();
}

// ==================== BANTER (WHATSAPP STYLE) ====================
function openBanterModal(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f) return;
    currentBanterFixtureId = fixtureId;
    document.getElementById('banter-match-name').innerText = `${f.home} vs ${f.away}`;
    document.getElementById('banter-messages-container').innerHTML = '<div class="text-center text-gray-400 text-sm">Loading banter...</div>';
    document.getElementById('banter-input').value = '';
    document.getElementById('banter-modal').classList.remove('hidden');
    renderBanterMessages(fixtureId);
}
function closeBanterModal() { document.getElementById('banter-modal').classList.add('hidden'); currentBanterFixtureId = null; }
function renderBanterMessages(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    const container = document.getElementById('banter-messages-container');
    if (!f.banter || f.banter.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 text-sm py-8">😴 No banter yet. Be the first!</div>'; return; }
    container.innerHTML = '';
    f.banter.forEach((msg, idx) => {
        const date = new Date(msg.timestamp).toLocaleString();
        const isSent = (msg.author === 'Fan');
        const bubbleClass = isSent ? 'sent' : 'received';
        const deleteBtn = isAdmin ? `<button onclick="deleteBanter(${fixtureId}, ${idx})" class="banter-delete-btn" title="Delete">🗑️</button>` : '';
        container.innerHTML += `<div class="banter-message ${bubbleClass}" style="position: relative;"><div class="bubble">${deleteBtn}<p>${escapeHtml(msg.text)}</p><div class="message-meta"><span class="message-author">${escapeHtml(msg.author || 'Fan')}</span><span class="message-time">${date}</span></div></div></div>`;
    });
    container.scrollTop = container.scrollHeight;
}
function postBanter() {
    if (!currentBanterFixtureId) return;
    const input = document.getElementById('banter-input');
    const text = input.value.trim();
    if (text === "") { alert("Write something funny!"); return; }
    const f = fixtures.find(f => f.id === currentBanterFixtureId);
    if (!f) return;
    if (!f.banter) f.banter = [];
    f.banter.push({ text: text.slice(0,200), timestamp: Date.now(), author: "Fan" });
    saveToStorage();
    input.value = '';
    renderBanterMessages(currentBanterFixtureId);
    showToast("Banter posted!");
}
function deleteBanter(fixtureId, index) {
    if (!isAdmin) return;
    const f = fixtures.find(f => f.id === fixtureId);
    if (f && f.banter && f.banter[index]) { f.banter.splice(index,1); saveToStorage(); renderBanterMessages(fixtureId); showToast("Banter deleted"); }
}
function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m)); }

// ==================== DEADLINE CLOCK ====================
function updateDeadlineClock() {
    const now = Date.now();
    let nearestDeadline = Infinity;
    fixtures.forEach(f => {
        if (!f.played && !f.cancelled) {
            const startTime = roundStartTimes[f.round];
            if (startTime) {
                const deadline = startTime + 2 * 24 * 60 * 60 * 1000;
                if (deadline > now && deadline < nearestDeadline) nearestDeadline = deadline;
            }
        }
    });
    if (nearestDeadline === Infinity) { document.getElementById('next-deadline-countdown').innerText = 'No active'; return; }
    const diff = nearestDeadline - now;
    const hours = Math.floor(diff / (1000*60*60));
    const minutes = Math.floor((diff % (1000*60*60)) / (1000*60));
    document.getElementById('next-deadline-countdown').innerText = `${hours}h ${minutes}m`;
}
function startDeadlineClock() {
    updateDeadlineClock();
    if (window.deadlineClockInterval) clearInterval(window.deadlineClockInterval);
    window.deadlineClockInterval = setInterval(updateDeadlineClock, 60000);
}
// ==================== RESET ====================
function resetTournament() { if (confirm("Wipe ALL data? This cannot be undone.")) db.ref('tournament_data').remove().then(() => location.reload()); }
// ==================== INIT ====================
window.onload = () => { initRealtimeDatabaseSync(); };

// ==================== EXPOSE FUNCTIONS ====================
window.handleAdminToggleClick = handleAdminToggleClick;
window.verifyAdminPassword = verifyAdminPassword;
window.closePasswordModal = closePasswordModal;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.updateMasterPassword = updateMasterPassword;
window.openPenaltyModal = openPenaltyModal;
window.closePenaltyModal = closePenaltyModal;
window.adjustPenalty = adjustPenalty;
window.clearPenaltyPoints = clearPenaltyPoints;
window.generateTeamInputs = generateTeamInputs;
window.initializeTournament = initializeTournament;
window.shuffleRound = shuffleRound;
window.swapFixture = swapFixture;
window.editFixtureTeamName = editFixtureTeamName;
window.closeTeamSelectModal = closeTeamSelectModal;
window.confirmTeamSelection = confirmTeamSelection;
window.saveResult = saveResult;
window.closeCommentModal = closeCommentModal;
window.confirmComment = confirmComment;
window.showMatchComment = showMatchComment;
window.closeCommentViewer = closeCommentViewer;
window.editViewerComment = editViewerComment;
window.editViewerEvents = editViewerEvents;
window.addEvent = addEvent;
window.removeEvent = removeEvent;
window.saveEventsAndClose = saveEventsAndClose;
window.closeEventEditor = closeEventEditor;
window.openPredictionsModal = openPredictionsModal;
window.closePredictionsModal = closePredictionsModal;
window.submitPrediction = submitPrediction;
window.deletePrediction = deletePrediction;
window.openBanterModal = openBanterModal;
window.closeBanterModal = closeBanterModal;
window.postBanter = postBanter;
window.deleteBanter = deleteBanter;
window.relegateTeam = relegateTeam;
window.restoreTeam = restoreTeam;
window.showTeamDetails = showTeamDetails;
window.closeTeamModal = closeTeamModal;
window.resetTournament = resetTournament;
window.saveKnockoutResult = saveKnockoutResult;
window.showMatchCommentForKnockout = showMatchCommentForKnockout;
window.editKnockoutResult = editKnockoutResult;
window.startRound = startRound;
