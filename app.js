/**
 * DLS Premier League - Main Application Logic Controller
 * Cloud Synced Backend Structure: Firebase Realtime Database
 */

// ==========================================
// PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyBmy0tmvaYcw9KsQQRH7RLKcXC8EN6WFqY",
    authDomain: "dls-premier-league.firebaseapp.com",
    projectId: "dls-premier-league",
    storageBucket: "dls-premier-league.appspot.com",
    messagingSenderId: "975087030284",
    appId: "1:975087030284:web:7708718fffd9180c009e29",
    measurementId: "G-Q2C6TKNRHE"
  };

// Initialize Firebase Core Engine Instance
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let teams = {};
let fixtures = [];
let currentSelectedRound = 1; 
let isAdmin = false; 
let tournamentPassword = "1234"; 
let newsHeadlines = [];
let temporaryUploadedLogos = {};

// Helper: Generates high-fidelity professional text-based badges or renders custom image uploads
function getTeamBadgeHtml(teamKey) {
    const team = teams[teamKey];
    if (team && team.logoData && team.logoData.trim() !== "") {
        return `<img src="${team.logoData}" alt="${team.name}" class="w-4 h-4 object-cover inline shrink-0 rounded-full border border-slate-700">`;
    }
    const firstLetter = teamKey ? teamKey.slice(0, 2).toUpperCase() : '??';
    return `<div class="w-5 h-4 flex items-center justify-center rounded bg-[#1e293b] text-[9px] font-mono font-bold text-slate-400 shrink-0 border border-slate-700 uppercase tracking-tighter">${firstLetter}</div>`;
}

// Global Sync Module: Writes state array mutations instantly into the Cloud Database Tree
function saveToStorage() {
    db.ref('tournament_data').set({
        teams: teams,
        fixtures: fixtures,
        password: tournamentPassword,
        headlines: newsHeadlines
    });
}

// REAL-TIME STREAM LISTENERS: Fires instantly for EVERY viewer whenever data transforms in the cloud
function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.password) tournamentPassword = data.password;
            
            if (data.headlines) {
                newsHeadlines = data.headlines;
                updateTickerDisplay();
            }
            
            if (data.teams && data.fixtures) {
                teams = data.teams;
                fixtures = data.fixtures;
                
                // Keep view anchored to screen context components
                document.getElementById('setup-section').classList.add('hidden');
                document.getElementById('dashboard-section').classList.remove('hidden');
                document.getElementById('admin-toggle-container').classList.remove('hidden');
                
                updateTableCalculations();
                renderTable();
                renderGameweekTabs();
                renderFixtures();
            }
        } else {
            // Database is totally empty: default fallback cleanly brings up setup wizard
            document.getElementById('setup-section').classList.remove('hidden');
            document.getElementById('dashboard-section').classList.add('hidden');
            document.getElementById('news-ticker').innerHTML = "Notice: Ready for system registry generation.";
        }
    });
}

// Admin Switch Handlers
function handleAdminToggleClick() {
    if (!isAdmin) {
        document.getElementById('admin-password-input').value = "";
        document.getElementById('password-error').classList.add('hidden');
        document.getElementById('password-modal').classList.remove('hidden');
        document.getElementById('admin-password-input').focus();
    } else {
        deactivateAdminMode();
    }
}

function closePasswordModal() { document.getElementById('password-modal').classList.add('hidden'); }

function verifyAdminPassword() {
    const inputVal = document.getElementById('admin-password-input').value;
    if (inputVal === tournamentPassword) {
        closePasswordModal();
        activateAdminMode();
    } else {
        document.getElementById('password-error').classList.remove('hidden');
    }
}

function activateAdminMode() { isAdmin = true; updateAdminUIElements(); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); }

