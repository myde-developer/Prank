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
const storage = firebase.storage();

let teams = {}, fixtures = [], knockoutMatches = [], tournamentPhase = 'league';
let currentSelectedRound = 1, isAdmin = false, tournamentPassword = "";
let tickerInterval = null, currentTickerFactIndex = 0, tickerFacts = [];
let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
let currentPenaltyTeam = null, pendingAssignFixtureId = null, pendingAssignSide = null, currentViewerFixtureId = null;
let currentPredictionFixtureId = null, currentBanterFixtureId = null;
let autoStartNextRound = false;
let roundStartTimes = {};

// Chat globals
let chatMessagesRef = null;
let chatTypingRef = null;
let chatPresenceRef = null;
let messages = [];
let replyingTo = null;
let currentDarkMode = localStorage.getItem('chatDarkMode') === 'true';
let typingTimeout = null;

// Role selection
let userRole = null;

// ==================== ROLE SELECTION ====================
function selectRole(role) {
    userRole = role;
    sessionStorage.setItem('tournamentRole', role);
    document.getElementById('role-selector').style.display = 'none';
    
    if (role === 'admin') {
        const entered = prompt("Enter admin master password:");
        if (entered === null) { location.reload(); return; }
        db.ref('tournament_data/password').once('value', (snapshot) => {
            const storedPass = snapshot.val();
            const validPassword = storedPass ? entered === storedPass : entered === "1234";
            if (validPassword) {
                isAdmin = true;
                showToast("Admin access granted");
                checkAndLoadTournament();
            } else {
                alert("Wrong password. Reload to try again.");
                location.reload();
            }
        });
    } else {
        isAdmin = false;
        checkAndLoadTournament();
    }
}

function checkAndLoadTournament() {
    db.ref('tournament_data').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.teams && data.fixtures) {
            loadTournamentData(data);
            if (userRole === 'viewer') {
                document.getElementById('admin-toggle-container')?.classList.add('hidden');
                document.getElementById('admin-reset-container')?.classList.add('hidden');
                document.getElementById('floating-admin-menu')?.classList.add('hidden');
                document.getElementById('auto-start-container')?.classList.add('hidden');
                document.getElementById('th-admin-actions')?.classList.add('hidden');
                document.getElementById('admin-table-hint')?.classList.add('hidden');
                document.getElementById('relegation-zone')?.classList.add('hidden');
            } else if (userRole === 'admin') {
                document.getElementById('admin-toggle-container')?.classList.remove('hidden');
            }
        } else {
            if (userRole === 'viewer') {
                document.getElementById('dashboard-section')?.classList.add('hidden');
                document.getElementById('setup-section')?.classList.add('hidden');
                const roleSelector = document.getElementById('role-selector');
                if (roleSelector) {
                    roleSelector.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">...</div>`;
                    roleSelector.style.display = 'flex';
                }
            } else if (userRole === 'admin') {
                document.getElementById('setup-section')?.classList.remove('hidden');
                document.getElementById('dashboard-section')?.classList.add('hidden');
                document.getElementById('role-selector')?.remove();
                document.getElementById('step-1').classList.remove('hidden');
                document.getElementById('step-2').classList.add('hidden');
                document.getElementById('team-inputs-container').innerHTML = '';
                document.getElementById('admin-toggle-container')?.classList.add('hidden');
                document.getElementById('floating-admin-menu')?.classList.add('hidden');
                showToast("Setup mode – create your tournament");
            }
        }
    });
}

function loadTournamentData(data) {
    tournamentPassword = data.password || "1234";
    teams = data.teams;
    fixtures = data.fixtures;
    knockoutMatches = data.knockoutMatches || [];
    tournamentPhase = data.tournamentPhase || 'league';
    roundStartTimes = data.roundStartTimes || {};
    autoStartNextRound = data.autoStartNextRound || false;
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
    document.getElementById('deadline-clock')?.classList.remove('hidden');
    initBackToTop();
    startDeadlineClock();
    initWhatsAppChat(); // start the new chat
    if (userRole === 'admin') updateAdminUIElements();
}

// ==================== HELPERS ====================
function showToast(msg) {
    const c = document.getElementById("toast-container");
    if (c) { let t = document.createElement("div"); t.className = "toast"; t.innerText = msg; c.appendChild(t); setTimeout(() => t.remove(), 2500); }
}
function saveToStorage() { 
    db.ref('tournament_data').set({ teams, fixtures, knockoutMatches, tournamentPhase, password: tournamentPassword, roundStartTimes, autoStartNextRound }); 
}
function getCurrentUserId() {
    let id = localStorage.getItem('chatUserId');
    if (!id) {
        id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('chatUserId', id);
    }
    return id;
}

// ==================== RANDOMIZED FIXTURE GENERATION ====================
function generateRandomRoundRobin(teamNames) {
    let n = teamNames.length;
    if (n % 2 !== 0) {
        teamNames.push("BYE");
        n++;
    }
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
                if (Math.random() < 0.5) roundFixtures.push({ home, away });
                else roundFixtures.push({ home: away, away: home });
            }
        }
        rounds.push(roundFixtures);
        const last = shuffled.pop();
        shuffled.splice(1, 0, last);
    }
    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }
    return rounds;
}

// ==================== TOURNAMENT SETUP ====================
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter at least 2 teams"); return; }
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
        if (item.name !== "BYE") teams[item.name] = { 
            name: item.name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, 
            deductedPoints: 0, formHistory: [], relegated: false 
        }; 
    });
    const teamNames = Object.keys(teams);
    const rounds = generateRandomRoundRobin(teamNames);
    fixtures = [];
    let fixtureId = 0;
    rounds.forEach((roundFixtures, roundIndex) => {
        roundFixtures.forEach(({ home, away }) => {
            fixtures.push({ 
                id: fixtureId++, round: roundIndex + 1, home, away,
                homeScore: null, awayScore: null, played: false, cancelled: false,
                comment: null, predictions: [], banter: [], events: [], report: null, deadline: null
            });
        });
    });
    tournamentPhase = 'league';
    knockoutMatches = [];
    roundStartTimes = {};
    autoStartNextRound = false;
    currentSelectedRound = 1;
    saveToStorage();
    showToast(`Tournament launched with ${count} teams!`);
}

// ==================== FIXTURE MANAGEMENT ====================
function shuffleRound(roundNumber) {
    if (!isAdmin) return;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    if (!roundFixtures.length) return;
    const teamsInRound = [];
    roundFixtures.forEach(f => { if (f.home !== 'BYE') teamsInRound.push(f.home); if (f.away !== 'BYE') teamsInRound.push(f.away); });
    let uniqueTeams = [...new Set(teamsInRound)];
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
    roundFixtures.forEach((f, idx) => { 
        if (idx < newPairs.length) { 
            f.home = newPairs[idx].home; f.away = newPairs[idx].away; 
            f.homeScore = null; f.awayScore = null; f.played = false; f.comment = null; f.cancelled = false; 
        } 
    });
    saveToStorage(); 
    showToast(`Round ${roundNumber} shuffled!`); 
    renderGameweekTabs(); renderFixtures(); renderTable(); generateTickerFacts();
}

