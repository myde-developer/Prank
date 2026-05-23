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
let tickerInterval = null;
let currentTickerFactIndex = 0;
let tickerFacts = [];
let activePredictorFixtureId = null;

// Banter room state
let currentBanterFixtureId = null;
let banterUnsubscribe = null;

// Countdown timers intervals storage
let countdownIntervals = {};

// NOTIFICATION TRACKING (Feature 3)
let previousFixtures = []; // store previous fixture states to detect new results
let notificationPermissionGranted = false;

// Helper: get unique user ID for predictions & banter
function getUserId() {
    let uid = localStorage.getItem('banter_userId');
    if (!uid) {
        uid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        localStorage.setItem('banter_userId', uid);
    }
    return uid;
}

function getNickname() {
    let nick = localStorage.getItem('banter_nickname');
    if (!nick) {
        nick = prompt("Enter your nickname for Banter & Predictions:", "Fan_" + Math.floor(Math.random()*1000));
        if (!nick) nick = "Anonymous";
        localStorage.setItem('banter_nickname', nick);
    }
    return nick;
}

// Toast
function showToast(msg) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// Request notification permission (Feature 3)
function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Browser does not support notifications");
        return;
    }
    if (Notification.permission === "granted") {
        notificationPermissionGranted = true;
    } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                notificationPermissionGranted = true;
                showToast("🔔 Notifications enabled – you'll get live match updates!");
            }
        });
    }
}

// Send desktop notification (Feature 3)
function sendMatchNotification(fixture) {
    if (!notificationPermissionGranted) return;
    const title = `⚽ Match Result: ${fixture.home} vs ${fixture.away}`;
    const body = `${fixture.home} ${fixture.homeScore} - ${fixture.awayScore} ${fixture.away}\n${fixture.comment || "Match completed."}`;
    const notification = new Notification(title, { body, icon: "https://firebasestorage.googleapis.com/v0/b/dls-premier-league.appspot.com/o/ball.png?alt=media" });
    notification.onclick = () => {
        window.focus();
        notification.close();
        // Optional: highlight the fixture in the UI
        const fixtureEl = document.getElementById(`fixture-${fixture.id}`);
        if (fixtureEl) fixtureEl.scrollIntoView({ behavior: "smooth", block: "center" });
    };
}

// Detect newly played matches from Firebase sync (Feature 3)
function checkForNewMatchResults(newFixtures) {
    if (!previousFixtures.length) {
        // first load, just store deep copy
        previousFixtures = JSON.parse(JSON.stringify(newFixtures));
        return;
    }
    // Find fixtures that were not played before but are now played
    for (let i = 0; i < newFixtures.length; i++) {
        const newF = newFixtures[i];
        const oldF = previousFixtures.find(f => f.id === newF.id);
        if (oldF && !oldF.played && newF.played) {
            // New result detected!
            sendMatchNotification(newF);
        }
    }
    // Update stored previous fixtures
    previousFixtures = JSON.parse(JSON.stringify(newFixtures));
}

function saveToStorage() {
    db.ref('tournament_data').set({ teams, fixtures, password: tournamentPassword });
}

function clearBanterForFixture(fixtureId) {
    db.ref(`banter/${fixtureId}`).remove().catch(e => console.error);
}

function clearBanterForRound(roundNumber) {
    fixtures.filter(f => f.round === roundNumber).forEach(f => clearBanterForFixture(f.id));
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
            const newFixtures = data.fixtures;
            
            // Detect new match results for notifications (Feature 3)
            checkForNewMatchResults(newFixtures);
            fixtures = newFixtures;
            
            document.getElementById('setup-section')?.classList.add('hidden');
            document.getElementById('dashboard-section')?.classList.remove('hidden');
            document.getElementById('admin-toggle-container')?.classList.remove('hidden');
            updateTableCalculations();
            renderTable();
            renderGameweekTabs();
            renderFixtures();
            generateTickerFacts();
            startAllCountdowns();
            document.title = `DLS | ${Object.keys(teams).length} teams • Live`;
        } else {
            tournamentPassword = "1234";
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            const tickerEl = document.getElementById('news-ticker');
            if (tickerEl) tickerEl.innerHTML = "⚽ Ready to create your league";
            // reset previous fixtures
            previousFixtures = [];
        }
    }, (error) => { showToast("Firebase connection issue"); });
}

