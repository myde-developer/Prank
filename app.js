/**
 * DLS Premier League - Final Edition
 * Large, visible team crests everywhere
 */
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
let newsHeadlines = [];
let temporaryUploadedLogos = {};

// Theme handling
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (saved === null && prefersDark);
    if (isDark) {
        document.body.classList.add('dark');
        document.getElementById('theme-icon').innerText = '🌙';
    } else {
        document.body.classList.remove('dark');
        document.getElementById('theme-icon').innerText = '☀️';
    }
}
function toggleTheme() {
    if (document.body.classList.contains('dark')) {
        document.body.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        document.getElementById('theme-icon').innerText = '☀️';
    } else {
        document.body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('theme-icon').innerText = '🌙';
    }
}

// Toast
function showToast(msg, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

// Team badge with large size (48px default)
function getTeamBadgeHtml(teamKey, size = "w-12 h-12") {
    const team = teams[teamKey];
    if (team && team.logoData && team.logoData.trim() !== "") {
        return `<img src="${team.logoData}" alt="${team.name}" class="team-logo ${size} rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm cursor-pointer hover:scale-105 transition" onclick="showLightbox('${team.logoData}')">`;
    }
    const initial = teamKey ? teamKey.charAt(0).toUpperCase() : "?";
    const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f43f5e"];
    const color = colors[Math.abs(teamKey.charCodeAt(0) || 0) % colors.length];
    return `<div class="${size} rounded-full flex items-center justify-center text-white font-bold text-base shadow-sm" style="background: ${color};">${initial}</div>`;
}

// Lightbox
window.showLightbox = function(src) {
    const lb = document.getElementById('lightbox');
    const img = document.getElementById('lightbox-img');
    img.src = src;
    lb.classList.remove('hidden');
    lb.classList.add('flex');
};
window.closeLightbox = function() {
    const lb = document.getElementById('lightbox');
    lb.classList.add('hidden');
    lb.classList.remove('flex');
};

// Team details modal
window.showTeamDetails = function(teamName) {
    const team = teams[teamName];
    if (!team) return;
    document.getElementById('team-modal-name').innerText = team.name;
    document.getElementById('team-modal-badge').innerHTML = getTeamBadgeHtml(teamName, "w-16 h-16");
    document.getElementById('modal-mp').innerText = team.mp;
    document.getElementById('modal-pts').innerText = team.pts;
    document.getElementById('modal-w').innerText = team.w;
    document.getElementById('modal-d').innerText = team.d;
    document.getElementById('modal-l').innerText = team.l;
    document.getElementById('modal-gf').innerText = team.gf;
    document.getElementById('modal-ga').innerText = team.ga;
    const gd = team.gd;
    document.getElementById('modal-gd').innerHTML = `<span class="${gd>=0?'text-emerald-600 dark:text-emerald-400':'text-rose-500'}">${gd>0?'+'+gd:gd}</span>`;
    document.getElementById('modal-penalty').innerText = team.deductedPoints ? `-${team.deductedPoints}` : 'None';
    
    const formContainer = document.getElementById('modal-form');
    let recent = team.formHistory.slice(-5);
    while(recent.length < 5) recent.unshift('-');
    formContainer.innerHTML = recent.map(res => {
        if(res === 'W') return `<span class="w-7 h-7 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-bold flex items-center justify-center">W</span>`;
        if(res === 'L') return `<span class="w-7 h-7 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-full text-xs font-bold flex items-center justify-center">L</span>`;
        if(res === 'D') return `<span class="w-7 h-7 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold flex items-center justify-center">D</span>`;
        return `<span class="w-7 h-7 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full text-xs flex items-center justify-center">-</span>`;
    }).join('');
    
    const ptsPerGame = (team.pts / (team.mp || 1)).toFixed(1);
    let summary = '';
    if (ptsPerGame >= 2.3) summary = '🔥 Incredible form – title contenders!';
    else if (ptsPerGame >= 1.8) summary = '👍 Solid season, pushing for European spots.';
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

// Firebase sync
function saveToStorage() {
    db.ref('tournament_data').set({ teams, fixtures, password: tournamentPassword, headlines: newsHeadlines });
}

function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            if (data.password) tournamentPassword = data.password;
            if (data.headlines) { newsHeadlines = data.headlines; updateTickerDisplay(); }
            if (data.teams && data.fixtures) {
                teams = data.teams;
                fixtures = data.fixtures;
                document.getElementById('setup-section')?.classList.add('hidden');
                document.getElementById('dashboard-section')?.classList.remove('hidden');
                document.getElementById('admin-toggle-container')?.classList.remove('hidden');
                updateTableCalculations();
                renderTable();
                renderGameweekTabs();
                renderFixtures();
                document.title = `DLS | ${Object.keys(teams).length} teams • Live`;
            }
        } else {
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('news-ticker').innerHTML = "⚽ Ready to create your league";
        }
    }, (error) => { showToast("Firebase connection issue", "error"); });
}

