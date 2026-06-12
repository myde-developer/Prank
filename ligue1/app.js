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

// ==================== BACKEND PROXY FOR GROQ  ====================
const BACKEND_URL = "https://groq-vision-proxy.onrender.com";

// LOCKED TO LIGUE 1 ONLY
const CURRENT_LEAGUE = 'ligue1';

function getTournamentRef() {
    return db.ref(`${CURRENT_LEAGUE}/tournament_data`);
}
function getChatRef() {
    return db.ref(`${CURRENT_LEAGUE}/chat_messages`);
}
function getPollsRef() {
    return db.ref(`${CURRENT_LEAGUE}/chat_polls`);
}
function getTypingRef() {
    return db.ref(`${CURRENT_LEAGUE}/chat_typing`);
}

let teams = {}, fixtures = [], knockoutMatches = [], tournamentPhase = 'league';
let currentSelectedRound = 1, isAdmin = false, tournamentPassword = "";
let tickerInterval = null, currentTickerFactIndex = 0, tickerFacts = [];
let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
let currentPenaltyTeam = null, pendingAssignFixtureId = null, pendingAssignSide = null, currentViewerFixtureId = null;
let currentPredictionFixtureId = null, currentBanterFixtureId = null;
let chatMessagesRef = null;
let releasedGameweeks = {};
let autoStartNextRound = false;
let roundStartTimes = {};
let roundPaused = {};
let typingTimeout = null;
let isTyping = false;
let unreadMessagesCount = 0;
let lastReadTimestamp = localStorage.getItem('chatLastRead') ? parseInt(localStorage.getItem('chatLastRead')) : Date.now();
let isChatModalOpen = false;
let currentMentionText = '';
let pendingReplaceOldTeam = null;
let isLoadingLeague = false;
let userRole = null;

