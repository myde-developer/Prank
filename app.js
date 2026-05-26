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

let teams = {}, fixtures = [], knockoutMatches = [], tournamentPhase = 'league';
let currentSelectedRound = 1, isAdmin = false, tournamentPassword = "";
let tickerInterval = null, currentTickerFactIndex = 0, tickerFacts = [];
let pendingFixtureId = null, pendingHomeScore = null, pendingAwayScore = null;
let currentPenaltyTeam = null, pendingAssignFixtureId = null, pendingAssignSide = null, currentViewerFixtureId = null;
let currentPredictionFixtureId = null, currentBanterFixtureId = null;
let chatMessagesRef = null;
let autoStartNextRound = false;
let roundStartTimes = {};
let typingTimeout = null;
let isTyping = false;
let unreadMessagesCount = 0;
let lastReadTimestamp = localStorage.getItem('chatLastRead') ? parseInt(localStorage.getItem('chatLastRead')) : Date.now();
let isChatModalOpen = false;
let currentMentionText = '';
let mentionTimeout = null;

// ==================== ROLE SELECTION ====================
let userRole = null; // 'viewer' or 'admin'

function selectRole(role) {
    userRole = role;
    sessionStorage.setItem('tournamentRole', role);
    document.getElementById('role-selector').style.display = 'none';
    
    if (role === 'admin') {
        const entered = prompt("Enter admin master password:");
        if (entered === null) {
            location.reload();
            return;
        }
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
                    roleSelector.innerHTML = `
                        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
                            <div class="mb-4">
                                <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <span class="text-3xl">🏆</span>
                                </div>
                                <h2 class="text-2xl font-bold text-gray-800">No Tournament Yet</h2>
                                <p class="text-gray-500 text-sm mt-1">An admin hasn't started a tournament.</p>
                            </div>
                            <button onclick="selectRole('admin')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition">
                                🔑 Switch to Admin to Create
                            </button>
                        </div>
                    `;
                    roleSelector.style.display = 'flex';
                }
            } else if (userRole === 'admin') {
                const setupSection = document.getElementById('setup-section');
                const dashboardSection = document.getElementById('dashboard-section');
                const roleSelector = document.getElementById('role-selector');
                if (setupSection) setupSection.classList.remove('hidden');
                if (dashboardSection) dashboardSection.classList.add('hidden');
                if (roleSelector) roleSelector.remove();
                
                document.getElementById('step-1')?.classList.remove('hidden');
                document.getElementById('step-2')?.classList.add('hidden');
                const container = document.getElementById('team-inputs-container');
                if (container) container.innerHTML = '';
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
    initChatListener();
    if (userRole === 'admin') {
        updateAdminUIElements();
    }
}

// ==================== HELPERS ====================
function showToast(msg) {
    const c = document.getElementById("toast-container");
    if (c) { 
        let t = document.createElement("div"); 
        t.className = "toast"; 
        t.innerText = msg; 
        c.appendChild(t); 
        setTimeout(() => t.remove(), 2500); 
    }
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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

// ==================== GLOBAL CHAT ROOM ====================
function initChatListener() {
    chatMessagesRef = db.ref('chat_messages');
    chatMessagesRef.off();
    chatMessagesRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        appendChatMessage(msg);
    });
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
        if (pollBtn) {
            if (isAdmin) pollBtn.classList.remove('hidden');
            else pollBtn.classList.add('hidden');
        }
    }
}

// Global scope mapping for UI element events
window.selectRole = selectRole;
window.openChatModal = openChatModal;

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
        } else {
            badge.classList.add('hidden');
        }
    }
}

function sendTypingStatus() {
    if (!userRole) return;
    if (!isTyping) {
        isTyping = true;
        db.ref('chat_typing').set({ user: userRole === 'admin' ? 'Admin' : (localStorage.getItem('chatNickname') || 'Fan'), timestamp: Date.now() });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        db.ref('chat_typing').remove();
    }, 1500);
}