function swapFixture(fixtureId) { 
    if (!isAdmin) return; 
    const f = fixtures.find(f => f.id === fixtureId); 
    [f.home, f.away] = [f.away, f.home]; 
    f.homeScore = null; f.awayScore = null; f.played = false; f.comment = null; f.cancelled = false; 
    saveToStorage(); 
    showToast(`Swapped ${f.home} vs ${f.away}`); 
    renderFixtures(); renderTable(); generateTickerFacts(); 
}

function editFixtureTeamName(fixtureId, side) { 
    if (!isAdmin) return; 
    const fixture = fixtures.find(f => f.id === fixtureId); 
    const dropdown = document.getElementById('team-select-dropdown'); 
    dropdown.innerHTML = '<option value="">— Cancel / No change —</option>'; 
    const otherSide = side === 'home' ? fixture.away : fixture.home; 
    const teamNames = Object.values(teams).filter(t => !t.relegated).map(t => t.name).sort(); 
    teamNames.forEach(name => { 
        if (name !== otherSide) { 
            const opt = document.createElement('option'); 
            opt.value = name; opt.textContent = name; 
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
        if (side === 'home') fixture.home = 'BYE'; else fixture.away = 'BYE';
        fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null; fixture.cancelled = false;
        delete fixture.vacantHome; delete fixture.vacantAway;
        saveToStorage(); showToast(`Removed team, set to BYE`); 
        renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
        return;
    }
    const newTeam = selected;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    if (teams[newTeam]?.relegated) { showToast(`Cannot assign a relegated team.`); closeTeamSelectModal(); return; }
    const round = fixture.round;
    const otherFixtures = fixtures.filter(f => f.round === round && f.id !== fixture.id);
    if (otherFixtures.some(f => f.home === newTeam || f.away === newTeam)) { 
        showToast(`Team "${newTeam}" already has a fixture in this round!`); 
        closeTeamSelectModal(); return; 
    }
    if (side === 'home') { fixture.home = newTeam; delete fixture.vacantHome; }
    else { fixture.away = newTeam; delete fixture.vacantAway; }
    fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null; fixture.cancelled = false;
    saveToStorage(); showToast(`Assigned ${newTeam} to ${side} side.`); 
    renderFixtures(); renderTable(); generateTickerFacts(); closeTeamSelectModal();
}

// ==================== ADMIN: START ROUND ====================
function startRound(roundNumber) {
    if (!isAdmin) return;
    const now = Date.now();
    let activeRoundExists = false;
    for (let r in roundStartTimes) {
        if (roundStartTimes[r] && parseInt(r) !== roundNumber) {
            const deadline = roundStartTimes[r] + 2 * 24 * 60 * 60 * 1000;
            const roundFixtures = fixtures.filter(f => f.round === parseInt(r) && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
            const allResolved = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
            if (!allResolved && now < deadline) {
                activeRoundExists = true;
                break;
            }
        }
    }
    if (activeRoundExists) {
        showToast("Cannot start a new round – another round is still active!");
        return;
    }
    if (roundStartTimes[roundNumber] && roundStartTimes[roundNumber] !== null) {
        showToast(`Round ${roundNumber} already started!`);
        return;
    }
    roundStartTimes[roundNumber] = Date.now();
    saveToStorage();
    renderGameweekTabs();
    renderFixtures();
    showToast(`⏱️ Round ${roundNumber} started! 2‑day deadline begins now.`);
}

function stopRound(roundNumber) {
    if (!isAdmin) return;
    if (!roundStartTimes[roundNumber]) {
        showToast(`Round ${roundNumber} hasn't started yet.`);
        return;
    }
    delete roundStartTimes[roundNumber];
    saveToStorage();
    renderGameweekTabs();
    renderFixtures();
    showToast(`⏹️ Round ${roundNumber} timer stopped. You can start it again later.`);
}

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
    // Auto‑start next round if enabled
    if (autoStartNextRound && tournamentPhase === 'league') {
        let highestResolvedRound = 0;
        const maxRound = Math.max(...fixtures.map(f => f.round));
        for (let r = 1; r <= maxRound; r++) {
            const roundFixtures = fixtures.filter(f => f.round === r && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
            if (roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled)) highestResolvedRound = r;
            else break;
        }
        const nextRound = highestResolvedRound + 1;
        const nextRoundExists = fixtures.some(f => f.round === nextRound);
        if (nextRoundExists && !roundStartTimes[nextRound]) {
            startRound(nextRound);
        }
    }
}

// ==================== STANDINGS & KNOCKOUT TRIGGER ====================
function updateTableCalculations() {
    for (let t in teams) { 
        if (!teams[t].relegated) { 
            teams[t] = { ...teams[t], mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, formHistory: [] }; 
        } 
    }
    fixtures.forEach(f => {
        if (f.played && !f.cancelled && teams[f.home] && teams[f.away] && !teams[f.home].relegated && !teams[f.away].relegated && f.home !== "VACANT" && f.away !== "VACANT") {
            const h = f.home, a = f.away, hS = parseInt(f.homeScore), aS = parseInt(f.awayScore);
            teams[h].mp++; teams[a].mp++;
            teams[h].gf += hS; teams[h].ga += aS; teams[a].gf += aS; teams[a].ga += hS;
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
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    if (activeTeams.length === 4 && tournamentPhase === 'league' && knockoutMatches.length === 0) {
        startKnockoutStage(activeTeams);
    }
}

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
    if (!semis.every(s => s.played || s.cancelled)) return;
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

// Knockout admin actions
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
    if (typeof confetti === 'function') confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 }, startVelocity: 12, colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'] });
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
        let statusHtml = '', startBtnHtml = '', stopBtnHtml = '';
        if (allResolved) {
            statusHtml = `<span class="text-[9px] font-mono text-green-600 ml-1">✅ Completed</span>`;
        } else if (startTime) {
            const deadline = startTime + 2 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            if (now < deadline) {
                const hoursLeft = Math.max(0, Math.floor((deadline - now) / (1000 * 60 * 60)));
                const minutesLeft = Math.floor(((deadline - now) % (1000 * 60 * 60)) / (1000 * 60));
                statusHtml = `<span class="text-[9px] font-mono text-green-600 ml-1">⏳ ${hoursLeft}h ${minutesLeft}m</span>`;
                if (isAdmin) {
                    stopBtnHtml = `<button onclick="stopRound(${r})" class="ml-1 text-[9px] bg-red-100 text-red-700 px-1 py-0.5 rounded-full hover:bg-red-200">⏹️ Stop</button>`;
                }
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
        btn.innerHTML = `GW ${r} ${statusHtml} ${startBtnHtml} ${stopBtnHtml}`;
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
            let homeName, awayName;
            if (roundStart) {
                homeName = f.home === "VACANT" ? "TBD" : f.home;
                awayName = f.away === "VACANT" ? "TBD" : f.away;
            } else {
                homeName = "TBD";
                awayName = "TBD";
            }
            const predictionBtn = (!played && !roundActive) ? `<span class="text-[11px] text-gray-400 px-3 py-1 rounded-full bg-gray-100">⏸ Not started</span>` : (played ? `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="openPredictionsModal(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predictions</button>`);
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full fixture-card" data-fixture-id="${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${homeName}</div><div class="flex justify-center">${predictionBtn}${deadlineWarning}</div><div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${awayName}</div></div><div class="mt-2 flex justify-center gap-1"><button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">📖</button><button onclick="openBanterModal(${f.id})" class="text-[11px] bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full">🤣 Banter</button></div></div>`;
        }
    });
    if (window.deadlineInterval) clearInterval(window.deadlineInterval);
    window.deadlineInterval = setInterval(() => { expireOldFixtures(); renderFixtures(); }, 60000);
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

// ==================== RICH REPORT FROM EVENTS ====================
function generateRichReportFromEvents(home, away, homeScore, awayScore, events) {
    const goalEvents = events.filter(e => e.type === 'goal');
    let report = '';
    if (homeScore === awayScore) {
        report = `🤝 ${home} and ${away} shared the spoils in a ${homeScore}-${awayScore} draw.`;
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
        const assistText = first.assist ? ` (assisted by ${first.assist})` : '';
        const typeText = first.goalType === 'Open play' ? '' : ` (${first.goalType})`;
        report += ` The opener came in the ${first.minute}′ through ${first.player} (${first.team})${typeText}${assistText}.`;
        if (goalEvents.length > 1) {
            const last = goalEvents[goalEvents.length-1];
            const lastAssistText = last.assist ? ` (assisted by ${last.assist})` : '';
            const lastTypeText = last.goalType === 'Open play' ? '' : ` (${last.goalType})`;
            report += ` ${last.player} sealed it at ${last.minute}′${lastTypeText}${lastAssistText}.`;
        }
    } else if (homeScore === 0 && awayScore === 0) {
        report += ` A rare goalless affair with no clear chances.`;
    }
    const flavours = [`${home} dominated possession but lacked precision.`, `${away} defended deep and hit on the counter.`, `The match was a midfield battle from start to finish.`, `Both goalkeepers produced world-class saves.`, `End-to-end action thrilled the crowd.`, `Set pieces proved decisive today.`];
    report += ` ${flavours[Math.floor(Math.random() * flavours.length)]}`;
    return report;
}

// ==================== SAVE RESULT & GOAL EDITOR ====================
function saveResult(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save match with BYE team."); return; }
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    openGoalEditor();
}

function openGoalEditor() {
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    const totalGoals = pendingHomeScore + pendingAwayScore;
    let modalHtml = `
        <div id="goal-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div class="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                    <h3 class="font-bold text-lg">⚽ Enter Goal Details</h3>
                    <button onclick="closeGoalEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-5 space-y-4">
                    <p class="text-sm text-gray-600">Match: ${fixture.home} vs ${fixture.away}</p>
                    <p class="text-sm font-semibold">Score: ${pendingHomeScore} - ${pendingAwayScore}</p>
                    <div id="goals-list-container" class="space-y-3">
    `;
    for (let i = 0; i < totalGoals; i++) {
        modalHtml += `
            <div class="goal-entry border rounded-xl p-3 bg-gray-50" data-goal-index="${i}">
                <div class="font-medium mb-2">Goal #${i+1}</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select class="goal-team border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="${fixture.home}">${fixture.home}</option>
                        <option value="${fixture.away}">${fixture.away}</option>
                    </select>
                    <input type="text" class="goal-scorer border rounded-lg px-3 py-2 text-sm" placeholder="Scorer name">
                    <input type="text" class="goal-assist border rounded-lg px-3 py-2 text-sm" placeholder="Assist (optional)">
                    <input type="number" class="goal-minute border rounded-lg px-3 py-2 text-sm" placeholder="Minute" min="1" max="120">
                    <select class="goal-type border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="Open play">⚽ Open play</option>
                        <option value="Penalty">🎯 Penalty</option>
                        <option value="Free kick">🦵 Free kick</option>
                        <option value="Header">👑 Header</option>
                        <option value="Own goal">😵 Own goal</option>
                    </select>
                </div>
            </div>
        `;
    }
    modalHtml += `
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button onclick="closeGoalEditor()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                        <button onclick="saveGoalsAndFinish()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">Save Match & Report</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('goal-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeGoalEditor() {
    const modal = document.getElementById('goal-editor-modal');
    if (modal) modal.remove();
    pendingFixtureId = null;
}

function saveGoalsAndFinish() {
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    if (!fixture) return;
    const goalEntries = document.querySelectorAll('.goal-entry');
    const events = [];
    for (let i = 0; i < goalEntries.length; i++) {
        const entry = goalEntries[i];
        const team = entry.querySelector('.goal-team').value;
        const scorer = entry.querySelector('.goal-scorer').value.trim();
        const assist = entry.querySelector('.goal-assist').value.trim();
        const minute = parseInt(entry.querySelector('.goal-minute').value);
        const type = entry.querySelector('.goal-type').value;
        if (!scorer) { alert(`Please enter scorer name for goal #${i+1}`); return; }
        if (isNaN(minute) || minute < 1 || minute > 120) { alert(`Please enter a valid minute (1-120) for goal #${i+1}`); return; }
        events.push({ minute, type: 'goal', team, player: scorer, assist: assist || null, goalType: type });
    }
    events.sort((a,b) => a.minute - b.minute);
    const report = generateRichReportFromEvents(fixture.home, fixture.away, pendingHomeScore, pendingAwayScore, events);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    fixture.report = report;
    fixture.events = events;
    if (!fixture.predictions) fixture.predictions = [];
    if (!fixture.banter) fixture.banter = [];
    updateTableCalculations();
    saveToStorage();
    showToast(`Saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`);
    closeGoalEditor();
    pendingFixtureId = null;
    renderTable();
    renderFixtures();
    generateTickerFacts();
    if (typeof confetti === 'function') confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 }, startVelocity: 12, colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'] });
}

function editViewerEvents() {
    if (!isAdmin || currentViewerFixtureId === null) return;
    const f = fixtures.find(f => f.id === currentViewerFixtureId);
    if (!f.played) return;
    pendingFixtureId = currentViewerFixtureId;
    pendingHomeScore = f.homeScore;
    pendingAwayScore = f.awayScore;
    openGoalEditorForEdit(f.events || []);
    closeCommentViewer();
}

function openGoalEditorForEdit(existingEvents) {
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    const totalGoals = pendingHomeScore + pendingAwayScore;
    let modalHtml = `
        <div id="goal-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div class="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                    <h3 class="font-bold text-lg">✏️ Edit Goal Details</h3>
                    <button onclick="closeGoalEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-5 space-y-4">
                    <p class="text-sm text-gray-600">Match: ${fixture.home} vs ${fixture.away}</p>
                    <p class="text-sm font-semibold">Score: ${pendingHomeScore} - ${pendingAwayScore}</p>
                    <div id="goals-list-container" class="space-y-3">
    `;
    for (let i = 0; i < totalGoals; i++) {
        const ev = existingEvents[i] || {};
        modalHtml += `
            <div class="goal-entry border rounded-xl p-3 bg-gray-50" data-goal-index="${i}">
                <div class="font-medium mb-2">Goal #${i+1}</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <select class="goal-team border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="${fixture.home}" ${ev.team === fixture.home ? 'selected' : ''}>${fixture.home}</option>
                        <option value="${fixture.away}" ${ev.team === fixture.away ? 'selected' : ''}>${fixture.away}</option>
                    </select>
                    <input type="text" class="goal-scorer border rounded-lg px-3 py-2 text-sm" placeholder="Scorer name" value="${escapeHtml(ev.player || '')}">
                    <input type="text" class="goal-assist border rounded-lg px-3 py-2 text-sm" placeholder="Assist (optional)" value="${escapeHtml(ev.assist || '')}">
                    <input type="number" class="goal-minute border rounded-lg px-3 py-2 text-sm" placeholder="Minute" value="${ev.minute || ''}">
                    <select class="goal-type border rounded-lg px-3 py-2 text-sm bg-white">
                        <option value="Open play" ${ev.goalType === 'Open play' ? 'selected' : ''}>⚽ Open play</option>
                        <option value="Penalty" ${ev.goalType === 'Penalty' ? 'selected' : ''}>🎯 Penalty</option>
                        <option value="Free kick" ${ev.goalType === 'Free kick' ? 'selected' : ''}>🦵 Free kick</option>
                        <option value="Header" ${ev.goalType === 'Header' ? 'selected' : ''}>👑 Header</option>
                        <option value="Own goal" ${ev.goalType === 'Own goal' ? 'selected' : ''}>😵 Own goal</option>
                    </select>
                </div>
            </div>
        `;
    }
    modalHtml += `
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <button onclick="closeGoalEditor()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                        <button onclick="saveGoalsAndFinish()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('goal-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ==================== MATCH VIEWER ====================
function showMatchComment(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    if (!f) { showToast("Fixture not found"); return; }
    currentViewerFixtureId = fixtureId;
    const modal = document.getElementById('comment-viewer-modal');
    if (!modal) { showToast("Error opening match details"); return; }
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('viewer-match-name').innerHTML = `${f.home} vs ${f.away}`;
    document.getElementById('viewer-score').innerText = f.played ? `${f.homeScore} - ${f.awayScore}` : 'Not played yet';
    document.getElementById('viewer-comment').innerText = f.report || (f.played ? 'No report available.' : 'Match not played.');
    const eventsContainer = document.getElementById('viewer-events-container');
    const eventsDiv = document.getElementById('viewer-events');
    if (eventsContainer && eventsDiv) {
        if (f.events && f.events.length > 0) {
            eventsContainer.classList.remove('hidden');
            eventsDiv.innerHTML = f.events.map(ev => {
                const assistText = ev.assist ? ` (assist: ${ev.assist})` : '';
                const typeText = ev.goalType && ev.goalType !== 'Open play' ? ` [${ev.goalType}]` : '';
                return `<div class="flex justify-between border-b border-gray-200 py-1"><span class="font-mono w-12">${ev.minute}′</span><span class="flex-1">⚽ ${ev.team} - ${ev.player}${typeText}${assistText}</span></div>`;
            }).join('');
        } else { eventsContainer.classList.add('hidden'); }
    }
    const editBtn = document.getElementById('viewer-edit-btn');
    const editEventsBtn = document.getElementById('viewer-edit-events-btn');
    if (editBtn && editEventsBtn) {
        if (isAdmin && f.played) {
            editBtn.classList.remove('hidden');
            editEventsBtn.classList.remove('hidden');
        } else {
            editBtn.classList.add('hidden');
            editEventsBtn.classList.add('hidden');
        }
    }
}
function closeCommentViewer() {
    const modal = document.getElementById('comment-viewer-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentViewerFixtureId = null;
}
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
function confirmComment() {
    if (pendingFixtureId === null) return;
    const finalReport = document.getElementById('comment-text').value.trim();
    if (!finalReport) { alert("Report cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.report = finalReport;
    saveToStorage();
    showToast(`Report updated for ${fixture.home} vs ${fixture.away}`);
    closeCommentModal(true);
    pendingFixtureId = null;
    renderTable(); renderFixtures(); generateTickerFacts();
}
function closeCommentModal(save = false) {
    const modal = document.getElementById('comment-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (!save) pendingFixtureId = null;
}

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
        updateTableCalculations(); renderTable(); renderGameweekTabs(); renderFixtures(); renderRelegatedTeams(); generateTickerFacts();
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
        updateTableCalculations(); renderTable(); renderGameweekTabs(); renderFixtures(); renderRelegatedTeams(); generateTickerFacts();
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
    if (!nickname) { alert("Please enter your name."); return; }
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
function postBanter() {
    if (!currentBanterFixtureId) { showToast("No fixture selected"); return; }
    const input = document.getElementById('banter-input');
    const text = input.value.trim();
    if (!text) { alert("Write something funny!"); return; }
    const fixture = fixtures.find(f => f.id === currentBanterFixtureId);
    if (!fixture) return;
    if (!fixture.banter) fixture.banter = [];
    fixture.banter.push({ text: text.slice(0,200), timestamp: Date.now(), author: "Fan" });
    saveToStorage();
    input.value = '';
    renderBanterMessages(currentBanterFixtureId);
    showToast("Banter posted!");
}
function renderBanterMessages(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    const container = document.getElementById('banter-messages-container');
    if (!container) return;
    if (!f?.banter || f.banter.length === 0) { container.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">😴 No banter yet. Be the first!</div>'; return; }
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
function deleteBanter(fixtureId, index) {
    if (!isAdmin) return;
    const f = fixtures.find(f => f.id === fixtureId);
    if (f && f.banter && f.banter[index]) { f.banter.splice(index,1); saveToStorage(); renderBanterMessages(fixtureId); showToast("Banter deleted"); }
}

// ==================== ADMIN MODE, PASSWORD, PENALTY ====================
function handleAdminToggleClick() { 
    if (!isAdmin) { 
        document.getElementById('admin-password-input').value = ""; 
        document.getElementById('password-error').classList.add('hidden'); 
        document.getElementById('password-modal').classList.remove('hidden'); 
    } else deactivateAdminMode(); 
}
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }
function verifyAdminPassword() { 
    const val = document.getElementById('admin-password-input').value; 
    if (val === tournamentPassword) { closePasswordModal(); activateAdminMode(); } 
    else document.getElementById('password-error').classList.remove('hidden'); 
}
function activateAdminMode() { isAdmin = true; updateAdminUIElements(); showToast("Admin mode ACTIVE"); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); showToast("Admin mode deactivated"); }
function updateAdminUIElements() {
    const btn = document.getElementById('admin-btn'), dot = document.getElementById('admin-btn-dot'), statusText = document.getElementById('admin-status-text'), resetContainer = document.getElementById('admin-reset-container'), thActions = document.getElementById('th-admin-actions'), hint = document.getElementById('admin-table-hint'), relegationZone = document.getElementById('relegation-zone');
    const autoStartContainer = document.getElementById('auto-start-container');
    if (autoStartContainer) { if (isAdmin) autoStartContainer.classList.remove('hidden'); else autoStartContainer.classList.add('hidden'); }
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
function toggleAutoStart() {
    if (!isAdmin) return;
    autoStartNextRound = !autoStartNextRound;
    const btn = document.getElementById('auto-start-toggle');
    const dot = document.getElementById('auto-start-dot');
    if (autoStartNextRound) { btn.classList.replace('bg-gray-300', 'bg-indigo-600'); dot.classList.replace('translate-x-0', 'translate-x-4'); showToast("Auto‑start enabled"); }
    else { btn.classList.replace('bg-indigo-600', 'bg-gray-300'); dot.classList.replace('translate-x-4', 'translate-x-0'); showToast("Auto‑start disabled"); }
    saveToStorage();
}
function openChangePasswordModal() { if (!isAdmin) return; document.getElementById('new-password').value = ''; document.getElementById('confirm-password').value = ''; document.getElementById('password-match-error').classList.add('hidden'); document.getElementById('change-password-modal').classList.remove('hidden'); }
function closeChangePasswordModal() { document.getElementById('change-password-modal').classList.add('hidden'); }
function updateMasterPassword() { 
    const newPass = document.getElementById('new-password').value.trim(), confirmPass = document.getElementById('confirm-password').value.trim(); 
    if (!newPass) { showToast('Password cannot be empty'); return; } 
    if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; } 
    tournamentPassword = newPass; saveToStorage(); showToast('Master password updated!'); closeChangePasswordModal(); 
}
function openPenaltyModal(teamName) { if (!isAdmin) return; currentPenaltyTeam = teamName; const team = teams[teamName]; document.getElementById('penalty-team-name').innerText = teamName; document.getElementById('current-penalty').innerText = team.deductedPoints || 0; document.getElementById('penalty-modal').classList.remove('hidden'); }
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); currentPenaltyTeam = null; }
function adjustPenalty(delta) { if (!currentPenaltyTeam) return; const team = teams[currentPenaltyTeam]; let newVal = (team.deductedPoints || 0) + delta; if (newVal < 0) newVal = 0; team.deductedPoints = newVal; document.getElementById('current-penalty').innerText = newVal; saveToStorage(); renderTable(); showToast(`${currentPenaltyTeam} penalty now ${newVal} pts`); }
function clearPenaltyPoints() { if (!currentPenaltyTeam) return; teams[currentPenaltyTeam].deductedPoints = 0; document.getElementById('current-penalty').innerText = "0"; saveToStorage(); renderTable(); showToast(`Penalty cleared for ${currentPenaltyTeam}`); closePenaltyModal(); }

// ==================== BACK TO TOP, TICKER, DEADLINE CLOCK ====================
function initBackToTop() {
    const backBtn = document.getElementById('backToTop');
    if (!backBtn) return;
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) backBtn.classList.remove('hidden');
        else backBtn.classList.add('hidden');
    });
    backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}
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
function resetTournament() { if (confirm("Wipe ALL data? This cannot be undone.")) db.ref('tournament_data').remove().then(() => location.reload()); }

// ==================== DATABASE SYNC ====================
function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        if (snapshot.exists() && userRole) loadTournamentData(snapshot.val());
        else if (!snapshot.exists() && userRole === 'admin') {
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('deadline-clock')?.classList.add('hidden');
        } else if (!snapshot.exists() && userRole === 'viewer') {
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('setup-section')?.classList.add('hidden');
            document.getElementById('role-selector').innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center"><div class="mb-4"><div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3"><span class="text-3xl">🏆</span></div><h2 class="text-2xl font-bold text-gray-800">No Tournament Yet</h2><p class="text-gray-500 text-sm mt-1">An admin hasn't started a tournament.</p></div><button onclick="selectRole('admin')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition">🔑 Switch to Admin to Create</button></div>`;
        }
    });
    db.ref('tournament_data/fixtures').on('child_changed', (snapshot) => {
        const updated = snapshot.val();
        if (updated && updated.played === true && updated.homeScore !== null) {
            showToast(`📢 Result: ${updated.home} ${updated.homeScore}-${updated.awayScore} ${updated.away}`);
        }
    });
}