// ==================== ROLE SELECTION ====================
function selectRole(role) {
    userRole = role;
    sessionStorage.setItem('tournamentRole', role);
    document.getElementById('role-selector').style.display = 'none';
    
    if (role === 'admin') {
        const entered = prompt("Enter admin master password:");
        if (entered === null) { location.reload(); return; }
        getTournamentRef().child('password').once('value', (snapshot) => {
            const storedPass = snapshot.val();
            const validPassword = storedPass ? entered === storedPass : entered === "090541";
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

const setupSection = document.getElementById('setup-section');
    if (setupSection) setupSection.classList.add('hidden');
    
    const tbody = document.getElementById('league-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="12" class="text-center py-8 text-gray-400">Loading Ligue 1...</td></tr>';
    const fixturesContainer = document.getElementById('fixtures-container');
    if (fixturesContainer) fixturesContainer.innerHTML = '<div class="skeleton h-24 w-full rounded-xl"></div>';
    
    getTournamentRef().once('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.teams && data.fixtures) {
            loadTournamentData(data);
            if (userRole === 'viewer') {
                document.getElementById('admin-toggle-container')?.classList.add('hidden');
                document.getElementById('admin-reset-container')?.classList.add('hidden');
                document.getElementById('floating-admin-menu')?.classList.add('hidden');
                document.getElementById('th-admin-actions')?.classList.add('hidden');
                document.getElementById('admin-table-hint')?.classList.add('hidden');
                document.getElementById('relegation-zone')?.classList.add('hidden');
            } else if (userRole === 'admin') {
                document.getElementById('admin-toggle-container')?.classList.remove('hidden');
                document.getElementById('admin-reset-container')?.classList.remove('hidden');
            }
        } else {
            if (userRole === 'viewer') {
                document.getElementById('dashboard-section')?.classList.add('hidden');
                document.getElementById('setup-section')?.classList.add('hidden');
                const roleSelector = document.getElementById('role-selector');
                if (roleSelector) {
                    roleSelector.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center"><div class="mb-4"><div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3"><span class="text-3xl">🏆</span></div><h2 class="text-2xl font-bold text-gray-800">No Ligue 1 Yet</h2><p class="text-gray-500 text-sm mt-1">An admin hasn't started Ligue 1.</p></div><button onclick="selectRole('admin')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition">🔑 Switch to Admin to Create</button></div>`;
                    roleSelector.style.display = 'flex';
                }
            } else if (userRole === 'admin') {
                document.getElementById('setup-section')?.classList.remove('hidden');
                document.getElementById('dashboard-section')?.classList.add('hidden');
                document.getElementById('admin-toggle-container')?.classList.add('hidden');
                document.getElementById('floating-admin-menu')?.classList.add('hidden');
                showToast("Setup mode – create Ligue 1");
            }
        }
    }).catch(error => { console.error(error); showToast("Error loading data"); });
}

function loadTournamentData(data) {
    tournamentPassword = data.password || "090541";
    teams = data.teams;
    fixtures = data.fixtures || [];

document.getElementById('setup-section')?.classList.add('hidden');
    knockoutMatches = data.knockoutMatches || [];
    tournamentPhase = data.tournamentPhase || 'league';
    roundStartTimes = data.roundStartTimes || {};
    roundPaused = data.roundPaused || {};
   releasedGameweeks = data.releasedGameweeks || {};
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
    initBackToTop();
    initChatListener();
    if (userRole === 'admin') updateAdminUIElements();
   validateFixtureIntegrity(true);
}

// ==================== HELPERS ====================
function showToast(msg) {
    const c = document.getElementById("toast-container");
    if (c) { let t = document.createElement("div"); t.className = "toast"; t.innerText = msg; c.appendChild(t); setTimeout(() => t.remove(), 2500); }
}
function saveToStorage() { 
    getTournamentRef().set({ teams, fixtures, knockoutMatches, tournamentPhase, password: tournamentPassword, roundStartTimes, autoStartNextRound, roundPaused, releasedGameweeks });
}
function getCurrentUserId() {
    let id = localStorage.getItem('chatUserId');
    if (!id) {
        id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('chatUserId', id);
    }
    return id;
}

function autoReleaseCurrentRound() {
    if (!isAdmin) return;
    
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    let highestCompletedRound = 0;
    
    for (let round = 1; round <= totalRounds; round++) {
        const roundFixtures = fixtures.filter(f => f.round === round);
        const allResolved = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
        if (allResolved) {
            highestCompletedRound = round;
        } else {
            break;
        }
    }
    
    const nextRound = highestCompletedRound + 1;
    
    if (nextRound <= totalRounds && !releasedGameweeks[nextRound]) {
        releasedGameweeks[nextRound] = true;
        saveToStorage();
        showToast(`📢 Gameweek ${nextRound} automatically released!`);
        renderGameweekTabs();
    }
}

function releaseNextRound() {
    if (!isAdmin) return;
    
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    let nextUnreleasedRound = null;
    
    for (let round = 1; round <= totalRounds; round++) {
        if (!releasedGameweeks[round]) {
            nextUnreleasedRound = round;
            break;
        }
    }
    
    if (nextUnreleasedRound) {
        releasedGameweeks[nextUnreleasedRound] = true;
        saveToStorage();
        showToast(`📢 Gameweek ${nextUnreleasedRound} released!`);
        renderGameweekTabs();
        
        currentSelectedRound = nextUnreleasedRound;
        renderFixtures();
    } else {
        showToast("All gameweeks are already released!");
    }
}

function lockGameweek(roundNumber) {
    if (!isAdmin) return;
    releasedGameweeks[roundNumber] = false;
    saveToStorage();
    showToast(`🔒 Gameweek ${roundNumber} locked!`);
    renderGameweekTabs();
    renderFixtures();
}

function isGameweekReleased(roundNumber) {
    if (isAdmin) return true;
    return releasedGameweeks[roundNumber] === true;
}
// ==================== FIXTURE GENERATION ====================
function generateRandomRoundRobin(teamNames) {
    let n = teamNames.length;
    if (n % 2 !== 0) { teamNames.push("BYE"); n++; }
    let shuffled = [...teamNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const numRounds = n - 1;
    const halfSize = n / 2;
    let firstHalfRounds = [];
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
        firstHalfRounds.push(roundFixtures);
        const last = shuffled.pop();
        shuffled.splice(1, 0, last);
    }
    for (let i = firstHalfRounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [firstHalfRounds[i], firstHalfRounds[j]] = [firstHalfRounds[j], firstHalfRounds[i]];
    }
    const secondHalfRounds = firstHalfRounds.map(roundFixtures => {
        return roundFixtures.map(fixture => ({ home: fixture.away, away: fixture.home }));
    });
    return [...firstHalfRounds, ...secondHalfRounds];
}

// ==================== DIRECT FIXTURE EDITOR ====================
function openDirectFixtureEditor() {
    if (!isAdmin) return;
    
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const matchesPerRound = fixtures.filter(f => f.round === 1).length;
    const allTeams = Object.values(teams).filter(t => !t.relegated).map(t => t.name).sort();
    
    let modalHtml = `
        <div id="direct-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div class="p-5 border-b border-gray-200 sticky top-0 bg-white flex justify-between items-center">
                    <h3 class="font-bold text-lg">✏️ Direct Fixture Editor</h3>
                    <button onclick="closeDirectEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-5 space-y-4">
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="text-xs font-semibold text-gray-500 uppercase">Select Round</label>
                            <select id="editor-round-select" class="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm">
    `;
    
    for (let r = 1; r <= halfRounds; r++) {
        const roundFixtures = fixtures.filter(f => f.round === r);
        const isCompleted = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
        modalHtml += `<option value="${r}" ${isCompleted ? 'disabled' : ''}>Round ${r} ${isCompleted ? '(Completed - Locked)' : ''}</option>`;
    }
    
    modalHtml += `
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button onclick="loadRoundForDirectEdit()" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl text-sm font-semibold transition">Load Round</button>
                        </div>
                        <div class="flex items-end">
                            <button onclick="validateCurrentRound()" class="w-full bg-green-600 hover:bg-green-500 text-white py-2 rounded-xl text-sm font-semibold transition">✅ Validate Round</button>
                        </div>
                    </div>
                    
                    <div id="direct-editor-container" class="space-y-3 mt-4">
                        <p class="text-center text-gray-400 py-8">Select a round and click "Load Round"</p>
                    </div>
                    
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button onclick="closeDirectEditor()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                        <button id="save-direct-changes-btn" onclick="saveDirectEdits()" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 hidden">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('direct-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('direct-editor-modal').classList.remove('hidden');
    document.getElementById('direct-editor-modal').classList.add('flex');
}

function closeDirectEditor() {
    const modal = document.getElementById('direct-editor-modal');
    if (modal) modal.remove();
}

function loadRoundForDirectEdit() {
    const roundNumber = parseInt(document.getElementById('editor-round-select').value);
    const roundFixtures = fixtures.filter(f => f.round === roundNumber && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
    const allTeams = Object.values(teams).filter(t => !t.relegated).map(t => t.name).sort();
    const container = document.getElementById('direct-editor-container');
    
    if (!roundFixtures.length) {
        container.innerHTML = '<p class="text-center text-red-500 py-8">No fixtures found for this round</p>';
        return;
    }
    
    let html = `
        <div class="bg-amber-50 p-3 rounded-lg mb-3">
            <p class="text-xs text-amber-700">⚠️ Edit fixtures below. Click "Validate Round" to check for errors, then "Save Changes".</p>
        </div>
        <div class="space-y-3">
    `;
    
    roundFixtures.forEach((fixture, idx) => {
        // Create dropdown options for home team
        let homeOptions = `<option value="${fixture.home}" selected>${fixture.home}</option>`;
        let awayOptions = `<option value="${fixture.away}" selected>${fixture.away}</option>`;
        
        for (const team of allTeams) {
            if (team !== fixture.home) homeOptions += `<option value="${team}">${team}</option>`;
            if (team !== fixture.away) awayOptions += `<option value="${team}">${team}</option>`;
        }
        
        html += `
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200" data-fixture-id="${fixture.id}">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="text-xs text-gray-500">Home Team</label>
                        <select class="direct-home-select w-full mt-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                            ${homeOptions}
                        </select>
                    </div>
                    <div>
                        <label class="text-xs text-gray-500">Away Team</label>
                        <select class="direct-away-select w-full mt-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                            ${awayOptions}
                        </select>
                    </div>
                </div>
                <div class="text-xs text-gray-400 mt-2 text-center">
                    Original: ${fixture.home} vs ${fixture.away}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
    document.getElementById('save-direct-changes-btn').classList.remove('hidden');
}

function validateCurrentRound() {
    const roundNumber = parseInt(document.getElementById('editor-round-select').value);
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    
    const homeSelects = document.querySelectorAll('.direct-home-select');
    const awaySelects = document.querySelectorAll('.direct-away-select');
    
    const newMatchups = [];
    const errors = [];
    
    // Collect new matchups
    for (let i = 0; i < homeSelects.length; i++) {
        const home = homeSelects[i].value;
        const away = awaySelects[i].value;
        
        if (home === away) {
            errors.push(`❌ Match ${i + 1}: ${home} cannot play against itself!`);
        }
        
        newMatchups.push({ home, away });
    }
    
    // Check for duplicates within the same round
    for (let i = 0; i < newMatchups.length; i++) {
        for (let j = i + 1; j < newMatchups.length; j++) {
            if ((newMatchups[i].home === newMatchups[j].home && newMatchups[i].away === newMatchups[j].away) ||
                (newMatchups[i].home === newMatchups[j].away && newMatchups[i].away === newMatchups[j].home)) {
                errors.push(`❌ Duplicate matchup: ${newMatchups[i].home} vs ${newMatchups[i].away} appears twice in this round!`);
            }
        }
    }
    
    // Check teams don't appear twice in the same round
    const teamsInRound = [];
    for (const match of newMatchups) {
        if (teamsInRound.includes(match.home)) errors.push(`❌ ${match.home} appears twice in this round!`);
        if (teamsInRound.includes(match.away)) errors.push(`❌ ${match.away} appears twice in this round!`);
        teamsInRound.push(match.home, match.away);
    }
    
    // Check against protected rounds (if this is first half)
    if (roundNumber <= halfRounds) {
        const protectedMatchups = new Set();
        for (let round = 1; round < roundNumber; round++) {
            const roundFixtures = fixtures.filter(f => f.round === round);
            for (const f of roundFixtures) {
                protectedMatchups.add(`${f.home}|${f.away}`);
            }
        }
        
        for (const match of newMatchups) {
            const matchupKey = `${match.home}|${match.away}`;
            if (protectedMatchups.has(matchupKey)) {
                errors.push(`❌ Matchup ${match.home} vs ${match.away} already exists in an earlier round!`);
            }
        }
    }
    
    if (errors.length > 0) {
        alert(`⚠️ Validation Errors:\n\n${errors.join('\n')}`);
    } else {
        alert(`✅ Round ${roundNumber} is VALID! You can save these changes.`);
    }
}

async function saveDirectEdits() {
    const roundNumber = parseInt(document.getElementById('editor-round-select').value);
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const roundFixtures = fixtures.filter(f => f.round === roundNumber);
    
    const homeSelects = document.querySelectorAll('.direct-home-select');
    const awaySelects = document.querySelectorAll('.direct-away-select');
    
    const changes = [];
    
    for (let i = 0; i < homeSelects.length && i < roundFixtures.length; i++) {
        const newHome = homeSelects[i].value;
        const newAway = awaySelects[i].value;
        const fixture = roundFixtures[i];
        
        if (newHome !== fixture.home || newAway !== fixture.away) {
            changes.push({ fixture, newHome, newAway });
        }
    }
    
    if (changes.length === 0) {
        if (!confirm("No changes detected. Close editor?")) return;
        closeDirectEditor();
        return;
    }
    
    let message = `Save ${changes.length} change(s) to Round ${roundNumber}?\n\n`;
    for (const change of changes) {
        message += `• ${change.fixture.home} vs ${change.fixture.away} → ${change.newHome} vs ${change.newAway}\n`;
    }
    
    if (!confirm(message)) return;
    
    // Apply changes
    for (const change of changes) {
        change.fixture.home = change.newHome;
        change.fixture.away = change.newAway;
        change.fixture.homeScore = null;
        change.fixture.awayScore = null;
        change.fixture.played = false;
        change.fixture.cancelled = false;
        change.fixture.report = null;
        change.fixture.events = [];
    }
    
    // Regenerate second half to mirror first half
    for (let round = 1; round <= halfRounds; round++) {
        const secondHalfRound = round + halfRounds;
        const firstHalfFixtures = fixtures.filter(f => f.round === round);
        const secondHalfFixtures = fixtures.filter(f => f.round === secondHalfRound);
        
        for (let i = 0; i < firstHalfFixtures.length && i < secondHalfFixtures.length; i++) {
            const first = firstHalfFixtures[i];
            const second = secondHalfFixtures[i];
            if (first && second) {
                second.home = first.away;
                second.away = first.home;
                second.homeScore = null;
                second.awayScore = null;
                second.played = false;
                second.cancelled = false;
                second.report = null;
                second.events = [];
            }
        }
    }
    
    saveToStorage();
    updateTableCalculations();
    renderTable();
    renderGameweekTabs();
    renderFixtures();
    generateTickerFacts();
    
    showToast(`✅ Round ${roundNumber} updated with ${changes.length} change(s)!`);
    closeDirectEditor();
    validateFixtureIntegrity();
}

// ==================== INTEGRITY VALIDATION ====================
function validateFixtureIntegrity(silent = false) {
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    let issues = [];
    
    // Check 1: No team plays twice in the same round
    for (let round = 1; round <= totalRounds; round++) {
        const roundFixtures = fixtures.filter(f => f.round === round);
        const teamsInRound = [];
        for (const f of roundFixtures) {
            if (teamsInRound.includes(f.home)) issues.push(`Round ${round}: ${f.home} appears twice!`);
            if (teamsInRound.includes(f.away)) issues.push(`Round ${round}: ${f.away} appears twice!`);
            teamsInRound.push(f.home, f.away);
        }
    }
    
    // Check 2: No duplicate matchups in the same half
    const firstHalfMatches = new Set();
    for (let round = 1; round <= halfRounds; round++) {
        const roundFixtures = fixtures.filter(f => f.round === round);
        for (const f of roundFixtures) {
            const matchup = `${f.home} vs ${f.away}`;
            if (firstHalfMatches.has(matchup)) issues.push(`Duplicate matchup in first half: ${matchup}`);
            firstHalfMatches.add(matchup);
        }
    }
    
    // Check 3: Second half mirrors first half
    for (let round = 1; round <= halfRounds; round++) {
        const secondHalfRound = round + halfRounds;
        const firstHalfFixtures = fixtures.filter(f => f.round === round);
        const secondHalfFixtures = fixtures.filter(f => f.round === secondHalfRound);
        
        for (let i = 0; i < firstHalfFixtures.length; i++) {
            const first = firstHalfFixtures[i];
            const second = secondHalfFixtures[i];
            if (second && (second.home !== first.away || second.away !== first.home)) {
                issues.push(`Round ${secondHalfRound} does not mirror Round ${round}`);
            }
        }
    }
    
    // Check 4: No team plays against itself
    for (const f of fixtures) {
        if (f.home === f.away && f.home !== "BYE") {
            issues.push(`Invalid fixture: ${f.home} vs ${f.away} (team cannot play itself)`);
        }
    }
    
    // Check 5: Each team has equal number of home and away games in first half
    const homeCount = {};
    const awayCount = {};
    for (let round = 1; round <= halfRounds; round++) {
        const roundFixtures = fixtures.filter(f => f.round === round);
        for (const f of roundFixtures) {
            if (f.home !== "BYE") homeCount[f.home] = (homeCount[f.home] || 0) + 1;
            if (f.away !== "BYE") awayCount[f.away] = (awayCount[f.away] || 0) + 1;
        }
    }
    for (const team in homeCount) {
        if (homeCount[team] !== awayCount[team]) {
            issues.push(`${team} has ${homeCount[team]} home games and ${awayCount[team]} away games in first half`);
        }
    }
    
    if (issues.length > 0) {
        console.warn("⚠️ Integrity issues found:", issues);
        if (!silent) showToast(`⚠️ Found ${issues.length} integrity issues! Check console.`);
    } else {
        console.log("✅ All fixtures are valid!");
        if (!silent) showToast("✅ Fixture integrity check passed!");
    }
    
    return issues;
}

// ==================== CHAT ====================
function initChatListener() {
    chatMessagesRef = getChatRef();
    chatMessagesRef.off();
    chatMessagesRef.on('child_added', (snapshot) => { appendChatMessage(snapshot.val()); });
    initTypingListener();
    initPollListener();
}

function openChatModal() {
    const modal = document.getElementById('chat-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.style.display = 'flex';
        const savedName = localStorage.getItem('chatNickname');
        if (savedName) document.getElementById('chat-nickname').value = savedName;
        const container = document.getElementById('chat-messages-container');
        if (container) container.scrollTop = container.scrollHeight;
        isChatModalOpen = true;
        lastReadTimestamp = Date.now();
        localStorage.setItem('chatLastRead', lastReadTimestamp);
        unreadMessagesCount = 0;
        updateUnreadBadge();
        const pollBtn = document.getElementById('create-poll-btn');
        if (pollBtn) { if (isAdmin) pollBtn.classList.remove('hidden'); else pollBtn.classList.add('hidden'); }
    }
}

function closeChatModal() {
    const modal = document.getElementById('chat-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.style.display = '';
    }
    isChatModalOpen = false;
}

function updateUnreadBadge() {
    const badge = document.getElementById('chat-unread-badge');
    if (badge) {
        if (unreadMessagesCount > 0) {
            badge.classList.remove('hidden');
            badge.innerText = unreadMessagesCount > 99 ? '99+' : unreadMessagesCount;
        } else { badge.classList.add('hidden'); }
    }
}

function sendTypingStatus() {
    if (!userRole) return;
    if (!isTyping) {
        isTyping = true;
        getTypingRef().set({ user: userRole === 'admin' ? 'Admin' : (localStorage.getItem('chatNickname') || 'Fan'), timestamp: Date.now() });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { isTyping = false; getTypingRef().remove(); }, 1500);
}

function initTypingListener() {
    getTypingRef().on('value', (snapshot) => {
        const data = snapshot.val();
        const typingDiv = document.getElementById('chat-typing-indicator');
        if (data && data.user) { typingDiv.innerText = `${data.user} is typing...`; typingDiv.classList.remove('hidden'); }
        else { typingDiv.classList.add('hidden'); }
    });
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    if (container.children.length === 1 && container.children[0].innerText.includes('Loading')) container.innerHTML = '';
    if (msg.isPoll && msg.pollId) { renderPollMessage(msg.pollId); return; }
    const date = new Date(msg.timestamp).toLocaleString();
    const currentUserId = getCurrentUserId();
    const isCurrentUser = (msg.userId === currentUserId);
    const bubbleClass = isCurrentUser ? 'sent' : 'received';
    let formattedText = escapeHtml(msg.text);
    formattedText = formattedText.replace(/@(\w+)/g, '<span class="text-blue-600 font-semibold">@$1</span>');
    const canDelete = (isAdmin || isCurrentUser);
    const deleteBtn = canDelete ? `<button onclick="deleteChatMessage('${msg.messageId}', '${msg.userId}')" class="chat-delete-btn" title="Delete">🗑️</button>` : '';
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${bubbleClass}`;
    messageDiv.innerHTML = `<div class="bubble">${deleteBtn}<p>${formattedText}</p><div class="message-meta"><span class="message-author">${escapeHtml(msg.nickname)}</span><span class="message-time">${date}</span></div></div>`;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    if (!isChatModalOpen && !isCurrentUser && msg.timestamp > lastReadTimestamp) { unreadMessagesCount++; updateUnreadBadge(); }
}

function sendChatMessage() {
    const nicknameInput = document.getElementById('chat-nickname');
    let nickname = nicknameInput.value.trim();
    if (nickname === "") { alert("Please enter your name"); return; }
    const text = document.getElementById('chat-input').value.trim();
    if (text === "") return;
    localStorage.setItem('chatNickname', nickname);
    const userId = getCurrentUserId();
    const message = { nickname: nickname.slice(0,20), text: text.slice(0,200), timestamp: Date.now(), userId: userId, messageId: Date.now() + '_' + Math.random().toString(36).substr(2, 6) };
    if (chatMessagesRef) { chatMessagesRef.push(message); document.getElementById('chat-input').value = ''; hideMentionDropdown(); }
    else { showToast("Chat not ready"); }
}

function deleteChatMessage(messageId, messageUserId) {
    const currentUserId = getCurrentUserId();
    if (!isAdmin && currentUserId !== messageUserId) { showToast("You can only delete your own messages"); return; }
    chatMessagesRef.orderByChild('messageId').equalTo(messageId).once('value', snapshot => { snapshot.forEach(child => { child.ref.remove(); showToast("Message deleted"); }); });
}

function onChatInput() {
    const input = document.getElementById('chat-input');
    const value = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1 && (lastAtIndex === 0 || value[lastAtIndex-1] === ' ')) {
        currentMentionText = textBeforeCursor.slice(lastAtIndex + 1);
        showMentionSuggestions(currentMentionText);
    } else { hideMentionDropdown(); }
    sendTypingStatus();
}

function showMentionSuggestions(query) {
    const nicknames = new Set();
    document.querySelectorAll('#chat-messages-container .message-author').forEach(el => nicknames.add(el.innerText));
    nicknames.add(localStorage.getItem('chatNickname'));
    const filtered = Array.from(nicknames).filter(n => n && n.toLowerCase().includes(query.toLowerCase()));
    const dropdown = document.getElementById('mention-dropdown');
    if (filtered.length === 0) { dropdown.classList.add('hidden'); return; }
    dropdown.innerHTML = filtered.map(n => `<div class="mention-item px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" data-name="${n}">@${n}</div>`).join('');
    dropdown.classList.remove('hidden');
    const input = document.getElementById('chat-input');
    const rect = input.getBoundingClientRect();
    dropdown.style.bottom = `${window.innerHeight - rect.top + 5}px`;
    dropdown.style.left = `${rect.left}px`;
    document.querySelectorAll('.mention-item').forEach(item => { item.onclick = () => { insertMention(item.dataset.name); }; });
}

function insertMention(name) {
    const input = document.getElementById('chat-input');
    const value = input.value;
    const cursorPos = input.selectionStart;
    const lastAtIndex = value.lastIndexOf('@', cursorPos-1);
    if (lastAtIndex !== -1) {
        const newValue = value.slice(0, lastAtIndex) + `@${name} ` + value.slice(cursorPos);
        input.value = newValue;
        input.focus();
        input.selectionStart = input.selectionEnd = lastAtIndex + name.length + 2;
    }
    hideMentionDropdown();
}

function hideMentionDropdown() { document.getElementById('mention-dropdown').classList.add('hidden'); }

// ==================== POLLS ====================
function initPollListener() { getPollsRef().on('child_changed', (snapshot) => { const poll = snapshot.val(); if (poll) updatePollUI(poll.id); }); }
function openPollModal() { if (!isAdmin) return; document.getElementById('poll-modal').classList.remove('hidden'); document.getElementById('poll-modal').classList.add('flex'); }
function closePollModal() { document.getElementById('poll-modal').classList.add('hidden'); document.getElementById('poll-modal').classList.remove('flex'); }
function addPollOption() { const container = document.getElementById('poll-options-container'); const div = document.createElement('div'); div.className = 'flex gap-2 mb-2'; div.innerHTML = `<input type="text" placeholder="Option" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button>`; container.appendChild(div); }
function removePollOption(btn) { btn.parentElement.remove(); }
function createPoll() {
    const question = document.getElementById('poll-question').value.trim();
    if (!question) { alert("Enter a question"); return; }
    const options = Array.from(document.querySelectorAll('.poll-option')).map(inp => inp.value.trim()).filter(v => v);
    if (options.length < 2) { alert("At least 2 options"); return; }
    const pollId = Date.now();
    const poll = { id: pollId, question: question, options: options.map(opt => ({ text: opt, votes: 0 })), totalVotes: 0, voters: {}, createdAt: Date.now() };
    getPollsRef().child(`${pollId}`).set(poll);
    const msg = { nickname: "System", text: `📊 New poll: ${question}`, timestamp: Date.now(), userId: `poll_${pollId}`, isPoll: true, pollId: pollId };
    getChatRef().push(msg);
    closePollModal();
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-options-container').innerHTML = `<div class="flex gap-2 mb-2"><input type="text" placeholder="Option 1" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div><div class="flex gap-2 mb-2"><input type="text" placeholder="Option 2" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div>`;
}
function votePoll(pollId, optionIndex) {
    const nickname = localStorage.getItem('chatNickname') || 'Fan';
    const pollRef = getPollsRef().child(`${pollId}`);
    pollRef.child(`voters/${nickname}`).once('value', snap => {
        if (snap.exists()) { showToast("You already voted"); return; }
        pollRef.child(`options/${optionIndex}/votes`).transaction(votes => (votes || 0) + 1);
        pollRef.child('totalVotes').transaction(total => (total || 0) + 1);
        pollRef.child(`voters/${nickname}`).set(true);
        showToast("Vote cast!");
    });
}
function renderPollMessage(pollId) {
    getPollsRef().child(`${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const container = document.getElementById('chat-messages-container');
        const pollDiv = document.createElement('div');
        pollDiv.className = 'poll-card bg-white rounded-lg p-3 shadow my-2 border relative';
        pollDiv.id = `poll-${poll.id}`;
        const deleteBtn = isAdmin ? `<button onclick="deletePoll('${poll.id}')" class="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs bg-white rounded-full p-1 shadow">🗑️</button>` : '';
        pollDiv.innerHTML = `${deleteBtn}<p class="font-bold">📊 ${escapeHtml(poll.question)}</p><div class="space-y-2 mt-2" id="poll-options-${poll.id}"></div><div class="text-xs text-gray-500 mt-2">${poll.totalVotes || 0} vote(s)</div>`;
        container.appendChild(pollDiv);
        updatePollUI(poll.id);
    });
}
function updatePollUI(pollId) {
    getPollsRef().child(`${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const optionsContainer = document.getElementById(`poll-options-${pollId}`);
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '';
        const total = poll.totalVotes || 1;
        poll.options.forEach((opt, idx) => {
            const percent = ((opt.votes || 0) / total) * 100;
            optionsContainer.innerHTML += `<div class="flex items-center justify-between gap-2 text-sm"><span class="flex-1">${escapeHtml(opt.text)}</span><span class="w-16 text-right">${opt.votes || 0}</span><div class="w-24 h-2 bg-gray-200 rounded-full overflow-hidden"><div class="h-full bg-emerald-500 rounded-full" style="width: ${percent}%"></div></div><button onclick="votePoll(${pollId}, ${idx})" class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-200">Vote</button></div>`;
        });
        const totalSpan = optionsContainer.parentElement?.querySelector('.text-xs');
        if (totalSpan) totalSpan.innerText = `${poll.totalVotes || 0} vote(s)`;
    });
}
function deletePoll(pollId) {
    if (!isAdmin) return;
    if (confirm("Delete this poll permanently?")) {
        getPollsRef().child(`${pollId}`).remove();
        getChatRef().orderByChild('pollId').equalTo(pollId).once('value', (snapshot) => { snapshot.forEach(child => { child.ref.remove(); }); });
        const pollCard = document.getElementById(`poll-${pollId}`);
        if (pollCard) pollCard.remove();
        showToast("Poll deleted");
    }
}

