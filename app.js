// ======================= FIREBASE CONFIGURATION =======================
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

// ======================= GLOBAL VARIABLES =======================
let teams = {};
let fixtures = [];
let currentSelectedRound = 1;
let isAdmin = false;
let tournamentPassword = "";
let tickerInterval = null;
let currentTickerFactIndex = 0;
let tickerFacts = [];
let activePredictorFixtureId = null;
let currentPredictionFixtureId = null;
let pendingFixtureId = null;
let pendingHomeScore = null;
let pendingAwayScore = null;
let currentPenaltyTeam = null;
let pendingAssignFixtureId = null;
let pendingAssignSide = null;
let currentViewerFixtureId = null;
let currentBanterFixtureId = null;

// ======================= HELPER FUNCTIONS =======================
function showToast(msg) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function saveToStorage() {
    db.ref('tournament_data').set({ teams, fixtures, password: tournamentPassword });
}

// ======================= DATABASE SYNC =======================
function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.teams && data.fixtures) {
            if (data.password) tournamentPassword = data.password;
            teams = data.teams;
            fixtures = data.fixtures;
            document.getElementById('setup-section')?.classList.add('hidden');
            document.getElementById('dashboard-section')?.classList.remove('hidden');
            document.getElementById('admin-toggle-container')?.classList.remove('hidden');
            updateTableCalculations();
            renderTable();
            renderGameweekTabs();
            renderFixtures();
            generateTickerFacts();
            document.title = `DLS | ${Object.keys(teams).length} teams • Live`;
        } else {
            tournamentPassword = "1234";
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            const tickerEl = document.getElementById('news-ticker');
            if (tickerEl) tickerEl.innerHTML = "⚽ Ready to create your league";
        }
    }, (error) => { showToast("Firebase connection issue"); });
}

