const VOWELS = new Set(['A','E','I','O','U']);
const VOWEL_COST = 250;
const FREQ_ORDER = 'NETSRLADGOIKMHBVPUWCFZJYXQ'.split('');

// ── RADSEGMENTEN ─────────────────────────────────────────────────────────────
// Kompasindeling: index 0=Noord(FAILLIET), 4=Oost(VERLIES), 8=Zuid(JOKER), 12=West(VERLIES)
const SEGS = [
  {lbl:"FAILLIET",      val:"BANKRUPT", col:"#111"},   // index 0  — Noord
  {lbl:"€300",          val:300,        col:"#e67e22"}, // index 1
  {lbl:"€400",          val:400,        col:"#1e8449"}, // index 2
  {lbl:"€450",          val:450,        col:"#154360"}, // index 3
  {lbl:"BEURT VERLIES", val:"LOSE",     col:"#444"},    // index 4  — Oost
  {lbl:"€500",          val:500,        col:"#c0392b"}, // index 5
  {lbl:"€500",          val:500,        col:"#922b21"}, // index 6
  {lbl:"€600",          val:600,        col:"#0e6655"}, // index 7
  {lbl:"JOKER",         val:"JOKER",    col:"JOKER"},   // index 8  — Zuid
  {lbl:"€650",          val:650,        col:"#7b2fbe"}, // index 9
  {lbl:"€700",          val:700,        col:"#784212"}, // index 10
  {lbl:"€750",          val:750,        col:"#d4ac0d"}, // index 11
  {lbl:"BEURT VERLIES", val:"LOSE",     col:"#555"},    // index 12 — West
  {lbl:"€800",          val:800,        col:"#6c3483"}, // index 13
  {lbl:"€850",          val:850,        col:"#784212"}, // index 14
  {lbl:"€1000",         val:1000,       col:"#b9770e"}, // index 15
];

const BONUS_SEGS = {
  chrome: [
    { lbl:'BONUS', val:'BONUS_CHROME', col:'CHROME', bonus:2500 },
    { lbl:'MINUS', val:'MINUS',        col:'#c0392b' },
  ],
  gold: [
    { lbl:'BONUS', val:'BONUS_GOLD',   col:'GOLD',   bonus:5000 },
    { lbl:'MINUS', val:'MINUS',        col:'#c0392b' },
  ],
};

const JOKER_SEG = { lbl:'JOKER', val:'JOKER', col:'JOKER' };

// ── DIFFICULTY CONFIG ─────────────────────────────────────────────────────
const DIFF = {
  easy: {
    freq:       'BCDFGHJKLMPQRSTVWXYZ'.split(''), // rare letters first — computer guesses poorly
    smart:      0.25,   // chance of picking a letter actually in the puzzle
    vowel:      0.08,   // chance of buying a vowel
    vowelMin:   0.50,   // min % revealed before buying vowels
    solve:      0.80,   // % revealed before attempting to solve
    solveChance:0.40,
    thinkDelay: 1400,
  },
  medium: {
    freq:       FREQ_ORDER,
    smart:      0.58,
    vowel:      0.27,
    vowelMin:   0.25,
    solve:      0.75,
    solveChance:0.50,
    thinkDelay: 1100,
  },
  hard: {
    freq:       'ENATIORDSLGKMPBVHWZFJYXQ'.split(''), // strict Dutch frequency
    smart:      0.70,
    vowel:      0.45,
    vowelMin:   0.15,
    solve:      0.62,
    solveChance:0.65,
    thinkDelay: 900,
  },
  expert: {
    freq:       'ENATIORDSLGKMPBVHWZFJYXQ'.split(''), // strict Dutch frequency
    smart:      0.80,
    vowel:      0.65,   // aggressively buys vowels
    vowelMin:   0.15,
    solve:      0.45,   // attempts solve early
    solveChance:0.75,
    thinkDelay: 700,
  },
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let G = {};
let wheelRot = 0;
let resultCb = null;
let selectedRounds = 3;
let selectedDiff = 'medium'; // 'easy' | 'medium' | 'hard'
let activeSegs     = [];    // actieve radsegmenten

// ── WEB AUDIO ENGINE ──────────────────────────────────────────────────────────
let AC = null;
let isMuted = false;

// ── MOBILE KEYBOARD / VIEWPORT FIX ──────────────────────────────────────────
// When the soft keyboard opens on mobile, reposition the solve modal
// so it stays centred in the actual visible area
function centerModalInViewport(){
  const overlay = document.getElementById('modal-solve');
  if(!overlay.classList.contains('open')) return;
  const box = overlay.querySelector('.modal-box');
  if(window.visualViewport){
    const vv = window.visualViewport;
    // Position box relative to the visible viewport, not the full page
    box.style.position   = 'fixed';
    box.style.top        = Math.round(vv.offsetTop + (vv.height / 2)) + 'px';
    box.style.left       = Math.round(vv.offsetLeft + (vv.width  / 2)) + 'px';
    box.style.transform  = 'translate(-50%, -50%)';
    box.style.margin     = '0';
  }
}
function resetModalPosition(){
  const overlay = document.getElementById('modal-solve');
  const box = overlay ? overlay.querySelector('.modal-box') : null;
  if(box){ box.style.position=''; box.style.top=''; box.style.left=''; box.style.transform=''; box.style.margin=''; }
}
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', centerModalInViewport);
  window.visualViewport.addEventListener('scroll', centerModalInViewport);
}

function toggleMute(){
  isMuted = !isMuted;
  const btn = document.getElementById('mute-btn');
  btn.textContent = isMuted ? '🔇' : '🔊';
  btn.classList.toggle('muted', isMuted);
}

function initAudio(){
  if(AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); if(AC.state==='suspended') AC.resume(); } catch(e){}
}

function _tone(freq, type, dur, vol=0.25, when=null){
  if(!AC || isMuted) return;
  const t = when ?? AC.currentTime;
  const o = AC.createOscillator();
  const g = AC.createGain();
  o.connect(g); g.connect(AC.destination);
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.01);
}

// Wheel tick — short high-pitched square blip (matches TV show ratchet)
function sndTick(){ _tone(1100, 'square', 0.025, 0.12); }

// Letter revealed — bright double ping
function sndReveal(){
  if(!AC) return;
  _tone(660, 'sine', 0.07, 0.18);
  _tone(880, 'sine', 0.07, 0.18, AC.currentTime + 0.06);
}

// Correct letter — ascending chord
function sndCorrect(){
  if(!AC) return;
  const t = AC.currentTime;
  [523,659,784,1047].forEach((f,i)=>_tone(f,'sine',0.12,0.22,t+i*0.07));
}

// Wrong letter / lose turn — descending buzz
function sndWrong(){
  if(!AC) return;
  _tone(180, 'sawtooth', 0.22, 0.3);
  _tone(140, 'sawtooth', 0.18, 0.3, AC.currentTime + 0.12);
}

// Bankrupt — descending doom sequence
function sndBankrupt(){
  if(!AC) return;
  const t = AC.currentTime;
  [300,250,200,160,130].forEach((f,i)=>_tone(f,'sawtooth',0.14,0.32,t+i*0.09));
}

// Round / game win fanfare — ascending bright sequence
function sndFanfare(){
  if(!AC) return;
  const notes = [523,587,659,784,880,1047,1175];
  const t = AC.currentTime;
  notes.forEach((f,i)=>_tone(f,'sine',0.18,0.28,t+i*0.055));
}

// ── BONUSGELUIDEN ─────────────────────────────────────────────────────────────
function sndBonusLand(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  const notes=[523,659,784,1047,1319,1568];
  notes.forEach((f,i)=>{ _tone(f,'sine',0.18,0.22,t+i*0.09); _tone(f*2,'sine',0.07,0.08,t+i*0.09); });
}
function sndGoldLand(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  [196,247,294,370,440].forEach((f,i)=>{
    _tone(f,'sawtooth',0.30,0.32,t+i*0.10);
    _tone(f*1.5,'sine',0.15,0.18,t+i*0.10);
  });
  setTimeout(()=>{
    const t2=AC.currentTime;
    [587,740,880,1047,1319].forEach((f,i)=>_tone(f,'sine',0.20,0.28,t2+i*0.08));
  },500);
}
function sndGoldHit(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  [294,370,440,587,740,880,1047].forEach((f,i)=>_tone(f,'sine',0.25,0.30,t+i*0.06));
  setTimeout(()=>{
    const t2=AC.currentTime;
    [523,659,784,1047,1319,1568,2093].forEach((f,i)=>_tone(f,'triangle',0.22,0.26,t2+i*0.05));
  },300);
  setTimeout(()=>{ _tone(3136,'sine',0.15,0.20); },650);
}
function sndBonusHit(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  [784,1047,1319,1568,2093].forEach((f,i)=>_tone(f,'sine',0.22,0.28,t+i*0.07));
  setTimeout(()=>{ _tone(3136,'sine',0.12,0.18); },350);
}
function sndBonusMiss(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  [523,440,370,294,220].forEach((f,i)=>_tone(f,'sine',0.18,0.25,t+i*0.10));
}
function sndMinus(){
  if(!AC||isMuted) return;
  const t=AC.currentTime;
  [300,260,220,180,150,120].forEach((f,i)=>_tone(f,'sawtooth',0.20,0.35,t+i*0.11));
  _tone(80,'sine',0.35,0.4,t);
}

// ── BONUSVISUELE EFFECTEN ─────────────────────────────────────────────────────
function flashBonusHub(){
  const hub=document.getElementById('wheel-hub');
  if(!hub) return;
  let pulse=0, max=6;
  const orig=hub.style.background;
  const iv=setInterval(()=>{
    const isLight=(pulse%2===0);
    hub.style.background=isLight
      ? 'radial-gradient(circle at 35% 35%,#fff,#c8d6e0 50%,#8a9ba8)'
      : 'radial-gradient(circle at 35% 35%,#c8d6e0,#8a9ba8 50%,#4a6070)';
    hub.style.boxShadow=isLight
      ? '0 0 24px rgba(200,220,230,0.9),0 0 48px rgba(160,200,220,0.5)'
      : '0 0 12px rgba(140,180,200,0.5)';
    pulse++;
    if(pulse>=max){ clearInterval(iv); hub.style.background=orig; hub.style.boxShadow=''; }
  },220);
}
function flashGoldHub(){
  const hub=document.getElementById('wheel-hub');
  if(!hub) return;
  let pulse=0, max=8;
  const orig=hub.style.background;
  const iv=setInterval(()=>{
    const isLight=(pulse%2===0);
    hub.style.background=isLight
      ? 'radial-gradient(circle at 35% 35%,#fffbe0,#f5c518 50%,#c97d00)'
      : 'radial-gradient(circle at 35% 35%,#f5c518,#c97d00 50%,#7a4800)';
    hub.style.boxShadow=isLight
      ? '0 0 32px rgba(245,197,24,0.95),0 0 64px rgba(245,197,24,0.5)'
      : '0 0 16px rgba(200,140,0,0.6)';
    pulse++;
    if(pulse>=max){ clearInterval(iv); hub.style.background=orig; hub.style.boxShadow=''; }
  },200);
}
function shimmerRevealedTiles(){
  document.querySelectorAll('.tile-letter.revealed').forEach((tile,i)=>{
    setTimeout(()=>{
      tile.style.transition='background 0.15s,box-shadow 0.15s';
      tile.style.background='linear-gradient(180deg,#fff8c0,#ffe066,#f5c518)';
      tile.style.boxShadow='0 0 8px rgba(245,197,24,0.7),0 0 14px rgba(245,197,24,0.3)';
      setTimeout(()=>{ tile.style.background=''; tile.style.boxShadow=''; },700);
    },i*60);
  });
}
function spawnSparkleParticles(){
  document.querySelectorAll('.tile-letter.revealed').forEach(tile=>{
    const rect=tile.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    for(let p=0;p<6;p++){
      const el=document.createElement('div');
      el.className='sparkle-particle';
      const angle=(p/6)*2*Math.PI, dist=30+Math.random()*30;
      el.style.cssText=`left:${cx}px;top:${cy}px;--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist}px;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),700);
    }
  });
}
function flashScreenRed(){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;inset:0;background:rgba(192,57,43,0.35);z-index:9998;pointer-events:none;animation:redFlash 0.6s ease-out forwards;';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),700);
}


function initState(maxR){
  G = {
    maxRounds:maxR, round:0, turn:'player', phase:'spin',
    mpSuppressActionPush: false,
    puzzle:null, revealed:new Set(), usedLetters:new Set(),
    spinVal:0, roundScore:{player:0,computer:0}, totalScore:{player:0,computer:0},
    usedIdx:new Set(), spinning:false, locked:false,
    suddenDeath:false, sdVowelsQueue:[], sdInterval:null,
    difficulty:selectedDiff, bonusVal:0, onBonus:false
  };
  activeSegs = SEGS;
}

// ── STERREN ───────────────────────────────────────────────────────────────────
(function makeStars(){
  const c=document.getElementById('title-stars');
  for(let i=0;i<80;i++){
    const s=document.createElement('div'); s.className='star';
    s.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;animation-duration:${2+Math.random()*4}s;animation-delay:${Math.random()*4}s`;
    c.appendChild(s);
  }
})();

document.querySelectorAll('#rounds-sel .opt-btn').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#rounds-sel .opt-btn').forEach(x=>x.classList.remove('sel'));
    el.classList.add('sel');
    selectedRounds=parseInt(el.dataset.r);
    localStorage.setItem('rvw_rounds', selectedRounds);
  });
});

document.querySelectorAll('#diff-sel .opt-btn').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#diff-sel .opt-btn').forEach(x=>x.classList.remove('sel'));
    el.classList.add('sel');
    selectedDiff=el.dataset.d;
    localStorage.setItem('rvw_diff', selectedDiff);
  });
});

