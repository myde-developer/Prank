/* ==========================================================================
   CAVE — Best Fashionista of the Year
   Firebase Realtime Database edition
   ========================================================================== */

import {
  DB, subscribe, onData,
  saveSettings, createContestant, updateContestant, deleteContestant,
  createOrder as fbCreateOrder,
  setOrderStatus as fbSetOrderStatus,
  bulkSeed, wipeAll,
} from './db.js';

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const num   = n => Number(n).toLocaleString('en-US');
const rnd   = n => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,n).padEnd(n,'X');
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const initials = n => String(n).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

/* --------------------------------------------------------------------------
   SEED DATA — used only for first-time setup of an empty database.
   -------------------------------------------------------------------------- */
const DEFAULTS = {
  settings: {
    eventName: 'CAVE',
    tagline: 'Best Fashionista of the Year 2026',
    pricePerVote: 3,
    deadline: '2026-12-31T23:59',
    adminPin: 'cave2026',
    autoConfirmCrypto: true,
    autoConfirmGift: false,
    bundles: [
      { votes: 1,  price: 3,   bonus: 0  },
      { votes: 5,  price: 15,  bonus: 0  },
      { votes: 10, price: 30,  bonus: 1  },
      { votes: 25, price: 75,  bonus: 4  },
      { votes: 50, price: 150, bonus: 12 },
    ],
    coins: [
      { id:'BTC',  label:'Bitcoin',  network:'Bitcoin network', address:'bc1q9x8caveexamplereceivingaddress7f3k2' },
      { id:'ETH',  label:'Ethereum', network:'ERC-20',          address:'0xC4Ve0000000000000000000000000000000000' },
      { id:'USDT', label:'USDT',     network:'TRC-20',          address:'TCaveUsdtTrc20ExampleAddress9xQ2' },
      { id:'SOL',  label:'Solana',   network:'Solana',          address:'CaveSoLanaExampleAddr1111111111111111111' },
    ],
    giftBrands: [
      { id:'amazon', label:'Amazon Gift Card',         note:'Buy a $25 / $50 / $100 Amazon card, then enter the claim code below.' },
      { id:'apple',  label:'Apple / iTunes Gift Card', note:'Scratch the back and enter the 16-character code.' },
      { id:'steam',  label:'Steam Wallet Card',        note:'Enter the Steam wallet code exactly as printed.' },
      { id:'visa',   label:'Visa / Vanilla Prepaid',   note:'Enter the card number, expiry and CVV, plus the purchase receipt number.' },
    ],
  },
  contestants: [
    { id:'c1', slug:'amara-vale',     name:'Amara Vale',     tagline:'Avant-garde couture', bio:'Lagos-born, Paris-trained. Amara closes runway shows in sculptural silhouettes that feel like architecture in motion.', photo:'', c1:'#f7e08a', c2:'#b8860b', votes:1284, status:'active' },
    { id:'c2', slug:'zuri-blackwood', name:'Zuri Blackwood', tagline:'Streetwear royalty',  bio:'Founder of the BLACKWOOD label. Zuri turned a thrifted denim jacket into a sold-out global drop.', photo:'', c1:'#c3ccff', c2:'#5b6bff', votes:1102, status:'active' },
    { id:'c3', slug:'nadia-rossi',    name:'Nadia Rossi',    tagline:'Milanese minimalism', bio:'Quiet luxury, loud presence. Nadia styles in a palette of bone, camel and black — and never misses.', photo:'', c1:'#ffb3ba', c2:'#d6336c', votes:976,  status:'active' },
    { id:'c4', slug:'kofi-mensah',    name:'Kofi Mensah',    tagline:'Tailoring & textile', bio:'Accra tailor reviving kente weaving inside razor-sharp contemporary suiting.', photo:'', c1:'#9df0cf', c2:'#0f9b6c', votes:812,  status:'active' },
    { id:'c5', slug:'lena-okafor',    name:'Lena Okafor',    tagline:'Red-carpet drama',    bio:'Three-time stylist of the year nominee. If it does not move when she walks, Lena will not wear it.', photo:'', c1:'#ffd79b', c2:'#e07b00', votes:654,  status:'active' },
    { id:'c6', slug:'rafael-cruz',    name:'Rafael Cruz',    tagline:'Menswear reimagined', bio:'São Paulo designer blurring the line between beachwear and black tie.', photo:'', c1:'#b9f6ff', c2:'#0891b2', votes:511,  status:'active' },
    { id:'c7', slug:'ivy-chen',       name:'Ivy Chen',       tagline:'Cyber-futurist',      bio:'3D-printed accessories and holographic fabric. Ivy dresses like the year 2075.', photo:'', c1:'#e9c7ff', c2:'#8b5cf6', votes:388,  status:'active' },
    { id:'c8', slug:'simone-adeyemi', name:'Simone Adeyemi', tagline:'Vintage revivalist',  bio:'Archivist of 1970s African print. Simone makes the past look like the future.', photo:'', c1:'#ffd6a5', c2:'#c2410c', votes:245,  status:'active' },
  ],
  orders: [],
};

/* Live state — rebuilt from the database snapshot on every change. */
let S = { settings: DEFAULTS.settings, contestants: [], orders: [] };

function refreshState(){
  S.settings    = Object.assign({}, DEFAULTS.settings, DB.settings || {});
  S.contestants = Object.entries(DB.contestants || {}).map(([id,c]) => ({ id, ...c }));
  S.orders      = Object.entries(DB.orders      || {}).map(([id,o]) => ({ id, ...o }));
}

function stripId(obj){ const { id, ...rest } = obj; return rest; }

/* --------------------------------------------------------------------------
   DERIVED DATA
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
function totalRevenue(){
  return S.orders.filter(o => o.status === 'confirmed').reduce((a,o) => a + Number(o.amount||0), 0);
}
function pendingOrders(){ return S.orders.filter(o => o.status === 'pending'); }

/* --------------------------------------------------------------------------
   TOASTS
   -------------------------------------------------------------------------- */
function toast(msg, kind=''){
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition='.3s'; }, 2400);
  setTimeout(() => el.remove(), 2800);
}

/* --------------------------------------------------------------------------
   SHARED UI PIECES
   -------------------------------------------------------------------------- */
function avatarHTML(c, cls=''){
  const style = `background:linear-gradient(135deg,${esc(c.c1||'#444')},${esc(c.c2||'#222')})`;
  if (c.photo) return `<img class="av ${cls}" src="${esc(c.photo)}" alt="${esc(c.name)}" style="background:#222">`;
  return `<div class="av ${cls}" style="${style}">${esc(initials(c.name))}</div>`;
}
function contestantUrl(slug){
  return location.origin + location.pathname + location.search + '#/c/' + slug;
}
function shareMessage(c){
  return `Help me vote so I can win Best Fashionista of the Year at ${S.settings.eventName} ${new Date().getFullYear()}! 🙏 Every single vote counts — vote for ${c.name} here:`;
}

