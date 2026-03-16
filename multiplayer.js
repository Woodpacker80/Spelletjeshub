// ═══════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER — Rad van Woorden
//  Volledig los van de single-player code.
//  Gebruikt dezelfde Firebase instantie (window.FB) maar een aparte DB-tak:
//  /multiplayer/{roomCode}/...
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp, getApps }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, off, remove, push }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ── Firebase config (zelfde project als leaderboard) ────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyABwL_9K4PwSFAdH81ooTG_dxieiDkfIBw",
  authDomain:        "rad-van-woorden-3cea4.firebaseapp.com",
  databaseURL:       "https://rad-van-woorden-3cea4-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "rad-van-woorden-3cea4",
  storageBucket:     "rad-van-woorden-3cea4.firebasestorage.app",
  messagingSenderId: "1070671201365",
  appId:             "1:1070671201365:web:3add004bd2b650ede140dc"
};

// Hergebruik bestaande Firebase app als die al bestaat
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ── MP state ─────────────────────────────────────────────────────────────────
const MP = {
  active:    false,   // zijn we in multiplayer modus?
  roomCode:  null,    // 4-cijferige kamercode
  role:      null,    // 'host' of 'guest'
  myKey:     null,    // 'player1' of 'player2'
  oppKey:    null,    // 'player2' of 'player1'
  listener:  null,    // Firebase onValue unsubscribe
  lastState: null,    // laatste snapshot van room
};
window.MP = MP;

// ── Hulpfuncties ─────────────────────────────────────────────────────────────
function roomRef(code)   { return ref(db, `multiplayer/${code}`); }
function stateRef(code)  { return ref(db, `multiplayer/${code}/state`); }

function genCode(){
  // 4 letters A-Z, makkelijk te typen
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // geen I/O om verwarring te voorkomen
  let code = '';
  for(let i=0;i<4;i++) code += chars[Math.floor(Math.random()*chars.length)];
  return code;
}

function getNick(){
  return (localStorage.getItem('rvw_nickname') || 'SPELER').toUpperCase().slice(0,12);
}

// ── Kamer aanmaken (host) ────────────────────────────────────────────────────
export async function createRoom(rounds, difficulty){
  const code  = genCode();
  const nick  = getNick();

  const roomData = {
    created:    Date.now(),
    status:     'waiting',   // waiting | playing | done
    rounds,
    difficulty,
    player1: { nick, score: 0, online: true },
    player2: null,
    state:   null,
  };

  await set(roomRef(code), roomData);

  MP.active   = true;
  MP.roomCode = code;
  MP.role     = 'host';
  MP.myKey    = 'player1';
  MP.oppKey   = 'player2';

  return code;
}

// ── Kamer joinen (gast) ──────────────────────────────────────────────────────
export async function joinRoom(code){
  code = code.toUpperCase().trim();
  const snap = await get(roomRef(code));

  if(!snap.exists())           throw new Error('Kamer niet gevonden.');
  const room = snap.val();
  if(room.status !== 'waiting') throw new Error('Dit spel is al begonnen of klaar.');
  if(room.player2)              throw new Error('Kamer is al vol.');

  const nick = getNick();
  await update(roomRef(code), {
    'player2': { nick, score: 0, online: true },
    'status':  'playing',
  });

  MP.active   = true;
  MP.roomCode = code;
  MP.role     = 'guest';
  MP.myKey    = 'player2';
  MP.oppKey   = 'player1';

  return room; // geeft terug: rounds, difficulty, player1.nick
}

// ── Luister naar kamer updates ───────────────────────────────────────────────
export function listenRoom(code, callback){
  const r = roomRef(code);
  const unsub = onValue(r, snap => {
    if(snap.exists()){
      MP.lastState = snap.val();
      callback(snap.val());
    }
  });
  MP.listener = () => off(r);
  return MP.listener;
}

// ── Stop luisteren ───────────────────────────────────────────────────────────
export function stopListening(){
  if(MP.listener){ MP.listener(); MP.listener = null; }
}

// ── Zet spelstatus in Firebase (alleen actieve speler doet dit) ──────────────
export async function pushGameState(code, gameState){
  await update(stateRef(code), gameState);
}

// ── Zet score update ─────────────────────────────────────────────────────────
export async function pushScore(code, playerKey, totalScore){
  await update(roomRef(code), { [`${playerKey}/score`]: totalScore });
}

// ── Wissel beurt ─────────────────────────────────────────────────────────────
export async function pushTurn(code, turn){
  await update(stateRef(code), { turn });
}

// ── Stuur actie (draai, letter, oplossen) ────────────────────────────────────
export async function pushAction(code, action){
  // Schrijf actie direct naar /multiplayer/{code}/action
  // zodat beide spelers het via onValue ontvangen
  await set(ref(db, `multiplayer/${code}/action`), { ...action, ts: Date.now() });
}

// ── Heartbeat — apart pad zodat spelacties niet overschreven worden ──────────
export async function pushHeartbeat(code, playerKey){
  try {
    await set(ref(db, `multiplayer/${code}/heartbeat/${playerKey}`), Date.now());
  } catch(e){}
}

// ── Kamer opruimen na spel ───────────────────────────────────────────────────
export async function closeRoom(code){
  try { await remove(roomRef(code)); } catch(e){}
  MP.active   = false;
  MP.roomCode = null;
  MP.role     = null;
  MP.myKey    = null;
  MP.oppKey   = null;
  MP.lastState = null;
}

// ── Expose naar global scope ─────────────────────────────────────────────────
window.MPapi = { createRoom, joinRoom, listenRoom, stopListening,
                  pushGameState, pushScore, pushTurn, pushAction, pushHeartbeat, closeRoom };
