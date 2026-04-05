// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — rad-van-woorden
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, get }
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

// ── Fetch all entries — simple get(), local sort ──────────────────────────────
async function fetchAll(difficulty){
  const snap = await get(ref(db, `${GAME_KEY}/${difficulty}`));
  if(!snap.exists()) return [];
  const entries = [];
  snap.forEach(child => {
    const val = child.val();
    if(val && typeof val.score === 'number' && val.name){
      entries.push(val);
    }
  });
  return entries;
}

// ── Check if score qualifies for top 10 ──────────────────────────────────────
export async function checkTopN(difficulty, score){
  try {
    const entries = await fetchAll(difficulty);
    if(entries.length < TOP_N) return true;
    entries.sort((a,b) => b.score - a.score);
    return score > entries[TOP_N - 1].score;
  } catch(e){ return true; }
}

// ── Save score ────────────────────────────────────────────────────────────────
export async function saveScore(difficulty, name, score){
  await push(ref(db, `${GAME_KEY}/${difficulty}`), {
    name: name.trim().toUpperCase(),
    score: Number(score),
    date: new Date().toISOString().split('T')[0]
  });
}

// ── Fetch top 10 — local sort ─────────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  try {
    const entries = await fetchAll(difficulty);
    entries.sort((a,b) => b.score - a.score);
    return entries.slice(0, TOP_N);
  } catch(e){ return []; }
}

window.FB = { getNickname, setNickname, checkTopN, saveScore, fetchLeaderboard };