// ==================== WHATSAPP CHAT - HELPERS ====================
function formatChatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function groupMessagesByDate(messagesArray) {
    const groups = {};
    messagesArray.forEach(msg => {
        const date = new Date(msg.timestamp).toDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(msg);
    });
    return groups;
}

function renderMessages(append = false) {
    const container = document.getElementById('chat-messages-container-new');
    if (!container) return;
    if (!append) container.innerHTML = '';
    const grouped = groupMessagesByDate(messages);
    for (const [date, msgs] of Object.entries(grouped)) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'sticky top-0 z-10 text-center text-xs text-gray-500 bg-[#e5ddd5] dark:bg-gray-900 py-1';
        dateDiv.innerText = date;
        container.appendChild(dateDiv);
        msgs.forEach(msg => {
            const isCurrentUser = (msg.userId === getCurrentUserId());
            const bubbleClass = isCurrentUser ? 'bg-emerald-100 dark:bg-emerald-900 text-right' : 'bg-white dark:bg-gray-800';
            const align = isCurrentUser ? 'justify-end' : 'justify-start';
            const messageDiv = document.createElement('div');
            messageDiv.className = `flex ${align} group`;
            messageDiv.dataset.id = msg.messageId;
            
            let senderNameHtml = '';
            if (!isCurrentUser && msg.nickname) {
                const adminBadge = (msg.role === 'admin' || msg.userId === 'adminUser') ? '<span class="text-xs text-blue-500 ml-1">(admin)</span>' : '';
                senderNameHtml = `<div class="text-xs text-gray-500 mb-1 ml-2">${escapeHtml(msg.nickname)}${adminBadge}</div>`;
            }
            let replyHtml = '';
            if (msg.replyTo) replyHtml = `<div class="text-xs text-gray-400 mb-1 border-l-2 border-gray-300 pl-2">↩️ ${escapeHtml(msg.replyTo.text)}</div>`;
            const forwardHtml = msg.forwarded ? `<div class="text-[10px] text-gray-400">Forwarded</div>` : '';
            let reactionsHtml = '';
            if (msg.reactions && Object.keys(msg.reactions).length) {
                reactionsHtml = `<div class="flex gap-1 mt-1">${Object.entries(msg.reactions).map(([emoji, usersArr]) => `<span class="bg-gray-200 dark:bg-gray-700 rounded-full px-1 text-xs">${emoji} ${usersArr.length}</span>`).join('')}</div>`;
            }
            let statusHtml = '';
            if (isCurrentUser) {
                if (msg.seen) statusHtml = '<span class="text-blue-500 text-xs ml-1">✓✓</span>';
                else if (msg.delivered) statusHtml = '<span class="text-gray-500 text-xs ml-1">✓✓</span>';
                else statusHtml = '<span class="text-gray-500 text-xs ml-1">✓</span>';
            }
            let mediaHtml = '';
            if (msg.type === 'image' && msg.mediaUrl) mediaHtml = `<img src="${msg.mediaUrl}" class="max-w-full max-h-48 rounded-lg mt-1 cursor-pointer" onclick="window.open('${msg.mediaUrl}')">`;
            else if (msg.type === 'file' && msg.mediaUrl) mediaHtml = `<a href="${msg.mediaUrl}" target="_blank" class="text-blue-500 underline text-sm mt-1">📎 ${msg.filename || 'Attachment'}</a>`;
            const editedHtml = msg.edited ? '<span class="text-[10px] text-gray-400 ml-1">(edited)</span>' : '';
            
            messageDiv.innerHTML = `
                <div class="max-w-[70%] ${bubbleClass} rounded-lg p-2 shadow relative group-hover:bg-opacity-90">
                    ${senderNameHtml}
                    ${replyHtml}
                    <p class="text-sm break-words">${escapeHtml(msg.text)}${editedHtml}</p>
                    ${mediaHtml}
                    ${forwardHtml}
                    ${reactionsHtml}
                    <div class="flex justify-end items-center gap-1 mt-1">
                        <span class="text-[10px] text-gray-400">${formatChatTime(msg.timestamp)}</span>
                        ${statusHtml}
                    </div>
                    <div class="absolute top-1 right-1 hidden group-hover:flex gap-1 bg-white dark:bg-gray-800 rounded-full shadow p-1">
                        <button class="reply-btn text-xs" data-id="${msg.messageId}">↩️</button>
                        <button class="react-btn text-xs" data-id="${msg.messageId}">😊</button>
                        ${(isCurrentUser) ? `<button class="edit-msg-btn text-xs" data-id="${msg.messageId}">✏️</button>` : ''}
                        ${(isAdmin || isCurrentUser) ? `<button class="delete-msg-btn text-xs" data-id="${msg.messageId}">🗑️</button>` : ''}
                        ${isAdmin ? `<button class="pin-msg-btn text-xs" data-id="${msg.messageId}">📌</button>` : ''}
                    </div>
                </div>
            `;
            container.appendChild(messageDiv);
        });
    }
    container.scrollTop = container.scrollHeight;
    updateSidebarPreview();
}

