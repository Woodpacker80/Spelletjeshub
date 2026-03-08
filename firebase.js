// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — Rad van Woorden
// ═══════════════════════════════════════════════════════
import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, remove, push, query, orderByChild, limitToLast, get }
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

const app      = initializeApp(firebaseConfig);
const db       = getDatabase(app);
const GAME_KEY = 'rad-van-woorden';
const TOP_N    = 15;
const NICK_KEY = 'rvw_nickname';

// ── Nickname storage ──────────────────────────────────────────────────────────
export function getNickname(){ return localStorage.getItem(NICK_KEY) || null; }
export function setNickname(name){ localStorage.setItem(NICK_KEY, name.trim().toUpperCase()); }

// ── Submit score ──────────────────────────────────────────────────────────────
export async function submitScore(difficulty, score){
  const name = getNickname();
  if(!name) return false;

  const path    = `${GAME_KEY}/${difficulty}`;
  const allSnap = await get(ref(db, path));

  let personalBestKey   = null;
  let personalBestScore = 0;

  // Find ALL existing entries for this player
  if(allSnap.exists()){
    allSnap.forEach(child => {
      const e = child.val();
      if(e.name === name){
        if(e.score > personalBestScore){
          personalBestScore = e.score;
          personalBestKey   = child.key;
        }
      }
    });
  }

  // Don't save if score doesn't beat personal best
  if(score <= personalBestScore) return false;

  // Check if qualifies for top 15 overall
  const qualifies = await isTopN(difficulty, score, name);
  if(!qualifies) return false;

  // Remove old personal best entry if exists
  if(personalBestKey){
    await remove(ref(db, `${path}/${personalBestKey}`));
  }

  // Save new personal best
  await push(ref(db, path), {
    name,
    score,
    date: new Date().toISOString().split('T')[0]
  });
  return true;
}

// ── Check if score qualifies for top N ───────────────────────────────────────
async function isTopN(difficulty, score, playerName){
  const path = `${GAME_KEY}/${difficulty}`;
  const q    = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
  const snap = await get(q);
  if(!snap.exists()) return true;

  // Build list excluding this player's own entries
  const others = [];
  snap.forEach(child => {
    const e = child.val();
    if(e.name !== playerName) others.push(e.score);
  });
  if(others.length < TOP_N) return true;
  return score > Math.min(...others);
}

// ── Fetch leaderboard ─────────────────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  const path = `${GAME_KEY}/${difficulty}`;
  const q    = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
  const snap = await get(q);
  if(!snap.exists()) return [];
  const entries = [];
  snap.forEach(child => entries.push(child.val()));
  return entries.sort((a,b) => b.score - a.score);
}

// ── Expose to global scope ────────────────────────────────────────────────────
window.FB = { getNickname, setNickname, submitScore, fetchLeaderboard };