function header(){
  return `
  <header class="top">
    <div class="wrap">
      <a class="brand" href="#/">
        <span class="brand-mark">C</span>
        <span><b>${esc(S.settings.eventName)}</b><small>${esc(S.settings.tagline)}</small></span>
      </a>
      <nav>
        <a href="#/">Leaderboard</a>
        <a href="#/how" class="hide-sm">How it works</a>
        <a href="#/admin" class="hide-sm">Admin</a>
      </nav>
    </div>
  </header>`;
}
function footer(){
  return `
  <footer>
    <div class="wrap">
      <span>© ${new Date().getFullYear()} ${esc(S.settings.eventName)} — ${esc(S.settings.tagline)}</span>
      <span class="muted">·</span>
      <a href="#/how">Rules &amp; Terms</a>
      <span class="muted">·</span>
      <a href="#/admin">Admin</a>
      <span style="margin-left:auto" class="muted tiny">Votes are final once payment is confirmed.</span>
    </div>
  </footer>`;
}

/* --------------------------------------------------------------------------
   HOME
   -------------------------------------------------------------------------- */
function renderHome(){
  const board = leaderboard();
  const top3 = board.slice(0,3);
  const max = board[0]?.votes || 1;

  $('#app').innerHTML = `
  ${header()}
  <div class="wrap">
    <section class="hero">
      <span class="kicker">Voting is open</span>
      <h1>Who is the <em>Best Fashionista</em><br>of the Year?</h1>
      <p>Every vote costs ${money(S.settings.pricePerVote)}. Pay with crypto or a gift card, and your vote is counted the moment payment is confirmed.</p>
      <div class="countdown" id="countdown"></div>
      <p class="small muted" id="cd-label">Voting closes ${new Date(S.settings.deadline).toLocaleString()}</p>
    </section>

    <div class="stats">
      <div class="stat"><b>${num(totalVotesCast())}</b><span>Total votes</span></div>
      <div class="stat"><b>${board.length}</b><span>Contestants</span></div>
      <div class="stat"><b>${money(S.settings.pricePerVote)}</b><span>Per vote</span></div>
      <div class="stat"><b>${num(pendingOrders().length)}</b><span>Awaiting confirmation</span></div>
    </div>

    ${top3.length >= 3 ? `
    <div class="podium">
      ${[top3[1], top3[0], top3[2]].map((c) => {
        const place = c.id === top3[0].id ? 1 : (c.id === top3[1].id ? 2 : 3);
        return `
        <a class="pod ${place===1?'first':''}" href="#/c/${esc(c.slug)}">
          <div class="crown">${place===1?'👑':place===2?'🥈':'🥉'}</div>
          ${avatarHTML(c,'lg')}
          <div class="nm">${esc(c.name)}</div>
          <div class="vt">${num(c.votes)} votes</div>
        </a>`;
      }).join('')}
    </div>` : ''}

    <div class="section-head">
      <h2>All contestants</h2>
      <span class="muted">${board.length} in the running</span>
    </div>

    <div class="grid">
      ${board.map((c,i) => `
        <div class="card" style="position:relative">
          <span class="rank">#${i+1}</span>
          <div class="card-top">
            ${avatarHTML(c)}
            <div>
              <div class="nm serif" style="font-size:17px">${esc(c.name)}</div>
              <div class="tg small muted">${esc(c.tagline)}</div>
            </div>
          </div>
          <div class="card-body">
            <div class="bar"><i style="width:${Math.max(3, (c.votes/max)*100)}%"></i></div>
            <div class="vote-row">
              <span class="v">${num(c.votes)}</span>
              <span class="small muted">votes</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn gold" data-vote="${esc(c.id)}">Vote</button>
            <button class="btn" data-share="${esc(c.id)}">Share</button>
          </div>
        </div>`).join('')}
    </div>
  </div>
  ${footer()}`;

  $$('[data-vote]').forEach(b => b.onclick = () => openVote(b.dataset.vote));
  $$('[data-share]').forEach(b => b.onclick = () => {
    const c = S.contestants.find(x => x.id === b.dataset.share);
    location.hash = '#/c/' + c.slug;
    setTimeout(() => { const p = $('#share-panel'); if (p) p.scrollIntoView({behavior:'smooth'}); }, 60);
  });
  tickCountdown();
}

/* --------------------------------------------------------------------------
   CONTESTANT PAGE
   -------------------------------------------------------------------------- */
function renderContestant(slug){
  const c = S.contestants.find(x => x.slug === slug);
  if (!c) {
    $('#app').innerHTML = `${header()}<div class="wrap" style="padding:80px 20px;text-align:center">
      <h2>Contestant not found</h2>
      <p class="muted" style="margin:12px 0 24px">This profile may have been removed.</p>
      <a class="btn gold" href="#/">Back to leaderboard</a></div>${footer()}`;
    return;
  }
  const votes = votesFor(c.id);
  const rank = rankOf(c.id);
  const board = leaderboard();
  const leader = board[0];
  const pct = leader ? Math.round((votes / leader.votes) * 100) : 100;
  const url = contestantUrl(c.slug);
  const msg = shareMessage(c);
  const full = encodeURIComponent(msg + ' ' + url);

  $('#app').innerHTML = `
  ${header()}
  <div class="wrap">
    <div class="profile">
      ${avatarHTML(c,'lg')}
      <div>
        <span class="kicker">Rank #${rank} of ${board.length}</span>
        <h1 style="margin-top:12px">${esc(c.name)}</h1>
        <div class="tg serif">${esc(c.tagline)}</div>
        <p class="bio">${esc(c.bio || '')}</p>
        <div class="big-votes">
          <div><b>${num(votes)}</b><span>Votes</span></div>
          <div><b>${pct}%</b><span>Of the leader</span></div>
          <div><b>${money(S.settings.pricePerVote)}</b><span>Per vote</span></div>
        </div>
        <div style="margin-top:22px;display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn gold" data-vote="${esc(c.id)}" style="padding:14px 28px;font-size:15px">
            Vote for ${esc(c.name.split(' ')[0])}
          </button>
          <a class="btn ghost" href="#/">View leaderboard</a>
        </div>
      </div>
    </div>

    <div class="share-panel" id="share-panel">
      <h2 style="font-size:19px">Help ${esc(c.name.split(' ')[0])} win</h2>
      <p class="muted small" style="margin-top:6px">
        Copy the message below and send it to your group chats, story, or DM. Every vote is ${money(S.settings.pricePerVote)}.
      </p>
      <div style="background:#0c0c11;border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:14px;font-size:13.5px">
        “${esc(msg)} <span class="mono" style="color:var(--gold2)">${esc(url)}</span>”
      </div>
      <div class="share-link">
        <input readonly value="${esc(url)}" id="share-url">
        <button class="btn" id="copy-link">Copy link</button>
      </div>
      <div class="share-btns">
        <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${full}">WhatsApp</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}&url=${encodeURIComponent(url)}">X / Twitter</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}">Facebook</a>
        <a class="btn sm" target="_blank" rel="noopener" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}">Telegram</a>
        <button class="btn sm" id="native-share">More…</button>
      </div>
    </div>
  </div>
  ${footer()}`;

  $$('[data-vote]').forEach(b => b.onclick = () => openVote(b.dataset.vote));

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard', 'good'); }
    catch(e){
      const t = document.createElement('textarea');
      t.value = text; document.body.appendChild(t); t.select();
      document.execCommand('copy'); t.remove(); toast('Copied', 'good');
    }
  };
  $('#copy-link').onclick = () => copy(url);
  $('#share-url').onclick = e => e.target.select();
  $('#native-share').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: c.name, text: msg, url }); } catch(e){}
    } else copy(url);
  };
}

