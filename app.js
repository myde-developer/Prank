// ============================================================
// 1. FIREBASE CONFIGURATION & GLOBAL VARIABLES
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBmy0tmvaYcw9KsQQRH7RLKcXC8EN6WFqY",
    authDomain: "dls-premier-league.firebaseapp.com",
    projectId: "dls-premier-league",
    storageBucket: "dls-premier-league.firebasestorage.app",
    messagingSenderId: "975087030284",
    appId: "1:975087030284:web:7708718fffd9180c009e29",
    measurementId: "G-Q2C6TKNRHE"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let teams = {};
let fixtures = [];
let currentSelectedRound = 1;
let isAdmin = false;
let tournamentPassword = "";

// Ticker rotating facts
let tickerInterval = null;
let currentTickerFactIndex = 0;
let tickerFacts = [];

// ============================================================
// 2. HELPER FUNCTIONS
// ============================================================
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

// ============================================================
// 3. Database Initialization 
// ============================================================
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
    }, (error) => { 
        showToast("Firebase connection issue"); 
    });
}

// ============================================================
// 4. ROTATING TICKER FACTS (SLIDING CAROUSEL)
// ============================================================
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
    if (totalTeams) {
        const sorted = Object.values(teams).sort((a,b) => b.pts - a.pts || b.gd - a.gd);
        if (sorted.length) leader = sorted[0];
    }
    let topScorer = null;
    if (totalTeams) {
        const sortedGF = Object.values(teams).sort((a,b) => b.gf - a.gf);
        if (sortedGF.length) topScorer = sortedGF[0];
    }
    let biggestWin = null;
    fixtures.forEach(f => {
        if (f.played && f.homeScore !== null && f.awayScore !== null) {
            const total = f.homeScore + f.awayScore;
            if (!biggestWin || total > biggestWin.total) {
                biggestWin = { home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore, total };
            }
        }
    });
    
    tickerFacts = [
        `🏆 Welcome to DLS Vawulence Academy Tournament Site!`,
        `Stay updated with stats, matchups and more.`,
        `⚽ ${totalTeams} teams competing for the title.`,
        `📊 ${totalMatchesPlayed} of ${totalMatches} matches played so far.`,
        leader ? `👑 Current leader: ${leader.name} with ${leader.pts} points.` : null,
        topScorer ? `🔥 Most goals scored: ${topScorer.name} (${topScorer.gf} goals).` : null,
        biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore} - ${biggestWin.awayScore} ${biggestWin.away}` : null,
        `🔄 Use admin mode to edit fixtures, shuffle rounds, or assign teams.`,
        `💬 Click the 💬 icon on any fixture to read or edit match commentary.`
    ].filter(f => f !== null);
    
    if (tickerFacts.length) {
        const tickerEl = document.getElementById('news-ticker');
        if (tickerEl) tickerEl.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> ${tickerFacts[0]}</span>`;
        currentTickerFactIndex = 0;
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateTickerFacts, 6000);
    }
}

// ============================================================
// 5. ADMIN MODE TOGGLE & UI
// ============================================================
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
        if(statusText) { statusText.innerText = "⚡ ADMIN MODE"; statusText.classList.replace('text-gray-600','text-indigo-600'); }
        if(resetContainer) resetContainer.classList.remove('hidden');
        if(thActions) thActions.classList.remove('hidden');
        if(hint) hint.classList.remove('hidden');
    } else {
        btn?.classList.replace('bg-indigo-600', 'bg-gray-300');
        dot?.classList.replace('translate-x-5', 'translate-x-0');
        if(statusText) { statusText.innerText = "🔒 READ ONLY"; statusText.classList.replace('text-indigo-600','text-gray-600'); }
        if(resetContainer) resetContainer.classList.add('hidden');
        if(thActions) thActions.classList.add('hidden');
        if(hint) hint.classList.add('hidden');
    }
    renderTable();
    renderGameweekTabs();
    renderFixtures();
}

function openChangePasswordModal() {
    if (!isAdmin) return;
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
    document.getElementById('password-match-error').classList.add('hidden');
    document.getElementById('change-password-modal').classList.remove('hidden');
    document.getElementById('change-password-modal').classList.add('flex');
}
function closeChangePasswordModal() {
    document.getElementById('change-password-modal').classList.add('hidden');
    document.getElementById('change-password-modal').classList.remove('flex');
}
function updateMasterPassword() {
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    if (newPass === '') { showToast('Password cannot be empty'); return; }
    if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; }
    tournamentPassword = newPass;
    saveToStorage();
    showToast('Master password updated successfully!');
    closeChangePasswordModal();
}

