/* ==========================================================================
   CRAVE — Viewer (fixed vote flow)
   ========================================================================== */

import {
  DB, subscribe, onData,
  createOrder as fbCreateOrder,
  setOrderStatus as fbSetOrderStatus,
} from './db.js';

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const num   = n => Number(n).toLocaleString('en-US');
const rnd   = n => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,n).padEnd(n,'X');
const pad2  = n => String(n).padStart(2,'0');
const initials = n => String(n).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const roman = n => ['','I','II','III','IV','V','VI','VII','VIII','IX','X'][n] || String(n);

const FALLBACK_SETTINGS = {
  eventName:'CRAVE',
  tagline:'Best Fashionista of the Year 2026',
  pricePerVote:3,
  deadline:'2026-12-31T23:59',
  bundles:[
    { votes:1,  price:3,   bonus:0  },
    { votes:5,  price:15,  bonus:0  },
    { votes:10, price:30,  bonus:1  },
    { votes:25, price:75,  bonus:4  },
    { votes:50, price:150, bonus:12 },
  ],
  coins:[
    { id:'BTC',  label:'Bitcoin',  network:'Bitcoin network', address:'bc1q9x8caveexamplereceivingaddress7f3k2' },
    { id:'ETH',  label:'Ethereum', network:'ERC-20',          address:'0xC4Ve0000000000000000000000000000000000' },
    { id:'USDT', label:'USDT',     network:'TRC-20',          address:'TCaveUsdtTrc20ExampleAddress9xQ2' },
    { id:'SOL',  label:'Solana',   network:'Solana',          address:'CaveSoLanaExampleAddr1111111111111111111' },
  ],
  giftBrands:[
    { id:'amazon', label:'Amazon Gift Card',         note:'Buy a $25 / $50 / $100 Amazon card, then enter the claim code below.' },
    { id:'apple',  label:'Apple / iTunes Gift Card', note:'Scratch the back and enter the 16-character code.' },
    { id:'steam',  label:'Steam Wallet Card',        note:'Enter the Steam wallet code exactly as printed.' },
    { id:'visa',   label:'Visa / Vanilla Prepaid',   note:'Enter the card number, expiry and CVV, plus the purchase receipt number.' },
  ],
};

/* -------- LIVE STATE -------- */
let S = { settings: FALLBACK_SETTINGS, contestants: [], orders: [] };

function refreshState(){
  S.settings    = Object.assign({}, FALLBACK_SETTINGS, DB.settings || {});
  S.contestants = Object.entries(DB.contestants || {}).map(([id,c]) => ({ id, ...c }));
  S.orders      = Object.entries(DB.orders      || {}).map(([id,o]) => ({ id, ...o }));
}

/* -------- DERIVED -------- */
function votesFor(cid){
  const c = S.contestants.find(x => x.id === cid);
  return c ? (Number(c.votes) || 0) : 0;
}
function leaderboard(){
  return S.contestants
    .filter(c => c.status !== 'hidden')
    .map(c => ({ ...c, votes: votesFor(c.id) }))
    .sort((a,b) => b.votes - a.votes);
}
function rankOf(cid){
  const i = leaderboard().findIndex(c => c.id === cid);
  return i < 0 ? null : i + 1;
}
function totalVotesCast(){ return S.contestants.reduce((a,c) => a + votesFor(c.id), 0); }
function pendingOrders(){ return S.orders.filter(o => o.status === 'pending'); }