function initTypingListener() {
    db.ref('chat_typing').on('value', (snapshot) => {
        const data = snapshot.val();
        const typingDiv = document.getElementById('chat-typing-indicator');
        if (data && data.user) {
            typingDiv.innerText = `${data.user} is typing...`;
            typingDiv.classList.remove('hidden');
        } else {
            typingDiv.classList.add('hidden');
        }
    });
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    if (container.children.length === 1 && container.children[0].innerText.includes('Loading')) {
        container.innerHTML = '';
    }
    
    if (msg.isPoll && msg.pollId) {
        renderPollMessage(msg.pollId);
        return;
    }
    
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
    messageDiv.innerHTML = `
        <div class="bubble">
            ${deleteBtn}
            <p>${formattedText}</p>
            <div class="message-meta">
                <span class="message-author">${escapeHtml(msg.nickname)}</span>
                <span class="message-time">${date}</span>
            </div>
        </div>
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    
    if (!isChatModalOpen && !isCurrentUser && msg.timestamp > lastReadTimestamp) {
        unreadMessagesCount++;
        updateUnreadBadge();
    }
}

function sendChatMessage() {
    const nicknameInput = document.getElementById('chat-nickname');
    let nickname = nicknameInput.value.trim();
    if (nickname === "") { alert("Please enter your name"); return; }
    const text = document.getElementById('chat-input').value.trim();
    if (text === "") return;
    
    localStorage.setItem('chatNickname', nickname);
    const userId = getCurrentUserId();
    
    const message = {
        nickname: nickname.slice(0,20),
        text: text.slice(0,200),
        timestamp: Date.now(),
        userId: userId,
        messageId: Date.now() + '_' + Math.random().toString(36).substr(2, 6)
    };
    
    if (chatMessagesRef) {
        chatMessagesRef.push(message);
        document.getElementById('chat-input').value = '';
        hideMentionDropdown();
    } else {
        showToast("Chat not ready, try again");
    }
}

function deleteChatMessage(messageId, messageUserId) {
    const currentUserId = getCurrentUserId();
    if (!isAdmin && currentUserId !== messageUserId) {
        showToast("You can only delete your own messages");
        return;
    }
    chatMessagesRef.orderByChild('messageId').equalTo(messageId).once('value', snapshot => {
        snapshot.forEach(child => {
            child.ref.remove();
            showToast("Message deleted");
        });
    });
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
    } else {
        hideMentionDropdown();
    }
    sendTypingStatus();
}

function showMentionSuggestions(query) {
    const container = document.getElementById('chat-messages-container');
    const nicknames = new Set();
    document.querySelectorAll('#chat-messages-container .message-author').forEach(el => {
        nicknames.add(el.innerText);
    });
    const savedNick = localStorage.getItem('chatNickname');
    if (savedNick) nicknames.add(savedNick);
    
    const filtered = Array.from(nicknames).filter(n => n && n.toLowerCase().includes(query.toLowerCase()));
    const dropdown = document.getElementById('mention-dropdown');
    if (filtered.length === 0 || !dropdown) {
        dropdown?.classList.add('hidden');
        return;
    }
    dropdown.innerHTML = filtered.map(n => `<div class="mention-item px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm" data-name="${n}">@${n}</div>`).join('');
    dropdown.classList.remove('hidden');
    
    const input = document.getElementById('chat-input');
    const rect = input.getBoundingClientRect();
    dropdown.style.bottom = `${window.innerHeight - rect.top + 5}px`;
    dropdown.style.left = `${rect.left}px`;
    
    document.querySelectorAll('.mention-item').forEach(item => {
        item.onclick = () => {
            insertMention(item.dataset.name);
        };
    });
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

function hideMentionDropdown() {
    document.getElementById('mention-dropdown')?.classList.add('hidden');
}

// ==================== POLLS ====================
function initPollListener() {
    db.ref('chat_polls').on('child_changed', (snapshot) => {
        const poll = snapshot.val();
        if (poll) updatePollUI(poll.id);
    });
}

function openPollModal() {
    if (!isAdmin) return;
    document.getElementById('poll-modal')?.classList.remove('hidden');
    document.getElementById('poll-modal')?.classList.add('flex');
}

function closePollModal() {
    document.getElementById('poll-modal')?.classList.add('hidden');
    document.getElementById('poll-modal')?.classList.remove('flex');
}

function addPollOption() {
    const container = document.getElementById('poll-options-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex gap-2 mb-2';
    div.innerHTML = `<input type="text" placeholder="Option" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button>`;
    container.appendChild(div);
}

function removePollOption(btn) {
    btn.parentElement.remove();
}

function createPoll() {
    const question = document.getElementById('poll-question').value.trim();
    if (!question) { alert("Enter a question"); return; }
    const options = Array.from(document.querySelectorAll('.poll-option')).map(inp => inp.value.trim()).filter(v => v);
    if (options.length < 2) { alert("At least 2 options"); return; }
    const pollId = Date.now();
    const poll = {
        id: pollId,
        question: question,
        options: options.map(opt => ({ text: opt, votes: 0 })),
        totalVotes: 0,
        voters: {},
        createdAt: Date.now()
    };
    db.ref(`chat_polls/${pollId}`).set(poll);
    
    const msg = {
        nickname: "System",
        text: `📊 New poll: ${question}`,
        timestamp: Date.now(),
        userId: `poll_${pollId}`,
        isPoll: true,
        pollId: pollId
    };
    db.ref('chat_messages').push(msg);
    closePollModal();
    document.getElementById('poll-question').value = '';
    document.getElementById('poll-options-container').innerHTML = `
        <div class="flex gap-2 mb-2"><input type="text" placeholder="Option 1" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div>
        <div class="flex gap-2 mb-2"><input type="text" placeholder="Option 2" class="poll-option flex-1 bg-gray-50 border rounded-lg p-2"><button onclick="removePollOption(this)" class="text-red-500">✖</button></div>
    `;
}

function votePoll(pollId, optionIndex) {
    const nickname = localStorage.getItem('chatNickname') || 'Fan';
    db.ref(`chat_polls/${pollId}/voters/${nickname}`).once('value', snap => {
        if (snap.exists()) { showToast("You already voted"); return; }
        db.ref(`chat_polls/${pollId}/options/${optionIndex}/votes`).transaction(votes => (votes || 0) + 1);
        db.ref(`chat_polls/${pollId}/totalVotes`).transaction(total => (total || 0) + 1);
        db.ref(`chat_polls/${pollId}/voters/${nickname}`).set(true);
        showToast("Vote cast!");
    });
}

function renderPollMessage(pollId) {
    db.ref(`chat_polls/${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const container = document.getElementById('chat-messages-container');
        if (!container) return;
        const pollDiv = document.createElement('div');
        pollDiv.className = 'poll-card bg-white rounded-lg p-3 shadow my-2 border relative';
        pollDiv.id = `poll-${poll.id}`;
        
        const deleteBtn = isAdmin ? `<button onclick="deletePoll('${poll.id}')" class="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs bg-white rounded-full p-1 shadow">🗑️</button>` : '';
        
        pollDiv.innerHTML = `
            ${deleteBtn}
            <p class="font-bold">📊 ${escapeHtml(poll.question)}</p>
            <div class="space-y-2 mt-2" id="poll-options-${poll.id}"></div>
            <div class="text-xs text-gray-500 mt-2">${poll.totalVotes || 0} vote(s)</div>
        `;
        container.appendChild(pollDiv);
        updatePollUI(poll.id);
    });
}

function updatePollUI(pollId) {
    db.ref(`chat_polls/${pollId}`).once('value', (snapshot) => {
        const poll = snapshot.val();
        if (!poll) return;
        const optionsContainer = document.getElementById(`poll-options-${pollId}`);
        if (!optionsContainer) return;
        optionsContainer.innerHTML = '';
        const total = poll.totalVotes || 1;
        poll.options.forEach((opt, idx) => {
            const percent = ((opt.votes || 0) / total) * 100;
            optionsContainer.innerHTML += `
                <div class="flex items-center justify-between gap-2 text-sm">
                    <span class="flex-1">${escapeHtml(opt.text)}</span>
                    <span class="w-16 text-right">${opt.votes || 0}</span>
                    <div class="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-emerald-500 rounded-full" style="width: ${percent}%"></div>
                    </div>
                    <button onclick="votePoll(${pollId}, ${idx})" class="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-200">Vote</button>
                </div>
            `;
        });
        const totalSpan = optionsContainer.parentElement?.querySelector('.text-xs');
        if (totalSpan) totalSpan.innerText = `${poll.totalVotes || 0} vote(s)`;
    });
}

function deletePoll(pollId) {
    if (!isAdmin) return;
    if (confirm("Delete this poll permanently?")) {
        db.ref(`chat_polls/${pollId}`).remove();
        db.ref('chat_messages').orderByChild('pollId').equalTo(pollId).once('value', (snapshot) => {
            snapshot.forEach(child => { child.ref.remove(); });
        });
        document.getElementById(`poll-${pollId}`)?.remove();
        showToast("Poll deleted");
    }
}

// ==================== TIME LIMIT (ADMIN‑CONTROLLED) ====================
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