// Admin handlers
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
function activateAdminMode() { isAdmin = true; updateAdminUIElements(); showToast("Admin mode ACTIVE", "success"); }
function deactivateAdminMode() { isAdmin = false; updateAdminUIElements(); showToast("Admin mode deactivated", "info"); }
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
    renderTable(); renderFixtures();
}

// Team setup
function generateTeamInputs() {
    const count = parseInt(document.getElementById('team-count').value);
    if (isNaN(count) || count < 2) { alert("Enter 2-20 teams"); return; }
    const container = document.getElementById('team-inputs-container');
    container.innerHTML = "";
    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 mb-2">
                    <span class="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">${i}</span>
                    <input type="text" id="team-input-${i}" placeholder="Club name" class="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm">
                </div>
                <div class="flex items-center gap-3">
                    <label class="text-[11px] bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded cursor-pointer">📁 Upload crest <input type="file" id="team-file-${i}" accept="image/*" class="hidden" onchange="processImageFile(this, ${i})"></label>
                    <div id="preview-${i}" class="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[10px] text-gray-400">No img</div>
                    <span id="file-status-${i}" class="text-[10px] text-gray-400"></span>
                </div>
            </div>
        `;
    }
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.remove('hidden');
}
window.processImageFile = function(input, index) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        temporaryUploadedLogos[index] = e.target.result;
        const previewDiv = document.getElementById(`preview-${index}`);
        if (previewDiv) previewDiv.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded">`;
        document.getElementById(`file-status-${index}`).innerText = "✅ ready";
    };
    reader.readAsDataURL(file);
};

function initializeTournament() {
    const count = parseInt(document.getElementById('team-count').value);
    const pass = document.getElementById('tournament-password').value.trim();
    if(pass) tournamentPassword = pass;
    let list = [];
    for (let i=1; i<=count; i++) {
        let name = document.getElementById(`team-input-${i}`).value.trim();
        if(name === "") name = `Team ${i}`;
        list.push({ name, logoData: temporaryUploadedLogos[i] || "" });
    }
    if (list.length % 2 !== 0) list.push({ name: "BYE", logoData: "" });
    teams = {};
    list.forEach(item => {
        if(item.name !== "BYE") {
            teams[item.name] = { name: item.name, logoData: item.logoData, mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0, deductedPoints:0, formHistory: [] };
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
                fixtures.push({ id: fixtures.length, round: r+1, home: list[homeIdx].name, away: list[awayIdx].name, homeScore: null, awayScore: null, played: false });
            }
        }
    }
    newsHeadlines = [`🏁 League created with ${Object.keys(teams).length} teams`];
    currentSelectedRound = 1;
    saveToStorage();
    showToast("Tournament initialized!", "success");
}