// ======================= ROTATING TICKER =======================
function updateTickerFacts() {
    if (!tickerFacts.length) return;
    const tickerEl = document.getElementById('news-ticker');
    if (!tickerEl) return;
    tickerEl.classList.add('slide-out');
    setTimeout(() => {
        currentTickerFactIndex = (currentTickerFactIndex + 1) % tickerFacts.length;
        const fact = tickerFacts[currentTickerFactIndex];
        tickerEl.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> ${fact}</span>`;
        tickerEl.classList.remove('slide-out');
        tickerEl.classList.add('slide-in');
        setTimeout(() => tickerEl.classList.remove('slide-in'), 500);
    }, 500);
}

function generateTickerFacts() {
    const totalTeams = Object.keys(teams).length;
    const totalMatchesPlayed = fixtures.filter(f => f.played).length;
    const totalMatches = fixtures.length;
    let leader = null;
    let topScorer = null;
    let biggestWin = null;
    if (totalTeams) {
        const sorted = Object.values(teams).sort((a, b) => b.pts - a.pts || b.gd - a.gd);
        if (sorted.length) leader = sorted[0];
        const sortedGF = Object.values(teams).sort((a, b) => b.gf - a.gf);
        if (sortedGF.length) topScorer = sortedGF[0];
    }
    fixtures.forEach(f => {
        if (f.played && f.homeScore !== null) {
            const total = f.homeScore + f.awayScore;
            if (!biggestWin || total > biggestWin.total) {
                biggestWin = { home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore, total };
            }
        }
    });
    tickerFacts = [
        `🏆 DLS Vawulence Academy Tournament Hub`,
        `⚽ ${totalTeams} teams competing`,
        `📊 ${totalMatchesPlayed}/${totalMatches} matches played`,
        leader ? `👑 Leader: ${leader.name} (${leader.pts} pts)` : null,
        topScorer ? `🔥 Top scorer: ${topScorer.name} (${topScorer.gf} goals)` : null,
        biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore}-${biggestWin.awayScore} ${biggestWin.away}` : null,
        `🔮 Click 'Predict' on any fixture to see impact`
    ].filter(f => f);
    if (tickerFacts.length) {
        const tickerEl = document.getElementById('news-ticker');
        if (tickerEl) tickerEl.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> ${tickerFacts[0]}</span>`;
        currentTickerFactIndex = 0;
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateTickerFacts, 6000);
    }
}

// ======================= ADMIN MODE TOGGLE =======================
function handleAdminToggleClick() {
    if (!isAdmin) {
        document.getElementById('admin-password-input').value = "";
        document.getElementById('password-error').classList.add('hidden');
        document.getElementById('password-modal').classList.remove('hidden');
    } else deactivateAdminMode();
}
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }
function verifyAdminPassword() {
    const inputVal = document.getElementById('admin-password-input').value;
    if (inputVal === tournamentPassword) { closePasswordModal(); activateAdminMode(); }
    else document.getElementById('password-error').classList.remove('hidden');
}
function activateAdminMode() { isAdmin = true; updateAdminUIElements(); showToast("Admin mode ACTIVE"); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); showToast("Admin mode deactivated"); }
function updateAdminUIElements() {
    const btn = document.getElementById('admin-btn');
    const dot = document.getElementById('admin-btn-dot');
    const statusText = document.getElementById('admin-status-text');
    const resetContainer = document.getElementById('admin-reset-container');
    const thActions = document.getElementById('th-admin-actions');
    const hint = document.getElementById('admin-table-hint');
    if (isAdmin) {
        btn?.classList.replace('bg-gray-300', 'bg-indigo-600');
        dot?.classList.replace('translate-x-0', 'translate-x-5');
        if (statusText) { statusText.innerText = "⚡ ADMIN MODE"; statusText.classList.replace('text-gray-600', 'text-indigo-600'); }
        if (resetContainer) resetContainer.classList.remove('hidden');
        if (thActions) thActions.classList.remove('hidden');
        if (hint) hint.classList.remove('hidden');
    } else {
        btn?.classList.replace('bg-indigo-600', 'bg-gray-300');
        dot?.classList.replace('translate-x-5', 'translate-x-0');
        if (statusText) { statusText.innerText = "🔒 READ ONLY"; statusText.classList.replace('text-indigo-600', 'text-gray-600'); }
        if (resetContainer) resetContainer.classList.add('hidden');
        if (thActions) thActions.classList.add('hidden');
        if (hint) hint.classList.add('hidden');
    }
    renderTable();
    renderGameweekTabs();
    renderFixtures();
}

// ======================= CHANGE MASTER PASSWORD =======================
function openChangePasswordModal() {
    if (!isAdmin) return;
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('password-match-error').classList.add('hidden');
    document.getElementById('change-password-modal').classList.remove('hidden');
}
function closeChangePasswordModal() { document.getElementById('change-password-modal').classList.add('hidden'); }
function updateMasterPassword() {
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    if (!newPass) { showToast('Password cannot be empty'); return; }
    if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; }
    tournamentPassword = newPass;
    saveToStorage();
    showToast('Master password updated!');
    closeChangePasswordModal();
}

// ======================= PENALTY MANAGEMENT =======================
function openPenaltyModal(teamName) {
    if (!isAdmin) return;
    currentPenaltyTeam = teamName;
    document.getElementById('penalty-team-name').innerText = teamName;
    document.getElementById('penalty-modal').classList.remove('hidden');
}
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); currentPenaltyTeam = null; }
function clearPenaltyPoints() {
    if (!currentPenaltyTeam) return;
    const team = teams[currentPenaltyTeam];
    if (!team) return;
    if (team.deductedPoints === 0) { showToast(`${currentPenaltyTeam} has no penalty points.`); closePenaltyModal(); return; }
    team.deductedPoints = 0;
    saveToStorage();
    showToast(`Cleared penalty for ${currentPenaltyTeam}`);
    renderTable();
    closePenaltyModal();
}

// ======================= TOURNAMENT SETUP =======================
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter 2-20 teams"); return; }
    const container = document.getElementById('team-inputs-container');
    container.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `<div class="bg-gray-50 p-3 rounded-xl border border-gray-200"><div class="flex items-center gap-2"><span class="bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${i}</span><input type="text" id="team-input-${i}" placeholder="Club name" class="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm"></div></div>`;
    }
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
}

function initializeTournament() {
    const count = parseInt(document.getElementById('team-count').value);
    const pass = document.getElementById('tournament-password').value.trim();
    if (pass) tournamentPassword = pass;
    let list = [];
    for (let i = 1; i <= count; i++) {
        let name = document.getElementById(`team-input-${i}`).value.trim();
        if (name === "") name = `Team ${i}`;
        list.push({ name });
    }
    if (list.length % 2 !== 0) list.push({ name: "BYE" });
    teams = {};
    list.forEach(item => {
        if (item.name !== "BYE") {
            teams[item.name] = {
                name: item.name,
                mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0,
                deductedPoints: 0,
                formHistory: []
            };
        }
    });
    fixtures = [];
    const n = list.length;
    const rounds = n - 1;
    for (let r = 0; r < rounds; r++) {
        for (let m = 0; m < n / 2; m++) {
            let homeIdx = (r + m) % (n - 1);
            let awayIdx = (n - 1 - m + r) % (n - 1);
            if (m === 0) awayIdx = n - 1;
            if (list[homeIdx].name !== "BYE" && list[awayIdx].name !== "BYE") {
                fixtures.push({
                    id: fixtures.length,
                    round: r + 1,
                    home: list[homeIdx].name,
                    away: list[awayIdx].name,
                    homeScore: null,
                    awayScore: null,
                    played: false,
                    comment: null
                });
            }
        }
    }
    currentSelectedRound = 1;
    saveToStorage();
    showToast("Tournament launched!");
}

// ======================= FIXTURE ACTIONS =======================
function shuffleRound(roundNumber) {
    if (!isAdmin) return;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    if (!roundFixtures.length) return;
    const teamsInRound = [];
    roundFixtures.forEach(f => {
        if (f.home !== 'BYE') teamsInRound.push(f.home);
        if (f.away !== 'BYE') teamsInRound.push(f.away);
    });
    let uniqueTeams = [...new Set(teamsInRound)];
    for (let i = uniqueTeams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [uniqueTeams[i], uniqueTeams[j]] = [uniqueTeams[j], uniqueTeams[i]];
    }
    const newPairs = [];
    for (let i = 0; i < uniqueTeams.length; i += 2) {
        if (i + 1 < uniqueTeams.length) {
            if (Math.random() < 0.5) newPairs.push({ home: uniqueTeams[i], away: uniqueTeams[i + 1] });
            else newPairs.push({ home: uniqueTeams[i + 1], away: uniqueTeams[i] });
        }
    }
    roundFixtures.forEach((f, idx) => {
        if (idx < newPairs.length) {
            f.home = newPairs[idx].home;
            f.away = newPairs[idx].away;
            f.homeScore = null;
            f.awayScore = null;
            f.played = false;
            f.comment = null;
        }
    });
    saveToStorage();
    showToast(`Round ${roundNumber} shuffled!`);
    renderGameweekTabs();
    renderFixtures();
    renderTable();
    generateTickerFacts();
}

function swapFixture(fixtureId) {
    if (!isAdmin) return;
    const f = fixtures.find(f => f.id === fixtureId);
    [f.home, f.away] = [f.away, f.home];
    f.homeScore = null;
    f.awayScore = null;
    f.played = false;
    f.comment = null;
    saveToStorage();
    showToast(`Swapped ${f.home} vs ${f.away}`);
    renderFixtures();
    renderTable();
    generateTickerFacts();
}

function editFixtureTeamName(fixtureId, side) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    const dropdown = document.getElementById('team-select-dropdown');
    dropdown.innerHTML = '<option value="">— Cancel / No change —</option>';
    const otherSide = side === 'home' ? fixture.away : fixture.home;
    Object.keys(teams).sort().forEach(name => {
        if (name !== otherSide) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            dropdown.appendChild(opt);
        }
    });
    const byeOpt = document.createElement('option');
    byeOpt.value = 'BYE_REMOVE';
    byeOpt.textContent = '— Remove team (set to BYE) —';
    dropdown.appendChild(byeOpt);
    pendingAssignFixtureId = fixtureId;
    pendingAssignSide = side;
    document.getElementById('team-select-modal').classList.remove('hidden');
}