function initRealtimeDatabaseSync() {
    db.ref('tournament_data').on('value', (snapshot) => {
        if (snapshot.exists() && userRole) {
            loadTournamentData(snapshot.val());
        } else if (!snapshot.exists() && userRole === 'admin') {
            document.getElementById('setup-section')?.classList.remove('hidden');
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('deadline-clock')?.classList.add('hidden');
        } else if (!snapshot.exists() && userRole === 'viewer') {
            document.getElementById('dashboard-section')?.classList.add('hidden');
            document.getElementById('setup-section')?.classList.add('hidden');
            const roleSel = document.getElementById('role-selector');
            if (roleSel) {
                roleSel.innerHTML = `
                    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
                        <div class="mb-4">
                            <div class="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <span class="text-3xl">🏆</span>
                            </div>
                            <h2 class="text-2xl font-bold text-gray-800">No Tournament Yet</h2>
                            <p class="text-gray-500 text-sm mt-1">An admin hasn't started a tournament.</p>
                        </div>
                        <button onclick="selectRole('admin')" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition">
                            🔑 Switch to Admin to Create
                        </button>
                    </div>
                `;
            }
        }
    });

    db.ref('tournament_data/fixtures').on('child_changed', (snapshot) => {
        const updated = snapshot.val();
        if (updated && updated.played === true && updated.homeScore !== null) {
            showToast(`📢 Result: ${updated.home} ${updated.homeScore}-${updated.awayScore} ${updated.away}`);
        }
    });

    if (userRole) {
        initChatListener();
    }
}

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
    fixtures.forEach(f => { 
        if (f.played && f.homeScore !== null && !teams[f.home]?.relegated && !teams[f.away]?.relegated) { 
            const total = f.homeScore + f.awayScore; 
            if (!biggestWin || total > biggestWin.total) biggestWin = { home: f.home, away: f.away, homeScore: f.homeScore, awayScore: f.awayScore, total }; 
        } 
    });
    tickerFacts = [`🏆 DLS Vawulence Academy Hub`, `⚽ ${totalTeams} teams`, `📊 ${totalMatchesPlayed}/${totalMatches} played`, leader ? `👑 Leader: ${leader.name} (${leader.pts} pts)` : null, topScorer ? `🔥 Top scorer: ${topScorer.name} (${topScorer.gf} goals)` : null, biggestWin ? `🎯 Biggest win: ${biggestWin.home} ${biggestWin.homeScore}-${biggestWin.awayScore} ${biggestWin.away}` : null, `🔮 Predict matches & post banter!`].filter(f => f);
    if (tickerFacts.length) {
        const el = document.getElementById('news-ticker');
        if (el) el.innerHTML = `<span class="inline-flex items-center gap-2"><span class="w-2 h-2 bg-white rounded-full animate-pulse"></span> ${tickerFacts[0]}</span>`;
        currentTickerFactIndex = 0;
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateTickerFacts, 6000);
    }
}

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
    if (val === tournamentPassword) { 
        closePasswordModal(); 
        activateAdminMode(); 
    } else document.getElementById('password-error').classList.remove('hidden'); 
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
function updateMasterPassword() { const newPass = document.getElementById('new-password').value.trim(), confirmPass = document.getElementById('confirm-password').value.trim(); if (!newPass) { showToast('Password cannot be empty'); return; } if (newPass !== confirmPass) { document.getElementById('password-match-error').classList.remove('hidden'); return; } tournamentPassword = newPass; saveToStorage(); showToast('Master password updated!'); closeChangePasswordModal(); }

// Global scope mapping for Section 2 actions
window.closeChatModal = closeChatModal;
window.sendChatMessage = sendChatMessage;
window.deleteChatMessage = deleteChatMessage;
window.onChatInput = onChatInput;
window.closePollModal = closePollModal;
window.addPollOption = addPollOption;
window.removePollOption = removePollOption;
window.createPoll = createPoll;
window.votePoll = votePoll;
window.deletePoll = deletePoll;
window.handleAdminToggleClick = handleAdminToggleClick;
window.closePasswordModal = closePasswordModal;
window.verifyAdminPassword = verifyAdminPassword;
window.toggleAutoStart = toggleAutoStart;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.updateMasterPassword = updateMasterPassword;

// ==================== ADVANCED PENALTY ====================
function openPenaltyModal(teamName) { 
    if (!isAdmin) return; 
    currentPenaltyTeam = teamName; 
    const team = teams[teamName]; 
    document.getElementById('penalty-team-name').innerText = teamName; 
    document.getElementById('current-penalty').innerText = team.deductedPoints || 0; 
    document.getElementById('penalty-modal').classList.remove('hidden'); 
}

function closePenaltyModal() { 
    document.getElementById('penalty-modal').classList.add('hidden'); 
    currentPenaltyTeam = null; 
}

function adjustPenalty(delta) { 
    if (!currentPenaltyTeam) return; 
    const team = teams[currentPenaltyTeam]; 
    let newVal = (team.deductedPoints || 0) + delta; 
    if (newVal < 0) newVal = 0; 
    team.deductedPoints = newVal; 
    document.getElementById('current-penalty').innerText = newVal; 
    saveToStorage(); 
    renderTable(); 
    showToast(`${currentPenaltyTeam} penalty now ${newVal} pts`); 
}

function clearPenaltyPoints() { 
    if (!currentPenaltyTeam) return; 
    teams[currentPenaltyTeam].deductedPoints = 0; 
    document.getElementById('current-penalty').innerText = "0"; 
    saveToStorage(); 
    renderTable(); 
    showToast(`Penalty cleared for ${currentPenaltyTeam}`); 
    closePenaltyModal(); 
}

// ==================== TOURNAMENT SETUP ====================
function generateTeamInputs() { 
    const count = parseInt(document.getElementById('team-count').value); 
    if (isNaN(count) || count < 2) { alert("Enter at least 2 teams"); return; } 
    const container = document.getElementById('team-inputs-container'); 
    if (!container) return;
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
        if (item.name !== "BYE") teams[item.name] = { name: item.name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: 0, formHistory: [], relegated: false }; 
    }); 
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
    saveToStorage(); 
    showToast(`Tournament launched with ${count} teams!`); 
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
            if (!allResolved && now < deadline) { activeRoundExists = true; break; } 
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
    if (!roundStartTimes[roundNumber]) { showToast(`Round ${roundNumber} hasn't started yet.`); return; } 
    delete roundStartTimes[roundNumber]; 
    saveToStorage(); 
    renderGameweekTabs(); 
    renderFixtures(); 
    showToast(`⏹️ Round ${roundNumber} timer stopped.`); 
}

function shuffleRound(roundNumber) { 
    if (!isAdmin) return; 
    const roundFixtures = fixtures.filter(f => f.round === roundNumber); 
    if (!roundFixtures.length) return; 
    const isAnyPlayed = roundFixtures.some(f => f.played);
    if (isAnyPlayed) {
        showToast("Cannot shuffle: Some matches in this round have already been played!");
        return;
    }
    const matchPairs = roundFixtures.map(f => ({ home: f.home, away: f.away }));
    for (let i = matchPairs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [matchPairs[i], matchPairs[j]] = [matchPairs[j], matchPairs[i]];
    }
    let idx = 0;
    fixtures.forEach(f => {
        if (f.round === roundNumber) {
            f.home = matchPairs[idx].home;
            f.away = matchPairs[idx].away;
            idx++;
        }
    });
    saveToStorage();
    renderFixtures();
    showToast(`🔀 Round ${roundNumber} matches shuffled!`);
}

// ==================== ENGINE CALCULATIONS ====================
function updateTableCalculations() {
    Object.keys(teams).forEach(name => {
        teams[name] = { name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, deductedPoints: teams[name].deductedPoints || 0, formHistory: [], relegated: teams[name].relegated || false };
    });
    fixtures.forEach(f => {
        if (!f.played || f.cancelled || teams[f.home]?.relegated || teams[f.away]?.relegated) return;
        const h = teams[f.home], a = teams[f.away];
        if (!h || !a) return;
        h.mp++; a.mp++;
        h.gf += f.homeScore; h.ga += f.awayScore;
        a.gf += f.awayScore; a.ga += f.homeScore;
        if (f.homeScore > f.awayScore) {
            h.w++; h.pts += 3; h.formHistory.push('W');
            a.l++; a.formHistory.push('L');
        } else if (f.homeScore < f.awayScore) {
            a.w++; a.pts += 3; a.formHistory.push('W');
            h.l++; h.formHistory.push('L');
        } else {
            h.d++; h.pts += 1; h.formHistory.push('D');
            a.d++; a.pts += 1; a.formHistory.push('D');
        }
    });
    Object.keys(teams).forEach(name => {
        const t = teams[name];
        t.gd = t.gf - t.ga;
        t.pts = Math.max(0, t.pts - (t.deductedPoints || 0));
        t.formHistory = t.formHistory.slice(-5);
    });
}

