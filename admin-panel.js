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

// Admin authentication
const entered = prompt("Enter admin master password:");
if (entered === null) { window.location.href = '../premier/index.html'; }
// Check premier league password as master (or fallback)
db.ref('premier/tournament_data/password').once('value', (snapshot) => {
    const storedPass = snapshot.val();
    if (entered === storedPass || entered === "090541") {
        isAdmin = true;
        loadAllLeagueStatus();
    } else {
        alert("Wrong password!");
        window.location.href = '../premier/index.html';
    }
});

async function loadAllLeagueStatus() {
    // Load Premier
    const premierSnap = await db.ref('premier/tournament_data').once('value');
    const premierData = premierSnap.val();
    let premierComplete = false, premierTeams = [], premierFixtures = [];
    if (premierData?.teams) {
        premierTeams = Object.values(premierData.teams).filter(t => !t.relegated);
        premierFixtures = premierData.fixtures || [];
        premierComplete = premierFixtures.length > 0 && premierFixtures.every(f => f.played || f.cancelled);
        updateUI('premier', premierComplete, premierTeams.length);
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
        champComplete = champFixtures.length > 0 && champFixtures.every(f => f.played || f.cancelled);
        updateUI('championship', champComplete, champTeams.length);
    } else {
        updateUI('championship', false, 0);
    }

    // Load Ligue 1
    const ligue1Snap = await db.ref('ligue1/tournament_data').once('value');
    const ligue1Data = ligue1Snap.val();
    let ligue1Complete = false, ligue1Teams = [], ligue1Fixtures = [];
    if (ligue1Data?.teams) {
        ligue1Teams = Object.values(ligue1Data.teams).filter(t => !t.relegated);
        ligue1Fixtures = ligue1Data.fixtures || [];
        ligue1Complete = ligue1Fixtures.length > 0 && ligue1Fixtures.every(f => f.played || f.cancelled);
        updateUI('ligue1', ligue1Complete, ligue1Teams.length);
    } else {
        updateUI('ligue1', false, 0);
    }

    // Store globally
    window.premierComplete = premierComplete;
    window.premierTeams = premierTeams;
    window.premierData = premierData;
    window.championshipComplete = champComplete;
    window.championshipTeams = champTeams;
    window.championshipData = champData;
    window.ligue1Complete = ligue1Complete;
    window.ligue1Teams = ligue1Teams;
    window.ligue1Data = ligue1Data;

    // Enable button only if all three leagues are complete
    const btn = document.getElementById('promote-relegate-btn');
    if (premierComplete && champComplete && ligue1Complete) {
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

async function processPromotionRelegation() {
    if (!isAdmin) return;
    if (!confirm("⚠️ END ALL SEASONS? This will:\n- Relegate bottom 3 from Premier to Championship\n- Promote top 3 from Championship to Premier\n- Relegate bottom 3 from Championship to Ligue 1\n- Promote top 3 from Ligue 1 to Championship\n\nAll leagues will be reset with new squads. Continue?")) return;

    // Get fresh data from globals (already loaded)
    let premierTeams = window.premierTeams;
    let champTeams = window.championshipTeams;
    let ligue1Teams = window.ligue1Teams;

    if (premierTeams.length < 3 || champTeams.length < 6 || ligue1Teams.length < 3) {
        alert("Need at least 3 teams in Premier, 6 in Championship, 3 in Ligue 1 to process.");
        return;
    }

    const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
    const sortedPremier = [...premierTeams].sort(sortFn);
    const sortedChamp = [...champTeams].sort(sortFn);
    const sortedLigue1 = [...ligue1Teams].sort(sortFn);

    const relegatedFromPremier = sortedPremier.slice(-3).map(t => t.name);
    const promotedToPremier = sortedChamp.slice(0,3).map(t => t.name);
    const relegatedFromChamp = sortedChamp.slice(-3).map(t => t.name);
    const promotedToChamp = sortedLigue1.slice(0,3).map(t => t.name);

    // Build new team lists
    let newPremierNames = sortedPremier.filter(t => !relegatedFromPremier.includes(t.name)).map(t => t.name);
    newPremierNames.push(...promotedToPremier);

    let newChampNames = sortedChamp.filter(t => !promotedToPremier.includes(t.name) && !relegatedFromChamp.includes(t.name)).map(t => t.name);
    newChampNames.push(...relegatedFromPremier);
    newChampNames.push(...promotedToChamp);

    let newLigue1Names = sortedLigue1.filter(t => !promotedToChamp.includes(t.name)).map(t => t.name);
    newLigue1Names.push(...relegatedFromChamp);

    // Display results
    document.getElementById('result-display').classList.remove('hidden');
    document.getElementById('relegated-from-premier').innerHTML = `<strong class="text-red-700">⬇️ Relegated from Premier League:</strong><br>${relegatedFromPremier.join(', ') || 'none'}`;
    document.getElementById('promoted-to-premier').innerHTML = `<strong class="text-green-700">⬆️ Promoted to Premier League:</strong><br>${promotedToPremier.join(', ')}`;
    document.getElementById('relegated-from-championship').innerHTML = `<strong class="text-red-700">⬇️ Relegated from Championship:</strong><br>${relegatedFromChamp.join(', ')}`;
    document.getElementById('promoted-to-championship').innerHTML = `<strong class="text-green-700">⬆️ Promoted to Championship:</strong><br>${promotedToChamp.join(', ')}`;
    document.getElementById('promoted-from-ligue1').innerHTML = `<strong class="text-green-700">⬆️ Promoted from Ligue 1:</strong><br>${promotedToChamp.join(', ')}`;

    // Reset leagues with new squads
    const premierPass = window.premierData?.password || "090541";
    const champPass = window.championshipData?.password || "090541";
    const ligue1Pass = window.ligue1Data?.password || "090541";

    await resetLeagueWithTeams('premier', newPremierNames, premierPass);
    await resetLeagueWithTeams('championship', newChampNames, champPass);
    await resetLeagueWithTeams('ligue1', newLigue1Names, ligue1Pass);

    showToast(`✅ Promotion/Relegation complete!\n\nPremier: ${relegatedFromPremier.join(', ')} out | ${promotedToPremier.join(', ')} in\nChampionship: ${relegatedFromChamp.join(', ')} out | ${promotedToChamp.join(', ')} in\nLigue 1: ${promotedToChamp.join(', ')} promoted`);

    // Reload status after 2 seconds
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
    
    // Preserve releasedGameweeks? We'll reset to GW1 released.
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

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Expose function globally
window.processPromotionRelegation = processPromotionRelegation;