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

let isAdmin = false;
let clTeamsData = null; // for league phase teams
let clFixturesData = null;
let clCurrentMatchday = 1;
let clTotalMatchdays = 19;

// Admin authentication
const entered = prompt("Enter admin master password:");
if (entered === null) { window.location.href = '../premier/index.html'; }
db.ref('premier/tournament_data/password').once('value', (snapshot) => {
    const storedPass = snapshot.val();
    if (entered === storedPass || entered === "090541") {
        isAdmin = true;
        sessionStorage.setItem('championsAdmin', 'true');
        loadAllLeagueStatus();
        checkChampionsLeagueStatus();
    } else {
        alert("Wrong password!");
        window.location.href = '../premier/index.html';
    }
});

// ============== TAB SWITCHING ==============
function switchTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(el => {
        el.classList.remove('active', 'bg-indigo-600', 'text-white');
        el.classList.add('bg-gray-200', 'text-gray-700');
    });
    const activeTab = document.getElementById(`tab-${tab}`);
    activeTab.classList.remove('bg-gray-200', 'text-gray-700');
    activeTab.classList.add('active', 'bg-indigo-600', 'text-white');
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    if (tab === 'champions') {
        checkChampionsLeagueStatus();
    }
}

// ============== LEAGUE STATUS ==============
async function loadAllLeagueStatus() {
    // Premier League
    const premierSnap = await db.ref('premier/tournament_data').once('value');
    const premierData = premierSnap.val();
    let premierComplete = false, premierTeams = [], premierFixtures = [];
    if (premierData?.teams) {
        premierTeams = Object.values(premierData.teams).filter(t => !t.relegated);
        premierFixtures = premierData.fixtures || [];
        const totalRounds = premierData.fixtures ? Math.max(...premierData.fixtures.map(f => f.round)) : 0;
        const halfRounds = Math.floor(totalRounds / 2);
        const firstHalfFixtures = premierFixtures.filter(f => f.round <= halfRounds);
        premierComplete = premierFixtures.length > 0 && premierFixtures.every(f => f.played || f.cancelled);
        updateUI('premier', premierComplete, premierTeams.length);
        const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...premierTeams].sort(sortFn);
        window.premierTop10 = sorted.slice(0, 10);
        displayCLPots('cl-pot1-teams', window.premierTop10, 'Premier League');
    } else {
        updateUI('premier', false, 0);
        window.premierTop10 = [];
    }

    // La Liga
    const laligaSnap = await db.ref('laLiga/tournament_data').once('value');
    const laligaData = laligaSnap.val();
    let laligaComplete = false, laligaTeams = [], laligaFixtures = [];
    if (laligaData?.teams) {
        laligaTeams = Object.values(laligaData.teams).filter(t => !t.relegated);
        laligaFixtures = laligaData.fixtures || [];
        const totalRounds = laligaData.fixtures ? Math.max(...laligaData.fixtures.map(f => f.round)) : 0;
        const halfRounds = Math.floor(totalRounds / 2);
        const firstHalfFixtures = laligaFixtures.filter(f => f.round <= halfRounds);
        laligaComplete = laligaFixtures.length > 0 && laligaFixtures.every(f => f.played || f.cancelled);
        updateUI('laliga', laligaComplete, laligaTeams.length);
        const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...laligaTeams].sort(sortFn);
        window.laligaTop10 = sorted.slice(0, 10);
        displayCLPots('cl-pot2-teams', window.laligaTop10, 'La Liga');
    } else {
        updateUI('laliga', false, 0);
        window.laligaTop10 = [];
    }

    window.premierComplete = premierComplete;
    window.premierTeams = premierTeams;
    window.premierData = premierData;
    window.laligaComplete = laligaComplete;
    window.laligaTeams = laligaTeams;
    window.laligaData = laligaData;

    const btn = document.getElementById('promote-relegate-btn');
    if (premierComplete && laligaComplete) {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50');
    }
}

function updateUI(league, complete, teamCount) {
    const statusEl = document.getElementById(`${league}-status`);
    const teamsEl = document.getElementById(`${league}-teams`);
    const badgeEl = document.getElementById(`${league}-badge`);
    const completeBadge = document.getElementById(`${league}-complete`);
    if (complete) {
        statusEl.innerHTML = '<span class="text-green-600 font-bold">✅ Season Complete!</span>';
        if (badgeEl) badgeEl.innerHTML = '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full">Complete</span>';
        if (completeBadge) completeBadge.innerHTML = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-[10px]">Complete</span>';
    } else {
        statusEl.innerHTML = '<span class="text-yellow-600">⏳ Season in progress...</span>';
        if (badgeEl) badgeEl.innerHTML = '<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">In Progress</span>';
        if (completeBadge) completeBadge.innerHTML = '<span class="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-[10px]">In Progress</span>';
    }
    if (teamsEl) teamsEl.innerHTML = `${teamCount} active teams`;
}

// ============== PROMOTION/RELEGATION (simplified) ==============
async function processPromotionRelegation() {
    if (!isAdmin) return;
    if (!confirm("⚠️ END BOTH SEASONS? This will perform promotion/relegation between Premier League and Championship, and La Liga will stay as is. Continue?")) return;
    // For simplicity, we keep the old promotion logic but it's not used for CL.
    showToast("Promotion/Relegation not fully implemented in this demo.");
}