function renderTable() {
    const tbody = document.getElementById('league-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    const sorted = activeTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
    
    sorted.forEach((t, index) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50/50 transition text-sm";
        let rankClass = "text-gray-500 font-medium";
        if (index === 0) rankClass = "text-amber-500 font-bold";
        else if (index === 1) rankClass = "text-slate-400 font-bold";
        else if (index === 2) rankClass = "text-amber-700 font-bold";
        
        let formsHtml = t.formHistory.map(f => {
            if (f === 'W') return `<span class="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded-full">W</span>`;
            if (f === 'D') return `<span class="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full">D</span>`;
            return `<span class="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold bg-rose-100 text-rose-700 rounded-full">L</span>`;
        }).join(' ');

        const adminActionHtml = isAdmin ? `<td class="p-3 text-center"><button onclick="openPenaltyModal('${t.name}')" class="text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 rounded-lg font-medium transition">⚠️ Penalty</button> <button onclick="relegateTeam('${t.name}')" class="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1 rounded-lg font-medium transition ml-1">Relegate</button></td>` : '';

        tr.innerHTML = `
            <td class="p-3 text-center ${rankClass}">${index + 1}</td>
            <td class="p-3 font-semibold text-gray-900 cursor-pointer hover:text-indigo-600" onclick="showTeamDetails('${t.name}')">${escapeHtml(t.name)} ${t.deductedPoints > 0 ? `<span class="text-xs text-rose-500 font-normal">(-${t.deductedPoints})</span>` : ''}</td>
            <td class="p-3 text-center font-medium">${t.mp}</td>
            <td class="p-3 text-center text-gray-600">${t.w}</td>
            <td class="p-3 text-center text-gray-600">${t.d}</td>
            <td class="p-3 text-center text-gray-600">${t.l}</td>
            <td class="p-3 text-center text-gray-500 font-mono">${t.gf}:${t.ga}</td>
            <td class="p-3 text-center font-mono ${t.gd >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${t.gd > 0 ? '+' + t.gd : t.gd}</td>
            <td class="p-3 text-center font-bold text-gray-900">${t.pts}</td>
            <td class="p-3"><div class="flex gap-1 justify-center">${formsHtml || '<span class="text-gray-400 text-xs">-</span>'}</div></td>
            ${adminActionHtml}
        `;
        tbody.appendChild(tr);
    });
}

function renderGameweekTabs() {
    const container = document.getElementById('gameweek-tabs');
    if (!container || !fixtures.length) return;
    container.innerHTML = '';
    const maxRound = Math.max(...fixtures.map(f => f.round));
    for (let i = 1; i <= maxRound; i++) {
        const btn = document.createElement('button');
        const isActive = roundStartTimes[i] ? true : false;
        let activeBadge = isActive ? `<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping absolute top-1 right-1"></span>` : '';
        btn.className = `px-4 py-2 text-sm font-semibold rounded-xl relative transition whitespace-nowrap ${currentSelectedRound === i ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`;
        btn.innerHTML = `GW ${i} ${activeBadge}`;
        btn.onclick = () => { currentSelectedRound = i; renderGameweekTabs(); renderFixtures(); };
        container.appendChild(btn);
    }
}

function renderFixtures() {
    const container = document.getElementById('fixtures-container');
    if (!container) return;
    container.innerHTML = '';
    
    // Header management with timer controls
    const isRoundActive = roundStartTimes[currentSelectedRound] ? true : false;
    let timerHeaderHtml = '';
    if (isAdmin) {
        timerHeaderHtml = `
            <div class="bg-gray-50 rounded-xl p-3 border flex flex-wrap items-center justify-between gap-3 mb-4 text-sm">
                <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-700">GW ${currentSelectedRound} Actions:</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${isRoundActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}">${isRoundActive ? 'Active' : 'Stopped'}</span>
                </div>
                <div class="flex gap-2">
                    <button onclick="startRound(${currentSelectedRound})" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg font-medium transition text-xs">▶ Start Clock</button>
                    <button onclick="stopRound(${currentSelectedRound})" class="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg font-medium transition text-xs">⏹ Stop Clock</button>
                    <button onclick="shuffleRound(${currentSelectedRound})" class="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-1 rounded-lg font-medium transition text-xs">🔀 Shuffle Pairs</button>
                </div>
            </div>
        `;
    }
    container.innerHTML = timerHeaderHtml;

    const roundFixtures = fixtures.filter(f => f.round === currentSelectedRound);
    if (!roundFixtures.length) { container.innerHTML += `<p class="text-gray-400 text-center py-6 text-sm">No fixtures found for this gameweek.</p>`; return; }
    
    roundFixtures.forEach(f => {
        const card = document.createElement('div');
        card.className = `fixture-card border rounded-2xl p-4 shadow-sm transition relative ${f.played ? 'border-gray-100 bg-gray-50/30' : 'border-indigo-100/80 bg-white'}`;
        
        let scoreHtml = `<div class="bg-gray-100 text-gray-400 px-3 py-1 rounded-lg font-mono font-bold text-sm">VS</div>`;
        if (f.played && !f.cancelled) {
            scoreHtml = `<div class="bg-indigo-50 text-indigo-700 px-4 py-1 rounded-lg font-mono font-bold text-lg shadow-sm">${f.homeScore} - ${f.awayScore}</div>`;
        } else if (f.cancelled) {
            scoreHtml = `<div class="bg-rose-50 text-rose-600 px-3 py-1 rounded-lg font-semibold text-xs border border-rose-100">🚫 Cancelled</div>`;
        }

        let actionBtnHtml = '';
        if (isAdmin) {
            if (!f.played && !f.cancelled) {
                actionBtnHtml = `<button onclick="openResultModal(${f.id})" class="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs py-2 rounded-xl font-semibold transition shadow-sm">📥 Enter Result</button>`;
            } else {
                actionBtnHtml = `<button onclick="editFixtureResult(${f.id})" class="mt-3 w-full bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs py-1.5 rounded-xl font-medium transition">✏️ Edit Result</button>`;
            }
        }

        const isHomeRelegated = teams[f.home]?.relegated;
        const isAwayRelegated = teams[f.away]?.relegated;
        if (isHomeRelegated || isAwayRelegated) {
            card.className += " opacity-40 grayscale pointer-events-none";
        }

        card.innerHTML = `
            <div class="flex items-center justify-between gap-4">
                <div class="flex-1 text-right font-semibold text-gray-800 truncate">${escapeHtml(f.home)}</div>
                ${scoreHtml}
                <div class="flex-1 text-left font-semibold text-gray-800 truncate">${escapeHtml(f.away)}</div>
            </div>
            <div class="flex justify-center gap-4 mt-3 pt-2.5 border-t border-gray-100 text-xs">
                <button onclick="openPredictionsModal(${f.id})" class="text-gray-500 hover:text-indigo-600 font-medium flex items-center gap-1">🔮 Predictions (${f.predictions?.length || 0})</button>
                <button onclick="openBanterModal(${f.id})" class="text-gray-500 hover:text-rose-600 font-medium flex items-center gap-1">🔥 Banter (${f.banter?.length || 0})</button>
                <button onclick="openCommentViewer(${f.id})" class="text-gray-500 hover:text-emerald-600 font-medium flex items-center gap-1">📝 Log (${f.events?.length || 0})</button>
            </div>
            ${actionBtnHtml}
        `;
        container.appendChild(card);
    });
}

