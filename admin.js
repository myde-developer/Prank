// admin.js
import { db, COLLECTIONS } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { userIsAdmin } from './auth.js';

export async function addClub(data) { if (!userIsAdmin()) throw "Unauthorized"; return await addDoc(collection(db, COLLECTIONS.clubs), data); }
export async function deleteClub(id) { if (!userIsAdmin()) throw "Unauthorized"; await deleteDoc(doc(db, COLLECTIONS.clubs, id)); }
export async function addFixture(fixture) { if (!userIsAdmin()) throw "Unauthorized"; return await addDoc(collection(db, COLLECTIONS.fixtures), fixture); }

export async function recordResult(matchId, homeScore, awayScore) {
  if (!userIsAdmin()) throw "Unauthorized";
  const matchRef = doc(db, COLLECTIONS.matches, matchId);
  await updateDoc(matchRef, { homeScore, awayScore, played: true });
  await recalcStandings();
}

async function recalcStandings() {
  const clubsSnap = await getDocs(collection(db, COLLECTIONS.clubs));
  const matchesSnap = await getDocs(collection(db, COLLECTIONS.matches));
  const stats = {};
  clubsSnap.forEach(doc => { stats[doc.id] = { id: doc.id, name: doc.data().name, points:0, won:0, drawn:0, lost:0, gf:0, ga:0, played:0 }; });
  matchesSnap.forEach(m => {
    const match = m.data();
    if (!match.played) return;
    const home = stats[match.homeClubId], away = stats[match.awayClubId];
    home.gf += match.homeScore; home.ga += match.awayScore;
    away.gf += match.awayScore; away.ga += match.homeScore;
    home.played++; away.played++;
    if (match.homeScore > match.awayScore) { home.won++; home.points+=3; away.lost++; }
    else if (match.homeScore < match.awayScore) { away.won++; away.points+=3; home.lost++; }
    else { home.drawn++; home.points++; away.drawn++; away.points++; }
  });
  const standings = Object.values(stats).map(s => ({ ...s, gd: s.gf - s.ga })).sort((a,b)=> b.points - a.points || b.gd - a.gd);
  const batch = writeBatch(db);
  standings.forEach((s, idx) => { const ref = doc(db, COLLECTIONS.stats, s.id); batch.set(ref, { ...s, rank: idx+1 }); });
  await batch.commit();
}