// Countdown timers
function startAllCountdowns() {
    for (let id in countdownIntervals) clearInterval(countdownIntervals[id]);
    countdownIntervals = {};
    fixtures.forEach(f => {
        if (!f.played && f.matchDateTime) {
            updateCountdownDisplay(f.id);
            countdownIntervals[f.id] = setInterval(() => updateCountdownDisplay(f.id), 1000);
        }
    });
}

function updateCountdownDisplay(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture || fixture.played || !fixture.matchDateTime) return;
    const target = new Date(fixture.matchDateTime).getTime();
    const now = Date.now();
    const diff = target - now;
    if (diff <= 0) {
        const el = document.getElementById(`countdown-${fixtureId}`);
        if (el) el.innerHTML = '';
        if (countdownIntervals[fixtureId]) clearInterval(countdownIntervals[fixtureId]);
        return;
    }
    const days = Math.floor(diff / (1000*60*60*24));
    const hours = Math.floor((diff % (86400000)) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    let text = '';
    if (days > 0) text = `${days}d ${hours}h`;
    else if (hours > 0) text = `${hours}h ${mins}m`;
    else if (mins > 0) text = `${mins}m ${secs}s`;
    else text = `${secs}s`;
    const el = document.getElementById(`countdown-${fixtureId}`);
    if (el) el.innerHTML = `<span class="countdown-timer">⏰ ${text}</span>`;
}

// ============================================================
// 4. TICKER
// ============================================================
function updateTickerFacts() {
    if (!tickerFacts.length) return;
    const tickerEl = document.getElementById('news-ticker');
    if (!tickerEl) return;
    tickerEl.classList.add('slide-out');
    setTimeout(() => {
        currentTickerFactIndex = (currentTickerFactIndex + 1) % tickerFacts.length;
        tickerEl.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></span> ${tickerFacts[currentTickerFactIndex]}</span>`;
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
        `⚽ ${totalTeams} teams competing.`,
        `📊 ${totalMatchesPlayed} of ${totalMatches} matches played.`,
        leader ? `👑 Leader: ${leader.name} (${leader.pts} pts)` : null,
        topScorer ? `🔥 Top scorer: ${topScorer.name} (${topScorer.gf})` : null,
        biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore}-${biggestWin.awayScore} ${biggestWin.away}` : null,
        `🔮 Make your predictions for upcoming matches!`,
        `🗣️ Join the Banter Room for live chat.`
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
// 5. ADMIN MODE (unchanged)
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

function openChangePasswordModal() { if (!isAdmin) return; document.getElementById('new-password').value = ''; document.getElementById('confirm-password').value = ''; document.getElementById('password-match-error').classList.add('hidden'); document.getElementById('change-password-modal').classList.remove('hidden'); document.getElementById('change-password-modal').classList.add('flex'); }
function closeChangePasswordModal() { document.getElementById('change-password-modal').classList.add('hidden'); document.getElementById('change-password-modal').classList.remove('flex'); }
function updateMasterPassword() {
    const newPass = document.getElementById('new-password').value.trim();
    const confirmPass = document.getElementById('confirm-password').value.trim();
    if (newPass === '') { showToast('Password cannot be empty'); return; }
    if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; }
    tournamentPassword = newPass;
    saveToStorage();
    showToast('Master password updated!');
    closeChangePasswordModal();
}

let currentPenaltyTeam = null;
function openPenaltyModal(teamName) { if (!isAdmin) return; currentPenaltyTeam = teamName; document.getElementById('penalty-team-name').innerText = teamName; document.getElementById('penalty-modal').classList.remove('hidden'); document.getElementById('penalty-modal').classList.add('flex'); }
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); document.getElementById('penalty-modal').classList.remove('flex'); currentPenaltyTeam = null; }
function clearPenaltyPoints() {
    if (!currentPenaltyTeam) return;
    const team = teams[currentPenaltyTeam];
    if (!team) return;
    if (team.deductedPoints === 0) { showToast(`${currentPenaltyTeam} has no penalty points.`); closePenaltyModal(); return; }
    team.deductedPoints = 0;
    saveToStorage();
    showToast(`Penalty cleared for ${currentPenaltyTeam}`);
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
        container.innerHTML += `<div class="bg-gray-50 p-3 rounded-xl border border-gray-200"><div class="flex items-center gap-2 mb-2"><span class="bg-gray-200 text-gray-600 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${i}</span><input type="text" id="team-input-${i}" placeholder="Club name" class="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm"></div></div>`;
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
            teams[item.name] = { name: item.name, mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0, deductedPoints:0, formHistory: [] };
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
                fixtures.push({ id: fixtures.length, round: r+1, home: list[homeIdx].name, away: list[awayIdx].name, homeScore: null, awayScore: null, played: false, comment: null, matchDateTime: null });
            }
        }
    }
    currentSelectedRound = 1;
    db.ref('banter').remove();
    db.ref('predictions').remove();
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
    clearBanterForRound(roundNumber);
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
    clearBanterForFixture(fixtureId);
    saveToStorage();
    showToast(`Swapped ${fixture.home} vs ${fixture.away}`);
    renderFixtures();
    renderTable();
    generateTickerFacts();
}

