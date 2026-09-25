/* ==========================================================================
   CRAVE — Admin console
   ========================================================================== */

import {
  DB, subscribe, onData,
  saveSettings, createContestant, updateContestant, deleteContestant,
  setOrderStatus as fbSetOrderStatus,
  bulkSeed, wipeAll,
} from './db.js';

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const num   = n => Number(n).toLocaleString('en-US');
const pad2  = n => String(n).padStart(2,'0');
const slugify = s => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const initials = n => String(n).split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();

const FALLBACK_SETTINGS = {
  eventName:'CRAVE',
  tagline:'Best Fashionista of the Year 2026',
  pricePerVote:3,
  deadline:'2026-12-31T23:59',
  adminPin:'cave2026',
  autoConfirmCrypto:true,
  autoConfirmGift:false,
  bundles:[
    { votes:1,  price:3,   bonus:0  },
    { votes:5,  price:15,  bonus:0  },
    { votes:10, price:30,  bonus:1  },
    { votes:25, price:75,  bonus:4  },
    { votes:50, price:150, bonus:12 },
  ],
  coins:[
    { id:'BTC',  label:'Bitcoin',  network:'Bitcoin network', address:'' },
    { id:'ETH',  label:'Ethereum', network:'ERC-20',          address:'' },
    { id:'USDT', label:'USDT',     network:'TRC-20',          address:'' },
    { id:'SOL',  label:'Solana',   network:'Solana',          address:'' },
  ],
  giftBrands:[
  { id:'apple',    label:'Apple Gift Card',    note:'Scratch the back and enter the 16-character iTunes code.' },
  { id:'transcash',label:'TransCash',          note:'Enter the TransCash voucher number and PIN exactly as printed on the receipt.' },
  { id:'paysafe',  label:'Paysafe',            note:'Enter the 16-digit paysafecard PIN from your voucher.' },
  { id:'steam',    label:'Steam Gift Card',    note:'Enter the Steam wallet code exactly as printed.' },
],
};

const SEED_CONTESTANTS = [
  { id:'c1', slug:'amara-vale',     name:'Amara Vale',     tagline:'Avant-garde couture', bio:'Lagos-born, Paris-trained. Amara closes runway shows in sculptural silhouettes that feel like architecture in motion.', photo:'', c1:'#f7e08a', c2:'#b8860b', votes:1284, status:'active' },
  { id:'c2', slug:'zuri-blackwood', name:'Zuri Blackwood', tagline:'Streetwear royalty',  bio:'Founder of the BLACKWOOD label. Zuri turned a thrifted denim jacket into a sold-out global drop.', photo:'', c1:'#c3ccff', c2:'#5b6bff', votes:1102, status:'active' },
  { id:'c3', slug:'nadia-rossi',    name:'Nadia Rossi',    tagline:'Milanese minimalism', bio:'Quiet luxury, loud presence. Nadia styles in a palette of bone, camel and black — and never misses.', photo:'', c1:'#ffb3ba', c2:'#d6336c', votes:976,  status:'active' },
  { id:'c4', slug:'kofi-mensah',    name:'Kofi Mensah',    tagline:'Tailoring & textile', bio:'Accra tailor reviving kente weaving inside razor-sharp contemporary suiting.', photo:'', c1:'#9df0cf', c2:'#0f9b6c', votes:812,  status:'active' },
  { id:'c5', slug:'lena-okafor',    name:'Lena Okafor',    tagline:'Red-carpet drama',    bio:'Three-time stylist of the year nominee. If it does not move when she walks, Lena will not wear it.', photo:'', c1:'#ffd79b', c2:'#e07b00', votes:654,  status:'active' },
  { id:'c6', slug:'rafael-cruz',    name:'Rafael Cruz',    tagline:'Menswear reimagined', bio:'São Paulo designer blurring the line between beachwear and black tie.', photo:'', c1:'#b9f6ff', c2:'#0891b2', votes:511,  status:'active' },
  { id:'c7', slug:'ivy-chen',       name:'Ivy Chen',       tagline:'Cyber-futurist',      bio:'3D-printed accessories and holographic fabric. Ivy dresses like the year 2075.', photo:'', c1:'#e9c7ff', c2:'#8b5cf6', votes:388,  status:'active' },
  { id:'c8', slug:'simone-adeyemi', name:'Simone Adeyemi', tagline:'Vintage revivalist',  bio:'Archivist of 1970s African print. Simone makes the past look like the future.', photo:'', c1:'#ffd6a5', c2:'#c2410c', votes:245,  status:'active' },
];