/* -------- TOAST -------- */
function toast(msg, kind=''){
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='.3s'; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

/* -------- SHARED -------- */
function initialChar(c){ return esc((c.name || '?').trim()[0] || '?'); }

function portraitHTML(c, extra=''){
  const grad = `linear-gradient(150deg, ${esc(c.c1||'#c9a96a')}, ${esc(c.c2||'#1a140e')})`;
  if (c.photo){
    return `<div class="podium-portrait ${extra}" style="background:#000">
      <img src="${esc(c.photo)}" alt="${esc(c.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    </div>`;
  }
  return `<div class="podium-portrait ${extra}" style="background:${grad}">
    <span class="podium-initial">${initialChar(c)}</span>
  </div>`;
}
function tileHTML(c){
  const grad = `linear-gradient(150deg, ${esc(c.c1||'#c9a96a')}, ${esc(c.c2||'#1a140e')})`;
  if (c.photo) return `<div class="roster-tile" style="background:#000"><img src="${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></div>`;
  return `<div class="roster-tile" style="background:${grad}">${initialChar(c)}</div>`;
}
function contestantUrl(slug){
  return location.origin + location.pathname + location.search + '#/c/' + slug;
}
function shareMessage(c){
  return `Help me win Best Fashionista of the Year at ${S.settings.eventName}! Every vote counts — vote for ${c.name} here:`;
}

/* -------- HEADER / FOOTER -------- */
function tickerHTML(){
  const items = [
    `Best Fashionista of the Year 2026`,
    `One vote — ${money(S.settings.pricePerVote)}`,
    `Crypto or gift card`,
    `${num(totalVotesCast())} votes cast`,
    `Closes ${new Date(S.settings.deadline).toLocaleDateString('en-US',{month:'long',day:'numeric'})}`,
    `Share your link to win`,
  ];
  const body = items.map(i => `<span class="ticker-item">${esc(i)}</span>`).join('');
  return `<div class="ticker"><div class="ticker-track">${body}${body}</div></div>`;
}
function navHTML(){
  return `
  <nav class="nav">
    <div class="nav-inner">
      <a class="brand" href="#/">
        <span class="brand-mark">CRAVE</span>
        <span class="brand-sub">Best Fashionista · 2026</span>
      </a>
      <div class="nav-links">
        <a href="#standings">Standings</a>
        <a href="#how">Method</a>
        <a href="#standings" class="nav-cta">Vote now</a>
      </div>
    </div>
  </nav>`;
}
function footerHTML(){
  return `
  <footer>
    <div class="foot-inner">
      <div>
        <div class="foot-brand">CRAVE<em>©</em></div>
        <div class="foot-meta">${esc(S.settings.tagline)} · Votes final once confirmed</div>
      </div>
      <div class="foot-right">
        <a href="#standings">Standings</a>
        <a href="#how">Rules</a>
      </div>
    </div>
  </footer>`;
}

/* ==========================================================================
   HOME
   ========================================================================== */
function renderHome(){
  const board = leaderboard();
  const top3 = board.slice(0,3);
  const rest = board.slice(3);
  const max  = board[0]?.votes || 1;

  $('#app').innerHTML = `
  ${tickerHTML()}
  ${navHTML()}

  <section class="hero">
    <div class="hero-left">
      <div>
        <div class="hero-kicker">
          <span class="live-dot"></span>
          <span>Voting open · ${num(board.length)} contenders</span>
        </div>
        <h1 class="display">
          <span class="word">Vote for the</span>
          <span class="word"><em>Fashionista</em></span>
          <span class="word">of the year</span>
        </h1>
        <p class="hero-blurb">
          One vote costs <b>${money(S.settings.pricePerVote)}</b>. Pay with crypto or a gift card.
          Your vote is counted the instant payment clears. Share your link. Rally your people.
        </p>
      </div>
      <div class="hero-bottom">
        <div class="hero-cta-row">
          <a class="btn-hero" href="#standings">
            See the standings
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 8h10M9 4l4 4-4 4"/>
            </svg>
          </a>
          <a class="btn-hero-ghost" href="#how">How it works</a>
        </div>
        <div class="hero-index">
          <span>Issue</span>
          <b>N°01</b>
        </div>
      </div>
    </div>

    <aside class="hero-right">
      <div class="vote-card">
        <div class="vote-card-head">
          <span class="vote-card-live"><i></i> Voting open</span>
          <span class="vote-card-ref">MMXXVI</span>
        </div>
        <div class="vote-card-countdown">
          <div class="vcc-label">Closes in</div>
          <div class="countdown" id="countdown"></div>
        </div>
        <div class="vote-card-price">
          <span class="vcp-label">Per vote</span>
          <span class="vcp-value">${money(S.settings.pricePerVote)}</span>
        </div>
        <a class="vote-card-cta" href="#standings">
          <span>Vote for someone</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M3 8h10M9 4l4 4-4 4"/>
          </svg>
        </a>
        <div class="vote-card-foot">
          <span>${num(totalVotesCast())} votes cast</span>
          <span>${num(pendingOrders().length)} pending</span>
        </div>
      </div>
    </aside>
  </section>

  <section class="section wrap" id="standings">
    <div class="section-head">
      <span class="section-num">02 / Standings</span>
      <h2 class="section-title">The <em>contenders</em></h2>
      <div class="section-meta">
        Total votes
        <b>${num(totalVotesCast())}</b>
      </div>
    </div>

    ${top3.length >= 3 ? `
    <div class="podium">
      ${top3.map((c,i) => `
        <button class="podium-card" data-place="${i+1}" data-open="${esc(c.slug)}">
          <div class="podium-rank">${pad2(i+1)}</div>
          <div class="podium-badge">${i===0?'Leading':i===1?'Second':'Third'}</div>
          ${portraitHTML(c)}
          <div class="podium-info">
            <div class="podium-name">${esc(c.name)}</div>
            <div class="podium-tag">${esc(c.tagline||'')}</div>
            <div class="podium-votes">
              <b>${num(c.votes)}</b>
              <span>votes</span>
            </div>
          </div>
        </button>`).join('')}
    </div>` : ''}

    ${rest.length ? `
    <div class="roster">
      <div class="roster-header">
        <span>Rank</span>
        <span></span>
        <span>Contender</span>
        <span>Progress</span>
        <span></span>
      </div>
      ${rest.map((c,i) => {
        const rank = i+4;
        const pct = Math.max(2, Math.round((c.votes / max) * 100));
        return `
        <div class="roster-row" data-open="${esc(c.slug)}">
          <div class="roster-num">${pad2(rank)}</div>
          ${tileHTML(c)}
          <div class="roster-body">
            <div class="roster-name">${esc(c.name)}</div>
            <div class="roster-tag">${esc(c.tagline||'')}</div>
          </div>
          <div class="roster-bar-wrap">
            <div class="roster-bar"><i style="width:${pct}%"></i></div>
            <div class="roster-stats">
              <b>${num(c.votes)}</b>
              <span>${pct}%</span>
            </div>
          </div>
          <button class="roster-vote" data-vote="${esc(c.id)}">Vote</button>
        </div>`;
      }).join('')}
    </div>` : ''}
  </section>

  <section class="section wrap" id="how">
    <div class="section-head">
      <span class="section-num">03 / Method</span>
      <h2 class="section-title">How it <em>works</em></h2>
      <div class="section-meta">Four steps</div>
    </div>
    <div class="how">
      <div class="how-step">
        <div class="how-step-num">01</div>
        <h3>Pick a contender</h3>
        <p>Browse the standings and open the profile of the designer or stylist you want to win.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">02</div>
        <h3>Buy votes</h3>
        <p>Each vote is ${money(S.settings.pricePerVote)}. Bundles carry bonus votes — bigger is better value.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">03</div>
        <h3>Pay your way</h3>
        <p>Crypto confirms automatically. Gift cards are reviewed by a human, usually within hours.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">04</div>
        <h3>Share the link</h3>
        <p>Every contestant has a personal link. Share it and rally your people.</p>
      </div>
    </div>
  </section>

  ${footerHTML()}`;

  bindHome();
  tickCountdown();
}

function bindHome(){
  $$('[data-open]').forEach(el => el.onclick = (e) => {
    if (e.target.closest('[data-vote]')) return;
    location.hash = '#/c/' + el.dataset.open;
  });
  $$('[data-vote]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    openVote(b.dataset.vote);
  });
}