// Team rename
function renameTeamInLeague(oldName, newName) {
    if (oldName === newName) return true;
    if (teams[newName]) {
        showToast(`Team "${newName}" already exists!`, "error");
        return false;
    }
    teams[newName] = { ...teams[oldName], name: newName };
    delete teams[oldName];
    fixtures.forEach(f => {
        if (f.home === oldName) f.home = newName;
        if (f.away === oldName) f.away = newName;
    });
    newsHeadlines.unshift(`✏️ Admin renamed "${oldName}" → "${newName}"`);
    saveToStorage();
    showToast(`Team renamed to "${newName}"`, "success");
    return true;
}
window.editTeamName = function(oldName) {
    if (!isAdmin) return;
    const newName = prompt(`Edit team name (currently "${oldName}"):`, oldName);
    if (!newName || newName === oldName) return;
    renameTeamInLeague(oldName, newName);
    renderGameweekTabs();
    renderFixtures();
    renderTable();
};

// Standings calculations
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

// Render table with large crests (48px)
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
            if(res === 'W') formHtml += `<span class="w-5 h-5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 rounded-full text-[9px] font-bold flex items-center justify-center">W</span>`;
            else if(res === 'L') formHtml += `<span class="w-5 h-5 bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center text-[9px] font-bold">L</span>`;
            else if(res === 'D') formHtml += `<span class="w-5 h-5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded-full flex items-center justify-center text-[9px] font-bold">D</span>`;
            else formHtml += `<span class="w-5 h-5 bg-gray-100 dark:bg-gray-800 text-gray-400 rounded-full flex items-center justify-center text-[9px]">-</span>`;
        });
        formHtml += `</div>`;
        const penaltyBadge = team.deductedPoints > 0 ? `<span class="ml-1 text-[9px] bg-rose-50 dark:bg-rose-950/50 text-rose-600 px-1 rounded-full">-${team.deductedPoints}</span>` : "";
        const rowClass = pos === 1 ? "champions-row" : (pos > currentSorted.length-2 ? "relegation-row" : "");
        const actionBtn = isAdmin ? `<td class="py-3 px-2 text-center"><button onclick="event.stopPropagation(); deductPointsPrompt('${team.name}')" class="text-xs bg-amber-50 dark:bg-amber-950/50 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-100">⚖️</button> <button onclick="event.stopPropagation(); removeTeamFromLeague('${team.name}')" class="text-xs bg-rose-50 dark:bg-rose-950/50 text-rose-600 px-2 py-1 rounded-full hover:bg-rose-100">🗑️</button></td>` : "";
        tbody.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition ${rowClass}" onclick="showTeamDetails('${team.name}')">
                <td class="py-3 px-3 text-center font-bold ${pos===1?'text-indigo-600 dark:text-indigo-400':''}">${pos}</td>
                <td class="py-3 px-4 flex items-center gap-4">${getTeamBadgeHtml(team.name, "w-12 h-12")}<span class="font-semibold text-base">${team.name}</span>${penaltyBadge}</td>
                <td class="py-3 px-2 text-center">${team.mp}</td><td class="py-3 px-2 text-center text-emerald-600 dark:text-emerald-400">${team.w}</td>
                <td class="py-3 px-2 text-center">${team.d}</td><td class="py-3 px-2 text-center text-rose-500 dark:text-rose-400">${team.l}</td>
                <td class="py-3 px-2 text-center">${team.gf}</td><td class="py-3 px-2 text-center">${team.ga}</td>
                <td class="py-3 px-2 text-center ${team.gd>=0?'text-emerald-600 dark:text-emerald-400':'text-rose-500 dark:text-rose-400'} font-mono">${team.gd>0?'+'+team.gd:team.gd}</td>
                <td class="py-3 px-3 text-center font-black text-indigo-600 dark:text-indigo-400">${team.pts}</td>
                <td class="py-3 px-4 text-center">${formHtml}</td>
                ${actionBtn}
            </tr>
        `;
    });
}

// Render round tabs
function renderGameweekTabs() {
    const container = document.getElementById('gameweek-tabs');
    if(!fixtures.length) return;
    const total = Math.max(...fixtures.map(f=>f.round));
    container.innerHTML = "";
    for(let r=1; r<=total; r++) {
        const active = r === currentSelectedRound;
        container.innerHTML += `<button onclick="switchRound(${r})" class="px-3 py-1 text-[11px] font-mono rounded-full transition ${active ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}">GW ${r}</button>`;
    }
}
window.switchRound = function(r) { currentSelectedRound = r; renderGameweekTabs(); renderFixtures(); };

// Render fixtures with large crests (40px)
function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    container.innerHTML = "";
    fixtures.filter(f => f.round === currentSelectedRound).forEach(f => {
        if (!teams[f.home] || !teams[f.away]) return;
        const played = f.played;
        let midHtml = "", actionHtml = "";
        if (isAdmin) {
            midHtml = `
                <div class="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                    <input type="number" id="home-score-${f.id}" value="${played ? f.homeScore : ''}" placeholder="0" class="w-8 text-center bg-transparent font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <span class="text-gray-400">:</span>
                    <input type="number" id="away-score-${f.id}" value="${played ? f.awayScore : ''}" placeholder="0" class="w-8 text-center bg-transparent font-mono font-bold text-indigo-600 dark:text-indigo-400">
                </div>
            `;
            actionHtml = `<button onclick="saveResult(${f.id})" class="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 px-2 py-1 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900">💾 Save</button>`;
            const homeNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition" onclick="editTeamName('${f.home}')">${f.home}</span>`;
            const awayNameHtml = `<span class="font-semibold cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition" onclick="editTeamName('${f.away}')">${f.away}</span>`;
            container.innerHTML += `
                <div class="flex items-center justify-between bg-gray-50/60 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 gap-2">
                    <div class="w-2/5 flex items-center justify-end gap-2 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}">
                        ${homeNameHtml} ${getTeamBadgeHtml(f.home, "w-10 h-10")}
                    </div>
                    ${midHtml}
                    <div class="w-2/5 flex items-center justify-start gap-2 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}">
                        ${getTeamBadgeHtml(f.away, "w-10 h-10")} ${awayNameHtml}
                    </div>
                    ${actionHtml}
                </div>
            `;
        } else {
            midHtml = played ? `<div class="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full font-mono font-bold text-sm">${f.homeScore} - ${f.awayScore}</div>` : `<button onclick="runMatchPrediction(${f.id})" class="text-[11px] bg-gray-100 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 px-3 py-1 rounded-full">🔍 Analyze</button>`;
            container.innerHTML += `
                <div class="flex items-center justify-between bg-gray-50/60 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-800 gap-2">
                    <div class="w-2/5 flex items-center justify-end gap-2 text-right ${played && f.homeScore > f.awayScore ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}">
                        ${f.home} ${getTeamBadgeHtml(f.home, "w-10 h-10")}
                    </div>
                    ${midHtml}
                    <div class="w-2/5 flex items-center justify-start gap-2 text-left ${played && f.awayScore > f.homeScore ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}">
                        ${getTeamBadgeHtml(f.away, "w-10 h-10")} ${f.away}
                    </div>
                </div>
            `;
        }
    });
}

