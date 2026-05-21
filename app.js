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
let tournamentPassword = "1234";

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
// 3. FIREBASE REAL-TIME SYNC
// ============================================================
function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.teams && data.fixtures) {
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
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            const tickerEl = document.getElementById('news-ticker');
            if (tickerEl) tickerEl.innerHTML = "⚽ Ready to create your league";
        }
    }, (error) => { showToast("Firebase connection issue"); });
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

// ============================================================
// 6. LEAGUE SETUP (NO CRESTS)
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
// 7. FIXTURE MANAGEMENT (SHUFFLE, SWAP, ASSIGN TEAM)
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
    generateTickerFacts();
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
    generateTickerFacts();
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
    const byeOption = document.createElement('option');
    byeOption.value = 'BYE_REMOVE';
    byeOption.textContent = '— Remove team from this fixture (set to BYE) —';
    dropdown.appendChild(byeOption);
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
    if (selectedValue === 'BYE_REMOVE') {
        if (side === 'home') fixture.home = 'BYE';
        else fixture.away = 'BYE';
        fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null;
        saveToStorage();
        showToast(`Removed team from ${side === 'home' ? 'home' : 'away'} side. Set to BYE.`);
        renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
        return;
    }
    const newTeam = selectedValue;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    const round = fixture.round;
    const otherFixtures = fixtures.filter(f => f.round === round && f.id !== fixture.id);
    const isUsedElsewhere = otherFixtures.some(f => f.home === newTeam || f.away === newTeam);
    if (isUsedElsewhere) {
        showToast(`Team "${newTeam}" already has a fixture in this round! Remove that team first or shuffle.`);
        closeTeamSelectModal();
        return;
    }
    if (side === 'home') fixture.home = newTeam;
    else fixture.away = newTeam;
    fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null;
    saveToStorage();
    showToast(`Assigned ${newTeam} to ${side === 'home' ? 'home' : 'away'} side.`);
    renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
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
// 9. RENDER LEAGUE TABLE (NO CRESTS)
// ============================================================
function renderTable() {
    let currentSorted = Object.values(teams).sort((a,b)=>b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
    let maxRoundPlayed = Math.max(0, ...fixtures.filter(f=>f.played).map(f=>f.round));
    let prevRankMap = {};
    if(maxRoundPlayed > 1) {
        let prev = calculateStandingsForRound(maxRoundPlayed-1);
        prev.forEach((p,idx)=> prevRankMap[p.name] = idx);
    }
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
        const actionBtn = isAdmin ? `<td class="py-3 px-2 text-center"><button onclick="event.stopPropagation(); deductPointsPrompt('${team.name}')" class="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">⚖️</button> <button onclick="event.stopPropagation(); removeTeamFromLeague('${team.name}')" class="text-xs bg-rose-50 text-rose-600 px-2 py-1 rounded-full hover:bg-rose-100">🗑️</button></td>` : "";
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
    generateTickerFacts();
}

// ============================================================
// 10. RENDER GAMEWEEK TABS & FIXTURES (VERTICAL LAYOUT)
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
            actionHtml = `
                <div class="flex flex-wrap gap-1 justify-end">
                    <button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">🔄 Swap</button>
                    <button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full hover:bg-indigo-100">💾 Save</button>
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
            midHtml = played ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="runMatchPrediction(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔍 Analyze</button>`;
            actionHtml = `<button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">💬</button>`;
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
// 11. MATCH COMMENTS (VIEWER & EDITOR)
// ============================================================
let currentViewerFixtureId = null;

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
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
    document.getElementById('comment-viewer-modal').classList.add('flex');
};
window.closeCommentViewer = function() {
    document.getElementById('comment-viewer-modal').classList.add('hidden');
    document.getElementById('comment-viewer-modal').classList.remove('flex');
    currentViewerFixtureId = null;
};
window.editViewerComment = function() {
    if (!isAdmin) return;
    if (currentViewerFixtureId === null) return;
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
    const flavour = ["dominated possession", "clinical finishing", "strong defensive display", "counter-attacking masterclass"];
    comment += ` ${winner} showed ${flavour[Math.floor(Math.random()*flavour.length)]}.`;
    return comment;
}
let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
window.saveResult = function(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save a match with BYE team. Assign a real team first."); return; }
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
    showToast(`Result saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`);
    closeCommentModal(true);
    pendingFixtureId = null;
    renderTable();
    renderFixtures();
};