/* ==========================================================================
   DETAIL
   ========================================================================== */
function renderContestant(slug){
  const c = S.contestants.find(x => x.slug === slug);
  if (!c){
    $('#app').innerHTML = `
      ${tickerHTML()}
      ${navHTML()}
      <div class="wrap" style="padding:140px 40px;text-align:center">
        <div class="caps dim" style="margin-bottom:20px">N°404</div>
        <h1 class="section-title" style="margin-bottom:30px">Profile <em>not found</em></h1>
        <a class="btn-hero" href="#/" style="display:inline-flex">Back to standings</a>
      </div>
      ${footerHTML()}`;
    return;
  }

  const board = leaderboard();
  const rank = rankOf(c.id);
  const votes = votesFor(c.id);
  const leader = board[0];
  const pct = leader ? Math.round((votes / leader.votes) * 100) : 100;
  const url = contestantUrl(c.slug);
  const msg = shareMessage(c);
  const full = encodeURIComponent(msg + ' ' + url);
  const grad = `linear-gradient(150deg, ${esc(c.c1||'#c9a96a')}, ${esc(c.c2||'#1a140e')})`;

  $('#app').innerHTML = `
  ${tickerHTML()}
  ${navHTML()}

  <section class="detail">
    <div class="wrap">
      <a class="back-link" href="#/">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6">
          <path d="M11 7H3M7 3L3 7l4 4"/>
        </svg>
        Back to standings
      </a>
      <div class="detail-grid">
        <div class="detail-portrait-wrap">
          <div class="detail-portrait" style="background:${c.photo?'#000':grad}">
            ${c.photo
              ? `<img src="${esc(c.photo)}" alt="${esc(c.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
              : `<span class="detail-initial">${initialChar(c)}</span>`}
          </div>
          <div class="detail-rank-chip">
            <span>Rank</span>
            <b>${pad2(rank)}</b>
          </div>
        </div>
        <div class="detail-meta">
          <div class="caps accent">Rank ${pad2(rank)} of ${pad2(board.length)}</div>
          <h1 class="detail-name">${esc(c.name.split(' ')[0])}<br><em>${esc(c.name.split(' ').slice(1).join(' ') || '')}</em></h1>
          <div class="detail-tagline">${esc(c.tagline||'')}</div>
          <p class="detail-bio">${esc(c.bio || 'No biography on record.')}</p>
          <div class="detail-cta-row">
            <button class="btn-hero" data-vote="${esc(c.id)}">
              Vote for ${esc(c.name.split(' ')[0])}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M3 8h10M9 4l4 4-4 4"/>
              </svg>
            </button>
            <a class="btn-hero-ghost" href="#/">All contenders</a>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <span>Votes recorded</span>
        <b>${num(votes)}</b>
      </div>
      <div class="detail-stat">
        <span>Of the leader</span>
        <b>${pct}<em>%</em></b>
      </div>
      <div class="detail-stat">
        <span>Price per vote</span>
        <b>${money(S.settings.pricePerVote)}</b>
      </div>
    </div>

    <div class="wrap">
      <div class="share-block">
        <div class="caps accent">04 / Share</div>
        <h2>Help <em>${esc(c.name.split(' ')[0])}</em> win</h2>
        <p>Send this to your group chats, story, or DM. Every vote brings the crown closer.</p>

        <div class="share-snippet">
          “${esc(msg)} <span class="url">${esc(url)}</span>”
        </div>

        <div class="share-url-row">
          <input readonly value="${esc(url)}" id="share-url">
          <button id="copy-link">Copy</button>
        </div>

        <div class="share-channels">
          <a target="_blank" rel="noopener" href="https://wa.me/?text=${full}">WhatsApp</a>
          <a target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}">X / Twitter</a>
          <a target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
          <a target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}">Telegram</a>
          <button id="native-share">More…</button>
        </div>
      </div>
    </div>
  </section>

  ${footerHTML()}`;

  $$('[data-vote]').forEach(b => b.onclick = () => openVote(b.dataset.vote));

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard','good'); }
    catch(e){
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove();
      toast('Copied','good');
    }
  };
  $('#copy-link').onclick = () => copy(url);
  $('#share-url').onclick = e => e.target.select();
  $('#native-share').onclick = async () => {
    if (navigator.share){
      try { await navigator.share({ title:c.name, text:msg, url }); } catch(e){}
    } else copy(url);
  };

  tickCountdown();
}

/* ==========================================================================
   COUNTDOWN
   ========================================================================== */
function tickCountdown(){
  const el = $('#countdown');
  if (!el) return;
  const target = new Date(S.settings.deadline).getTime();
  const diff = target - Date.now();
  if (isNaN(target) || diff <= 0){
    el.innerHTML = `<div class="cd-unit"><b>00</b><span>days</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>hrs</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>min</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>sec</span></div>`;
    return;
  }
  const s = Math.floor(diff/1000);
  const parts = [
    [Math.floor(s/86400), 'days'],
    [Math.floor(s%86400/3600), 'hrs'],
    [Math.floor(s%3600/60), 'min'],
    [s%60, 'sec'],
  ];
  el.innerHTML = parts.map(([v,l],i) =>
    `<div class="cd-unit"><b>${pad2(v)}</b><span>${l}</span></div>${i<3?'<span class="cd-sep">:</span>':''}`
  ).join('');
}
setInterval(tickCountdown, 1000);

/* ==========================================================================
   VOTE FLOW  —  FIXED
   ========================================================================== */

/* NOTE: We now store INDICES for bundle/coin/brand, not object references.
   Object references break whenever Firebase pushes a new settings snapshot. */
const flow = {
  open: false,
  step: 1,
  cid: null,
  bundleIdx: null,       // index into S.settings.bundles
  custom: '',            // string from the custom input
  method: null,
  coinIdx: 0,            // index into S.settings.coins
  brandIdx: 0,           // index into S.settings.giftBrands
  code: '',
  txHash: '',
  voterName: '',
  voterEmail: '',
  ref: null,             // human ref, e.g. CRAVE-ABCDE
  orderId: null,         // DB key
};

function openVote(cid){
  Object.assign(flow, {
    open: true, step: 1, cid,
    bundleIdx: null, custom: '', method: null,
    coinIdx: 0, brandIdx: 0,
    code: '', txHash: '', voterName: '', voterEmail: '',
    ref: null, orderId: null,
  });
  renderVoteModal();
}

/* NOTE: Don't call router() from inside closeVote — router calls closeVote itself. */
function closeVote(){
  const wasOpen = flow.open;
  flow.open = false;
  $('#modal-root').innerHTML = '';
  if (wasOpen && booted && pendingRender){
    pendingRender = false;
    queueMicrotask(() => { if (!flow.open) router(); });
  }
}

function selection(){
  if (!flow.cid) return null;

  // Custom number takes priority
  if (flow.custom){
    const n = Math.max(1, Math.min(9999, parseInt(flow.custom,10) || 1));
    const ppv = Number(S.settings.pricePerVote) || 3;
    return { base:n, bonus:0, total:n, price: n * ppv };
  }

  if (flow.bundleIdx != null){
    const list = S.settings.bundles || [];
    const b = list[flow.bundleIdx];
    if (!b) return null;
    return { base:b.votes, bonus:b.bonus||0, total:b.votes+(b.bonus||0), price:b.price };
  }
  return null;
}

function asideHTML(c){
  const grad = `linear-gradient(150deg, ${esc(c.c1||'#c9a96a')}, ${esc(c.c2||'#1a140e')})`;
  return `
  <aside class="modal-aside">
    <div class="modal-aside-portrait" style="background:${c.photo?'#000':grad}">
      ${c.photo
        ? `<img src="${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        : `<span class="detail-initial">${initialChar(c)}</span>`}
    </div>
    <div class="modal-aside-meta">
      <div class="caps accent">You're voting for</div>
      <h3>${esc(c.name)}</h3>
      <p>${esc(c.tagline||'')}</p>
    </div>
  </aside>`;
}