async function sendChatMessage(text, type = 'text', mediaUrl = null, filename = null) {
    if (!text.trim() && !mediaUrl) return;
    const msg = {
        messageId: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        userId: getCurrentUserId(),
        nickname: localStorage.getItem('chatNickname') || 'Fan',
        text: text.slice(0, 500),
        timestamp: Date.now(),
        type: type,
        mediaUrl: mediaUrl,
        filename: filename,
        replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text } : null,
        forwarded: false,
        reactions: {},
        delivered: true,
        seen: false,
        pinned: false,
        role: isAdmin ? 'admin' : 'user'
    };
    await chatMessagesRef.push(msg);
    clearReply();
    document.getElementById('chat-input-new').value = '';
}

async function editMessage(messageId, newText) {
    if (!newText.trim()) return;
    const snapshot = await chatMessagesRef.child(messageId).once('value');
    const msg = snapshot.val();
    if (!msg) return;
    if (msg.userId !== getCurrentUserId()) {
        showToast("You can only edit your own messages");
        return;
    }
    await chatMessagesRef.child(messageId).update({ text: newText.trim(), edited: true });
    showToast("Message edited");
}

async function deleteMessage(messageId) {
    const snapshot = await chatMessagesRef.child(messageId).once('value');
    const msg = snapshot.val();
    if (!msg) return;
    if (!isAdmin && msg.userId !== getCurrentUserId()) {
        showToast("You can only delete your own messages");
        return;
    }
    await chatMessagesRef.child(messageId).remove();
}

