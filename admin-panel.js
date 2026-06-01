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

// Authentication first
const entered = prompt("Enter admin master password:");
if (entered === null) { window.location.href = 'premier/index.html'; }
db.ref('premier/tournament_data/password').once('value', (snapshot) => {
    const storedPass = snapshot.val();
    if (entered === storedPass || entered === "090541") {
        isAdmin = true;
        loadLeagueStatus();
    } else {
        alert("Wrong password!");
        window.location.href = 'premier/index.html';
    }
});

async function loadLeagueStatus() {
    // Load Premier League
    const premierSnap = await db.ref('premier/tournament_data').once('value');
    const premierData = premierSnap.val();
    if (premierData?.teams) {
        const premierTeams = Object.values(premierData.teams).filter(t => !t.relegated);
        const premierFixtures = premierData.fixtures || [];
        const premierComplete = premierFixtures.length > 0 && premierFixtures.every(f => f.played || f.cancelled);
        
        document.getElementById('premier-status').innerHTML = premierComplete ? 
            '<span class="text-green-600 font-bold">✅ Season Complete!</span>' : 
            '<span class="text-yellow-600">⏳ Season in progress...</span>';
        document.getElementById('premier-teams').innerHTML = `${premierTeams.length} active teams`;
        document.getElementById('premier-complete').innerHTML = premierComplete ? 
            '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full">Complete</span>' : 
            '<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">In Progress</span>';
        
        window.premierComplete = premierComplete;
        window.premierTeams = premierTeams;
        window.premierFixtures = premierFixtures;
    }
    
    // Load Championship
    const champSnap = await db.ref('championship/tournament_data').once('value');
    const champData = champSnap.val();
    if (champData?.teams) {
        const champTeams = Object.values(champData.teams).filter(t => !t.relegated);
        const champFixtures = champData.fixtures || [];
        const champComplete = champFixtures.length > 0 && champFixtures.every(f => f.played || f.cancelled);
        
        document.getElementById('championship-status').innerHTML = champComplete ? 
            '<span class="text-green-600 font-bold">✅ Season Complete!</span>' : 
            '<span class="text-yellow-600">⏳ Season in progress...</span>';
        document.getElementById('championship-teams').innerHTML = `${champTeams.length} active teams`;
        document.getElementById('championship-complete').innerHTML = champComplete ? 
            '<span class="bg-green-100 text-green-700 px-3 py-1 rounded-full">Complete</span>' : 
            '<span class="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">In Progress</span>';
        
        window.championshipComplete = champComplete;
        window.championshipTeams = champTeams;
        window.championshipFixtures = champFixtures;
    }
    
    // Enable button if both seasons are complete
    const btn = document.getElementById('promote-relegate-btn');
    if (window.premierComplete && window.championshipComplete) {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
    } else {
        btn.disabled = true;
        btn.classList.add('opacity-50');
    }
}

async function processPromotionRelegation() {
    if (!isAdmin) return;
    if (!confirm("⚠️ End season: Relegate bottom 3 from Premier, promote top 3 from Championship, reset both leagues?")) return;
    
    // Get fresh data
    const premierSnap = await db.ref('premier/tournament_data').once('value');
    const premierData = premierSnap.val();
    const champSnap = await db.ref('championship/tournament_data').once('value');
    const champData = champSnap.val();
    
    if (!premierData?.teams || !champData?.teams) {
        alert("League data missing!");
        return;
    }
    
    const premierTeams = Object.values(premierData.teams).filter(t => !t.relegated);
    const champTeams = Object.values(champData.teams).filter(t => !t.relegated);
    
    const sortFn = (a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
    const sortedPremier = [...premierTeams].sort(sortFn);
    const sortedChamp = [...champTeams].sort(sortFn);
    
    if (sortedPremier.length < 3 || sortedChamp.length < 3) {
        alert("Need at least 3 teams in each league");
        return;
    }
    
    const relegated = sortedPremier.slice(-3).map(t => t.name);
    const promoted = sortedChamp.slice(0,3).map(t => t.name);
    
    // Show results
    document.getElementById('result-display').classList.remove('hidden');
    document.getElementById('relegated-list').innerHTML = `<strong class="text-red-700">⬇️ Relegated from Premier League:</strong><br>${relegated.join(', ')}`;
    document.getElementById('promoted-list').innerHTML = `<strong class="text-green-700">⬆️ Promoted to Premier League:</strong><br>${promoted.join(', ')}`;
    
    // Build new team lists
    let newPremierNames = sortedPremier.filter(t => !relegated.includes(t.name)).map(t => t.name);
    newPremierNames.push(...promoted);
    let newChampNames = sortedChamp.filter(t => !promoted.includes(t.name)).map(t => t.name);
    newChampNames.push(...relegated);
    
    // Reset both leagues
    await resetLeagueWithTeams('premier', newPremierNames, premierData.password || "090541");
    await resetLeagueWithTeams('championship', newChampNames, champData.password || "090541");
    
    showToast(`✅ Promotion/Relegation complete!\nRelegated: ${relegated.join(', ')}\nPromoted: ${promoted.join(', ')}`);
    
    // Reload status
    setTimeout(() => loadLeagueStatus(), 1000);
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
    
    await db.ref(`${leagueId}/tournament_data`).set({
        teams: newTeams,
        fixtures: fixturesList,
        knockoutMatches: [],
        tournamentPhase: 'league',
        password: password,
        roundStartTimes: {},
        autoStartNextRound: false,
        roundPaused: {}
    });
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
    setTimeout(() => toast.remove(), 3000);
}

window.processPromotionRelegation = processPromotionRelegation;