let currentPenaltyTeam = null;
function openPenaltyModal(teamName) {
    if (!isAdmin) return;
    currentPenaltyTeam = teamName;
    document.getElementById('penalty-team-name').innerText = teamName;
    document.getElementById('penalty-modal').classList.remove('hidden');
    document.getElementById('penalty-modal').classList.add('flex');
}
function closePenaltyModal() {
    document.getElementById('penalty-modal').classList.add('hidden');
    document.getElementById('penalty-modal').classList.remove('flex');
    currentPenaltyTeam = null;
}
function clearPenaltyPoints() {
    if (!currentPenaltyTeam) return;
    const team = teams[currentPenaltyTeam];
    if (!team) return;
    if (team.deductedPoints === 0) { showToast(`${currentPenaltyTeam} has no penalty points.`); closePenaltyModal(); return; }
    team.deductedPoints = 0;
    saveToStorage();
    showToast(`Penalty points cleared for ${currentPenaltyTeam}`);
    renderTable();
    closePenaltyModal();
}

// ============================================================
// 6. LEAGUE SETUP
// ============================================================
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter 2-20 teams"); return; }
    const container = document.getElementById('team-inputs-container');
    container.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div class="flex items-center gap-2 mb-2">
                    <span class="bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${i}</span>
                    <input type="text" id="team-input-${i}" placeholder="Club name" class="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
                </div>
            </div>
        `;
    }
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
}

function initializeTournament() {
    const count = parseInt(document.getElementById('team-count').value);
    const pass = document.getElementById('tournament-password').value.trim();
    if(pass) tournamentPassword = pass;
    let list = [];
    for (let i=1; i<=count; i++) {
        let name = document.getElementById(`team-input-${i}`).value.trim();
        if(name === "") name = `Team ${i}`;
        list.push({ name });
    }
    if (list.length % 2 !== 0) list.push({ name: "BYE" });
    teams = {};
    list.forEach(item => {
        if(item.name !== "BYE") {
            teams[item.name] = { 
                name: item.name, 
                mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0, 
                deductedPoints:0, 
                formHistory: [] 
            };
        }
    });
    fixtures = [];
    const n = list.length;
    const rounds = n-1;
    for (let r=0; r<rounds; r++) {
        for (let m=0; m<n/2; m++) {
            let homeIdx = (r + m) % (n-1);
            let awayIdx = (n-1 - m + r) % (n-1);
            if (m===0) awayIdx = n-1;
            if (list[homeIdx].name !== "BYE" && list[awayIdx].name !== "BYE") {
                fixtures.push({ 
                    id: fixtures.length, 
                    round: r+1, 
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
    showToast("Tournament initialized!");
}

// ============================================================
// 7. FIXTURE MANAGEMENT
// ============================================================
function shuffleRound(roundNumber) {
    if (!isAdmin) return;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    if (roundFixtures.length === 0) return;
    const teamsInRound = [];
    roundFixtures.forEach(f => {
        if (f.home !== 'BYE') teamsInRound.push(f.home);
        if (f.away !== 'BYE') teamsInRound.push(f.away);
    });
    const uniqueTeams = [...new Set(teamsInRound)];
    for (let i = uniqueTeams.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [uniqueTeams[i], uniqueTeams[j]] = [uniqueTeams[j], uniqueTeams[i]];
    }
    const newPairs = [];
    for (let i = 0; i < uniqueTeams.length; i += 2) {
        if (i + 1 < uniqueTeams.length) {
            if (Math.random() < 0.5) newPairs.push({ home: uniqueTeams[i], away: uniqueTeams[i+1] });
            else newPairs.push({ home: uniqueTeams[i+1], away: uniqueTeams[i] });
        }
    }
    roundFixtures.forEach((fixture, idx) => {
        if (idx < newPairs.length) {
            fixture.home = newPairs[idx].home;
            fixture.away = newPairs[idx].away;
            fixture.homeScore = null;
            fixture.awayScore = null;
            fixture.played = false;
            fixture.comment = null;
        }
    });
    saveToStorage();
    showToast(`Round ${roundNumber} shuffled!`);
    renderGameweekTabs();
    renderFixtures();
    renderTable();
}

function swapFixture(fixtureId) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    const temp = fixture.home;
    fixture.home = fixture.away;
    fixture.away = temp;
    fixture.homeScore = null;
    fixture.awayScore = null;
    fixture.played = false;
    fixture.comment = null;
    saveToStorage();
    showToast(`Swapped ${fixture.home} vs ${fixture.away}`);
    renderFixtures();
    renderTable();
}

let pendingAssignFixtureId = null;
let pendingAssignSide = null;

window.editFixtureTeamName = function(fixtureId, side) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    const currentTeam = side === 'home' ? fixture.home : fixture.away;
    const dropdown = document.getElementById('team-select-dropdown');
    dropdown.innerHTML = '';
    const cancelOption = document.createElement('option');
    cancelOption.value = '';
    cancelOption.textContent = '— Cancel / No change —';
    dropdown.appendChild(cancelOption);
    const otherSide = side === 'home' ? fixture.away : fixture.home;
    const teamNames = Object.keys(teams).sort();
    teamNames.forEach(name => {
        if (name === otherSide) return;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === currentTeam) option.selected = true;
        dropdown.appendChild(option);
    });
    pendingAssignFixtureId = fixtureId;
    pendingAssignSide = side;
    document.getElementById('team-select-modal').classList.remove('hidden');
    document.getElementById('team-select-modal').classList.add('flex');
};
window.closeTeamSelectModal = function() {
    document.getElementById('team-select-modal').classList.add('hidden');
    document.getElementById('team-select-modal').classList.remove('flex');
    pendingAssignFixtureId = null;
    pendingAssignSide = null;
};
window.confirmTeamSelection = function() {
    if (pendingAssignFixtureId === null) return;
    const selectedValue = document.getElementById('team-select-dropdown').value;
    if (selectedValue === '') { closeTeamSelectModal(); return; }
    const fixture = fixtures.find(f => f.id === pendingAssignFixtureId);
    const side = pendingAssignSide;
    const newTeam = selectedValue;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    const round = fixture.round;
    const otherFixtures = fixtures.filter(f => f.round === round && f.id !== fixture.id);
    const isUsedElsewhere = otherFixtures.some(f => f.home === newTeam || f.away === newTeam);
    if (isUsedElsewhere) {
        showToast(`Team "${newTeam}" already has a fixture in this round!`);
        closeTeamSelectModal();
        return;
    }
    if (side === 'home') fixture.home = newTeam;
    else fixture.away = newTeam;
    fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null;
    saveToStorage();
    showToast(`Assigned ${newTeam} to ${side === 'home' ? 'home' : 'away'} side.`);
    renderFixtures(); renderTable(); closeTeamSelectModal();
};

// ============================================================
// 8. STANDINGS CALCULATIONS
// ============================================================
function calculateStandingsForRound(upToRound) {
    let temp = {};
    for(let t in teams) temp[t] = { name: t, pts:0, gd:0, gf:0 };
    fixtures.forEach(f => {
        if(f.played && f.round <= upToRound && temp[f.home] && temp[f.away]) {
            const hS = parseInt(f.homeScore), aS = parseInt(f.awayScore);
            temp[f.home].gf += hS; temp[f.home].gd += (hS - aS);
            temp[f.away].gf += aS; temp[f.away].gd += (aS - hS);
            if(hS > aS) temp[f.home].pts += 3;
            else if(aS > hS) temp[f.away].pts += 3;
            else { temp[f.home].pts += 1; temp[f.away].pts += 1; }
        }
    });
    for(let t in temp) if(teams[t]) temp[t].pts = Math.max(0, temp[t].pts - (teams[t].deductedPoints||0));
    return Object.values(temp).sort((a,b)=>b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
}

function updateTableCalculations() {
    for(let t in teams) {
        teams[t] = { ...teams[t], mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0, formHistory: [] };
    }
    fixtures.sort((a,b)=>a.round-b.round).forEach(f => {
        if(f.played && teams[f.home] && teams[f.away]) {
            const h = f.home, a = f.away, hS = parseInt(f.homeScore), aS = parseInt(f.awayScore);
            teams[h].mp++; teams[a].mp++;
            teams[h].gf += hS; teams[h].ga += aS; teams[a].gf += aS; teams[a].ga += hS;
            if(hS > aS) { teams[h].w++; teams[h].pts += 3; teams[a].l++; teams[h].formHistory.push('W'); teams[a].formHistory.push('L'); }
            else if(hS < aS) { teams[a].w++; teams[a].pts += 3; teams[h].l++; teams[h].formHistory.push('L'); teams[a].formHistory.push('W'); }
            else { teams[h].d++; teams[h].pts += 1; teams[a].d++; teams[a].pts += 1; teams[h].formHistory.push('D'); teams[a].formHistory.push('D'); }
            if(teams[h].formHistory.length > 10) teams[h].formHistory.shift();
            if(teams[a].formHistory.length > 10) teams[a].formHistory.shift();
        }
    });
    for(let t in teams) {
        teams[t].pts = Math.max(0, teams[t].pts - (teams[t].deductedPoints||0));
        teams[t].gd = teams[t].gf - teams[t].ga;
    }
}

// ============================================================
// 9. RENDER LEAGUE TABLE
// ============================================================
function renderTable() {
    let currentSorted = Object.values(teams).sort((a,b)=>b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = "";
    currentSorted.forEach((team, idx) => {
        const pos = idx+1;
        let recent = team.formHistory.slice(-5);
        while(recent.length < 5) recent.unshift('-');
        let formHtml = `<div class="flex gap-1.5 justify-center">`;
        recent.forEach(res => {
            if(res === 'W') formHtml += `<span class="w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold flex items-center justify-center">W</span>`;
            else if(res === 'L') formHtml += `<span class="w-5 h-5 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-[9px] font-bold">L</span>`;
            else if(res === 'D') formHtml += `<span class="w-5 h-5 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-[9px] font-bold">D</span>`;
            else formHtml += `<span class="w-5 h-5 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center text-[9px]">-</span>`;
        });
        formHtml += `</div>`;
        const penaltyBadge = team.deductedPoints > 0 ? `<span class="ml-1 text-[9px] bg-rose-50 text-rose-600 px-1 rounded-full">-${team.deductedPoints}</span>` : "";
        const rowClass = pos === 1 ? "champions-row" : (pos > currentSorted.length-2 ? "relegation-row" : "");
        const actionBtn = isAdmin ? `<td class="py-3 px-2 text-center"><button onclick="event.stopPropagation(); openPenaltyModal('${team.name}')" class="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">⚖️</button> <button onclick="event.stopPropagation(); removeTeamFromLeague('${team.name}')" class="text-xs bg-rose-50 text-rose-600 px-2 py-1 rounded-full hover:bg-rose-100">🗑️</button></td>` : "";
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 transition ${rowClass}" onclick="showTeamDetails('${team.name}')">
                <td class="py-3 px-3 text-center font-bold ${pos===1?'text-indigo-600':''}">${pos}</td>
                <td class="py-3 px-4"><span class="font-semibold text-base">${team.name}</span>${penaltyBadge}</td>
                <td class="py-3 px-2 text-center">${team.mp}</td><td class="py-3 px-2 text-center text-emerald-600">${team.w}</td>
                <td class="py-3 px-2 text-center">${team.d}</td><td class="py-3 px-2 text-center text-rose-500">${team.l}</td>
                <td class="py-3 px-2 text-center">${team.gf}</td><td class="py-3 px-2 text-center">${team.ga}</td>
                <td class="py-3 px-2 text-center ${team.gd>=0?'text-emerald-600':'text-rose-500'} font-mono">${team.gd>0?'+'+team.gd:team.gd}</td>
                <td class="py-3 px-3 text-center font-black text-indigo-600">${team.pts}</td>
                <td class="py-3 px-4 text-center">${formHtml}</td>
                ${actionBtn}
            </tr>
        `;
    });
}