function renderVoteModal(){
  if (!flow.open) return;
  const c = S.contestants.find(x => x.id === flow.cid);
  if (!c){ closeVote(); return; }
  const sel = selection();
  const st = S.settings;
  const bundles = st.bundles || [];
  const coins = st.coins || [];
  const brands = st.giftBrands || [];

  let body = '';
  let title = 'Choose your <em>votes</em>';
  let kicker = '01 — Bundles';

  /* -------- STEP 1 -------- */
  if (flow.step === 1){
    body = `
      <div class="bundles">
        ${bundles.map((b,i) => {
          const active = !flow.custom && flow.bundleIdx === i;
          return `<button class="bundle ${active?'sel':''}" data-bundle="${i}">
            ${b.bonus ? `<span class="bundle-bonus">+${b.bonus}</span>` : ''}
            <span class="bundle-num">${b.votes}</span>
            <span class="bundle-unit">vote${b.votes>1?'s':''}</span>
            <span class="bundle-price">${money(b.price)}</span>
          </button>`;
        }).join('')}
      </div>
      <div class="custom-row">
        <label>Custom</label>
        <input type="number" min="1" max="9999" id="custom-votes" placeholder="Any number" value="${esc(flow.custom)}" inputmode="numeric">
      </div>
      ${sel ? `<div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}${sel.bonus?` · +${sel.bonus} bonus`:''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>` : ''}
      <button class="cta" id="to-step-2" ${sel?'':'disabled'}>Continue</button>`;
  }

  /* -------- STEP 2 -------- */
  if (flow.step === 2){
    title = 'Choose your <em>method</em>';
    kicker = '02 — Payment';
    body = `
      <div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''} for ${esc(c.name.split(' ')[0])}</span>
        <span class="total">${money(sel.price)}</span>
      </div>
      <div class="pay-tiles">
        <button class="pay-tile" data-method="crypto">
          <span class="pay-tile-icon">₿</span>
          <div>
            <div class="pay-tile-title">Crypto</div>
            <div class="pay-tile-sub">BTC · ETH · USDT · SOL</div>
          </div>
        </button>
        <button class="pay-tile" data-method="giftcard">
          <span class="pay-tile-icon">✦</span>
          <div>
            <div class="pay-tile-title">Gift card</div>
            <div class="pay-tile-sub">Amazon · Apple · Steam · Visa</div>
          </div>
        </button>
      </div>
      <button class="cta-back" data-back>Back</button>`;
  }

  /* -------- STEP 3 — CRYPTO -------- */
  if (flow.step === 3 && flow.method === 'crypto'){
    const coin = coins[flow.coinIdx] || coins[0];
    title = 'Send the <em>payment</em>';
    kicker = '03 — Crypto';
    body = `
      <div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>
      <div class="field">
        <label>Coin &amp; network</label>
        <select id="coin-select">
          ${coins.map((co,i) => `<option value="${i}" ${flow.coinIdx===i?'selected':''}>${esc(co.label)} — ${esc(co.network)}</option>`).join('')}
        </select>
      </div>
      <div class="alert warn" id="coin-warn">
        Send exactly <b>${money(sel.price)}</b> worth of ${esc(coin.label)} on the <b>${esc(coin.network)}</b> network.
        Wrong-network transfers are permanently lost.
      </div>
      <div class="addr" id="pay-addr">${esc(coin.address)}</div>
      <button class="cta-back" id="copy-addr" style="margin-bottom:16px">Copy address</button>
      <div class="field">
        <label>Transaction hash (optional)</label>
        <input id="txhash" placeholder="0x… paste the tx id" value="${esc(flow.txHash)}">
      </div>
      <div class="field-grid">
        <div class="field"><label>Name (optional)</label><input id="vname" value="${esc(flow.voterName)}" placeholder="Ada"></div>
        <div class="field"><label>Email (optional)</label><input id="vemail" value="${esc(flow.voterEmail)}" placeholder="you@mail.com"></div>
      </div>
      <button class="cta" id="submit-crypto">I've sent the payment</button>
      <button class="cta-back" data-back>Back</button>`;
  }

  /* -------- STEP 3 — GIFT CARD -------- */
  if (flow.step === 3 && flow.method === 'giftcard'){
    const brand = brands[flow.brandIdx] || brands[0];
    title = 'Enter the <em>code</em>';
    kicker = '03 — Gift card';
    body = `
      <div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>
      <div class="field">
        <label>Brand</label>
        <select id="brand-select">
          ${brands.map((b,i) => `<option value="${i}" ${flow.brandIdx===i?'selected':''}>${esc(b.label)}</option>`).join('')}
        </select>
      </div>
      <div class="alert info" id="brand-note">${esc(brand.note)}</div>
      <div class="alert warn">
        Buy a card worth at least <b>${money(sel.price)}</b>. A human reviews every code before votes are credited.
      </div>
      <div class="field">
        <label>Gift card code</label>
        <input id="gift-code" placeholder="XXXX-XXXX-XXXX" value="${esc(flow.code)}">
      </div>
      <div class="field-grid">
        <div class="field"><label>Name (optional)</label><input id="vname" value="${esc(flow.voterName)}" placeholder="Ada"></div>
        <div class="field"><label>Email (optional)</label><input id="vemail" value="${esc(flow.voterEmail)}" placeholder="you@mail.com"></div>
      </div>
      <button class="cta" id="submit-gift">Submit for review</button>
      <button class="cta-back" data-back>Back</button>`;
  }

  /* -------- STEP 4 — RECEIPT -------- */
  if (flow.step === 4){
    const o = S.orders.find(x => x.id === flow.orderId) || S.orders.find(x => x.ref === flow.ref);
    const confirmed = o && o.status === 'confirmed';
    kicker = confirmed ? 'Credited' : 'Pending';
    title = confirmed ? 'Votes <em>credited</em>' : 'Payment <em>submitted</em>';
    body = `
      <div class="receipt">
        <div class="receipt-icon">${confirmed?'✓':'⌛'}</div>
        <h3>${confirmed ? 'Your votes count' : 'Waiting on confirmation'}</h3>
        <p>${confirmed
          ? `Your ${sel ? sel.total : ''} vote${sel && sel.total>1?'s':''} for ${esc(c.name)} are on the board.`
          : `Your order is queued. Votes appear the moment payment clears.`}</p>
        <div class="receipt-card">
          <span>Ref</span><b>${esc(flow.ref || '—')}</b>
          <span>Contestant</span><b>${esc(c.name)}</b>
          <span>Votes</span><b>${sel ? sel.total : '—'}</b>
          <span>Amount</span><b>${sel ? money(sel.price) : '—'}</b>
          <span>Method</span><b>${esc(o ? o.detail : '—')}</b>
          <span>Status</span><b class="status ${confirmed?'confirmed':''}">${o ? String(o.status).toUpperCase() : '—'}</b>
        </div>
        <button class="cta" id="share-after">Share ${esc(c.name.split(' ')[0])}'s link</button>
        <button class="cta-back" data-close>Close</button>
      </div>`;
  }

  const stepIndex = flow.step >= 3 ? 3 : flow.step;
  $('#modal-root').innerHTML = `
    <div class="backdrop" data-close-bg>
      <div class="vote-modal" onclick="event.stopPropagation()">
        ${asideHTML(c)}
        <div class="modal-main">
          <div class="modal-head">
            <div>
              <div class="caps accent">${kicker}</div>
              <h2 class="modal-title">${title}</h2>
            </div>
            <button class="modal-close" data-close>×</button>
          </div>
          <div class="steps">
            <i class="${stepIndex>=1?'on':''}"></i>
            <i class="${stepIndex>=2?'on':''}"></i>
            <i class="${stepIndex>=3?'on':''}"></i>
          </div>
          ${body}
        </div>
      </div>
    </div>`;

  bindVoteModal();
}

