// ═══════════════════════════════════════════════════════
//  FIREBASE LEADERBOARD — rad-van-woorden (Arcade Style v12)
// ═══════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, push, onValue }
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

// ── Haal ALLE data op van server, geen query, geen lokale cache ───────────────
function fetchAll(path){
  return new Promise((resolve, reject) => {
    onValue(ref(db, path), (snap) => { resolve(snap); }, reject, { onlyOnce: true });
  });
}

// ── Check of score in top N past (lokale sortering) ──────────────────────────
export async function checkTopN(difficulty, score){
  try {
    const snap = await fetchAll(`${GAME_KEY}/${difficulty}`);
    if(!snap.exists()) return true;
    const scores = [];
    snap.forEach(child => scores.push(child.val().score));
    scores.sort((a,b) => b - a); // hoog naar laag
    const top = scores.slice(0, TOP_N);
    if(top.length < TOP_N) return true;
    return score > top[top.length - 1]; // hoger dan laagste in top 10?
  } catch(e){ return true; }
}

// ── Sla score op ─────────────────────────────────────────────────────────────
export async function saveScore(difficulty, name, score){
  await push(ref(db, `${GAME_KEY}/${difficulty}`), {
    name: name.trim().toUpperCase(),
    score: Number(score),
    date: new Date().toISOString().split('T')[0]
  });
  return true;
}

// ── Fetch top 10 — alles ophalen, lokaal sorteren ────────────────────────────
export async function fetchLeaderboard(difficulty){
  try {
    const snap = await fetchAll(`${GAME_KEY}/${difficulty}`);
    if(!snap.exists()) return [];
    const entries = [];
    snap.forEach(child => entries.push(child.val()));
    entries.sort((a,b) => b.score - a.score); // lokale sortering
    return entries.slice(0, TOP_N);
  } catch(e){ return []; }
}

window.FB = { getNickname, setNickname, checkTopN, saveScore, fetchLeaderboard };
