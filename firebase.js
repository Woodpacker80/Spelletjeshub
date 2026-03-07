// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — Rad van Woorden
// ═══════════════════════════════════════════════════════
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, query, orderByChild, limitToLast, get }
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

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

const GAME_KEY   = 'rad-van-woorden';
const TOP_N      = 15;
const NICK_KEY   = 'rvw_nickname';

// ── Nickname storage ──────────────────────────────────────────────────────────
export function getNickname(){ return localStorage.getItem(NICK_KEY) || null; }
export function setNickname(name){ localStorage.setItem(NICK_KEY, name.trim().toUpperCase()); }

// ── Submit score ──────────────────────────────────────────────────────────────
export async function submitScore(difficulty, score){
  const name = getNickname();
  if(!name) return false;
  // Check if score qualifies for top 10
  const qualifies = await isTopTen(difficulty, score);
  if(!qualifies) return false;
  const path = `${GAME_KEY}/${difficulty}`;
  await push(ref(db, path), {
    name,
    score,
    date: new Date().toISOString().split('T')[0]
  });
  return true;
}

// ── Check if score qualifies ──────────────────────────────────────────────────
async function isTopTen(difficulty, score){
  const path  = `${GAME_KEY}/${difficulty}`;
  const q     = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
  const snap  = await get(q);
  if(!snap.exists()) return true; // board empty — qualifies
  const entries = [];
  snap.forEach(child => entries.push(child.val().score));
  if(entries.length < TOP_N) return true;
  return score > Math.min(...entries);
}

// ── Fetch leaderboard ─────────────────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  const path  = `${GAME_KEY}/${difficulty}`;
  const q     = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
  const snap  = await get(q);
  if(!snap.exists()) return [];
  const entries = [];
  snap.forEach(child => entries.push(child.val()));
  return entries.sort((a,b) => b.score - a.score);
}

// ── Expose to global scope for use in script.js ───────────────────────────────
window.FB = { getNickname, setNickname, submitScore, fetchLeaderboard };