/* --------------------------------------------------------------------------
   HOW IT WORKS
   -------------------------------------------------------------------------- */
function renderHow(){
  $('#app').innerHTML = `
  ${header()}
  <div class="wrap" style="max-width:760px;padding-bottom:60px">
    <h1 style="font-size:34px;margin:40px 0 8px">How voting works</h1>
    <p class="muted" style="margin-bottom:30px">${esc(S.settings.eventName)} — ${esc(S.settings.tagline)}</p>

    <div class="panel">
      <h3 style="margin-bottom:14px">1. Pick your fashionista</h3>
      <p class="muted">Browse the leaderboard and open the profile of the designer or stylist you want to win.</p>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:14px">2. Buy votes — ${money(S.settings.pricePerVote)} each</h3>
      <p class="muted">Votes are sold in bundles. Bigger bundles carry bonus votes:
      ${S.settings.bundles.filter(b=>b.bonus>0).map(b => `${b.votes} votes → <b style="color:var(--gold2)">+${b.bonus} free</b>`).join(' · ') || 'no bonuses currently active'}.</p>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:14px">3. Pay by crypto or gift card</h3>
      <p class="muted">Crypto payments confirm automatically once the network settles.
      Gift card payments are reviewed by a human before the votes are credited — usually within a few hours.</p>
    </div>
    <div class="panel">
      <h3 style="margin-bottom:14px">4. Share your link</h3>
      <p class="muted">Every contestant has a personal link. Share it and ask your people to vote — that is how the crown is won.</p>
    </div>

    <div class="panel">
      <h3 style="margin-bottom:14px">Rules</h3>
      <ul class="muted" style="padding-left:20px;display:grid;gap:8px">
        <li>Votes are only credited after payment is confirmed. Pending orders do not count.</li>
        <li>All vote purchases are final and non-refundable once confirmed.</li>
        <li>Fraudulent, stolen, or already-redeemed gift cards will be rejected and the order voided.</li>
        <li>Chargebacks or reversed crypto transactions void the associated votes.</li>
        <li>Voting closes ${new Date(S.settings.deadline).toLocaleString()}. Late payments may not be counted.</li>
        <li>The organiser reserves the right to disqualify any contestant for vote manipulation.</li>
      </ul>
    </div>

    <a class="btn gold" href="#/">Back to the leaderboard</a>
  </div>
  ${footer()}`;
}

/* ==========================================================================
   VOTE FLOW
   ========================================================================== */
const flow = { open:false, step:1, cid:null, bundle:null, custom:'', method:null,
               coin:null, brand:null, code:'', txHash:'', voterName:'', voterEmail:'', ref:null };

function openVote(cid){
  Object.assign(flow, {
    open:true, step:1, cid, bundle:null, custom:'', method:null,
    coin:null, brand:null, code:'', txHash:'', voterName:'', voterEmail:'', ref:null
  });
  renderVoteModal();
}
function closeVote(){ flow.open = false; $('#modal-root').innerHTML = ''; }

function selection(){
  if (!flow.cid) return null;
  if (flow.custom) {
    const n = Math.max(1, Math.min(9999, parseInt(flow.custom,10) || 1));
    return { base:n, bonus:0, total:n, price: n * S.settings.pricePerVote };
  }
  if (flow.bundle) {
    const b = flow.bundle;
    return { base:b.votes, bonus:b.bonus||0, total:b.votes + (b.bonus||0), price:b.price };
  }
  return null;
}