function updateAdminUIElements() {
    const btn = document.getElementById('admin-btn');
    const dot = document.getElementById('admin-btn-dot');
    const statusText = document.getElementById('admin-status-text');
    const resetContainer = document.getElementById('admin-reset-container');
    const thActions = document.getElementById('th-admin-actions');
    const hint = document.getElementById('admin-table-hint');

    if (isAdmin) {
        btn.classList.replace('bg-slate-700', 'bg-indigo-600');
        dot.classList.replace('translate-x-0', 'translate-x-5');
        statusText.innerText = "⚡ ADMIN SYSTEM ACCESS UNLOCKED";
        statusText.classList.replace('text-slate-400', 'text-indigo-400');
        resetContainer.classList.remove('hidden');
        thActions.classList.remove('hidden');
        hint.classList.remove('hidden');
    } else {
        btn.classList.replace('bg-indigo-600', 'bg-slate-700');
        dot.classList.replace('translate-x-5', 'translate-x-0');
        statusText.innerText = "🔒 READ ONLY MODE";
        statusText.classList.replace('text-indigo-400', 'text-slate-400');
        resetContainer.classList.add('hidden');
        thActions.classList.add('hidden');
        hint.classList.add('hidden');
    }
    renderTable();
    renderFixtures();
}

// Setup Component Logic Modules
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Invalid entry count context."); return; }

    const container = document.getElementById('team-inputs-container');
    container.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="bg-[#070a12] p-3 rounded-lg border border-slate-800 space-y-2">
                <div class="flex items-center border border-slate-800 bg-[#0f1524]/40 rounded-lg overflow-hidden">
                    <span class="bg-[#0f1524] text-slate-400 font-mono text-[10px] font-bold px-2.5 py-2 border-r border-slate-800 w-9 text-center">${String(i).padStart(2, '0')}</span>
                    <input type="text" id="team-input-${i}" placeholder="Club Registration Name" class="w-full bg-transparent px-3 text-xs text-white focus:outline-none placeholder-slate-600">
                </div>
                <div class="flex items-center gap-2 border border-dashed border-slate-800 p-1 rounded-lg bg-[#0f1524]/10">
                    <label class="bg-slate-800 text-[10px] font-bold uppercase tracking-wide py-1 px-2.5 rounded border border-slate-700 cursor-pointer text-slate-300 shrink-0">
                        Upload Brand Emblem
                        <input type="file" id="team-file-${i}" accept="image/*" class="hidden" onchange="processImageFile(this, ${i})">
                    </label>
                    <span id="file-status-${i}" class="text-[10px] text-slate-500 truncate font-mono">Unset</span>
                </div>
            </div>
        `;
    }
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
}

function processImageFile(input, index) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        temporaryUploadedLogos[index] = e.target.result;
        document.getElementById(`file-status-${index}`).innerText = "System Bound Asset";
    };
    reader.readAsDataURL(file);
}

function initializeTournament() {
    const count = parseInt(document.getElementById('team-count').value);
    const passField = document.getElementById('tournament-password').value.trim();
    if(passField !== "") { tournamentPassword = passField; }

    let list = [];
    for (let i = 1; i <= count; i++) {
        const name = document.getElementById(`team-input-${i}`).value.trim();
        list.push({ name: name !== "" ? name : `Club Asset ${i}`, logoData: temporaryUploadedLogos[i] || "" });
    }
    if (list.length % 2 !== 0) { list.push({ name: "BYE", logoData: "" }); }

    teams = {};
    list.forEach(item => {
        if(item.name !== "BYE") {
            teams[item.name] = { 
                name: item.name, logoData: item.logoData, 
                mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: 0, formHistory: [] 
            };
        }
    });

    fixtures = [];
    const numTeams = list.length;
    const rounds = numTeams - 1;
    for (let round = 0; round < rounds; round++) {
        for (let match = 0; match < numTeams / 2; match++) {
            const homeIdx = (round + match) % (numTeams - 1);
            let awayIdx = (numTeams - 1 - match + round) % (numTeams - 1);
            if (match === 0) { awayIdx = numTeams - 1; }
            if (list[homeIdx].name !== "BYE" && list[awayIdx].name !== "BYE") {
                fixtures.push({ id: fixtures.length, round: round + 1, home: list[homeIdx].name, away: list[awayIdx].name, homeScore: null, awayScore: null, played: false });
            }
        }
    }
    newsHeadlines = ["Notice: Tournament initialized. Master schedules are locked into cloud data cluster instances."];
    currentSelectedRound = 1; 
    saveToStorage();
}

// Disciplinary & Governance Rules Controls
function deductPointsPrompt(teamName) {
    const amount = prompt(`Operational Action: Quantify deduction points index penalty for ${teamName}:`, "3");
    if (!amount) return;
    teams[teamName].deductedPoints = (teams[teamName].deductedPoints || 0) + parseInt(amount);
    newsHeadlines.unshift(`Governance Alert: ${teamName} has incurred an official administrative points reduction penalty.`);
    saveToStorage();
}

function removeTeamFromLeague(teamName) {
    if (confirm(`Operational Warning: Purge ${teamName} from active standings? Unplayed profiles will default to BYE states.`)) {
        fixtures.forEach(f => {
            if (f.home === teamName || f.away === teamName) { f.homeScore = null; f.awayScore = null; f.played = false; }
        });
        delete teams[teamName];
        newsHeadlines.unshift(`Operational Alert: Club registry profile ${teamName} has officially withdrawn from tournament matrices.`);
        saveToStorage();
    }
}

// Analytical Computation Module: Backtrack Round Data to Determine Trajectory (Mod #5)
function calculateStandingsForRound(upToRound) {
    let tempTeams = {};
    for (let t in teams) { tempTeams[t] = { name: t, pts: 0, gd: 0, gf: 0 }; }
    fixtures.forEach(f => {
        if (f.played && f.round <= upToRound && tempTeams[f.home] && tempTeams[f.away]) {
            const hScore = parseInt(f.homeScore); const aScore = parseInt(f.awayScore);
            tempTeams[f.home].gf += hScore; tempTeams[f.home].gd += (hScore - aScore);
            tempTeams[f.away].gf += aScore; tempTeams[f.away].gd += (aScore - hScore);
            if (hScore > aScore) tempTeams[f.home].pts += 3;
            else if (aScore > hScore) tempTeams[f.away].pts += 3;
            else { tempTeams[f.home].pts += 1; tempTeams[f.away].pts += 1; }
        }
    });
    for (let t in tempTeams) {
        if(teams[t]) tempTeams[t].pts = Math.max(0, tempTeams[t].pts - (teams[t].deductedPoints || 0));
    }
    return Object.values(tempTeams).sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}

function updateTableCalculations() {
    for (let t in teams) {
        teams[t] = { name: t, logoData: teams[t].logoData, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: teams[t].deductedPoints || 0, formHistory: [] };
    }
    fixtures.sort((a,b) => a.round - b.round).forEach(f => {
        if (f.played && teams[f.home] && teams[f.away]) {
            const h = f.home; const a = f.away; const hScore = parseInt(f.homeScore); const aScore = parseInt(f.awayScore);
            teams[h].mp++; teams[a].mp++; teams[h].gf += hScore; teams[h].ga += aScore; teams[a].gf += aScore; teams[a].ga += hScore;
            if (hScore > aScore) { teams[h].w++; teams[h].pts += 3; teams[a].l++; teams[h].formHistory.push('W'); teams[a].formHistory.push('L'); }
            else if (hScore < aScore) { teams[a].w++; teams[a].pts += 3; teams[h].l++; teams[h].formHistory.push('L'); teams[a].formHistory.push('W'); }
            else { teams[h].d++; teams[h].pts += 1; teams[a].d++; teams[a].pts += 1; teams[h].formHistory.push('D'); teams[a].formHistory.push('D'); }
        }
    });
    for (let t in teams) {
        teams[t].pts = Math.max(0, teams[t].pts - (teams[t].deductedPoints || 0));
        teams[t].gd = teams[t].gf - teams[t].ga;
    }
}

function renderTable() {
    let currentSorted = Object.values(teams).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
    let currentPlayedMaxRound = 0;
    fixtures.forEach(f => { if(f.played) currentPlayedMaxRound = Math.max(currentPlayedMaxRound, f.round); });
    
    let pastSortedNames = [];
    if (currentPlayedMaxRound > 1) {
        pastSortedNames = calculateStandingsForRound(currentPlayedMaxRound - 1).map(x => x.name);
    }

    const tbody = document.getElementById('league-table-body');
    tbody.innerHTML = "";

    currentSorted.forEach((team, index) => {
        const pos = index + 1;
        let customRowClass = "bg-[#0f1524] hover:bg-[#141c30] transition font-medium text-slate-300";
        
        if (pos === 1) customRowClass += " champions-row text-white font-bold";
        const isRelegationZone = pos > currentSorted.length - 2 && currentSorted.length > 2;
        if (isRelegationZone) customRowClass += " relegation-row";

        let formHtml = `<div class="flex justify-center gap-1.5 font-mono">`;
        const recentForm = team.formHistory.slice(-5);
        while (recentForm.length < 5) { recentForm.unshift('-'); }
        recentForm.forEach(outcome => {
            if (outcome === 'W') formHtml += `<span class="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">W</span>`;
            else if (outcome === 'L') formHtml += `<span class="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">L</span>`;
            else if (outcome === 'D') formHtml += `<span class="w-4 h-4 flex items-center justify-center text-[9px] font-bold rounded bg-slate-800 text-slate-400 border border-slate-700">D</span>`;
            else formHtml += `<span class="w-4 h-4 flex items-center justify-center text-[9px] rounded bg-slate-950 text-slate-700 border border-slate-900">-</span>`;
        });
        formHtml += `</div>`;

        let trajectoryHtml = `<span class="text-slate-600 font-mono">-</span>`;
        if(pastSortedNames.length > 0) {
            const oldIndex = pastSortedNames.indexOf(team.name);
            if(oldIndex !== -1) {
                const delta = oldIndex - index;
                if (delta > 0) trajectoryHtml = `<span class="text-emerald-400 font-mono font-bold text-[10px] flex items-center justify-center">▲${delta}</span>`;
                else if (delta < 0) trajectoryHtml = `<span class="text-rose-500 font-mono font-bold text-[10px] flex items-center justify-center">▼${Math.abs(delta)}</span>`;
            }
        }

        const penaltyBadge = team.deductedPoints > 0 ? `<span class="text-[9px] font-mono tracking-wide bg-rose-950/40 text-rose-400 px-1.5 py-0.5 rounded border border-rose-900/40 block mt-0.5 w-max">PENALTY RECORD: -${team.deductedPoints} PTS</span>` : "";
        
        const actionCellHtml = isAdmin ? `
            <td class="py-2 px-4 text-center space-x-2 whitespace-nowrap border-l border-slate-800/60 bg-[#121929]/50">
                <button onclick="deductPointsPrompt('${team.name}')" class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-[10px] font-bold tracking-wide uppercase py-1 px-2.5 rounded border border-amber-500/20 transition cursor-pointer">Deduct Pts</button>
                <button onclick="removeTeamFromLeague('${team.name}')" class="bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white text-[10px] font-bold tracking-wide uppercase py-1 px-2.5 rounded border border-rose-500/20 transition cursor-pointer">Expel</button>
            </td>
        ` : "";

        tbody.innerHTML += `
            <tr class="${customRowClass}">
                <td class="py-3 px-4 text-center font-mono ${pos === 1 ? 'text-indigo-400 font-bold' : 'text-slate-400'} ${isRelegationZone ? 'text-rose-400 font-bold' : ''}">${pos}</td>
                <td class="py-3 px-2 text-center">${trajectoryHtml}</td>
                <td class="py-3 px-4 font-semibold text-slate-200 flex items-center gap-2.5">
                    ${getTeamBadgeHtml(team.name)}
                    <div>
                        <span class="${isRelegationZone ? 'text-slate-400' : ''}">${team.name}</span>
                        ${penaltyBadge}
                    </div>
                </td>
                <td class="py-3 px-3 text-center text-slate-500 font-mono">${team.mp}</td>
                <td class="py-3 px-2 text-center text-emerald-400 font-mono">${team.w}</td>
                <td class="py-3 px-2 text-center text-slate-400 font-mono">${team.d}</td>
                <td class="py-3 px-2 text-center text-rose-400 font-mono">${team.l}</td>
                <td class="py-3 px-2 text-center text-slate-400 font-mono">${team.gf}</td>
                <td class="py-3 px-2 text-center text-slate-500 font-mono">${team.ga}</td>
                <td class="py-3 px-2 text-center font-mono font-bold ${team.gd >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${team.gd > 0 ? '+' + team.gd : team.gd}</td>
                <td class="py-3 px-4 text-center text-indigo-400 font-mono font-bold text-sm bg-[#121929]/20">${team.pts}</td>
                <td class="py-3 px-4 text-center">${formHtml}</td>
                ${actionCellHtml}
            </tr>
        `;
    });
}

function renderGameweekTabs() {
    const tabsContainer = document.getElementById('gameweek-tabs');
    if (!fixtures.length) return;
    const totalRounds = Math.max(...fixtures.map(f => f.round));
    tabsContainer.innerHTML = "";
    for (let r = 1; r <= totalRounds; r++) {
        const isCurrent = r === currentSelectedRound;
        tabsContainer.innerHTML += `
            <button onclick="switchRound(${r})" class="px-3 py-1 text-[10px] font-mono tracking-wider uppercase rounded transition shrink-0 cursor-pointer ${isCurrent ? "bg-indigo-600 text-white font-bold border border-indigo-500" : "text-slate-400 hover:text-slate-200 hover:bg-[#161f32]"}" >
                GW ${String(r).padStart(2, '0')}
            </button>
        `;
    }
}

function switchRound(roundNumber) { currentSelectedRound = roundNumber; renderGameweekTabs(); renderFixtures(); }

function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    container.innerHTML = "";
    fixtures.filter(f => f.round === currentSelectedRound).forEach(f => {
        if (!teams.hasOwnProperty(f.home) || !teams.hasOwnProperty(f.away)) return;

        const isPlayed = f.played;
        let middleColumnHtml = "";
        let actionButtonHtml = "";

        if (isAdmin) {
            middleColumnHtml = `
                <div class="flex items-center gap-1 bg-[#070a12] px-2 py-1 rounded border border-slate-800">
                    <input type="number" id="home-score-${f.id}" value="${isPlayed ? f.homeScore : ""}" min="0" placeholder="-" class="w-6 text-center bg-transparent font-mono font-bold text-indigo-400 focus:outline-none">
                    <span class="text-slate-700 font-bold text-xs">:</span>
                    <input type="number" id="away-score-${f.id}" value="${isPlayed ? f.awayScore : ""}" min="0" placeholder="-" class="w-6 text-center bg-transparent font-mono font-bold text-indigo-400 focus:outline-none">
                </div>
            `;
            actionButtonHtml = `
                <button onclick="saveResult(${f.id})" class="text-[10px] tracking-wide uppercase font-bold bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white border border-indigo-500/30 px-2.5 py-1.5 rounded transition cursor-pointer">
                    Commit
                </button>
            `;
        } else {
            middleColumnHtml = isPlayed 
                ? `<div class="bg-[#070a12] border border-slate-800 text-indigo-400 font-mono px-3 py-1 font-bold rounded tracking-wider text-xs min-w-12 text-center">${f.homeScore} - ${f.awayScore}</div>`
                : `<button onclick="runMatchPrediction(${f.id})" class="bg-[#070a12] hover:bg-indigo-950 hover:text-indigo-400 border border-slate-800 hover:border-indigo-800 text-slate-400 font-bold font-mono text-[10px] px-2 py-1 rounded transition tracking-wide cursor-pointer">ANALYZE</button>`;
        }

        container.innerHTML += `
            <div class="flex items-center justify-between bg-[#070a12]/50 p-3 rounded-lg border border-slate-800/60 gap-4">
                <div class="w-2/5 flex items-center justify-end gap-2 text-right font-semibold text-xs ${isPlayed && f.homeScore > f.awayScore ? 'text-white font-bold' : 'text-slate-400'} truncate">
                    <span>${f.home}</span> ${getTeamBadgeHtml(f.home)}
                </div>
                ${middleColumnHtml}
                <div class="w-2/5 flex items-center justify-start gap-2 text-left font-semibold text-xs ${isPlayed && f.awayScore > f.homeScore ? 'text-white font-bold' : 'text-slate-400'} truncate">
                    ${getTeamBadgeHtml(f.away)} <span>${f.away}</span>
                </div>
                ${actionButtonHtml}
            </div>
        `;
    });
}

// Analytics Generation Logic: Dynamic Headlines Generator (Mod #4)
function generateHeadlineNews(home, away, hScore, aScore) {
    const margin = Math.abs(hScore - aScore);
    if (hScore === aScore) {
        return hScore === 0 
            ? `Tactical Stalemate: ${home} and ${away} settle for structural clean sheets in a scoreless tactical draw.`
            : `Score Draw: High-line offenses trade equalizers as ${home} vs ${away} concludes locked at ${hScore}-${aScore}.`;
    }
    const winner = hScore > aScore ? home : away;
    const loser = hScore > aScore ? away : home;
    if (margin >= 4) return `Result Update: ${winner} commands dominant performance metrics, securing a heavy ${Math.max(hScore, aScore)}-${Math.min(hScore, aScore)} win over ${loser}.`;
    return `Fixture Notice: ${winner} takes critical table margin points following hard-fought win against ${loser}.`;
}

function updateTickerDisplay() {
    if (newsHeadlines.length === 0) return;
    document.getElementById('news-ticker').innerHTML = newsHeadlines.slice(0, 5).join(' &nbsp;&nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp;&nbsp; ');
}

function saveResult(fixtureId) {
    const hInput = document.getElementById(`home-score-${fixtureId}`).value;
    const aInput = document.getElementById(`away-score-${fixtureId}`).value;
    if (hInput === "" || aInput === "") { alert("Data input fields incomplete."); return; }

    const fixture = fixtures.find(f => f.id === fixtureId);
    fixture.homeScore = parseInt(hInput);
    fixture.awayScore = parseInt(aInput);
    fixture.played = true;

    const headline = generateHeadlineNews(fixture.home, fixture.away, fixture.homeScore, fixture.awayScore);
    newsHeadlines.unshift(`GW ${fixture.round}: ${headline}`);
    
    saveToStorage();
}

// Predictive Computation Analytics Simulator Module (Mod #2)
function runMatchPrediction(fixtureId) {
    const f = fixtures.find(f => f.id === fixtureId);
    const h = teams[f.home];
    const a = teams[f.away];

    let homePower = (h.pts * 1.5) + h.gd;
    let awayPower = (a.pts * 1.5) + a.gd;

    const parseForm = (arr) => {
        let score = 0;
        arr.slice(-3).forEach(x => { if(x==='W') score+=3; else if(x==='D') score+=1; });
        return score;
    };
    homePower += parseForm(h.formHistory);
    awayPower += parseForm(a.formHistory);

    const delta = homePower - awayPower;
    let drawPct = 25;
    let homePct = Math.max(15, Math.min(65, 37 + (delta * 1.1)));
    let awayPct = 100 - homePct - drawPct;

    let simHome = Math.max(0, Math.round((h.gf / (h.mp||1)) + (delta > 0 ? delta * 0.04 : 0)));
    let simAway = Math.max(0, Math.round((a.gf / (a.mp||1)) + (delta < 0 ? Math.abs(delta) * 0.04 : 0)));
    if(simHome > 4) simHome = 3; if(simAway > 4) simAway = 3;

    document.getElementById('pred-home-name').innerText = f.home;
    document.getElementById('pred-away-name').innerText = f.away;
    document.getElementById('pred-home-logo').innerHTML = getTeamBadgeHtml(f.home);
    document.getElementById('pred-away-logo').innerHTML = getTeamBadgeHtml(f.away);
    
    document.getElementById('pred-home-pct').innerText = `${Math.round(homePct)}%`;
    document.getElementById('pred-draw-pct').innerText = `${Math.round(drawPct)}%`;
    document.getElementById('pred-away-pct').innerText = `${Math.round(awayPct)}%`;
    document.getElementById('pred-simulated-score').innerText = `${simHome} - ${simAway}`;

    document.getElementById('predictor-modal').classList.remove('hidden');
}

function closePredictorModal() { document.getElementById('predictor-modal').classList.add('hidden'); }

function resetTournament() {
    if (confirm("Critical Request: Perform complete database purge reset sequence?")) {
        db.ref('tournament_data').remove().then(() => {
            location.reload();
        });
    }
}

// Initial Hook: Fire up the live database websocket listeners
document.addEventListener("DOMContentLoaded", function() {
    initRealtimeDatabaseSync();
});