function closeTeamSelectModal() {
    document.getElementById('team-select-modal').classList.add('hidden');
    pendingAssignFixtureId = null;
    pendingAssignSide = null;
}

function confirmTeamSelection() {
    if (pendingAssignFixtureId === null) return;
    const selected = document.getElementById('team-select-dropdown').value;
    if (selected === '') { closeTeamSelectModal(); return; }
    const fixture = fixtures.find(f => f.id === pendingAssignFixtureId);
    const side = pendingAssignSide;
    if (selected === 'BYE_REMOVE') {
        if (side === 'home') fixture.home = 'BYE';
        else fixture.away = 'BYE';
        fixture.homeScore = null;
        fixture.awayScore = null;
        fixture.played = false;
        fixture.comment = null;
        saveToStorage();
        showToast(`Removed team, set to BYE`);
        renderFixtures();
        renderTable();
        generateTickerFacts();
        closeTeamSelectModal();
        return;
    }
    const newTeam = selected;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    const round = fixture.round;
    const otherFixtures = fixtures.filter(f => f.round === round && f.id !== fixture.id);
    if (otherFixtures.some(f => f.home === newTeam || f.away === newTeam)) {
        showToast(`Team "${newTeam}" already has fixture this round!`);
        closeTeamSelectModal();
        return;
    }
    if (side === 'home') fixture.home = newTeam;
    else fixture.away = newTeam;
    fixture.homeScore = null;
    fixture.awayScore = null;
    fixture.played = false;
    fixture.comment = null;
    saveToStorage();
    showToast(`Assigned ${newTeam} to ${side}`);
    renderFixtures();
    renderTable();
    generateTickerFacts();
    closeTeamSelectModal();
}