// ==================== DATABASE SYNC ====================
function initRealtimeDatabaseSync() {
    getTournamentRef().on('value', (snapshot) => {
        if (isLoadingLeague) return;
        if (snapshot.exists() && userRole) {
            isLoadingLeague = true;
            loadTournamentData(snapshot.val());
            isLoadingLeague = false;
        } else if (!snapshot.exists() && userRole === 'admin') {
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
        } else if (!snapshot.exists() && userRole === 'viewer') {
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('setup-section')?.classList.add('hidden');
        }
    });
    getTournamentRef().child('fixtures').on('child_changed', (snapshot) => {
        const updated = snapshot.val();
        if (updated && updated.played === true && updated.homeScore !== null) {
            showToast(`📢 Result: ${updated.home} ${updated.homeScore}-${updated.awayScore} ${updated.away}`);
        }
    });
    if (userRole) initChatListener();
}

// ==================== BACK TO TOP ====================
function initBackToTop() {
    const backBtn = document.getElementById('backToTop');
    if (!backBtn) return;
    window.addEventListener('scroll', () => { if (window.scrollY > 300) backBtn.classList.remove('hidden'); else backBtn.classList.add('hidden'); });
    backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
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
    tickerFacts = [`🏆 DLS Vawulence Ligue 1`, `⚽ ${totalTeams} teams`, `📊 ${totalMatchesPlayed}/${totalMatches} played`, leader ? `👑 Leader: ${leader.name} (${leader.pts} pts)` : null, topScorer ? `🔥 Top scorer: ${topScorer.name} (${topScorer.gf} goals)` : null, biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore}-${biggestWin.awayScore} ${biggestWin.away}` : null, `🔮 Predict matches & post banter!`].filter(f => f);
    if (tickerFacts.length) {
        const el = document.getElementById('news-ticker');
        if (el) el.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-white rounded-full animate-pulse"></span> ${tickerFacts[0]}</span>`;
        currentTickerFactIndex = 0;
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateTickerFacts, 6000);
    }
}