/* --------------------------------------------------------------------------
   Helper: refresh step-1 summary + continue button WITHOUT re-rendering
   -------------------------------------------------------------------------- */
function refreshStep1UI(root){
  const sel = selection();

  // Highlight correct bundle (only if custom is empty)
  $$('[data-bundle]', root).forEach(b => {
    const idx = +b.dataset.bundle;
    b.classList.toggle('sel', !flow.custom && flow.bundleIdx === idx);
  });

  // Update or create summary
  let summary = $('.summary', root);
  const continueBtn = $('#to-step-2', root);

  if (sel){
    const html = `
      <span><b>${sel.total}</b> vote${sel.total>1?'s':''}${sel.bonus?` · +${sel.bonus} bonus`:''}</span>
      <span class="total">${money(sel.price)}</span>`;
    if (summary) summary.innerHTML = html;
    else if (continueBtn){
      summary = document.createElement('div');
      summary.className = 'summary';
      summary.innerHTML = html;
      continueBtn.before(summary);
    }
  } else if (summary){
    summary.remove();
  }

  if (continueBtn) continueBtn.disabled = !sel;
}

function bindVoteModal(){
  const root = $('#modal-root');
  if (!root) return;

  $$('[data-close]', root).forEach(b => b.onclick = closeVote);
  const bg = $('[data-close-bg]', root);
  if (bg) bg.onclick = e => { if (e.target.dataset.closeBg !== undefined) closeVote(); };
  $$('[data-back]', root).forEach(b => b.onclick = () => {
    flow.step = Math.max(1, flow.step - 1);
    renderVoteModal();
  });

  /* -------- STEP 1 -------- */
  $$('[data-bundle]', root).forEach(b => b.onclick = () => {
    flow.bundleIdx = +b.dataset.bundle;
    flow.custom = '';
    const ci = $('#custom-votes', root);
    if (ci) ci.value = '';
    refreshStep1UI(root);
  });

  const custom = $('#custom-votes', root);
  if (custom){
    /* NOTE: Do NOT re-render on every keystroke — that killed focus. */
    custom.oninput = e => {
      // Keep only digits
      const v = e.target.value.replace(/[^0-9]/g,'').slice(0,4);
      e.target.value = v;
      flow.custom = v;
      if (v) flow.bundleIdx = null;
      refreshStep1UI(root);
    };
  }

  const next = $('#to-step-2', root);
  if (next) next.onclick = () => { flow.step = 2; renderVoteModal(); };

  /* -------- STEP 2 -------- */
  $$('[data-method]', root).forEach(b => b.onclick = () => {
    flow.method = b.dataset.method;
    flow.step = 3;
    renderVoteModal();
  });

  /* -------- STEP 3 — CRYPTO -------- */
  const coinSel = $('#coin-select', root);
  if (coinSel) coinSel.onchange = e => {
    flow.coinIdx = +e.target.value;
    const coin = (S.settings.coins || [])[flow.coinIdx];
    const addrEl = $('#pay-addr', root);
    const warnEl = $('#coin-warn', root);
    if (addrEl && coin) addrEl.textContent = coin.address;
    if (warnEl && coin){
      const sel = selection();
      warnEl.innerHTML = `Send exactly <b>${money(sel.price)}</b> worth of ${esc(coin.label)} on the <b>${esc(coin.network)}</b> network. Wrong-network transfers are permanently lost.`;
    }
  };

  const copyAddr = $('#copy-addr', root);
  if (copyAddr) copyAddr.onclick = async () => {
    const coin = (S.settings.coins || [])[flow.coinIdx];
    if (!coin) return;
    try { await navigator.clipboard.writeText(coin.address); toast('Address copied','good'); }
    catch(e){ toast('Copy failed','bad'); }
  };

  const subCrypto = $('#submit-crypto', root);
  if (subCrypto) subCrypto.onclick = async () => {
    flow.txHash     = ($('#txhash', root)?.value || '').trim();
    flow.voterName  = ($('#vname', root)?.value || '').trim();
    flow.voterEmail = ($('#vemail', root)?.value || '').trim();
    const sel = selection();
    const coin = (S.settings.coins || [])[flow.coinIdx];
    if (!sel || !coin) return;

    subCrypto.disabled = true;
    let order;
    try {
      order = await createOrder({
        cid: flow.cid, votes: sel.total, base: sel.base, bonus: sel.bonus,
        amount: sel.price, method: 'crypto',
        detail: coin.label + ' · ' + coin.network,
        proof: { txHash: flow.txHash, code: '' },
      });
    } catch(e){
      subCrypto.disabled = false;
      toast('Could not submit: ' + e.message, 'bad');
      return;
    }
    flow.ref = order.ref;
    flow.orderId = order.id;
    flow.step = 4;

    if (S.settings.autoConfirmCrypto){
      setTimeout(async () => {
        try {
          const cur = DB.orders[order.id];
          if (cur && cur.status === 'pending'){
            await fbSetOrderStatus(order.id, 'confirmed');
            if (flow.open && flow.step === 4) renderVoteModal();
            toast('Payment confirmed — votes credited','good');
          }
        } catch(e){ /* silent */ }
      }, 2200);
    }
    renderVoteModal();
  };

  /* -------- STEP 3 — GIFT CARD -------- */
  const brandSel = $('#brand-select', root);
  if (brandSel) brandSel.onchange = e => {
    flow.brandIdx = +e.target.value;
    const brand = (S.settings.giftBrands || [])[flow.brandIdx];
    const noteEl = $('#brand-note', root);
    if (noteEl && brand) noteEl.textContent = brand.note;
  };

  const subGift = $('#submit-gift', root);
  if (subGift) subGift.onclick = async () => {
    const code = ($('#gift-code', root)?.value || '').trim();
    if (code.length < 6){ toast('Enter the full gift card code','bad'); return; }
    flow.code       = code;
    flow.voterName  = ($('#vname', root)?.value || '').trim();
    flow.voterEmail = ($('#vemail', root)?.value || '').trim();
    const sel = selection();
    const brand = (S.settings.giftBrands || [])[flow.brandIdx];
    if (!sel || !brand) return;

    subGift.disabled = true;
    let order;
    try {
      order = await createOrder({
        cid: flow.cid, votes: sel.total, base: sel.base, bonus: sel.bonus,
        amount: sel.price, method: 'giftcard', detail: brand.label,
        proof: { txHash: '', code },
      });
    } catch(e){
      subGift.disabled = false;
      toast('Could not submit: ' + e.message, 'bad');
      return;
    }
    flow.ref = order.ref;
    flow.orderId = order.id;
    flow.step = 4;

    if (S.settings.autoConfirmGift){
      setTimeout(async () => {
        try {
          const cur = DB.orders[order.id];
          if (cur && cur.status === 'pending'){
            await fbSetOrderStatus(order.id, 'confirmed');
            if (flow.open && flow.step === 4) renderVoteModal();
          }
        } catch(e){ /* silent */ }
      }, 2200);
    }
    renderVoteModal();
  };

  /* -------- STEP 4 -------- */
  const shareAfter = $('#share-after', root);
  if (shareAfter) shareAfter.onclick = () => {
    const c = S.contestants.find(x => x.id === flow.cid);
    closeVote();
    if (c) location.hash = '#/c/' + c.slug;
  };
}