// ============================================================
// 10. RENDER GAMEWEEK TABS & FIXTURES
// ============================================================
function renderGameweekTabs() {
    const container = document.getElementById('gameweek-tabs');
    if(!fixtures.length) return;
    const total = Math.max(...fixtures.map(f=>f.round));
    container.innerHTML = "";
    for(let r=1; r<=total; r++) {
        const active = r === currentSelectedRound;
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 text-[11px] font-mono rounded-full transition shrink-0 ${active ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
        btn.innerText = `GW ${r}`;
        btn.onclick = () => switchRound(r);
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
window.switchRound = function(r) { currentSelectedRound = r; renderGameweekTabs(); renderFixtures(); };

function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    container.innerHTML = "";
    fixtures.filter(f => f.round === currentSelectedRound).forEach(f => {
        const played = f.played;
        let midHtml = "", actionHtml = "";
        if (isAdmin) {
            midHtml = `
                <div class="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full">
                    <input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm">
                    <span class="text-gray-400">:</span>
                    <input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm">
                </div>
            `;
            
            // FEATURE 6: Admin Rollback/Undo UI Button Addition
            const undoButtonHtml = played ? `<button onclick="undoMatchResult(${f.id})" class="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-1 rounded-full hover:bg-rose-100">🔄 Undo</button>` : '';
            
            actionHtml = `
                <div class="flex flex-wrap gap-1 justify-end">
                    <button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">🔄 Swap</button>
                    <button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full hover:bg-indigo-100">💾 Save</button>
                    ${undoButtonHtml}
                    <button onclick="showMatchComment(${f.id})" class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full hover:bg-gray-200">💬</button>
                </div>
            `;
            const homeNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'home')">${f.home}</span>`;
            const awayNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'away')">${f.away}</span>`;
            container.innerHTML += `
                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="flex-1 flex items-center justify-center gap-2 text-center ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">
                            ${homeNameHtml}
                        </div>
                        <div class="flex items-center justify-center">
                            ${midHtml}
                        </div>
                        <div class="flex-1 flex items-center justify-center gap-2 text-center ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">
                            ${awayNameHtml}
                        </div>
                    </div>
                    <div class="mt-2 flex justify-center">
                        ${actionHtml}
                    </div>
                </div>
            `;
        } else {
            midHtml = played ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="runMatchPrediction(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predict</button>`;
            actionHtml = `<button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">💬 Banter Room</button>`;
            container.innerHTML += `
                <div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">
                            ${f.home}
                        </div>
                        <div class="flex justify-center">
                            ${midHtml}
                        </div>
                        <div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">
                            ${f.away}
                        </div>
                    </div>
                    <div class="mt-2 flex justify-center">
                        ${actionHtml}
                    </div>
                </div>
            `;
        }
    });
}

