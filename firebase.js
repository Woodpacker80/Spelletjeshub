// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — rad-van-woorden
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, remove, get, query, orderByChild, limitToLast }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyABwL_9K4PwSFAdH81ooTG_dxieiDkfIBw",
  authDomain:        "rad-van-woorden-3cea4.firebaseapp.com",
  databaseURL:       "https://rad-van-woorden-3cea4-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "rad-van-woorden-3cea4",
  storageBucket:     "rad-van-woorden-3cea4.firebasestorage.app",
  messagingSenderId: "1070671201365",
  appId:             "1:1070671201365:web:3add004bd2b650ede140dc"
};

const app      = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db       = getDatabase(app);
const GAME_KEY = 'rad-van-woorden';
const TOP_N    = 5;
const NICK_KEY = 'rvw_nickname';
const TOKEN_KEY = 'rvw_token';

function getOrCreateToken(){
  let token = localStorage.getItem(TOKEN_KEY);
  if(!token){
    token = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getNickname(){ return localStorage.getItem(NICK_KEY) || null; }
export function setNickname(name){
  localStorage.setItem(NICK_KEY, name.trim().toUpperCase());
  getOrCreateToken();
}

export async function submitScore(difficulty, score){
  const name  = getNickname();
  if(!name) return false;
  const token = getOrCreateToken();

  const path    = `${GAME_KEY}/${difficulty}`;
  const allSnap = await get(ref(db, path));

  let existingKey  = null;
  let personalBest = 0;

  if(allSnap.exists()){
    allSnap.forEach(child => {
      const e = child.val();
      if(e.name === name){
        if(typeof e.score === 'number' && e.score > personalBest) personalBest = e.score;
        if(e.token === token) existingKey = child.key;
      }
    });
  }

  // Alleen opslaan als nieuwe score hoger is dan persoonlijk record
  if(score <= personalBest) return false;

  // Verwijder eigen oude entry van dit apparaat
  if(existingKey){
    await remove(ref(db, `${path}/${existingKey}`));
  }

  // Sla op met push() — unieke ID, nooit overschrijven
  await push(ref(db, path), {
    name,
    score: Number(score),
    token,
    date: new Date().toISOString().split('T')[0]
  });

  return true;
}

// ── Fetch top 5 unieke spelers ────────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  const path = `${GAME_KEY}/${difficulty}`;
  const q    = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N * 4));
  const snap = await get(q);
  if(!snap.exists()) return [];

  const all = [];
  snap.forEach(child => all.push(child.val()));
  all.sort((a,b) => b.score - a.score);

  // Bewaar alleen hoogste score per unieke naam
  const seen = new Set();
  const top  = [];
  for(const e of all){
    if(!seen.has(e.name)){
      seen.add(e.name);
      top.push(e);
    }
    if(top.length >= TOP_N) break;
  }
  return top;
}

window.FB = { getNickname, setNickname, submitScore, fetchLeaderboard };
