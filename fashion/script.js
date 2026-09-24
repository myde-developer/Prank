/* ==========================================================================
   CRAVE — Viewer app (public site)
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

/* --------------------------------------------------------------------------
   SEED DEFAULTS (mirror of admin defaults, used only as fallback)
   -------------------------------------------------------------------------- */
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

/* --------------------------------------------------------------------------
   LIVE STATE
   -------------------------------------------------------------------------- */
let S = { settings: FALLBACK_SETTINGS, contestants: [], orders: [] };

function refreshState(){
  S.settings    = Object.assign({}, FALLBACK_SETTINGS, DB.settings || {});
  S.contestants = Object.entries(DB.contestants || {}).map(([id,c]) => ({ id, ...c }));
  S.orders      = Object.entries(DB.orders      || {}).map(([id,o]) => ({ id, ...o }));
}

/* --------------------------------------------------------------------------
   DERIVED
   -------------------------------------------------------------------------- */
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
function totalVotesCast(){
  return S.contestants.reduce((a,c) => a + votesFor(c.id), 0);
}
function pendingOrders(){
  return S.orders.filter(o => o.status === 'pending');
}

/* --------------------------------------------------------------------------
   TOAST
   -------------------------------------------------------------------------- */
function toast(msg, kind=''){
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='.3s'; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

/* --------------------------------------------------------------------------
   SHARED PIECES
   -------------------------------------------------------------------------- */
function initialChar(c){ return esc((c.name || '?').trim()[0] || '?'); }

function portraitHTML(c, extra=''){
  const grad = `linear-gradient(155deg, ${esc(c.c1||'#444')}, ${esc(c.c2||'#111')})`;
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
  const grad = `linear-gradient(155deg, ${esc(c.c1||'#444')}, ${esc(c.c2||'#111')})`;
  if (c.photo) return `<div class="roster-tile" style="background:#000"><img src="${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></div>`;
  return `<div class="roster-tile" style="background:${grad}">${initialChar(c)}</div>`;
}
function contestantUrl(slug){
  return location.origin + location.pathname + location.search + '#/c/' + slug;
}
function shareMessage(c){
  return `Help me win Best Fashionista of the Year at ${S.settings.eventName}! Every vote counts — vote for ${c.name} here:`;
}

/* --------------------------------------------------------------------------
   HEADER / FOOTER
   -------------------------------------------------------------------------- */
function tickerHTML(){
  const items = [
    `Best Fashionista of the Year 2026`,
    `One vote — ${money(S.settings.pricePerVote)}`,
    `Pay with crypto or gift card`,
    `${num(totalVotesCast())} votes cast`,
    `Voting closes ${new Date(S.settings.deadline).toLocaleDateString('en-US',{month:'long',day:'numeric'})}`,
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
        <span class="brand-sub">Awards · MMXXVI</span>
      </a>
      <div class="nav-links">
        <a href="#standings">Standings</a>
        <a href="#how">How it works</a>
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
        <div class="foot-brand">CRAVE <em>©</em></div>
        <div class="foot-meta">${esc(S.settings.tagline)} · Votes are final once confirmed</div>
      </div>
      <div class="foot-right">
        <a href="#standings">Standings</a>
        <a href="#how">Rules</a>
      </div>
    </div>
  </footer>`;
}

/* --------------------------------------------------------------------------
   HOME
   -------------------------------------------------------------------------- */
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
          <span>Voting is open · ${num(board.length)} in the running</span>
        </div>
        <h1 class="display">
          <span class="word">Vote</span>
          <span class="word">for the</span>
          <span class="word"><em>Fashionista</em></span>
          <span class="word outline">of the year</span>
        </h1>
      </div>
      <div class="hero-bottom">
        <p class="hero-blurb">
          One vote costs <b>${money(S.settings.pricePerVote)}</b>. Pay with crypto or a gift card —
          your vote is credited the moment payment is confirmed. Share your link. Rally your people.
          <b>Win the crown.</b>
        </p>
        <div class="hero-index">
          <b>N°01</b>
          Issue MMXXVI
        </div>
      </div>
    </div>

    <aside class="hero-right">
      <div class="ticket" id="ticket">
        <div class="ticket-holes">
          <i></i><i></i><i></i>
          <span>Admit one</span>
        </div>
        <div class="ticket-brand">CRAVE<em>©</em></div>
        <div class="ticket-sub">Best Fashionista of the Year</div>

        <div class="ticket-divider">Now open</div>

        <div class="ticket-label">Voting closes in</div>
        <div class="countdown" id="countdown"></div>

        <div class="ticket-divider">Entry</div>

        <div class="ticket-price">
          <b>${money(S.settings.pricePerVote)}</b>
          <span>Per vote</span>
        </div>

        <a class="ticket-cta" href="#standings">
          <span>Vote for someone</span>
          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M7 2v10M3 8l4 4 4-4"/>
          </svg>
        </a>
      </div>
    </aside>
  </section>

  <section class="section wrap" id="standings">
    <div class="section-head">
      <span class="section-num">N°02 — Standings</span>
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
          <div class="podium-rank">${roman(i+1)}</div>
          <div class="podium-badge">${i===0?'Leading':i===1?'Second':'Third'}</div>
          ${portraitHTML(c)}
          <div class="podium-info">
            <div class="podium-name">${esc(c.name)}</div>
            <div class="podium-tag">${esc(c.tagline||'')}</div>
            <div class="podium-votes">
              <b>${num(c.votes)}</b>
              <span>Votes</span>
            </div>
          </div>
        </button>`).join('')}
    </div>` : ''}

    ${rest.length ? `
    <div class="roster">
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
              <span>${pct}% of leader</span>
            </div>
          </div>
          <button class="roster-vote" data-vote="${esc(c.id)}">Vote</button>
        </div>`;
      }).join('')}
    </div>` : ''}
  </section>

  <section class="section wrap" id="how">
    <div class="section-head" style="margin-bottom:0">
      <span class="section-num">N°03 — Method</span>
      <h2 class="section-title">How it <em>works</em></h2>
      <div class="section-meta">Four steps</div>
    </div>
    <div class="how">
      <div class="how-step">
        <div class="how-step-num">i</div>
        <h3>Pick your fashionista</h3>
        <p>Browse the standings and open the profile of the designer or stylist you want to win.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">ii</div>
        <h3>Buy votes</h3>
        <p>Each vote is ${money(S.settings.pricePerVote)}. Bundles carry bonus votes — bigger bundle, better value.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">iii</div>
        <h3>Pay your way</h3>
        <p>Crypto confirms automatically. Gift cards are reviewed by a human — usually within a few hours.</p>
      </div>
      <div class="how-step">
        <div class="how-step-num">iv</div>
        <h3>Share the link</h3>
        <p>Every contestant has a personal link. Share it and rally your people — that is how the crown is won.</p>
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