function startDeadlineClock() {
    setInterval(() => {
        const el = document.getElementById('deadline-clock');
        if (!el) return;
        expireOldFixtures();
        
        if (tournamentPhase === 'knockout') {
            el.innerHTML = `🏁 <span class="font-bold text-indigo-600">Knockout Stage Active</span>`;
            return;
        }
        
        const activeStartTime = roundStartTimes[currentSelectedRound];
        if (!activeStartTime) {
            el.innerHTML = `⏱️ GW ${currentSelectedRound}: <span class="text-gray-400 font-medium">Clock stopped</span>`;
            return;
        }
        
        const now = Date.now();
        const deadline = activeStartTime + 2 * 24 * 60 * 60 * 1000;
        const diff = deadline - now;
        
        if (diff <= 0) {
            el.innerHTML = `⏰ GW ${currentSelectedRound}: <span class="text-rose-600 font-bold">Deadline Passed</span>`;
        } else {
            const days = Math.floor(diff / (24 * 60 * 60 * 1000));
            const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
            const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
            const secs = Math.floor((diff % (60 * 1000)) / 1000);
            el.innerHTML = `⏳ GW ${currentSelectedRound} Ends: <span class="font-bold text-indigo-600">${days}d ${hours}h ${mins}m ${secs}s</span>`;
        }
    }, 1000);
}

// ==================== FIXTURE SUBMISSION MODAL ====================
function openResultModal(fixtureId) {
    if (!isAdmin) return;
    pendingFixtureId = fixtureId;
    const f = fixtures.find(x => x.id === fixtureId);
    if (!f) return;
    document.getElementById('modal-home-name').innerText = f.home;
    document.getElementById('modal-away-name').innerText = f.away;
    document.getElementById('modal-home-score').value = '';
    document.getElementById('modal-away-score').value = '';
    document.getElementById('match-events-container').innerHTML = '';
    document.getElementById('result-modal').classList.remove('hidden');
}

function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
    pendingFixtureId = null;
}

function addMatchEventRow() {
    const container = document.getElementById('match-events-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = "flex gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-100 text-sm animate-fade-in";
    row.innerHTML = `
        <input type="number" placeholder="Min" class="w-14 bg-white border rounded-lg p-1.5 font-mono text-center text-xs">
        <select class="bg-white border rounded-lg p-1.5 text-xs">
            <option value="⚽ Goal">⚽ Goal</option>
            <option value="🟨 Yellow">🟨 Yellow</option>
            <option value="🟥 Red Card">🟥 Red Card</option>
            <option value="🎯 Assist">🎯 Assist</option>
            <option value="❌ Penalty Miss">❌ Miss</option>
        </select>
        <input type="text" placeholder="Player name / details" class="flex-1 bg-white border rounded-lg p-1.5 text-xs">
        <button onclick="this.parentElement.remove()" class="text-rose-500 p-1 hover:bg-rose-50 rounded-lg">✖</button>
    `;
    container.appendChild(row);
}

function submitFixtureResult() {
    if (pendingFixtureId === null) return;
    const homeInp = document.getElementById('modal-home-score').value;
    const awayInp = document.getElementById('modal-away-score').value;
    if (homeInp === '' || awayInp === '') { alert('Enter scores for both sides'); return; }
    
    const hScore = parseInt(homeInp);
    const aScore = parseInt(awayInp);
    const f = fixtures.find(x => x.id === pendingFixtureId);
    if (!f) return;
    
    f.homeScore = hScore;
    f.awayScore = aScore;
    f.played = true;
    f.cancelled = false;
    
    // Parse event logs
    f.events = [];
    document.querySelectorAll('#match-events-container > div').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const sel = row.querySelector('select');
        const minute = inputs[0].value.trim() || '0';
        const type = sel.value;
        const detail = inputs[1].value.trim() || 'Action';
        f.events.push({ minute, type, detail });
    });
    
    updateTableCalculations();
    renderTable();
    renderFixtures();
    generateTickerFacts();
    checkAndCelebrateChampion();
    saveToStorage();
    closeResultModal();
    showToast(`Result saved: ${f.home} ${hScore}-${aScore} ${f.away}`);
}

function editFixtureResult(fixtureId) {
    if (!isAdmin) return;
    const f = fixtures.find(x => x.id === fixtureId);
    if (!f) return;
    openResultModal(fixtureId);
    document.getElementById('modal-home-score').value = f.homeScore;
    document.getElementById('modal-away-score').value = f.awayScore;
    const container = document.getElementById('match-events-container');
    if (container && f.events) {
        f.events.forEach(ev => {
            const row = document.createElement('div');
            row.className = "flex gap-2 items-center bg-gray-50 p-2 rounded-xl border border-gray-100 text-sm";
            row.innerHTML = `
                <input type="number" value="${ev.minute}" class="w-14 bg-white border rounded-lg p-1.5 font-mono text-center text-xs">
                <select class="bg-white border rounded-lg p-1.5 text-xs">
                    <option value="⚽ Goal" ${ev.type==='⚽ Goal'?'selected':''}>⚽ Goal</option>
                    <option value="🟨 Yellow" ${ev.type==='🟨 Yellow'?'selected':''}>🟨 Yellow</option>
                    <option value="🟥 Red Card" ${ev.type==='🟥 Red Card'?'selected':''}>🟥 Red Card</option>
                    <option value="🎯 Assist" ${ev.type==='🎯 Assist'?'selected':''}>🎯 Assist</option>
                    <option value="❌ Penalty Miss" ${ev.type==='❌ Penalty Miss'?'selected':''}>❌ Miss</option>
                </select>
                <input type="text" value="${ev.detail}" class="flex-1 bg-white border rounded-lg p-1.5 text-xs">
                <button onclick="this.parentElement.remove()" class="text-rose-500 p-1 hover:bg-rose-50 rounded-lg">✖</button>
            `;
            container.appendChild(row);
        });
    }
}