function renderVoteModal(){
  if (!flow.open) return;
  const c = S.contestants.find(x => x.id === flow.cid);
  if (!c) { closeVote(); return; }
  const sel = selection();
  const st = S.settings;

  let body = '';

  if (flow.step === 1) {
    body = `
      <h3>Vote for ${esc(c.name)}</h3>
      <p class="muted small" style="margin-bottom:18px">${money(st.pricePerVote)} per vote · votes are credited after payment confirms</p>
      ${st.bundles.map((b,i) => {
        const active = flow.bundle === st.bundles[i];
        return `<button class="opt ${active?'sel':''}" data-bundle="${i}">
          <span class="v">${b.votes}</span>
          <span>vote${b.votes>1?'s':''}</span>
          ${b.bonus ? `<span class="bonus">+${b.bonus} free</span>` : ''}
          <span class="p">${money(b.price)}</span>
        </button>`;
      }).join('')}
      <div class="field" style="margin-top:16px">
        <label>Or enter a custom number of votes</label>
        <input type="number" min="1" max="9999" id="custom-votes" placeholder="e.g. 7" value="${esc(flow.custom)}">
      </div>
      ${sel ? `<div class="alert info">You get <b>${sel.total} vote${sel.total>1?'s':''}</b>${sel.bonus?` (${sel.base} + ${sel.bonus} bonus)`:''} for <b>${money(sel.price)}</b></div>` : ''}
      <button class="btn gold wide" id="to-step-2" ${sel?'':'disabled'} style="margin-top:8px">Continue to payment</button>`;
  }

  if (flow.step === 2) {
    body = `
      <h3>How would you like to pay?</h3>
      <p class="muted small" style="margin-bottom:18px">${sel.total} vote${sel.total>1?'s':''} · <b style="color:var(--gold2)">${money(sel.price)}</b></p>
      <button class="opt" data-method="crypto">
        <span style="font-size:20px">₿</span>
        <span><b>Crypto</b><br><span class="small muted">BTC · ETH · USDT · SOL — confirms automatically</span></span>
      </button>
      <button class="opt" data-method="giftcard">
        <span style="font-size:20px">🎁</span>
        <span><b>Gift card</b><br><span class="small muted">Amazon · Apple · Steam · Visa — reviewed manually</span></span>
      </button>
      <button class="btn ghost wide" data-back style="margin-top:8px">Back</button>`;
  }

  if (flow.step === 3 && flow.method === 'crypto') {
    if (!flow.coin) flow.coin = st.coins[0];
    body = `
      <h3>Send your crypto payment</h3>
      <p class="muted small" style="margin-bottom:16px">${sel.total} vote${sel.total>1?'s':''} for ${esc(c.name)} · <b style="color:var(--gold2)">${money(sel.price)}</b></p>
      <div class="field">
        <label>Choose a coin</label>
        <select id="coin-select">
          ${st.coins.map(co => `<option value="${esc(co.id)}" ${flow.coin.id===co.id?'selected':''}>${esc(co.label)} — ${esc(co.network)}</option>`).join('')}
        </select>
      </div>
      <div class="alert warn">
        Send exactly <b>${money(sel.price)}</b> worth of ${esc(flow.coin.label)} to the address below.
        <b>Send on the ${esc(flow.coin.network)} network only.</b> Wrong-network transfers are lost permanently.
      </div>
      <div class="pay-addr" id="pay-addr">${esc(flow.coin.address)}</div>
      <button class="btn sm wide" id="copy-addr" style="margin-bottom:16px">Copy address</button>
      <div class="field">
        <label>Transaction hash / proof (optional but speeds things up)</label>
        <input id="txhash" placeholder="0x… or paste the tx id" value="${esc(flow.txHash)}">
      </div>
      <div class="row">
        <div class="field"><label>Your name (optional)</label><input id="vname" value="${esc(flow.voterName)}" placeholder="Ada"></div>
        <div class="field"><label>Email (optional)</label><input id="vemail" value="${esc(flow.voterEmail)}" placeholder="you@mail.com"></div>
      </div>
      <button class="btn gold wide" id="submit-crypto">I have sent the payment</button>
      <button class="btn ghost wide" data-back style="margin-top:8px">Back</button>`;
  }

  if (flow.step === 3 && flow.method === 'giftcard') {
    if (!flow.brand) flow.brand = st.giftBrands[0];
    body = `
      <h3>Pay with a gift card</h3>
      <p class="muted small" style="margin-bottom:16px">${sel.total} vote${sel.total>1?'s':''} for ${esc(c.name)} · <b style="color:var(--gold2)">${money(sel.price)}</b></p>
      <div class="field">
        <label>Choose a gift card</label>
        <select id="brand-select">
          ${st.giftBrands.map(b => `<option value="${esc(b.id)}" ${flow.brand.id===b.id?'selected':''}>${esc(b.label)}</option>`).join('')}
        </select>
      </div>
      <div class="alert info">${esc(flow.brand.note)}</div>
      <div class="alert warn">
        Buy a card worth at least <b>${money(sel.price)}</b>. Enter the code below.
        A human reviews every gift card before votes are credited — usually within a few hours.
      </div>
      <div class="field">
        <label>Gift card code</label>
        <input id="gift-code" placeholder="XXXX-XXXX-XXXX" value="${esc(flow.code)}">
      </div>
      <div class="row">
        <div class="field"><label>Your name (optional)</label><input id="vname" value="${esc(flow.voterName)}" placeholder="Ada"></div>
        <div class="field"><label>Email (optional)</label><input id="vemail" value="${esc(flow.voterEmail)}" placeholder="you@mail.com"></div>
      </div>
      <button class="btn gold wide" id="submit-gift">Submit for review</button>
      <button class="btn ghost wide" data-back style="margin-top:8px">Back</button>`;
  }

  if (flow.step === 4) {
    const o = S.orders.find(x => x.ref === flow.ref);
    const confirmed = o && o.status === 'confirmed';
    body = `
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:44px">${confirmed ? '✅' : '⏳'}</div>
        <h3 style="margin-top:12px">${confirmed ? 'Votes credited!' : 'Payment submitted'}</h3>
        <p class="muted small" style="margin-top:8px">
          ${confirmed
            ? `Your ${sel ? sel.total : ''} votes for ${esc(c.name)} have been added to the leaderboard.`
            : `Your order is queued for confirmation. Votes appear on the leaderboard as soon as it clears.`}
        </p>
        <div class="pay-addr" style="text-align:left">Order ref: <b>${esc(flow.ref)}</b><br>
          Contestant: ${esc(c.name)}<br>
          Votes: ${sel ? sel.total : ''}<br>
          Amount: ${sel ? money(sel.price) : ''}<br>
          Method: ${o ? esc(o.detail) : ''}<br>
          Status: <b style="color:${confirmed?'var(--green)':'var(--amber)'}">${o ? String(o.status).toUpperCase() : ''}</b>
        </div>
        <button class="btn gold wide" id="share-after">Share ${esc(c.name.split(' ')[0])}'s link</button>
        <button class="btn ghost wide" data-close style="margin-top:8px">Close</button>
      </div>`;
  }

  const stepIndex = flow.step >= 3 ? 3 : flow.step;
  $('#modal-root').innerHTML = `
    <div class="backdrop" data-close-bg>
      <div class="modal" onclick="event.stopPropagation()">
        <button class="x" data-close>×</button>
        <div class="steps">
          <i class="${stepIndex>=1?'on':''}"></i>
          <i class="${stepIndex>=2?'on':''}"></i>
          <i class="${stepIndex>=3?'on':''}"></i>
        </div>
        ${body}
      </div>
    </div>`;

  bindVoteModal();
}