// ============================================================
// 11. MATCH DETAILS & FEATURE 4: LIVE BANTER CHAT SYSTEM
// ============================================================
let currentViewerFixtureId = null;
let databaseBanterRef = null;

window.showMatchComment = function(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    currentViewerFixtureId = fixtureId;
    
    document.getElementById('viewer-match-name').innerHTML = `${fixture.home} vs ${fixture.away}`;
    const scoreText = fixture.played ? `${fixture.homeScore} - ${fixture.awayScore}` : 'Not played yet';
    document.getElementById('viewer-score').innerText = scoreText;
    const commentText = fixture.comment || (fixture.played ? 'No comment added.' : 'Match not played yet.');
    document.getElementById('viewer-comment').innerText = commentText;
    
    const editBtn = document.getElementById('viewer-edit-btn');
    if (isAdmin && fixture.played) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
    
    // Wire up automated message listeners for Banter stream path
    if (databaseBanterRef) databaseBanterRef.off();
    
    const messagesBox = document.getElementById('banter-messages-box');
    messagesBox.innerHTML = `<p class="text-gray-400 italic text-center pt-4 animate-pulse">Entering chat room...</p>`;
    
    databaseBanterRef = db.ref(`match_banter_chats/${fixtureId}`).limitToLast(30);
    databaseBanterRef.on('value', (snapshot) => {
        messagesBox.innerHTML = "";
        const data = snapshot.val();
        if (!data) {
            messagesBox.innerHTML = `<p class="text-gray-400 italic text-center pt-4">No banter yet. Start the vawulence! 🔥</p>`;
            return;
        }
        
        Object.values(data).forEach(msg => {
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';
            messagesBox.innerHTML += `
                <div class="bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                    <div class="flex justify-between items-center mb-0.5">
                        <span class="font-extrabold text-indigo-600 text-[11px]">${escapeHTML(msg.user)}</span>
                        <span class="text-[9px] text-gray-400 font-mono">${timeStr}</span>
                    </div>
                    <p class="text-gray-700 text-xs break-words">${escapeHTML(msg.text)}</p>
                </div>
            `;
        });
        // Auto Scroll viewport container to floor
        messagesBox.scrollTop = messagesBox.scrollHeight;
    });
    
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
    document.getElementById('comment-viewer-modal').classList.add('flex');
};