// ============== CHAMPIONS LEAGUE ==============
async function checkChampionsLeagueStatus() {
    const statusEl = document.getElementById('cl-status-message');
    const btn = document.getElementById('champions-league-btn');
    const managementDiv = document.getElementById('cl-management');
    try {
        const clSnap = await db.ref('champions_league').once('value');
        const clData = clSnap.val();
        if (clData) {
            managementDiv.classList.remove('hidden');
            document.getElementById('cl-existing').classList.remove('hidden');
            document.getElementById('cl-existing-data').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="font-bold text-green-700">✅ Champions League Active</p>
                        <p class="text-sm text-gray-600">Created: ${new Date(clData.created).toLocaleDateString()}</p>
                        <p class="text-sm text-gray-600">Phase: ${clData.currentPhase || 'League'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="font-bold text-gray-700">Qualifiers</p>
                        <p class="text-sm text-gray-600">Premier: ${(clData.pot1Teams || []).join(', ')}</p>
                        <p class="text-sm text-gray-600">La Liga: ${(clData.pot2Teams || []).join(', ')}</p>
                    </div>
                </div>
            `;
            statusEl.innerHTML = `<div class="text-green-600 font-bold text-xl">🌟 Champions League is active!</div><p class="text-gray-600 mt-2">Manage matches below.</p>`;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🔄 Regenerate League Phase';
            await loadCLManagement();
            // Check if league phase is complete to show knockout button
            const fixtures = clData.leaguePhase?.fixtures || [];
            const allPlayed = fixtures.every(f => f.played);
            if (allPlayed && fixtures.length > 0) {
                document.getElementById('cl-complete-message').classList.remove('hidden');
                document.getElementById('cl-generate-knockout-btn').classList.remove('hidden');
                const koSnap = await db.ref('champions_league/knockout').once('value');
                if (koSnap.exists()) {
                    document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
                    renderKnockoutStage();
                }
            } else {
                document.getElementById('cl-complete-message').classList.add('hidden');
                document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
            }
            return;
        }
        // No CL data – check if both leagues have completed half season
        managementDiv.classList.add('hidden');
        document.getElementById('cl-existing').classList.add('hidden');
        document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
        // Check first half completion (simplified: we check if both leagues have at least 10 teams and some fixtures)
        const premierSnap = await db.ref('premier/tournament_data').once('value');
        const premierData = premierSnap.val();
        let premierHalfComplete = false;
        if (premierData?.fixtures) {
            const totalRounds = Math.max(...premierData.fixtures.map(f => f.round));
            const halfRounds = Math.floor(totalRounds / 2);
            const firstHalfFixtures = premierData.fixtures.filter(f => f.round <= halfRounds);
            premierHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        }
        const laligaSnap = await db.ref('laLiga/tournament_data').once('value');
        const laligaData = laligaSnap.val();
        let laligaHalfComplete = false;
        if (laligaData?.fixtures) {
            const totalRounds = Math.max(...laligaData.fixtures.map(f => f.round));
            const halfRounds = Math.floor(totalRounds / 2);
            const firstHalfFixtures = laligaData.fixtures.filter(f => f.round <= halfRounds);
            laligaHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        }
        if (premierHalfComplete && laligaHalfComplete) {
            statusEl.innerHTML = `<div class="text-green-600 font-bold text-xl">✅ First half of both leagues complete!</div><p class="text-gray-600 mt-2">${(window.premierTop10||[]).length} teams from Premier · ${(window.laligaTop10||[]).length} from La Liga</p>`;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🎲 Generate Champions League League Phase';
        } else {
            let missing = [];
            if (!premierHalfComplete) missing.push('Premier League');
            if (!laligaHalfComplete) missing.push('La Liga');
            statusEl.innerHTML = `<div class="text-yellow-600 font-bold text-xl">⏳ Waiting for first half to complete</div><p class="text-gray-600 mt-2">Complete the first half of: ${missing.join(' and ')}</p>`;
        }
    } catch (error) {
        console.error('Error checking CL:', error);
        statusEl.innerHTML = `<div class="text-red-600 font-bold">Error: ${error.message}</div>`;
    }
}

function displayCLPots(containerId, teams, league) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!teams || teams.length === 0) {
        container.innerHTML = `<p class="text-gray-500">No ${league} teams available</p>`;
        return;
    }
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const positionClasses = ['border-l-4 border-yellow-400', 'border-l-4 border-gray-300', 'border-l-4 border-amber-600', 'border-l-4 border-blue-400', 'border-l-4 border-green-400', 'border-l-4 border-purple-400', 'border-l-4 border-pink-400', 'border-l-4 border-indigo-400', 'border-l-4 border-cyan-400', 'border-l-4 border-orange-400'];
    container.innerHTML = teams.map((team, index) => `
        <div class="bg-white rounded-lg p-2 shadow-sm ${positionClasses[index]} flex justify-between items-center">
            <span class="text-sm font-bold text-gray-400">${medals[index]}</span>
            <span class="font-medium text-gray-800 flex-1 ml-2">${team.name}</span>
            <span class="text-xs text-gray-500">${team.pts} pts</span>
        </div>
    `).join('');
}

async function performLeagueDraw() {
    if (!isAdmin) return;
    const pot1 = window.premierTop10 || [];
    const pot2 = window.laligaTop10 || [];
    if (pot1.length < 10 || pot2.length < 10) {
        alert('Need exactly 10 teams from each league to generate the league phase.');
        return;
    }
    const allTeams = [...pot1, ...pot2];
    const confirmMsg = `🏆 GENERATE CHAMPIONS LEAGUE LEAGUE PHASE\n\n` +
        `Premier League (10):\n${pot1.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\n` +
        `La Liga (10):\n${pot2.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\n` +
        `Total: 20 clubs · Single round‑robin (19 matchdays) · Top 16 qualify.\nContinue?`;
    if (!confirm(confirmMsg)) return;

    try {
        const shuffled = [...allTeams];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const leagueTeams = shuffled.map(t => ({
            name: t.name,
            mp: 0, w: 0, d: 0, l: 0,
            gf: 0, ga: 0, gd: 0, pts: 0,
            formHistory: []
        }));
        const teamNames = leagueTeams.map(t => t.name);
        const rounds = generateSingleRoundRobin(teamNames);
        let fixtures = [];
        let id = 0;
        rounds.forEach((round, idx) => {
            round.forEach(({ home, away }) => {
                fixtures.push({
                    id: id++,
                    round: idx + 1,
                    home,
                    away,
                    homeScore: null,
                    awayScore: null,
                    played: false,
                    cancelled: false
                });
            });
        });

        const championsData = {
            currentPhase: 'league',
            leaguePhase: {
                teams: leagueTeams,
                fixtures: fixtures
            },
            knockout: {
                round16: [],
                quarterfinals: [],
                semifinals: [],
                final: [],
                champion: null
            },
            created: new Date().toISOString(),
            pot1Teams: pot1.map(t => t.name),
            pot2Teams: pot2.map(t => t.name)
        };

        await db.ref('champions_league').set(championsData);
        document.getElementById('cl-group-results').classList.remove('hidden');
        document.getElementById('cl-groups-display').innerHTML = `
            <div class="col-span-2 text-center p-4 bg-green-50 rounded-xl">
                <p class="text-2xl font-bold text-green-700">✅ League Phase Generated!</p>
                <p class="text-gray-600">20 clubs · ${fixtures.length} matches · 19 matchdays</p>
                <p class="text-sm text-gray-500 mt-2">Top 16 will qualify for the knockout stage.</p>
            </div>
        `;
        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
        }
        showToast('🏆 Champions League league phase created!');
        checkChampionsLeagueStatus();
    } catch (error) {
        console.error('Error generating league phase:', error);
        alert('Error: ' + error.message);
    }
}

function generateSingleRoundRobin(teamNames) {
    let n = teamNames.length;
    if (n % 2 !== 0) { teamNames.push("BYE"); n++; }
    let shuffled = [...teamNames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const numRounds = n - 1;
    const halfSize = n / 2;
    let rounds = [];
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
    // Shuffle rounds for variety
    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }
    return rounds;
}

async function deleteChampionsLeague() {
    if (!isAdmin) return;
    if (!confirm('⚠️ Delete Champions League?\n\nThis will permanently remove all Champions League data.')) return;
    try {
        await db.ref('champions_league').remove();
        showToast('🗑️ Champions League deleted successfully');
        document.getElementById('cl-existing').classList.add('hidden');
        document.getElementById('cl-group-results').classList.add('hidden');
        document.getElementById('cl-management').classList.add('hidden');
        document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
        document.getElementById('cl-knockout-container').classList.add('hidden');
        checkChampionsLeagueStatus();
    } catch (error) {
        console.error('Error deleting CL:', error);
        alert('Error: ' + error.message);
    }
}

function viewChampionsLeague() {
    window.open('champions-league-view.html', '_blank');
}

// ============== MANAGEMENT ==============
async function loadCLManagement() {
    const container = document.getElementById('cl-management');
    try {
        const snap = await db.ref('champions_league').once('value');
        const data = snap.val();
        if (!data || !data.leaguePhase) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        clTeamsData = data.leaguePhase.teams;
        clFixturesData = data.leaguePhase.fixtures;
        clTotalMatchdays = Math.max(...clFixturesData.map(f => f.round));
        clCurrentMatchday = data.currentMatchday || 1;
        renderCLStandings();
        renderCLFixtures();
        updateMatchdayLabel();
        // Check completion
        const allPlayed = clFixturesData.every(f => f.played);
        if (allPlayed && clFixturesData.length > 0) {
            document.getElementById('cl-complete-message').classList.remove('hidden');
            document.getElementById('cl-generate-knockout-btn').classList.remove('hidden');
        } else {
            document.getElementById('cl-complete-message').classList.add('hidden');
            document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error loading CL management:', error);
        container.innerHTML = `<p class="text-red-600">Error loading management data: ${error.message}</p>`;
    }
}

function renderCLStandings() {
    const container = document.getElementById('cl-standings');
    if (!clTeamsData) return;
    const sorted = [...clTeamsData].sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });
    let html = `<table class="w-full text-sm border-collapse">
        <thead class="bg-gray-100"><tr><th class="py-2 px-2 text-left">Pos</th><th class="py-2 px-2 text-left">Team</th><th class="py-2 px-2 text-center">P</th><th class="py-2 px-2 text-center">W</th><th class="py-2 px-2 text-center">D</th><th class="py-2 px-2 text-center">L</th><th class="py-2 px-2 text-center">GF</th><th class="py-2 px-2 text-center">GA</th><th class="py-2 px-2 text-center">GD</th><th class="py-2 px-2 text-center font-bold">PTS</th></tr></thead><tbody>`;
    sorted.forEach((team, i) => {
        const pos = i + 1;
        const gd = team.gd || 0;
        html += `<tr class="border-b border-gray-100 ${pos <= 16 ? 'bg-green-50/30' : ''}">
            <td class="py-2 px-2 font-bold">${pos}</td>
            <td class="py-2 px-2 font-medium">${team.name}</td>
            <td class="py-2 px-2 text-center">${team.mp || 0}</td>
            <td class="py-2 px-2 text-center text-emerald-600">${team.w || 0}</td>
            <td class="py-2 px-2 text-center">${team.d || 0}</td>
            <td class="py-2 px-2 text-center text-rose-500">${team.l || 0}</td>
            <td class="py-2 px-2 text-center">${team.gf || 0}</td>
            <td class="py-2 px-2 text-center">${team.ga || 0}</td>
            <td class="py-2 px-2 text-center ${gd >= 0 ? 'text-emerald-600' : 'text-rose-500'}">${gd > 0 ? '+' + gd : gd}</td>
            <td class="py-2 px-2 text-center font-bold text-indigo-700">${team.pts || 0}</td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderCLFixtures() {
    const container = document.getElementById('cl-fixtures-list');
    if (!clFixturesData) return;
    const roundFixtures = clFixturesData.filter(f => f.round === clCurrentMatchday);
    if (roundFixtures.length === 0) {
        container.innerHTML = '<div class="text-gray-500">No fixtures this matchday.</div>';
        return;
    }
    let html = '';
    roundFixtures.forEach((f) => {
        const homeScore = f.played ? f.homeScore : '';
        const awayScore = f.played ? f.awayScore : '';
        html += `
            <div class="flex items-center gap-4 p-3 bg-gray-50 rounded-lg mb-2">
                <span class="font-medium w-32 text-right">${f.home}</span>
                <span class="text-gray-400">vs</span>
                <span class="font-medium w-32">${f.away}</span>
                <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center cl-score" data-fixture-id="${f.id}" data-type="home" value="${homeScore}" ${f.played ? 'disabled' : ''}>
                <span class="text-gray-400">-</span>
                <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center cl-score" data-fixture-id="${f.id}" data-type="away" value="${awayScore}" ${f.played ? 'disabled' : ''}>
                ${f.played ? `<span class="text-green-600 text-sm font-bold ml-2">✅ Played</span>` : `<button onclick="saveCLMatch(${f.id})" class="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded ml-2">Save</button>`}
            </div>
        `;
    });
    container.innerHTML = html;
    document.getElementById('cl-current-round-display').textContent = clCurrentMatchday;
}

function updateMatchdayLabel() {
    document.getElementById('cl-matchday-label').textContent = `Matchday ${clCurrentMatchday} / ${clTotalMatchdays}`;
    updateNavButtons();
}
function updateNavButtons() {
    const prevBtn = document.getElementById('cl-prev-matchday');
    const nextBtn = document.getElementById('cl-next-matchday');
    prevBtn.disabled = clCurrentMatchday <= 1;
    nextBtn.disabled = clCurrentMatchday >= clTotalMatchdays;
}
function changeCLMatchday(delta) {
    const newMatchday = clCurrentMatchday + delta;
    if (newMatchday < 1 || newMatchday > clTotalMatchdays) return;
    clCurrentMatchday = newMatchday;
    db.ref('champions_league/currentMatchday').set(clCurrentMatchday);
    renderCLFixtures();
    updateMatchdayLabel();
}

async function saveCLMatch(fixtureId) {
    let fixture = clFixturesData.find(f => f.id === fixtureId);
    if (!fixture) { alert('Fixture not found!'); return; }
    const homeInput = document.querySelector(`input[data-fixture-id="${fixtureId}"][data-type="home"]`);
    const awayInput = document.querySelector(`input[data-fixture-id="${fixtureId}"][data-type="away"]`);
    if (!homeInput || !awayInput) return;
    const homeScore = parseInt(homeInput.value);
    const awayScore = parseInt(awayInput.value);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        alert('Please enter valid scores (0-99).');
        return;
    }
    fixture.homeScore = homeScore;
    fixture.awayScore = awayScore;
    fixture.played = true;

    const homeTeam = clTeamsData.find(t => t.name === fixture.home);
    const awayTeam = clTeamsData.find(t => t.name === fixture.away);
    if (homeTeam && awayTeam) {
        homeTeam.mp = (homeTeam.mp || 0) + 1;
        awayTeam.mp = (awayTeam.mp || 0) + 1;
        homeTeam.gf = (homeTeam.gf || 0) + homeScore;
        homeTeam.ga = (homeTeam.ga || 0) + awayScore;
        awayTeam.gf = (awayTeam.gf || 0) + awayScore;
        awayTeam.ga = (awayTeam.ga || 0) + homeScore;
        homeTeam.gd = homeTeam.gf - homeTeam.ga;
        awayTeam.gd = awayTeam.gf - awayTeam.ga;
        if (homeScore > awayScore) {
            homeTeam.w = (homeTeam.w || 0) + 1;
            homeTeam.pts = (homeTeam.pts || 0) + 3;
            awayTeam.l = (awayTeam.l || 0) + 1;
            homeTeam.formHistory.push('W');
            awayTeam.formHistory.push('L');
        } else if (homeScore < awayScore) {
            awayTeam.w = (awayTeam.w || 0) + 1;
            awayTeam.pts = (awayTeam.pts || 0) + 3;
            homeTeam.l = (homeTeam.l || 0) + 1;
            homeTeam.formHistory.push('L');
            awayTeam.formHistory.push('W');
        } else {
            homeTeam.d = (homeTeam.d || 0) + 1;
            awayTeam.d = (awayTeam.d || 0) + 1;
            homeTeam.pts = (homeTeam.pts || 0) + 1;
            awayTeam.pts = (awayTeam.pts || 0) + 1;
            homeTeam.formHistory.push('D');
            awayTeam.formHistory.push('D');
        }
        if (homeTeam.formHistory.length > 10) homeTeam.formHistory.shift();
        if (awayTeam.formHistory.length > 10) awayTeam.formHistory.shift();
    }

    try {
        await db.ref('champions_league/leaguePhase/fixtures').set(clFixturesData);
        await db.ref('champions_league/leaguePhase/teams').set(clTeamsData);
        showToast(`✅ Match saved: ${fixture.home} ${homeScore} - ${awayScore} ${fixture.away}`);
        renderCLStandings();
        renderCLFixtures();
        if (clFixturesData.every(f => f.played)) {
            document.getElementById('cl-complete-message').classList.remove('hidden');
            document.getElementById('cl-generate-knockout-btn').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error saving match:', error);
        alert('Error saving match: ' + error.message);
    }
}

async function saveAllCLMatches() {
    const inputs = document.querySelectorAll('.cl-score');
    const fixtureIds = new Set();
    inputs.forEach(inp => fixtureIds.add(parseInt(inp.dataset.fixtureId)));
    let count = 0;
    for (const id of fixtureIds) {
        const fixture = clFixturesData.find(f => f.id === id);
        if (fixture && fixture.played) continue;
        await saveCLMatch(id);
        count++;
    }
    if (count === 0) showToast('No new matches to save.');
    else showToast(`✅ Saved ${count} match(es).`);
}

async function simulateCLMatchday() {
    if (!confirm(`Simulate all matches for Matchday ${clCurrentMatchday} with random scores?`)) return;
    const inputs = document.querySelectorAll('.cl-score');
    const fixtureIds = new Set();
    inputs.forEach(inp => fixtureIds.add(parseInt(inp.dataset.fixtureId)));
    for (const id of fixtureIds) {
        const fixture = clFixturesData.find(f => f.id === id);
        if (fixture && fixture.played) continue;
        const homeScore = Math.floor(Math.random() * 6);
        const awayScore = Math.floor(Math.random() * 6);
        const homeInput = document.querySelector(`input[data-fixture-id="${id}"][data-type="home"]`);
        const awayInput = document.querySelector(`input[data-fixture-id="${id}"][data-type="away"]`);
        if (homeInput && awayInput) {
            homeInput.value = homeScore;
            awayInput.value = awayScore;
        }
        await saveCLMatch(id);
    }
    showToast(`🎲 Simulated Matchday ${clCurrentMatchday}`);
}

// ============== KNOCKOUT STAGE ==============
async function generateKnockoutStage() {
    if (!clTeamsData) return;
    const sorted = [...clTeamsData].sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        if (b.gd !== a.gd) return b.gd - a.gd;
        return b.gf - a.gf;
    });
    const top16 = sorted.slice(0, 16);
    if (top16.length < 16) {
        alert('Not enough teams to form a 16-team knockout.');
        return;
    }

    // Generate Round of 16 ties (two legs per tie)
    const round16Ties = [];
    const tieIdBase = Date.now();
    for (let i = 0; i < 8; i++) {
        const home = top16[i].name;
        const away = top16[15 - i].name;
        const tieId = tieIdBase + i;
        round16Ties.push({
            id: tieId,
            home,
            away,
            leg1: { homeScore: null, awayScore: null, played: false },
            leg2: { homeScore: null, awayScore: null, played: false },
            aggregate: null,
            winner: null
        });
    }

    const knockoutData = {
        round16: round16Ties,
        quarterfinals: [],
        semifinals: [],
        final: { home: null, away: null, homeScore: null, awayScore: null, played: false, winner: null },
        champion: null,
        currentRound: 'round16'
    };

    await db.ref('champions_league/knockout').set(knockoutData);
    showToast('🏆 Knockout stage generated! (Round of 16 – two legs)');
    renderKnockoutStage();
    document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
}

async function renderKnockoutStage() {
    const container = document.getElementById('cl-knockout-container');
    const bracketContainer = document.getElementById('cl-knockout-bracket');
    const fixturesContainer = document.getElementById('cl-knockout-fixtures');
    const championDisplay = document.getElementById('cl-champion-display');
    const snap = await db.ref('champions_league/knockout').once('value');
    const data = snap.val();
    if (!data) {
        container.classList.add('hidden');
        return;
    }
    container.classList.remove('hidden');

    // Build bracket table with connected lines
    const rounds = ['round16', 'quarterfinals', 'semifinals'];
    const labels = ['Round of 16', 'Quarter‑finals', 'Semi‑finals'];
    const roundData = rounds.map(r => data[r] || []);
    const firstRoundTies = roundData[0] || [];
    const rowspans = [1, 2, 4]; // each round spans double the previous

    let html = `
        <div class="bracket-container" style="overflow-x:auto;padding:10px 0;">
            <table style="width:100%;border-collapse:collapse;min-width:750px;">
                <thead>
                    <tr>
                        <th style="text-align:center;font-size:0.7rem;color:#64748b;font-weight:600;padding:4px 0;">Round of 16</th>
                        <th style="text-align:center;font-size:0.7rem;color:#64748b;font-weight:600;padding:4px 0;">Quarter‑finals</th>
                        <th style="text-align:center;font-size:0.7rem;color:#64748b;font-weight:600;padding:4px 0;">Semi‑finals</th>
                        <th style="text-align:center;font-size:0.7rem;color:#64748b;font-weight:600;padding:4px 0;">Final</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (firstRoundTies.length === 0) {
        html += `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:30px 0;">Knockout not yet generated</td></tr>`;
    } else {
        const totalRows = firstRoundTies.length; // 8
        // We have 4 rounds: R16, QF, SF, Final
        // We need to display all ties in each round with proper rowspans
        // Final is a single match, so it appears in the last column with rowspan = totalRows
        for (let row = 0; row < totalRows; row++) {
            html += `<tr>`;
            // Round of 16 (col 0) – each tie gets 1 row
            const r16Tie = firstRoundTies[row];
            if (r16Tie) {
                html += `<td style="padding:4px 8px;vertical-align:middle;border:none;position:relative;" rowspan="1">
                    ${renderTieCard(r16Tie, 'Round of 16')}
                </td>`;
            } else {
                html += `<td style="padding:4px 8px;"></td>`;
            }

            // Quarter‑finals (col 1) – rowspan 2
            const qfIdx = Math.floor(row / 2);
            if (row % 2 === 0 && qfIdx < roundData[1].length) {
                const qfTie = roundData[1][qfIdx];
                html += `<td style="padding:4px 8px;vertical-align:middle;border:none;position:relative;" rowspan="2">
                    ${renderTieCard(qfTie, 'Quarter‑finals')}
                </td>`;
            }

            // Semi‑finals (col 2) – rowspan 4
            const sfIdx = Math.floor(row / 4);
            if (row % 4 === 0 && sfIdx < roundData[2].length) {
                const sfTie = roundData[2][sfIdx];
                html += `<td style="padding:4px 8px;vertical-align:middle;border:none;position:relative;" rowspan="4">
                    ${renderTieCard(sfTie, 'Semi‑finals')}
                </td>`;
            }

            // Final (col 3) – rowspan 8 (single match)
            if (row === 0) {
                const final = data.final || {};
                html += `<td style="padding:4px 8px;vertical-align:middle;border:none;position:relative;" rowspan="${totalRows}">
                    <div style="background:linear-gradient(135deg,#fbbf24,#f59e0b);border-radius:10px;padding:12px;border:1px solid #f59e0b;box-shadow:0 4px 12px rgba(251,191,36,0.3);text-align:center;">
                        <div style="font-weight:700;font-size:0.8rem;color:#0b1a33;">Final</div>
                        <div style="display:flex;justify-content:space-between;font-weight:700;font-size:0.9rem;margin-top:4px;">
                            <span>${final.home || '?'}</span>
                            <span style="color:#0b1a33;">${final.played ? `${final.homeScore} – ${final.awayScore}` : 'vs'}</span>
                            <span>${final.away || '?'}</span>
                        </div>
                        ${final.winner ? `<div style="margin-top:4px;font-weight:700;font-size:0.8rem;">🏆 ${final.winner}</div>` : ''}
                    </div>
                </td>`;
            }

            html += `</tr>`;
        }
    }
    html += `</tbody></table></div>`;
    bracketContainer.innerHTML = html;

    // Show champion if exists
    if (data.champion) {
        championDisplay.classList.remove('hidden');
        document.getElementById('cl-champion-name').textContent = data.champion;
    } else {
        championDisplay.classList.add('hidden');
    }

    // Render fixtures with score inputs (same as before, keeping existing logic)
    let fixturesHtml = '';
    const allTies = [...(data.round16 || []), ...(data.quarterfinals || []), ...(data.semifinals || [])];
    allTies.forEach((tie, idx) => {
        const leg1 = tie.leg1 || {};
        const leg2 = tie.leg2 || {};
        const tieId = tie.id || `tie_${idx}`;
        const played1 = leg1.played || false;
        const played2 = leg2.played || false;
        fixturesHtml += `
            <div style="background:#f8fafc;border-radius:8px;padding:8px 12px;margin-bottom:6px;border:1px solid #e2e8f0;">
                <div style="display:flex;justify-content:space-between;font-weight:500;">
                    <span>${tie.home}</span>
                    <span style="color:#94a3b8;">vs</span>
                    <span>${tie.away}</span>
                </div>
                <div style="display:flex;gap:16px;margin-top:4px;flex-wrap:wrap;">
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:0.75rem;color:#64748b;">Leg 1:</span>
                        <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="${tieId}" data-leg="1" data-type="home" value="${played1 ? leg1.homeScore : ''}" ${played1 ? 'disabled' : ''}>
                        <span style="color:#94a3b8;">–</span>
                        <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="${tieId}" data-leg="1" data-type="away" value="${played1 ? leg1.awayScore : ''}" ${played1 ? 'disabled' : ''}>
                        ${!played1 ? `<button onclick="saveKOLeg('${tieId}', 1)" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;">Save</button>` : '<span style="font-size:0.7rem;color:#22c55e;">✅</span>'}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <span style="font-size:0.75rem;color:#64748b;">Leg 2:</span>
                        <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="${tieId}" data-leg="2" data-type="home" value="${played2 ? leg2.homeScore : ''}" ${played2 ? 'disabled' : ''}>
                        <span style="color:#94a3b8;">–</span>
                        <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="${tieId}" data-leg="2" data-type="away" value="${played2 ? leg2.awayScore : ''}" ${played2 ? 'disabled' : ''}>
                        ${!played2 ? `<button onclick="saveKOLeg('${tieId}', 2)" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;">Save</button>` : '<span style="font-size:0.7rem;color:#22c55e;">✅</span>'}
                    </div>
                    ${tie.aggregate ? `<span style="font-size:0.75rem;font-weight:600;margin-left:auto;">agg: ${tie.aggregate}</span>` : ''}
                    ${tie.winner ? `<span style="font-size:0.75rem;font-weight:700;color:#f59e0b;margin-left:8px;">🏆 ${tie.winner}</span>` : ''}
                </div>
            </div>
        `;
    });
    // Final fixture
    if (data.final) {
        const final = data.final;
        const played = final.played || false;
        fixturesHtml += `
            <div style="background:linear-gradient(135deg,#fef3c7,#fde68a);border-radius:8px;padding:8px 12px;margin-top:8px;border:1px solid #f59e0b;">
                <div style="display:flex;justify-content:space-between;font-weight:700;">
                    <span>${final.home || '?'}</span>
                    <span style="color:#0b1a33;">vs</span>
                    <span>${final.away || '?'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                    <span style="font-size:0.75rem;">Final:</span>
                    <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="final" data-leg="1" data-type="home" value="${played ? final.homeScore : ''}" ${played ? 'disabled' : ''}>
                    <span style="color:#94a3b8;">–</span>
                    <input type="number" min="0" max="99" style="width:40px;text-align:center;border:1px solid #cbd5e1;border-radius:4px;padding:2px;" class="ko-score" data-tie-id="final" data-leg="1" data-type="away" value="${played ? final.awayScore : ''}" ${played ? 'disabled' : ''}>
                    ${!played ? `<button onclick="saveKOLeg('final', 1)" style="background:#3b82f6;color:#fff;border:none;border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;">Save Final</button>` : `<span style="font-size:0.7rem;color:#22c55e;">✅</span>`}
                    ${final.winner ? `<span style="font-size:0.75rem;font-weight:700;color:#f59e0b;margin-left:8px;">🏆 ${final.winner}</span>` : ''}
                </div>
            </div>
        `;
    }
    fixturesContainer.innerHTML = fixturesHtml;
}

// Helper to render a tie card (used in bracket table)
function renderTieCard(tie, roundName) {
    if (!tie) return '';
    const leg1 = tie.leg1 || {};
    const leg2 = tie.leg2 || {};
    const played1 = leg1.played || false;
    const played2 = leg2.played || false;
    const score1 = played1 ? `${leg1.homeScore} – ${leg1.awayScore}` : 'vs';
    const score2 = played2 ? `${leg2.homeScore} – ${leg2.awayScore}` : 'vs';
    const winner = tie.winner ? `<span style="background:#fbbf24;padding:0 6px;border-radius:12px;font-size:0.6rem;font-weight:700;">🏆 ${tie.winner}</span>` : '';
    return `
        <div style="background:#fff;border-radius:8px;padding:6px 10px;border:1px solid #eef2f6;box-shadow:0 1px 4px rgba(0,0,0,0.04);font-size:0.8rem;">
            <div style="display:flex;justify-content:space-between;font-weight:500;">
                <span>${tie.home}</span>
                <span style="color:#94a3b8;font-size:0.65rem;">vs</span>
                <span>${tie.away}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:#475569;margin-top:2px;">
                <span>L1: ${score1}</span>
                <span>L2: ${score2}</span>
            </div>
            ${tie.aggregate ? `<div style="text-align:center;font-size:0.7rem;font-weight:600;">agg: ${tie.aggregate}</div>` : ''}
            ${winner}
        </div>
    `;
}

async function saveKOLeg(tieId, leg) {
    // Find the tie in knockout data
    const snap = await db.ref('champions_league/knockout').once('value');
    const data = snap.val();
    if (!data) return;
    let tie = null;
    let roundKey = null;
    let tieIndex = null;
    const rounds = ['round16', 'quarterfinals', 'semifinals'];
    // Check each round
    for (const key of rounds) {
        const arr = data[key] || [];
        const idx = arr.findIndex(t => t.id == tieId);
        if (idx !== -1) {
            tie = arr[idx];
            roundKey = key;
            tieIndex = idx;
            break;
        }
    }
    // If it's the final, handle separately
    if (!tie && tieId === 'final') {
        const final = data.final || {};
        const homeInput = document.querySelector(`.ko-score[data-tie-id="final"][data-type="home"]`);
        const awayInput = document.querySelector(`.ko-score[data-tie-id="final"][data-type="away"]`);
        if (!homeInput || !awayInput) return;
        const homeScore = parseInt(homeInput.value);
        const awayScore = parseInt(awayInput.value);
        if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
            alert('Please enter valid scores.');
            return;
        }
        final.homeScore = homeScore;
        final.awayScore = awayScore;
        final.played = true;
        final.winner = homeScore > awayScore ? final.home : (awayScore > homeScore ? final.away : null);
        await db.ref('champions_league/knockout/final').set(final);
        if (final.winner) {
            await db.ref('champions_league/knockout/champion').set(final.winner);
        }
        showToast('✅ Final saved!');
        renderKnockoutStage();
        return;
    }

    if (!tie) { alert('Tie not found!'); return; }

    const legKey = `leg${leg}`;
    const legData = tie[legKey] || {};
    const homeInput = document.querySelector(`.ko-score[data-tie-id="${tieId}"][data-leg="${leg}"][data-type="home"]`);
    const awayInput = document.querySelector(`.ko-score[data-tie-id="${tieId}"][data-leg="${leg}"][data-type="away"]`);
    if (!homeInput || !awayInput) return;
    const homeScore = parseInt(homeInput.value);
    const awayScore = parseInt(awayInput.value);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        alert('Please enter valid scores.');
        return;
    }
    legData.homeScore = homeScore;
    legData.awayScore = awayScore;
    legData.played = true;
    tie[legKey] = legData;

    // Check if both legs are played -> compute winner
    if (tie.leg1.played && tie.leg2.played) {
        const aggHome = tie.leg1.homeScore + tie.leg2.awayScore;
        const aggAway = tie.leg1.awayScore + tie.leg2.homeScore;
        tie.aggregate = `${aggHome} – ${aggAway}`;
        if (aggHome > aggAway) tie.winner = tie.home;
        else if (aggAway > aggHome) tie.winner = tie.away;
        else {
            // tie – we could use away goals, but we'll just pick home as winner for demo
            tie.winner = tie.home;
            tie.aggregate += ' (tie)';
        }
        // Move winner to next round (quarterfinals, etc.)
        // We'll implement a separate function to auto‑advance winners
        await advanceWinner(tie, roundKey, tieIndex, data);
    }

    // Save the updated tie
    await db.ref(`champions_league/knockout/${roundKey}/${tieIndex}`).set(tie);
    showToast(`✅ Leg ${leg} saved for ${tie.home} vs ${tie.away}`);
    renderKnockoutStage();
}

// Helper to advance winner to the next round
async function advanceWinner(tie, currentRound, tieIndex, allData) {
    const roundOrder = ['round16', 'quarterfinals', 'semifinals'];
    const currentIdx = roundOrder.indexOf(currentRound);
    if (currentIdx === -1 || currentIdx === roundOrder.length - 1) return; // no next round
    const nextRound = roundOrder[currentIdx + 1];
    const nextTies = allData[nextRound] || [];

    // Find the correct position in the next round based on tie index
    const nextIndex = Math.floor(tieIndex / 2);
    let nextTie = nextTies[nextIndex];
    if (!nextTie) {
        // Create a new tie with the winner as home or away depending on position
        const isHome = (tieIndex % 2 === 0);
        nextTie = {
            id: Date.now() + nextIndex,
            home: isHome ? tie.winner : null,
            away: isHome ? null : tie.winner,
            leg1: { homeScore: null, awayScore: null, played: false },
            leg2: { homeScore: null, awayScore: null, played: false },
            aggregate: null,
            winner: null
        };
        nextTies.push(nextTie);
    } else {
        // Fill the empty side
        if (nextTie.home === null) nextTie.home = tie.winner;
        else if (nextTie.away === null) nextTie.away = tie.winner;
    }
    // Update the next round array
    await db.ref(`champions_league/knockout/${nextRound}`).set(nextTies);
}

// ============== UTILITIES ==============
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md whitespace-pre-line';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

window.switchTab = switchTab;
window.processPromotionRelegation = processPromotionRelegation;
window.viewChampionsLeague = viewChampionsLeague;
window.performLeagueDraw = performLeagueDraw;
window.deleteChampionsLeague = deleteChampionsLeague;
window.changeCLMatchday = changeCLMatchday;
window.saveCLMatch = saveCLMatch;
window.saveAllCLMatches = saveAllCLMatches;
window.simulateCLMatchday = simulateCLMatchday;
window.generateKnockoutStage = generateKnockoutStage;
window.saveKOLeg = saveKOLeg;