// ==================== INTERACTIVE COMMMENT LOG VIEW ====================
function openCommentViewer(fixtureId) {
    currentViewerFixtureId = fixtureId;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === fixtureId) : fixtures.find(x => x.id === fixtureId);
    if (!f) return;
    document.getElementById('viewer-match-title').innerText = `${f.home} vs ${f.away}`;
    const container = document.getElementById('viewer-events-list');
    if (!container) return;
    container.innerHTML = '';
    
    if (f.events && f.events.length > 0) {
        // Sort events chronologically by minute
        const sortedEvents = [...f.events].sort((a,b) => parseInt(a.minute) - parseInt(b.minute));
        sortedEvents.forEach((ev, index) => {
            const div = document.createElement('div');
            div.className = "flex items-start gap-3 bg-gray-50 p-2.5 rounded-xl border border-gray-100 text-xs";
            const adminDelBtn = isAdmin ? `<button onclick="editViewerEvents(${index})" class="text-rose-500 font-semibold hover:underline ml-auto">Delete</button>` : '';
            div.innerHTML = `
                <span class="bg-indigo-100 text-indigo-700 font-mono px-1.5 py-0.5 rounded text-[10px] font-bold">${ev.minute}'</span>
                <span class="font-medium">${ev.type}</span>
                <span class="text-gray-600 flex-1">${escapeHtml(ev.detail)}</span>
                ${adminDelBtn}
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = `<p class="text-gray-400 text-center py-4">No events logged for this game yet.</p>`;
    }
    document.getElementById('comment-viewer-modal').classList.remove('hidden');
}

function closeCommentViewer() {
    document.getElementById('comment-viewer-modal').classList.add('hidden');
    currentViewerFixtureId = null;
}

function editViewerEvents(index) {
    if (!isAdmin || currentViewerFixtureId === null) return;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === currentViewerFixtureId) : fixtures.find(x => x.id === currentViewerFixtureId);
    if (f && f.events) {
        f.events.splice(index, 1);
        saveToStorage();
        openCommentViewer(currentViewerFixtureId);
        renderFixtures();
        renderKnockoutBracket();
        showToast("Logged event cleared");
    }
}

// ==================== PREDICTIONS MODAL ====================
function openPredictionsModal(fixtureId) {
    currentPredictionFixtureId = fixtureId;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === fixtureId) : fixtures.find(x => x.id === fixtureId);
    if (!f) return;
    document.getElementById('predict-match-title').innerText = `${f.home} vs ${f.away}`;
    document.getElementById('predict-name').value = localStorage.getItem('predictUserNickname') || '';
    document.getElementById('predict-home').value = '';
    document.getElementById('predict-away').value = '';
    
    renderPredictionsList(f);
    document.getElementById('predictions-modal').classList.remove('hidden');
}

function closePredictionsModal() {
    document.getElementById('predictions-modal').classList.add('hidden');
    currentPredictionFixtureId = null;
}

function renderPredictionsList(fixture) {
    const container = document.getElementById('predictions-list-container');
    if (!container) return;
    container.innerHTML = '';
    if (fixture.predictions && fixture.predictions.length > 0) {
        fixture.predictions.forEach((p, index) => {
            const div = document.createElement('div');
            div.className = "prediction-item flex items-center justify-between text-xs";
            const delBtn = (isAdmin || localStorage.getItem('predictUserNickname') === p.name) ? `<button onclick="deletePrediction(${index})" class="prediction-delete-btn text-rose-500 font-bold hover:bg-rose-50 p-1 rounded">✖</button>` : '';
            div.innerHTML = `
                <span class="font-semibold text-gray-700">${escapeHtml(p.name)}:</span>
                <span class="font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-bold">${p.homeScore} - ${p.awayScore}</span>
                ${delBtn}
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = `<p class="text-gray-400 text-center py-2">No forecasts submitted yet. Make yours!</p>`;
    }
}

function submitPrediction() {
    if (currentPredictionFixtureId === null) return;
    const name = document.getElementById('predict-name').value.trim();
    const hScore = document.getElementById('predict-home').value.trim();
    const aScore = document.getElementById('predict-away').value.trim();
    if (!name || hScore === '' || aScore === '') { alert("Please complete all forecast fields"); return; }
    
    localStorage.setItem('predictUserNickname', name);
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === currentPredictionFixtureId) : fixtures.find(x => x.id === currentPredictionFixtureId);
    if (!f) return;
    if (!f.predictions) f.predictions = [];
    
    f.predictions.push({ name: name.slice(0,20), homeScore: parseInt(hScore), awayScore: parseInt(aScore) });
    saveToStorage();
    renderPredictionsList(f);
    renderFixtures();
    renderKnockoutBracket();
    showToast("Forecast submitted successfully!");
}

function deletePrediction(index) {
    if (currentPredictionFixtureId === null) return;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === currentPredictionFixtureId) : fixtures.find(x => x.id === currentPredictionFixtureId);
    if (f && f.predictions) {
        f.predictions.splice(index, 1);
        saveToStorage();
        renderPredictionsList(f);
        renderFixtures();
        renderKnockoutBracket();
        showToast("Prediction removed");
    }
}

// ==================== BANTER ROOM MODAL ====================
function openBanterModal(fixtureId) {
    currentBanterFixtureId = fixtureId;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === fixtureId) : fixtures.find(x => x.id === fixtureId);
    if (!f) return;
    document.getElementById('banter-match-title').innerText = `${f.home} vs ${f.away}`;
    document.getElementById('banter-name').value = localStorage.getItem('banterUserNickname') || '';
    document.getElementById('banter-msg').value = '';
    
    renderBanterList(f);
    document.getElementById('banter-modal').classList.remove('hidden');
}

// Mapping globally
window.closeBanterModal = () => { document.getElementById('banter-modal').classList.add('hidden'); currentBanterFixtureId = null; };