/* --------------------------------------------------------------------------
   STATE
   -------------------------------------------------------------------------- */
let S = { settings: FALLBACK_SETTINGS, contestants: [], orders: [] };
let adminTab = 'overview';
let editingId = null;
let orderFilter = 'all';

function refreshState(){
  S.settings    = Object.assign({}, FALLBACK_SETTINGS, DB.settings || {});
  S.contestants = Object.entries(DB.contestants || {}).map(([id,c]) => ({ id, ...c }));
  S.orders      = Object.entries(DB.orders      || {}).map(([id,o]) => ({ id, ...o }));
}
function stripId(obj){ const { id, ...rest } = obj; return rest; }

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
function pendingOrders(){ return S.orders.filter(o => o.status === 'pending'); }
function totalVotesCast(){ return S.contestants.reduce((a,c) => a + votesFor(c.id), 0); }
function totalRevenue(){
  return S.orders.filter(o => o.status === 'confirmed')
    .reduce((a,o) => a + Number(o.amount||0), 0);
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
   AVATAR
   -------------------------------------------------------------------------- */
function avSm(c){
  const grad = `background:linear-gradient(155deg,${esc(c.c1||'#444')},${esc(c.c2||'#111')})`;
  if (c.photo) return `<div class="av-sm"><img src="${esc(c.photo)}" alt=""></div>`;
  return `<div class="av-sm" style="${grad}">${esc(initials(c.name))}</div>`;
}

/* --------------------------------------------------------------------------
   LOGIN
   -------------------------------------------------------------------------- */
function renderLogin(){
  $('#admin-root').innerHTML = `
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">CRAVE<em>©</em></div>
      <div class="login-sub">Administrator console</div>
      <h2>Sign in</h2>
      <p>Enter the admin PIN to continue. Default PIN is <span class="mono gold">cave2026</span> — change it once signed in.</p>
      <div class="field">
        <label>Admin PIN</label>
        <input type="password" id="pin" placeholder="••••••••" autocomplete="current-password">
      </div>
      <button class="btn gold wide" id="login" style="margin-top:8px">Enter console</button>
    </div>
  </div>`;

  const go = () => {
    if ($('#pin').value === S.settings.adminPin){
      sessionStorage.setItem('cave.admin','1');
      renderShell();
    } else toast('Incorrect PIN','bad');
  };
  $('#login').onclick = go;
  $('#pin').onkeydown = e => { if (e.key === 'Enter') go(); };
  setTimeout(() => $('#pin').focus(), 60);
}

/* --------------------------------------------------------------------------
   SHELL
   -------------------------------------------------------------------------- */
function renderShell(){
  if (sessionStorage.getItem('cave.admin') !== '1') return renderLogin();

  const pending = pendingOrders().length;

  const tabs = [
    ['overview',    '01', 'Overview',    ''],
    ['orders',      '02', 'Orders',      pending ? String(pending) : ''],
    ['contestants', '03', 'Contestants', ''],
    ['settings',    '04', 'Settings',    ''],
    ['data',        '05', 'Data',        ''],
  ];

  $('#admin-root').innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="side-brand">
        <div class="side-brand-name">CRAVE<em>©</em></div>
        <div class="side-brand-sub">Admin console</div>
      </div>
      <nav class="side-nav">
        ${tabs.map(([id,n,label,badge]) => `
          <button class="${adminTab===id?'on':''}" data-tab="${id}">
            <span class="nav-num">${n}</span>
            <span class="nav-label">${esc(label)}</span>
            ${badge ? `<span class="nav-badge">${esc(badge)}</span>` : ''}
          </button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-user">Signed in · Admin</div>
        <button class="btn sm wide" id="logout">Sign out</button>
      </div>
    </aside>
    <main class="main">
      <div id="admin-body"></div>
    </main>
  </div>`;

  $$('[data-tab]').forEach(b => b.onclick = () => {
    adminTab = b.dataset.tab;
    editingId = null;
    renderShell();
  });
  $('#logout').onclick = () => {
    sessionStorage.removeItem('cave.admin');
    toast('Signed out');
    renderLogin();
  };

  const body = $('#admin-body');
  if (adminTab === 'overview')    body.innerHTML = viewOverview();
  if (adminTab === 'orders')      { body.innerHTML = viewOrders(); bindOrders(); }
  if (adminTab === 'contestants') { body.innerHTML = viewContestants(); bindContestants(); }
  if (adminTab === 'settings')    { body.innerHTML = viewSettings(); bindSettings(); }
  if (adminTab === 'data')        { body.innerHTML = viewData(); bindData(); }
}

/* --------------------------------------------------------------------------
   HEAD
   -------------------------------------------------------------------------- */
function topHead(kicker, title, meta, actions=''){
  return `
  <div class="top">
    <div>
      <div class="caps gold" style="margin-bottom:10px">${kicker}</div>
      <h1 class="top-title">${title}</h1>
      <div class="top-meta">${meta}</div>
    </div>
    <div class="top-actions">${actions}</div>
  </div>`;
}

/* --------------------------------------------------------------------------
   OVERVIEW
   -------------------------------------------------------------------------- */
function viewOverview(){
  const board = leaderboard();
  const max = board[0]?.votes || 1;
  const pend = pendingOrders();
  const conf = S.orders.filter(o => o.status === 'confirmed');
  const giftPend = pend.filter(o => o.method === 'giftcard').length;

  return `
  ${topHead(
    'Overview · Live',
    'The <em>state of play</em>',
    `${esc(S.settings.eventName)} — ${esc(S.settings.tagline)}`
  )}

  ${giftPend ? `<div class="alert warn">
    ${giftPend} gift card order${giftPend>1?'s':''} awaiting review.
    <button class="btn sm" data-goto-orders>Review now</button>
  </div>` : ''}

  <div class="stats">
    <div class="stat accent">
      <div class="stat-label">Votes cast</div>
      <b>${num(totalVotesCast())}</b>
      <div class="stat-sub">across ${board.length} contenders</div>
    </div>
    <div class="stat">
      <div class="stat-label">Confirmed revenue</div>
      <b>${money(totalRevenue())}</b>
      <div class="stat-sub">${num(conf.length)} order${conf.length===1?'':'s'}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Pending orders</div>
      <b>${num(pend.length)}</b>
      <div class="stat-sub">${money(pend.reduce((a,o)=>a+Number(o.amount||0),0))} at stake</div>
    </div>
    <div class="stat">
      <div class="stat-label">Gift cards held</div>
      <b>${num(giftPend)}</b>
      <div class="stat-sub">needs manual review</div>
    </div>
    <div class="stat">
      <div class="stat-label">Price per vote</div>
      <b>${money(S.settings.pricePerVote)}</b>
      <div class="stat-sub">${S.settings.bundles.length} bundle${S.settings.bundles.length===1?'':'s'}</div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Standings</h2>
      <span class="hint">${board.length} contestants</span>
    </div>
    <div class="panel-body pad0">
      ${board.length ? board.map((c,i) => {
        const pct = Math.max(2, Math.round((c.votes/max)*100));
        return `
        <div class="lb-row">
          <span class="lb-rank">${pad2(i+1)}</span>
          ${avSm(c)}
          <div>
            <div class="lb-name">${esc(c.name)}</div>
            <div class="lb-tag">${esc(c.tagline||'')}</div>
          </div>
          <div class="lb-bar"><i style="width:${pct}%"></i></div>
          <div class="lb-votes">${num(c.votes)}</div>
        </div>`;
      }).join('') : `<div class="empty">No contestants yet. Add some under the Contestants tab.</div>`}
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   ORDERS
   -------------------------------------------------------------------------- */
function viewOrders(){
  const list = S.orders
    .filter(o => orderFilter === 'all' ? true : o.status === orderFilter)
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  const filters = ['all','pending','confirmed','rejected'];

  return `
  ${topHead(
    'Orders',
    'Payment <em>queue</em>',
    `${list.length} order${list.length===1?'':'s'} shown`
  )}

  <div class="panel">
    <div class="panel-head">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${filters.map(f => `
          <button class="btn sm ${orderFilter===f?'gold':''}" data-filter="${f}">
            ${f[0].toUpperCase()+f.slice(1)}
          </button>`).join('')}
      </div>
      <span class="hint">${num(S.orders.length)} total</span>
    </div>
    <div class="panel-body pad0">
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Contestant</th>
              <th>Votes</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Status</th>
              <th>Placed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map(o => {
              const c = S.contestants.find(x => x.id === o.contestantId);
              return `
              <tr>
                <td class="td-mono">${esc(o.ref)}</td>
                <td>${esc(c ? c.name : '— deleted —')}</td>
                <td><span class="gold" style="font-family:var(--mono);font-weight:500">${o.votes}</span>${o.bonus?` <span class="dim" style="font-size:11px">(+${o.bonus})</span>`:''}</td>
                <td class="td-mono">${money(o.amount)}</td>
                <td class="td-small">${esc(o.detail)}</td>
                <td><span class="pill ${o.status}">${esc(o.status)}</span></td>
                <td class="td-small">${o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}</td>
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
                  <b>Proof:</b>
                  ${o.proof && o.proof.txHash ? `tx <span class="mono gold">${esc(o.proof.txHash)}</span>` : ''}
                  ${o.proof && o.proof.code ? `code <span class="mono gold">${esc(o.proof.code)}</span>` : ''}
                  ${(!o.proof || (!o.proof.txHash && !o.proof.code)) ? '<span class="dim">none supplied</span>' : ''}
                  &nbsp;·&nbsp; <b>Voter:</b> ${esc(o.voter?.name || 'anonymous')} ${o.voter?.email ? '· ' + esc(o.voter.email) : ''}
                  &nbsp;·&nbsp; <b>ID:</b> <span class="mono">${esc(o.id)}</span>
                  ${o.confirmedAt ? `&nbsp;·&nbsp; <b>Confirmed:</b> ${new Date(o.confirmedAt).toLocaleString()}` : ''}
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="8"><div class="empty">No orders match this filter.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function bindOrders(){
  $$('[data-filter]').forEach(b => b.onclick = () => {
    orderFilter = b.dataset.filter;
    renderShell();
  });
  $$('[data-confirm]').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.confirm, 'confirmed'));
  $$('[data-reject]').forEach(b => b.onclick = () => updateOrderStatus(b.dataset.reject, 'rejected'));
  $$('[data-toggle]').forEach(b => b.onclick = () => {
    const row = $('#det-' + b.dataset.toggle);
    if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
  });
}

async function updateOrderStatus(id, status){
  try {
    await fbSetOrderStatus(id, status);
    toast(status === 'confirmed' ? 'Order confirmed — votes credited' : 'Order rejected',
          status === 'confirmed' ? 'good' : 'bad');
  } catch(e){
    toast('Update failed: ' + e.message, 'bad');
  }
}

/* --------------------------------------------------------------------------
   CONTESTANTS
   -------------------------------------------------------------------------- */
function viewContestants(){
  const editing = editingId ? S.contestants.find(c => c.id === editingId) : null;
  const blank = {
    id:'', slug:'', name:'', tagline:'', bio:'', photo:'',
    c1:'#f7e08a', c2:'#b8860b', votes:0, status:'active',
  };
  const f = editing || blank;

  return `
  ${topHead(
    'Contestants',
    editing ? 'Edit <em>profile</em>' : 'Add a <em>contender</em>',
    `${S.contestants.length} total`
  )}

  <div class="panel">
    <div class="panel-head">
      <h2>${editing ? 'Editing: ' + esc(f.name) : 'New contestant'}</h2>
      ${editing ? `<button class="btn sm" id="cancel-edit">Cancel editing</button>` : ''}
    </div>
    <div class="panel-body">
      <div class="row-2">
        <div class="field"><label>Name</label><input id="f-name" value="${esc(f.name)}" placeholder="Amara Vale"></div>
        <div class="field"><label>Tagline</label><input id="f-tag" value="${esc(f.tagline)}" placeholder="Avant-garde couture"></div>
      </div>
      <div class="field"><label>Short bio</label><textarea id="f-bio" rows="3" placeholder="One or two sentences…">${esc(f.bio)}</textarea></div>
      <div class="row-2">
        <div class="field"><label>Photo URL (optional)</label><input id="f-photo" value="${esc(f.photo)}" placeholder="https://…"></div>
        <div class="field"><label>Slug (share link)</label><input id="f-slug" value="${esc(f.slug)}" placeholder="auto-generated"></div>
      </div>
      <div class="row-4">
        <div class="field"><label>Gradient start</label><input type="color" id="f-c1" value="${esc(f.c1)}" style="height:46px;padding:4px"></div>
        <div class="field"><label>Gradient end</label><input type="color" id="f-c2" value="${esc(f.c2)}" style="height:46px;padding:4px"></div>
        <div class="field"><label>Vote count (manual override)</label><input type="number" id="f-votes" value="${Number(f.votes)||0}"></div>
        <div class="field"><label>Status</label>
          <select id="f-status">
            <option value="active" ${f.status==='active'?'selected':''}>Active</option>
            <option value="hidden" ${f.status==='hidden'?'selected':''}>Hidden</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:8px">
        <button class="btn gold" id="save-contestant">${editing ? 'Save changes' : 'Add contestant'}</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>All contestants</h2>
      <span class="hint">${S.contestants.length} in database</span>
    </div>
    <div class="panel-body pad0">
      <div class="table-scroll">
        <table>
          <thead>
            <tr><th></th><th>Name</th><th>Slug</th><th>Votes</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${S.contestants.length ? S.contestants.map(c => `
              <tr>
                <td style="width:60px">${avSm(c)}</td>
                <td>
                  <div style="font-family:var(--serif);font-size:15px;font-weight:400">${esc(c.name)}</div>
                  <div class="td-small" style="font-size:11px">${esc(c.tagline||'')}</div>
                </td>
                <td class="td-mono">${esc(c.slug)}</td>
                <td><span class="gold" style="font-family:var(--mono);font-weight:500">${num(votesFor(c.id))}</span></td>
                <td><span class="pill ${c.status==='hidden'?'hidden':'confirmed'}">${esc(c.status)}</span></td>
                <td>
                  <div class="actions">
                    <button class="btn sm" data-edit="${c.id}">Edit</button>
                    <button class="btn sm" data-copy="${c.id}">Copy link</button>
                    <button class="btn sm danger" data-del="${c.id}">Delete</button>
                  </div>
                </td>
              </tr>`).join('') : `<tr><td colspan="6"><div class="empty">No contestants yet — add one above.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function bindContestants(){
  $('#save-contestant').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name){ toast('Name is required','bad'); return; }

    const slug = slugify($('#f-slug').value.trim() || name);
    if (S.contestants.some(c => c.slug === slug && c.id !== editingId)){
      toast('That slug is already taken','bad'); return;
    }

    const data = {
      name, slug,
      tagline: $('#f-tag').value.trim(),
      bio:     $('#f-bio').value.trim(),
      photo:   $('#f-photo').value.trim(),
      c1:      $('#f-c1').value,
      c2:      $('#f-c2').value,
      votes:   parseInt($('#f-votes').value, 10) || 0,
      status:  $('#f-status').value,
    };

    try {
      if (editingId){
        await updateContestant(editingId, data);
        toast('Contestant updated','good');
      } else {
        await createContestant(data);
        toast('Contestant added','good');
      }
      editingId = null;
      renderShell();
    } catch(e){
      toast('Save failed: ' + e.message, 'bad');
    }
  };
  const cancel = $('#cancel-edit');
  if (cancel) cancel.onclick = () => { editingId = null; renderShell(); };

  $$('[data-edit]').forEach(b => b.onclick = () => {
    editingId = b.dataset.edit;
    renderShell();
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
    const url = location.origin + '/' + '#/c/' + c.slug;
    try { await navigator.clipboard.writeText(url); toast('Share link copied','good'); }
    catch(e){ prompt('Copy this link:', url); }
  });
}

/* --------------------------------------------------------------------------
   SETTINGS
   -------------------------------------------------------------------------- */
function viewSettings(){
  const s = S.settings;
  return `
  ${topHead(
    'Settings',
    'Configuration',
    `${esc(s.eventName)} — ${esc(s.tagline)}`
  )}

  <div class="panel">
    <div class="panel-head"><h2>Event</h2></div>
    <div class="form-block">
      <div class="row-2">
        <div class="field"><label>Event name</label><input id="s-name" value="${esc(s.eventName)}"></div>
        <div class="field"><label>Tagline</label><input id="s-tag" value="${esc(s.tagline)}"></div>
      </div>
      <div class="row-3">
        <div class="field"><label>Price per vote (USD)</label><input type="number" id="s-price" value="${s.pricePerVote}" min="0.5" step="0.5"></div>
        <div class="field"><label>Voting closes</label><input type="datetime-local" id="s-deadline" value="${esc(s.deadline)}"></div>
        <div class="field"><label>Admin PIN</label><input id="s-pin" value="${esc(s.adminPin)}"></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Auto-confirm crypto</label>
          <select id="s-autoc">
            <option value="1" ${s.autoConfirmCrypto?'selected':''}>Yes — credit immediately</option>
            <option value="0" ${!s.autoConfirmCrypto?'selected':''}>No — manual review</option>
          </select>
        </div>
        <div class="field"><label>Auto-confirm gift cards</label>
          <select id="s-autog">
            <option value="1" ${s.autoConfirmGift?'selected':''}>Yes</option>
            <option value="0" ${!s.autoConfirmGift?'selected':''}>No — manual review (recommended)</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Vote bundles</h2>
      <span class="hint">Bonus votes added on top</span>
    </div>
    <div class="form-block">
      <div id="bundle-rows">
        ${s.bundles.map((b,i) => `
          <div class="sub-row" data-brow="${i}">
            <div class="field"><label>Votes</label><input type="number" class="b-votes" value="${b.votes}" min="1"></div>
            <div class="field"><label>Price (USD)</label><input type="number" class="b-price" value="${b.price}" min="0.5" step="0.5"></div>
            <div class="field"><label>Bonus votes</label><input type="number" class="b-bonus" value="${b.bonus||0}" min="0"></div>
            <button class="btn sm danger" data-remove-bundle="${i}">Remove</button>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-bundle" style="margin-top:14px">+ Add bundle</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Crypto receiving addresses</h2>
      <span class="hint">Shown to voters</span>
    </div>
    <div class="form-block">
      <div id="coin-rows">
        ${s.coins.map((c,i) => `
          <div class="sub-row" data-crow="${i}" style="grid-template-columns:1fr 1fr 2fr auto">
            <div class="field"><label>Label</label><input class="c-label" value="${esc(c.label)}"></div>
            <div class="field"><label>Network</label><input class="c-net" value="${esc(c.network)}"></div>
            <div class="field"><label>Address</label><input class="c-addr mono" value="${esc(c.address)}"></div>
            <button class="btn sm danger" data-remove-coin="${i}">Remove</button>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-coin" style="margin-top:14px">+ Add coin</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Gift card brands</h2>
      <span class="hint">Instructions shown to voters</span>
    </div>
    <div class="form-block">
      <div id="brand-rows">
        ${s.giftBrands.map((b,i) => `
          <div class="sub-row" data-grow="${i}" style="grid-template-columns:1fr 3fr auto">
            <div class="field"><label>Label</label><input class="g-label" value="${esc(b.label)}"></div>
            <div class="field"><label>Instructions</label><input class="g-note" value="${esc(b.note)}"></div>
            <button class="btn sm danger" data-remove-brand="${i}">Remove</button>
          </div>`).join('')}
      </div>
      <button class="btn sm" id="add-brand" style="margin-top:14px">+ Add brand</button>
    </div>
  </div>

  <div style="display:flex;gap:10px">
    <button class="btn gold" id="save-settings">Save all settings</button>
    <button class="btn" id="reload-settings">Reset form</button>
  </div>`;
}

function bindSettings(){
  $$('[data-remove-bundle]').forEach(b => b.onclick = () => {
    b.closest('[data-brow]').remove();
  });
  $$('[data-remove-coin]').forEach(b => b.onclick = () => {
    b.closest('[data-crow]').remove();
  });
  $$('[data-remove-brand]').forEach(b => b.onclick = () => {
    b.closest('[data-grow]').remove();
  });

  $('#add-bundle').onclick = () => {
    const wrap = $('#bundle-rows');
    const div = document.createElement('div');
    div.className = 'sub-row'; div.dataset.brow = 'new';
    div.innerHTML = `<div class="field"><label>Votes</label><input type="number" class="b-votes" value="100" min="1"></div>
      <div class="field"><label>Price (USD)</label><input type="number" class="b-price" value="300" min="0.5" step="0.5"></div>
      <div class="field"><label>Bonus votes</label><input type="number" class="b-bonus" value="0" min="0"></div>
      <button class="btn sm danger" data-remove-bundle>Remove</button>`;
    wrap.appendChild(div);
    div.querySelector('[data-remove-bundle]').onclick = () => div.remove();
  };
  $('#add-coin').onclick = () => {
    const wrap = $('#coin-rows');
    const div = document.createElement('div');
    div.className = 'sub-row'; div.dataset.crow = 'new';
    div.style.gridTemplateColumns = '1fr 1fr 2fr auto';
    div.innerHTML = `<div class="field"><label>Label</label><input class="c-label" value=""></div>
      <div class="field"><label>Network</label><input class="c-net" value=""></div>
      <div class="field"><label>Address</label><input class="c-addr mono" value=""></div>
      <button class="btn sm danger" data-remove-coin>Remove</button>`;
    wrap.appendChild(div);
    div.querySelector('[data-remove-coin]').onclick = () => div.remove();
  };
  $('#add-brand').onclick = () => {
    const wrap = $('#brand-rows');
    const div = document.createElement('div');
    div.className = 'sub-row'; div.dataset.grow = 'new';
    div.style.gridTemplateColumns = '1fr 3fr auto';
    div.innerHTML = `<div class="field"><label>Label</label><input class="g-label" value=""></div>
      <div class="field"><label>Instructions</label><input class="g-note" value=""></div>
      <button class="btn sm danger" data-remove-brand>Remove</button>`;
    wrap.appendChild(div);
    div.querySelector('[data-remove-brand]').onclick = () => div.remove();
  };

  $('#save-settings').onclick = async () => {
    const payload = {
      eventName: $('#s-name').value.trim() || 'CRAVE',
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
      toast('Settings saved','good');
    } catch(e){
      toast('Save failed: ' + e.message, 'bad');
    }
  };
  $('#reload-settings').onclick = () => renderShell();
}

/* --------------------------------------------------------------------------
   DATA
   -------------------------------------------------------------------------- */
function viewData(){
  const json = JSON.stringify(S, null, 2);
  return `
  ${topHead(
    'Data',
    'Backups &amp; <em>restore</em>',
    'Use with care'
  )}

  <div class="panel">
    <div class="panel-head">
      <h2>First-time setup</h2>
      <span class="hint">Overwrites current data</span>
    </div>
    <div class="panel-body">
      <p class="dim" style="margin-bottom:16px;font-size:13px">
        Populate the empty database with the eight demo contestants and default settings.
      </p>
      <button class="btn gold" id="seed-db">Seed demo data</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Export</h2></div>
    <div class="panel-body">
      <p class="dim" style="margin-bottom:16px;font-size:13px">
        Download a full JSON backup of contestants, orders and settings.
      </p>
      <button class="btn" id="export">Download JSON</button>
      <button class="btn" id="copy-json" style="margin-left:8px">Copy to clipboard</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>Import</h2></div>
    <div class="panel-body">
      <p class="dim" style="margin-bottom:16px;font-size:13px">
        Paste a previously exported JSON blob. This replaces the entire database.
      </p>
      <div class="field"><textarea id="import-box" rows="6" placeholder='{"settings":…,"contestants":…,"orders":…}'></textarea></div>
      <button class="btn" id="import">Restore from JSON</button>
    </div>
  </div>

  <div class="panel" style="border-color:rgba(217,75,75,.24)">
    <div class="panel-head">
      <h2 style="color:#f0a4a4">Danger zone</h2>
      <span class="hint">Irreversible</span>
    </div>
    <div class="panel-body">
      <p class="dim" style="margin-bottom:16px;font-size:13px">
        Deletes every contestant, order and setting from the database.
      </p>
      <button class="btn danger" id="reset">Wipe everything</button>
    </div>
  </div>

  <div class="panel">
    <div class="panel-head">
      <h2>Raw state</h2>
      <span class="hint">Preview · ${num(json.length)} chars</span>
    </div>
    <div class="panel-body">
      <pre class="mono dim" style="max-height:340px;overflow:auto;font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-all">${esc(json.slice(0,4000))}${json.length>4000?'\n…truncated…':''}</pre>
    </div>
  </div>`;
}

function bindData(){
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(S,null,2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cave-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup downloaded','good');
  };
  $('#copy-json').onclick = async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(S,null,2)); toast('Copied','good'); }
    catch(e){ toast('Copy failed','bad'); }
  };
  $('#seed-db').onclick = async () => {
    if (!confirm('Write the demo contestants and settings to the database? This OVERWRITES existing data.')) return;
    try {
      const payload = {
        settings: FALLBACK_SETTINGS,
        contestants: Object.fromEntries(SEED_CONTESTANTS.map(c => [c.id, stripId(c)])),
        orders: {},
      };
      await bulkSeed(payload);
      toast('Database seeded','good');
    } catch(e){
      toast('Seed failed: ' + e.message, 'bad');
    }
  };
  $('#import').onclick = async () => {
    try {
      const parsed = JSON.parse($('#import-box').value);
      if (!parsed.settings || !parsed.contestants) throw new Error('bad shape');
      await bulkSeed({
        settings:    Object.assign({}, FALLBACK_SETTINGS, parsed.settings),
        contestants: parsed.contestants || {},
        orders:      parsed.orders || {},
      });
      toast('State restored','good');
    } catch(e){
      toast('Invalid JSON: ' + e.message, 'bad');
    }
  };
  $('#reset').onclick = async () => {
    if (!confirm('This deletes every contestant, order and setting. Continue?')) return;
    try { await wipeAll(); toast('Database wiped'); }
    catch(e){ toast('Reset failed: ' + e.message, 'bad'); }
  };
}

/* --------------------------------------------------------------------------
   BOOT
   -------------------------------------------------------------------------- */
let booted = false;

onData(() => {
  refreshState();

  if (!DB.ready.contestants || !DB.ready.settings){
    if (!booted){
      $('#admin-root').innerHTML = `
        <div style="min-height:100vh;display:grid;place-items:center;color:var(--bone-dim)">
          <div style="text-align:center">
            <div style="font-family:var(--serif);font-size:38px;letter-spacing:.06em;color:var(--bone);margin-bottom:12px">CRAVE</div>
            <div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase">Loading console…</div>
          </div>
        </div>`;
    }
    return;
  }

  if (!booted){
    booted = true;
    if (sessionStorage.getItem('cave.admin') === '1') renderShell();
    else renderLogin();
    return;
  }

  // Re-render without clobbering form inputs
  const ae = document.activeElement;
  const editing =
    ae && ae.closest && ae.closest('.form-block,.panel-body') &&
    ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName);

  if (!editing){
    if (sessionStorage.getItem('cave.admin') === '1') renderShell();
    else renderLogin();
  }
});

subscribe();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root')) $('#modal-root').innerHTML = '';
});