// ── PHYSICAL KEYBOARD SUPPORT ─────────────────────────────────────────────────
window.addEventListener('keydown', e=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  if(!document.getElementById('screen-game').classList.contains('active')) return;
  const solveModal = document.getElementById('modal-solve');
  const solveOpen  = solveModal.classList.contains('open');

  // Enter: open solve modal or submit if already open
  if(e.key==='Enter'){
    const solveBtn = document.getElementById('btn-solve');
    if(solveBtn && !solveBtn.disabled){
      if(!solveOpen) openSolveModal();
      else submitSolve();
    }
    return;
  }
  // Escape: close modals
  if(e.key==='Escape'){
    closeSolveModal();
    closeRulesModal();
    return;
  }
  // Let the solve-input handle its own typing when modal is open
  if(solveOpen) return;
  const letter = e.key.toUpperCase();
  if(!/^[A-Z]$/.test(letter)) return;
  e.preventDefault();
  // Flash the on-screen key
  const keyEl = document.querySelector(`.key[data-letter="${letter}"]`);
  if(keyEl && !keyEl.classList.contains('used')){
    keyEl.classList.add('kb-flash');
    setTimeout(()=>keyEl.classList.remove('kb-flash'), 160);
  }
  handleKeyPress(letter);
});

// ── SCHERMEN ──────────────────────────────────────────────────────────────────
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function startGame(){
  initAudio(); // init audio context on user gesture
  initState(selectedRounds);
  // Update difficulty badge
  const labels={'easy':'😊 Makkelijk','medium':'🧠 Gemiddeld','hard':'💀 Moeilijk','expert':'🔥 Expert'};
  document.getElementById('diff-badge').textContent=labels[selectedDiff]||'Gemiddeld';
  showScreen('screen-game');
  sizeWheel();
  startRound();
}
function goToTitle(){
  document.getElementById('modal-go').classList.remove('open');
  showScreen('screen-title');
}
function playAgain(){
  document.getElementById('modal-go').classList.remove('open');
  showCredits(()=>{ initState(G.maxRounds,G.difficulty); showScreen('screen-title'); });
}

// ── MENU ──────────────────────────────────────────────────────────────────────
function toggleMenu(e){
  e.stopPropagation();
  const btn=document.getElementById('menu-btn');
  const dd=document.getElementById('menu-dropdown');
  const isOpen=dd.classList.contains('open');
  closeMenu();
  if(!isOpen){ btn.classList.add('open'); dd.classList.add('open'); }
}
function closeMenu(){
  document.getElementById('menu-btn').classList.remove('open');
  document.getElementById('menu-dropdown').classList.remove('open');
}
document.addEventListener('click', closeMenu);

function menuPlayAgain(){
  closeMenu();
  document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  showCredits(()=>{ initState(G.maxRounds,G.difficulty); showScreen('screen-title'); });
}
function menuRules(){
  closeMenu();
  document.getElementById('modal-rules').classList.add('open');
}
function closeRulesModal(){
  document.getElementById('modal-rules').classList.remove('open');
}
function menuQuit(){
  closeMenu();
  document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
  if(G.mpMode) mpCleanup();
  showQuitScreen();
}

// ── STOP SCHERM ───────────────────────────────────────────────────────────────
function showQuitScreen(){
  showCredits(()=>showScreen('screen-title'));
}

function quitToTitle(){
  const qs=document.getElementById('screen-quit');
  qs.classList.remove('visible');
  document.getElementById('balloons-container').innerHTML='';
  document.querySelectorAll('.quit-confetti').forEach(e=>e.remove());
  showScreen('screen-title');
}

function launchBalloons(){
  const container=document.getElementById('balloons-container');
  container.innerHTML='';
  const colors=['#e63946','#f5c518','#06d6a0','#4895ef','#ff9f1c','#c77dff','#ff6b9d','#00f5d4'];
  for(let i=0;i<16;i++){
    const b=document.createElement('div'); b.className='balloon';
    const col=colors[i%colors.length];
    const w=42+Math.random()*22;
    b.style.cssText=`background:${col};left:${3+Math.random()*90}%;width:${w}px;height:${Math.round(w*1.28)}px;animation-duration:${5+Math.random()*5}s;animation-delay:-${Math.random()*6}s;box-shadow:inset -6px -4px 0 rgba(0,0,0,0.15),inset 4px 4px 0 rgba(255,255,255,0.28);`;
    container.appendChild(b);
  }
}