// ==================== SCREENSHOT UPLOAD & GROQ VISION ====================
async function uploadScreenshot(fixtureId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result.split(',')[1];
            showToast("Processing screenshot with AI...");
            
            try {
                const extracted = await callGroqVision(base64);
                applyExtractedDataToFixture(fixtureId, extracted);
            } catch (err) {
                console.error(err);
                showToast("Failed to parse screenshot. Check backend or image quality.");
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function callGroqVision(base64Image) {
    const response = await fetch(`${BACKEND_URL}/parse-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Backend error");
    }
    
    const data = await response.json();
    if (!data.success) throw new Error("Extraction failed");
    return data; // { home, away, homeScore, awayScore, events }
}

function applyExtractedDataToFixture(fixtureId, extracted) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    if (!fixture) return;
    
    // Optional team name mismatch warning
    if (fixture.home !== extracted.home || fixture.away !== extracted.away) {
        if (!confirm(`⚠️ Screenshot shows ${extracted.home} vs ${extracted.away}\nCurrent fixture is ${fixture.home} vs ${fixture.away}\nStill apply?`)) {
            return;
        }
    }
    
    document.getElementById(`home-score-${fixtureId}`).value = extracted.homeScore;
    document.getElementById(`away-score-${fixtureId}`).value = extracted.awayScore;
    
    pendingFixtureId = fixtureId;
    pendingHomeScore = extracted.homeScore;
    pendingAwayScore = extracted.awayScore;
    
    openGoalEditorWithEvents(extracted.events);
}

function openGoalEditorWithEvents(existingEvents) {
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    const totalGoals = pendingHomeScore + pendingAwayScore;
    
    let modalHtml = `<div id="goal-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
                <h3 class="font-bold text-lg">⚽ Review Goal Details (AI extracted)</h3>
                <button onclick="closeGoalEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div class="p-5 space-y-4">
                <p class="text-sm text-gray-600">Match: ${fixture.home} vs ${fixture.away}</p>
                <p class="text-sm font-semibold">Score: ${pendingHomeScore} - ${pendingAwayScore}</p>
                <div id="goals-list-container" class="space-y-3">`;
    
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
            </div>`;
    }
    
    modalHtml += `</div>
                <div class="flex justify-end gap-3 pt-4">
                    <button onclick="closeGoalEditor()" class="px-4 py-2 border rounded-lg">Cancel</button>
                    <button onclick="saveGoalsAndFinish()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save Match & Report</button>
                </div>
            </div>
        </div>
    </div>`;
    
    const existingModal = document.getElementById('goal-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ==================== ADMIN MODE ====================
function handleAdminToggleClick() { if (!isAdmin) { document.getElementById('admin-password-input').value = ""; document.getElementById('password-error').classList.add('hidden'); document.getElementById('password-modal').classList.remove('hidden'); } else deactivateAdminMode(); }
function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }
function verifyAdminPassword() { const val = document.getElementById('admin-password-input').value; if (val === tournamentPassword) { closePasswordModal(); activateAdminMode(); } else document.getElementById('password-error').classList.remove('hidden'); }
function activateAdminMode() { isAdmin = true; updateAdminUIElements(); showToast("Admin mode ACTIVE"); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); showToast("Admin mode deactivated"); }
function updateAdminUIElements() {
    const btn = document.getElementById('admin-btn'), dot = document.getElementById('admin-btn-dot'), statusText = document.getElementById('admin-status-text'), resetContainer = document.getElementById('admin-reset-container'), thActions = document.getElementById('th-admin-actions'), hint = document.getElementById('admin-table-hint'), relegationZone = document.getElementById('relegation-zone');
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

// ==================== PENALTY ====================
function openPenaltyModal(teamName) { if (!isAdmin) return; currentPenaltyTeam = teamName; const team = teams[teamName]; document.getElementById('penalty-team-name').innerText = teamName; document.getElementById('current-penalty').innerText = team.deductedPoints || 0; document.getElementById('penalty-modal').classList.remove('hidden'); }
function closePenaltyModal() { document.getElementById('penalty-modal').classList.add('hidden'); currentPenaltyTeam = null; }
function adjustPenalty(delta) { if (!currentPenaltyTeam) return; const team = teams[currentPenaltyTeam]; let newVal = (team.deductedPoints || 0) + delta; if (newVal < 0) newVal = 0; team.deductedPoints = newVal; document.getElementById('current-penalty').innerText = newVal; saveToStorage(); renderTable(); showToast(`${currentPenaltyTeam} penalty now ${newVal} pts`); }
function clearPenaltyPoints() { if (!currentPenaltyTeam) return; teams[currentPenaltyTeam].deductedPoints = 0; document.getElementById('current-penalty').innerText = "0"; saveToStorage(); renderTable(); showToast(`Penalty cleared for ${currentPenaltyTeam}`); closePenaltyModal(); }

// ==================== TOURNAMENT SETUP ====================
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter at least 2 teams"); return; }
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
    let list = [];
    for (let i = 1; i <= count; i++) { let name = document.getElementById(`team-input-${i}`).value.trim(); if (name === "") name = `Team ${i}`; list.push({ name }); }
    if (list.length % 2 !== 0) list.push({ name: "BYE" });
    teams = {};
    list.forEach(item => { if (item.name !== "BYE") teams[item.name] = { name: item.name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: 0, formHistory: [], relegated: false }; });
    const teamNames = Object.keys(teams);
    const rounds = generateRandomRoundRobin(teamNames);
    fixtures = [];
    let fixtureId = 0;
    rounds.forEach((roundFixtures, roundIndex) => {
        roundFixtures.forEach(({ home, away }) => {
            fixtures.push({ id: fixtureId++, round: roundIndex + 1, home, away, homeScore: null, awayScore: null, played: false, cancelled: false, comment: null, predictions: [], banter: [], events: [], report: null, deadline: null });
        });
    });
    tournamentPhase = 'league';
    knockoutMatches = [];
    roundStartTimes = {};
    autoStartNextRound = false;
    currentSelectedRound = 1;
releasedGameweeks = { 1: true };
    saveToStorage();
    showToast(`Ligue 1 launched with ${count} teams!`);
}

function openReplaceTeamModal(teamName) {
    if (!isAdmin) return;
    pendingReplaceOldTeam = teamName;
    document.getElementById('replace-old-team-name').innerText = teamName;
    document.getElementById('replace-new-team-name').value = '';
    document.getElementById('replace-team-modal').classList.remove('hidden');
    document.getElementById('replace-team-modal').classList.add('flex');
}
function closeReplaceTeamModal() {
    document.getElementById('replace-team-modal').classList.add('hidden');
    document.getElementById('replace-team-modal').classList.remove('flex');
    pendingReplaceOldTeam = null;
}
function confirmReplaceTeam() {
    if (!pendingReplaceOldTeam) return;
    const newName = document.getElementById('replace-new-team-name').value.trim();
    if (newName === "") { alert("Please enter a new team name"); return; }
    if (teams[newName] && !teams[newName].relegated) { alert(`Team "${newName}" already exists.`); return; }
    if (newName.length > 30) { alert("Team name too long"); return; }
    const oldName = pendingReplaceOldTeam;
    const oldTeamData = teams[oldName];
    if (!oldTeamData) return;
    teams[newName] = { ...oldTeamData, name: newName };
    delete teams[oldName];
    fixtures.forEach(f => { if (f.home === oldName) f.home = newName; if (f.away === oldName) f.away = newName; });
    knockoutMatches.forEach(k => { if (k.home === oldName) k.home = newName; if (k.away === oldName) k.away = newName; });
    saveToStorage();
    updateTableCalculations();
    renderTable();
    renderGameweekTabs();
    renderFixtures();
    renderKnockoutBracket();
    renderRelegatedTeams();
    generateTickerFacts();
    showToast(`Team "${oldName}" replaced with "${newName}"`);
    closeReplaceTeamModal();
   validateFixtureIntegrity();
}

// ==================== FIXTURE MANAGEMENT ====================
function swapFixture(fixtureId) {
    if (!isAdmin) return;
    const f = fixtures.find(f => f.id === fixtureId);
    [f.home, f.away] = [f.away, f.home];
    f.homeScore = null; f.awayScore = null; f.played = false; f.comment = null; f.cancelled = false;
    saveToStorage(); showToast(`Swapped ${f.home} vs ${f.away}`); renderFixtures(); renderTable(); generateTickerFacts();
}
function editFixtureTeamName(fixtureId, side) {
    if (!isAdmin) return;
    const fixture = fixtures.find(f => f.id === fixtureId);
    
    // Calculate halves
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const isFirstHalf = fixture.round <= halfRounds;
    
    // Find the highest completed round
    let highestCompletedRound = 0;
    for (let round = 1; round <= (isFirstHalf ? halfRounds : totalRounds); round++) {
        const roundFixtures = fixtures.filter(f => f.round === round);
        const allResolved = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
        if (allResolved) {
            highestCompletedRound = round;
        } else {
            break;
        }
    }
    
    // Prevent editing completed rounds
    if (fixture.round <= highestCompletedRound) {
        alert(`⚠️ Cannot edit Round ${fixture.round} because it has already been completed!\n\nCompleted rounds cannot be modified.`);
        return;
    }
    
    if (!isFirstHalf) {
        alert("⚠️ Please edit the FIRST HALF fixture instead.\n\nThe second half automatically mirrors the first half (home/away swapped).\n\nGo to Round " + (fixture.round - halfRounds) + " to make your change.");
        return;
    }
    
    const dropdown = document.getElementById('team-select-dropdown');
    dropdown.innerHTML = '<option value="">— Cancel / No change —</option>';
    const otherSide = side === 'home' ? fixture.away : fixture.home;
    const teamNames = Object.values(teams).filter(t => !t.relegated).map(t => t.name).sort();
    teamNames.forEach(name => {
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
function closeTeamSelectModal() { document.getElementById('team-select-modal').classList.add('hidden'); pendingAssignFixtureId = null; pendingAssignSide = null; }
function confirmTeamSelection() {
    if (pendingAssignFixtureId === null) return;
    const selected = document.getElementById('team-select-dropdown').value;
    if (selected === '') { closeTeamSelectModal(); return; }
    const fixture = fixtures.find(f => f.id === pendingAssignFixtureId);
    const side = pendingAssignSide;
    
    const oldHome = fixture.home;
    const oldAway = fixture.away;
    const currentRound = fixture.round;
    
    // Calculate halves
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const isFirstHalf = currentRound <= halfRounds;
    
    // Prevent editing second half fixtures
    if (!isFirstHalf) {
        alert("⚠️ Please edit the FIRST HALF fixture instead.\n\nThe second half automatically mirrors the first half (home/away swapped).\n\nGo to Round " + (currentRound - halfRounds) + " to make your change.");
        closeTeamSelectModal();
        return;
    }
    
    if (selected === 'BYE_REMOVE') {
        if (side === 'home') fixture.home = 'BYE'; else fixture.away = 'BYE';
        fixture.homeScore = null; fixture.awayScore = null; fixture.played = false; fixture.comment = null; fixture.cancelled = false;
        delete fixture.vacantHome; delete fixture.vacantAway;
        saveToStorage(); 
        showToast(`Removed team, set to BYE`);
        
        // Regenerate second half to mirror updated first half
        regenerateSecondHalf();
        
        renderFixtures(); 
        renderTable(); 
        generateTickerFacts(); 
        closeTeamSelectModal();
        return;
    }
    
    const newTeam = selected;
    const oldTeam = side === 'home' ? fixture.home : fixture.away;
    if (newTeam === oldTeam) { closeTeamSelectModal(); return; }
    if (teams[newTeam]?.relegated) { showToast(`Cannot assign a relegated team.`); closeTeamSelectModal(); return; }
    
    // Apply the edit to current fixture first
    if (side === 'home') { fixture.home = newTeam; delete fixture.vacantHome; }
    else { fixture.away = newTeam; delete fixture.vacantAway; }
    
    // Ask admin to reshuffle the first half
    if (confirm(`⚠️ You changed a fixture in Round ${currentRound}.\n\nDo you want to RESHUFFLE the ENTIRE FIRST HALF to create a valid schedule while keeping your change?\n\nThe second half will automatically mirror the new first half.\n\nClick OK to reshuffle, Cancel to keep as-is (may cause duplicates).`)) {
        
        showToast(`Reshuffling first half fixtures...`);
        
        // Get all active teams
        const activeTeams = Object.values(teams).filter(t => !t.relegated).map(t => t.name);
        
        // Generate new first half fixtures
        const newFirstHalfRounds = generateRandomRoundRobinFirstHalf(activeTeams);
        
        // Apply new fixtures to rounds 1 to halfRounds
        for (let round = 1; round <= halfRounds; round++) {
            const roundFixtures = fixtures.filter(f => f.round === round);
            const newRoundFixtures = newFirstHalfRounds[round - 1] || [];
            
            for (let i = 0; i < roundFixtures.length && i < newRoundFixtures.length; i++) {
                const f = roundFixtures[i];
                const newF = newRoundFixtures[i];
                if (newF) {
                    f.home = newF.home;
                    f.away = newF.away;
                    // Reset results
                    f.homeScore = null;
                    f.awayScore = null;
                    f.played = false;
                    f.cancelled = false;
                    f.report = null;
                    f.events = [];
                }
            }
        }
        
        // Re-apply the admin's edit (in case it got overwritten)
        const editedFixture = fixtures.find(f => f.id === pendingAssignFixtureId);
        if (editedFixture) {
            if (side === 'home') editedFixture.home = newTeam;
            else editedFixture.away = newTeam;
        }
        
        // Regenerate second half as mirror of new first half
        regenerateSecondHalf();
        
        saveToStorage();
        updateTableCalculations();
        renderTable();
        renderGameweekTabs();
        renderFixtures();
        generateTickerFacts();
        showToast(`✅ First half reshuffled! Second half mirrored automatically. All results reset.`);
        
    } else {
        // Just save without reshuffle
        fixture.homeScore = null;
        fixture.awayScore = null;
        fixture.played = false;
        fixture.comment = null;
        fixture.cancelled = false;
        
        // Still update second half to mirror (just in case)
        regenerateSecondHalf();
        
        saveToStorage();
        showToast(`Assigned ${newTeam} to ${side} side. Second half mirrored.`);
        renderFixtures();
        renderTable();
        generateTickerFacts();
    }
    
    closeTeamSelectModal();
    validateFixtureIntegrity();
}

function generateRandomRoundRobinFirstHalf(teamNames) {
    let n = teamNames.length;
    if (n % 2 !== 0) { teamNames.push("BYE"); n++; }
    let shuffled = [...teamNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const numRounds = n - 1;
    const halfSize = n / 2;
    let firstHalfRounds = [];
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
        firstHalfRounds.push(roundFixtures);
        const last = shuffled.pop();
        shuffled.splice(1, 0, last);
    }
    for (let i = firstHalfRounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [firstHalfRounds[i], firstHalfRounds[j]] = [firstHalfRounds[j], firstHalfRounds[i]];
    }
    return firstHalfRounds;
}

// Helper function to regenerate second half based on first half
function regenerateSecondHalf() {
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    
    for (let round = 1; round <= halfRounds; round++) {
        const firstHalfRound = round;
        const secondHalfRound = round + halfRounds;
        const firstHalfFixtures = fixtures.filter(f => f.round === firstHalfRound);
        const secondHalfFixtures = fixtures.filter(f => f.round === secondHalfRound);
        
        for (let i = 0; i < firstHalfFixtures.length && i < secondHalfFixtures.length; i++) {
            const first = firstHalfFixtures[i];
            const second = secondHalfFixtures[i];
            if (first && second) {
                second.home = first.away;
                second.away = first.home;
                second.homeScore = null;
                second.awayScore = null;
                second.played = false;
                second.cancelled = false;
                second.report = null;
                second.events = [];
            }
        }
    }
}

// ==================== STANDINGS & KNOCKOUT ====================
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
    else showToast("Semi‑finals incomplete or cancelled.");
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
    if (leg1.cancelled || leg2.cancelled) { showToast("Final legs cancelled."); return; }
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
function checkAndCelebrateChampion() {}

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
    if (typeof confetti === 'function') confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 }, startVelocity: 12 });
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
        const actionBtn = isAdmin ? `<td class="py-2 px-1 text-center">
    <button onclick="event.stopPropagation(); openPenaltyModal('${team.name}')" class="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full hover:bg-amber-100">⚖️</button>
    <button onclick="event.stopPropagation(); openReplaceTeamModal('${team.name}')" class="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full hover:bg-blue-100">🔄 Replace</button>
</td>` : "";
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
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    container.innerHTML = "";
    
    for (let r = 1; r <= totalRounds; r++) {
        const roundFixtures = fixtures.filter(f => f.round === r && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
        const allResolved = roundFixtures.length > 0 && roundFixtures.every(f => f.played || f.cancelled);
        const isReleased = releasedGameweeks[r] === true;
        
        let statusHtml = allResolved ? `<span class="text-[9px] font-mono text-green-600 ml-1">✅ Completed</span>` : 
                         (isReleased ? `<span class="text-[9px] font-mono text-emerald-500 ml-1">📢 Released</span>` : 
                          `<span class="text-[9px] font-mono text-gray-400 ml-1">🔒 Locked</span>`);
        
        let integrityBtnHtml = '';
        let releaseBtnHtml = '';
        
        if (isAdmin) {
            integrityBtnHtml = `<button onclick="event.stopPropagation(); checkRoundIntegrity(${r})" class="ml-1 text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full hover:bg-blue-200" title="Check round integrity">🔍</button>`;
            
            if (isReleased) {
                releaseBtnHtml = `<button onclick="event.stopPropagation(); lockGameweek(${r})" class="ml-1 text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full hover:bg-orange-200" title="Lock this gameweek">🔒 Lock</button>`;
            } else {
                releaseBtnHtml = `<button onclick="event.stopPropagation(); releaseNextRound()" class="ml-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full hover:bg-emerald-200" title="Release this gameweek">📢 Release</button>`;
            }
        }
        
        const active = (r === currentSelectedRound);
        const canView = isReleased || isAdmin;
        
        const btn = document.createElement('button');
        btn.className = `px-3 py-1 text-[11px] font-mono rounded-full transition shrink-0 flex items-center gap-1 ${active ? 'bg-indigo-600 text-white shadow' : (canView ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-50')}`;
        btn.innerHTML = `GW ${r} ${statusHtml} ${releaseBtnHtml} ${integrityBtnHtml}`;
        
        if (canView) {
            btn.onclick = () => { currentSelectedRound = r; renderGameweekTabs(); renderFixtures(); };
        } else {
            btn.onclick = () => showToast(`⚠️ Gameweek ${r} not released yet!`);
        }
        
        container.appendChild(btn);
    }
}

function checkRoundIntegrity(roundNumber) {
    const roundFixtures = fixtures.filter(f => f.round === roundNumber && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const isFirstHalf = roundNumber <= halfRounds;
    
    let issues = [];
    
    // Check 1: No team plays twice in this round
    const teamsInRound = [];
    for (const f of roundFixtures) {
        if (teamsInRound.includes(f.home)) issues.push(`❌ ${f.home} appears twice in Round ${roundNumber}!`);
        if (teamsInRound.includes(f.away)) issues.push(`❌ ${f.away} appears twice in Round ${roundNumber}!`);
        teamsInRound.push(f.home, f.away);
    }
    
    // Check 2: No duplicate matchups in the same half (only for first half rounds)
    if (isFirstHalf) {
        for (let round = 1; round <= halfRounds; round++) {
            const roundFixturesCheck = fixtures.filter(f => f.round === round);
            for (const f of roundFixturesCheck) {
                if (f.round !== roundNumber) {
                    const isDuplicate = roundFixtures.some(rf => 
                        (rf.home === f.home && rf.away === f.away) || 
                        (rf.home === f.away && rf.away === f.home)
                    );
                    if (isDuplicate) {
                        issues.push(`⚠️ Matchup ${f.home} vs ${f.away} appears in both Round ${roundNumber} and Round ${round}`);
                    }
                }
            }
        }
    }
    
    // Check 3: No team plays against itself
    for (const f of roundFixtures) {
        if (f.home === f.away && f.home !== "BYE") {
            issues.push(`❌ Invalid fixture: ${f.home} vs ${f.away} (team cannot play itself)`);
        }
    }
    
    // Check 4: For first half, check if second half mirrors correctly
    if (isFirstHalf) {
        const secondHalfRound = roundNumber + halfRounds;
        const secondHalfFixtures = fixtures.filter(f => f.round === secondHalfRound);
        
        for (let i = 0; i < roundFixtures.length && i < secondHalfFixtures.length; i++) {
            const first = roundFixtures[i];
            const second = secondHalfFixtures[i];
            if (second && (second.home !== first.away || second.away !== first.home)) {
                issues.push(`⚠️ Round ${secondHalfRound} does not mirror Round ${roundNumber}`);
            }
        }
    }
    
    // Display results in a modal
    let modalHtml = `
        <div id="integrity-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-y-auto">
                <div class="p-4 border-b border-gray-200 sticky top-0 bg-white flex justify-between items-center">
                    <h3 class="font-bold text-lg">🔍 Round ${roundNumber} Integrity Check</h3>
                    <button onclick="closeIntegrityModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-4">
    `;
    
    if (issues.length === 0) {
        modalHtml += `
            <div class="text-center py-8">
                <div class="text-5xl mb-3">✅</div>
                <p class="text-green-600 font-bold">No issues found!</p>
                <p class="text-sm text-gray-500 mt-2">Round ${roundNumber} is valid.</p>
            </div>
        `;
    } else {
        modalHtml += `
            <div class="text-center mb-4">
                <div class="text-5xl mb-3">⚠️</div>
                <p class="text-red-600 font-bold">Found ${issues.length} issue(s)</p>
            </div>
            <div class="space-y-2">
        `;
        for (const issue of issues) {
            modalHtml += `<div class="bg-red-50 border border-red-200 rounded-lg p-2 text-sm text-red-700">${issue}</div>`;
        }
        modalHtml += `</div>`;
    }
    
    modalHtml += `
                </div>
                <div class="p-3 bg-gray-50 text-right rounded-b-2xl">
                    <button onclick="closeIntegrityModal()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500">Close</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('integrity-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('integrity-modal').classList.remove('hidden');
    document.getElementById('integrity-modal').classList.add('flex');
}

function closeIntegrityModal() {
    const modal = document.getElementById('integrity-modal');
    if (modal) modal.remove();
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
    
    const isReleased = isGameweekReleased(currentSelectedRound);
    
    if (!isReleased && !isAdmin) {
        container.innerHTML = `
            <div class="bg-amber-50 border-2 border-amber-200 rounded-2xl p-8 text-center">
                <div class="text-5xl mb-3">🔒</div>
                <h3 class="font-bold text-amber-800 text-lg mb-2">Gameweek ${currentSelectedRound} Not Released Yet</h3>
                <p class="text-amber-700 text-sm">The admin hasn't released this matchweek. Check back later!</p>
                <div class="mt-4 w-16 h-1 bg-amber-300 rounded-full mx-auto"></div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = "";
    const roundFixtures = fixtures.filter(f => f.round === currentSelectedRound && !teams[f.home]?.relegated && !teams[f.away]?.relegated);
    
    if (roundFixtures.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-400 py-8">No fixtures this gameweek</div>';
        return;
    }
    
    roundFixtures.forEach(f => {
        const played = f.played;
        const cancelled = f.cancelled;
        if (cancelled) {
            container.innerHTML += `<div class="bg-gray-100 p-3 rounded-xl border border-red-200"><div class="flex justify-between items-center"><span class="line-through">${f.home}</span><span class="text-red-500 text-xs">CANCELLED</span><span class="line-through">${f.away}</span></div></div>`;
            return;
        }
        if (isAdmin) {
            let homeDisplay = f.home === "VACANT" ? `<span class="font-semibold text-sm text-red-500 cursor-pointer" onclick="editFixtureTeamName(${f.id}, 'home')">[VACANT]</span>` : `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'home')">${f.home}</span>`;
            let awayDisplay = f.away === "VACANT" ? `<span class="font-semibold text-sm text-red-500 cursor-pointer" onclick="editFixtureTeamName(${f.id}, 'away')">[VACANT]</span>` : `<span class="font-semibold cursor-pointer hover:text-indigo-600 transition text-sm" onclick="editFixtureTeamName(${f.id}, 'away')">${f.away}</span>`;
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full fixture-card" data-fixture-id="${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 flex items-center justify-center gap-2 text-center">${homeDisplay}</div><div class="flex items-center justify-center"><div class="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full"><input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"><span class="text-gray-400">:</span><input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-10 text-center bg-transparent font-mono font-bold text-indigo-600 text-sm"></div></div><div class="flex-1 flex items-center justify-center gap-2 text-center">${awayDisplay}</div></div><div class="mt-2 flex justify-center gap-1"><button onclick="swapFixture(${f.id})" class="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">🔄 Swap</button><button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full hover:bg-indigo-100">💾 Save</button> <button onclick="uploadScreenshot(${f.id})" class="text-[10px] font-bold bg-green-50 text-green-700 px-2 py-1 rounded-full hover:bg-green-100">📸 Upload Screenshot</button><button onclick="showMatchComment(${f.id})" class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full hover:bg-gray-200">📖</button><button onclick="openBanterModal(${f.id})" class="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded-full hover:bg-purple-100">🤣 Banter</button></div></div>`;
        } else {
            let homeName = f.home === "VACANT" ? "TBD" : f.home;
            let awayName = f.away === "VACANT" ? "TBD" : f.away;
            const predictionBtn = !played ? `<button onclick="openPredictionsModal(${f.id})" class="text-[11px] bg-gray-100 hover:bg-indigo-50 px-3 py-1 rounded-full">🔮 Predictions</button>` : `<div class="bg-gray-100 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>`;
            container.innerHTML += `<div class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 shadow-sm w-full fixture-card" data-fixture-id="${f.id}"><div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div class="flex-1 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${homeName}</div><div class="flex justify-center">${predictionBtn}</div><div class="flex-1 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 font-bold' : 'text-gray-600'}">${awayName}</div></div><div class="mt-2 flex justify-center gap-1"><button onclick="showMatchComment(${f.id})" class="text-[11px] bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full">📖</button><button onclick="openBanterModal(${f.id})" class="text-[11px] bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded-full">🤣 Banter</button></div></div>`;
        }
    });
}

// ==================== TEAM DETAILS ====================
function showTeamDetails(teamName) {
    const team = teams[teamName];
    if (!team) return;
    
    // Get all matches for this team
    const teamMatches = fixtures.filter(f => 
        (f.home === teamName || f.away === teamName) && 
        f.played && 
        !f.cancelled
    ).sort((a, b) => b.round - a.round); // Most recent first
    
    // Calculate advanced stats
    let cleanSheets = 0;
    let homeWins = 0, homeDraws = 0, homeLosses = 0;
    let homeGF = 0, homeGA = 0;
    let awayWins = 0, awayDraws = 0, awayLosses = 0;
    let awayGF = 0, awayGA = 0;
    let goalsScored = [];
    let goalsConceded = [];
    let biggestWin = { score: "", opponent: "" };
    let biggestLoss = { score: "", opponent: "" };
    let currentStreak = { type: "", length: 0 };
    
    // Process each match
    teamMatches.forEach(f => {
        const isHome = f.home === teamName;
        const scored = isHome ? f.homeScore : f.awayScore;
        const conceded = isHome ? f.awayScore : f.homeScore;
        const opponent = isHome ? f.away : f.home;
        const won = (isHome && f.homeScore > f.awayScore) || (!isHome && f.awayScore > f.homeScore);
        const lost = (isHome && f.homeScore < f.awayScore) || (!isHome && f.awayScore < f.homeScore);
        
        // Clean sheets
        if (conceded === 0) cleanSheets++;
        
        // Goals tracking
        goalsScored.push(scored);
        goalsConceded.push(conceded);
        
        // Biggest win/loss
        const margin = scored - conceded;
        if (margin > 0 && margin > (parseInt(biggestWin.score.split('-')[0]) || 0)) {
            biggestWin = { score: `${scored}-${conceded}`, opponent };
        }
        if (margin < 0 && Math.abs(margin) > (parseInt(biggestLoss.score.split('-')[1]) || 0)) {
            biggestLoss = { score: `${scored}-${conceded}`, opponent };
        }
        
        // Home/Away breakdown
        if (isHome) {
            if (won) homeWins++;
            else if (lost) homeLosses++;
            else homeDraws++;
            homeGF += scored;
            homeGA += conceded;
        } else {
            if (won) awayWins++;
            else if (lost) awayLosses++;
            else awayDraws++;
            awayGF += scored;
            awayGA += conceded;
        }
    });
    
    // Calculate current streak
    if (teamMatches.length > 0) {
        let streak = 0;
        let streakType = null;
        for (let i = 0; i < teamMatches.length; i++) {
            const f = teamMatches[i];
            const isHome = f.home === teamName;
            const won = (isHome && f.homeScore > f.awayScore) || (!isHome && f.awayScore > f.homeScore);
            const lost = (isHome && f.homeScore < f.awayScore) || (!isHome && f.awayScore < f.homeScore);
            
            if (i === 0) {
                streakType = won ? 'W' : (lost ? 'L' : 'D');
                streak = 1;
            } else {
                const prevWon = (teamMatches[i-1].home === teamName && teamMatches[i-1].homeScore > teamMatches[i-1].awayScore) ||
                               (teamMatches[i-1].away === teamName && teamMatches[i-1].awayScore > teamMatches[i-1].homeScore);
                const prevLost = (teamMatches[i-1].home === teamName && teamMatches[i-1].homeScore < teamMatches[i-1].awayScore) ||
                                (teamMatches[i-1].away === teamName && teamMatches[i-1].awayScore < teamMatches[i-1].homeScore);
                const prevType = prevWon ? 'W' : (prevLost ? 'L' : 'D');
                
                if ((won && prevType === 'W') || (lost && prevType === 'L') || (!won && !lost && prevType === 'D')) {
                    streak++;
                } else {
                    break;
                }
            }
        }
        currentStreak = { type: streakType, length: streak };
    }
    
    const streakColor = currentStreak.type === 'W' ? 'text-emerald-600' : (currentStreak.type === 'L' ? 'text-rose-600' : 'text-amber-600');
    const streakIcon = currentStreak.type === 'W' ? '🔥' : (currentStreak.type === 'L' ? '📉' : '🤝');
    
    // Calculate PPG and form ranking
    const ppg = (team.pts / (team.mp || 1)).toFixed(2);
    const avgGF = (team.gf / (team.mp || 1)).toFixed(2);
    const avgGA = (team.ga / (team.mp || 1)).toFixed(2);
    
    // Build match history HTML
    let matchHistoryHtml = '';
    if (teamMatches.length > 0) {
        matchHistoryHtml = teamMatches.slice(0, 8).map(f => {
            const isHome = f.home === teamName;
            const scored = isHome ? f.homeScore : f.awayScore;
            const conceded = isHome ? f.awayScore : f.homeScore;
            const opponent = isHome ? f.away : f.home;
            const won = scored > conceded;
            const lost = scored < conceded;
            const resultClass = won ? 'bg-emerald-100 text-emerald-700' : (lost ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700');
            const resultIcon = won ? 'W' : (lost ? 'L' : 'D');
            const locationIcon = isHome ? '🏠' : '✈️';
            
            return `
                <div class="flex items-center justify-between p-2 border-b border-gray-100 hover:bg-gray-50 rounded-lg transition">
                    <div class="flex items-center gap-2 w-24">
                        <span class="text-xs font-mono text-gray-500">GW ${f.round}</span>
                        <span class="text-xs">${locationIcon}</span>
                    </div>
                    <div class="flex-1 text-left">
                        <span class="text-sm font-medium">${opponent}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-full text-xs font-bold ${resultClass}">${resultIcon}</span>
                        <span class="font-mono font-bold text-sm">${scored} - ${conceded}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        matchHistoryHtml = '<p class="text-gray-400 text-sm text-center py-4">No matches played yet</p>';
    }
    
    // Build the modal HTML
    const modalHtml = `
        <div id="team-modal" class="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) closeTeamModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <!-- Header with team name and gradient -->
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white sticky top-0">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-2xl font-bold">${escapeHtml(team.name)}</h2>
                            <p class="text-white/80 text-sm mt-1">${team.mp} matches • ${team.pts} points</p>
                        </div>
                        <button onclick="closeTeamModal()" class="text-white/80 hover:text-white text-2xl leading-5">&times;</button>
                    </div>
                </div>
                
                <div class="p-5 space-y-5">
                    <!-- Quick Stats Grid -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div class="bg-gray-50 rounded-xl p-3 text-center">
                            <p class="text-2xl font-bold text-indigo-600">${team.pts}</p>
                            <p class="text-[10px] text-gray-500">POINTS</p>
                        </div>
                        <div class="bg-gray-50 rounded-xl p-3 text-center">
                            <p class="text-2xl font-bold text-emerald-600">${ppg}</p>
                            <p class="text-[10px] text-gray-500">PPG</p>
                        </div>
                        <div class="bg-gray-50 rounded-xl p-3 text-center">
                            <p class="text-2xl font-bold text-amber-600">${team.gf}</p>
                            <p class="text-[10px] text-gray-500">GOALS</p>
                        </div>
                        <div class="bg-gray-50 rounded-xl p-3 text-center">
                            <p class="text-2xl font-bold text-rose-500">${team.ga}</p>
                            <p class="text-[10px] text-gray-500">CONCEDED</p>
                        </div>
                    </div>
                    
                    <!-- Form & Streak -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div class="bg-gray-50 rounded-xl p-3">
                            <p class="text-xs font-semibold text-gray-500 mb-2">📈 RECENT FORM</p>
                            <div class="flex gap-2 justify-start">
                                ${team.formHistory.slice(-5).map(r => {
                                    if (r === 'W') return '<span class="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center justify-center">W</span>';
                                    if (r === 'L') return '<span class="w-8 h-8 bg-rose-100 text-rose-600 rounded-full text-xs font-bold flex items-center justify-center">L</span>';
                                    if (r === 'D') return '<span class="w-8 h-8 bg-amber-100 text-amber-700 rounded-full text-xs font-bold flex items-center justify-center">D</span>';
                                    return '<span class="w-8 h-8 bg-gray-200 text-gray-400 rounded-full text-xs flex items-center justify-center">-</span>';
                                }).join('')}
                            </div>
                        </div>
                        <div class="bg-gray-50 rounded-xl p-3">
                            <p class="text-xs font-semibold text-gray-500 mb-2">⚡ CURRENT STREAK</p>
                            <p class="text-lg font-bold ${streakColor}">${streakIcon} ${currentStreak.length > 0 ? currentStreak.length : 0} ${currentStreak.type === 'W' ? 'Wins' : (currentStreak.type === 'L' ? 'Losses' : 'Draws')}</p>
                        </div>
                    </div>
                    
                    <!-- Home/Away Split -->
                    <div>
                        <p class="text-xs font-semibold text-gray-500 mb-2">🏠 HOME vs ✈️ AWAY</p>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-emerald-50 rounded-xl p-3 text-center">
                                <p class="text-sm font-bold text-emerald-700">🏠 HOME</p>
                                <p class="text-xl font-bold">${homeWins}-${homeDraws}-${homeLosses}</p>
                                <p class="text-xs text-gray-500">GF: ${homeGF} | GA: ${homeGA}</p>
                            </div>
                            <div class="bg-blue-50 rounded-xl p-3 text-center">
                                <p class="text-sm font-bold text-blue-700">✈️ AWAY</p>
                                <p class="text-xl font-bold">${awayWins}-${awayDraws}-${awayLosses}</p>
                                <p class="text-xs text-gray-500">GF: ${awayGF} | GA: ${awayGA}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Records -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-emerald-50 rounded-xl p-2 text-center">
                            <p class="text-[10px] text-gray-500">🏆 BIGGEST WIN</p>
                            <p class="text-sm font-bold text-emerald-700">${biggestWin.score || '-'}</p>
                            <p class="text-xs text-gray-600">vs ${biggestWin.opponent || '-'}</p>
                        </div>
                        <div class="bg-rose-50 rounded-xl p-2 text-center">
                            <p class="text-[10px] text-gray-500">📉 BIGGEST LOSS</p>
                            <p class="text-sm font-bold text-rose-700">${biggestLoss.score || '-'}</p>
                            <p class="text-xs text-gray-600">vs ${biggestLoss.opponent || '-'}</p>
                        </div>
                    </div>
                    
                    <!-- Match History -->
                    <div>
                        <p class="text-xs font-semibold text-gray-500 mb-2">📋 RECENT MATCHES</p>
                        <div class="max-h-64 overflow-y-auto space-y-1">
                            ${matchHistoryHtml}
                        </div>
                    </div>
                    
                    <!-- Penalty Info -->
                    ${team.deductedPoints > 0 ? `
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                        <p class="text-xs text-amber-700">⚠️ POINTS DEDUCTION: -${team.deductedPoints} points</p>
                    </div>
                    ` : ''}
                </div>
                
                <div class="p-4 bg-gray-50 flex gap-3 justify-end rounded-b-2xl">
                    <button onclick="closeTeamModal()" class="px-5 py-2 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition">Close</button>
                    ${isAdmin ? `<button onclick="closeTeamModal(); openPenaltyModal('${team.name}')" class="px-5 py-2 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition">⚖️ Edit Penalty</button>` : ''}
                    ${isAdmin ? `<button onclick="closeTeamModal(); openReplaceTeamModal('${team.name}')" class="px-5 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">🔄 Replace Team</button>` : ''}
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if any
    const existingModal = document.getElementById('team-modal');
    if (existingModal) existingModal.remove();
    
    // Add new modal
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('team-modal').classList.remove('hidden');
    document.getElementById('team-modal').classList.add('flex');
}
function closeTeamModal() { document.getElementById('team-modal').classList.add('hidden'); }

// ==================== RICH REPORT ====================
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

function showFirstHalfReviewModal() {
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    
    // Get first half fixtures only
    const firstHalfFixtures = fixtures.filter(f => f.round <= halfRounds && f.played && !f.cancelled);
    
    // Calculate standings at halfway
    const halfStandings = {};
    for (let t in teams) {
        if (!teams[t].relegated) {
            halfStandings[t] = {
                name: t,
                mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0,
                homeW: 0, homeD: 0, homeL: 0, homeGF: 0, homeGA: 0,
                awayW: 0, awayD: 0, awayL: 0, awayGF: 0, awayGA: 0
            };
        }
    }
    
    let biggestWin = { home: null, away: null, margin: 0, score: "" };
    let totalGoals = 0;
    let totalMatches = 0;
    
    firstHalfFixtures.forEach(f => {
        const h = f.home, a = f.away, hS = f.homeScore, aS = f.awayScore;
        if (halfStandings[h] && halfStandings[a]) {
            halfStandings[h].mp++;
            halfStandings[a].mp++;
            halfStandings[h].gf += hS;
            halfStandings[h].ga += aS;
            halfStandings[a].gf += aS;
            halfStandings[a].ga += hS;
            totalGoals += hS + aS;
            totalMatches++;
            
            halfStandings[h].homeGF += hS;
            halfStandings[h].homeGA += aS;
            halfStandings[a].awayGF += aS;
            halfStandings[a].awayGA += hS;
            
            if (hS > aS) {
                halfStandings[h].w++;
                halfStandings[h].pts += 3;
                halfStandings[a].l++;
                halfStandings[h].homeW++;
                halfStandings[a].awayL++;
            } else if (aS > hS) {
                halfStandings[a].w++;
                halfStandings[a].pts += 3;
                halfStandings[h].l++;
                halfStandings[a].awayW++;
                halfStandings[h].homeL++;
            } else {
                halfStandings[h].d++;
                halfStandings[a].d++;
                halfStandings[h].pts += 1;
                halfStandings[a].pts += 1;
                halfStandings[h].homeD++;
                halfStandings[a].awayD++;
            }
            
            const margin = Math.abs(hS - aS);
            if (margin > biggestWin.margin) {
                biggestWin = { home: h, away: a, margin: margin, score: `${hS}-${aS}` };
            }
        }
    });
    
    // Sort standings
    const sorted = Object.values(halfStandings).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));
    
    // Prepare team reviews array
    const teamReviews = sorted.map((team, idx) => {
        const ppg = (team.pts / team.mp).toFixed(1);
        let review = "";
        let emoji = "";
        
        if (team.pts >= team.mp * 2.3) {
            emoji = "🏆🔥";
            review = "Absolute dominance! Title favorites!";
        } else if (team.pts >= team.mp * 1.8) {
            emoji = "👍⭐";
            review = "Strong first half. Top 4 contenders.";
        } else if (team.pts >= team.mp * 1.2) {
            emoji = "⚖️📊";
            review = "Mid-table consistency. Solid but need improvement.";
        } else {
            emoji = "⚠️⬇️";
            review = "Struggling. Relegation battle ahead.";
        }
        
        const homeForm = `${team.homeW}-${team.homeD}-${team.homeL}`;
        const awayForm = `${team.awayW}-${team.awayD}-${team.awayL}`;
        const position = idx + 1;
        
        return { ...team, ppg, review, emoji, homeForm, awayForm, position };
    });
    
    const topScorer = teamReviews[0];
    const topDefense = teamReviews.reduce((a, b) => a.ga < b.ga ? a : b);
    const avgGoals = (totalGoals / totalMatches).toFixed(2);
    const totalPoints = teamReviews.reduce((sum, t) => sum + t.pts, 0);
    
    let currentReviewIndex = 0;
    
    // Function to update the review display
    function updateReviewDisplay() {
        const team = teamReviews[currentReviewIndex];
        const reviewContainer = document.getElementById('team-review-dynamic');
        if (!reviewContainer) return;
        
        const gd = team.gf - team.ga;
        const positionIcon = team.position === 1 ? '🥇' : team.position === 2 ? '🥈' : team.position === 3 ? '🥉' : `#${team.position}`;
        
        reviewContainer.innerHTML = `
            <div class="bg-gradient-to-br from-white to-gray-50 rounded-xl p-5 border-2 ${team.position <= 3 ? 'border-indigo-300' : 'border-gray-200'}">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <span class="text-2xl font-bold text-indigo-700">${team.name}</span>
                        <span class="ml-2 text-lg">${team.emoji}</span>
                    </div>
                    <span class="text-xs font-mono bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">${team.pts} pts</span>
                </div>
                <div class="flex items-center gap-2 mb-3">
                    <span class="text-xs bg-gray-200 px-2 py-0.5 rounded-full">${positionIcon}</span>
                    <span class="text-xs text-gray-500">PPG: ${team.ppg}</span>
                    <span class="text-xs text-gray-500">GD: ${gd > 0 ? '+' + gd : gd}</span>
                </div>
                <p class="text-sm text-gray-700 mb-4 bg-indigo-50 p-3 rounded-lg">📝 ${team.review}</p>
                <div class="grid grid-cols-2 gap-3 text-sm">
                    <div class="bg-emerald-50 p-2 rounded-lg text-center">
                        <p class="text-[10px] text-gray-500">🏠 HOME</p>
                        <p class="font-bold">${team.homeForm}</p>
                        <p class="text-xs">${team.homeGF} / ${team.homeGA}</p>
                    </div>
                    <div class="bg-amber-50 p-2 rounded-lg text-center">
                        <p class="text-[10px] text-gray-500">✈️ AWAY</p>
                        <p class="font-bold">${team.awayForm}</p>
                        <p class="text-xs">${team.awayGF} / ${team.awayGA}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3 mt-3 text-center">
                    <div>
                        <p class="text-[10px] text-gray-500">⚽ GOALS FOR</p>
                        <p class="font-bold text-emerald-600">${team.gf}</p>
                    </div>
                    <div>
                        <p class="text-[10px] text-gray-500">🥅 GOALS AGAINST</p>
                        <p class="font-bold text-rose-500">${team.ga}</p>
                    </div>
                </div>
                <div class="mt-3 pt-2 border-t border-gray-200">
                    <div class="flex justify-between text-xs">
                        <span>✅ Wins: ${team.w}</span>
                        <span>🤝 Draws: ${team.d}</span>
                        <span>❌ Losses: ${team.l}</span>
                    </div>
                </div>
                <button onclick="closeFirstHalfReviewModal(); showTeamDetails('${team.name}')" class="w-full mt-3 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded-lg transition">📊 View Full Stats</button>
            </div>
        `;
        
        // Update navigation buttons
        const prevBtn = document.getElementById('review-prev-btn');
        const nextBtn = document.getElementById('review-next-btn');
        const counter = document.getElementById('review-counter');
        
        if (prevBtn) prevBtn.disabled = currentReviewIndex === 0;
        if (nextBtn) nextBtn.disabled = currentReviewIndex === teamReviews.length - 1;
        if (counter) counter.innerText = `${currentReviewIndex + 1} / ${teamReviews.length}`;
    }
    
    // Build modal HTML
    let modalHtml = `
        <div id="first-half-review-modal" class="fixed inset-0 z-50 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
                <div class="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10">
                    <div class="flex justify-between items-center">
                        <div>
                            <h2 class="text-xl font-bold">🏆 FIRST HALF COMPLETED!</h2>

                            <p class="text-xs text-white/80">Rounds 1 - ${halfRounds} | ${CURRENT_LEAGUE === 'premier' ? 'Premier League' : CURRENT_LEAGUE === 'championship' ? 'Championship' : 'Ligue 1'}</p>

                        </div>
                        <button onclick="closeFirstHalfReviewModal()" class="text-white/80 hover:text-white text-2xl leading-5">&times;</button>
                    </div>
                </div>
                
                <div class="p-4 space-y-5">
                    <!-- Stats Cards -->
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <div class="bg-gradient-to-br from-indigo-50 to-white p-2 rounded-xl text-center border border-indigo-100">
                            <p class="text-xl font-bold text-indigo-600">${totalMatches}</p>
                            <p class="text-[9px] text-gray-500">Matches</p>
                        </div>
                        <div class="bg-gradient-to-br from-emerald-50 to-white p-2 rounded-xl text-center border border-emerald-100">
                            <p class="text-xl font-bold text-emerald-600">${totalGoals}</p>
                            <p class="text-[9px] text-gray-500">Goals</p>
                        </div>
                        <div class="bg-gradient-to-br from-amber-50 to-white p-2 rounded-xl text-center border border-amber-100">
                            <p class="text-xl font-bold text-amber-600">${avgGoals}</p>
                            <p class="text-[9px] text-gray-500">Avg Goals</p>
                        </div>
                        <div class="bg-gradient-to-br from-rose-50 to-white p-2 rounded-xl text-center border border-rose-100">
                            <p class="text-xl font-bold text-rose-600">${biggestWin.margin}</p>
                            <p class="text-[9px] text-gray-500">Biggest Win</p>
                        </div>
                        <div class="bg-gradient-to-br from-purple-50 to-white p-2 rounded-xl text-center border border-purple-100">
                            <p class="text-xl font-bold text-purple-600">${totalPoints}</p>
                            <p class="text-[9px] text-gray-500">Points</p>
                        </div>
                    </div>
                    
                    <!-- Half Standings Table (compact) -->
                    <div>
                        <h3 class="font-bold text-gray-700 text-sm mb-2">📊 HALFWAY STANDINGS</h3>
                        <div class="overflow-x-auto">
                            <table class="w-full text-[10px]">
                                <thead class="bg-gray-100">
                                    <tr><th class="py-1 px-1">Pos</th><th class="py-1 px-1 text-left">Team</th><th class="py-1 px-1">PTS</th><th class="py-1 px-1">W</th><th class="py-1 px-1">D</th><th class="py-1 px-1">L</th><th class="py-1 px-1">GF</th><th class="py-1 px-1">GA</th><th class="py-1 px-1">GD</th></tr>
                                </thead>
                                <tbody>
    `;
    
    teamReviews.forEach((team, idx) => {
        const gd = team.gf - team.ga;
        modalHtml += `
            <tr class="border-b border-gray-100 cursor-pointer hover:bg-gray-50" onclick="closeFirstHalfReviewModal(); showTeamDetails('${team.name}')">
                <td class="py-1 px-1 text-center font-bold ${idx === 0 ? 'text-indigo-600' : ''}">${idx + 1}${idx < 3 ? '🎯' : idx > teamReviews.length - 3 ? '⚠️' : ''}</td>
                <td class="py-1 px-1 font-medium truncate max-w-[100px]">${team.name}</td>
                <td class="py-1 px-1 text-center font-bold text-indigo-600">${team.pts}</td>
                <td class="py-1 px-1 text-center text-emerald-600">${team.w}</td>
                <td class="py-1 px-1 text-center">${team.d}</td>
                <td class="py-1 px-1 text-center text-rose-500">${team.l}</td>
                <td class="py-1 px-1 text-center">${team.gf}</td>
                <td class="py-1 px-1 text-center">${team.ga}</td>
                <td class="py-1 px-1 text-center ${gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${gd > 0 ? '+' + gd : gd}</td>
            </tr>
        `;
    });
    
    modalHtml += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <!-- Team Review Carousel -->
                    <div>
                        <div class="flex justify-between items-center mb-3">
                            <h3 class="font-bold text-gray-700 text-sm">📝 TEAM REVIEW</h3>
                            <div class="flex items-center gap-2">
                                <button id="review-prev-btn" onclick="navigateReview(-1)" class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 rounded-full w-7 h-7 flex items-center justify-center transition">◀</button>
                                <span id="review-counter" class="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded-full">1 / ${teamReviews.length}</span>
                                <button id="review-next-btn" onclick="navigateReview(1)" class="bg-gray-200 hover:bg-gray-300 disabled:opacity-50 rounded-full w-7 h-7 flex items-center justify-center transition">▶</button>
                            </div>
                        </div>
                        <div id="team-review-dynamic">
                            <!-- Dynamic content will be inserted here -->
                        </div>
                    </div>
                    
                    <!-- Highlights -->
                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-gradient-to-r from-yellow-50 to-amber-50 p-2 rounded-xl border border-amber-200 text-center">
                            <p class="text-[10px] font-bold text-amber-700">🏆 TOP TEAM</p>
                            <p class="font-bold text-sm truncate">${topScorer?.name}</p>
                            <p class="text-[10px]">${topScorer?.pts} pts</p>
                        </div>
                        <div class="bg-gradient-to-r from-emerald-50 to-green-50 p-2 rounded-xl border border-emerald-200 text-center">
                            <p class="text-[10px] font-bold text-emerald-700">🛡️ BEST DEFENSE</p>
                            <p class="font-bold text-sm truncate">${topDefense?.name}</p>
                            <p class="text-[10px]">${topDefense?.ga} goals</p>
                        </div>
                    </div>
                    
                    <div class="bg-amber-50 p-3 rounded-xl border border-amber-200 text-center">
                        <p class="text-xs font-semibold text-amber-800">🎯 BIGGEST WIN</p>
                        <p class="text-sm font-bold text-amber-900 truncate">${biggestWin.home} ${biggestWin.score} ${biggestWin.away}</p>
                    </div>
                    
                    <div class="text-center text-[10px] text-gray-400 pt-2 border-t">
                        The second half will now begin !
                    </div>
                </div>
                <div class="p-3 bg-gray-50 text-right rounded-b-2xl">
                    <button onclick="closeFirstHalfReviewModal()" class="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-500 transition">Continue to Second Half</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('first-half-review-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('first-half-review-modal').classList.remove('hidden');
    document.getElementById('first-half-review-modal').classList.add('flex');
    
    // Initialize the first review display
    updateReviewDisplay();
    
    // Store currentIndex globally for navigation
    window.currentReviewIndex = 0;
    window.teamReviewsData = teamReviews;
    window.updateReviewDisplayGlobal = updateReviewDisplay;
}

function navigateReview(direction) {
    if (!window.teamReviewsData) return;
    const newIndex = (window.currentReviewIndex || 0) + direction;
    if (newIndex >= 0 && newIndex < window.teamReviewsData.length) {
        window.currentReviewIndex = newIndex;
        if (window.updateReviewDisplayGlobal) {
            window.updateReviewDisplayGlobal();
        }
    }
}

function checkAndShowFirstHalfReview() {
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    const halfRounds = totalRounds / 2;
    const firstHalfFixtures = fixtures.filter(f => f.round <= halfRounds);
    const allFirstHalfPlayed = firstHalfFixtures.length > 0 && 
        firstHalfFixtures.every(f => f.played || f.cancelled);
    
    if (allFirstHalfPlayed && !localStorage.getItem('firstHalfReviewShown')) {
        localStorage.setItem('firstHalfReviewShown', 'true');
        showFirstHalfReviewModal();
    }
}

// ==================== SAVE RESULT & GOAL EDITOR ====================
function saveResult(fixtureId) {
    const fixture = fixtures.find(f => f.id === fixtureId);
    
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") { alert("Enter both scores"); return; }
    if (fixture.home === 'BYE' || fixture.away === 'BYE') { alert("Cannot save match with BYE team."); return; }
    
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    
    // If fixture already has a result, ask for confirmation before editing
    if (fixture.played) {
        if (confirm(`✏️ EDIT EXISTING RESULT?\n\nCurrent: ${fixture.home} ${fixture.homeScore}-${fixture.awayScore} ${fixture.away}\nNew: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}\n\nAll standings will be updated. Continue?`)) {
            if (fixture.events && fixture.events.length > 0) {
                openGoalEditorForEdit(fixture.events);
            } else {
                openGoalEditor();
            }
        }
    } else {
        openGoalEditor();
    }
}

function openGoalEditor() {
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    const totalGoals = pendingHomeScore + pendingAwayScore;
    let modalHtml = `<div id="goal-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"><div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"><div class="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white"><h3 class="font-bold text-lg">⚽ Enter Goal Details</h3><button onclick="closeGoalEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><div class="p-5 space-y-4"><p class="text-sm text-gray-600">Match: ${fixture.home} vs ${fixture.away}</p><p class="text-sm font-semibold">Score: ${pendingHomeScore} - ${pendingAwayScore}</p><div id="goals-list-container" class="space-y-3">`;
    for (let i = 0; i < totalGoals; i++) {
        modalHtml += `<div class="goal-entry border rounded-xl p-3 bg-gray-50" data-goal-index="${i}"><div class="font-medium mb-2">Goal #${i+1}</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><select class="goal-team border rounded-lg px-3 py-2 text-sm bg-white"><option value="${fixture.home}">${fixture.home}</option><option value="${fixture.away}">${fixture.away}</option></select><input type="text" class="goal-scorer border rounded-lg px-3 py-2 text-sm" placeholder="Scorer name"><input type="text" class="goal-assist border rounded-lg px-3 py-2 text-sm" placeholder="Assist (optional)"><input type="number" class="goal-minute border rounded-lg px-3 py-2 text-sm" placeholder="Minute" min="1" max="120"><select class="goal-type border rounded-lg px-3 py-2 text-sm bg-white"><option value="Open play">⚽ Open play</option><option value="Penalty">🎯 Penalty</option><option value="Free kick">🦵 Free kick</option><option value="Header">👑 Header</option><option value="Own goal">😵 Own goal</option></select></div></div>`;
    }
    modalHtml += `</div><div class="flex justify-end gap-3 pt-4"><button onclick="closeGoalEditor()" class="px-4 py-2 border rounded-lg">Cancel</button><button onclick="saveGoalsAndFinish()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save Match & Report</button></div></div></div></div>`;
    const existingModal = document.getElementById('goal-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
function closeGoalEditor() { const modal = document.getElementById('goal-editor-modal'); if (modal) modal.remove(); pendingFixtureId = null; }
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
        if (isNaN(minute) || minute < 1 || minute > 120) { alert(`Please enter a valid minute (1-120)`); return; }
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
    if (typeof confetti === 'function') confetti({ particleCount: 60, spread: 45, origin: { y: 0.7 } });
    
    // Check if first half is now completed
    checkAndShowFirstHalfReview();
    
    // Auto-validate integrity
    validateFixtureIntegrity();
}

// ==================== EDIT EXISTING MATCH EVENTS ====================
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
    let modalHtml = `<div id="goal-editor-modal" class="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"><div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"><div class="p-5 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white"><h3 class="font-bold text-lg">✏️ Edit Goal Details</h3><button onclick="closeGoalEditor()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button></div><div class="p-5 space-y-4"><p class="text-sm text-gray-600">Match: ${fixture.home} vs ${fixture.away}</p><p class="text-sm font-semibold">Score: ${pendingHomeScore} - ${pendingAwayScore}</p><div id="goals-list-container" class="space-y-3">`;
    for (let i = 0; i < totalGoals; i++) {
        const ev = existingEvents[i] || {};
        modalHtml += `<div class="goal-entry border rounded-xl p-3 bg-gray-50" data-goal-index="${i}"><div class="font-medium mb-2">Goal #${i+1}</div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><select class="goal-team border rounded-lg px-3 py-2 text-sm bg-white"><option value="${fixture.home}" ${ev.team === fixture.home ? 'selected' : ''}>${fixture.home}</option><option value="${fixture.away}" ${ev.team === fixture.away ? 'selected' : ''}>${fixture.away}</option></select><input type="text" class="goal-scorer border rounded-lg px-3 py-2 text-sm" placeholder="Scorer name" value="${escapeHtml(ev.player || '')}"><input type="text" class="goal-assist border rounded-lg px-3 py-2 text-sm" placeholder="Assist (optional)" value="${escapeHtml(ev.assist || '')}"><input type="number" class="goal-minute border rounded-lg px-3 py-2 text-sm" placeholder="Minute" value="${ev.minute || ''}"><select class="goal-type border rounded-lg px-3 py-2 text-sm bg-white"><option value="Open play" ${ev.goalType === 'Open play' ? 'selected' : ''}>⚽ Open play</option><option value="Penalty" ${ev.goalType === 'Penalty' ? 'selected' : ''}>🎯 Penalty</option><option value="Free kick" ${ev.goalType === 'Free kick' ? 'selected' : ''}>🦵 Free kick</option><option value="Header" ${ev.goalType === 'Header' ? 'selected' : ''}>👑 Header</option><option value="Own goal" ${ev.goalType === 'Own goal' ? 'selected' : ''}>😵 Own goal</option></select></div></div>`;
    }
    modalHtml += `</div><div class="flex justify-end gap-3 pt-4"><button onclick="closeGoalEditor()" class="px-4 py-2 border rounded-lg">Cancel</button><button onclick="saveGoalsAndFinish()" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">Save Changes</button></div></div></div></div>`;
    const existingModal = document.getElementById('goal-editor-modal');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}
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
            eventsDiv.innerHTML = f.events.map(ev => `<div class="flex justify-between border-b border-gray-200 py-1"><span class="font-mono w-12">${ev.minute}′</span><span class="flex-1">⚽ ${ev.team} - ${ev.player}${ev.goalType && ev.goalType !== 'Open play' ? ` [${ev.goalType}]` : ''}${ev.assist ? ` (assist: ${ev.assist})` : ''}</span></div>`).join('');
        } else { eventsContainer.classList.add('hidden'); }
    }
    const editBtn = document.getElementById('viewer-edit-btn');
    const editEventsBtn = document.getElementById('viewer-edit-events-btn');
    if (editBtn && editEventsBtn) {
        if (isAdmin && f.played) { editBtn.classList.remove('hidden'); editEventsBtn.classList.remove('hidden'); }
        else { editBtn.classList.add('hidden'); editEventsBtn.classList.add('hidden'); }
    }
}
function closeCommentViewer() {
    const modal = document.getElementById('comment-viewer-modal');
    if (modal) { modal.style.display = 'none'; modal.classList.add('hidden'); modal.classList.remove('flex'); }
    currentViewerFixtureId = null;
}

// ==================== RELEGATION ====================
function relegateTeam(teamName) {
    if (!isAdmin) return;
    if (tournamentPhase !== 'league') { showToast("Cannot relegate during knockout stage."); return; }
    const team = teams[teamName];
    if (!team) return;
    if (team.relegated) { showToast(`${teamName} is already relegated.`); return; }
    if (confirm(`Relegate ${teamName}? They will be removed from all future fixtures.`)) {
        team.relegated = true;
        fixtures.forEach(f => {
            if (!f.played && !f.cancelled) {
                if (f.home === teamName) { f.home = "VACANT"; f.vacantHome = true; }
                if (f.away === teamName) { f.away = "VACANT"; f.vacantAway = true; }
            }
        });
        saveToStorage();
        showToast(`${teamName} relegated.`);
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
    if (confirm(`Restore ${teamName} to the league?`)) {
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

// ==================== EDIT REPORT ONLY ====================
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
    document.getElementById('comment-modal').classList.add('flex');
    closeCommentViewer();
}
function confirmComment() {
    if (pendingFixtureId === null) return;
    const finalReport = document.getElementById('comment-text').value.trim();
    if (finalReport === "") { alert("Report cannot be empty"); return; }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    if (!fixture) return;
    fixture.report = finalReport;
    saveToStorage();
    showToast(`Report updated for ${fixture.home} vs ${fixture.away}`);
    closeCommentModal(true);
    pendingFixtureId = null;
    renderTable();
    renderFixtures();
    generateTickerFacts();
}
function closeCommentModal(save = false) {
    const modal = document.getElementById('comment-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    if (!save) pendingFixtureId = null;
}

// ==================== BANTER ====================
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
    if (text === "") { alert("Write something funny!"); return; }
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
function escapeHtml(str) { return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m] || m)); }

// ==================== RESET ====================
function resetTournament() { 
    if (confirm("Wipe ALL data for Ligue 1? Cannot be undone.")) 
        getTournamentRef().remove().then(() => location.reload()); 
}

// ==================== INIT ====================
window.onload = () => {
    initRealtimeDatabaseSync();
    const savedRole = sessionStorage.getItem('tournamentRole');
    if (savedRole === 'viewer' || savedRole === 'admin') {
        selectRole(savedRole);
    }
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
window.openReplaceTeamModal = openReplaceTeamModal;
window.closeReplaceTeamModal = closeReplaceTeamModal;
window.confirmReplaceTeam = confirmReplaceTeam;
window.generateTeamInputs = generateTeamInputs;
window.initializeTournament = initializeTournament;
window.validateFixtureIntegrity = validateFixtureIntegrity;
window.swapFixture = swapFixture;
window.editFixtureTeamName = editFixtureTeamName;
window.closeTeamSelectModal = closeTeamSelectModal;
window.confirmTeamSelection = confirmTeamSelection;
window.saveResult = saveResult;
window.confirmComment = confirmComment;
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
window.openChatModal = openChatModal;
window.closeChatModal = closeChatModal;
window.sendChatMessage = sendChatMessage;
window.deleteChatMessage = deleteChatMessage;
window.onChatInput = onChatInput;
window.openPollModal = openPollModal;
window.closePollModal = closePollModal;
window.addPollOption = addPollOption;
window.removePollOption = removePollOption;
window.createPoll = createPoll;
window.deletePoll = deletePoll;
window.votePoll = votePoll;
window.sendTypingStatus = sendTypingStatus;
window.openDirectFixtureEditor = openDirectFixtureEditor;
window.closeDirectEditor = closeDirectEditor;
window.loadRoundForDirectEdit = loadRoundForDirectEdit;
window.validateCurrentRound = validateCurrentRound;
window.saveDirectEdits = saveDirectEdits;
window.toggleGameweekRelease = toggleGameweekRelease;
window.releaseNextRound = releaseNextRound;
window.lockGameweek = lockGameweek;
window.isGameweekReleased = isGameweekReleased;
window.uploadScreenshot = uploadScreenshot;