/* --------------------------------------------------------------------------
   CONTESTANT DETAIL
   -------------------------------------------------------------------------- */
function renderContestant(slug){
  const c = S.contestants.find(x => x.slug === slug);
  if (!c){
    $('#app').innerHTML = `
      ${tickerHTML()}
      ${navHTML()}
      <div class="wrap" style="padding:140px 40px;text-align:center">
        <div class="caps dim" style="margin-bottom:20px">N°404</div>
        <h1 class="section-title" style="margin-bottom:30px">Profile <em>not found</em></h1>
        <a class="btn-primary" href="#/" style="display:inline-flex">Back to standings</a>
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

  const grad = `linear-gradient(155deg, ${esc(c.c1||'#444')}, ${esc(c.c2||'#111')})`;

  $('#app').innerHTML = `
  ${tickerHTML()}
  ${navHTML()}

  <section class="detail">
    <div class="wrap">
      <div class="detail-grid">
        <div style="position:sticky;top:120px">
          <div class="detail-portrait" style="background:${c.photo?'#000':grad}">
            ${c.photo
              ? `<img src="${esc(c.photo)}" alt="${esc(c.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
              : `<span class="detail-initial">${initialChar(c)}</span>`}
            <span class="detail-rank">${roman(rank||1)}</span>
          </div>
        </div>
        <div class="detail-meta">
          <div>
            <div class="caps">Rank ${pad2(rank)} of ${pad2(board.length)} · N°${pad2(rank)}</div>
          </div>
          <h1 class="detail-name">${esc(c.name.split(' ')[0])}<br><em>${esc(c.name.split(' ').slice(1).join(' ') || '')}</em></h1>
          <div class="detail-tagline">${esc(c.tagline||'')}</div>
          <div class="detail-bio">
            <p>${esc(c.bio || 'No biography on record.')}</p>
          </div>
          <div class="detail-cta-row">
            <button class="btn-primary" data-vote="${esc(c.id)}">
              Vote for ${esc(c.name.split(' ')[0])}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M2 7h10M8 3l4 4-4 4"/>
              </svg>
            </button>
            <a class="btn-ghost" href="#/">View standings</a>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-stats">
      <div class="detail-stat">
        <b>${num(votes)}</b>
        <span>Votes recorded</span>
      </div>
      <div class="detail-stat">
        <b>${pct}<em>%</em></b>
        <span>Of the leader</span>
      </div>
      <div class="detail-stat">
        <b>${money(S.settings.pricePerVote)}</b>
        <span>Per vote</span>
      </div>
    </div>

    <div class="wrap">
      <div class="share-block">
        <div class="caps gold" style="margin-bottom:14px">N°04 — Share</div>
        <h2>Help <em>${esc(c.name.split(' ')[0])}</em> win</h2>
        <p>Send this to your group chats, story, or DM. Every single vote brings the crown closer.</p>

        <div class="share-snippet">
          “${esc(msg)} <span class="url">${esc(url)}</span>”
        </div>

        <div class="share-url-row">
          <input readonly value="${esc(url)}" id="share-url">
          <button id="copy-link">Copy link</button>
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

/* --------------------------------------------------------------------------
   COUNTDOWN
   -------------------------------------------------------------------------- */
function tickCountdown(){
  const el = $('#countdown');
  if (!el) return;
  const target = new Date(S.settings.deadline).getTime();
  const diff = target - Date.now();
  if (isNaN(target) || diff <= 0){
    el.innerHTML = `<div class="cd-unit"><b>00</b><span>Days</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>Hrs</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>Min</span></div>
      <span class="cd-sep">:</span>
      <div class="cd-unit"><b>00</b><span>Sec</span></div>`;
    return;
  }
  const s = Math.floor(diff/1000);
  const parts = [
    [Math.floor(s/86400), 'Days'],
    [Math.floor(s%86400/3600), 'Hrs'],
    [Math.floor(s%3600/60), 'Min'],
    [s%60, 'Sec'],
  ];
  el.innerHTML = parts.map(([v,l],i) =>
    `<div class="cd-unit"><b>${pad2(v)}</b><span>${l}</span></div>${i<3?'<span class="cd-sep">:</span>':''}`
  ).join('');
}
setInterval(tickCountdown, 1000);

/* ==========================================================================
   VOTE FLOW
   ========================================================================== */
const flow = {
  open:false, step:1, cid:null, bundle:null, custom:'', method:null,
  coin:null, brand:null, code:'', txHash:'', voterName:'', voterEmail:'', ref:null,
};

function openVote(cid){
  Object.assign(flow, {
    open:true, step:1, cid, bundle:null, custom:'', method:null,
    coin:null, brand:null, code:'', txHash:'', voterName:'', voterEmail:'', ref:null,
  });
  renderVoteModal();
}
function closeVote(){ flow.open=false; $('#modal-root').innerHTML=''; }

function selection(){
  if (!flow.cid) return null;
  if (flow.custom){
    const n = Math.max(1, Math.min(9999, parseInt(flow.custom,10) || 1));
    return { base:n, bonus:0, total:n, price: n * S.settings.pricePerVote };
  }
  if (flow.bundle){
    const b = flow.bundle;
    return { base:b.votes, bonus:b.bonus||0, total:b.votes+(b.bonus||0), price:b.price };
  }
  return null;
}

function asideHTML(c){
  const grad = `linear-gradient(155deg, ${esc(c.c1||'#444')}, ${esc(c.c2||'#111')})`;
  return `
  <aside class="modal-aside">
    <div class="modal-aside-portrait" style="background:${c.photo?'#000':grad}">
      ${c.photo
        ? `<img src="${esc(c.photo)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">`
        : `<span class="detail-initial">${initialChar(c)}</span>`}
    </div>
    <div class="modal-aside-meta">
      <div class="caps">You're voting for</div>
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

  let body = '';
  let title = 'Choose your <em>votes</em>';
  let kicker = `N°01 — Bundles`;

  if (flow.step === 1){
    body = `
      <div class="bundles">
        ${st.bundles.map((b,i) => {
          const active = flow.bundle === st.bundles[i];
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
        <input type="number" min="1" max="9999" id="custom-votes" placeholder="Enter any number" value="${esc(flow.custom)}">
      </div>
      ${sel ? `<div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}${sel.bonus?` · ${sel.base} + ${sel.bonus} bonus`:''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>` : ''}
      <button class="cta" id="to-step-2" ${sel?'':'disabled'}>Continue to payment</button>`;
  }

  if (flow.step === 2){
    title = 'Choose your <em>method</em>';
    kicker = 'N°02 — Payment';
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

  if (flow.step === 3 && flow.method === 'crypto'){
    if (!flow.coin) flow.coin = st.coins[0];
    title = 'Send the <em>payment</em>';
    kicker = 'N°03 — Crypto';
    body = `
      <div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>
      <div class="field">
        <label>Coin &amp; network</label>
        <select id="coin-select">
          ${st.coins.map(co => `<option value="${esc(co.id)}" ${flow.coin.id===co.id?'selected':''}>${esc(co.label)} — ${esc(co.network)}</option>`).join('')}
        </select>
      </div>
      <div class="alert warn">
        Send exactly <b>${money(sel.price)}</b> worth of ${esc(flow.coin.label)} on the <b>${esc(flow.coin.network)}</b> network.
        Wrong-network transfers are permanently lost.
      </div>
      <div class="addr">${esc(flow.coin.address)}</div>
      <button class="cta-back" id="copy-addr" style="margin-bottom:16px">Copy address</button>
      <div class="field">
        <label>Transaction hash (optional)</label>
        <input id="txhash" placeholder="0x… paste the tx id" value="${esc(flow.txHash)}">
      </div>
      <div class="field-grid">
        <div class="field"><label>Name (optional)</label><input id="vname" value="${esc(flow.voterName)}" placeholder="Ada"></div>
        <div class="field"><label>Email (optional)</label><input id="vemail" value="${esc(flow.voterEmail)}" placeholder="you@mail.com"></div>
      </div>
      <button class="cta" id="submit-crypto">I have sent the payment</button>
      <button class="cta-back" data-back>Back</button>`;
  }

  if (flow.step === 3 && flow.method === 'giftcard'){
    if (!flow.brand) flow.brand = st.giftBrands[0];
    title = 'Enter the <em>code</em>';
    kicker = 'N°03 — Gift card';
    body = `
      <div class="summary">
        <span><b>${sel.total}</b> vote${sel.total>1?'s':''}</span>
        <span class="total">${money(sel.price)}</span>
      </div>
      <div class="field">
        <label>Brand</label>
        <select id="brand-select">
          ${st.giftBrands.map(b => `<option value="${esc(b.id)}" ${flow.brand.id===b.id?'selected':''}>${esc(b.label)}</option>`).join('')}
        </select>
      </div>
      <div class="alert info">${esc(flow.brand.note)}</div>
      <div class="alert warn">
        Buy a card worth at least <b>${money(sel.price)}</b>. A human reviews every code before votes are credited — usually within a few hours.
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

  if (flow.step === 4){
    const o = S.orders.find(x => x.ref === flow.ref);
    const confirmed = o && o.status === 'confirmed';
    kicker = confirmed ? 'Credited' : 'Pending';
    title = confirmed ? 'Votes <em>credited</em>' : 'Payment <em>submitted</em>';
    body = `
      <div class="receipt">
        <div class="receipt-icon">${confirmed?'✦':'⌛'}</div>
        <h3>${confirmed ? 'Your votes count' : 'Waiting on confirmation'}</h3>
        <p>${confirmed
          ? `Your ${sel.total} vote${sel.total>1?'s':''} for ${esc(c.name)} have been added to the standings.`
          : `Your order is queued. Votes appear on the standings the moment payment clears.`}</p>
        <div class="receipt-card">
          Ref: <b>${esc(flow.ref)}</b><br>
          Contestant: <b>${esc(c.name)}</b><br>
          Votes: <b>${sel.total}</b><br>
          Amount: <b>${money(sel.price)}</b><br>
          Method: <b>${esc(o ? o.detail : '')}</b><br>
          Status: <span class="status ${confirmed?'confirmed':''}">${o ? String(o.status).toUpperCase() : ''}</span>
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
              <div class="caps">${kicker}</div>
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

function bindVoteModal(){
  const root = $('#modal-root');

  $$('[data-close]', root).forEach(b => b.onclick = closeVote);
  $('[data-close-bg]', root).onclick = e => {
    if (e.target.dataset.closeBg !== undefined) closeVote();
  };
  $$('[data-back]', root).forEach(b => b.onclick = () => { flow.step--; renderVoteModal(); });

  $$('[data-bundle]', root).forEach(b => b.onclick = () => {
    flow.bundle = S.settings.bundles[+b.dataset.bundle];
    flow.custom = '';
    renderVoteModal();
  });
  const custom = $('#custom-votes', root);
  if (custom) custom.oninput = e => {
    flow.custom = e.target.value;
    flow.bundle = null;
    renderVoteModal();
  };
  const next = $('#to-step-2', root);
  if (next) next.onclick = () => { flow.step = 2; renderVoteModal(); };

  $$('[data-method]', root).forEach(b => b.onclick = () => {
    flow.method = b.dataset.method;
    flow.step = 3;
    renderVoteModal();
  });

  const coinSel = $('#coin-select', root);
  if (coinSel) coinSel.onchange = e => {
    flow.coin = S.settings.coins.find(c => c.id === e.target.value);
    renderVoteModal();
  };
  const copyAddr = $('#copy-addr', root);
  if (copyAddr) copyAddr.onclick = async () => {
    try { await navigator.clipboard.writeText(flow.coin.address); toast('Address copied','good'); }
    catch(e){ toast('Copy failed','bad'); }
  };
  const subCrypto = $('#submit-crypto', root);
  if (subCrypto) subCrypto.onclick = async () => {
    flow.txHash = $('#txhash', root).value.trim();
    flow.voterName = $('#vname', root).value.trim();
    flow.voterEmail = $('#vemail', root).value.trim();
    const sel = selection();

    subCrypto.disabled = true;
    let order;
    try {
      order = await createOrder({
        cid: flow.cid, votes: sel.total, base: sel.base, bonus: sel.bonus,
        amount: sel.price, method: 'crypto',
        detail: flow.coin.label + ' · ' + flow.coin.network,
        proof: { txHash: flow.txHash, code: '' },
      });
    } catch(e){
      subCrypto.disabled = false;
      toast('Could not submit order: ' + e.message, 'bad');
      return;
    }
    flow.ref = order.ref;
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

  const brandSel = $('#brand-select', root);
  if (brandSel) brandSel.onchange = e => {
    flow.brand = S.settings.giftBrands.find(b => b.id === e.target.value);
    renderVoteModal();
  };
  const subGift = $('#submit-gift', root);
  if (subGift) subGift.onclick = async () => {
    const code = $('#gift-code', root).value.trim();
    if (code.length < 6){ toast('Enter the full gift card code','bad'); return; }
    flow.code = code;
    flow.voterName = $('#vname', root).value.trim();
    flow.voterEmail = $('#vemail', root).value.trim();
    const sel = selection();

    subGift.disabled = true;
    let order;
    try {
      order = await createOrder({
        cid: flow.cid, votes: sel.total, base: sel.base, bonus: sel.bonus,
        amount: sel.price, method: 'giftcard', detail: flow.brand.label,
        proof: { txHash: '', code },
      });
    } catch(e){
      subGift.disabled = false;
      toast('Could not submit order: ' + e.message, 'bad');
      return;
    }
    flow.ref = order.ref;
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

  const shareAfter = $('#share-after', root);
  if (shareAfter) shareAfter.onclick = () => {
    const c = S.contestants.find(x => x.id === flow.cid);
    closeVote();
    location.hash = '#/c/' + c.slug;
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

onData(() => {
  refreshState();

  if (!DB.ready.contestants || !DB.ready.settings){
    if (!booted){
      $('#app').innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;color:var(--bone-dim)">
          <div style="text-align:center">
            <div style="font-family:var(--serif);font-size:44px;letter-spacing:.06em;color:var(--bone);margin-bottom:14px">CRAVE</div>
            <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase">Loading…</div>
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

  if (!flow.open) router();
});

subscribe();

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVote(); });