async function togglePinMessage(messageId) {
    if (!isAdmin) return;
    const current = await chatMessagesRef.child(`${messageId}/pinned`).once('value');
    await chatMessagesRef.child(`${messageId}/pinned`).set(!current.val());
}

function setReply(messageId, text) {
    replyingTo = { id: messageId, text: text };
    const replyIndicator = document.getElementById('reply-indicator');
    if (replyIndicator) {
        replyIndicator.innerText = `Replying to: ${text.substring(0, 50)}...`;
        replyIndicator.classList.remove('hidden');
    }
}
function clearReply() {
    replyingTo = null;
    const replyIndicator = document.getElementById('reply-indicator');
    if (replyIndicator) replyIndicator.classList.add('hidden');
}

async function addReaction(messageId, emoji) {
    const userId = getCurrentUserId();
    const reactionRef = chatMessagesRef.child(`${messageId}/reactions/${emoji}`);
    const snapshot = await reactionRef.once('value');
    let users = snapshot.val() || [];
    if (!users.includes(userId)) users.push(userId);
    await reactionRef.set(users);
}

function markMessagesAsSeen() {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.userId !== getCurrentUserId() && !lastMsg.seen) {
        chatMessagesRef.child(`${lastMsg.messageId}/seen`).set(true);
    }
}

