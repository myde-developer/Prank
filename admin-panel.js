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
let clPot1Teams = []; // Premier League Top 6
let clPot2Teams = []; // Championship Top 6
let clCurrentMatchday = 1;
let clTotalMatchdays = 10; // 6 teams => 10 matchdays
let clGroupsData = null;
let clFixturesData = null;
let clKnockoutData = null;

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

// ============== LEAGUE MANAGEMENT ==============
async function loadAllLeagueStatus() {
    // Premier
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

        const sortFn = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...premierTeams].sort(sortFn);
        clPot1Teams = sorted.slice(0, 6); // TOP 6
        displayCLPots('cl-pot1-teams', clPot1Teams, 'Premier League');
    } else {
        updateUI('premier', false, 0);
    }

    // Championship
    const champSnap = await db.ref('championship/tournament_data').once('value');
    const champData = champSnap.val();
    let champComplete = false, champTeams = [], champFixtures = [];
    if (champData?.teams) {
        champTeams = Object.values(champData.teams).filter(t => !t.relegated);
        champFixtures = champData.fixtures || [];
        const totalRounds = champData.fixtures ? Math.max(...champData.fixtures.map(f => f.round)) : 0;
        const halfRounds = Math.floor(totalRounds / 2);
        const firstHalfFixtures = champFixtures.filter(f => f.round <= halfRounds);
        champComplete = champFixtures.length > 0 && champFixtures.every(f => f.played || f.cancelled);
        updateUI('championship', champComplete, champTeams.length);

        const sortFn = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...champTeams].sort(sortFn);
        clPot2Teams = sorted.slice(0, 6); // TOP 6
        displayCLPots('cl-pot2-teams', clPot2Teams, 'Championship');
    } else {
        updateUI('championship', false, 0);
    }

    window.premierComplete = premierComplete;
    window.premierTeams = premierTeams;
    window.premierData = premierData;
    window.championshipComplete = champComplete;
    window.championshipTeams = champTeams;
    window.championshipData = champData;

    const btn = document.getElementById('promote-relegate-btn');
    if (premierComplete && champComplete) {
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

// ============== PROMOTION/RELEGATION ==============
async function processPromotionRelegation() {
    if (!isAdmin) return;
    if (!confirm("⚠️ END BOTH SEASONS? This will:\n- Relegate bottom 3 from Premier to Championship\n- Promote top 3 from Championship to Premier\n- The bottom 3 of Championship will remain in the Championship (no relegation)\n\nBoth leagues will be reset with new squads. Continue?")) return;

    let premierTeams = window.premierTeams;
    let champTeams = window.championshipTeams;
    if (premierTeams.length < 3 || champTeams.length < 6) {
        alert("Need at least 3 teams in Premier and 6 in Championship to process.");
        return;
    }
    const sortFn = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
    const sortedPremier = [...premierTeams].sort(sortFn);
    const sortedChamp = [...champTeams].sort(sortFn);
    const relegatedFromPremier = sortedPremier.slice(-3).map(t => t.name);
    const promotedToPremier = sortedChamp.slice(0, 3).map(t => t.name);
    const bottomThreeChampStay = sortedChamp.slice(-3).map(t => t.name);

    let newPremierNames = sortedPremier.filter(t => !relegatedFromPremier.includes(t.name)).map(t => t.name);
    newPremierNames.push(...promotedToPremier);
    let newChampNames = sortedChamp.filter(t => !promotedToPremier.includes(t.name)).map(t => t.name);
    newChampNames.push(...relegatedFromPremier);

    document.getElementById('result-display').classList.remove('hidden');
    document.getElementById('relegated-from-premier').innerHTML = `<strong class="text-red-700">⬇️ Relegated from Premier League:</strong><br>${relegatedFromPremier.join(', ') || 'none'}`;
    document.getElementById('promoted-to-premier').innerHTML = `<strong class="text-green-700">⬆️ Promoted to Premier League:</strong><br>${promotedToPremier.join(', ')}`;
    document.getElementById('championship-bottom-stay').innerHTML = `<strong class="text-blue-700">🔄 Remain in Championship:</strong><br>${bottomThreeChampStay.join(', ')}`;
    document.getElementById('relegated-from-championship').innerHTML = `<strong class="text-gray-700">ℹ️ No teams relegated from Championship (bottom 3 stay).</strong>`;

    const premierPass = window.premierData?.password || "090541";
    const champPass = window.championshipData?.password || "090541";
    await resetLeagueWithTeams('premier', newPremierNames, premierPass);
    await resetLeagueWithTeams('championship', newChampNames, champPass);
    showToast(`✅ Promotion/Relegation complete!`);
    setTimeout(() => loadAllLeagueStatus(), 2000);
}

async function resetLeagueWithTeams(leagueId, teamNames, password) {
    let finalNames = [...teamNames];
    if (finalNames.length % 2 !== 0) finalNames.push("BYE");
    const newTeams = {};
    finalNames.forEach(name => {
        if (name !== "BYE") {
            newTeams[name] = { name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: 0, formHistory: [], relegated: false };
        }
    });
    const teamNameList = Object.keys(newTeams);
    const rounds = generateRandomRoundRobin(teamNameList);
    let fixturesList = [],
        id = 0;
    rounds.forEach((round, idx) => {
        round.forEach(({ home, away }) => {
            fixturesList.push({ id: id++, round: idx + 1, home, away, homeScore: null, awayScore: null, played: false, cancelled: false, comment: null, predictions: [], banter: [], events: [], report: null, deadline: null });
        });
    });
    const resetData = {
        teams: newTeams,
        fixtures: fixturesList,
        knockoutMatches: [],
        tournamentPhase: 'league',
        password: password,
        roundStartTimes: {},
        autoStartNextRound: false,
        roundPaused: {},
        releasedGameweeks: { 1: true }
    };
    await db.ref(`${leagueId}/tournament_data`).set(resetData);
}

function generateRandomRoundRobin(teamNames) {
    let n = teamNames.length;
    if (n % 2 !== 0) { teamNames.push("BYE");
        n++; }
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
                        <p class="text-sm text-gray-600">Groups: A & B (6 teams each)</p>
                        <p class="text-sm text-gray-600">Status: ${clData.groupStageComplete ? 'Complete' : 'In Progress'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="font-bold text-gray-700">Qualifiers</p>
                        <p class="text-sm text-gray-600">Premier: ${(clData.pot1Teams || []).join(', ')}</p>
                        <p class="text-sm text-gray-600">Championship: ${(clData.pot2Teams || []).join(', ')}</p>
                    </div>
                </div>
            `;
            statusEl.innerHTML = `<div class="text-green-600 font-bold text-xl">🌟 Champions League is active!</div><p class="text-gray-600 mt-2">Manage matches below.</p>`;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🔄 Regenerate Champions League Draw';

            await loadCLManagement();

            // Check if group stage is complete to show knockout button
            const allFixtures = [...(clData.fixtures?.A || []), ...(clData.fixtures?.B || [])];
            const allPlayed = allFixtures.every(f => f.played);
            if (allPlayed && allFixtures.length > 0) {
                document.getElementById('cl-generate-knockout-btn').classList.remove('hidden');
                const koSnap = await db.ref('champions_league/knockout').once('value');
                if (koSnap.exists()) {
                    document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
                    renderKnockoutStage();
                }
            } else {
                document.getElementById('cl-generate-knockout-btn').classList.add('hidden');
            }
            return;
        }

        // No CL exists
        managementDiv.classList.add('hidden');
        document.getElementById('cl-existing').classList.add('hidden');
        document.getElementById('cl-generate-knockout-btn').classList.add('hidden');

        // Check first half completion
        const premierSnap = await db.ref('premier/tournament_data').once('value');
        const premierData = premierSnap.val();
        let premierHalfComplete = false;
        if (premierData?.fixtures) {
            const totalRounds = premierData.fixtures.length > 0 ? Math.max(...premierData.fixtures.map(f => f.round)) : 0;
            const halfRounds = Math.floor(totalRounds / 2);
            const firstHalfFixtures = premierData.fixtures.filter(f => f.round <= halfRounds);
            premierHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        }
        const champSnap = await db.ref('championship/tournament_data').once('value');
        const champData = champSnap.val();
        let champHalfComplete = false;
        if (champData?.fixtures) {
            const totalRounds = champData.fixtures.length > 0 ? Math.max(...champData.fixtures.map(f => f.round)) : 0;
            const halfRounds = Math.floor(totalRounds / 2);
            const firstHalfFixtures = champData.fixtures.filter(f => f.round <= halfRounds);
            champHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        }
        if (premierHalfComplete && champHalfComplete) {
            statusEl.innerHTML = `<div class="text-green-600 font-bold text-xl">✅ First half of both leagues complete!</div><p class="text-gray-600 mt-2">${clPot1Teams.length} teams in Pot 1 (Premier) | ${clPot2Teams.length} teams in Pot 2 (Championship)</p>`;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🎲 Perform Champions League Draw';
        } else {
            let missing = [];
            if (!premierHalfComplete) missing.push('Premier League');
            if (!champHalfComplete) missing.push('Championship');
            statusEl.innerHTML = `<div class="text-yellow-600 font-bold text-xl">⏳ Waiting for first half to complete</div><p class="text-gray-600 mt-2">Complete the first half of: ${missing.join(' and ')}</p>`;
        }
    } catch (error) {
        console.error('Error checking Champions League:', error);
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
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
    const positionClasses = ['border-l-4 border-yellow-400', 'border-l-4 border-gray-300', 'border-l-4 border-amber-600', 'border-l-4 border-blue-400', 'border-l-4 border-green-400', 'border-l-4 border-purple-400'];
    container.innerHTML = teams.map((team, index) => `
        <div class="bg-white rounded-lg p-3 shadow-sm ${positionClasses[index]}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <span class="text-xl font-bold text-gray-400">${medals[index]}</span>
                    <span class="font-bold text-gray-800">${team.name}</span>
                </div>
                <div class="flex items-center gap-4 text-sm">
                    <span class="text-gray-600">${team.pts} pts</span>
                    <span class="text-gray-500">GD: ${team.gd || 0}</span>
                </div>
            </div>
        </div>
    `).join('');
}

async function performGroupDraw() {
    if (!isAdmin) return;
    if (clPot1Teams.length < 6 || clPot2Teams.length < 6) {
        alert('Need exactly 6 teams in each pot to perform the draw.');
        return;
    }
    const confirmMsg = `🎲 CHAMPIONS LEAGUE GROUP DRAW\n\nPot 1 (Premier League):\n${clPot1Teams.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\nPot 2 (Championship):\n${clPot2Teams.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\nThis will create 2 groups of 6 teams each.\nContinue?`;
    if (!confirm(confirmMsg)) return;

    try {
        const shuffledPot1 = [...clPot1Teams];
        const shuffledPot2 = [...clPot2Teams];
        for (let i = shuffledPot1.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledPot1[i], shuffledPot1[j]] = [shuffledPot1[j], shuffledPot1[i]];
        }
        for (let i = shuffledPot2.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledPot2[i], shuffledPot2[j]] = [shuffledPot2[j], shuffledPot2[i]];
        }

        const groups = { A: [], B: [] };
        // Distribute Pot 1: alternate A, B, A, B, A, B
        shuffledPot1.forEach((team, index) => {
            const groupKey = index % 2 === 0 ? 'A' : 'B';
            groups[groupKey].push({
                name: team.name,
                pot: 1,
                pts: team.pts,
                gd: team.gd,
                gf: team.gf,
                ga: team.ga,
                mp: 0,
                w: 0,
                d: 0,
                l: 0,
                gf_cl: 0,
                ga_cl: 0,
                gd_cl: 0,
                pts_cl: 0
            });
        });
        // Distribute Pot 2: alternate B, A, B, A, B, A (reverse)
        shuffledPot2.forEach((team, index) => {
            const groupKey = index % 2 === 0 ? 'B' : 'A';
            groups[groupKey].push({
                name: team.name,
                pot: 2,
                pts: team.pts,
                gd: team.gd,
                gf: team.gf,
                ga: team.ga,
                mp: 0,
                w: 0,
                d: 0,
                l: 0,
                gf_cl: 0,
                ga_cl: 0,
                gd_cl: 0,
                pts_cl: 0
            });
        });

        // Generate fixtures for 6 teams (10 matchdays)
        const groupAFixtures = generateCLFixtures(groups.A.map(t => t.name));
        const groupBFixtures = generateCLFixtures(groups.B.map(t => t.name));

        const championsData = {
            groups: groups,
            fixtures: { A: groupAFixtures, B: groupBFixtures },
            currentMatchday: 1,
            totalMatchdays: 10,
            groupStageComplete: false,
            knockout: null,
            champion: null,
            created: new Date().toISOString(),
            pot1Teams: clPot1Teams.map(t => t.name),
            pot2Teams: clPot2Teams.map(t => t.name)
        };

        await db.ref('champions_league').set(championsData);
        displayCLGroups(groups);
        document.getElementById('cl-group-results').classList.remove('hidden');
        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
        }
        showToast('🎲 Champions League draw completed successfully!');
        checkChampionsLeagueStatus();
    } catch (error) {
        console.error('Error performing draw:', error);
        alert('Error performing draw: ' + error.message);
    }
}

function generateCLFixtures(teamNames) {
    const fixtures = [];
    let id = 0;
    let teams = [...teamNames];
    const n = teams.length; // should be 6
    if (n % 2 !== 0) teams.push("BYE");
    const numTeams = teams.length;
    const halfSize = numTeams / 2;
    const numRounds = numTeams - 1; // 5 for first half, then reverse => 10 total
    // First half
    for (let round = 0; round < numRounds; round++) {
        for (let i = 0; i < halfSize; i++) {
            const home = teams[i];
            const away = teams[numTeams - 1 - i];
            if (home !== "BYE" && away !== "BYE") {
                fixtures.push({ id: id++, round: round + 1, home, away, homeScore: null, awayScore: null, played: false, cancelled: false });
            }
        }
        const last = teams.pop();
        teams.splice(1, 0, last);
    }
    // Second half (reverse fixtures)
    const firstHalfCount = fixtures.length;
    for (let i = 0; i < firstHalfCount; i++) {
        const f = fixtures[i];
        fixtures.push({ id: id++, round: f.round + numRounds, home: f.away, away: f.home, homeScore: null, awayScore: null, played: false, cancelled: false });
    }
    const totalRounds = numRounds * 2; // 10
    // Shuffle rounds for variety
    const rounds = [];
    for (let r = 1; r <= totalRounds; r++) {
        rounds.push(fixtures.filter(f => f.round === r));
    }
    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }
    const shuffledFixtures = [];
    rounds.forEach((roundFixtures, index) => {
        roundFixtures.forEach(f => {
            shuffledFixtures.push({ ...f, round: index + 1 });
        });
    });
    return shuffledFixtures;
}

function displayCLGroups(groups) {
    const container = document.getElementById('cl-groups-display');
    const groupHTML = (group, letter) => `
        <div class="bg-white rounded-xl p-4 shadow-md border-l-4 border-blue-500">
            <div class="flex items-center gap-2 mb-3">
                <span class="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">${letter}</span>
                <h4 class="text-xl font-bold text-gray-800">Group ${letter}</h4>
                <span class="text-sm text-gray-500 ml-auto">6 teams</span>
            </div>
            <div class="space-y-2">
                ${group.map((team, index) => `
                    <div class="flex items-center justify-between p-2 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} rounded-lg">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold text-gray-400 w-6">${index + 1}</span>
                            <span class="font-medium text-gray-800">${team.name}</span>
                            <span class="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Pot ${team.pot}</span>
                        </div>
                        <span class="text-sm text-gray-500">${team.pts || 0} pts (league)</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    container.innerHTML = groupHTML(groups.A, 'A') + groupHTML(groups.B, 'B');
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
        console.error('Error deleting Champions League:', error);
        alert('Error deleting: ' + error.message);
    }
}

function viewChampionsLeague() {
    window.open('champions-league-view.html', '_blank');
}

// ============== CHAMPIONS LEAGUE MANAGEMENT ==============

async function loadCLManagement() {
    const container = document.getElementById('cl-management');
    const completeMsg = document.getElementById('cl-complete-message');
    try {
        const snap = await db.ref('champions_league').once('value');
        const data = snap.val();
        if (!data) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        clGroupsData = data.groups;
        clFixturesData = data.fixtures;
        clTotalMatchdays = data.totalMatchdays || 10;
        clCurrentMatchday = data.currentMatchday || 1;

        const allFixtures = [...(clFixturesData.A || []), ...(clFixturesData.B || [])];
        const allPlayed = allFixtures.every(f => f.played);
        if (allPlayed && allFixtures.length > 0) {
            completeMsg.classList.remove('hidden');
            document.getElementById('cl-prev-matchday').disabled = true;
            document.getElementById('cl-next-matchday').disabled = true;
        } else {
            completeMsg.classList.add('hidden');
            updateNavButtons();
        }
        renderCLStandings();
        renderCLFixtures();
        updateMatchdayLabel();
    } catch (error) {
        console.error('Error loading CL management:', error);
        container.innerHTML = `<p class="text-red-600">Error loading management data: ${error.message}</p>`;
    }
}

function renderCLStandings() {
    const container = document.getElementById('cl-standings');
    if (!clGroupsData) return;
    const groups = ['A', 'B'];
    let html = '';
    groups.forEach(letter => {
        const group = clGroupsData[letter];
        if (!group) return;
        const sorted = [...group].sort((a, b) => {
            if (b.pts_cl !== a.pts_cl) return b.pts_cl - a.pts_cl;
            if (b.gd_cl !== a.gd_cl) return b.gd_cl - a.gd_cl;
            return b.gf_cl - a.gf_cl;
        });
        html += `
            <div class="bg-white rounded-xl p-4 shadow-md border-l-4 border-blue-500">
                <h4 class="text-xl font-bold text-gray-800 mb-3">Group ${letter}</h4>
                <table class="w-full text-sm">
                    <thead><tr class="text-gray-500 border-b"><th class="text-left py-1">Team</th><th class="text-center">P</th><th class="text-center">W</th><th class="text-center">D</th><th class="text-center">L</th><th class="text-center">GF</th><th class="text-center">GA</th><th class="text-center">GD</th><th class="text-center font-bold">Pts</th></tr></thead>
                    <tbody>
                        ${sorted.map((team, i) => `
                            <tr class="${i % 2 === 0 ? 'bg-gray-50' : ''}">
                                <td class="py-1 font-medium">${team.name}</td>
                                <td class="text-center">${team.mp || 0}</td>
                                <td class="text-center">${team.w || 0}</td>
                                <td class="text-center">${team.d || 0}</td>
                                <td class="text-center">${team.l || 0}</td>
                                <td class="text-center">${team.gf_cl || 0}</td>
                                <td class="text-center">${team.ga_cl || 0}</td>
                                <td class="text-center ${(team.gd_cl || 0) > 0 ? 'text-green-600' : (team.gd_cl || 0) < 0 ? 'text-red-600' : ''}">${team.gd_cl || 0}</td>
                                <td class="text-center font-bold text-blue-600">${team.pts_cl || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderCLFixtures() {
    const container = document.getElementById('cl-fixtures-list');
    if (!clFixturesData) return;
    const groups = ['A', 'B'];
    let html = '';
    groups.forEach(letter => {
        const fixtures = clFixturesData[letter] || [];
        const roundFixtures = fixtures.filter(f => f.round === clCurrentMatchday);
        if (roundFixtures.length === 0) {
            html += `<div class="text-gray-500">No fixtures for Group ${letter} this matchday.</div>`;
            return;
        }
        html += `<div class="mb-4"><h5 class="font-bold text-gray-600">Group ${letter}</h5>`;
        roundFixtures.forEach((f) => {
            const homeScore = f.played ? f.homeScore : '';
            const awayScore = f.played ? f.awayScore : '';
            html += `
                <div class="flex items-center gap-4 p-2 bg-gray-50 rounded-lg mb-1">
                    <span class="font-medium w-32 text-right">${f.home}</span>
                    <span class="text-gray-400">vs</span>
                    <span class="font-medium w-32">${f.away}</span>
                    <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center cl-score" data-fixture-id="${f.id}" data-type="home" value="${homeScore}" ${f.played ? 'disabled' : ''}>
                    <span class="text-gray-400">-</span>
                    <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center cl-score" data-fixture-id="${f.id}" data-type="away" value="${awayScore}" ${f.played ? 'disabled' : ''}>
                    ${f.played ? `<span class="text-green-600 text-sm font-bold">✅ Played</span>` : `<button onclick="saveCLMatch(${f.id})" class="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded transition">Save</button>`}
                </div>
            `;
        });
        html += `</div>`;
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
    let fixture = null;
    let group = null;
    for (const g of ['A', 'B']) {
        const f = (clFixturesData[g] || []).find(fi => fi.id === fixtureId);
        if (f) { fixture = f;
            group = g; break; }
    }
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

    const groupData = clGroupsData[group];
    const homeTeam = groupData.find(t => t.name === fixture.home);
    const awayTeam = groupData.find(t => t.name === fixture.away);
    if (homeTeam && awayTeam) {
        homeTeam.mp = (homeTeam.mp || 0) + 1;
        awayTeam.mp = (awayTeam.mp || 0) + 1;
        homeTeam.gf_cl = (homeTeam.gf_cl || 0) + homeScore;
        homeTeam.ga_cl = (homeTeam.ga_cl || 0) + awayScore;
        awayTeam.gf_cl = (awayTeam.gf_cl || 0) + awayScore;
        awayTeam.ga_cl = (awayTeam.ga_cl || 0) + homeScore;
        homeTeam.gd_cl = (homeTeam.gf_cl || 0) - (homeTeam.ga_cl || 0);
        awayTeam.gd_cl = (awayTeam.gf_cl || 0) - (awayTeam.ga_cl || 0);
        if (homeScore > awayScore) {
            homeTeam.w = (homeTeam.w || 0) + 1;
            homeTeam.pts_cl = (homeTeam.pts_cl || 0) + 3;
            awayTeam.l = (awayTeam.l || 0) + 1;
        } else if (homeScore < awayScore) {
            awayTeam.w = (awayTeam.w || 0) + 1;
            awayTeam.pts_cl = (awayTeam.pts_cl || 0) + 3;
            homeTeam.l = (homeTeam.l || 0) + 1;
        } else {
            homeTeam.d = (homeTeam.d || 0) + 1;
            awayTeam.d = (awayTeam.d || 0) + 1;
            homeTeam.pts_cl = (homeTeam.pts_cl || 0) + 1;
            awayTeam.pts_cl = (awayTeam.pts_cl || 0) + 1;
        }
    }
    try {
        await db.ref(`champions_league/fixtures/${group}/${fixture.id}`).set(fixture);
        await db.ref(`champions_league/groups/${group}`).set(groupData);
        showToast(`✅ Match saved: ${fixture.home} ${homeScore} - ${awayScore} ${fixture.away}`);
        renderCLStandings();
        renderCLFixtures();
        // Check if all matches are now played
        const allFixtures = [...(clFixturesData.A || []), ...(clFixturesData.B || [])];
        if (allFixtures.every(f => f.played)) {
            document.getElementById('cl-generate-knockout-btn').classList.remove('hidden');
            document.getElementById('cl-complete-message').classList.remove('hidden');
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
        let fixture = null;
        for (const g of ['A', 'B']) {
            const f = (clFixturesData[g] || []).find(fi => fi.id === id);
            if (f) { fixture = f; break; }
        }
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
        let fixture = null;
        for (const g of ['A', 'B']) {
            const f = (clFixturesData[g] || []).find(fi => fi.id === id);
            if (f) { fixture = f; break; }
        }
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
    if (!clGroupsData) return;
    const groups = ['A', 'B'];
    const standings = {};
    groups.forEach(g => {
        const group = clGroupsData[g];
        if (!group) return;
        const sorted = [...group].sort((a, b) => {
            if (b.pts_cl !== a.pts_cl) return b.pts_cl - a.pts_cl;
            if (b.gd_cl !== a.gd_cl) return b.gd_cl - a.gd_cl;
            return b.gf_cl - a.gf_cl;
        });
        standings[g] = sorted;
    });
    // Top 2 from each group
    const groupAWinner = standings.A[0];
    const groupARunner = standings.A[1];
    const groupBWinner = standings.B[0];
    const groupBRunner = standings.B[1];
    if (!groupAWinner || !groupARunner || !groupBWinner || !groupBRunner) {
        alert('Not enough teams to form knockout stage.');
        return;
    }
    const semiFixtures = [
        { id: 100, home: groupAWinner.name, away: groupBRunner.name, round: 'Semi-final 1', homeScore: null, awayScore: null, played: false },
        { id: 101, home: groupBWinner.name, away: groupARunner.name, round: 'Semi-final 2', homeScore: null, awayScore: null, played: false }
    ];
    const knockoutData = {
        semiFixtures: semiFixtures,
        finalFixture: { id: 102, home: null, away: null, homeScore: null, awayScore: null, played: false },
        champion: null,
        generated: true
    };
    await db.ref('champions_league/knockout').set(knockoutData);
    clKnockoutData = knockoutData;
    showToast('🏆 Knockout stage generated!');
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
    clKnockoutData = data;
    const semis = data.semiFixtures || [];
    const final = data.finalFixture;
    let semiWinners = [];
    semis.forEach(f => {
        if (f.played) {
            const winner = f.homeScore > f.awayScore ? f.home : (f.awayScore > f.homeScore ? f.away : null);
            semiWinners.push({ fixture: f, winner });
        } else {
            semiWinners.push({ fixture: f, winner: null });
        }
    });
    if (semiWinners.every(s => s.winner !== null) && final && !final.played) {
        final.home = semiWinners[0].winner;
        final.away = semiWinners[1].winner;
        await db.ref('champions_league/knockout/finalFixture').set(final);
        clKnockoutData.finalFixture = final;
    }
    bracketContainer.innerHTML = `
        <div class="bg-white p-4 rounded-xl shadow">
            <h5 class="font-bold text-gray-700 mb-2">Semi-finals</h5>
            ${semis.map((f, i) => `
                <div class="flex items-center gap-2 p-2 border-b">
                    <span class="font-medium">${f.home}</span>
                    <span class="text-gray-400">vs</span>
                    <span class="font-medium">${f.away}</span>
                    ${f.played ? `<span class="ml-auto font-bold text-blue-600">${f.homeScore} - ${f.awayScore}</span>` : `<span class="ml-auto text-gray-400">⏳</span>`}
                    ${f.played ? (semiWinners[i].winner ? `🏆 ${semiWinners[i].winner}` : '') : ''}
                </div>
            `).join('')}
        </div>
        <div class="bg-white p-4 rounded-xl shadow">
            <h5 class="font-bold text-gray-700 mb-2">Final</h5>
            ${final ? `
                <div class="flex items-center gap-2 p-2 border-b">
                    <span class="font-medium">${final.home || '?'}</span>
                    <span class="text-gray-400">vs</span>
                    <span class="font-medium">${final.away || '?'}</span>
                    ${final.played ? `<span class="ml-auto font-bold text-blue-600">${final.homeScore} - ${final.awayScore}</span>` : `<span class="ml-auto text-gray-400">⏳</span>`}
                    ${final.played ? (data.champion ? `🏆 ${data.champion}` : '') : ''}
                </div>
            ` : '<p class="text-gray-500">Waiting for semi-final results.</p>'}
        </div>
    `;
    let fixturesHtml = '';
    const allKoFixtures = [...semis, final].filter(f => f);
    allKoFixtures.forEach(f => {
        const isPlayed = f.played;
        fixturesHtml += `
            <div class="flex items-center gap-4 p-2 bg-gray-50 rounded-lg mb-2">
                <span class="font-medium w-32 text-right">${f.home || 'TBD'}</span>
                <span class="text-gray-400">vs</span>
                <span class="font-medium w-32">${f.away || 'TBD'}</span>
                <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center ko-score" data-fixture-id="${f.id}" data-type="home" value="${f.played ? f.homeScore : ''}" ${isPlayed ? 'disabled' : ''}>
                <span class="text-gray-400">-</span>
                <input type="number" min="0" max="99" class="w-12 border rounded px-1 py-0.5 text-center ko-score" data-fixture-id="${f.id}" data-type="away" value="${f.played ? f.awayScore : ''}" ${isPlayed ? 'disabled' : ''}>
                ${isPlayed ? `<span class="text-green-600 text-sm font-bold">✅ Played</span>` : `<button onclick="saveKOMatch(${f.id})" class="bg-blue-500 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded transition">Save</button>`}
            </div>
        `;
    });
    fixturesContainer.innerHTML = fixturesHtml;
    if (data.champion) {
        championDisplay.classList.remove('hidden');
        document.getElementById('cl-champion-name').textContent = data.champion;
    } else {
        championDisplay.classList.add('hidden');
    }
}

async function saveKOMatch(fixtureId) {
    let fixture = null;
    let type = '';
    if (clKnockoutData.semiFixtures.some(f => f.id === fixtureId)) {
        fixture = clKnockoutData.semiFixtures.find(f => f.id === fixtureId);
        type = 'semiFixtures';
    } else if (clKnockoutData.finalFixture && clKnockoutData.finalFixture.id === fixtureId) {
        fixture = clKnockoutData.finalFixture;
        type = 'finalFixture';
    } else {
        alert('Fixture not found!');
        return;
    }
    const homeInput = document.querySelector(`.ko-score[data-fixture-id="${fixtureId}"][data-type="home"]`);
    const awayInput = document.querySelector(`.ko-score[data-fixture-id="${fixtureId}"][data-type="away"]`);
    if (!homeInput || !awayInput) return;
    const homeScore = parseInt(homeInput.value);
    const awayScore = parseInt(awayInput.value);
    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
        alert('Please enter valid scores.');
        return;
    }
    fixture.homeScore = homeScore;
    fixture.awayScore = awayScore;
    fixture.played = true;

    if (type === 'semiFixtures') {
        const semis = clKnockoutData.semiFixtures;
        const allSemisPlayed = semis.every(f => f.played);
        if (allSemisPlayed) {
            const winners = semis.map(f => f.homeScore > f.awayScore ? f.home : (f.awayScore > f.homeScore ? f.away : null));
            if (winners.every(w => w !== null)) {
                const final = clKnockoutData.finalFixture;
                final.home = winners[0];
                final.away = winners[1];
                await db.ref('champions_league/knockout/finalFixture').set(final);
                clKnockoutData.finalFixture = final;
            }
        }
    }
    if (type === 'finalFixture' && fixture.played) {
        const champion = fixture.homeScore > fixture.awayScore ? fixture.home : (fixture.awayScore > fixture.homeScore ? fixture.away : null);
        if (champion) {
            await db.ref('champions_league/knockout/champion').set(champion);
            clKnockoutData.champion = champion;
            await db.ref('champions_league/champion').set(champion);
        }
    }
    await db.ref(`champions_league/knockout/${type}`).set(fixture);
    showToast(`✅ Knockout match saved!`);
    renderKnockoutStage();
}

// ============== UTILITY FUNCTIONS ==============
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md whitespace-pre-line';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Expose globals
window.processPromotionRelegation = processPromotionRelegation;
window.performGroupDraw = performGroupDraw;
window.viewChampionsLeague = viewChampionsLeague;
window.deleteChampionsLeague = deleteChampionsLeague;
window.switchTab = switchTab;
window.changeCLMatchday = changeCLMatchday;
window.saveCLMatch = saveCLMatch;
window.saveAllCLMatches = saveAllCLMatches;
window.simulateCLMatchday = simulateCLMatchday;
window.generateKnockoutStage = generateKnockoutStage;
window.saveKOMatch = saveKOMatch;