// Match comment generation
function generateMatchComment(home, away, homeScore, awayScore) {
    const margin = Math.abs(homeScore - awayScore);
    const winner = homeScore > awayScore ? home : away;
    const loser = homeScore > awayScore ? away : home;
    let comment = "";
    if (homeScore === awayScore) {
        if (homeScore === 0) comment = `🤝 Goalless stalemate between ${home} and ${away}. Neither side could break the deadlock.`;
        else comment = `⚖️ ${home} ${homeScore}-${awayScore} ${away} – honours shared in an entertaining draw.`;
    } else if (margin >= 3) {
        comment = `🔥 ${winner} destroyed ${loser} ${Math.max(homeScore,awayScore)}-${Math.min(homeScore,awayScore)} in a dominant display!`;
    } else if (margin === 2) {
        comment = `📈 ${winner} secured a comfortable win over ${loser}.`;
    } else {
        comment = `⚡ Narrow victory! ${winner} edged past ${loser} in a tight contest.`;
    }
    const flavour = ["dominated possession", "clinical finishing", "strong defensive display", "counter-attacking masterclass"];
    comment += ` ${winner} showed ${flavour[Math.floor(Math.random()*flavour.length)]}.`;
    return comment;
}

// Save result with comment editor
let pendingFixtureId = null;
let pendingHomeScore = null;
let pendingAwayScore = null;
let pendingDraftComment = null;

