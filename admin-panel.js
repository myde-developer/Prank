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
let clPot1Teams = []; // Premier League Top 5
let clPot2Teams = []; // Championship Top 5

// Admin authentication
const entered = prompt("Enter admin master password:");
if (entered === null) { window.location.href = '../premier/index.html'; }
db.ref('premier/tournament_data/password').once('value', (snapshot) => {
    const storedPass = snapshot.val();
    if (entered === storedPass || entered === "090541") {
        isAdmin = true;
        loadAllLeagueStatus();
        checkChampionsLeagueStatus();
    } else {
        alert("Wrong password!");
        window.location.href = '../premier/index.html';
    }
});

// ============== TAB SWITCHING ==============
function switchTab(tab) {
    // Update tabs
    document.querySelectorAll('.nav-tab').forEach(el => {
        el.classList.remove('active', 'bg-indigo-600', 'text-white');
        el.classList.add('bg-gray-200', 'text-gray-700');
    });
    const activeTab = document.getElementById(`tab-${tab}`);
    activeTab.classList.remove('bg-gray-200', 'text-gray-700');
    activeTab.classList.add('active', 'bg-indigo-600', 'text-white');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-content-${tab}`).classList.remove('hidden');
    
    if (tab === 'champions') {
        checkChampionsLeagueStatus();
    }
}

// ============== LEAGUE MANAGEMENT ==============
async function loadAllLeagueStatus() {
    // Load Premier
    const premierSnap = await db.ref('premier/tournament_data').once('value');
    const premierData = premierSnap.val();
    let premierComplete = false, premierTeams = [], premierFixtures = [];
    
    if (premierData?.teams) {
        premierTeams = Object.values(premierData.teams).filter(t => !t.relegated);
        premierFixtures = premierData.fixtures || [];
        const totalRounds = premierData.fixtures ? Math.max(...premierData.fixtures.map(f => f.round)) : 0;
        const halfRounds = Math.floor(totalRounds / 2);
        
        const firstHalfFixtures = premierFixtures.filter(f => f.round <= halfRounds);
        const premierHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        premierComplete = premierFixtures.length > 0 && premierFixtures.every(f => f.played || f.cancelled);
        updateUI('premier', premierComplete, premierTeams.length);
        
        // Store for CL
        const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...premierTeams].sort(sortFn);
        clPot1Teams = sorted.slice(0, 5);
        displayCLPots('cl-pot1-teams', clPot1Teams, 'Premier League');
    } else {
        updateUI('premier', false, 0);
    }

    // Load Championship
    const champSnap = await db.ref('championship/tournament_data').once('value');
    const champData = champSnap.val();
    let champComplete = false, champTeams = [], champFixtures = [];
    
    if (champData?.teams) {
        champTeams = Object.values(champData.teams).filter(t => !t.relegated);
        champFixtures = champData.fixtures || [];
        const totalRounds = champData.fixtures ? Math.max(...champData.fixtures.map(f => f.round)) : 0;
        const halfRounds = Math.floor(totalRounds / 2);
        
        const firstHalfFixtures = champFixtures.filter(f => f.round <= halfRounds);
        const champHalfComplete = firstHalfFixtures.length > 0 && firstHalfFixtures.every(f => f.played || f.cancelled);
        champComplete = champFixtures.length > 0 && champFixtures.every(f => f.played || f.cancelled);
        updateUI('championship', champComplete, champTeams.length);
        
        // Store for CL
        const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
        const sorted = [...champTeams].sort(sortFn);
        clPot2Teams = sorted.slice(0, 5);
        displayCLPots('cl-pot2-teams', clPot2Teams, 'Championship');
    } else {
        updateUI('championship', false, 0);
    }

    // Store globally
    window.premierComplete = premierComplete;
    window.premierTeams = premierTeams;
    window.premierData = premierData;
    window.championshipComplete = champComplete;
    window.championshipTeams = champTeams;
    window.championshipData = champData;

    // Enable promotion/relegation button only if both leagues are complete
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

    const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
    const sortedPremier = [...premierTeams].sort(sortFn);
    const sortedChamp = [...champTeams].sort(sortFn);

    const relegatedFromPremier = sortedPremier.slice(-3).map(t => t.name);
    const promotedToPremier = sortedChamp.slice(0,3).map(t => t.name);
    const bottomThreeChampStay = sortedChamp.slice(-3).map(t => t.name);

    // Build new team lists
    let newPremierNames = sortedPremier.filter(t => !relegatedFromPremier.includes(t.name)).map(t => t.name);
    newPremierNames.push(...promotedToPremier);

    let newChampNames = sortedChamp.filter(t => !promotedToPremier.includes(t.name)).map(t => t.name);
    newChampNames.push(...relegatedFromPremier);

    // Display results
    document.getElementById('result-display').classList.remove('hidden');
    document.getElementById('relegated-from-premier').innerHTML = `<strong class="text-red-700">⬇️ Relegated from Premier League:</strong><br>${relegatedFromPremier.join(', ') || 'none'}`;
    document.getElementById('promoted-to-premier').innerHTML = `<strong class="text-green-700">⬆️ Promoted to Premier League:</strong><br>${promotedToPremier.join(', ')}`;
    document.getElementById('championship-bottom-stay').innerHTML = `<strong class="text-blue-700">🔄 Remain in Championship:</strong><br>${bottomThreeChampStay.join(', ')}`;
    document.getElementById('relegated-from-championship').innerHTML = `<strong class="text-gray-700">ℹ️ No teams relegated from Championship (bottom 3 stay).</strong>`;

    // Reset leagues with new squads
    const premierPass = window.premierData?.password || "090541";
    const champPass = window.championshipData?.password || "090541";

    await resetLeagueWithTeams('premier', newPremierNames, premierPass);
    await resetLeagueWithTeams('championship', newChampNames, champPass);

    showToast(`✅ Promotion/Relegation complete!\n\nPremier: ${relegatedFromPremier.join(', ')} out | ${promotedToPremier.join(', ')} in\nChampionship: ${promotedToPremier.join(', ')} promoted out | ${relegatedFromPremier.join(', ')} in\nBottom 3 (${bottomThreeChampStay.join(', ')}) remain.`);

    setTimeout(() => loadAllLeagueStatus(), 2000);
}

async function resetLeagueWithTeams(leagueId, teamNames, password) {
    let finalNames = [...teamNames];
    if (finalNames.length % 2 !== 0) finalNames.push("BYE");
    
    const newTeams = {};
    finalNames.forEach(name => {
        if (name !== "BYE") {
            newTeams[name] = { name, mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0, deductedPoints:0, formHistory:[], relegated:false };
        }
    });
    
    const teamNameList = Object.keys(newTeams);
    const rounds = generateRandomRoundRobin(teamNameList);
    let fixturesList = [], id = 0;
    rounds.forEach((round, idx) => {
        round.forEach(({home, away}) => {
            fixturesList.push({ id: id++, round: idx+1, home, away, homeScore:null, awayScore:null, played:false, cancelled:false, comment:null, predictions:[], banter:[], events:[], report:null, deadline:null });
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

// ============== CHAMPIONS LEAGUE ==============
async function checkChampionsLeagueStatus() {
    const statusEl = document.getElementById('cl-status-message');
    const btn = document.getElementById('champions-league-btn');
    
    try {
        // Check if Champions League already exists
        const clSnap = await db.ref('champions_league').once('value');
        const clData = clSnap.val();
        
        if (clData) {
            document.getElementById('cl-existing').classList.remove('hidden');
            document.getElementById('cl-existing-data').innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="font-bold text-green-700">✅ Champions League Active</p>
                        <p class="text-sm text-gray-600">Created: ${new Date(clData.created).toLocaleDateString()}</p>
                        <p class="text-sm text-gray-600">Groups: A & B (5 teams each)</p>
                        <p class="text-sm text-gray-600">Status: ${clData.groupStageComplete ? 'Complete' : 'In Progress'}</p>
                    </div>
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="font-bold text-gray-700">Qualifiers</p>
                        <p class="text-sm text-gray-600">Premier: ${(clData.pot1Teams || []).join(', ')}</p>
                        <p class="text-sm text-gray-600">Championship: ${(clData.pot2Teams || []).join(', ')}</p>
                    </div>
                </div>
            `;
            statusEl.innerHTML = `
                <div class="text-green-600 font-bold text-xl">🌟 Champions League is active!</div>
                <p class="text-gray-600 mt-2">You can view the tournament or create a new one (this will overwrite the current).</p>
            `;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🔄 Regenerate Champions League Draw';
            return;
        }
        
        // Check if first half of both leagues is complete
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
            statusEl.innerHTML = `
                <div class="text-green-600 font-bold text-xl">✅ First half of both leagues complete!</div>
                <p class="text-gray-600 mt-2">${clPot1Teams.length} teams in Pot 1 (Premier) | ${clPot2Teams.length} teams in Pot 2 (Championship)</p>
            `;
            btn.disabled = false;
            btn.classList.remove('opacity-50');
            btn.textContent = '🎲 Perform Champions League Draw';
        } else {
            let missing = [];
            if (!premierHalfComplete) missing.push('Premier League');
            if (!champHalfComplete) missing.push('Championship');
            statusEl.innerHTML = `
                <div class="text-yellow-600 font-bold text-xl">⏳ Waiting for first half to complete</div>
                <p class="text-gray-600 mt-2">Complete the first half of: ${missing.join(' and ')}</p>
            `;
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
    
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const positionClasses = ['border-l-4 border-yellow-400', 'border-l-4 border-gray-300', 'border-l-4 border-amber-600', 'border-l-4 border-blue-400', 'border-l-4 border-green-400'];
    
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
    if (clPot1Teams.length < 5 || clPot2Teams.length < 5) {
        alert('Need exactly 5 teams in each pot to perform the draw.');
        return;
    }
    
    const confirmMsg = `🎲 CHAMPIONS LEAGUE GROUP DRAW\n\n` +
        `Pot 1 (Premier League):\n${clPot1Teams.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\n` +
        `Pot 2 (Championship):\n${clPot2Teams.map(t => `  - ${t.name} (${t.pts} pts)`).join('\n')}\n\n` +
        `This will create 2 groups of 5 teams each.\nEach group gets teams from both pots.\n${clPot1Teams.length + clPot2Teams.length} teams total.\nContinue?`;
    
    if (!confirm(confirmMsg)) return;
    
    try {
        // Shuffle both pots
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
        
        // Create groups (real Champions League style: alternate pots)
        const groups = {
            A: [],
            B: []
        };
        
        // Distribute Pot 1 teams (one to each group alternately)
        shuffledPot1.forEach((team, index) => {
            const groupKey = index % 2 === 0 ? 'A' : 'B';
            groups[groupKey].push({
                name: team.name,
                pot: 1,
                pts: team.pts,
                gd: team.gd,
                gf: team.gf,
                ga: team.ga,
                mp: 0, w: 0, d: 0, l: 0, 
                gf_cl: 0, ga_cl: 0, gd_cl: 0, pts_cl: 0
            });
        });
        
        // Distribute Pot 2 teams (one to each group alternately, reverse order for fairness)
        shuffledPot2.forEach((team, index) => {
            const groupKey = index % 2 === 0 ? 'B' : 'A';
            groups[groupKey].push({
                name: team.name,
                pot: 2,
                pts: team.pts,
                gd: team.gd,
                gf: team.gf,
                ga: team.ga,
                mp: 0, w: 0, d: 0, l: 0,
                gf_cl: 0, ga_cl: 0, gd_cl: 0, pts_cl: 0
            });
        });
        
        // Generate fixtures for each group (double round-robin)
        const groupAFixtures = generateCLFixtures(groups.A.map(t => t.name));
        const groupBFixtures = generateCLFixtures(groups.B.map(t => t.name));
        
        // Save to Firebase
        const championsData = {
            groups: groups,
            fixtures: {
                A: groupAFixtures,
                B: groupBFixtures
            },
            currentMatchday: 1,
            totalMatchdays: 8,
            groupStageComplete: false,
            knockoutMatches: [],
            champion: null,
            created: new Date().toISOString(),
            pot1Teams: clPot1Teams.map(t => t.name),
            pot2Teams: clPot2Teams.map(t => t.name)
        };
        
        await db.ref('champions_league').set(championsData);
        
        // Display results
        displayCLGroups(groups);
        document.getElementById('cl-group-results').classList.remove('hidden');
        
        // Confetti celebration
        if (typeof confetti !== 'undefined') {
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 }
            });
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
    const n = teams.length;
    
    // Add BYE if odd number
    if (n % 2 !== 0) {
        teams.push("BYE");
    }
    const numTeams = teams.length;
    const halfSize = numTeams / 2;
    const numRounds = numTeams - 1;
    
    // Generate first half
    for (let round = 0; round < numRounds; round++) {
        for (let i = 0; i < halfSize; i++) {
            const home = teams[i];
            const away = teams[numTeams - 1 - i];
            if (home !== "BYE" && away !== "BYE") {
                fixtures.push({
                    id: id++,
                    round: round + 1,
                    home: home,
                    away: away,
                    homeScore: null,
                    awayScore: null,
                    played: false,
                    cancelled: false
                });
            }
        }
        // Rotate
        const last = teams.pop();
        teams.splice(1, 0, last);
    }
    
    // Generate second half (reverse fixtures)
    const firstHalfCount = fixtures.length;
    for (let i = 0; i < firstHalfCount; i++) {
        const f = fixtures[i];
        fixtures.push({
            id: id++,
            round: f.round + numRounds,
            home: f.away,
            away: f.home,
            homeScore: null,
            awayScore: null,
            played: false,
            cancelled: false
        });
    }
    
    // Shuffle rounds for variety
    const totalRounds = numRounds * 2;
    const rounds = [];
    for (let r = 1; r <= totalRounds; r++) {
        rounds.push(fixtures.filter(f => f.round === r));
    }
    for (let i = rounds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rounds[i], rounds[j]] = [rounds[j], rounds[i]];
    }
    
    // Reassign round numbers
    const shuffledFixtures = [];
    rounds.forEach((roundFixtures, index) => {
        roundFixtures.forEach(f => {
            shuffledFixtures.push({
                ...f,
                round: index + 1
            });
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
                <span class="text-sm text-gray-500 ml-auto">5 teams</span>
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
        checkChampionsLeagueStatus();
    } catch (error) {
        console.error('Error deleting Champions League:', error);
        alert('Error deleting: ' + error.message);
    }
}

function viewChampionsLeague() {
    window.open('champions-league.html', '_blank');
}

// ============== UTILITY FUNCTIONS ==============
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md whitespace-pre-line';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Expose functions globally
window.processPromotionRelegation = processPromotionRelegation;
window.performGroupDraw = performGroupDraw;
window.viewChampionsLeague = viewChampionsLeague;
window.deleteChampionsLeague = deleteChampionsLeague;
window.switchTab = switchTab;