// ============================================================
// 12. ADMIN ACTIONS & INITIALISATION
// ============================================================
window.runMatchPrediction = function(fixtureId) {
    const f = fixtures.find(f=>f.id===fixtureId);
    if (f.home === 'BYE' || f.away === 'BYE') { alert("Cannot predict with BYE team."); return; }
    const h = teams[f.home], a = teams[f.away];
    let homePower = (h.pts*1.5)+h.gd, awayPower = (a.pts*1.5)+a.gd;
    const formScore = (arr) => arr.slice(-3).reduce((s,x)=>s+(x==='W'?3:x==='D'?1:0),0);
    homePower += formScore(h.formHistory); awayPower += formScore(a.formHistory);
    let drawPct = 25, homePct = Math.min(70, Math.max(20, 35+(homePower-awayPower)*0.8));
    let awayPct = 100-homePct-drawPct;
    let simHome = Math.min(4, Math.max(0, Math.round((h.gf/(h.mp||1)+ (homePower-awayPower)*0.05))));
    let simAway = Math.min(4, Math.max(0, Math.round((a.gf/(a.mp||1)+ (awayPower-homePower)*0.05))));
    document.getElementById('pred-home-name').innerText = f.home;
    document.getElementById('pred-away-name').innerText = f.away;
    document.getElementById('pred-home-pct').innerText = `${Math.round(homePct)}%`;
    document.getElementById('pred-away-pct').innerText = `${Math.round(awayPct)}%`;
    document.getElementById('pred-draw-pct').innerText = `${Math.round(drawPct)}%`;
    document.getElementById('pred-simulated-score').innerText = `${simHome} - ${simAway}`;
    document.getElementById('predictor-modal').classList.remove('hidden');
};
window.closePredictorModal = () => document.getElementById('predictor-modal').classList.add('hidden');

window.deductPointsPrompt = function(teamName) {
    if(!isAdmin) return;
    let amount = prompt(`Penalty points for ${teamName}:`, "3");
    if(!amount) return;
    teams[teamName].deductedPoints = (teams[teamName].deductedPoints||0) + parseInt(amount);
    saveToStorage();
    showToast(`${teamName} penalized ${amount} pts`);
    renderTable();
};
window.removeTeamFromLeague = function(teamName) {
    if(!isAdmin) return;
    if(confirm(`Permanently remove ${teamName}?`)) {
        fixtures.forEach(f => {
            if(f.home === teamName || f.away === teamName) { f.played = false; f.homeScore = null; f.awayScore = null; f.comment = null; }
        });
        delete teams[teamName];
        saveToStorage();
        showToast(`${teamName} removed`);
        renderTable();
        renderGameweekTabs();
        renderFixtures();
    }
};
window.showTeamDetails = function(teamName) {
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
    let summary = '';
    if (ptsPerGame >= 2.3) summary = '🔥 Incredible form – title contenders!';
    else if (ptsPerGame >= 1.8) summary = '👍 Solid season.';
    else if (ptsPerGame >= 1.2) summary = '⚖️ Mid‑table consistency.';
    else summary = '⚠️ Needs improvement to avoid relegation.';
    if (team.deductedPoints > 0) summary += ` (Includes -${team.deductedPoints} point penalty)`;
    document.getElementById('modal-summary').innerText = summary;
    document.getElementById('team-modal').classList.remove('hidden');
    document.getElementById('team-modal').classList.add('flex');
};
window.closeTeamModal = function() {
    document.getElementById('team-modal').classList.add('hidden');
    document.getElementById('team-modal').classList.remove('flex');
};
window.resetTournament = () => { if(confirm("Wipe ALL data?")) db.ref('tournament_data').remove().then(()=>location.reload()); };
window.onload = () => { initRealtimeDatabaseSync(); };