// ======================= STANDINGS CALCULATIONS =======================
function updateTableCalculations() {
    for (let t in teams) {
        teams[t] = { ...teams[t], mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, formHistory: [] };
    }
    fixtures.sort((a, b) => a.round - b.round).forEach(f => {
        if (f.played && teams[f.home] && teams[f.away]) {
            const h = f.home, a = f.away, hS = parseInt(f.homeScore), aS = parseInt(f.awayScore);
            teams[h].mp++; teams[a].mp++;
            teams[h].gf += hS; teams[h].ga += aS;
            teams[a].gf += aS; teams[a].ga += hS;
            if (hS > aS) {
                teams[h].w++; teams[h].pts += 3; teams[a].l++;
                teams[h].formHistory.push('W'); teams[a].formHistory.push('L');
            } else if (aS > hS) {
                teams[a].w++; teams[a].pts += 3; teams[h].l++;
                teams[h].formHistory.push('L'); teams[a].formHistory.push('W');
            } else {
                teams[h].d++; teams[h].pts += 1; teams[a].d++; teams[a].pts += 1;
                teams[h].formHistory.push('D'); teams[a].formHistory.push('D');
            }
            if (teams[h].formHistory.length > 10) teams[h].formHistory.shift();
            if (teams[a].formHistory.length > 10) teams[a].formHistory.shift();
        }
    });
    for (let t in teams) {
        teams[t].pts = Math.max(0, teams[t].pts - (teams[t].deductedPoints || 0));
        teams[t].gd = teams[t].gf - teams[t].ga;
    }
}