window.closeCommentViewer = function() {
    if (databaseBanterRef) { databaseBanterRef.off(); databaseBanterRef = null; }
    document.getElementById('comment-viewer-modal').classList.add('hidden');
    document.getElementById('comment-viewer-modal').classList.remove('flex');
    currentViewerFixtureId = null;
};

window.submitBanterMessage = function() {
    if (currentViewerFixtureId === null) return;
    let usernameInput = document.getElementById('banter-input-username').value.trim();
    const messageInput = document.getElementById('banter-input-text').value.trim();
    
    if (messageInput === "") return;
    if (usernameInput === "") usernameInput = "Anonymous";
    
    db.ref(`match_banter_chats/${currentViewerFixtureId}`).push({
        user: usernameInput,
        text: messageInput,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        document.getElementById('banter-input-text').value = "";
    }).catch(() => {
        showToast("Banter blocked by networking fault.");
    });
};

function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function generateMatchComment(homeName, awayName, homeScore, awayScore) {
    const margin = Math.abs(homeScore - awayScore);
    const winner = homeScore > awayScore ? homeName : awayName;
    const loser = homeScore > awayScore ? awayName : homeName;
    let comment = "";
    if (homeScore === awayScore) {
        if (homeScore === 0) comment = `🤝 Goalless stalemate between ${homeName} and ${awayName}.`;
        else comment = `⚖️ ${homeName} ${homeScore}-${awayScore} ${awayName} – honours shared.`;
    } else if (margin >= 3) {
        comment = `🔥 ${winner} destroyed ${loser} ${Math.max(homeScore,awayScore)}-${Math.min(homeScore,awayScore)}!`;
    } else if (margin === 2) {
        comment = `📈 ${winner} secured a comfortable win over ${loser}.`;
    } else {
        comment = `⚡ Narrow victory! ${winner} edged past ${loser}.`;
    }
    return comment;
}