async function createOrder({ cid, votes, base, bonus, amount, method, detail, proof }){
  const order = {
    ref: 'CRAVE-' + rnd(5),
    contestantId: cid,
    votes, baseVotes: base, bonus,
    amount, method, detail,
    status: 'pending',
    proof: proof || { txHash:'', code:'' },
    voter: { name: flow.voterName || '', email: flow.voterEmail || '' },
    createdAt: Date.now(),
    confirmedAt: null,
  };
  return await fbCreateOrder(order);
}

/* ==========================================================================
   ROUTER
   ========================================================================== */
function router(){
  const hash = location.hash || '#/';
  closeVote();
  window.scrollTo(0,0);

  if (hash.startsWith('#/c/')) return renderContestant(decodeURIComponent(hash.slice(4)));
  return renderHome();
}

window.addEventListener('hashchange', router);

/* ==========================================================================
   BOOT
   ========================================================================== */
let booted = false;
let pendingRender = false;

onData(() => {
  refreshState();

  if (!DB.ready.contestants || !DB.ready.settings){
    if (!booted){
      $('#app').innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;color:var(--ink-3)">
          <div style="text-align:center">
            <div style="font-family:var(--sans);font-weight:800;font-size:34px;letter-spacing:-.03em;color:var(--ink);margin-bottom:14px">CRAVE</div>
            <div style="font-family:var(--mono);font-size:10px;letter-spacing:.28em;text-transform:uppercase">Loading…</div>
          </div>
        </div>`;
    }
    return;
  }

  if (!booted){
    booted = true;
    router();
    return;
  }

  if (flow.open){
    // Modal is open — don't blow away its DOM. Re-render once it closes.
    pendingRender = true;
  } else {
    router();
  }
});

subscribe();

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVote(); });