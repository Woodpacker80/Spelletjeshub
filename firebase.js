// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — rad-van-woorden (Arcade Style)
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onValue, query, orderByChild, limitToLast }
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
const TOP_N    = 10;
const NICK_KEY = 'rvw_nickname';

export function getNickname(){ return localStorage.getItem(NICK_KEY) || null; }
export function setNickname(name){
  localStorage.setItem(NICK_KEY, name.trim().toUpperCase());
}

// ── Haal data live op van server (geen lokale cache) ─────────────────────────
function fetchOnce(path){
  return new Promise((resolve, reject) => {
    const q = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
    onValue(q, (snap) => { resolve(snap); }, reject, { onlyOnce: true });
  });
}

// ── Check of score in top N past ─────────────────────────────────────────────
export async function checkTopN(difficulty, score){
  const path = `${GAME_KEY}/${difficulty}`;
  try {
    const snap = await fetchOnce(path);
    if(!snap.exists()) return true;
    const scores = [];
    snap.forEach(child => scores.push(child.val().score));
    if(scores.length < TOP_N) return true;
    return score > Math.min(...scores);
  } catch(e) { return true; } // Bij fout: altijd toestaan
}

// ── Sla score op ─────────────────────────────────────────────────────────────
export async function saveScore(difficulty, name, score){
  const path = `${GAME_KEY}/${difficulty}`;
  await push(ref(db, path), {
    name: name.trim().toUpperCase(),
    score: Number(score),
    date: new Date().toISOString().split('T')[0]
  });
  return true;
}

// ── Fetch top 10 live van server ──────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  const path = `${GAME_KEY}/${difficulty}`;
  try {
    const snap = await fetchOnce(path);
    if(!snap.exists()) return [];
    const entries = [];
    snap.forEach(child => entries.push(child.val()));
    return entries.sort((a,b) => b.score - a.score);
  } catch(e) { return []; }
}

window.FB = { getNickname, setNickname, checkTopN, saveScore, fetchLeaderboard };