function renderBanterList(fixture) {
    const container = document.getElementById('banter-messages-container');
    if (!container) return;
    container.innerHTML = '';
    if (fixture.banter && fixture.banter.length > 0) {
        fixture.banter.forEach((b, index) => {
            const div = document.createElement('div');
            div.className = "banter-message text-xs flex flex-col gap-1 relative";
            const delBtn = (isAdmin || localStorage.getItem('banterUserNickname') === b.name) ? `<button onclick="deleteBanter(${index})" class="banter-delete-btn text-rose-500 font-bold absolute top-2 right-2 hover:bg-rose-50 px-1 rounded">✖</button>` : '';
            div.innerHTML = `
                <div class="flex items-center gap-1.5"><span class="font-bold text-gray-800">${escapeHtml(b.name)}</span><span class="text-[10px] text-gray-400 font-mono">${b.time || ''}</span></div>
                <p class="text-gray-600 font-normal break-words pr-5">${escapeHtml(b.message)}</p>
                ${delBtn}
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = `<p class="text-gray-400 text-center py-4">Silence here. Inject some trash-talk/banter!</p>`;
    }
}

function postBanter() {
    if (currentBanterFixtureId === null) return;
    const name = document.getElementById('banter-name').value.trim();
    const msg = document.getElementById('banter-msg').value.trim();
    if (!name || !msg) { alert("Complete your credentials and message"); return; }
    
    localStorage.setItem('banterUserNickname', name);
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === currentBanterFixtureId) : fixtures.find(x => x.id === currentBanterFixtureId);
    if (!f) return;
    if (!f.banter) f.banter = [];
    
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    f.banter.push({ name: name.slice(0,20), message: msg.slice(0,140), time: timeStr });
    saveToStorage();
    renderBanterList(f);
    renderFixtures();
    renderKnockoutBracket();
    showToast("Banter fired!");
    document.getElementById('banter-msg').value = '';
}

function deleteBanter(index) {
    if (currentBanterFixtureId === null) return;
    const f = (tournamentPhase === 'knockout') ? knockoutMatches.find(x => x.id === currentBanterFixtureId) : fixtures.find(x => x.id === currentBanterFixtureId);
    if (f && f.banter) {
        f.banter.splice(index, 1);
        saveToStorage();
        renderBanterList(f);
        renderFixtures();
        renderKnockoutBracket();
        showToast("Banter removed");
    }
}

// ==================== RELEGATION SYSTEM ====================
function relegateTeam(teamName) {
    if (!isAdmin) return;
    if (confirm(`Are you sure you want to RELEGATE ${teamName}? This cancels their pending fixtures.`)) {
        teams[teamName].relegated = true;
        updateTableCalculations();
        renderTable();
        renderFixtures();
        renderRelegatedTeams();
        generateTickerFacts();
        saveToStorage();
        showToast(`${teamName} has been relegated.`);
    }
}

function restoreTeam(teamName) {
    if (!isAdmin) return;
    if (confirm(`Restore ${teamName} back to active competition status?`)) {
        teams[teamName].relegated = false;
        updateTableCalculations();
        renderTable();
        renderFixtures();
        renderRelegatedTeams();
        generateTickerFacts();
        saveToStorage();
        showToast(`${teamName} restored to league standings.`);
    }
}

function renderRelegatedTeams() {
    const container = document.getElementById('relegated-list');
    if (!container) return;
    container.innerHTML = '';
    const relegated = Object.values(teams).filter(t => t.relegated);
    if (!relegated.length) {
        container.innerHTML = `<p class="text-xs text-gray-400">No clubs relegated yet.</p>`;
        return;
    }
    relegated.forEach(t => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 text-xs";
        const actionBtn = isAdmin ? `<button onclick="restoreTeam('${t.name}')" class="text-[10px] bg-white text-emerald-600 hover:bg-emerald-50 px-2 py-0.5 rounded border font-medium">Restore</button>` : '';
        div.innerHTML = `<span class="font-semibold text-red-700">📉 ${escapeHtml(t.name)}</span> ${actionBtn}`;
        container.appendChild(div);
    });
}

// ==================== INTERACTIVE TEAM STATS OVERLAY ====================
function showTeamDetails(teamName) {
    const t = teams[teamName];
    if (!t) return;
    document.getElementById('team-modal-title').innerText = t.name;
    document.getElementById('stat-mp').innerText = t.mp;
    document.getElementById('stat-w').innerText = t.w;
    document.getElementById('stat-d').innerText = t.d;
    document.getElementById('stat-l').innerText = t.l;
    document.getElementById('stat-gf').innerText = t.gf;
    document.getElementById('stat-ga').innerText = t.ga;
    document.getElementById('stat-gd').innerText = t.gd > 0 ? '+' + t.gd : t.gd;
    document.getElementById('stat-pts').innerText = t.pts;
    
    const opponentList = document.getElementById('team-opponent-history');
    if (opponentList) {
        opponentList.innerHTML = '';
        const teamGames = fixtures.filter(f => f.played && (f.home === teamName || f.away === teamName));
        if (!teamGames.length) {
            opponentList.innerHTML = `<p class="text-xs text-gray-400 py-1 text-center">No structural matches completed yet.</p>`;
        } else {
            teamGames.forEach(g => {
                const isHome = g.home === teamName;
                const opp = isHome ? g.away : g.home;
                const tScore = isHome ? g.homeScore : g.awayScore;
                const oScore = isHome ? g.awayScore : g.homeScore;
                let outcomeBadge = '<span class="text-gray-500 font-bold">D</span>';
                if (tScore > oScore) outcomeBadge = '<span class="text-emerald-600 font-bold">W</span>';
                else if (tScore < oScore) outcomeBadge = '<span class="text-rose-600 font-bold">L</span>';
                opponentList.innerHTML += `<div class="flex items-center justify-between text-xs bg-gray-50 p-1.5 rounded-lg border border-gray-100"><span>vs <b>${escapeHtml(opp)}</b></span><span class="font-mono">${tScore}-${oScore} (${outcomeBadge})</span></div>`;
            });
        }
    }
    document.getElementById('team-details-modal').classList.remove('hidden');
}

function closeTeamModal() {
    document.getElementById('team-details-modal').classList.add('hidden');
}

// ==================== TOURNAMENT KNOCKOUT BRACKET STAGE ====================
function transitionToKnockoutStage() {
    if (!isAdmin) return;
    const activeTeams = Object.values(teams).filter(t => !t.relegated);
    const sorted = activeTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
    if (sorted.length < 4) { alert("Need at least 4 active teams to form a standard top 4 playoff structure!"); return; }
    
    if (!confirm("Generate top 4 knockout bracket playoffs now? This phase locks down standard league modifications.")) return;
    
    tournamentPhase = 'knockout';
    knockoutMatches = [
        { id: 101, round: 'Semifinal 1', home: sorted[0].name, away: sorted[3].name, homeScore: null, awayScore: null, played: false, comment: null, predictions: [], banter: [], events: [] },
        { id: 102, round: 'Semifinal 2', home: sorted[1].name, away: sorted[2].name, homeScore: null, awayScore: null, played: false, comment: null, predictions: [], banter: [], events: [] },
        { id: 103, round: 'Finals', home: 'TBD', away: 'TBD', homeScore: null, awayScore: null, played: false, comment: null, predictions: [], banter: [], events: [] }
    ];
    saveToStorage();
    renderKnockoutBracket();
    showToast("Playoff Knockout Brackets constructed!");
}

function renderKnockoutBracket() {
    const container = document.getElementById('knockout-bracket-container');
    if (!container) return;
    if (tournamentPhase !== 'knockout' || !knockoutMatches.length) {
        container.innerHTML = `<div class="text-center py-6"><p class="text-gray-400 text-sm mb-3">Knockout phase establishes immediately following regular season resolution.</p>${isAdmin?`<button onclick="transitionToKnockoutStage()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-4 py-2 rounded-xl font-semibold shadow-md transition">🏆 Initialize Playoff Top 4</button>`:''}</div>`;
        return;
    }
    container.innerHTML = '';
    
    knockoutMatches.forEach(m => {
        const div = document.createElement('div');
        div.className = "bg-white border border-indigo-50 p-4 rounded-2xl shadow-sm relative space-y-3";
        let scoreStr = "VS";
        if (m.played) scoreStr = `${m.homeScore} - ${m.awayScore}`;
        
        let actionBtnHtml = '';
        if (isAdmin) {
            actionBtnHtml = `<button onclick="openKnockoutResultModal(${m.id})" class="w-full bg-slate-800 hover:bg-slate-900 text-white text-[11px] py-1.5 rounded-lg font-medium transition">📥 Record Playoff Score</button>`;
        }
        
        div.innerHTML = `
            <div class="text-[10px] uppercase font-bold text-indigo-600 tracking-wider text-center border-b pb-1.5 border-gray-100">${m.round}</div>
            <div class="flex justify-between items-center text-xs font-semibold px-1">
                <span class="truncate w-24 text-right">${escapeHtml(m.home)}</span>
                <span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-mono font-bold text-sm mx-2">${scoreStr}</span>
                <span class="truncate w-24 text-left">${escapeHtml(m.away)}</span>
            </div>
            <div class="flex justify-center gap-3 pt-2 text-[10px] border-t border-gray-50">
                <button onclick="openPredictionsModal(${m.id})" class="text-gray-500 hover:text-indigo-600">🔮 Forecasts (${m.predictions?.length || 0})</button>
                <button onclick="openBanterModal(${m.id})" class="text-gray-500 hover:text-rose-600">🔥 Banter (${m.banter?.length || 0})</button>
                <button onclick="openCommentViewer(${m.id})" class="text-gray-500 hover:text-emerald-600">📝 Logs (${m.events?.length || 0})</button>
            </div>
            ${actionBtnHtml}
        `;
        container.appendChild(div);
    });
}

function openKnockoutResultModal(matchId) {
    if (!isAdmin) return;
    pendingFixtureId = matchId;
    const m = knockoutMatches.find(x => x.id === matchId);
    if (!m) return;
    document.getElementById('modal-home-name').innerText = m.home;
    document.getElementById('modal-away-name').innerText = m.away;
    document.getElementById('modal-home-score').value = m.homeScore !== null ? m.homeScore : '';
    document.getElementById('modal-away-score').value = m.awayScore !== null ? m.awayScore : '';
    document.getElementById('match-events-container').innerHTML = '';
    
    // Override submission button behavior temporarily for knockout matches
    const subBtn = document.querySelector("#result-modal button[onclick='submitFixtureResult()']");
    if (subBtn) subBtn.setAttribute('onclick', 'saveKnockoutResult()');
    
    document.getElementById('result-modal').classList.remove('hidden');
}

function saveKnockoutResult() {
    if (pendingFixtureId === null) return;
    const hScore = parseInt(document.getElementById('modal-home-score').value);
    const aScore = parseInt(document.getElementById('modal-away-score').value);
    if (isNaN(hScore) || isNaN(aScore)) { alert("Enter proper scores"); return; }
    
    if (hScore === aScore) { alert("Knockout matches cannot end in a draw! Include penalty shootouts in score or resolve winner."); return; }
    
    const m = knockoutMatches.find(x => x.id === pendingFixtureId);
    if (!m) return;
    m.homeScore = hScore;
    m.awayScore = aScore;
    m.played = true;
    
    // Parse event logs
    m.events = [];
    document.querySelectorAll('#match-events-container > div').forEach(row => {
        const inputs = row.querySelectorAll('input');
        const sel = row.querySelector('select');
        const minute = inputs[0].value.trim() || '0';
        const type = sel.value;
        const detail = inputs[1].value.trim() || 'Action';
        m.events.push({ minute, type, detail });
    });
    
    const semi1 = knockoutMatches.find(x => x.round === 'Semifinal 1');
    const semi2 = knockoutMatches.find(x => x.round === 'Semifinal 2');
    const fin = knockoutMatches.find(x => x.round === 'Finals');
    
    if (m.round.startsWith('Semifinal')) {
        let w1 = semi1.played ? (semi1.homeScore > semi1.awayScore ? semi1.home : semi1.away) : 'TBD';
        let w2 = semi2.played ? (semi2.homeScore > semi2.awayScore ? semi2.home : semi2.away) : 'TBD';
        if (fin) { fin.home = w1; fin.away = w2; }
    }
    
    saveToStorage();
    renderKnockoutBracket();
    checkAndCelebrateChampion();
    closeResultModal();
    showToast("Playoff match results recorded.");
    
    // Restore button reference back to standard league callback
    const subBtn = document.querySelector("#result-modal button[onclick='saveKnockoutResult()']");
    if (subBtn) subBtn.setAttribute('onclick', 'submitFixtureResult()');
}

function checkAndCelebrateChampion() {
    let champ = null;
    if (tournamentPhase === 'knockout') {
        const fin = knockoutMatches.find(x => x.round === 'Finals');
        if (fin && fin.played) champ = fin.homeScore > fin.awayScore ? fin.home : fin.away;
    } else if (fixtures.length > 0) {
        const activeTeams = Object.values(teams).filter(t => !t.relegated);
        const totalMatches = fixtures.filter(f => !teams[f.home]?.relegated && !teams[f.away]?.relegated);
        const playedCount = totalMatches.filter(x => x.played || x.cancelled).length;
        if (playedCount === totalMatches.length && activeTeams.length) {
            const sorted = activeTeams.sort((a, b) => b.pts - a.pts || b.gd - a.gd);
            champ = sorted[0].name;
        }
    }
    if (champ && champ !== 'TBD') {
        setTimeout(() => {
            if (typeof confetti === 'function') {
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            }
            alert(`🎉🏆 CELEBRATIONS! ${champ} has formally secured the Tournament Championship! 🏆🎉`);
        }, 800);
    }
}

// ==================== SYSTEM HARD RESET ====================
function resetTournament() {
    if (!isAdmin) return;
    if (!confirm("⚠️ CRITICAL ALIGNMENT ALERT! This entirely purges your current tournament standings, chat records, polls, and parameters from database forever. Continue?")) return;
    const entry = prompt("To confirm master wipe operation, type 'DESTROY':");
    if (entry !== 'DESTROY') { alert("Wipe sequence cancelled."); return; }
    
    db.ref('tournament_data').remove();
    db.ref('chat_messages').remove();
    db.ref('chat_polls').remove();
    db.ref('chat_typing').remove();
    
    showToast("All localized cloud storage wiped cleanly.");
    setTimeout(() => { location.reload(); }, 1000);
}

// Initializing the application runtime context
window.addEventListener('DOMContentLoaded', () => {
    const cachedRole = sessionStorage.getItem('tournamentRole');
    if (cachedRole) {
        userRole = cachedRole;
        if (cachedRole === 'admin') isAdmin = true;
        document.getElementById('role-selector').style.display = 'none';
        checkAndLoadTournament();
    }
    initRealtimeDatabaseSync();
});

// Complete window global export binding layer
window.openPenaltyModal = openPenaltyModal;
window.closePenaltyModal = closePenaltyModal;
window.adjustPenalty = adjustPenalty;
window.clearPenaltyPoints = clearPenaltyPoints;
window.generateTeamInputs = generateTeamInputs;
window.initializeTournament = initializeTournament;
window.startRound = startRound;
window.stopRound = stopRound;
window.shuffleRound = shuffleRound;
window.openResultModal = openResultModal;
window.closeResultModal = closeResultModal;
window.addMatchEventRow = addMatchEventRow;
window.submitFixtureResult = submitFixtureResult;
window.openCommentViewer = openCommentViewer;
window.editViewerEvents = editViewerEvents;
window.openPredictionsModal = openPredictionsModal;
window.closePredictionsModal = closePredictionsModal;
window.submitPrediction = submitPrediction;
window.deletePrediction = deletePrediction;
window.openBanterModal = openBanterModal;
window.postBanter = postBanter;
window.deleteBanter = deleteBanter;
window.relegateTeam = relegateTeam;
window.restoreTeam = restoreTeam;
window.showTeamDetails = showTeamDetails;
window.closeTeamModal = closeTeamModal;
window.transitionToKnockoutStage = transitionToKnockoutStage;
window.saveKnockoutResult = saveKnockoutResult;
window.resetTournament = resetTournament;