function renderTable() {
    const sorted = Object.values(teams).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = "";
    sorted.forEach((team, idx) => {
        const pos = idx + 1;
        let recent = team.formHistory.slice(-5);
        while (recent.length < 5) recent.unshift('-');
        const formHtml = `<div class="flex gap-1 justify-center">${recent.map(res => res === 'W' ? '<span class="w-4 h-4 bg-emerald-100 text-emerald-700 rounded-full text-[8px] font-bold flex items-center justify-center">W</span>' : res === 'L' ? '<span class="w-4 h-4 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-[8px] font-bold">L</span>' : res === 'D' ? '<span class="w-4 h-4 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-[8px] font-bold">D</span>' : '<span class="w-4 h-4 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-[8px]">-</span>').join('')}</div>`;
        const penaltyBadge = team.deductedPoints > 0 ? `<span class="ml-1 text-[8px] bg-rose-50 text-rose-600 px-1 rounded-full">-${team.deductedPoints}</span>` : "";
        const actionBtn = isAdmin ? `<td class="py-2 px-1 text-center"><button onclick="event.stopPropagation(); openPenaltyModal('${team.name}')" class="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full hover:bg-amber-100">⚖️</button> <button onclick="event.stopPropagation(); removeTeamFromLeague('${team.name}')" class="text-[9px] bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded-full hover:bg-rose-100">🗑️</button></td>` : "";
        tbody.innerHTML += `<tr class="hover:bg-gray-50 transition ${pos === 1 ? 'champions-row' : (pos > sorted.length - 2 ? 'relegation-row' : '')}" onclick="showTeamDetails('${team.name}')">
            <td class="py-2 px-2 text-center font-bold text-xs ${pos === 1 ? 'text-indigo-600' : ''}">${pos}</td>
            <td class="py-2 px-2"><span class="font-semibold text-xs">${team.name}</span>${penaltyBadge}</td>
            <td class="py-2 px-1 text-center text-xs">${team.mp}</td>
            <td class="py-2 px-1 text-center text-emerald-600 text-xs">${team.w}</td>
            <td class="py-2 px-1 text-center text-xs">${team.d}</td>
            <td class="py-2 px-1 text-center text-rose-500 text-xs">${team.l}</td>
            <td class="py-2 px-1 text-center text-xs">${team.gf}</td>
            <td class="py-2 px-1 text-center text-xs">${team.ga}</td>
            <td class="py-2 px-1 text-center font-mono text-xs ${team.gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${team.gd > 0 ? '+' + team.gd : team.gd}</td>
            <td class="py-2 px-2 text-center font-black text-indigo-600 text-xs">${team.pts}</td>
            <td class="py-2 px-2 text-center">${formHtml}</td>
            ${actionBtn}
        </tr>`;
    });
    generateTickerFacts();
}

function openBanterModal(fixtureId) {
    currentBanterFixtureId = fixtureId;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    document.getElementById('banter-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('banter-messages-container').innerHTML = '<div class="text-center text-gray-400 text-sm">Loading banter...</div>';
    document.getElementById('banter-input').value = '';
    document.getElementById('banter-modal').classList.remove('hidden');
    renderBanterMessages(fixtureId);
}

function closeBanterModal() {
    document.getElementById('banter-modal').classList.add('hidden');
    currentBanterFixtureId = null;
}

function renderBanterMessages(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    const container = document.getElementById('banter-messages-container');
    if (!fixture.banter || fixture.banter.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">😴 No banter yet. Be the first!</div>';
        return;
    }
    container.innerHTML = '';
    // Display messages newest first
    [...fixture.banter].reverse().forEach((msg, idx) => {
        const originalIdx = fixture.banter.length - 1 - idx;
        const date = new Date(msg.timestamp).toLocaleString();
        const deleteBtn = isAdmin ? `<button onclick="deleteBanter(${fixtureId}, ${originalIdx})" class="banter-delete-btn text-xs text-rose-500 hover:text-rose-700 ml-2">🗑️</button>` : '';
        container.innerHTML += `
            <div class="banter-message">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <p class="text-sm text-gray-800">${escapeHtml(msg.text)}</p>
                        <p class="text-[10px] text-gray-400 mt-1">${msg.author || 'Fan'} • ${date}</p>
                    </div>
                    ${deleteBtn}
                </div>
            </div>
        `;
    });
}

function postBanter() {
    if (!currentBanterFixtureId) return;
    const input = document.getElementById('banter-input');
    const text = input.value.trim();
    if (text === "") {
        alert("Write something funny!");
        return;
    }
    const fixture = fixtures.find(f => f.id === currentBanterFixtureId);
    if (!fixture) return;
    if (!fixture.banter) fixture.banter = [];
    fixture.banter.push({
        text: text,
        timestamp: Date.now(),
        author: "Fan" // Could be enhanced with user input later
    });
    saveToStorage();
    input.value = '';
    renderBanterMessages(currentBanterFixtureId);
    showToast("Banter posted!");
}

function deleteBanter(fixtureId, index) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture && fixture.banter && fixture.banter[index]) {
        fixture.banter.splice(index, 1);
        saveToStorage();
        renderBanterMessages(fixtureId);
        showToast("Banter deleted");
    }
}

