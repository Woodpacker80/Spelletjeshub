// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — Rad van Woorden
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, query, orderByChild, limitToLast }
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

export function getNickname(){ return localStorage.getItem(NICK_KEY) || null; }
export function setNickname(name){
  localStorage.setItem(NICK_KEY, name.trim().toUpperCase());
}

export async function submitScore(difficulty, score){
  const name = getNickname();
  if(!name) return false;

  const path = `${GAME_KEY}/${difficulty}/${name}`;

  // Lees huidige score van deze speler
  const snap = await get(ref(db, path));
  if(snap.exists()){
    const current = snap.val();
    const currentScore = typeof current.score === 'number' ? current.score : 0;
    // Alleen opslaan als nieuwe score hoger is
    if(score <= currentScore) return false;
  }

  // Sla op met naam als key — overschrijft automatisch oude entry
  await set(ref(db, path), {
    name,
    score: Number(score),
    date: new Date().toISOString().split('T')[0]
  });

  return true;
}

// ── Fetch top 5 ───────────────────────────────────────────────────────────────
export async function fetchLeaderboard(difficulty){
  const path = `${GAME_KEY}/${difficulty}`;
  const q    = query(ref(db, path), orderByChild('score'), limitToLast(TOP_N));
  const snap = await get(q);
  if(!snap.exists()) return [];
  const entries = [];
  snap.forEach(child => entries.push(child.val()));
  return entries.sort((a,b) => b.score - a.score);
}

window.FB = { getNickname, setNickname, submitScore, fetchLeaderboard };