function bindVoteModal(){
  const root = $('#modal-root');

  $$('[data-close]', root).forEach(b => b.onclick = closeVote);
  $('[data-close-bg]', root).onclick = e => { if (e.target.dataset.closeBg !== undefined) closeVote(); };
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
    const sel = selection();
    const btn = $('#to-step-2', root);
    if (btn) btn.disabled = !sel;
    let info = $('.alert.info', root);
    if (sel) {
      const html = `You get <b>${sel.total} vote${sel.total>1?'s':''}</b> for <b>${money(sel.price)}</b>`;
      if (info) info.innerHTML = html;
      else { info = document.createElement('div'); info.className='alert info'; info.innerHTML=html; btn.before(info); }
    } else if (info) info.remove();
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
    try { await navigator.clipboard.writeText(flow.coin.address); toast('Address copied', 'good'); }
    catch(e){ toast('Copy failed — select manually', 'bad'); }
  };
  const subCrypto = $('#submit-crypto', root);
  if (subCrypto) subCrypto.onclick = async () => {
    flow.txHash     = $('#txhash', root).value.trim();
    flow.voterName  = $('#vname', root).value.trim();
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

    if (S.settings.autoConfirmCrypto) {
      setTimeout(async () => {
        try {
          const cur = DB.orders[order.id];
          if (cur && cur.status === 'pending') {
            await fbSetOrderStatus(order.id, 'confirmed');
            if (flow.open && flow.step === 4) renderVoteModal();
            toast('Payment confirmed — votes credited 🎉', 'good');
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
    if (code.length < 6) { toast('Enter the full gift card code', 'bad'); return; }
    flow.code       = code;
    flow.voterName  = $('#vname', root).value.trim();
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

    if (S.settings.autoConfirmGift) {
      setTimeout(async () => {
        try {
          const cur = DB.orders[order.id];
          if (cur && cur.status === 'pending') {
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
    ref: 'CAVE-' + rnd(5),
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
   ADMIN
   ========================================================================== */
let adminTab = 'overview';
let editingId = null;

function renderAdmin(){
  if (sessionStorage.getItem('cave.admin') !== '1') return renderAdminLogin();

  const tabs = [
    ['overview','Overview'],
    ['orders','Orders' + (pendingOrders().length ? ` (${pendingOrders().length})` : '')],
    ['contestants','Contestants'],
    ['settings','Settings'],
    ['data','Data'],
  ];

  $('#app').innerHTML = `
  ${header()}
  <div class="wrap" style="padding-bottom:60px">
    <div class="admin-head">
      <h1 style="font-size:28px">Admin console</h1>
      <span class="muted small">${esc(S.settings.eventName)} — ${esc(S.settings.tagline)}</span>
      <button class="btn sm" id="logout" style="margin-left:auto">Sign out</button>
    </div>
    <div class="tabs">
      ${tabs.map(([id,label]) => `<button class="tab ${adminTab===id?'on':''}" data-tab="${id}">${esc(label)}</button>`).join('')}
    </div>
    <div id="admin-body"></div>
  </div>
  ${footer()}`;

  $$('[data-tab]').forEach(b => b.onclick = () => { adminTab = b.dataset.tab; editingId = null; renderAdmin(); });
  $('#logout').onclick = () => { sessionStorage.removeItem('cave.admin'); toast('Signed out'); renderAdmin(); };

  const body = $('#admin-body');
  if (adminTab === 'overview')    body.innerHTML = adminOverview();
  if (adminTab === 'orders')      { body.innerHTML = adminOrders(); bindAdminOrders(); }
  if (adminTab === 'contestants') { body.innerHTML = adminContestants(); bindAdminContestants(); }
  if (adminTab === 'settings')    { body.innerHTML = adminSettings(); bindAdminSettings(); }
  if (adminTab === 'data')        { body.innerHTML = adminData(); bindAdminData(); }
}

function renderAdminLogin(){
  $('#app').innerHTML = `
  ${header()}
  <div class="wrap" style="max-width:400px;padding:90px 20px">
    <div class="panel">
      <h2 style="font-size:24px;margin-bottom:6px">Admin sign in</h2>
      <p class="muted small" style="margin-bottom:20px">Default PIN is <span class="mono">cave2026</span> — change it in Settings.</p>
      <div class="field"><label>Admin PIN</label><input type="password" id="pin" placeholder="••••••••" autocomplete="current-password"></div>
      <button class="btn gold wide" id="login">Enter console</button>
      <p class="tiny muted" style="margin-top:12px;text-align:center">Demo only — replace with real server-side auth in production.</p>
    </div>
  </div>`;
  const go = () => {
    if ($('#pin').value === S.settings.adminPin) {
      sessionStorage.setItem('cave.admin','1');
      renderAdmin();
    } else toast('Incorrect PIN', 'bad');
  };
  $('#login').onclick = go;
  $('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
}

function adminOverview(){
  const board = leaderboard();
  const max = board[0]?.votes || 1;
  const conf = S.orders.filter(o => o.status === 'confirmed');
  const pend = pendingOrders();
  const giftPend = pend.filter(o => o.method === 'giftcard').length;

  setTimeout(() => {
    const g = $('[data-goto]');
    if (g) g.onclick = () => { adminTab='orders'; renderAdmin(); };
  }, 0);

  return `
    <div class="stats" style="margin-top:0">
      <div class="stat"><b>${num(totalVotesCast())}</b><span>Votes cast</span></div>
      <div class="stat"><b>${money(totalRevenue())}</b><span>Confirmed revenue</span></div>
      <div class="stat"><b>${num(pend.length)}</b><span>Pending orders</span></div>
      <div class="stat"><b>${money(pend.reduce((a,o)=>a+Number(o.amount||0),0))}</b><span>Pending value</span></div>
      <div class="stat"><b>${num(conf.length)}</b><span>Confirmed orders</span></div>
    </div>

    ${giftPend ? `<div class="alert warn">⚠️ ${giftPend} gift card order${giftPend>1?'s':''} waiting for manual review.
      <button class="btn sm" style="margin-left:10px" data-goto="orders">Review now</button></div>` : ''}

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:16px">Leaderboard</h3>
      ${board.map((c,i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:9px 0;border-bottom:1px solid #1b1b22">
          <span class="muted mono" style="width:28px">#${i+1}</span>
          ${avatarHTML(c)}
          <span style="min-width:150px">${esc(c.name)}</span>
          <div class="bar" style="flex:1;margin:0"><i style="width:${Math.max(2,(c.votes/max)*100)}%"></i></div>
          <b style="color:var(--gold2);min-width:70px;text-align:right">${num(c.votes)}</b>
        </div>`).join('')}
    </div>`;
}

function adminOrders(){
  const filter = window.__orderFilter || 'all';
  const list = S.orders
    .filter(o => filter === 'all' ? true : o.status === filter)
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  return `
    <div class="panel">
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
        ${['all','pending','confirmed','rejected'].map(f =>
          `<button class="btn sm ${filter===f?'gold':''}" data-filter="${f}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}
        <span class="muted small" style="margin-left:auto;align-self:center">${list.length} order${list.length===1?'':'s'}</span>
      </div>
      <div class="table-scroll">
      <table>
        <thead><tr>
          <th>Ref</th><th>Contestant</th><th>Votes</th><th>Amount</th>
          <th>Method</th><th>Status</th><th>Placed</th><th></th>
        </tr></thead>
        <tbody>
          ${list.length ? list.map(o => {
            const c = S.contestants.find(x => x.id === o.contestantId);
            return `
            <tr>
              <td class="mono tiny">${esc(o.ref)}</td>
              <td>${esc(c ? c.name : '— deleted —')}</td>
              <td><b style="color:var(--gold2)">${o.votes}</b>${o.bonus?` <span class="tiny muted">(+${o.bonus})</span>`:''}</td>
              <td>${money(o.amount)}</td>
              <td class="small">${esc(o.detail)}</td>
              <td><span class="pill ${o.status}">${esc(o.status)}</span></td>
              <td class="tiny muted">${o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
              <td>
                <div class="actions">
                  ${o.status === 'pending' ? `
                    <button class="btn sm ok" data-confirm="${o.id}">Confirm</button>
                    <button class="btn sm danger" data-reject="${o.id}">Reject</button>` : `
                    <button class="btn sm" data-toggle="${o.id}">Details</button>`}
                </div>
              </td>
            </tr>
            <tr class="detail-row" id="det-${o.id}" style="display:none">
              <td colspan="8">
                <b>Proof:</b> ${o.proof && o.proof.txHash ? `tx <span class="mono">${esc(o.proof.txHash)}</span>` : ''}
                ${o.proof && o.proof.code ? `gift code <span class="mono" style="color:var(--gold2)">${esc(o.proof.code)}</span>` : ''}
                ${(!o.proof || (!o.proof.txHash && !o.proof.code)) ? '<span class="muted">none supplied</span>' : ''}
                &nbsp;·&nbsp; <b>Voter:</b> ${esc(o.voter?.name || 'anonymous')} ${o.voter?.email ? '· ' + esc(o.voter.email) : ''}
                &nbsp;·&nbsp; <b>Order ID:</b> <span class="mono">${esc(o.id)}</span>
                ${o.confirmedAt ? `&nbsp;·&nbsp; <b>Confirmed:</b> ${new Date(o.confirmedAt).toLocaleString()}` : ''}
              </td>
            </tr>`;
          }).join('') : `<tr><td colspan="8" class="muted" style="text-align:center;padding:34px">No orders yet.</td></tr>`}
        </tbody>
      </table>
      </div>
    </div>`;
}

function bindAdminOrders(){
  $$('[data-filter]').forEach(b => b.onclick = () => { window.__orderFilter = b.dataset.filter; renderAdmin(); });
  $$('[data-confirm]').forEach(b => b.onclick = () => setOrderStatus(b.dataset.confirm, 'confirmed'));
  $$('[data-reject]').forEach(b => b.onclick = () => setOrderStatus(b.dataset.reject, 'rejected'));
  $$('[data-toggle]').forEach(b => b.onclick = () => {
    const row = $('#det-' + b.dataset.toggle);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
  });
}

async function setOrderStatus(id, status){
  try {
    await fbSetOrderStatus(id, status);
    toast(status === 'confirmed' ? 'Order confirmed — votes credited' : 'Order rejected',
          status === 'confirmed' ? 'good' : 'bad');
  } catch(e){
    toast('Update failed: ' + e.message, 'bad');
  }
}

function adminContestants(){
  const editing = editingId ? S.contestants.find(c => c.id === editingId) : null;
  const blank = { id:'', slug:'', name:'', tagline:'', bio:'', photo:'', c1:'#f7e08a', c2:'#b8860b', votes:0, status:'active' };
  const f = editing || blank;

  return `
    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:16px">${editing ? 'Edit contestant' : 'Add a contestant'}</h3>
      <div class="row">
        <div class="field"><label>Name</label><input id="f-name" value="${esc(f.name)}" placeholder="Amara Vale"></div>
        <div class="field"><label>Tagline</label><input id="f-tag" value="${esc(f.tagline)}" placeholder="Avant-garde couture"></div>
      </div>
      <div class="field"><label>Short bio</label><textarea id="f-bio" rows="2" placeholder="One or two sentences…">${esc(f.bio)}</textarea></div>
      <div class="row">
        <div class="field"><label>Photo URL (optional)</label><input id="f-photo" value="${esc(f.photo)}" placeholder="https://…"></div>
        <div class="field"><label>Slug (share link)</label><input id="f-slug" value="${esc(f.slug)}" placeholder="auto-generated"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Gradient start</label><input type="color" id="f-c1" value="${esc(f.c1)}" style="height:44px;padding:4px"></div>
        <div class="field"><label>Gradient end</label><input type="color" id="f-c2" value="${esc(f.c2)}" style="height:44px;padding:4px"></div>
        <div class="field"><label>Vote count (manual override)</label><input type="number" id="f-adjust" value="${Number(f.votes)||0}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Status</label>
          <select id="f-status">
            <option value="active" ${f.status==='active'?'selected':''}>Active (visible)</option>
            <option value="hidden" ${f.status==='hidden'?'selected':''}>Hidden</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:9px">
        <button class="btn gold" id="save-contestant">${editing ? 'Save changes' : 'Add contestant'}</button>
        ${editing ? '<button class="btn ghost" id="cancel-edit">Cancel</button>' : ''}
      </div>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:16px">All contestants (${S.contestants.length})</h3>
      <div class="table-scroll">
      <table>
        <thead><tr><th></th><th>Name</th><th>Slug</th><th>Votes</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${S.contestants.map(c => `
            <tr>
              <td style="width:52px">${avatarHTML(c)}</td>
              <td>${esc(c.name)}<div class="tiny muted">${esc(c.tagline)}</div></td>
              <td class="mono tiny">${esc(c.slug)}</td>
              <td><b style="color:var(--gold2)">${num(votesFor(c.id))}</b></td>
              <td><span class="pill ${c.status==='hidden'?'rejected':'confirmed'}">${esc(c.status)}</span></td>
              <td>
                <div class="actions">
                  <button class="btn sm" data-edit="${c.id}">Edit</button>
                  <button class="btn sm" data-copy="${c.id}">Copy link</button>
                  <button class="btn sm danger" data-del="${c.id}">Delete</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>`;
}

function bindAdminContestants(){
  $('#save-contestant').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) { toast('Name is required', 'bad'); return; }

    const slug = slugify($('#f-slug').value.trim() || name);
    if (S.contestants.some(c => c.slug === slug && c.id !== editingId)) {
      toast('That slug is already taken', 'bad'); return;
    }

    const data = {
      name,
      slug,
      tagline: $('#f-tag').value.trim(),
      bio:     $('#f-bio').value.trim(),
      photo:   $('#f-photo').value.trim(),
      c1:      $('#f-c1').value,
      c2:      $('#f-c2').value,
      votes:   parseInt($('#f-adjust').value, 10) || 0,
      status:  $('#f-status').value,
    };

    try {
      if (editingId) {
        await updateContestant(editingId, data);
        toast('Contestant updated', 'good');
      } else {
        await createContestant(data);
        toast('Contestant added', 'good');
      }
      editingId = null;
    } catch(e){
      toast('Save failed: ' + e.message, 'bad');
    }
  };

  const cancel = $('#cancel-edit');
  if (cancel) cancel.onclick = () => { editingId = null; renderAdmin(); };

  $$('[data-edit]').forEach(b => b.onclick = () => {
    editingId = b.dataset.edit;
    renderAdmin();
    window.scrollTo({ top:0, behavior:'smooth' });
  });

  $$('[data-del]').forEach(b => b.onclick = async () => {
    const c = S.contestants.find(x => x.id === b.dataset.del);
    if (!confirm(`Delete ${c.name}? Their orders stay in the records but votes stop counting.`)) return;
    try { await deleteContestant(c.id); toast('Contestant deleted'); }
    catch(e){ toast('Delete failed: ' + e.message, 'bad'); }
  });

  $$('[data-copy]').forEach(b => b.onclick = async () => {
    const c = S.contestants.find(x => x.id === b.dataset.copy);
    const url = contestantUrl(c.slug);
    try { await navigator.clipboard.writeText(url); toast('Share link copied', 'good'); }
    catch(e){ prompt('Copy this link:', url); }
  });
}

function adminSettings(){
  const s = S.settings;
  return `
    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:16px">Event</h3>
      <div class="row">
        <div class="field"><label>Event name</label><input id="s-name" value="${esc(s.eventName)}"></div>
        <div class="field"><label>Tagline</label><input id="s-tag" value="${esc(s.tagline)}"></div>
      </div>
      <div class="row3">
        <div class="field"><label>Price per vote (USD)</label><input type="number" id="s-price" value="${s.pricePerVote}" min="0.5" step="0.5"></div>
        <div class="field"><label>Voting closes</label><input type="datetime-local" id="s-deadline" value="${esc(s.deadline)}"></div>
        <div class="field"><label>Admin PIN</label><input id="s-pin" value="${esc(s.adminPin)}"></div>
      </div>
      <div class="row">
        <div class="field"><label>Auto-confirm crypto</label>
          <select id="s-autoc"><option value="1" ${s.autoConfirmCrypto?'selected':''}>Yes — credit immediately</option>
          <option value="0" ${!s.autoConfirmCrypto?'selected':''}>No — manual review</option></select></div>
        <div class="field"><label>Auto-confirm gift cards</label>
          <select id="s-autog"><option value="1" ${s.autoConfirmGift?'selected':''}>Yes</option>
          <option value="0" ${!s.autoConfirmGift?'selected':''}>No — manual review (recommended)</option></select></div>
      </div>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Vote bundles</h3>
      <p class="muted small" style="margin-bottom:16px">Bonus votes are added on top of the base votes.</p>
      <div id="bundle-rows">
        ${s.bundles.map((b,i) => `
          <div class="row3" style="margin-bottom:10px" data-brow="${i}">
            <div class="field" style="margin:0"><label>Votes</label><input type="number" class="b-votes" value="${b.votes}" min="1"></div>
            <div class="field" style="margin:0"><label>Price (USD)</label><input type="number" class="b-price" value="${b.price}" min="0.5" step="0.5"></div>
            <div class="field" style="margin:0"><label>Bonus votes</label><input type="number" class="b-bonus" value="${b.bonus||0}" min="0"></div>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-bundle" style="margin-top:6px">+ Add bundle</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Crypto receiving addresses</h3>
      <p class="muted small" style="margin-bottom:16px">One row per coin. The network label is shown to the voter.</p>
      <div id="coin-rows">
        ${s.coins.map((c,i) => `
          <div class="row3" style="margin-bottom:10px" data-crow="${i}">
            <div class="field" style="margin:0"><label>Label</label><input class="c-label" value="${esc(c.label)}"></div>
            <div class="field" style="margin:0"><label>Network</label><input class="c-net" value="${esc(c.network)}"></div>
            <div class="field" style="margin:0"><label>Address</label><input class="c-addr mono" value="${esc(c.address)}"></div>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-coin" style="margin-top:6px">+ Add coin</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Gift card brands</h3>
      <p class="muted small" style="margin-bottom:16px">The note is shown to the voter as buying instructions.</p>
      <div id="brand-rows">
        ${s.giftBrands.map((b,i) => `
          <div style="margin-bottom:10px" data-grow="${i}">
            <div class="row">
              <div class="field" style="margin:0"><label>Label</label><input class="g-label" value="${esc(b.label)}"></div>
              <div class="field" style="margin:0"><label>Instructions</label><input class="g-note" value="${esc(b.note)}"></div>
            </div>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-brand" style="margin-top:6px">+ Add brand</button>
    </div>

    <button class="btn gold" id="save-settings">Save all settings</button>`;
}

function bindAdminSettings(){
  $('#add-bundle').onclick = () => {
    const wrap = $('#bundle-rows');
    const div = document.createElement('div');
    div.className = 'row3'; div.style.marginBottom = '10px';
    div.innerHTML = `<div class="field" style="margin:0"><label>Votes</label><input type="number" class="b-votes" value="100" min="1"></div>
      <div class="field" style="margin:0"><label>Price (USD)</label><input type="number" class="b-price" value="300" min="0.5" step="0.5"></div>
      <div class="field" style="margin:0"><label>Bonus votes</label><input type="number" class="b-bonus" value="0" min="0"></div>`;
    wrap.appendChild(div);
  };
  $('#add-coin').onclick = () => {
    const wrap = $('#coin-rows');
    const div = document.createElement('div');
    div.className = 'row3'; div.style.marginBottom = '10px';
    div.innerHTML = `<div class="field" style="margin:0"><label>Label</label><input class="c-label" value=""></div>
      <div class="field" style="margin:0"><label>Network</label><input class="c-net" value=""></div>
      <div class="field" style="margin:0"><label>Address</label><input class="c-addr mono" value=""></div>`;
    wrap.appendChild(div);
  };
  $('#add-brand').onclick = () => {
    const wrap = $('#brand-rows');
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.innerHTML = `<div class="row">
      <div class="field" style="margin:0"><label>Label</label><input class="g-label" value=""></div>
      <div class="field" style="margin:0"><label>Instructions</label><input class="g-note" value=""></div></div>`;
    wrap.appendChild(div);
  };

  $('#save-settings').onclick = async () => {
    const payload = {
      eventName: $('#s-name').value.trim() || 'CAVE',
      tagline:   $('#s-tag').value.trim(),
      pricePerVote: Math.max(0.5, parseFloat($('#s-price').value) || 3),
      deadline:  $('#s-deadline').value || S.settings.deadline,
      adminPin:  $('#s-pin').value.trim() || 'cave2026',
      autoConfirmCrypto: $('#s-autoc').value === '1',
      autoConfirmGift:   $('#s-autog').value === '1',
      bundles: $$('#bundle-rows [data-brow]').map(row => ({
        votes: Math.max(1, parseInt($('.b-votes', row).value,10) || 1),
        price: Math.max(0.5, parseFloat($('.b-price', row).value) || 3),
        bonus: Math.max(0, parseInt($('.b-bonus', row).value,10) || 0),
      })).sort((a,b) => a.votes - b.votes),
      coins: $$('#coin-rows [data-crow]').map((row,i) => ({
        id: 'coin' + i,
        label: $('.c-label', row).value.trim() || 'Coin',
        network: $('.c-net', row).value.trim() || 'Mainnet',
        address: $('.c-addr', row).value.trim(),
      })).filter(c => c.address),
      giftBrands: $$('#brand-rows [data-grow]').map((row,i) => ({
        id: 'brand' + i,
        label: $('.g-label', row).value.trim() || 'Gift card',
        note: $('.g-note', row).value.trim(),
      })).filter(b => b.label),
    };

    try {
      await saveSettings(payload);
      toast('Settings saved', 'good');
    } catch(e){
      toast('Save failed: ' + e.message, 'bad');
    }
  };
}

function adminData(){
  const json = JSON.stringify(S, null, 2);
  return `
    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">First-time setup</h3>
      <p class="muted small" style="margin-bottom:14px">Populate the empty database with the demo contestants and default settings.</p>
      <button class="btn gold" id="seed-db">Seed demo data</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Export</h3>
      <p class="muted small" style="margin-bottom:14px">Download a full backup of contestants, orders and settings.</p>
      <button class="btn" id="export">Download JSON</button>
      <button class="btn" id="copy-json">Copy to clipboard</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Import</h3>
      <p class="muted small" style="margin-bottom:14px">Paste a previously exported JSON blob to restore state.</p>
      <div class="field"><textarea id="import-box" rows="6" placeholder='{"settings":…,"contestants":…,"orders":…}'></textarea></div>
      <button class="btn" id="import">Restore from JSON</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Danger zone</h3>
      <p class="muted small" style="margin-bottom:14px">Wipe all database content and start fresh.</p>
      <button class="btn danger" id="reset">Reset everything</button>
    </div>

    <div class="panel">
      <h3 style="font-size:18px;margin-bottom:6px">Raw state</h3>
      <div class="pay-addr" style="max-height:320px;overflow:auto;white-space:pre-wrap">${esc(json.slice(0, 4000))}${json.length>4000?'\n…truncated…':''}</div>
    </div>`;
}

function bindAdminData(){
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(S,null,2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cave-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Backup downloaded', 'good');
  };

  $('#copy-json').onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(S,null,2)); toast('Copied', 'good'); }
    catch(e){ toast('Copy failed', 'bad'); }
  };

  const seedBtn = $('#seed-db');
  if (seedBtn) seedBtn.onclick = async () => {
    if (!confirm('Write the demo contestants/settings to the database? This OVERWRITES existing data.')) return;
    try {
      const payload = {
        settings: DEFAULTS.settings,
        contestants: Object.fromEntries(DEFAULTS.contestants.map(c => [c.id, stripId(c)])),
        orders: {},
      };
      await bulkSeed(payload);
      toast('Database seeded', 'good');
    } catch(e){ toast('Seed failed: ' + e.message, 'bad'); }
  };

  $('#import').onclick = async () => {
    try {
      const parsed = JSON.parse($('#import-box').value);
      if (!parsed.settings || !parsed.contestants) throw new Error('bad shape');
      const payload = {
        settings:    Object.assign({}, DEFAULTS.settings, parsed.settings),
        contestants: parsed.contestants || {},
        orders:      parsed.orders || {},
      };
      await bulkSeed(payload);
      toast('State restored', 'good');
    } catch(e){ toast('Invalid JSON: ' + e.message, 'bad'); }
  };

  $('#reset').onclick = async () => {
    if (!confirm('This deletes every contestant, order and setting. Continue?')) return;
    try { await wipeAll(); toast('Database wiped'); }
    catch(e){ toast('Reset failed: ' + e.message, 'bad'); }
  };
}

/* ==========================================================================
   COUNTDOWN
   ========================================================================== */
function tickCountdown(){
  const el = $('#countdown');
  if (!el) return;
  const target = new Date(S.settings.deadline).getTime();
  const diff = target - Date.now();
  if (isNaN(target) || diff <= 0) {
    el.innerHTML = `<div class="cd-box"><b>Closed</b><span>Voting ended</span></div>`;
    const lbl = $('#cd-label');
    if (lbl) lbl.textContent = 'Voting is now closed. Thank you!';
    return;
  }
  const s = Math.floor(diff/1000);
  const parts = [
    [Math.floor(s/86400), 'Days'],
    [Math.floor(s%86400/3600), 'Hours'],
    [Math.floor(s%3600/60), 'Mins'],
    [s%60, 'Secs'],
  ];
  el.innerHTML = parts.map(([v,l]) =>
    `<div class="cd-box"><b>${String(v).padStart(2,'0')}</b><span>${l}</span></div>`).join('');
}
setInterval(tickCountdown, 1000);

/* ==========================================================================
   ROUTER
   ========================================================================== */
function router(){
  const hash = location.hash || '#/';
  closeVote();
  window.scrollTo(0,0);

  if (hash.startsWith('#/c/'))      return renderContestant(decodeURIComponent(hash.slice(4)));
  if (hash.startsWith('#/admin'))   return renderAdmin();
  if (hash.startsWith('#/how'))     return renderHow();
  return renderHome();
}

window.addEventListener('hashchange', router);

/* ==========================================================================
   BOOT — subscribe to Firebase and render on every snapshot
   ========================================================================== */
let booted = false;

onData(() => {
  refreshState();

  if (!DB.ready.contestants || !DB.ready.settings) {
    if (!booted) {
      $('#app').innerHTML = `
        <div class="wrap" style="padding:120px 20px;text-align:center">
          <p class="muted">Loading CAVE…</p>
        </div>`;
    }
    return;
  }

  if (!booted) {
    booted = true;
    router();
    return;
  }

  // Skip re-render while a form field in the admin panel has focus.
  const ae = document.activeElement;
  const editing =
    ae && ae.closest && ae.closest('#admin-body') &&
    ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName);

  if (!flow.open && !editing) router();
});

subscribe();

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVote(); });