function spawnQuitConfetti(){
  const cols=['#f5c518','#06d6a0','#4895ef','#e63946','#fff0a0','#ff9f1c','#c77dff','#ff6b9d'];
  for(let i=0;i<90;i++){
    setTimeout(()=>{
      const el=document.createElement('div');
      el.className='confetti-piece quit-confetti';
      const size=5+Math.random()*9;
      el.style.cssText=`left:${Math.random()*100}vw;width:${size}px;height:${size}px;background:${cols[Math.floor(Math.random()*cols.length)]};border-radius:${Math.random()>.4?'50%':'2px'};animation-duration:${2.5+Math.random()*2.5}s;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),4500);
    },i*30);
  }
}

// ── RAD TEKENEN ───────────────────────────────────────────────────────────────
function sizeWheel(){
  const sz=Math.min(window.innerWidth-24, 210);
  const canvas=document.getElementById('wheel-canvas');
  canvas.width=sz; canvas.height=sz;
  const wrap=document.getElementById('wheel-wrap');
  wrap.style.width=sz+'px'; wrap.style.height=sz+'px';
  const hub=document.getElementById('wheel-hub');
  const hs=Math.round(sz*0.1);
  hub.style.cssText=`width:${hs}px;height:${hs}px;top:50%;left:50%;transform:translate(-50%,-50%);position:absolute;z-index:10;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff,#f5c518 50%,#e8a800);box-shadow:0 0 ${hs*0.4}px rgba(245,197,24,0.5);`;
  drawWheel(wheelRot);
}

function seededRand(seed){
  let t=seed+0x6D2B79F5;
  t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61);
  return ((t^t>>>14)>>>0)/4294967296;
}

function drawFlakes(ctx,cx,cy,r,sa,ea,seed,count,gold,red,blue){
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,sa,ea); ctx.closePath();
  ctx.clip();
  for(let f=0;f<count;f++){
    const s1=seededRand(seed+f*3);
    const s2=seededRand(seed+f*3+1);
    const s3=seededRand(seed+f*3+2);
    const angle=sa+(ea-sa)*s1;
    const dist=r*0.04+r*0.93*s2;
    const fx=cx+Math.cos(angle)*dist;
    const fy=cy+Math.sin(angle)*dist;
    const size=1+s3*(gold||!red?3.5:2.5);
    const alpha=gold?(0.55+s1*0.45):red?(0.47+s2*0.33):blue?(0.55+s1*0.45):(0.55+s1*0.45);
    if(gold){
      const b=Math.floor(200+s2*55);
      ctx.fillStyle=`rgba(${b},${Math.floor(b*0.82)},${Math.floor(b*0.1)},${alpha})`;
    } else if(red){
      const b=Math.floor(160+s3*70);
      ctx.fillStyle=`rgba(${b},${Math.floor(b*0.08)},${Math.floor(b*0.08)},${alpha})`;
    } else if(blue){
      const b=Math.floor(160+s2*95);
      ctx.fillStyle=`rgba(${Math.floor(b*0.1)},${Math.floor(b*0.2)},${b},${alpha})`;
    } else {
      const b=Math.floor(190+s2*65);
      ctx.fillStyle=`rgba(${b},${b},${b},${alpha})`;
    }
    ctx.beginPath(); ctx.arc(fx,fy,size,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}


function drawSpeckles(ctx,cx,cy,r,sa,ea,seed,count,type){
  ctx.save();
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,sa,ea); ctx.closePath(); ctx.clip();
  for(var f=0;f<count;f++){
    var s1=seededRand(seed+f*4),s2=seededRand(seed+f*4+1),s3=seededRand(seed+f*4+2),s4=seededRand(seed+f*4+3);
    var angle=sa+(ea-sa)*s1;
    var dist=r*0.08+r*0.88*Math.sqrt(s2);
    var fx=cx+Math.cos(angle)*dist,fy=cy+Math.sin(angle)*dist;
    var size=0.3+s3*0.9,alpha=0.6+s4*0.4;
    var c;
    if(type==='gold')      c=['rgba(255,240,100,','rgba(255,255,200,','rgba(255,215,0,','rgba(255,200,50,','rgba(255,255,255,'];
    else if(type==='silver')c=['rgba(255,255,255,','rgba(220,235,255,','rgba(200,220,240,','rgba(240,245,255,','rgba(255,255,255,'];
    else if(type==='blue')  c=['rgba(150,200,255,','rgba(200,225,255,','rgba(255,255,255,','rgba(100,170,255,','rgba(180,210,255,'];
    else if(type==='red')   c=['rgba(255,180,180,','rgba(255,220,220,','rgba(255,255,255,','rgba(255,150,150,','rgba(255,200,200,'];
    ctx.fillStyle=c[Math.floor(s1*c.length)]+alpha+')';
    ctx.beginPath(); ctx.arc(fx,fy,size,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawWheel(rot){
  const canvas=document.getElementById('wheel-canvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const sz=canvas.width, cx=sz/2, cy=sz/2, r=sz/2-3;
  const segs=activeSegs.length ? activeSegs : SEGS;
  const n=segs.length, arc=(2*Math.PI)/n;
  ctx.clearRect(0,0,sz,sz);

  const sparkleSegs=[];

  for(let i=0;i<n;i++){
    const seg=segs[i];
    const sa=rot+i*arc-Math.PI/2, ea=sa+arc;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,sa,ea); ctx.closePath();

    // ── Fill ────────────────────────────────────────────────────────────────
    if(seg.val==='BONUS_GOLD'){
      const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      g.addColorStop(0,'#a85f00'); g.addColorStop(0.5,'#d48800'); g.addColorStop(1,'#a85f00');
      ctx.fillStyle=g; ctx.fill();
      drawSpeckles(ctx,cx,cy,r,sa,ea,42+i*7,700,'gold');
      sparkleSegs.push({sa,ea,type:'gold'});
      continue;

    } else if(seg.val==='BONUS_CHROME'){
      const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      g.addColorStop(0,'#666666'); g.addColorStop(0.5,'#909090'); g.addColorStop(1,'#666666');
      ctx.fillStyle=g; ctx.fill();
      drawSpeckles(ctx,cx,cy,r,sa,ea,99+i*7,700,'silver');
      sparkleSegs.push({sa,ea,type:'chrome'});
      continue;
    } else if(seg.val==='JOKER'){
      const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      g.addColorStop(0,'#001a4d'); g.addColorStop(0.5,'#0044aa'); g.addColorStop(1,'#001a4d');
      ctx.fillStyle=g; ctx.fill();
      drawSpeckles(ctx,cx,cy,r,sa,ea,77+i*7,700,'blue');
      sparkleSegs.push({sa,ea,type:'chrome'});
      continue;



    } else if(seg.val==='MINUS'){
      const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      g.addColorStop(0,'#6a0000'); g.addColorStop(0.5,'#cc0010'); g.addColorStop(1,'#6a0000');
      ctx.fillStyle=g; ctx.fill();
      drawSpeckles(ctx,cx,cy,r,sa,ea,33+i*7,700,'red');
      sparkleSegs.push({sa,ea,type:'minus'});
      continue;

    } else if(seg.val==='BANKRUPT'){
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0,   '#000000');
      g.addColorStop(0.5, '#1a1a1a');
      g.addColorStop(1,   '#444444');
      ctx.fillStyle=g;

    } else if(seg.val==='LOSE'){
      ctx.fillStyle='#3a3a3a';

    } else {
      ctx.fillStyle=seg.col;
    }
    ctx.fill();

    // ── Border ──────────────────────────────────────────────────────────────
    if(seg.val==='MINUS'){
      ctx.strokeStyle='rgba(255,80,80,0.5)'; ctx.lineWidth=2;
    } else if(seg.val==='BANKRUPT'){
      ctx.strokeStyle='rgba(100,0,0,0.6)'; ctx.lineWidth=2;
    } else if(seg.val==='LOSE'){
      ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=1.5;
    } else {
      ctx.strokeStyle='rgba(0,0,0,0.4)'; ctx.lineWidth=1.5;
    }
    ctx.stroke();

    // ── Label ────────────────────────────────────────────────────────────────
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(sa+arc/2); ctx.textAlign='right';
    const fs=Math.max(7,sz*0.040);
    const fsm=Math.max(5,Math.round(fs*0.7));

    if(seg.val==='BONUS_GOLD'){
      // Zilveren tekst op gouden vak
      ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=5;
      ctx.fillStyle='#e8f0f5';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('BONUS',r-6,fs*0.37);

    } else if(seg.val==='BONUS_CHROME'||seg.val==='JOKER'){
      // Gouden tekst op zilveren vak
      ctx.shadowColor='rgba(80,40,0,0.7)'; ctx.shadowBlur=5;
      ctx.fillStyle='#f5c518';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('BONUS',r-6,fs*0.37);

    } else if(seg.val==='JOKER'){
      ctx.shadowColor='rgba(80,40,0,0.7)'; ctx.shadowBlur=5;
      ctx.fillStyle='#f5c518';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('JOKER',r-6,fs*0.37);

    } else if(seg.val==='MINUS'){
      ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=3;
      ctx.fillStyle='#ffcccc';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('MINUS',r-6,fs*0.37);

    } else if(seg.val==='BANKRUPT'){
      ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=2;
      ctx.fillStyle='#666666';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('BANKRUPT',r-6,fs*0.37);

    } else if(seg.val==='LOSE'){
      ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=3;
      ctx.fillStyle='#cccccc';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('VERLIES',r-6,fs*0.37);

    } else {
      ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=3;
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText(seg.lbl,r-6,fs*0.37);
    }
    ctx.restore();
  }

  // ── Sparkle pass ─────────────────────────────────────────────────────────
  const t = (Date.now() % 3200) / 3200;
  sparkleSegs.forEach(({sa, ea, type})=>{
    const isMinus = (type === 'minus');
    const pts = isMinus
      ? [[0.45,0.25],[0.70,0.55],[0.35,0.70],[0.60,0.80]]
      : [[0.40,0.20],[0.70,0.50],[0.45,0.80],[0.80,0.30],[0.30,0.55],[0.65,0.70],[0.55,0.40]];
    const tCur = isMinus ? (Date.now() % 4800) / 4800 : t;
    pts.forEach(([rf, af], pi)=>{
      const phase = (tCur + pi / pts.length) % 1;
      const brightness = Math.pow(Math.sin(phase * Math.PI), 2);
      if(brightness < (isMinus ? 0.60 : 0.40)) return;

      const angle = sa + (ea - sa) * af;
      const rad   = r * 0.18 + r * 0.72 * rf;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      const sz2 = isMinus ? (0.8 + brightness * 1.8) : (1.0 + brightness * 2.5);

      ctx.save();
      ctx.translate(px, py);
      ctx.globalAlpha = isMinus ? (0.15 + brightness * 0.35) : (0.25 + brightness * 0.50);

      const haloC1 = isMinus ? 'rgba(255,160,160,0.8)' : 'rgba(255,255,255,0.9)';
      const haloC2 = isMinus ? 'rgba(255,80,80,0.3)'   : 'rgba(255,255,255,0.4)';
      const halo = ctx.createRadialGradient(0,0,0,0,0,sz2*2);
      halo.addColorStop(0,  haloC1);
      halo.addColorStop(0.4,haloC2);
      halo.addColorStop(1,  'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(0,0,sz2*2,0,Math.PI*2); ctx.fill();

      ctx.fillStyle   = isMinus ? 'rgba(255,200,200,1)' : 'rgba(255,255,255,1)';
      ctx.shadowColor = isMinus ? 'rgba(255,100,100,1)' : 'rgba(255,255,255,1)';
      ctx.shadowBlur  = sz2 * 1.2;
      const arm = sz2, thin = sz2 * 0.15;
      ctx.beginPath();
      ctx.moveTo(-thin,-arm); ctx.lineTo(thin,-arm);
      ctx.lineTo(thin,-thin); ctx.lineTo(arm,-thin);
      ctx.lineTo(arm,thin);   ctx.lineTo(thin,thin);
      ctx.lineTo(thin,arm);   ctx.lineTo(-thin,arm);
      ctx.lineTo(-thin,thin); ctx.lineTo(-arm,thin);
      ctx.lineTo(-arm,-thin); ctx.lineTo(-thin,-thin);
      ctx.closePath(); ctx.fill();

      ctx.restore();
    });
  });

  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI);
  ctx.strokeStyle='rgba(245,197,24,0.5)'; ctx.lineWidth=3; ctx.stroke();
  wheelRot=rot;
}
// ── RONDE ─────────────────────────────────────────────────────────────────────
function pickPuzzle(){
  const MAX_WORD_LEN = 20;
  const eligible = PUZZLES.filter(p => p.a.split(' ').every(w => w.length <= MAX_WORD_LEN));
  const pool = eligible.length > 0 ? eligible : PUZZLES;
  const poolKeys = pool.map(p => PUZZLES.indexOf(p));
  const unused = poolKeys.filter(i => !G.usedIdx.has(i));
  const candidates = unused.length > 0 ? unused : poolKeys;
  if(unused.length === 0) G.usedIdx.clear();
  const idx = candidates[Math.floor(Math.random() * candidates.length)];
  G.usedIdx.add(idx);
  return PUZZLES[idx];
}

function startRound(){
  G.round++;
  if(G.round>G.maxRounds){ endGame(); return; }
  G.puzzle=pickPuzzle();
  G.revealed=new Set(); G.usedLetters=new Set(); G.spinVal=0;
  G.roundScore.player=0; G.roundScore.computer=0;
  G.phase='spin'; G.spinning=false; G.locked=false; G.hasGuessed=false;
  G.suddenDeath=false; G.sdVowelsQueue=[]; clearTimeout(G.sdInterval);
  G.turn='player'; G.bonusVal=0; G.onBonus=false;
  // MP: altijd locked totdat coinflip bepaalt wie begint
  if(G.mpMode) G.locked = true;
  // MP: host pusht puzzel index zodat gast dezelfde puzzel laadt
  if(G.mpMode && window.MP && window.MP.role==='host'){
    const puzzleIdx = PUZZLES.indexOf(G.puzzle);
    setTimeout(()=> mpPushAction({ type:'round_start', puzzleIdx, round:G.round, roundType:G.roundType||'normal', activeSegs: activeSegs }), 50);
  }

  // ── Bepaal rondetype ────────────────────────────────────────────────────
  let roundType = 'normal';
  if(G.maxRounds === 3){
    if(G.round === 3) roundType = 'chrome';
  } else if(G.maxRounds === 5){
    if(G.round === 4) roundType = 'chrome';
    if(G.round === 5) roundType = 'gold';
  } else if(G.maxRounds === 7){
    if(G.round === 4 || G.round === 5) roundType = 'chrome';
    if(G.round === 6 || G.round === 7) roundType = 'gold';
  }
  G.roundType = roundType;

  // ── Klinkerkosten voor deze ronde ───────────────────────────────────────
  G.vowelCost = (roundType === 'gold') ? 500 : VOWEL_COST;
  const vBtn = document.getElementById('btn-vowel');
  if(vBtn) vBtn.innerHTML = 'KLINKER<br><small>€' + G.vowelCost + '</small>';

  // ── Bouw radsegmenten ───────────────────────────────────────────────────
  if(roundType === 'chrome'){
    // Zilverronde: BONUS + MINUS in geldvakjes (nooit kompasposities 0,4,8,12 overschrijven)
    const base = [...SEGS];
    const COMPASS = new Set([0,4,8,12]);
    const moneyIdxs = base.map((seg,i)=>typeof seg.val==='number'&&!COMPASS.has(i)?i:-1).filter(i=>i>=0);
    const shuffled  = [...moneyIdxs].sort(()=>Math.random()-0.5);
    // Vervang twee geldvakjes door BONUS en MINUS
    base[shuffled[0]] = BONUS_SEGS.chrome[0];
    base[shuffled[1]] = BONUS_SEGS.chrome[1];
    activeSegs = base;

  } else if(roundType === 'gold'){
    // Goudronde: BONUS_GOLD + BONUS_CHROME + 2×MINUS in geldvakjes
    // Nooit kompasposities 0,4,8,12 overschrijven
    const base = [...SEGS];
    const COMPASS = new Set([0,4,8,12]);
    const moneyIdxs = base.map((seg,i)=>typeof seg.val==='number'&&!COMPASS.has(i)?i:-1).filter(i=>i>=0);
    const shuffled  = [...moneyIdxs].sort(()=>Math.random()-0.5);
    // Plaats Goud BONUS, Zilver BONUS, één Min-vak en één extra Joker in geldposities
    base[shuffled[0]] = BONUS_SEGS.gold[0];
    base[shuffled[1]] = BONUS_SEGS.chrome[0];
    base[shuffled[2]] = BONUS_SEGS.gold[1];   // MINUS
    base[shuffled[3]] = { lbl:'JOKER', val:'JOKER', col:'JOKER' };
    activeSegs = base;

  } else {
    activeSegs = [...SEGS];
  }
  // Gast hertekent wiel na ontvangst van activeSegs via round_start event
  if(!G.mpMode || (window.MP && window.MP.role === 'host')) drawWheel(wheelRot);

  // ── Vooraf onthuld ──────────────────────────────────────────────────────
  const preReveal = G.difficulty==='easy'   ? ['R','S','T','L'] :
                    G.difficulty==='medium' ? ['R','S'] : [];
  preReveal.forEach(l=>{
    G.usedLetters.add(l);
    for(let i=0;i<G.puzzle.a.length;i++) if(G.puzzle.a[i]===l) G.revealed.add(i);
  });

  // ── Rondepil ────────────────────────────────────────────────────────────
  const pill = document.getElementById('round-pill');
  if(roundType === 'gold'){
    pill.innerHTML = '<span class="star-gold">★</span> Goud Bonus Ronde ' + G.round + ' van ' + G.maxRounds;
    pill.style.background = 'linear-gradient(135deg,#7a4800,#c97d00,#f5c518,#c97d00,#7a4800)';
    pill.style.color = '#3a1a00'; pill.style.borderColor = '#c97d00';
  } else if(roundType === 'chrome'){
    pill.innerHTML = '<span class="star-silver">★</span> Zilver Bonus Ronde ' + G.round + ' van ' + G.maxRounds;
    pill.style.background = 'linear-gradient(135deg,#c8d6e0,#f0f4f7,#c8d6e0)';
    pill.style.color = '#1a1a2a'; pill.style.borderColor = '#8a9ba8';
  } else {
    pill.textContent = 'Ronde ' + G.round + ' van ' + G.maxRounds;
    pill.style.background=''; pill.style.color=''; pill.style.borderColor='';
  }

  document.getElementById('cat-display').textContent=G.puzzle.c;
  setBanner('','empty');
  renderPuzzle(); buildKeyboard(); updateScores(); updateTurnUI();

  // ── Aankondiging bonusronde ─────────────────────────────────────────────
  if(roundType !== 'normal'){
    G.locked = true;
    let title, body, icon;
    if(roundType === 'gold'){
      title = '<span class="star-gold">★</span> Goud Bonus Ronde!';
      body  = 'Een gouden BONUS-vak (+€5.000) en een zilveren BONUS-vak (+€2.500) staan op het rad. Er zijn ook twee <span class="star-blue">★</span> JOKER-vakken en één Min-vak in het spel — het Min-vak kost je 50% van je rondeverdiensten. Land op een BONUS-vak en raad een medeklinker om het te incasseren! Klinkers kosten €500 in deze ronde!';
      icon  = '👑';
    } else {
      title = '<span class="star-silver">★</span> Zilver Bonus Ronde!';
      body  = 'Er verschijnt een zilveren BONUS-vak (+€2.500) op het rad! Land op BONUS en raad een medeklinker goed om het te incasseren! Pas op voor het Min-vak — dat kost je 50% van je rondeverdiensten!';
      icon  = '🥈';
    }
    setTimeout(()=>{
      const theme = roundType==='gold'?'gold':'silver';
      showResult(title, body, icon, false,
        ()=>{ G.locked = G.mpMode ? !mpIsMyTurn() : false; updateTurnUI(); if(!G.mpMode && G.turn==='computer') setTimeout(computerTurn,1600); },
        theme
      );
    }, 300);
  } else {
    if(!G.mpMode && G.turn==='computer') setTimeout(computerTurn,1600);
  }
}


// ── PUZZEL RENDEREN ───────────────────────────────────────────────────────────
function renderPuzzle(){
  const grid=document.getElementById('puzzle-grid'); grid.innerHTML='';
  const puzzle=G.puzzle.a;

  // ── Calculate available width and ideal tile size ──────────────────────────
  const availW = (document.getElementById('puzzle-grid').closest('.puzzle-area') || document.body).clientWidth - 12;
  const words = puzzle.split(' ');
  const longestWord = Math.max(...words.map(w=>w.length));

  // Determine MAX tiles per row: start at 13, shrink if a word won't fit
  // Tile takes: tileW + gap(3px). Space tile = 10px. Min tile = 18px.
  // We try tile widths from 26 down to 18 until the longest word fits.
  let tileW = 26, gap = 3, spaceW = 10;
  for(let tw=26; tw>=14; tw--){
    const rowW = longestWord * tw + (longestWord-1) * gap;
    if(rowW <= availW){ tileW = tw; break; }
    tileW = 14; // absolute minimum safety net
  }

  // MAX tiles per row given chosen tile width
  const MAX = Math.floor((availW + gap) / (tileW + gap));

  // ── Build rows tracking exact string positions ─────────────────────────────
  const rows=[]; let cur=[], curLen=0, pos=0;
  for(let w=0;w<words.length;w++){
    const word=words[w];
    const startIdx=pos;
    const need=word.length+(cur.length>0?1:0);
    if(curLen+need>MAX&&cur.length>0){
      rows.push([...cur]); cur=[{word,startIdx}]; curLen=word.length;
    } else {
      if(cur.length>0) curLen++;
      cur.push({word,startIdx}); curLen+=word.length;
    }
    pos+=word.length+1;
  }
  if(cur.length) rows.push(cur);

  // ── Render tiles with dynamic size ────────────────────────────────────────
  const tileH = Math.round(tileW * 1.31); // keep aspect ratio
  const fontSize = Math.max(10, Math.round(tileW * 0.58));

  for(const row of rows){
    const rowEl=document.createElement('div'); rowEl.className='puzzle-row';
    for(let w=0;w<row.length;w++){
      if(w>0){
        const sp=document.createElement('div');
        sp.className='tile tile-space';
        sp.style.width=spaceW+'px';
        rowEl.appendChild(sp);
      }
      const {word,startIdx}=row[w];
      for(let c=0;c<word.length;c++){
        const idx=startIdx+c;
        const ch=word[c];
        const tile=document.createElement('div');
        tile.className='tile tile-letter'+(G.revealed.has(idx)?' revealed':'');
        tile.style.cssText=`width:${tileW}px;height:${tileH}px;font-size:${fontSize}px;`;
        tile.textContent=G.revealed.has(idx)?ch:''; tile.dataset.i=idx;
        rowEl.appendChild(tile);
      }
    }
    grid.appendChild(rowEl);
  }
}

function animateReveal(letter){
  let count=0;
  for(let i=0;i<G.puzzle.a.length;i++){
    if(G.puzzle.a[i]===letter&&!G.revealed.has(i)){
      G.revealed.add(i); count++;
      const delay=count*400;
      setTimeout(()=>{
        const tile=document.querySelector(`.tile[data-i="${i}"]`);
        if(tile){ tile.classList.add('revealed'); tile.textContent=letter; sndReveal(); }
      },delay);
    }
  }
  return count;
}

function isPuzzleSolved(){
  return G.puzzle.a.split('').every((c,i)=>c===' '||G.revealed.has(i));
}

// ── TOETSENBORD ───────────────────────────────────────────────────────────────
function buildKeyboard(){
  const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];
  const kb=document.getElementById('keyboard'); kb.innerHTML='';
  for(const row of rows){
    const re=document.createElement('div'); re.className='key-row';
    for(const ch of row){
      const k=document.createElement('button'); k.className='key'; k.textContent=ch; k.dataset.letter=ch;
      if(G.usedLetters.has(ch)){ k.classList.add('used'); k.classList.add(G.puzzle.a.includes(ch)?'hit':'miss'); }
      k.addEventListener('click',()=>handleKeyPress(ch));
      re.appendChild(k);
    }
    kb.appendChild(re);
  }
}

function markKey(letter,hit){
  const k=document.querySelector(`.key[data-letter="${letter}"]`);
  if(k){ k.classList.remove('vowel-active'); k.classList.add('used',hit?'hit':'miss'); }
}

function updateKeyInteractivity(){
  document.querySelectorAll('.key').forEach(k=>{
    const letter=k.dataset.letter;
    if(G.usedLetters.has(letter)||k.classList.contains('used')){ k.style.pointerEvents='none'; k.style.opacity=''; return; }
    if((G.mpMode ? !mpIsMyTurn() : G.turn!=='player')||G.locked){ k.style.pointerEvents='none'; k.style.opacity='0.3'; return; }
    if(G.phase==='guess'){
      if(VOWELS.has(letter)){ k.style.pointerEvents='none'; k.style.opacity='0.2'; k.classList.remove('vowel-active'); }
      else{ k.style.pointerEvents=''; k.style.opacity=''; k.classList.remove('vowel-active'); }
    } else if(G.phase==='buy_vowel'){
      if(!VOWELS.has(letter)){ k.style.pointerEvents='none'; k.style.opacity='0.15'; k.classList.remove('vowel-active'); }
      else{ k.style.pointerEvents=''; k.style.opacity=''; k.classList.add('vowel-active'); }
    } else{ k.style.pointerEvents='none'; k.style.opacity='0.3'; k.classList.remove('vowel-active'); }
  });
}

// ── BEURT UI ──────────────────────────────────────────────────────────────────
function updateTurnUI(){
  const isP = G.mpMode ? mpIsMyTurn() : G.turn==='player';

  let myScore = G.roundScore.player;
  if(G.mpMode && window.MP && window.MP.myKey === 'player2'){
    myScore = G.roundScore.computer;
  }

  document.getElementById('sc-player').classList.toggle('active-turn', G.mpMode ? mpIsMyTurn() : G.turn==='player');
  document.getElementById('sc-comp').classList.toggle('active-turn', G.mpMode ? !mpIsMyTurn() : G.turn!=='player');

  const vCost = G.vowelCost || VOWEL_COST;
  const kanKlinkerKopen = isP && (G.phase==='guess' || (G.phase==='spin' && G.hasGuessed)) && !G.locked && myScore >= vCost && hasUnrevealedVowels() && !G.suddenDeath;

  document.getElementById('btn-spin').disabled = !(isP && G.phase==='spin' && !G.locked && !G.suddenDeath);
  document.getElementById('btn-vowel').disabled = !kanKlinkerKopen;
  document.getElementById('btn-solve').disabled = G.suddenDeath ? false : !(isP && !G.locked);
  updateKeyInteractivity();
}

function updateScores(){
  let myRound = G.roundScore.player, oppRound = G.roundScore.computer;
  let myTotal = G.totalScore.player, oppTotal = G.totalScore.computer;
  // Voor de gast draaien we de scores om zodat zijn score altijd links staat
  if(G.mpMode && window.MP && window.MP.myKey === 'player2'){
    myRound = G.roundScore.computer; oppRound = G.roundScore.player;
    myTotal = G.totalScore.computer; oppTotal = G.totalScore.player;
  }
  document.getElementById('p-round').textContent='€'+myRound.toLocaleString('nl-NL');
  document.getElementById('c-round').textContent='€'+oppRound.toLocaleString('nl-NL');
  document.getElementById('p-total').textContent='Totaal €'+myTotal.toLocaleString('nl-NL');
  document.getElementById('c-total').textContent='Totaal €'+oppTotal.toLocaleString('nl-NL');
}

function setBanner(text,cls){
  const b=document.getElementById('spin-banner');
  b.className='spin-banner '+(cls||'empty'); b.innerHTML=text||'';
}

function showThinking(v){ document.getElementById('think-bar').classList.toggle('show',v); }

function switchTurn(requester = null){
  // Check if game is stuck before switching
  if(isGameStuck()){
    startSuddenDeath();
    return;
  }

  // MULTIPLAYER FIX: Alleen de speler die de actie startte mag de beurt lokaal pushen.
  // De andere speler negeert zijn lokale timer en wacht op het switch_turn Firebase event.
  if(G.mpMode && requester){
    const myRole = window.MP.myKey === 'player1' ? 'player' : 'computer';
    if(requester !== myRole) return;
  }

  G.turn = G.turn === 'player' ? 'computer' : 'player';
  G.phase = 'spin'; G.spinVal = 0; G.hasGuessed = false;

  if(G.mpMode){
    const myTurn = mpIsMyTurn();
    G.locked = !myTurn;
    setBanner(myTurn ? 'Jouw beurt! Draai het rad.' : 'Tegenstander is aan de beurt...', myTurn ? 'money' : 'empty');
    updateTurnUI();
    // Kleine vertraging zodat de guess actie eerst verwerkt is voordat switch_turn Firebase overschrijft
    if(!G.mpSuppressActionPush) setTimeout(() => mpPushAction({ type:'switch_turn', turn: G.turn }), 200);
  } else {
    G.locked = false;
    setBanner('','empty'); updateTurnUI();
    if(!G.mpMode && G.turn==='computer') setTimeout(computerTurn,1200);
  }
}

function hasUnrevealedVowels(){
  for(const v of VOWELS) if(!G.usedLetters.has(v)&&G.puzzle.a.includes(v)) return true;
  return false;
}

function hasUnrevealedConsonants(){
  for(const ch of G.puzzle.a){
    if(ch!==' '&&!VOWELS.has(ch)&&!G.usedLetters.has(ch)) return true;
  }
  return false;
}

function isGameStuck(){
  // Stuck when: no consonants left to earn money with, AND
  // both players can't afford vowels (or no vowels left)
  if(hasUnrevealedConsonants()) return false;
  if(!hasUnrevealedVowels()) return false; // no vowels either = basically solved or stuck differently
  const playerCanBuy = G.roundScore.player >= (G.vowelCost||VOWEL_COST);
  const compCanBuy   = G.roundScore.computer >= (G.vowelCost||VOWEL_COST);
  return !playerCanBuy && !compCanBuy;
}

// ── SUDDEN DEATH ──────────────────────────────────────────────────────────────
function startSuddenDeath(){
  if(G.suddenDeath) return;
  G.suddenDeath = true;
  G.locked = true;

  // Collect unrevealed vowels that are in the puzzle
  G.sdVowelsQueue = [...VOWELS].filter(v => !G.usedLetters.has(v) && G.puzzle.a.includes(v));

  setBanner('⚡ WIE RAADT HET EERST!','sudden');

  // Show announcement modal briefly then start revealing
  const overlay = document.getElementById('modal-sd');
  overlay.classList.add('open');
}

function startSdReveal(){
  const sdModal = document.getElementById('modal-sd');
  sdModal.classList.remove('open');
  // Explicitly blur the modal so Firefox releases focus back to the document
  if(document.activeElement && sdModal.contains(document.activeElement)){
    document.activeElement.blur();
  }
  sdModal.blur();
  setBanner('⚡ WIE RAADT HET EERST — Los op!','sudden');

  // Set phase to solve-only for player
  G.phase = 'sudden_death';
  G.locked = false;
  updateTurnUI();

  // Reveal vowels one by one with a delay
  revealNextSdVowel();
}

function revealNextSdVowel(){
  if(isPuzzleSolved()){ endRound(G.turn); return; }
  if(G.sdVowelsQueue.length === 0){
    // All vowels revealed but not solved - nobody wins this round
    setBanner('😶 Niemand raadde het!','neutral');
    G.locked = true;
    setTimeout(()=>{
      G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
      renderPuzzle();
      showResult('Geen Winnaar','Niemand loste het op deze ronde!','😶',true,()=>{
        G.suddenDeath=false; G.sdVowelsQueue=[];
        if(G.round>=G.maxRounds) endGame(); else startRound();
      });
    },800);
    return;
  }

  const vowel = G.sdVowelsQueue.shift();
  G.usedLetters.add(vowel);
  const count = animateReveal(vowel);
  markKey(vowel, count > 0);
  updateScores();

  setBanner(`⚡ ${vowel} wordt onthuld…`, 'money');

  // After reveal animation, check if solved, then wait and reveal next
  const delay = count > 0 ? (count * 400 + 400) : 400;
  setTimeout(()=>{
    if(isPuzzleSolved()){
      // Nobody solved it - the reveal finished it
      endRound(G.turn);
      return;
    }
    setBanner('⚡ WIE RAADT HET EERST — Los op nu!','sudden');
    // Give player 5 seconds to attempt solve before next vowel
    G.sdInterval = setTimeout(()=>{
      if(!G.suddenDeath) return;
      revealNextSdVowel();
    }, 5000);
  }, delay);
}

function sdComputerAttempt(){
  // Computer tries to solve in sudden death
  if(!G.suddenDeath||G.turn!=='computer') return;
  const total=G.puzzle.a.replace(/ /g,'').length;
  const pct=G.revealed.size/Math.max(1,total);
  if(pct>0.7&&Math.random()<0.5){
    clearTimeout(G.sdInterval);
    setBanner('🤖 Probeert op te lossen…','money');
    setTimeout(()=>endRound('computer'),1200);
  }
}

// ── DRAAIEN ───────────────────────────────────────────────────────────────────
function handleSpin(){
  if(G.spinning||G.phase!=='spin'||G.locked) return;
  if(G.mpMode && !mpIsMyTurn()) return;
  if(!G.mpMode && G.turn!=='player') return;
  doSpin(G.mpMode ? G.turn : 'player');
}

function doSpin(who, forcedRot, forcedFsi){
  G.spinning=true; G.locked=true; updateTurnUI();

  let totalRot;
  let targetFsi = forcedFsi;

  if(forcedRot !== undefined){
    // Tegenstander draait: gebruik de data uit Firebase
    totalRot = forcedRot;
  } else {
    // Wij draaien zelf: genereer rotatie
    totalRot = (7+Math.random()*8)*Math.PI*2;

    // Bereken VOORAF op welk segment we gaan landen
    const fRot = wheelRot + totalRot;
    const fNorm = ((fRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const pAngle = (((-fNorm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const _segs = activeSegs.length ? activeSegs : SEGS;
    targetFsi = Math.floor((pAngle/(2*Math.PI))*_segs.length)%_segs.length;

    // Stuur rotatie + exacte uitslag-index naar tegenstander
    if(G.mpMode && !G.mpSuppressActionPush && mpIsMyTurn()){
      mpPushAction({ type:'spin', totalRot: totalRot, startRot: wheelRot, targetFsi: targetFsi });
    }
    // In MP: hasGuessed wordt na onLanded gezet — ook voor de gast via de replay
  }

  const dur = 4000 + ((totalRot * 100) % 1200);
  const t0=performance.now(), startRot=wheelRot;
  let lastSeg=-1;

  function frame(now){
    const elapsed=now-t0, prog=Math.min(elapsed/dur,1);
    const ease=1-Math.pow(1-prog,5); // quintic ease-out
    const curRot=startRot+totalRot*ease;
    drawWheel(curRot);

    // Tik-geluid
    const norm=((curRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const _tlen=(activeSegs.length||SEGS.length);
    const segArc=(2*Math.PI)/_tlen;
    const si=Math.floor((((-norm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/segArc)%_tlen;
    if(si!==lastSeg){ lastSeg=si; sndTick(); }

    if(prog<1){ requestAnimationFrame(frame); return; }
    G.spinning=false;
    const fRot=startRot+totalRot;
    wheelRot = fRot;

    let fsi;
    const _segs = activeSegs.length ? activeSegs : SEGS;
    if(targetFsi !== undefined){
      fsi = targetFsi; // 100% sync garantie
    } else {
      const fNorm=((fRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
      const pAngle=(((-fNorm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
      fsi=Math.floor((pAngle/(2*Math.PI))*_segs.length)%_segs.length;
    }

    onLanded(_segs[fsi], who);
  }
  requestAnimationFrame(frame);
}

function onLanded(seg,who){

  if(seg.val==='BANKRUPT'){
    sndBankrupt(); setBanner('💸 FAILLIET!','bad');
    G.roundScore[who]=0; updateScores();
    { const naam = G.mpMode ? (mpIsMyTurn() ? document.getElementById('sc-player-name').textContent : document.getElementById('sc-comp-name').textContent) : (who==='player'?'JIJ':'COMPUTER');
    setTimeout(()=>showResult(
      '💸 FAILLIET!',
      naam + ' verliest alle rondeverdiensten!',
      '😱',false,()=>switchTurn(who)),500); }

  } else if(seg.val==='LOSE'){
    sndWrong(); setBanner('😬 BEURT VERLIES','neutral');
    { const naam = G.mpMode ? (mpIsMyTurn() ? document.getElementById('sc-player-name').textContent : document.getElementById('sc-comp-name').textContent) : (who==='player'?'JIJ':'COMPUTER');
    setTimeout(()=>showResult(
      '😬 Beurt Verlies',
      naam + ' verliest deze beurt!',
      '😞',false,()=>switchTurn(who)),500); }

  } else if(seg.val==='MINUS'){
    const verloren = Math.floor(G.roundScore[who] / 2);
    G.roundScore[who] = Math.max(0, G.roundScore[who] - verloren);
    updateScores(); sndMinus(); flashScreenRed();
    setBanner('🔻 MINUS! -50% ronde!','bad');
    const verlorenStr = '€' + verloren.toLocaleString('nl-NL');
    { const naam = G.mpMode ? (mpIsMyTurn() ? document.getElementById('sc-player-name').textContent : document.getElementById('sc-comp-name').textContent) : (who==='player'?'JIJ':'COMPUTER');
    setTimeout(()=>showResult(
      '🔻 Minus!',
      naam + ' verliest ' + verlorenStr + ' van de rondeverdiensten!',
      '😱',false,()=>switchTurn(who)),600); }

  } else if(seg.val==='BONUS_CHROME'){
    G.spinVal=800; G.bonusVal=2500; G.onBonus=true; G.bonusType='chrome';
    sndBonusLand(); flashBonusHub();
    setBanner('🥈 ZILVER BONUS — raad een letter!','bonus');
    G.locked=true; updateTurnUI();
    setTimeout(()=>{
      G.phase='guess'; G.hasGuessed=true; G.locked=false; updateTurnUI();
      if(!G.mpMode && who!=='player') setTimeout(()=>computerGuessConsonant(),600);
      // MP: gast weet nu dat hij moet raden
      if(G.mpMode && !G.mpSuppressActionPush) mpPushAction({ type:'phase_update', phase:'guess', hasGuessed:true });
    },1800);

  } else if(seg.val==='BONUS_GOLD'){
    G.spinVal=800; G.bonusVal=5000; G.onBonus=true; G.bonusType='gold';
    sndGoldLand(); flashGoldHub();
    setBanner('👑 GOUD BONUS — raad een letter!','bonus-gold');
    G.locked=true; updateTurnUI();
    setTimeout(()=>{
      G.phase='guess'; G.hasGuessed=true; G.locked=false; updateTurnUI();
      if(!G.mpMode && who!=='player') setTimeout(()=>computerGuessConsonant(),600);
      if(G.mpMode && !G.mpSuppressActionPush) mpPushAction({ type:'phase_update', phase:'guess', hasGuessed:true });
    },2000);

  } else if(seg.val==='JOKER'){
    handleJoker(who);

  } else {
    G.spinVal=seg.val; G.bonusVal=0; G.onBonus=false;
    setBanner('💰 '+seg.lbl+' per letter','money');
    G.phase='guess'; G.hasGuessed=true; G.locked=false;
    if(G.mpMode || who==='player') updateTurnUI();
    else setTimeout(()=>computerGuessConsonant(),1100);
    // MP: informeer gast dat fase nu 'guess' is
    if(G.mpMode && !G.mpSuppressActionPush) setTimeout(()=>mpPushAction({ type:'phase_update', phase:'guess', hasGuessed:true }), 100);
  }
}

// ── JOKER HANDLER ─────────────────────────────────────────────────────────────
function handleJoker(who, forcedLetter = null){
  G.spinVal = 1250;
  G.locked = true;
  setBanner('<span class="star-blue">★</span> JOKER! Een willekeurige letter wordt onthuld!','bonus');
  sndBonusLand();

  const unrevealed = [];
  for(let i=0;i<G.puzzle.a.length;i++){
    const ch = G.puzzle.a[i];
    if(ch !== ' ' && !G.revealed.has(i) && !G.usedLetters.has(ch)){
      if(!unrevealed.includes(ch)) unrevealed.push(ch);
    }
  }

  if(unrevealed.length === 0){
    setBanner('<span class="star-blue">★</span> Joker — geen letters meer! Beurt gaat door.','money');
    setTimeout(()=>{
      G.locked = false; G.hasGuessed=true; G.phase = 'spin'; G.spinVal = 0;
      updateTurnUI();
      if(!G.mpMode && who !== 'player') setTimeout(()=>computerTurn(), 1000);
    }, 1500);
    return;
  }

  // Bepaal de letter — in MP kiest de actieve speler en pusht naar Firebase
  let letter = forcedLetter;
  if(!letter){
    if(G.mpMode && !mpIsMyTurn()){
      // Tegenstander is aan de beurt — wacht op zijn joker_pick signaal
      setBanner('<span class="star-blue">★</span> Joker! Wachten op tegenstander...', 'bonus');
      return;
    }
    letter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    if(G.mpMode && !G.mpSuppressActionPush){
      mpPushAction({ type:'joker_pick', letter });
    }
  }

  G.usedLetters.add(letter);

  setTimeout(()=>{
    const count = animateReveal(letter);
    markKey(letter, count > 0);
    const earn = 1250 * count;
    G.roundScore[who] += earn;
    updateScores();
    const earnStr = earn.toLocaleString('nl-NL');
    setBanner(`<span class="star-blue">★</span> JOKER ${letter} — ${count}x! +€${earnStr}`,'bonus');

    const delay = count > 0 ? (count * 400 + 500) : 500;
    setTimeout(()=>{
      if(isPuzzleSolved()){ endRound(who); return; }
      G.locked = false; G.hasGuessed=true; G.phase = 'spin'; G.spinVal = 0; G.onBonus = false;
      updateTurnUI();
      if(!G.mpMode && who !== 'player') setTimeout(()=>computerTurn(), 1000);
    }, delay);
  }, 1200);
}

// ── SPELER ACTIES ─────────────────────────────────────────────────────────────
function handleKeyPress(letter){
  if(G.mpMode && !mpIsMyTurn()) return;
  if(!G.mpMode && G.turn!=='player') return;
  if(G.locked||G.usedLetters.has(letter)) return;
  if(G.phase==='guess'&&VOWELS.has(letter)) return;
  if(G.phase==='buy_vowel'&&!VOWELS.has(letter)) return;
  if(G.phase!=='guess'&&G.phase!=='buy_vowel') return;
  const who = G.mpMode ? G.turn : 'player';
  processGuess(letter, who);
}

function handleBuyVowel(){
  if(G.mpMode && !mpIsMyTurn()) return;
  if(!G.mpMode && G.turn!=='player') return;
  if((G.phase!=='guess'&&(G.phase!=='spin'||!G.hasGuessed))||G.locked) return;

  let myScore = G.roundScore.player;
  if(G.mpMode && window.MP && window.MP.myKey === 'player2'){
    myScore = G.roundScore.computer;
  }
  const vCost = G.vowelCost || VOWEL_COST;

  if(myScore < vCost || !hasUnrevealedVowels()) return;

  G.phase='buy_vowel'; G.spinVal=0; G.locked=false;
  setBanner('🔤 Kies een klinker — kost €' + vCost,'money');
  updateTurnUI();
}

function processGuess(letter,who){
  if(G.usedLetters.has(letter)) return;
  // In MP: als het mijn beurt was, push de actie (niet bij replay van tegenstander)
  if(G.mpMode && !G.mpSuppressActionPush && mpIsMyTurn()){
    const isVowel = VOWELS.has(letter);
    mpPushAction({ type: isVowel ? 'vowel' : 'guess', letter });
  }
  G.usedLetters.add(letter); G.locked=true;
  const isVowel=VOWELS.has(letter);
  const count=animateReveal(letter), hit=count>0;
  if(isVowel) G.roundScore[who]-=(G.vowelCost||VOWEL_COST);
  if(!isVowel&&hit){
    const letterEarn = count * G.spinVal;
    const bonusEarn  = G.onBonus ? (G.bonusVal||0) * count : 0;
    G.roundScore[who] += letterEarn + bonusEarn;
  }
  updateScores();
  markKey(letter,hit&&G.puzzle.a.includes(letter));
  // MP: actie is al gepusht via mpPushAction in processGuess
  const delay=hit?(count*400+250):250;

  if(hit){
    if(G.onBonus){
      if(G.roundType==='gold') sndGoldHit(); else sndBonusHit();
      setTimeout(()=>{ shimmerRevealedTiles(); spawnSparkleParticles(); }, count*400+50);
    } else { sndCorrect(); }
  } else {
    if(G.onBonus) sndBonusMiss(); else sndWrong();
  }

  setTimeout(()=>{
    if(isPuzzleSolved()){ sndFanfare(); endRound(who); return; }
    if(hit){
      let earn='';
      if(G.onBonus && G.bonusVal){
        const total = (G.bonusVal * count).toLocaleString('nl-NL');
        const label = G.bonusType==='gold' ? '<span class="star-gold">★</span> Goud Bonus' : '<span class="star-silver">★</span> Zilver Bonus';
        setBanner(`${label} ${letter} zit er ${count}x in! +€${total}`,'bonus');
      } else if(!isVowel && G.spinVal){
        const le=count*G.spinVal;
        setBanner(`✅ ${count}× ${letter} = €${le.toLocaleString('nl-NL')}`,'money');
      } else {
        setBanner(`✅ ${letter}`,'money');
      }
      G.onBonus=false; G.bonusVal=0;
      if(isVowel){
        // Option C: vowel purchase — same player must spin again
        G.hasGuessed=false; G.phase='spin'; G.locked=false; updateTurnUI();
        if(!G.mpMode && who==='computer') setTimeout(()=>computerTurn(),1300);
      } else {
        G.hasGuessed=true; G.phase='spin'; G.locked=false; updateTurnUI();
        if(!G.mpMode && who==='computer') setTimeout(()=>computerTurn(),1300);
      }
    } else {
      if(G.onBonus) setBanner(`❌ Geen ${letter}'s — bonus gemist!`,'neutral');
      else setBanner(`❌ Geen ${letter}'s`,'neutral');
      G.onBonus=false; G.bonusVal=0;
      setTimeout(()=>switchTurn(who),900);
    }
  },delay);
}

// ── OPLOSSEN ──────────────────────────────────────────────────────────────────
function openSolveModal(){
  if(G.locked && !G.suddenDeath) return;
  if(!G.suddenDeath){
    if(G.mpMode && !mpIsMyTurn()) return;
    if(!G.mpMode && G.turn!=='player') return;
  }
  const si = document.getElementById('solve-input');
  si.value='';
  // Blur any active element first so mobile keyboard resets cleanly
  if(document.activeElement) document.activeElement.blur();
  document.getElementById('modal-solve').classList.add('open');
  setTimeout(()=>{ centerModalInViewport(); si.focus(); si.select(); setTimeout(centerModalInViewport, 400); },220);
}
function closeSolveModal(){ document.getElementById('modal-solve').classList.remove('open'); resetModalPosition(); }
function submitSolve(){
  const guess=document.getElementById('solve-input').value.trim().toUpperCase();
  closeSolveModal(); if(!guess) return;

  // Bepaal wie de actie uitvoert
  const requester = G.mpMode ? (window.MP.myKey === 'player1' ? 'player' : 'computer') : 'player';

  if(guess===G.puzzle.a){
    clearTimeout(G.sdInterval);
    if(G.mpMode && !G.mpSuppressActionPush) mpPushAction({ type:'solve_ok' });
    G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
    renderPuzzle();
    endRound(G.mpMode ? G.turn : 'player');
  } else {
    setBanner('❌ Fout antwoord!','bad');
    if(G.mpMode && !G.mpSuppressActionPush) mpPushAction({ type:'solve_bad' });
    if(G.suddenDeath){
      setTimeout(()=>{}, 900);
    } else {
      setTimeout(()=>switchTurn(requester),1000);
    }
  }
}

// ── COMPUTER AI ───────────────────────────────────────────────────────────────
function computerTurn(){
  if(G.turn!=='computer') return;
  if(G.mpMode) return; // In multiplayer: geen AI — de gast is de tegenstander
  if(isGameStuck()){ startSuddenDeath(); return; }
  if(G.suddenDeath){ sdComputerAttempt(); return; }
  showThinking(true);
  const cfg=DIFF[G.difficulty];
  const total=G.puzzle.a.replace(/ /g,'').length;
  const pct=G.revealed.size/Math.max(1,total);
  const onlyVowelsLeft = !hasUnrevealedConsonants() && hasUnrevealedVowels();
  const totalPositions = G.puzzle.a.replace(/ /g,'').length;
  const missingPositions = totalPositions - G.revealed.size;
  setTimeout(()=>{
    showThinking(false);
    // Exact 1 positie ontbreekt — direct oplossen
    if(missingPositions === 1){
      setBanner('🤖 Oplossen…','money');
      setTimeout(()=>endRound('computer'),1400); return;
    }
    // Near-solve: only vowels missing — spin first (hasGuessed=false), then buy vowel or solve
    if(onlyVowelsLeft){
      if(!G.hasGuessed){ doSpin('computer'); return; }
      const av=[...VOWELS].filter(v=>!G.usedLetters.has(v)&&G.puzzle.a.includes(v));
      if(av.length>0&&G.roundScore.computer>=(G.vowelCost||VOWEL_COST)){
        G.phase='buy_vowel'; G.spinVal=0;
        const v=cfg.freq.find(l=>av.includes(l))||av[0];
        setBanner(`🤖 Koopt klinker ${v}`,'money');
        setTimeout(()=>processGuess(v,'computer'),900); return;
      }
      setBanner('🤖 Oplossen…','money');
      setTimeout(()=>endRound('computer'),1400); return;
    }
    // Attempt solve?
    if(pct>=cfg.solve&&Math.random()<cfg.solveChance){
      setBanner('🤖 Oplossen…','money');
      setTimeout(()=>endRound('computer'),1400); return;
    }
    // Buy vowel? Only if already spun this turn
    if(G.hasGuessed&&G.roundScore.computer>=(G.vowelCost||VOWEL_COST)&&hasUnrevealedVowels()&&pct>cfg.vowelMin&&Math.random()<cfg.vowel){
      const av=[...VOWELS].filter(v=>!G.usedLetters.has(v)&&G.puzzle.a.includes(v));
      if(av.length>0){
        G.phase='buy_vowel'; G.spinVal=0;
        const v = G.difficulty==='hard'
          ? (cfg.freq.find(l=>av.includes(l))||av[0])
          : av[Math.floor(Math.random()*av.length)];
        setBanner(`🤖 Koopt klinker ${v}`,'money');
        setTimeout(()=>processGuess(v,'computer'),900); return;
      }
    }
    doSpin('computer');
  },cfg.thinkDelay);
}

function computerGuessConsonant(){
  if(G.mpMode) return; // AI mag nooit raden in multiplayer!
  showThinking(true);
  const cfg=DIFF[G.difficulty];
  const avail=cfg.freq.filter(c=>!VOWELS.has(c)&&!G.usedLetters.has(c));
  const inPuzz=avail.filter(c=>G.puzzle.a.includes(c));

  let pick;
  if(G.difficulty==='easy'){
    // Blind-ish: only picks in-puzzle letter 25% of the time
    pick = inPuzz.length>0&&Math.random()<cfg.smart
      ? inPuzz[0]
      : (avail[Math.floor(Math.random()*Math.min(avail.length,12))]||null);
  } else {
    // Medium/Hard: picks from in-puzzle letters with probability cfg.smart
    pick = (inPuzz.length>0&&Math.random()<cfg.smart) ? inPuzz[0] : (avail[0]||null);
  }
  setTimeout(()=>{
    showThinking(false);
    if(!pick){ switchTurn(); return; }
    setBanner(`🤖 Raadt: ${pick}`,'money');
    setTimeout(()=>processGuess(pick,'computer'),700);
  },1000);
}

// ── RONDE / SPEL EINDE ────────────────────────────────────────────────────────
function endRound(winner){
  // FIX: Voorkom dat acties de ronde dubbel proberen af te sluiten
  if(G.phase === 'ended') return;
  G.phase = 'ended';
  G.locked=true;
  G.totalScore[winner]+=G.roundScore[winner];
  G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
  renderPuzzle(); updateScores();
  if(G.mpMode){
    const myTotal = window.MP.myKey === 'player2' ? G.totalScore.computer : G.totalScore.player;
    window.MPapi.pushScore(G.mpCode, G.mpMyKey, myTotal);
  }

  // Controleer of JIJ de winnaar bent
  const amIWinner = (G.mpMode && window.MP && window.MP.myKey === 'player2') ? (winner === 'computer') : (winner === 'player');
  const oppName = G.mpMode ? mpGetOppNick() : 'Computer';

  const icon  = amIWinner ? '🎉' : (G.mpMode ? '😞' : '🤖');
  const title = amIWinner ? 'Ronde Gewonnen!' : oppName + ' Wint';
  const sub   = amIWinner
    ? `+€${G.roundScore[winner].toLocaleString('nl-NL')} toegevoegd aan je totaal!`
    : 'Beter geluk volgende ronde!';
  setTimeout(()=>showResult(title,sub,icon,true,()=>{
    if(G.round>=G.maxRounds){ endGame(); return; }
    if(G.mpMode && window.MP.role==='host'){
      startRound();
      // FIX: Voorkom dat round_start en coinflip tegelijk naar Firebase gaan
      setTimeout(() => mpDoCoinFlip(), 1200);
    } else if(G.mpMode){
      // Gast wacht — maar alleen als de nieuwe ronde nog niet al begonnen is
      if(G.phase === 'ended'){
        G.locked = true;
        setBanner('Wachten op volgende ronde...', 'empty');
      }
    } else {
      startRound();
    }
  }),500);
}

function showResult(title,sub,icon,showAns,cb,theme){
  const el=document.getElementById('modal-result');
  const titleEl=document.getElementById('res-title');
  const iconEl=document.getElementById('res-icon');
  titleEl.innerHTML=title;
  document.getElementById('res-sub').innerHTML=sub;
  iconEl.textContent=icon;
  const ra=document.getElementById('res-answer');
  ra.textContent=showAns?G.puzzle.a:''; ra.style.display=showAns?'block':'none';
  // Apply theme to modal box border + title gradient
  const box=el.querySelector('.modal-box');
  if(theme==='silver'){
    box.style.borderColor='#8a9ba8';
    box.style.boxShadow='0 20px 60px rgba(0,0,0,0.6),0 0 30px rgba(180,200,215,0.2)';
    titleEl.style.backgroundImage='linear-gradient(135deg,#b0c4ce,#e8f0f5,#8a9ba8)';
    iconEl.style.filter='drop-shadow(0 0 8px rgba(180,210,230,0.8))';
  } else if(theme==='gold'){
    box.style.borderColor='#c97d00';
    box.style.boxShadow='0 20px 60px rgba(0,0,0,0.6),0 0 40px rgba(245,197,24,0.25)';
    titleEl.style.backgroundImage='linear-gradient(135deg,#fff8d0,#f5c518,#c97d00)';
    iconEl.style.filter='drop-shadow(0 0 12px rgba(245,197,24,0.9))';
  } else {
    box.style.borderColor='';
    box.style.boxShadow='';
    titleEl.style.backgroundImage='';
    iconEl.style.filter='';
  }
  el.classList.add('open');
  resultCb=cb;
}
function continueAfterResult(){
  document.getElementById('modal-result').classList.remove('open');
  if(resultCb){ const f=resultCb; resultCb=null; f(); }
}

async function endGame(){
  let myTotal = G.totalScore.player;
  let oppTotal = G.totalScore.computer;
  if(G.mpMode && window.MP && window.MP.myKey === 'player2'){
    myTotal  = G.totalScore.computer;
    oppTotal = G.totalScore.player;
  }

  let icon,title,sub,outcome;
  if(myTotal > oppTotal){
    icon='🏆'; title='Jij Wint!';
    sub=`Je versloeg de tegenstander met €${(myTotal-oppTotal).toLocaleString('nl-NL')}!`;
    outcome='win'; sndFanfare();
  } else if(oppTotal > myTotal){
    icon='🥈'; title=(G.mpMode ? mpGetOppNick() : 'Computer') + ' Wint';
    sub=`Goed gespeeld! Verschil: €${(oppTotal-myTotal).toLocaleString('nl-NL')}.`;
    outcome='loss';
  } else {
    icon='🥇🤝🥇'; title='Gelijkspel!';
    sub='Ongelooflijk gelijkspel! Gefeliciteerd!';
    outcome='tie';
  }
  const overlay = document.getElementById('result-overlay');
  overlay.className = outcome;
  document.getElementById('result-icon').textContent  = icon;
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-sub').textContent   = sub;
  overlay.style.opacity='0'; overlay.style.pointerEvents='all';
  requestAnimationFrame(()=>{
    overlay.style.transition='opacity 0.6s ease';
    overlay.style.opacity='1';
  });
  launchParticles(outcome);
  setTimeout(()=>launchParticles(outcome), 1400);

  // Win — wait 2s for win screen, submit score, show leaderboard, then credits
  // Submit score if won — then always show leaderboard before credits
  if(outcome === 'win') await trySubmitScore(myTotal, G.difficulty);

  setTimeout(async ()=>{
    overlay.style.opacity='0';
    setTimeout(async ()=>{
      overlay.style.pointerEvents='none';
      // Altijd top 5 tonen voor credits
      await showWinLeaderboard(G.difficulty, outcome === 'win' ? myTotal : null);
      showCredits(()=>{ initState(G.maxRounds,G.difficulty); showScreen('screen-title'); });
    }, 600);
  }, 2000);

  if(false) {
    // Loss or tie — (now handled above)
    setTimeout(()=>{
      overlay.style.opacity='0';
      setTimeout(()=>{
        overlay.style.pointerEvents='none';
        showCredits(()=>{ initState(G.maxRounds,G.difficulty); showScreen('screen-title'); });
      }, 600);
    }, 5000);
  }
}

function launchParticles(outcome){
  const canvas = document.getElementById('result-particles');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('result-overlay');
  canvas.width = overlay.offsetWidth || window.innerWidth;
  canvas.height = overlay.offsetHeight || window.innerHeight;
  const cx = canvas.width/2, cy = canvas.height/2;

  const palettes = {
    win:  ['#f5c518','#fff8d0','#ffa500','#ffdd00','#ffffff','#ff9f1c'],
    loss: ['#c0c0c0','#e8e8e8','#a8a8a8','#ffffff','#d0d0d0','#b8b8b8'],
    tie:  ['#f5c518','#fff8d0','#ffa500','#c0c0c0','#ffffff','#ffdd00'],
  };
  const cols = palettes[outcome] || palettes.win;

  const particles = [];
  const count = 200;
  for(let i=0;i<count;i++){
    const angle = Math.random()*Math.PI*2;
    const speed = 4 + Math.random()*11;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed - (Math.random()*5),
      size: 3 + Math.random()*6,
      col: cols[Math.floor(Math.random()*cols.length)],
      alpha: 1,
      gravity: 0.15 + Math.random()*0.1,
      shape: Math.random()>0.5 ? 'circle' : 'rect',
      rotation: Math.random()*Math.PI*2,
      rotSpeed: (Math.random()-0.5)*0.2,
    });
  }

  function animate(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let alive = false;
    particles.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      p.vy+=p.gravity; p.vx*=0.99;
      p.alpha-=0.010;
      p.rotation+=p.rotSpeed;
      if(p.alpha<=0) return;
      alive=true;
      ctx.save();
      ctx.globalAlpha=Math.max(0,p.alpha);
      ctx.fillStyle=p.col;
      ctx.translate(p.x,p.y);
      ctx.rotate(p.rotation);
      if(p.shape==='circle'){
        ctx.beginPath(); ctx.arc(0,0,p.size,0,Math.PI*2); ctx.fill();
      } else {
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
      }
      ctx.restore();
    });
    if(alive) requestAnimationFrame(animate);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  animate();
}

// ── CONFETTI ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════
//  CREDITS + NEON BEAMS (replaces confetti/balloons)
// ═══════════════════════════════════════════════════════
function showCredits(onDone){
  const overlay = document.getElementById('credits-overlay');
  overlay.classList.add('visible');
  setTimeout(()=>{
    overlay.classList.remove('visible');
    setTimeout(()=>{ if(onDone) onDone(); }, 800);
  }, 8000);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize',()=>{
  if(document.getElementById('screen-game').classList.contains('active')){
    sizeWheel();
    if(G.puzzle) renderPuzzle();
  }
});


// ═══════════════════════════════════════════════════════
//  LEADERBOARD & NICKNAME UI
// ═══════════════════════════════════════════════════════

const DIFF_LABELS = {
  easy:'😊 MAKKELIJK', medium:'🧠 GEMIDDELD', hard:'💀 MOEILIJK', expert:'🔥 EXPERT'
};


// ── Play button handler ───────────────────────────────────────────────────────
function handlePlayButton(){
  const input = document.getElementById('nickname-input');
  const error = document.getElementById('nickname-error');
  const val   = input ? input.value.trim() : '';

  // Validate name first regardless of FB state
  const storedName = window.FB ? window.FB.getNickname() : null;
  if(!storedName){
    if(val.length < 3){
      error.textContent = 'Minimaal 3 tekens vereist om te spelen';
      input.focus(); return;
    }
    if(!/^[a-zA-Z0-9 _\-\.]+$/.test(val)){
      error.textContent = 'Alleen letters, cijfers en . _ - toegestaan';
      input.focus(); return;
    }
    error.textContent = '';
    if(window.FB) window.FB.setNickname(val);
    else localStorage.setItem('rvw_nickname', val.trim().toUpperCase());
  } else {
  }

  // Switch to game screen BEFORE showing the pinball overlay so the
  // title screen never flashes when the overlay closes
  initAudio();
  initState(selectedRounds);
  const labels={'easy':'😊 Makkelijk','medium':'🧠 Gemiddeld','hard':'💀 Moeilijk','expert':'🔥 Expert'};
  document.getElementById('diff-badge').textContent=labels[selectedDiff]||'Gemiddeld';
  showScreen('screen-game');
  sizeWheel();

  showPinball(G.difficulty || 'medium', ()=> startRound());
}

// ── Pre-fill nickname if already known ───────────────────────────────────────
window.addEventListener('load', ()=>{
  // Herstel rondes en moeilijkheidsgraad
  const savedRounds = localStorage.getItem('rvw_rounds');
  const savedDiff   = localStorage.getItem('rvw_diff');
  if(savedRounds){
    selectedRounds = parseInt(savedRounds);
    document.querySelectorAll('#rounds-sel .opt-btn').forEach(el=>{
      el.classList.toggle('sel', parseInt(el.dataset.r) === selectedRounds);
    });
  }
  if(savedDiff){
    selectedDiff = savedDiff;
    document.querySelectorAll('#diff-sel .opt-btn').forEach(el=>{
      el.classList.toggle('sel', el.dataset.d === selectedDiff);
    });
  }
  if(window.FB){
    // Wait a tick for FB module to init
    setTimeout(()=>{
      const name = window.FB.getNickname();
      const input = document.getElementById('nickname-input');
      if(name && input) input.value = name;
    }, 200);
  }
  drawWheel(0);
});

// ── Pre-game Top 5 — 2×2 grid, all difficulties ───────────────────────────────
let _pinballDismiss = null;

function dismissPinball(){
  if(_pinballDismiss) _pinballDismiss();
}

async function showPinball(difficulty, onDone){
  const overlay = document.getElementById('pinball-overlay');
  if(!overlay){ if(onDone) onDone(); return; }

  // Show overlay
  overlay.style.zIndex   = '9000';
  overlay.style.opacity  = '0';
  overlay.classList.add('visible');
  overlay.getBoundingClientRect();
  overlay.style.transition = 'opacity 0.5s ease';
  overlay.style.opacity    = '1';

  const hideOverlay = ()=>{
    if(!overlay.classList.contains('visible')) return;
    overlay.style.opacity='0';
    setTimeout(()=>{
      overlay.classList.remove('visible');
      overlay.style.opacity='';
      overlay.style.transition='';
      overlay.style.zIndex='';
      _pinballDismiss = null;
      if(onDone) onDone();
    }, 500);
  };

  _pinballDismiss = hideOverlay;
  // Fallback: hide after 8s maximum in case fetch hangs
  const fallbackTimer = setTimeout(hideOverlay, 8000);

  // Fetch all 4 in parallel
  const diffs = ['expert','hard','medium','easy'];
  const myName = window.FB ? window.FB.getNickname() : null;
  const rankIcons = ['🥇','🥈','🥉','4','5'];
  const rankClass = ['gold','silver','bronze','normal','normal'];

  function renderPb(id, entries){
    const el = document.getElementById('pb-q-' + id);
    if(!el) return;
    if(!entries || !entries.length){
      el.innerHTML = '<div class="lb-empty">Nog geen scores</div>'; return;
    }
    el.innerHTML = entries.slice(0,5).map((e,i)=>{
      const isMe = myName && e.name === myName;
      const rank = i < 3
        ? `<span class="lb-rank ${rankClass[i]}">${rankIcons[i]}</span>`
        : `<span class="lb-rank normal">${rankIcons[i]}</span>`;
      return `<div class="lb-entry${isMe?' lb-you':''}">
        ${rank}
        <span class="lb-name">${e.name}${isMe?' ◀':''}</span>
        <span class="lb-score">€${e.score.toLocaleString('nl-NL')}</span>
      </div>`;
    }).join('');
  }

  if(!window.FB){
    diffs.forEach(d => {
      const el = document.getElementById('pb-q-'+d);
      if(el) el.innerHTML = '<div class="lb-empty">Niet beschikbaar</div>';
    });
    clearTimeout(fallbackTimer);
    setTimeout(hideOverlay, 100);
    return;
  }

  const results = await Promise.allSettled(
    diffs.map(d => window.FB.fetchLeaderboard(d))
  );
  diffs.forEach((d, i) => {
    const entries = results[i].status === 'fulfilled' ? results[i].value : [];
    renderPb(d, entries);
  });
  // Scores zijn geladen — start hum en toon 2,5 seconden
  clearTimeout(fallbackTimer);
  setTimeout(hideOverlay, 2500);
}

// ── Retro synth hum (Web Audio) ───────────────────────────────────────────────
let _pinballHumNodes = [];
function playPinballHum(){
  // Korte xylofoon jingle — max 2 seconden, speelt één keer
  try {
    if(!AC || isMuted) return;
    // Oplopende melodie: C4 E4 G4 C5 (vrolijk game show gevoel)
    const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 523.25];
    const times = [0, 0.18, 0.36, 0.54, 0.82, 1.00];
    notes.forEach((freq, i) => {
      const osc  = AC.createOscillator();
      const gain = AC.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, AC.currentTime + times[i]);
      gain.gain.linearRampToValueAtTime(0.25, AC.currentTime + times[i] + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + times[i] + 0.28);
      osc.connect(gain); gain.connect(AC.destination);
      osc.start(AC.currentTime + times[i]);
      osc.stop(AC.currentTime + times[i] + 0.3);
      _pinballHumNodes.push({osc, gain});
    });
  } catch(e){}
}
function stopPinballHum(){ _pinballHumNodes = []; }

// ── Submit score + show win leaderboard overlay ───────────────────────────────
async function trySubmitScore(score, difficulty){
  if(!window.FB || !window.FB.submitScore) return;
  try {
    await window.FB.submitScore(difficulty, score);
    // Leaderboard wordt altijd getoond in endGame flow
  } catch(e){}
}

async function showWinLeaderboard(difficulty, myScore){
  return new Promise(async (resolve)=>{
    try {
      const overlay  = document.getElementById('lb-win-overlay');
      const list     = document.getElementById('lb-win-list');
      const diffLabel= document.getElementById('lb-win-diff-label');
      if(!overlay){ resolve(); return; }

      diffLabel.textContent = DIFF_LABELS[difficulty] || difficulty.toUpperCase();
      list.innerHTML = '<div class="lb-loading">Laden...</div>';
      overlay.style.opacity='0';
      overlay.classList.add('visible');
      overlay.style.transition='opacity 0.5s ease';
      requestAnimationFrame(()=>{ overlay.style.opacity='1'; });

      const myName = window.FB ? window.FB.getNickname() : null;
      let entries  = [];
      try { entries = await window.FB.fetchLeaderboard(difficulty); } catch(e){}

      const rankIcons = ['🥇','🥈','🥉'];
      const rankClass = ['gold','silver','bronze'];
      // myScore !== null = nieuwe score ingediend — highlight onze entry
      const justSubmitted = myScore !== null;
      list.innerHTML = entries.map((e,i)=>{
        const isMe = myName && e.name === myName;
        const isNew = isMe && justSubmitted;
        const rank = i < 3 ? `<span class="lb-rank ${rankClass[i]}">${rankIcons[i]}</span>`
                           : `<span class="lb-rank normal">${i+1}</span>`;
        return `<div class="lb-entry${isMe?' lb-you':''}${isNew?' lb-new-entry':''}">
          ${rank}
          <span class="lb-name">${e.name}${isNew?' ⟵ jij':''}</span>
          <span class="lb-score">€${e.score.toLocaleString('nl-NL')}</span>
        </div>`;
      }).join('');

      // Toon 3 seconden dan verberg en resolve
      setTimeout(()=>{
        overlay.style.opacity='0';
        setTimeout(()=>{
          overlay.classList.remove('visible');
          overlay.style.opacity='';
          overlay.style.transition='';
          overlay.style.zIndex='';
          resolve();
        }, 500);
      }, 3000);
    } catch(e){ resolve(); }
  });
}

// ── Menu leaderboard (2×2 grid, all difficulties) ────────────────────────────
function menuLeaderboard(){
  document.getElementById('menu-btn').classList.remove('open');
  document.getElementById('menu-dropdown').classList.remove('open');
  document.getElementById('modal-leaderboard').classList.add('open');
  loadAllLbQuadrants();
}
function closeLeaderboardModal(){
  document.getElementById('modal-leaderboard').classList.remove('open');
}

async function loadAllLbQuadrants(){
  const diffs = ['expert','hard','medium','easy'];
  const myName = window.FB ? window.FB.getNickname() : null;
  const rankIcons = ['🥇','🥈','🥉'];
  const rankClass = ['gold','silver','bronze'];

  function renderQuadrant(id, entries){
    const el = document.getElementById('lb-q-' + id);
    if(!entries || !entries.length){
      el.innerHTML = '<div class="lb-empty">Nog geen scores</div>'; return;
    }
    el.innerHTML = entries.slice(0,10).map((e,i)=>{
      const isMe = myName && e.name === myName;
      const rank = i < 3
        ? `<span class="lb-rank ${rankClass[i]}">${rankIcons[i]}</span>`
        : `<span class="lb-rank normal">${i+1}</span>`;
      return `<div class="lb-entry${isMe?' lb-you':''}">
        ${rank}
        <span class="lb-name">${e.name}${isMe?' ◀':''}</span>
        <span class="lb-score">€${e.score.toLocaleString('nl-NL')}</span>
      </div>`;
    }).join('');
  }

  if(!window.FB){
    diffs.forEach(d => {
      document.getElementById('lb-q-'+d).innerHTML = '<div class="lb-empty">Niet beschikbaar</div>';
    });
    return;
  }

  // Fetch all 4 in parallel
  const results = await Promise.allSettled(
    diffs.map(d => window.FB.fetchLeaderboard(d))
  );
  diffs.forEach((d, i) => {
    const entries = results[i].status === 'fulfilled' ? results[i].value : [];
    renderQuadrant(d, entries);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MULTIPLAYER — Rad van Woorden  v3
//  Architectuur: actie-gebaseerd
//  Elke speler voert acties lokaal uit EN pusht ze naar Firebase.
//  De andere speler ontvangt de actie en speelt hem na.
//  Zo hebben beide schermen altijd exact dezelfde staat.
//
//  Rollen:
//    host  = player1 = G.turn 'player'   in de spellogica
//    gast  = player2 = G.turn 'computer' in de spellogica
//
//  Acties die gesynchroniseerd worden:
//    coinflip  — wie begint de ronde
//    spin      — wiel resultaat (seg index)
//    guess     — letter geraden
//    vowel     — klinker gekocht
//    solve_ok  — puzzel correct opgelost
//    solve_bad — fout antwoord (beurt wisselt)
// ═══════════════════════════════════════════════════════════════════════════

// ── Hulpfuncties ─────────────────────────────────────────────────────────────
function mpIsMyTurn(){
  if(!window.MP) return false;
  return window.MP.myKey === 'player1' ? G.turn === 'player' : G.turn === 'computer';
}
function mpGetP1Nick(){
  // Host is altijd player1, gast is player2
  // sc-player-name = mijn naam, sc-comp-name = tegenstander naam
  if(window.MP && window.MP.myKey === 'player1')
    return document.getElementById('sc-player-name').textContent || 'SPELER 1';
  return document.getElementById('sc-comp-name').textContent || 'SPELER 1';
}
function mpGetP2Nick(){
  if(window.MP && window.MP.myKey === 'player2')
    return document.getElementById('sc-player-name').textContent || 'SPELER 2';
  return document.getElementById('sc-comp-name').textContent || 'SPELER 2';
}
function mpGetMyNick(){ return window.MP.myKey === 'player1' ? mpGetP1Nick() : mpGetP2Nick(); }
function mpGetOppNick(){ return window.MP.myKey === 'player1' ? mpGetP2Nick() : mpGetP1Nick(); }

// ── MP variabelen ─────────────────────────────────────────────────────────────
let mpUnlisten       = null;
let mpLastActionTs   = 0;
let mpPresenceTimer  = null;
let mpOppLastSeen    = Date.now();
let mpDisconnectWarned = false;
let mpProcessingAction = false; // voorkomt echo van eigen acties

// ── Lobby ────────────────────────────────────────────────────────────────────
function openMpLobby(){
  document.getElementById('mp-status').textContent = '';
  document.getElementById('mp-code-input').value = '';
  document.getElementById('modal-mp-lobby').classList.add('open');
}
function closeMpLobby(){
  document.getElementById('modal-mp-lobby').classList.remove('open');
}
function menuMultiplayer(){ closeMenu(); openMpLobby(); }
function mpStatus(msg){ document.getElementById('mp-status').textContent = msg; }

// ── Kamer aanmaken ────────────────────────────────────────────────────────────
async function mpCreateRoom(){
  if(!window.MPapi){ mpStatus('Multiplayer niet beschikbaar.'); return; }
  mpStatus('Kamer aanmaken...');
  try {
    const code = await window.MPapi.createRoom(selectedRounds, selectedDiff);
    closeMpLobby();
    document.getElementById('mp-room-code').textContent = code;
    document.getElementById('mp-waiting-status').textContent = '';
    document.getElementById('modal-mp-waiting').classList.add('open');
    mpUnlisten = window.MPapi.listenRoom(code, room => {
      if(room.status === 'playing' && room.player2){
        if(mpUnlisten){ mpUnlisten(); mpUnlisten = null; }
        document.getElementById('mp-waiting-status').textContent =
          '✓ ' + room.player2.nick + ' heeft gejoined!';
        setTimeout(() => {
          document.getElementById('modal-mp-waiting').classList.remove('open');
          mpStartGame(code, room);
        }, 1200);
      }
    });
  } catch(e){ mpStatus('Fout: ' + e.message); }
}

// ── Kamer joinen ──────────────────────────────────────────────────────────────
async function mpJoinRoom(){
  if(!window.MPapi){ mpStatus('Multiplayer niet beschikbaar.'); return; }
  const code = document.getElementById('mp-code-input').value.toUpperCase().trim();
  if(code.length !== 4){ mpStatus('Voer een geldige 4-letter code in.'); return; }
  mpStatus('Verbinden...');
  try {
    const room = await window.MPapi.joinRoom(code);
    closeMpLobby();
    // window.MP.myKey is nu correct gezet door joinRoom()
    const myNick = localStorage.getItem('rvw_nickname') || 'SPELER 2';
    const fullRoom = { ...room, status:'playing', player2:{ nick: myNick, score:0 } };
    // Kleine vertraging zodat window.MP volledig geïnitialiseerd is
    setTimeout(() => mpStartGame(code, fullRoom), 50);
  } catch(e){ mpStatus('Fout: ' + e.message); }
}

// ── Wachten annuleren ─────────────────────────────────────────────────────────
async function mpCancelWaiting(){
  if(mpUnlisten){ mpUnlisten(); mpUnlisten = null; }
  if(window.MP && window.MP.roomCode) await window.MPapi.closeRoom(window.MP.roomCode);
  document.getElementById('modal-mp-waiting').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════
//  SPEL STARTEN
// ═══════════════════════════════════════════════════════════════════════════
function mpStartGame(code, room){
  if(mpUnlisten){ mpUnlisten(); mpUnlisten = null; }

  // Namen instellen in scorekaarten
  const p1nick = room.player1 ? room.player1.nick : 'SPELER 1';
  const p2nick = room.player2 ? room.player2.nick : 'SPELER 2';
  // window.MP.myKey moet hier correct zijn — host=player1, gast=player2
  const isHost = window.MP && window.MP.myKey === 'player1';
  const myNick  = isHost ? p1nick : p2nick;
  const oppNick = isHost ? p2nick : p1nick;
  document.getElementById('sc-player-name').textContent = myNick;
  document.getElementById('sc-comp-name').textContent   = oppNick;
  // Ook eindscherm namen updaten
  const goP = document.querySelector('#go-p .fsc-name');
  const goC = document.querySelector('#go-c .fsc-name');
  if(goP) goP.textContent = myNick;
  if(goC) goC.textContent = oppNick;

  // Spelstaat initialiseren — gebruik room.difficulty zodat gast dezelfde moeilijkheid heeft
  initAudio();
  selectedDiff = room.difficulty || selectedDiff; // sync moeilijkheidsgraad met host
  initState(room.rounds || selectedRounds, selectedDiff);
  G.mpMode  = true;
  G.mpCode  = code;
  G.mpMyKey = window.MP ? window.MP.myKey : null;

  const labels = {'easy':'😊 Makkelijk','medium':'🧠 Gemiddeld','hard':'💀 Moeilijk','expert':'🔥 Expert'};
  document.getElementById('diff-badge').textContent = labels[room.difficulty] || 'Gemiddeld';

  showScreen('screen-game');
  sizeWheel();
  // Verberg moeilijkheidsgraad badge in MP — niet relevant
  document.getElementById('diff-badge').style.display = 'none';
  mpStartPresence(code);

  // Luister naar acties
  mpUnlisten = window.MPapi.listenRoom(code, mpOnRoomUpdate);

  // Direct locked zetten zodat computerTurn nooit kan starten
  G.locked = true;

  // Host start de eerste ronde
  if(window.MP && window.MP.role === 'host'){
    startRound();
    // FIX: Wacht 1.2s zodat round_start Firebase event niet overschreven wordt door coinflip
    setTimeout(() => mpDoCoinFlip(), 1200);
  } else {
    setBanner('Verbonden! Wachten op eerste ronde...', 'empty');
    updateTurnUI();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MUNTGOOIEN — wie begint elke ronde
// ═══════════════════════════════════════════════════════════════════════════
function mpDoCoinFlip(){
  // Alleen host bepaalt wie begint
  if(window.MP.role !== 'host') return;
  const starter = Math.random() < 0.5 ? 'player1' : 'player2';
  mpPushAction({ type:'coinflip', starter });
  mpApplyCoinFlip(starter);
}

function mpApplyCoinFlip(starter){
  // Zet beurt — host='player', gast='computer' altijd
  G.turn   = (starter === 'player1') ? 'player' : 'computer';
  G.locked = !mpIsMyTurn();
  G.phase  = 'spin';

  // Zet categorie opnieuw — voor zekerheid na alle Firebase events
  if(G.puzzle && G.puzzle.c){
    document.getElementById('cat-display').textContent = G.puzzle.c;
  }

  const starterNick = starter === 'player1' ? mpGetP1Nick() : mpGetP2Nick();
  setBanner('🪙 ' + starterNick + ' begint!', 'money');
  setTimeout(() => {
    setBanner(mpIsMyTurn() ? 'Jouw beurt! Draai het rad.' : 'Tegenstander is aan de beurt...', mpIsMyTurn() ? 'money' : 'empty');
    updateTurnUI();
  }, 1500);
  updateTurnUI();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIE PUSHEN — stuur jouw actie naar Firebase
// ═══════════════════════════════════════════════════════════════════════════
function mpPushAction(action){
  if(!G.mpCode) return;
  window.MPapi.pushAction(G.mpCode, {
    ...action,
    from: window.MP.myKey,
    ts:   Date.now(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  FIREBASE LUISTEREN — ontvang acties van de tegenstander
// ═══════════════════════════════════════════════════════════════════════════
function mpOnRoomUpdate(room){
  if(!room) return;

  // Presence bijhouden via heartbeat pad
  const oppKey = window.MP.myKey === 'player1' ? 'player2' : 'player1';
  if(room.heartbeat && room.heartbeat[oppKey]){
    mpOppLastSeen = Date.now();
    mpDisconnectWarned = false;
  }

  // Actie verwerken
  if(!room.action) return;
  const a = room.action;

  // Sla eigen acties over (echo preventie)
  if(a.from === window.MP.myKey) return;
  // Sla verouderde acties over
  if(a.ts <= mpLastActionTs) return;
  mpLastActionTs = a.ts;

  // Presence bijhouden via actie ook
  mpOppLastSeen = Date.now();
  mpDisconnectWarned = false;

  // Verwerk de actie van de tegenstander
  mpProcessOppAction(a);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIE VERWERKEN — speel de actie van de tegenstander na
// ═══════════════════════════════════════════════════════════════════════════
function mpProcessOppAction(a){
  // Bepaal wie de tegenstander is in de spellogica
  const oppTurn = window.MP.myKey === 'player1' ? 'computer' : 'player';

  // Zet vlag zodat switchTurn geen echo terugstuurt
  G.mpSuppressActionPush = true;

  switch(a.type){

    case 'coinflip':
      mpApplyCoinFlip(a.starter);
      break;

    case 'spin':
      // Tegenstander heeft gedraaid — exacte segment-index forceren
      G.locked = true;
      if(a.startRot !== undefined) wheelRot = a.startRot;
      doSpin(oppTurn, a.totalRot, a.targetFsi);
      break;

    case 'guess':
      // Tegenstander heeft een letter geraden
      processGuess(a.letter, oppTurn);
      break;

    case 'vowel':
      // Tegenstander heeft een klinker gekocht
      processGuess(a.letter, oppTurn);
      break;

    case 'solve_ok':
      // Tegenstander heeft correct opgelost
      G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
      renderPuzzle();
      endRound(oppTurn);
      break;

    case 'solve_bad':
      // Tegenstander heeft fout geraden — wacht op switch_turn Firebase event
      setBanner('❌ ' + mpGetOppNick() + ' raadde fout!', 'bad');
      // GEEN lokale switchTurn — switch_turn event van Firebase regelt dit
      break;

    case 'round_start':
      if(window.MP && window.MP.myKey === 'player2'){
        G.puzzle = PUZZLES[a.puzzleIdx];
        G.revealed = new Set();
        G.usedLetters = new Set();
        G.roundScore = {player:0, computer:0};
        G.phase = 'spin'; // Reset fase — anders blokkeert 'ended' guard de volgende ronde
        G.spinning = false; G.locked = true; G.hasGuessed = false;
        G.bonusVal = 0; G.onBonus = false;
        G.round = a.round;
        G.roundType = a.roundType || 'normal';

        // Klinkerkosten instellen voor de gast
        G.vowelCost = (G.roundType === 'gold') ? 500 : 250;
        const vBtn = document.getElementById('btn-vowel');
        if(vBtn) vBtn.innerHTML = 'KLINKER<br><small>€' + G.vowelCost + '</small>';

        if(a.activeSegs){
          activeSegs = Array.isArray(a.activeSegs) ? a.activeSegs : Object.values(a.activeSegs);
        } else {
          activeSegs = SEGS.slice();
          if(G.roundType === 'chrome') mpApplyBonusSegs('chrome');
          else if(G.roundType === 'gold') mpApplyBonusSegs('gold');
        }
        document.getElementById('cat-display').textContent = G.puzzle.c;
        renderPuzzle();
        buildKeyboard();
        updateScores();
        drawWheel(wheelRot);

        const pill = document.getElementById('round-pill');
        if(G.roundType === 'gold'){
          pill.innerHTML = '<span class="star-gold">★</span> Goud Bonus Ronde ' + G.round + ' van ' + G.maxRounds;
          pill.style.background = 'linear-gradient(135deg,#7a4800,#c97d00,#f5c518,#c97d00,#7a4800)';
          pill.style.color = '#3a1a00'; pill.style.borderColor = '#c97d00';
        } else if(G.roundType === 'chrome'){
          pill.innerHTML = '<span class="star-silver">★</span> Zilver Bonus Ronde ' + G.round + ' van ' + G.maxRounds;
          pill.style.background = 'linear-gradient(135deg,#c8d6e0,#f0f4f7,#c8d6e0)';
          pill.style.color = '#1a1a2a'; pill.style.borderColor = '#8a9ba8';
        } else {
          pill.textContent = 'Ronde ' + G.round + ' van ' + G.maxRounds;
          pill.style.background=''; pill.style.color=''; pill.style.borderColor='';
        }

        // FIX 3: Gast ziet ook de bonus ronde aankondiging
        if(G.roundType !== 'normal'){
          G.locked = true;
          let title, body, icon;
          if(G.roundType === 'gold'){
            title = '<span class="star-gold">★</span> Goud Bonus Ronde!';
            body  = 'Een gouden BONUS-vak (+€5.000) en een zilveren BONUS-vak (+€2.500) staan op het rad. Er zijn ook twee <span class="star-blue">★</span> JOKER-vakken en één Min-vak in het spel — het Min-vak kost je 50% van je rondeverdiensten. Land op een BONUS-vak en raad een medeklinker om het te incasseren! Klinkers kosten €500 in deze ronde!';
            icon  = '👑';
          } else {
            title = '<span class="star-silver">★</span> Zilver Bonus Ronde!';
            body  = 'Er verschijnt een zilveren BONUS-vak (+€2.500) op het rad! Land op BONUS en raad een medeklinker goed om het te incasseren! Pas op voor het Min-vak — dat kost je 50% van je rondeverdiensten!';
            icon  = '🥈';
          }
          setTimeout(()=>{
            const theme = G.roundType==='gold'?'gold':'silver';
            showResult(title, body, icon, false,
              ()=>{ G.locked = !mpIsMyTurn(); updateTurnUI(); },
              theme
            );
          }, 300);
        }
      }
      break;

    case 'switch_turn':
      // Tegenstander heeft beurt gewisseld — update mijn UI
      G.turn   = a.turn;
      G.phase  = 'spin';
      G.spinVal = 0;
      G.hasGuessed = false;
      G.locked = !mpIsMyTurn();
      setBanner(mpIsMyTurn() ? 'Jouw beurt! Draai het rad.' : 'Tegenstander is aan de beurt...', mpIsMyTurn() ? 'money' : 'empty');
      updateTurnUI();
      break;

    case 'joker_pick':
      // Tegenstander heeft via Joker een letter onthuld
      handleJoker(oppTurn, a.letter);
      break;

    case 'phase_update':
      // Actieve speler informeert gast over fase wijziging na draaien
      G.phase      = a.phase;
      G.hasGuessed = a.hasGuessed;
      G.locked     = !mpIsMyTurn();
      updateTurnUI();
      break;

    case 'heartbeat':
      // Aanwezigheid bevestigd — al verwerkt via mpOppLastSeen
      break;
  }
  // Reset vlag
  G.mpSuppressActionPush = false;
}

// ── Bonus segs toepassen op gast ─────────────────────────────────────────────
function mpApplyBonusSegs(type){
  const segs = BONUS_SEGS[type];
  if(!segs) return;
  // Inject bonus segs op dezelfde posities als host
  const avail = activeSegs.map((s,i)=>({s,i})).filter(x=>typeof x.s.val==='number');
  segs.forEach((seg,j)=>{ if(avail[j]) activeSegs[avail[j].i] = seg; });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRESENCE — verbindingsbewaking
// ═══════════════════════════════════════════════════════════════════════════
function mpStartPresence(code){
  mpOppLastSeen = Date.now();
  mpDisconnectWarned = false;
  if(mpPresenceTimer) clearInterval(mpPresenceTimer);
  mpPresenceTimer = setInterval(() => {
    if(!G.mpCode) return;
    // Heartbeat schrijft naar apart pad zodat het spelacties niet overschrijft
    if(G.mpCode) window.MPapi.pushHeartbeat(G.mpCode, window.MP.myKey);
    const elapsed = Date.now() - mpOppLastSeen;
    if(elapsed > 30000 && !mpDisconnectWarned){
      mpDisconnectWarned = true;
      setBanner('⚠️ Verbinding tegenstander verbroken...', 'neutral');
    } else if(elapsed > 60000){
      mpHandleDisconnect();
    }
  }, 10000);
}

function mpHandleDisconnect(){
  clearInterval(mpPresenceTimer);
  if(mpUnlisten){ mpUnlisten(); mpUnlisten = null; }

  showResult(
    'Verbinding verbroken',
    'De tegenstander is meer dan 60 seconden offline. Het spel wordt beëindigd.',
    '📡', false,
    () => { mpCleanup(); showScreen('screen-title'); },
    null
  );
}

// ── Afsluiten ────────────────────────────────────────────────────────────────
async function mpCleanup(){
  if(mpPresenceTimer){ clearInterval(mpPresenceTimer); mpPresenceTimer = null; }
  if(mpUnlisten){ mpUnlisten(); mpUnlisten = null; }
  // Reset namen en UI terug naar single player
  document.getElementById('sc-player-name').textContent = 'JIJ';
  document.getElementById('sc-comp-name').textContent   = 'COMPUTER';
  document.getElementById('diff-badge').style.display   = '';
  const goP = document.querySelector('#go-p .fsc-name');
  const goC = document.querySelector('#go-c .fsc-name');
  if(goP) goP.textContent = 'JIJ';
  if(goC) goC.textContent = 'COMPUTER';
  if(G.mpCode) await window.MPapi.closeRoom(G.mpCode);
  if(window.MP){ window.MP.active = false; window.MP.roomCode = null; }
  G.mpMode = false; G.mpCode = null;
}