// Simple escape to prevent XSS
function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

function renderGameweekTabs() {
    const container = document.getElementById('gameweek-tabs');
    if (!fixtures.length) return;
    const total = Math.max(...fixtures.map(f => f.round));
    container.innerHTML = "";
    for (let r = 1; r <= total; r++) {
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 text-[11px] font-mono rounded-full transition shrink-0 ${r === currentSelectedRound ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
        btn.innerText = `GW ${r}`;
        btn.onclick = () => { currentSelectedRound = r; renderGameweekTabs(); renderFixtures(); };
        container.appendChild(btn);
    }
    if (isAdmin) {
        const shuffleBtn = document.createElement('button');
        shuffleBtn.className = 'px-3 py-1 text-[11px] font-mono rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition ml-2 shrink-0';
        shuffleBtn.innerText = '🔄 Shuffle Round';
        shuffleBtn.onclick = () => shuffleRound(currentSelectedRound);
        container.appendChild(shuffleBtn);
    }
}

function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    container.innerHTML = "";
    fixtures.filter(f => f.round === currentSelectedRound).forEach(f => {
        const played = f.played;
        if (isAdmin) {
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div class="flex-1 flex items-center justify-center gap-2 text-center">
                        <span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'home')">${f.home}</span>
                    </div>
                    <div class="flex items-center justify-center">
                        <div class="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
                            <input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm">
                            <span class="text-gray-400">:</span>
                            <input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm">
                        </div>
                    </div>
                    <div class="flex-1 flex items-center justify-center gap-2 text-center">
                        <span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'away')">${f.away}</span>
                    </div>
                </div>
                <div class="mt-2 flex justify-center gap-1 flex-wrap">
                    <button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">🔄 Swap</button>
                    <button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full hover:bg-indigo-100">💾 Save</button>
                    <button onclick="showMatchComment(${f.id})" class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full hover:bg-gray-200">💬</button>
                    <button onclick="openBanterModal(${f.id})" class="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded-full hover:bg-purple-100">🤣 Banter</button>
                </div>
            </div>`;
       } else {
    container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${f.home}</div>
            <div class="flex justify-center">
                ${played ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="openPredictionsModal(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predictions</button>`}
            </div>
            <div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${f.away}</div>
        </div>
        <div class="mt-2 flex justify-center gap-1">
            <button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">💬</button>
            <button onclick="openBanterModal(${f.id})" class="text-[11px] bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full">🤣 Banter</button>
        </div>
    </div>`;
}
    });
}

// ======================= MATCH COMMENTS & RESULTS =======================
function generateMatchComment(home, away, hS, aS) {
    const winner = hS > aS ? home : away;
    const loser = hS > aS ? away : home;
    const margin = Math.abs(hS - aS);
    let comment = "";
    if (hS === aS) comment = hS === 0 ? `🤝 Goalless stalemate between ${home} and ${away}.` : `⚖️ ${home} ${hS}-${aS} ${away} – honours shared.`;
    else if (margin >= 3) comment = `🔥 ${winner} destroyed ${loser} ${Math.max(hS, aS)}-${Math.min(hS, aS)}!`;
    else if (margin === 2) comment = `📈 ${winner} secured a comfortable win over ${loser}.`;
    else comment = `⚡ Narrow victory! ${winner} edged past ${loser}.`;
    const flavours = ["dominated possession", "clinical finishing", "strong defensive display", "counter-attacking masterclass"];
    comment += ` ${winner} showed ${flavours[Math.floor(Math.random() * flavours.length)]}.`;
    return comment;
}

function saveResult(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save match with BYE team."); return; }
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    document.getElementById('comment-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('comment-text').value = generateMatchComment(fixture.home, fixture.away, pendingHomeScore, pendingAwayScore);
    document.getElementById('comment-modal').classList.remove('hidden');
}

function closeCommentModal(save = false) {
    document.getElementById('comment-modal').classList.add('hidden');
    if (!save) pendingFixtureId = null;
}

function confirmComment() {
    if (pendingFixtureId === null) return;
    const comment = document.getElementById('comment-text').value.trim();
    if (!comment) { alert("Comment cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    fixture.comment = comment;
    saveToStorage();
    showToast(`Saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`);
    closeCommentModal(true);
    pendingFixtureId = null;
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
    document.getElementById('viewer-comment').innerText = f.comment || (f.played ? 'No comment.' : 'Match not played.');
    const editBtn = document.getElementById('viewer-edit-btn');
    if (isAdmin && f.played) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
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
    document.getElementById('comment-text').value = f.comment || '';
    document.getElementById('comment-modal').classList.remove('hidden');
    closeCommentViewer();
}

// ======================= PREDICTOR =======================


function openPredictionsModal(fixtureId) {
    currentPredictionFixtureId = fixtureId;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    document.getElementById('prediction-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('prediction-nickname').value = '';
    document.getElementById('prediction-home-score').value = '';
    document.getElementById('prediction-away-score').value = '';
    document.getElementById('predictions-list').innerHTML = '<div class="text-center text-gray-400 text-sm py-4">Loading predictions...</div>';
    document.getElementById('predictor-modal').classList.remove('hidden');
    renderPredictions(fixtureId);
}

function closePredictionsModal() {
    document.getElementById('predictor-modal').classList.add('hidden');
    currentPredictionFixtureId = null;
}

function renderPredictions(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    const container = document.getElementById('predictions-list');
    if (!fixture.predictions || fixture.predictions.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">🤔 No predictions yet. Be the first!</div>';
        return;
    }
    container.innerHTML = '';
    // Show newest first
    [...fixture.predictions].reverse().forEach((pred, idx) => {
        const originalIdx = fixture.predictions.length - 1 - idx;
        const date = new Date(pred.timestamp).toLocaleString();
        const deleteBtn = isAdmin ? `<button onclick="deletePrediction(${fixtureId}, ${originalIdx})" class="prediction-delete-btn text-xs text-rose-500 hover:text-rose-700 ml-2">🗑️</button>` : '';
        container.innerHTML += `
            <div class="prediction-item">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-semibold text-sm text-gray-800">${escapeHtml(pred.nickname || 'Anonymous')}</span>
                            <span class="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">${pred.homeScore} - ${pred.awayScore}</span>
                        </div>
                        <p class="text-[10px] text-gray-400 mt-1">${date}</p>
                    </div>
                    ${deleteBtn}
                </div>
            </div>
        `;
    });
}

function submitPrediction() {
    if (!currentPredictionFixtureId) return;
    const nickname = document.getElementById('prediction-nickname').value.trim();
    const homeScore = parseInt(document.getElementById('prediction-home-score').value);
    const awayScore = parseInt(document.getElementById('prediction-away-score').value);
    
    if (isNaN(homeScore) || isNaN(awayScore)) {
        alert("Please enter valid scores.");
        return;
    }
    if (nickname === "") {
        alert("Please enter your name.");
        return;
    }
    
    const fixture = fixtures.find(f => f.id === currentPredictionFixtureId);
    if (!fixture) return;
    if (!fixture.predictions) fixture.predictions = [];
    
    fixture.predictions.push({
        nickname: nickname.slice(0, 20),
        homeScore: homeScore,
        awayScore: awayScore,
        timestamp: Date.now()
    });
    
    saveToStorage();
    renderPredictions(currentPredictionFixtureId);
    document.getElementById('prediction-nickname').value = '';
    document.getElementById('prediction-home-score').value = '';
    document.getElementById('prediction-away-score').value = '';
    showToast("Prediction submitted!");
}

function deletePrediction(fixtureId, index) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture && fixture.predictions && fixture.predictions[index]) {
        fixture.predictions.splice(index, 1);
        saveToStorage();
        renderPredictions(fixtureId);
        showToast("Prediction deleted");
    }
}

// Helper to escape HTML
function escapeHtml(str) {
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ======================= TEAM MANAGEMENT =======================
function removeTeamFromLeague(teamName) {
    if (!isAdmin) return;
    if (confirm(`Permanently remove ${teamName}? This will reset all its fixtures.`)) {
        fixtures.forEach(f => {
            if (f.home === teamName || f.away === teamName) {
                f.played = false;
                f.homeScore = null;
                f.awayScore = null;
                f.comment = null;
            }
        });
        delete teams[teamName];
        saveToStorage();
        showToast(`${teamName} removed`);
        renderTable();
        renderGameweekTabs();
        renderFixtures();
        generateTickerFacts();
    }
}

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
    const recent = team.formHistory.slice(-5);
    while (recent.length < 5) recent.unshift('-');
    document.getElementById('modal-form').innerHTML = recent.map(res => res === 'W' ? '<span class="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold flex items-center justify-center">W</span>' : res === 'L' ? '<span class="w-6 h-6 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold flex items-center justify-center">L</span>' : res === 'D' ? '<span class="w-6 h-6 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold flex items-center justify-center">D</span>' : '<span class="w-6 h-6 bg-gray-100 text-gray-400 rounded-full text-[10px] flex items-center justify-center">-</span>').join('');
    const ppg = (team.pts / (team.mp || 1)).toFixed(1);
    let summary = ppg >= 2.3 ? '🔥 Title contenders!' : ppg >= 1.8 ? '👍 Solid season.' : ppg >= 1.2 ? '⚖️ Mid-table consistency.' : '⚠️ Needs improvement.';
    if (team.deductedPoints > 0) summary += ` (Includes -${team.deductedPoints} pts penalty)`;
    document.getElementById('modal-summary').innerText = summary;
    document.getElementById('team-modal').classList.remove('hidden');
}

function closeTeamModal() { document.getElementById('team-modal').classList.add('hidden'); }
function resetTournament() { if (confirm("Wipe ALL data? This cannot be undone.")) db.ref('tournament_data').remove().then(() => location.reload()); }

// ======================= INITIALIZATION =======================
window.onload = () => initRealtimeDatabaseSync();

// Expose all functions to global scope for inline onclick handlers
window.handleAdminToggleClick = handleAdminToggleClick;
window.verifyAdminPassword = verifyAdminPassword;
window.closePasswordModal = closePasswordModal;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.updateMasterPassword = updateMasterPassword;
window.openPenaltyModal = openPenaltyModal;
window.closePenaltyModal = closePenaltyModal;
window.clearPenaltyPoints = clearPenaltyPoints;
window.generateTeamInputs = generateTeamInputs;
window.initializeTournament = initializeTournament;
window.shuffleRound = shuffleRound;
window.openBanterModal = openBanterModal;
window.closeBanterModal = closeBanterModal;
window.postBanter = postBanter;
window.deleteBanter = deleteBanter;
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
window.removeTeamFromLeague = removeTeamFromLeague;
window.showTeamDetails = showTeamDetails;
window.closeTeamModal = closeTeamModal;
window.resetTournament = resetTournament;