function loadMessages() {
    chatMessagesRef.off();
    chatMessagesRef.orderByChild('timestamp').limitToLast(50).on('child_added', (snapshot) => {
        const msg = snapshot.val();
        if (!messages.find(m => m.messageId === msg.messageId)) {
            messages.push(msg);
            messages.sort((a,b) => a.timestamp - b.timestamp);
            renderMessages();
            markMessagesAsSeen();
        }
    });
    chatMessagesRef.on('child_changed', (snapshot) => {
        const updated = snapshot.val();
        const idx = messages.findIndex(m => m.messageId === updated.messageId);
        if (idx !== -1) messages[idx] = updated;
        renderMessages();
    });
    chatMessagesRef.on('child_removed', (snapshot) => {
        messages = messages.filter(m => m.messageId !== snapshot.key);
        renderMessages();
    });
}

function initTypingListener() {
    chatTypingRef = db.ref('chat_typing');
    chatTypingRef.on('value', (snapshot) => {
        const data = snapshot.val();
        const typingDiv = document.getElementById('typing-indicator-new');
        if (data && data.user && data.user !== localStorage.getItem('chatNickname')) {
            typingDiv.innerText = `${data.user} is typing...`;
            typingDiv.classList.remove('hidden');
        } else {
            typingDiv.classList.add('hidden');
        }
    });
}
function sendTypingStatus() {
    if (!userRole) return;
    db.ref('chat_typing').set({ user: localStorage.getItem('chatNickname') || 'Fan', timestamp: Date.now() });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => db.ref('chat_typing').remove(), 1500);
}