window.saveResult = function(fixtureId) {
    const homeScore = document.getElementById(`home-score-${fixtureId}`).value;
    const awayScore = document.getElementById(`away-score-${fixtureId}`).value;
    if (homeScore === "" || awayScore === "") {
        alert("Enter both scores");
        return;
    }
    const fixture = fixtures.find(f => f.id === fixtureId);
    const draft = generateMatchComment(fixture.home, fixture.away, parseInt(homeScore), parseInt(awayScore));
    pendingFixtureId = fixtureId;
    pendingHomeScore = parseInt(homeScore);
    pendingAwayScore = parseInt(awayScore);
    pendingDraftComment = draft;
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
    if (finalComment === "") {
        alert("Comment cannot be empty");
        return;
    }
    const fixture = fixtures.find(f => f.id === pendingFixtureId);
    fixture.homeScore = pendingHomeScore;
    fixture.awayScore = pendingAwayScore;
    fixture.played = true;
    newsHeadlines.unshift(`🎙️ GW${fixture.round}: ${finalComment}`);
    saveToStorage();
    showToast(`Result saved: ${fixture.home} ${pendingHomeScore}-${pendingAwayScore} ${fixture.away}`, "success");
    closeCommentModal(true);
    pendingFixtureId = null;
};

// Predictor with large crests (56px)
window.runMatchPrediction = function(fixtureId) {
    const f = fixtures.find(f=>f.id===fixtureId);
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
    document.getElementById('pred-home-logo').innerHTML = getTeamBadgeHtml(f.home, "w-14 h-14");
    document.getElementById('pred-away-logo').innerHTML = getTeamBadgeHtml(f.away, "w-14 h-14");
    document.getElementById('pred-home-pct').innerText = `${Math.round(homePct)}%`;
    document.getElementById('pred-away-pct').innerText = `${Math.round(awayPct)}%`;
    document.getElementById('pred-draw-pct').innerText = `${Math.round(drawPct)}%`;
    document.getElementById('pred-simulated-score').innerText = `${simHome} - ${simAway}`;
    document.getElementById('predictor-modal').classList.remove('hidden');
};
window.closePredictorModal = () => document.getElementById('predictor-modal').classList.add('hidden');

// Deduct / Expel
window.deductPointsPrompt = function(teamName) {
    if(!isAdmin) return;
    let amount = prompt(`Penalty points for ${teamName}:`, "3");
    if(!amount) return;
    teams[teamName].deductedPoints = (teams[teamName].deductedPoints||0) + parseInt(amount);
    newsHeadlines.unshift(`⚠️ ${teamName} deducted ${amount} points (admin)`);
    saveToStorage();
    showToast(`${teamName} penalized ${amount} pts`, "warning");
};
window.removeTeamFromLeague = function(teamName) {
    if(!isAdmin) return;
    if(confirm(`Permanently remove ${teamName}? Their matches will be voided.`)) {
        fixtures.forEach(f => {
            if(f.home === teamName || f.away === teamName) { f.played = false; f.homeScore = null; f.awayScore = null; }
        });
        delete teams[teamName];
        newsHeadlines.unshift(`🚫 ${teamName} has been expelled from the league`);
        saveToStorage();
        showToast(`${teamName} removed`, "error");
    }
};

// Ticker and reset
function updateTickerDisplay() {
    const ticker = document.getElementById('news-ticker');
    if(newsHeadlines.length) ticker.innerHTML = newsHeadlines.slice(0,5).map(h=>`🔹 ${h}`).join(' &nbsp;&nbsp;⚽&nbsp;&nbsp; ');
}
window.resetTournament = () => { if(confirm("Wipe ALL data?")) db.ref('tournament_data').remove().then(()=>location.reload()); };

// Initialisation
window.onload = () => {
    initTheme();
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    initRealtimeDatabaseSync();
};