let pendingAssignFixtureId = null, pendingAssignSide = null;
window.editFixtureTeamName = function(fixtureId, side) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
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
        clearBanterForFixture(fixture.id);
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
    clearBanterForFixture(fixture.id);
    saveToStorage();
    showToast(`Assigned ${newTeam} to ${side === 'home' ? 'home' : 'away'} side.`);
    renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
};

let currentDatetimeFixtureId = null;
function openDatetimeModal(fixtureId) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    currentDatetimeFixtureId = fixtureId;
    document.getElementById('datetime-fixture-name').innerText = `${fixture.home} vs ${fixture.away}`;
    const input = document.getElementById('match-datetime');
    if (fixture.matchDateTime) {
        const d = new Date(fixture.matchDateTime);
        input.value = d.toISOString().slice(0, 16);
    } else {
        input.value = '';
    }
    document.getElementById('datetime-modal').classList.remove('hidden');
    document.getElementById('datetime-modal').classList.add('flex');
}
function closeDatetimeModal() {
    document.getElementById('datetime-modal').classList.add('hidden');
    document.getElementById('datetime-modal').classList.remove('flex');
    currentDatetimeFixtureId = null;
}
function saveMatchDatetime() {
    if (currentDatetimeFixtureId === null) return;
    const val = document.getElementById('match-datetime').value;
    const fixture = fixtures.find(f => f.id === currentDatetimeFixtureId);
    if (val) {
        fixture.matchDateTime = new Date(val).toISOString();
    } else {
        fixture.matchDateTime = null;
    }
    saveToStorage();
    showToast(`Match date/time ${val ? 'set' : 'cleared'}`);
    renderFixtures();
    startAllCountdowns();
    closeDatetimeModal();
}

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
        tbody.innerHTML += `<tr class="hover:bg-gray-50 transition ${rowClass}" onclick="showTeamDetails('${team.name}')"><td class="py-3 px-3 text-center font-bold ${pos===1?'text-indigo-600':''}">${pos}</td><td class="py-3 px-4"><span class="font-semibold text-base">${team.name}</span>${penaltyBadge}</td><td class="py-3 px-2 text-center">${team.mp}</td><td class="py-3 px-2 text-center text-emerald-600">${team.w}</td><td class="py-3 px-2 text-center">${team.d}</td><td class="py-3 px-2 text-center text-rose-500">${team.l}</td><td class="py-3 px-2 text-center">${team.gf}</td><td class="py-3 px-2 text-center">${team.ga}</td><td class="py-3 px-2 text-center ${team.gd>=0?'text-emerald-600':'text-rose-500'} font-mono">${team.gd>0?'+'+team.gd:team.gd}</td><td class="py-3 px-3 text-center font-black text-indigo-600">${team.pts}</td><td class="py-3 px-4 text-center">${formHtml}</td>${actionBtn}</tr>`;
    });
    generateTickerFacts();
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
        const countdownHtml = (!played && f.matchDateTime) ? `<div id="countdown-${f.id}" class="text-center mt-1"></div>` : '';
        if (isAdmin) {
            midHtml = `<div class="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full"><input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"><span class="text-gray-400">:</span><input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"></div>`;
            actionHtml = `<div class="flex flex-wrap gap-1 justify-center"><button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full">🔄 Swap</button><button onclick="openDatetimeModal(${f.id})" class="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-1 rounded-full">⏰ Date</button><button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">💾 Save</button><button onclick="showMatchComment(${f.id})" class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full">💬</button><button onclick="openBanterRoom(${f.id})" class="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded-full">🗣️</button></div>`;
            const homeNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'home')">${f.home}</span>`;
            const awayNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'away')">${f.away}</span>`;
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full" id="fixture-${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 flex items-center justify-center gap-2 text-center ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${homeNameHtml}</div><div class="flex items-center justify-center">${midHtml}</div><div class="flex-1 flex items-center justify-center gap-2 text-center ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${awayNameHtml}</div></div><div class="mt-2 flex justify-center">${actionHtml}</div>${countdownHtml}</div>`;
        } else {
            midHtml = played ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm cursor-pointer hover:bg-indigo-50" onclick="runMatchPrediction(${f.id})">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="openPredictionModal(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predict</button>`;
            actionHtml = `<button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">💬</button><button onclick="openBanterRoom(${f.id})" class="text-[11px] bg-purple-100 hover:bg-purple-200 px-3 py-1 rounded-full">🗣️</button>`;
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full" id="fixture-${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${f.home}</div><div class="flex justify-center">${midHtml}</div><div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${f.away}</div></div><div class="mt-2 flex justify-center">${actionHtml}</div>${countdownHtml}</div>`;
        }
    });
    startAllCountdowns();
}

// ============================================================
// 11. MATCH COMMENTS (unchanged, but notifications now happen automatically via sync)
// ============================================================
let currentViewerFixtureId = null;
window.showMatchComment = function(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    currentViewerFixtureId = fixtureId;
    document.getElementById('viewer-match-name').innerHTML = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('viewer-score').innerText = fixture.played ? `${fixture.homeScore} - ${fixture.awayScore}` : 'Not played yet';
    document.getElementById('viewer-comment').innerText = fixture.comment || (fixture.played ? 'No comment added.' : 'Match not played yet.');
    const editBtn = document.getElementById('viewer-edit-btn');
    if (isAdmin && fixture.played) editBtn.classList.remove('hidden');
    else editBtn.classList.add('hidden');
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
    document.getElementById('comment-viewer-modal').classList.add('flex');
};
window.closeCommentViewer = function() { document.getElementById('comment-viewer-modal').classList.add('hidden'); document.getElementById('comment-viewer-modal').classList.remove('flex'); currentViewerFixtureId = null; };
window.editViewerComment = function() {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === currentViewerFixtureId);
    if (!fixture || !fixture.played) return;
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
    } else if (margin >= 3) comment = `🔥 ${winner} destroyed ${loser} ${Math.max(homeScore,awayScore)}-${Math.min(homeScore,awayScore)}!`;
    else if (margin === 2) comment = `📈 ${winner} secured a comfortable win over ${loser}.`;
    else comment = `⚡ Narrow victory! ${winner} edged past ${loser}.`;
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
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save a match with BYE team."); return; }
    const draft = generateMatchComment(fixture.home, fixture.away, parseInt(homeScore), parseInt(awayScore));
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    document.getElementById('comment-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('comment-text').value = draft;
    document.getElementById('comment-modal').classList.remove('hidden');
    document.getElementById('comment-modal').classList.add('flex');
};
window.closeCommentModal = function(save = false) { document.getElementById('comment-modal').classList.add('hidden'); document.getElementById('comment-modal').classList.remove('flex'); if (!save) pendingFixtureId = null; };
window.confirmComment = async function() {
    if (pendingFixtureId === null) return;
    const finalComment = document.getElementById('comment-text').value.trim();
    if (finalComment === "") { alert("Comment cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    fixture.comment = finalComment;
    await saveToStorage();
    showToast(`Result saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`);
    await awardPredictionPoints(fixture.id, pendingHomeScore, pendingAwayScore);
    await postAutoMatchReport(fixture.id, pendingHomeScore, pendingAwayScore);
    closeCommentModal(true);
    pendingFixtureId = null;
    renderTable();
    renderFixtures();
};

// ============================================================
// 12. PREDICTOR LEADERBOARD & PREDICTIONS
// ============================================================
let currentPredictionFixtureId = null;
window.openPredictionModal = function(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture || fixture.played) {
        alert("Cannot predict on an already played match.");
        return;
    }
    currentPredictionFixtureId = fixtureId;
    document.getElementById('prediction-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    document.getElementById('prediction-home-score').value = '';
    document.getElementById('prediction-away-score').value = '';
    document.getElementById('prediction-modal').classList.remove('hidden');
    document.getElementById('prediction-modal').classList.add('flex');
};
window.closePredictionModal = function() {
    document.getElementById('prediction-modal').classList.add('hidden');
    document.getElementById('prediction-modal').classList.remove('flex');
    currentPredictionFixtureId = null;
};
window.submitPrediction = async function() {
    if (currentPredictionFixtureId === null) return;
    const homeScore = parseInt(document.getElementById('prediction-home-score').value);
    const awayScore = parseInt(document.getElementById('prediction-away-score').value);
    if (isNaN(homeScore) || isNaN(awayScore)) {
        alert("Please enter valid numbers.");
        return;
    }
    const userId = getUserId();
    const nickname = getNickname();
    const fixture = fixtures.find(f => f.id === currentPredictionFixtureId);
    if (fixture.played) {
        alert("Match already played – predictions closed.");
        closePredictionModal();
        return;
    }
    const predictionRef = db.ref(`predictions/${currentPredictionFixtureId}/${userId}`);
    await predictionRef.set({
        homeScore: homeScore,
        awayScore: awayScore,
        nickname: nickname,
        timestamp: Date.now()
    });
    showToast("Prediction submitted!");
    closePredictionModal();
};

async function awardPredictionPoints(fixtureId, actualHome, actualAway) {
    const snapshot = await db.ref(`predictions/${fixtureId}`).once('value');
    const predictions = snapshot.val();
    if (!predictions) return;
    for (let userId in predictions) {
        const pred = predictions[userId];
        let points = 0;
        if (pred.homeScore === actualHome && pred.awayScore === actualAway) {
            points = 3;
        } else if (
            (actualHome > actualAway && pred.homeScore > pred.awayScore) ||
            (actualHome < actualAway && pred.homeScore < pred.awayScore) ||
            (actualHome === actualAway && pred.homeScore === pred.awayScore)
        ) {
            points = 1;
        }
        if (points > 0) {
            const userPointsRef = db.ref(`predictor_leaderboard/${userId}`);
            const current = (await userPointsRef.get()).val() || 0;
            await userPointsRef.set(current + points);
        }
    }
    await db.ref(`predictions/${fixtureId}`).remove();
}

window.openPredictorLeaderboard = async function() {
    const snapshot = await db.ref('predictor_leaderboard').once('value');
    const leaderboard = snapshot.val() || {};
    const entries = [];
    for (let userId in leaderboard) {
        entries.push({ userId, points: leaderboard[userId] });
    }
    entries.sort((a,b) => b.points - a.points);
    const container = document.getElementById('leaderboard-list');
    container.innerHTML = '';
    if (entries.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center">No predictions yet. Be the first!</p>';
    } else {
        entries.forEach((entry, idx) => {
            const displayName = entry.userId.substring(0, 8) + '...';
            container.innerHTML += `<div class="flex justify-between items-center p-2 bg-gray-50 rounded-lg"><span class="font-mono text-sm">${idx+1}. ${displayName}</span><span class="font-bold text-indigo-600">${entry.points} pts</span></div>`;
        });
    }
    document.getElementById('predictor-leaderboard-modal').classList.remove('hidden');
    document.getElementById('predictor-leaderboard-modal').classList.add('flex');
};
window.closePredictorLeaderboard = function() {
    document.getElementById('predictor-leaderboard-modal').classList.add('hidden');
    document.getElementById('predictor-leaderboard-modal').classList.remove('flex');
};

// ============================================================
// 13. AUTO MATCH REPORT
// ============================================================
async function postAutoMatchReport(fixtureId, homeScore, awayScore) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    const message = `📢 **OFFICIAL MATCH REPORT**\n${fixture.home} ${homeScore} - ${awayScore} ${fixture.away}\n${fixture.comment || ''}`;
    const messagesRef = db.ref(`banter/${fixtureId}/messages`).push();
    await messagesRef.set({
        nickname: "📢 Match Bot",
        text: message,
        timestamp: Date.now(),
        userId: "system_bot",
        isSystem: true
    });
}

// ============================================================
// 14. BANTER ROOM (with edit/delete)
// ============================================================
window.openBanterRoom = function(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    currentBanterFixtureId = fixtureId;
    document.getElementById('banter-match-name').innerText = `${fixture.home} vs ${fixture.away}`;
    const modal = document.getElementById('banter-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (banterUnsubscribe) banterUnsubscribe();
    const messagesRef = db.ref(`banter/${fixtureId}/messages`);
    banterUnsubscribe = messagesRef.on('value', (snapshot) => {
        const container = document.getElementById('banter-messages-container');
        container.innerHTML = '';
        const messages = [];
        snapshot.forEach(child => messages.push({ id: child.key, ...child.val() }));
        messages.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
        const currentUserId = getUserId();
        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `banter-message relative group ${msg.isSystem ? 'bg-indigo-50 border-l-4 border-indigo-300' : 'bg-gray-100'}`;
            div.innerHTML = `
                <strong>${escapeHtml(msg.nickname)}</strong> 
                <span>${escapeHtml(msg.text)}</span>
                <span class="banter-timestamp">${new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                ${(!msg.isSystem && (msg.userId === currentUserId || isAdmin)) ? `
                    <div class="absolute right-0 top-0 hidden group-hover:flex gap-1 bg-white rounded-full shadow px-1">
                        <button onclick="editBanterMessage('${fixtureId}', '${msg.id}', '${escapeHtml(msg.text).replace(/'/g, "\\'")}')" class="text-indigo-500 hover:text-indigo-700 text-xs px-1">✏️</button>
                        <button onclick="deleteBanterMessage('${fixtureId}', '${msg.id}')" class="text-rose-500 hover:text-rose-700 text-xs px-1">🗑️</button>
                    </div>
                ` : ''}
            `;
            container.appendChild(div);
        });
        container.scrollTop = container.scrollHeight;
    });
    const clearBtn = document.getElementById('banter-clear-btn');
    if (isAdmin) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
};
window.closeBanterModal = function() {
    if (banterUnsubscribe) banterUnsubscribe();
    document.getElementById('banter-modal').classList.add('hidden');
    document.getElementById('banter-modal').classList.remove('flex');
    currentBanterFixtureId = null;
};
window.sendBanterMessage = function() {
    if (currentBanterFixtureId === null) return;
    const nickname = getNickname();
    const messageInput = document.getElementById('banter-message');
    const text = messageInput.value.trim();
    if (text === "") return;
    const messagesRef = db.ref(`banter/${currentBanterFixtureId}/messages`).push();
    messagesRef.set({
        nickname: nickname,
        text: text,
        timestamp: Date.now(),
        userId: getUserId()
    }).then(() => { messageInput.value = ""; }).catch(e => showToast("Failed"));
};
window.editBanterMessage = function(fixtureId, messageId, oldText) {
    const newText = prompt("Edit your message:", oldText);
    if (newText === null || newText.trim() === "") return;
    db.ref(`banter/${fixtureId}/messages/${messageId}`).update({ text: newText.trim() }).catch(e => showToast("Edit failed"));
};
window.deleteBanterMessage = function(fixtureId, messageId) {
    if (!confirm("Delete this message?")) return;
    db.ref(`banter/${fixtureId}/messages/${messageId}`).remove().catch(e => showToast("Delete failed"));
};
window.clearBanterRoom = function() {
    if (!isAdmin) return;
    if (currentBanterFixtureId === null) return;
    if (confirm("Delete ALL messages for this match?")) {
        db.ref(`banter/${currentBanterFixtureId}`).remove().then(() => showToast("Cleared")).catch(e => showToast("Error"));
    }
};
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, function(m) { if (m === '&') return '&amp;'; if (m === '<') return '&lt;'; if (m === '>') return '&gt;'; return m; }); }

// ============================================================
// 15. OTHER TEAM MANAGEMENT & RESET
// ============================================================
window.removeTeamFromLeague = function(teamName) {
    if(!isAdmin) return;
    if(confirm(`Permanently remove ${teamName}?`)) {
        fixtures.forEach(f => {
            if(f.home === teamName) f.home = 'BYE';
            if(f.away === teamName) f.away = 'BYE';
            f.played = false;
            f.homeScore = null;
            f.awayScore = null;
            f.comment = null;
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
window.closeTeamModal = function() { document.getElementById('team-modal').classList.add('hidden'); document.getElementById('team-modal').classList.remove('flex'); };
window.resetTournament = () => { if(confirm("Wipe ALL data?")) { db.ref('tournament_data').remove(); db.ref('banter').remove(); db.ref('predictions').remove(); db.ref('predictor_leaderboard').remove(); location.reload(); } };

// ============================================================
// 16. WHAT-IF PREDICTOR MODAL
// ============================================================
window.runMatchPrediction = function(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f) return;
    if (f.home === 'BYE' || f.away === 'BYE') { alert("Cannot simulate BYE team."); return; }
    activePredictorFixtureId = fixtureId;
    document.getElementById('pred-home-name').innerText = f.home;
    document.getElementById('pred-away-name').innerText = f.away;
    document.getElementById('pred-home-score').value = f.played ? f.homeScore : '';
    document.getElementById('pred-away-score').value = f.played ? f.awayScore : '';
    document.getElementById('pred-table-container').classList.add('hidden');
    document.getElementById('pred-table-body').innerHTML = '';
    document.getElementById('predictor-modal').classList.remove('hidden');
    document.getElementById('predictor-modal').classList.add('flex');
};
window.closePredictorModal = () => { document.getElementById('predictor-modal').classList.add('hidden'); document.getElementById('predictor-modal').classList.remove('flex'); activePredictorFixtureId = null; };
window.calculatePredictedTable = function() {
    if (activePredictorFixtureId === null) return;
    const homeInput = document.getElementById('pred-home-score').value;
    const awayInput = document.getElementById('pred-away-score').value;
    if (homeInput === "" || awayInput === "") { alert("Enter both scores"); return; }
    const simHomeScore = parseInt(homeInput);
    const simAwayScore = parseInt(awayInput);
    let simulatedTeams = {};
    for (let t in teams) {
        simulatedTeams[t] = { name: teams[t].name, mp: teams[t].mp, w: teams[t].w, d: teams[t].d, l: teams[t].l, gf: teams[t].gf, ga: teams[t].ga, gd: teams[t].gd, pts: teams[t].pts, deductedPoints: teams[t].deductedPoints || 0 };
    }
    const f = fixtures.find(f => f.id === activePredictorFixtureId);
    const h = f.home, a = f.away;
    if (f.played) {
        const oldH = parseInt(f.homeScore), oldA = parseInt(f.awayScore);
        simulatedTeams[h].mp--; simulatedTeams[a].mp--;
        simulatedTeams[h].gf -= oldH; simulatedTeams[h].ga -= oldA;
        simulatedTeams[a].gf -= oldA; simulatedTeams[a].ga -= oldH;
        if (oldH > oldA) { simulatedTeams[h].w--; simulatedTeams[a].l--; simulatedTeams[h].pts -= 3; }
        else if (oldA > oldH) { simulatedTeams[a].w--; simulatedTeams[h].l--; simulatedTeams[a].pts -= 3; }
        else { simulatedTeams[h].d--; simulatedTeams[a].d--; simulatedTeams[h].pts -= 1; simulatedTeams[a].pts -= 1; }
    }
    simulatedTeams[h].mp++; simulatedTeams[a].mp++;
    simulatedTeams[h].gf += simHomeScore; simulatedTeams[h].ga += simAwayScore;
    simulatedTeams[a].gf += simAwayScore; simulatedTeams[a].ga += simHomeScore;
    if (simHomeScore > simAwayScore) { simulatedTeams[h].w++; simulatedTeams[a].l++; simulatedTeams[h].pts += 3; }
    else if (simAwayScore > simHomeScore) { simulatedTeams[a].w++; simulatedTeams[h].l++; simulatedTeams[a].pts += 3; }
    else { simulatedTeams[h].d++; simulatedTeams[a].d++; simulatedTeams[h].pts += 1; simulatedTeams[a].pts += 1; }
    for (let t in simulatedTeams) simulatedTeams[t].gd = simulatedTeams[t].gf - simulatedTeams[t].ga;
    let sortedSim = Object.values(simulatedTeams).sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf);
    const tbody = document.getElementById('pred-table-body');
    tbody.innerHTML = "";
    sortedSim.forEach((team, idx) => {
        const isTarget = (team.name === h || team.name === a);
        const highlightClass = isTarget ? "bg-indigo-50/80 font-bold text-gray-900" : "text-gray-600";
        tbody.innerHTML += `<tr class="${highlightClass}"><td class="py-2 px-3 text-center font-black ${idx === 0 ? 'text-indigo-600' : ''}">${idx + 1}<tr><td class="py-2 px-3 truncate max-w-[120px]">${team.name} ${isTarget ? '⚡' : ''}</td><td class="py-2 px-2 text-center">${team.mp}</td><td class="py-2 px-2 text-center font-mono ${team.gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${team.gd > 0 ? '+' + team.gd : team.gd}</td><td class="py-2 px-3 text-center text-indigo-600 font-extrabold">${team.pts}</tr>`;
    });
    document.getElementById('pred-table-container').classList.remove('hidden');
};

// ============================================================
// 17. INITIALIZATION
// ============================================================
window.onload = () => {
    requestNotificationPermission();
    initRealtimeDatabaseSync();
};