function initPresence() {
    chatPresenceRef = db.ref('presence');
    const userId = getCurrentUserId();
    chatPresenceRef.child(userId).set({ online: true, lastSeen: Date.now(), name: localStorage.getItem('chatNickname') });
    window.addEventListener('beforeunload', () => chatPresenceRef.child(userId).update({ online: false }));
    chatPresenceRef.on('value', (snapshot) => {
        const presences = snapshot.val() || {};
        const onlineCount = Object.values(presences).filter(p => p.online).length;
        const memberCountSpan = document.getElementById('member-count');
        if (memberCountSpan) memberCountSpan.innerText = `${onlineCount} online`;
        const onlineIndicator = document.getElementById('online-indicator');
        if (onlineIndicator) onlineIndicator.style.backgroundColor = onlineCount > 1 ? '#10b981' : '#9ca3af';
    });
}

function updateSidebarPreview() {
    if (!messages.length) return;
    const lastMsg = messages[messages.length - 1];
    const previewSpan = document.getElementById('last-message-preview');
    if (previewSpan) previewSpan.innerText = lastMsg.text.substring(0, 30);
    const timeSpan = document.getElementById('last-message-time');
    if (timeSpan) timeSpan.innerText = formatChatTime(lastMsg.timestamp);
    const unread = messages.filter(m => !m.seen && m.userId !== getCurrentUserId()).length;
    const badge = document.getElementById('unread-badge-sidebar');
    if (badge) {
        if (unread > 0) { badge.innerText = unread > 9 ? '9+' : unread; badge.classList.remove('hidden'); }
        else badge.classList.add('hidden');
    }
}

function uploadChatAttachment(file, type) {
    const storageRef = storage.ref(`chat_attachments/${Date.now()}_${file.name}`);
    const uploadTask = storageRef.put(file);
    uploadTask.on('state_changed', null, null, () => {
        storageRef.getDownloadURL().then(url => sendChatMessage('', type, url, file.name));
    });
}

function buildEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    if (!picker) return;
    const emojis = ['😀', '😂', '❤️', '👍', '🎉', '😢', '😡', '😎', '🥳', '😱', '🤔', '🔥', '✨', '🍻', '⚽'];
    picker.innerHTML = emojis.map(e => `<button class="text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded p-1">${e}</button>`).join('');
    picker.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('chat-input-new').value += btn.innerText;
            picker.classList.add('hidden');
        });
    });
}

function setDarkMode(enabled) {
    if (enabled) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('chatDarkMode', enabled);
    currentDarkMode = enabled;
}

// Poll Modal (kept for chat poll creation)
function openPollModal() {
    if (!isAdmin) return;
    document.getElementById('poll-modal').classList.remove('hidden');
    document.getElementById('poll-modal').classList.add('flex');
}
function closePollModal() {
    document.getElementById('poll-modal').classList.add('hidden');
    document.getElementById('poll-modal').classList.remove('flex');
}
function addPollOption() {
    const container = document.getElementById('poll-options-container');
    const div = document.createElement('div');
    div.className = 'flex gap-2 mb-2';
    div.innerHTML = `<input type="text" placeholder="Option" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button>`;
    container.appendChild(div);
}
function removePollOption(btn) { btn.parentElement.remove(); }
function createPoll() {
    const question = document.getElementById('poll-question').value.trim();
    if (!question) { alert("Enter a question"); return; }
    const options = Array.from(document.querySelectorAll('.poll-option')).map(inp => inp.value.trim()).filter(v => v);
    if (options.length < 2) { alert("At least 2 options"); return; }
    const pollId = Date.now();
    const poll = { id: pollId, question, options: options.map(opt => ({ text: opt, votes: 0 })), totalVotes: 0, voters: {}, createdAt: Date.now() };
    db.ref(`chat_polls/${pollId}`).set(poll);
    const msg = { nickname: "System", text: `📊 New poll: ${question}`, timestamp: Date.now(), userId: `poll_${pollId}`, isPoll: true, pollId: pollId };
    db.ref('chat_messages').push(msg);
    closePollModal();
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-options-container').innerHTML = `<div class="flex gap-2 mb-2"><input type="text" placeholder="Option 1" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div><div class="flex gap-2 mb-2"><input type="text" placeholder="Option 2" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div>`;
}
function votePoll(pollId, optionIndex) {
    const nickname = localStorage.getItem('chatNickname') || 'Fan';
    db.ref(`chat_polls/${pollId}/voters/${nickname}`).once('value', snap => {
        if (snap.exists()) { showToast("You already voted"); return; }
        db.ref(`chat_polls/${pollId}/options/${optionIndex}/votes`).transaction(v => (v || 0) + 1);
        db.ref(`chat_polls/${pollId}/totalVotes`).transaction(t => (t || 0) + 1);
        db.ref(`chat_polls/${pollId}/voters/${nickname}`).set(true);
        showToast("Vote cast!");
    });
}
function renderPollMessage(pollId) {
    db.ref(`chat_polls/${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const container = document.getElementById('chat-messages-container-new');
        const pollDiv = document.createElement('div');
        pollDiv.className = 'poll-card bg-white rounded-lg p-3 shadow my-2 border';
        pollDiv.id = `poll-${poll.id}`;
        pollDiv.innerHTML = `<p class="font-bold">📊 ${escapeHtml(poll.question)}</p><div class="space-y-2 mt-2" id="poll-options-${poll.id}"></div><div class="text-xs text-gray-500 mt-2">${poll.totalVotes || 0} vote(s)</div>`;
        container.appendChild(pollDiv);
        updatePollUI(poll.id);
    });
}
function updatePollUI(pollId) {
    db.ref(`chat_polls/${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const container = document.getElementById(`poll-options-${pollId}`);
        if (!container) return;
        container.innerHTML = '';
        const total = poll.totalVotes || 1;
        poll.options.forEach((opt, idx) => {
            const percent = ((opt.votes || 0) / total) * 100;
            container.innerHTML += `<div class="flex items-center justify-between gap-2 text-sm"><span class="flex-1">${escapeHtml(opt.text)}</span><span class="w-16 text-right">${opt.votes || 0}</span><div class="w-24 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width: ${percent}%"></div></div><button onclick="votePoll(${pollId}, ${idx})" class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-200">Vote</button></div>`;
        });
        const totalSpan = container.parentElement?.querySelector('.text-xs');
        if (totalSpan) totalSpan.innerText = `${poll.totalVotes || 0} vote(s)`;
    });
}
function initPollListener() {
    db.ref('chat_polls').on('child_changed', (snapshot) => {
        const poll = snapshot.val();
        if (poll) updatePollUI(poll.id);
    });
}