let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
window.saveResult = function(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    const fixture = fixtures.find(f => f.id === fixtureId);
    const draft = generateMatchComment(fixture.home, fixture.away, parseInt(homeScore), parseInt(awayScore));
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    document.getElementById('comment-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('comment-text').value = draft;
    document.getElementById('comment-modal').classList.remove('hidden');
    document.getElementById('comment-modal').classList.add('flex');
};
window.closeCommentModal = function(save = false) {
    document.getElementById('comment-modal').classList.add('hidden');
    document.getElementById('comment-modal').classList.remove('flex');
    if (!save) pendingFixtureId = null;
};
window.confirmComment = function() {
    if (pendingFixtureId === null) return;
    const finalComment = document.getElementById('comment-text').value.trim();
    if (finalComment === "") { alert("Comment cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    fixture.comment = finalComment;
    saveToStorage();
    closeCommentModal(true);
    pendingFixtureId = null;
};

window.editViewerComment = function() {
    if (!isAdmin || currentViewerFixtureId === null) return;
    const fixture = fixtures.find(f => f.id === currentViewerFixtureId);
    if (!fixture.played) return;
    pendingFixtureId = currentViewerFixtureId;
    pendingHomeScore = fixture.homeScore;
    pendingAwayScore = fixture.awayScore;
    document.getElementById('comment-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('comment-text').value = fixture.comment || '';
    document.getElementById('comment-modal').classList.remove('hidden');
    document.getElementById('comment-modal').classList.add('flex');
    closeCommentViewer();
};

// ============================================================
// FEATURE 6: ADMIN MATCH ROLLBACK (UNDO ACTION) RENDER
// ============================================================
window.undoMatchResult = function(fixtureId) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture || !fixture.played) return;
    
    if (confirm(`Are you sure you want to undo the result for ${fixture.home} vs ${fixture.away}? This will recalculate table standings instantly.`)) {
        fixture.played = false;
        fixture.homeScore = null;
        fixture.awayScore = null;
        fixture.comment = null;
        
        saveToStorage();
        showToast("Match status rolled back to unplayed.");
    }
};

// ============================================================
// 12. CROWD-SOURCED PUBLIC MATCH PREDICTOR ENGINE & FEATURE 5
// ============================================================
let currentPredictingFixtureId = null;
let databaseVotesRef = null;

window.runMatchPrediction = function(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f || f.home === 'BYE' || f.away === 'BYE') { return; }
    
    currentPredictingFixtureId = fixtureId;
    document.getElementById('pred-home-name').innerText = f.home;
    document.getElementById('pred-away-name').innerText = f.away;
    
    document.getElementById('viewer-pred-home-score').value = "";
    document.getElementById('viewer-pred-away-score').value = "";
    
    // FEATURE 5: Realtime Insight Generation Framework
    const insightsList = document.getElementById('predictor-insights-list');
    insightsList.innerHTML = "";
    
    const hTeam = teams[f.home];
    const aTeam = teams[f.away];
    
    if (hTeam && aTeam) {
        // Insight 1: Point differential overview
        const ptDiff = Math.abs(hTeam.pts - aTeam.pts);
        if (ptDiff > 6) {
            const high = hTeam.pts > aTeam.pts ? f.home : f.away;
            insightsList.innerHTML += `<li>📊 <b>${high}</b> sits comfortably dominant over their opponent by a massive ${ptDiff} points margin.</li>`;
        } else {
            insightsList.innerHTML += `<li>⚖️ Tight matchup! Barely ${ptDiff} points separate these clubs on the table standings.</li>`;
        }
        
        // Insight 2: Historical scoring tendencies
        if (hTeam.gf / (hTeam.mp || 1) >= 2.0) {
            insightsList.innerHTML += `<li>🔥 <b>${f.home}</b> is lethal upfront, averaging ${ (hTeam.gf / (hTeam.mp || 1)).toFixed(1) } goals a game!</li>`;
        }
        if (aTeam.ga / (aTeam.mp || 1) >= 2.0) {
            insightsList.innerHTML += `<li>⚠️ Defensive worries: <b>${f.away}</b> leaks at least 2 goals per match on average.</li>`;
        }
        
        // Insight 3: Dynamic streak weights
        const hForm = hTeam.formHistory.slice(-3).join('');
        const aForm = aTeam.formHistory.slice(-3).join('');
        if (hForm === 'WWW') insightsList.innerHTML += `<li>👑 <b>${f.home}</b> enters on a blazing 3-match winning streak!</li>`;
        if (aForm === 'LLL') insightsList.innerHTML += `<li>📉 Crisis mode: <b>${f.away}</b> has lost 3 straight games in a row.</li>`;
    }
    
    if (insightsList.innerHTML === "") {
        insightsList.innerHTML = `<li>🏃 Both teams looking to make an impact in this gameweek encounter. No advanced streaks active.</li>`;
    }
    
    // Realtime voting calculations path sync
    if (databaseVotesRef) databaseVotesRef.off();
    
    databaseVotesRef = db.ref(`crowd_predictions/${fixtureId}`);
    databaseVotesRef.on('value', (snapshot) => {
        const crowdData = snapshot.val() || {};
        const outcomes = crowdData.outcomes || { home: 0, draw: 0, away: 0 };
        const total = (outcomes.home || 0) + (outcomes.draw || 0) + (outcomes.away || 0);
        
        if (total > 0) {
            document.getElementById('pred-home-pct').innerText = `${Math.round(((outcomes.home || 0) / total) * 100)}%`;
            document.getElementById('pred-draw-pct').innerText = `${Math.round(((outcomes.draw || 0) / total) * 100)}%`;
            document.getElementById('pred-away-pct').innerText = `${Math.round(((outcomes.away || 0) / total) * 100)}%`;
        } else {
            document.getElementById('pred-home-pct').innerText = "0%";
            document.getElementById('pred-draw-pct').innerText = "0%";
            document.getElementById('pred-away-pct').innerText = "0%";
        }
    });

    const userVote = localStorage.getItem(`voted_outcome_${fixtureId}`);
    const flagHint = document.getElementById('vote-status-hint');
    if (userVote) {
        flagHint.innerText = `✅ Your response is locked in: ${userVote.toUpperCase()}`;
        flagHint.className = "text-[10px] text-emerald-600 text-center mt-2 font-bold";
    } else {
        flagHint.innerText = "Click home, draw, or away to register your vote instantly.";
        flagHint.className = "text-[10px] text-gray-400 text-center mt-2 italic";
    }
    
    document.getElementById('predictor-modal').classList.remove('hidden');
    document.getElementById('predictor-modal').classList.add('flex');
};

window.closePredictorModal = () => {
    if (databaseVotesRef) { databaseVotesRef.off(); databaseVotesRef = null; }
    currentPredictingFixtureId = null;
    document.getElementById('predictor-modal').classList.add('hidden');
    document.getElementById('predictor-modal').classList.remove('flex');
};

window.submitCrowdVote = function(outcome) {
    if (!currentPredictingFixtureId) return;
    
    // Get their previous vote for this match from their browser memory
    const previousVote = localStorage.getItem(`voted_outcome_${currentPredictingFixtureId}`);
    
    // Case 1: If they click the exact same option they already voted for, do nothing
    if (previousVote === outcome) {
        showToast(`You have already voted for a ${outcome.toUpperCase()}!`);
        return;
    }
    
    // Case 2: Changing an existing vote (e.g., changing from 'home' to 'draw')
    if (previousVote) {
        // Run a transaction that decrements the old vote and increments the new vote simultaneously
        db.ref(`crowd_predictions/${currentPredictingFixtureId}/outcomes`).transaction((currentOutcomes) => {
            if (!currentOutcomes) currentOutcomes = { home: 0, draw: 0, away: 0 };
            
            // Subtract one from the old choice safely (ensuring it doesn't drop below 0)
            if (currentOutcomes[previousVote] > 0) {
                currentOutcomes[previousVote]--;
            }
            // Add one to the new choice
            currentOutcomes[outcome] = (currentOutcomes[outcome] || 0) + 1;
            
            return currentOutcomes;
        }, (error, committed) => {
            if (committed) {
                localStorage.setItem(`voted_outcome_${currentPredictingFixtureId}`, outcome);
                showToast(`Prediction updated to ${outcome.toUpperCase()}!`);
                
                // Update the UI visual helper hint text
                const flagHint = document.getElementById('vote-status-hint');
                if (flagHint) {
                    flagHint.innerText = `✅ Your response is updated: ${outcome.toUpperCase()}`;
                    flagHint.className = "text-[10px] text-emerald-600 text-center mt-2 font-bold";
                }
            } else {
                showToast("Failed to update vote. Try again.");
            }
        });
    } 
    // Case 3: First time voting on this fixture
    else {
        db.ref(`crowd_predictions/${currentPredictingFixtureId}/outcomes/${outcome}`)
          .transaction((currentCount) => { 
              return (currentCount || 0) + 1; 
          }, 
          (error, committed) => {
              if (committed) {
                  localStorage.setItem(`voted_outcome_${currentPredictingFixtureId}`, outcome);
                  showToast(`Vote recorded for ${outcome.toUpperCase()}!`);
                  
                  const flagHint = document.getElementById('vote-status-hint');
                  if (flagHint) {
                      flagHint.innerText = `✅ Your response is locked in: ${outcome.toUpperCase()}`;
                      flagHint.className = "text-[10px] text-emerald-600 text-center mt-2 font-bold";
                  }
              }
          });
    }
};


window.submitScorePrediction = function() {
    if (!currentPredictingFixtureId) return;
    const homeScoreVal = document.getElementById('viewer-pred-home-score').value;
    const awayScoreVal = document.getElementById('viewer-pred-away-score').value;
    if (homeScoreVal === "" || awayScoreVal === "") { alert("Specify score targets before submission."); return; }
    
    const formattedPrediction = `${parseInt(homeScoreVal)} - ${parseInt(awayScoreVal)}`;
    db.ref(`crowd_predictions/${currentPredictingFixtureId}/scores`).push({
        prediction: formattedPrediction,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showToast(`Scoreline prediction ${formattedPrediction} submitted!`);
        document.getElementById('viewer-pred-home-score').value = "";
        document.getElementById('viewer-pred-away-score').value = "";
    });
};

window.removeTeamFromLeague = function(teamName) {
    if(!isAdmin) return;
    if(confirm(`Permanently remove ${teamName}?`)) {
        fixtures.forEach(f => { if(f.home === teamName || f.away === teamName) { f.played = false; f.homeScore = null; f.awayScore = null; f.comment = null; } });
        delete teams[teamName]; saveToStorage(); renderTable(); renderGameweekTabs(); renderFixtures();
    }
};

window.showTeamDetails = function(teamName) {
    const team = teams[teamName]; if (!team) return;
    document.getElementById('team-modal-name').innerText = team.name;
    document.getElementById('modal-mp').innerText = team.mp;
    document.getElementById('modal-pts').innerText = team.pts;
    document.getElementById('modal-w').innerText = team.w;
    document.getElementById('modal-d').innerText = team.d;
    document.getElementById('modal-l').innerText = team.l;
    document.getElementById('modal-gf').innerText = team.gf;
    document.getElementById('modal-ga').innerText = team.ga;
    const gd = team.gd;
    document.getElementById('modal-gd').innerHTML = `<span class="${gd>=0?'text-emerald-600':'text-rose-500'}">${gd>0?'+'+gd:gd}</span>`;
    document.getElementById('modal-penalty').innerText = team.deductedPoints ? `-${team.deductedPoints}` : 'None';
    
    const formContainer = document.getElementById('modal-form');
    let recent = team.formHistory.slice(-5);
    while(recent.length < 5) recent.unshift('-');
    formContainer.innerHTML = recent.map(res => {
        if(res === 'W') return `<span class="w-6 h-6 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold flex items-center justify-center">W</span>`;
        if(res === 'L') return `<span class="w-6 h-6 bg-rose-100 text-rose-600 rounded-full text-[10px] font-bold flex items-center justify-center">L</span>`;
        if(res === 'D') return `<span class="w-6 h-6 bg-amber-100 text-amber-700 rounded-full text-[10px] font-bold flex items-center justify-center">D</span>`;
        return `<span class="w-6 h-6 bg-gray-100 text-gray-400 rounded-full text-[10px] flex items-center justify-center">-</span>`;
    }).join('');
    
    const ptsPerGame = (team.pts / (team.mp || 1)).toFixed(1);
    let summary = ptsPerGame >= 2.3 ? '🔥 Title contenders!' : (ptsPerGame >= 1.8 ? '👍 Solid season.' : (ptsPerGame >= 1.2 ? '⚖️ Mid‑table consistency.' : '⚠️ Risk Zone.'));
    document.getElementById('modal-summary').innerText = summary;
    document.getElementById('team-modal').classList.remove('hidden');
    document.getElementById('team-modal').classList.add('flex');
};

window.openPenaltyModal = function(teamName) {
    if (!isAdmin) return; currentPenaltyTeam = teamName;
    document.getElementById('penalty-team-name').innerText = teamName;
    document.getElementById('penalty-modal').classList.remove('hidden');
    document.getElementById('penalty-modal').classList.add('flex');
};

window.closeTeamModal = function() { document.getElementById('team-modal').classList.add('hidden'); document.getElementById('team-modal').classList.remove('flex'); };
window.resetTournament = () => { if(confirm("Wipe ALL data?")) db.ref('tournament_data').remove().then(()=>location.reload()); };
window.onload = () => { initRealtimeDatabaseSync(); };