function initWhatsAppChat() {
    chatMessagesRef = db.ref('chat_messages');
    chatTypingRef = db.ref('chat_typing');
    initTypingListener();
    buildEmojiPicker();
    loadMessages();
    initPresence();
    initPollListener();

    // Sidebar toggle
    const toggleBtn = document.getElementById('chat-sidebar-toggle');
    const sidebar = document.getElementById('chat-sidebar');
    if (toggleBtn && sidebar) toggleBtn.addEventListener('click', () => sidebar.classList.toggle('-translate-x-full'));

    // Send message
    const sendBtn = document.getElementById('send-message-btn');
    const inputField = document.getElementById('chat-input-new');
    if (sendBtn && inputField) {
        sendBtn.addEventListener('click', () => sendChatMessage(inputField.value));
        inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChatMessage(inputField.value); });
        inputField.addEventListener('input', sendTypingStatus);
    }

    // Attachment menu
    const attachBtn = document.getElementById('attach-menu-btn');
    const attachMenu = document.getElementById('attachment-menu');
    if (attachBtn && attachMenu) {
        attachBtn.addEventListener('click', () => attachMenu.classList.toggle('hidden'));
        document.getElementById('attach-image')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
            input.onchange = e => uploadChatAttachment(e.target.files[0], 'image');
            input.click(); attachMenu.classList.add('hidden');
        });
        document.getElementById('attach-file')?.addEventListener('click', () => {
            const input = document.createElement('input'); input.type = 'file';
            input.onchange = e => uploadChatAttachment(e.target.files[0], 'file');
            input.click(); attachMenu.classList.add('hidden');
        });
        document.getElementById('create-poll-chat')?.addEventListener('click', () => { openPollModal(); attachMenu.classList.add('hidden'); });
    }

    // Emoji picker toggle
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');
    if (emojiBtn && emojiPicker) emojiBtn.addEventListener('click', () => emojiPicker.classList.toggle('hidden'));

    // Dark mode toggle
    const darkBtn = document.getElementById('dark-mode-toggle');
    if (darkBtn) darkBtn.addEventListener('click', () => setDarkMode(!currentDarkMode));
    setDarkMode(currentDarkMode);

    // Search
    const searchBtn = document.getElementById('search-messages-btn');
    if (searchBtn) searchBtn.addEventListener('click', () => {
        const keyword = prompt('Search messages:', '');
        if (keyword) {
            const results = messages.filter(m => m.text.toLowerCase().includes(keyword.toLowerCase()));
            alert(`Found ${results.length} messages.`);
        }
    });

    // Event delegation for message actions
    const container = document.getElementById('chat-messages-container-new');
    if (container) {
        container.addEventListener('click', async (e) => {
            const replyBtn = e.target.closest('.reply-btn');
            if (replyBtn) {
                const id = replyBtn.dataset.id;
                const msg = messages.find(m => m.messageId === id);
                if (msg) setReply(id, msg.text);
                return;
            }
            const reactBtn = e.target.closest('.react-btn');
            if (reactBtn) {
                const id = reactBtn.dataset.id;
                const emoji = prompt('Enter emoji (e.g., ❤️)');
                if (emoji) await addReaction(id, emoji);
                return;
            }
            const editBtn = e.target.closest('.edit-msg-btn');
            if (editBtn) {
                const id = editBtn.dataset.id;
                const msg = messages.find(m => m.messageId === id);
                if (msg) {
                    const newText = prompt("Edit your message:", msg.text);
                    if (newText && newText !== msg.text) await editMessage(id, newText);
                }
                return;
            }
            const deleteBtn = e.target.closest('.delete-msg-btn');
            if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (confirm('Delete this message?')) await deleteMessage(id);
                return;
            }
            const pinBtn = e.target.closest('.pin-msg-btn');
            if (pinBtn) {
                const id = pinBtn.dataset.id;
                await togglePinMessage(id);
            }
        });
    }
}

// Open/close chat modal from outside
function openChatModal() {
    const chatFull = document.getElementById('chat-full');
    if (chatFull) {
        chatFull.classList.remove('hidden');
        chatFull.classList.add('flex');
        if (chatMessagesRef) loadMessages();
        initPresence();
        document.getElementById('chat-input-new')?.focus();
    }
}
function closeChatModal() {
    const chatFull = document.getElementById('chat-full');
    if (chatFull) {
        chatFull.classList.add('hidden');
        chatFull.classList.remove('flex');
    }
}

// ==================== INIT ====================
window.onload = () => {
    const savedRole = sessionStorage.getItem('tournamentRole');
    if (savedRole === 'viewer' || savedRole === 'admin') {
        selectRole(savedRole);
    }
    initRealtimeDatabaseSync();
};

// ==================== EXPOSE FUNCTIONS ====================
window.selectRole = selectRole;
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
window.showMatchComment = showMatchComment;
window.closeCommentViewer = closeCommentViewer;
window.editViewerComment = editViewerComment;
window.editViewerEvents = editViewerEvents;
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
window.stopRound = stopRound;
window.toggleAutoStart = toggleAutoStart;

// Chat exports
window.openChatModal = openChatModal;
window.closeChatModal = closeChatModal;
window.sendChatMessage = sendChatMessage;
window.deleteChatMessage = deleteMessage;
window.addReaction = addReaction;
window.togglePinMessage = togglePinMessage;
window.editMessage = editMessage;
window.setReply = setReply;
window.clearReply = clearReply;
window.uploadChatAttachment = uploadChatAttachment;
window.openPollModal = openPollModal;
window.closePollModal = closePollModal;
window.addPollOption = addPollOption;
window.removePollOption = removePollOption;
window.createPoll = createPoll;
window.votePoll = votePoll;
window.sendTypingStatus = sendTypingStatus;
