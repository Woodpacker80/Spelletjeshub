const VOWELS = new Set(['A','E','I','O','U']);
const VOWEL_COST = 250;
const FREQ_ORDER = 'NETSRLADGOIKMHBVPUWCFZJYXQ'.split('');

// ── DIFFICULTY CONFIG ─────────────────────────────────────────────────────
const DIFF = {
  easy: {
    freq:       'BCDFGHJKLMPQRSTVWXYZ'.split(''), // rare letters first — computer guesses poorly
    smart:      0.25,   // chance of picking a letter actually in the puzzle
    vowel:      0.08,   // chance of buying a vowel
    vowelMin:   0.50,   // min % revealed before buying vowels
    solve:      0.90,   // % revealed before attempting to solve
    solveChance:0.40,
    thinkDelay: 1400,
  },
  medium: {
    freq:       FREQ_ORDER,
    smart:      0.60,
    vowel:      0.25,
    vowelMin:   0.25,
    solve:      0.68,
    solveChance:0.60,
    thinkDelay: 1100,
  },
  hard: {
    freq:       'ENATIORDSLGKMPBVHWZFJYXQ'.split(''), // strict Dutch frequency
    smart:      0.90,
    vowel:      0.65,   // aggressively buys vowels
    vowelMin:   0.15,
    solve:      0.45,   // attempts solve early
    solveChance:0.80,
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

function toggleMute(){
  isMuted = !isMuted;
  const btn = document.getElementById('mute-btn');
  btn.textContent = isMuted ? '🔇' : '🔊';
  btn.classList.toggle('muted', isMuted);
}

function initAudio(){
  if(AC) return;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
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
      tile.style.boxShadow='0 0 14px rgba(245,197,24,0.8),0 0 28px rgba(245,197,24,0.4)';
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
  });
});

document.querySelectorAll('#diff-sel .opt-btn').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#diff-sel .opt-btn').forEach(x=>x.classList.remove('sel'));
    el.classList.add('sel');
    selectedDiff=el.dataset.d;
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
  const labels={'easy':'😊 Makkelijk','medium':'🧠 Gemiddeld','hard':'💀 Moeilijk'};
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
  const qs=document.getElementById('screen-quit');
  const btn=document.getElementById('quit-play-btn');
  btn.style.opacity='0'; btn.style.pointerEvents='none';
  qs.classList.add('visible');
  launchBalloons(); spawnQuitConfetti();
  setTimeout(()=>{
    qs.classList.remove('visible');
    document.getElementById('balloons-container').innerHTML='';
    document.querySelectorAll('.quit-confetti').forEach(e=>e.remove());
    showScreen('screen-title');
  }, 2000);
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
  const qs=document.getElementById('screen-quit');
  const btn=document.getElementById('quit-play-btn');
  btn.style.opacity='0'; btn.style.pointerEvents='none';
  qs.classList.add('visible');
  launchBalloons(); spawnQuitConfetti();
  setTimeout(()=>{
    qs.classList.remove('visible');
    document.getElementById('balloons-container').innerHTML='';
    document.querySelectorAll('.quit-confetti').forEach(e=>e.remove());
    showScreen('screen-title');
  }, 2000);
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
  showQuitScreen();
}

// ── STOP SCHERM ───────────────────────────────────────────────────────────────
function showQuitScreen(){
  const qs=document.getElementById('screen-quit');
  const btn=document.getElementById('quit-play-btn');
  btn.style.opacity='0'; btn.style.pointerEvents='none';
  qs.classList.add('visible');
  launchBalloons(); spawnQuitConfetti();
  setTimeout(()=>{ btn.style.opacity='1'; btn.style.pointerEvents='auto'; }, 3000);
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
      g.addColorStop(0,   '#c97d00');
      g.addColorStop(0.25,'#c97d00');
      g.addColorStop(0.45,'#f5c518');
      g.addColorStop(0.50,'#fff8d0');
      g.addColorStop(0.55,'#f5c518');
      g.addColorStop(0.75,'#c97d00');
      g.addColorStop(1,   '#c97d00');
      ctx.fillStyle=g;
      sparkleSegs.push({sa,ea,type:'gold'});

    } else if(seg.val==='BONUS_CHROME'||seg.val==='JOKER'){
      const g=ctx.createLinearGradient(cx-r,cy,cx+r,cy);
      g.addColorStop(0,   '#7a9ab0');
      g.addColorStop(0.25,'#7a9ab0');
      g.addColorStop(0.45,'#c8dce8');
      g.addColorStop(0.50,'#ffffff');
      g.addColorStop(0.55,'#c8dce8');
      g.addColorStop(0.75,'#7a9ab0');
      g.addColorStop(1,   '#7a9ab0');
      ctx.fillStyle=g;
      sparkleSegs.push({sa,ea,type:'chrome'});

    } else if(seg.val==='MINUS'){
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      g.addColorStop(0,   '#1a0000');
      g.addColorStop(0.5, '#8b0000');
      g.addColorStop(1,   '#e63946');
      ctx.fillStyle=g;
      sparkleSegs.push({sa,ea,type:'minus'});

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

    } else if(seg.val==='BONUS_CHROME'){
      // Gouden tekst op zilveren vak
      ctx.shadowColor='rgba(80,40,0,0.7)'; ctx.shadowBlur=5;
      ctx.fillStyle='#f5c518';
      ctx.font='bold '+fs+'px Oswald,sans-serif';
      ctx.fillText('BONUS',r-6,fs*0.37);

    } else if(seg.val==='JOKER'){
      // Gouden tekst op zilveren vak
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
  if(G.usedIdx.size>=PUZZLES.length) G.usedIdx.clear();
  let idx; do{ idx=Math.floor(Math.random()*PUZZLES.length); }while(G.usedIdx.has(idx));
  G.usedIdx.add(idx); return PUZZLES[idx];
}

function startRound(){
  G.round++;
  if(G.round>G.maxRounds){ endGame(); return; }
  G.puzzle=pickPuzzle();
  G.revealed=new Set(); G.usedLetters=new Set(); G.spinVal=0;
  G.roundScore.player=0; G.roundScore.computer=0;
  G.phase='spin'; G.spinning=false; G.locked=false;
  G.suddenDeath=false; G.sdVowelsQueue=[]; clearTimeout(G.sdInterval);
  G.turn='player'; G.bonusVal=0; G.onBonus=false;

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
    // Plaats Goud BONUS, Zilver BONUS en twee Min-vakken in geldposities
    base[shuffled[0]] = BONUS_SEGS.gold[0];
    base[shuffled[1]] = BONUS_SEGS.chrome[0];
    base[shuffled[2]] = BONUS_SEGS.gold[1];   // MINUS
    base[shuffled[3]] = { lbl:'MINUS', val:'MINUS', col:'#c0392b' };
    activeSegs = base;

  } else {
    activeSegs = [...SEGS];
  }
  drawWheel(wheelRot);

  // ── Vooraf onthuld ──────────────────────────────────────────────────────
  const preReveal = G.difficulty==='easy' ? ['R','S','T','L'] :
                    G.difficulty==='medium' ? ['R','S'] : [];
  preReveal.forEach(l=>{
    G.usedLetters.add(l);
    for(let i=0;i<G.puzzle.a.length;i++) if(G.puzzle.a[i]===l) G.revealed.add(i);
  });

  // ── Rondepil ────────────────────────────────────────────────────────────
  const pill = document.getElementById('round-pill');
  if(roundType === 'gold'){
    pill.textContent = '👑 Goudronde ' + G.round + ' van ' + G.maxRounds;
    pill.style.background = 'linear-gradient(135deg,#7a4800,#c97d00,#f5c518,#c97d00,#7a4800)';
    pill.style.color = '#3a1a00'; pill.style.borderColor = '#c97d00';
  } else if(roundType === 'chrome'){
    pill.textContent = '⭐ Zilverronde ' + G.round + ' van ' + G.maxRounds;
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
      title = '👑 Goudronde!';
      body  = 'Een gouden BONUS-vak (+€5.000) staat naast Bankrupt en een zilveren BONUS-vak (+€2.500) staat ook op het rad. Land op BONUS en raad een medeklinker goed om het te incasseren! Één Beurt Verlies wordt een Min-vak (−50%). Klinkers kosten €500 in deze ronde!';
      icon  = '👑';
    } else {
      title = '🥈 Zilverronde!';
      body  = 'Er verschijnt een zilveren BONUS-vak (+€2.500) op het rad! Land op BONUS en raad een medeklinker goed om het te incasseren! Pas op voor het Min-vak — dat kost je 50% van je rondeverdiensten!';
      icon  = '🥈';
    }
    setTimeout(()=>{
      const theme = roundType==='gold'?'gold':'silver';
      showResult(title, body, icon, false,
        ()=>{ G.locked=false; updateTurnUI(); if(G.turn==='computer') setTimeout(computerTurn,1600); },
        theme
      );
    }, 300);
  } else {
    if(G.turn==='computer') setTimeout(computerTurn,1600);
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
  for(let tw=26; tw>=18; tw--){
    const rowW = longestWord * tw + (longestWord-1) * gap;
    if(rowW <= availW){ tileW = tw; break; }
    tileW = 18; // absolute minimum
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
      const delay=count*90;
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
    if(G.turn!=='player'||G.locked){ k.style.pointerEvents='none'; k.style.opacity='0.3'; return; }
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
  const isP=G.turn==='player';
  document.getElementById('sc-player').classList.toggle('active-turn',isP);
  document.getElementById('sc-comp').classList.toggle('active-turn',!isP);
  document.getElementById('btn-spin').disabled=!(isP&&G.phase==='spin'&&!G.locked&&!G.suddenDeath);
  document.getElementById('btn-vowel').disabled=!(isP&&(G.phase==='spin'||G.phase==='guess')&&!G.locked&&G.roundScore.player>=(G.vowelCost||VOWEL_COST)&&hasUnrevealedVowels()&&!G.suddenDeath);
  document.getElementById('btn-solve').disabled=!(isP&&!G.locked);
  updateKeyInteractivity();
}

function updateScores(){
  document.getElementById('p-round').textContent='€'+G.roundScore.player.toLocaleString('nl-NL');
  document.getElementById('c-round').textContent='€'+G.roundScore.computer.toLocaleString('nl-NL');
  document.getElementById('p-total').textContent='Totaal €'+G.totalScore.player.toLocaleString('nl-NL');
  document.getElementById('c-total').textContent='Totaal €'+G.totalScore.computer.toLocaleString('nl-NL');
}

function setBanner(text,cls){
  const b=document.getElementById('spin-banner');
  b.className='spin-banner '+(cls||'empty'); b.textContent=text||'';
}

function showThinking(v){ document.getElementById('think-bar').classList.toggle('show',v); }

function switchTurn(){
  // Check if game is stuck before switching
  if(isGameStuck()){
    startSuddenDeath();
    return;
  }
  G.turn=G.turn==='player'?'computer':'player';
  G.phase='spin'; G.spinVal=0; G.locked=false;
  setBanner('','empty'); updateTurnUI();
  if(G.turn==='computer') setTimeout(computerTurn,1200);
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
  const delay = count > 0 ? (count * 90 + 400) : 400;
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
  if(G.spinning||G.turn!=='player'||G.phase!=='spin'||G.locked) return;
  doSpin('player');
}

function doSpin(who){
  G.spinning=true; G.locked=true; updateTurnUI();
  const totalRot=(7+Math.random()*8)*Math.PI*2;
  const dur=4000+Math.random()*1200; // extended for quintic tail
  const t0=performance.now(), startRot=wheelRot;
  let lastSeg=-1;

  function frame(now){
    const elapsed=now-t0, prog=Math.min(elapsed/dur,1);
    const ease=1-Math.pow(1-prog,5); // quintic ease-out — dramatic tail
    const curRot=startRot+totalRot*ease;
    drawWheel(curRot);

    // Tick sound — same precise method as reference game
    const norm=((curRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const _tlen=(activeSegs.length||SEGS.length);
    const segArc=(2*Math.PI)/_tlen;
    const si=Math.floor((((-norm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/segArc)%_tlen;
    if(si!==lastSeg){ lastSeg=si; sndTick(); }

    if(prog<1){ requestAnimationFrame(frame); return; }
    G.spinning=false;
    const fRot=startRot+totalRot;
    const fNorm=((fRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const pAngle=(((-fNorm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const _segs=activeSegs.length?activeSegs:SEGS;
    const fsi=Math.floor((pAngle/(2*Math.PI))*_segs.length)%_segs.length;
    onLanded(_segs[fsi],who);
  }
  requestAnimationFrame(frame);
}

function onLanded(seg,who){
  if(seg.val==='BANKRUPT'){
    sndBankrupt(); setBanner('💸 FAILLIET!','bad');
    G.roundScore[who]=0; updateScores();
    setTimeout(()=>showResult(
      who==='player'?'💸 FAILLIET!':'🤖 Failliet!',
      (who==='player'?'Je verliest':'Computer verliest')+' alle rondeverdiensten!',
      '😱',false,()=>switchTurn()),500);

  } else if(seg.val==='LOSE'){
    sndWrong(); setBanner('😬 BEURT VERLIES','neutral');
    setTimeout(()=>showResult(
      who==='player'?'😬 Beurt Verlies':'🤖 Beurt Verlies',
      (who==='player'?'Je verliest':'Computer verliest')+' deze beurt!',
      '😞',false,()=>switchTurn()),500);

  } else if(seg.val==='MINUS'){
    const verloren = Math.floor(G.roundScore[who] / 2);
    G.roundScore[who] = Math.max(0, G.roundScore[who] - verloren);
    updateScores(); sndMinus(); flashScreenRed();
    setBanner('🔻 MINUS! -50% ronde!','bad');
    const verlorenStr = '€' + verloren.toLocaleString('nl-NL');
    setTimeout(()=>showResult(
      who==='player'?'🔻 Minus!':'🤖 Minus!',
      (who==='player'?'Je verliest':'Computer verliest')+' '+verlorenStr+' van de rondeverdiensten!',
      '😱',false,()=>switchTurn()),600);

  } else if(seg.val==='BONUS_CHROME'){
    G.spinVal=800; G.bonusVal=2500; G.onBonus=true;
    sndBonusLand(); flashBonusHub();
    setBanner('🥈 ZILVER BONUS — raad een letter!','bonus');
    G.locked=true; updateTurnUI();
    setTimeout(()=>{
      G.phase='guess'; G.locked=false; updateTurnUI();
      if(who!=='player') setTimeout(()=>computerGuessConsonant(),600);
    },1800);

  } else if(seg.val==='BONUS_GOLD'){
    G.spinVal=800; G.bonusVal=5000; G.onBonus=true;
    sndGoldLand(); flashGoldHub();
    setBanner('👑 GOUD BONUS — raad een letter!','bonus-gold');
    G.locked=true; updateTurnUI();
    setTimeout(()=>{
      G.phase='guess'; G.locked=false; updateTurnUI();
      if(who!=='player') setTimeout(()=>computerGuessConsonant(),600);
    },2000);

  } else if(seg.val==='JOKER'){
    handleJoker(who);

  } else {
    G.spinVal=seg.val; G.bonusVal=0; G.onBonus=false;
    setBanner('💰 '+seg.lbl+' per letter','money');
    G.phase='guess'; G.locked=false;
    if(who==='player') updateTurnUI();
    else setTimeout(()=>computerGuessConsonant(),1100);
  }
}

// ── JOKER HANDLER ─────────────────────────────────────────────────────────────
function handleJoker(who){
  G.spinVal = 1000;
  G.locked = true;
  setBanner('👑 JOKER! Een willekeurige letter wordt onthuld!','bonus');
  sndBonusLand();

  const unrevealed = [];
  for(let i=0;i<G.puzzle.a.length;i++){
    const ch = G.puzzle.a[i];
    if(ch !== ' ' && !G.revealed.has(i) && !G.usedLetters.has(ch)){
      if(!unrevealed.includes(ch)) unrevealed.push(ch);
    }
  }

  if(unrevealed.length === 0){
    setBanner('🃏 Joker — geen letters meer! Beurt gaat door.','money');
    setTimeout(()=>{
      G.locked = false; G.phase = 'spin'; G.spinVal = 0;
      updateTurnUI();
      if(who !== 'player') setTimeout(()=>computerTurn(), 1000);
    }, 1500);
    return;
  }

  const letter = unrevealed[Math.floor(Math.random() * unrevealed.length)];
  G.usedLetters.add(letter);

  setTimeout(()=>{
    const count = animateReveal(letter);
    markKey(letter, count > 0);
    const earn = 1000;
    G.roundScore[who] += earn;
    updateScores();
    setBanner('👑 JOKER! ' + letter + (count > 0 ? ' ×' + count : '') + ' — +€1.000!','money');

    const delay = count > 0 ? (count * 90 + 500) : 500;
    setTimeout(()=>{
      if(isPuzzleSolved()){ endRound(who); return; }
      G.locked = false; G.phase = 'spin'; G.spinVal = 0; G.onBonus = false;
      updateTurnUI();
      if(who !== 'player') setTimeout(()=>computerTurn(), 1000);
    }, delay);
  }, 1200);
}

// ── SPELER ACTIES ─────────────────────────────────────────────────────────────
function handleKeyPress(letter){
  if(G.turn!=='player'||G.locked||G.usedLetters.has(letter)) return;
  if(G.phase==='guess'&&VOWELS.has(letter)) return;
  if(G.phase==='buy_vowel'&&!VOWELS.has(letter)) return;
  if(G.phase!=='guess'&&G.phase!=='buy_vowel') return;
  processGuess(letter,'player');
}

function handleBuyVowel(){
  if(G.turn!=='player'||(G.phase!=='spin'&&G.phase!=='guess')||G.locked) return;
  if(G.roundScore.player<(G.vowelCost||VOWEL_COST)||!hasUnrevealedVowels()) return;
  G.phase='buy_vowel'; G.spinVal=0; G.locked=false;
  setBanner('🔤 Kies een klinker — kost €' + (G.vowelCost||VOWEL_COST),'money');
  updateTurnUI();
}

function processGuess(letter,who){
  if(G.usedLetters.has(letter)) return;
  G.usedLetters.add(letter); G.locked=true;
  const isVowel=VOWELS.has(letter);
  const count=animateReveal(letter), hit=count>0;
  if(isVowel&&who==='player') G.roundScore.player-=(G.vowelCost||VOWEL_COST);
  if(!isVowel&&hit){
    const letterEarn = count * G.spinVal;
    const bonusEarn  = G.onBonus ? (G.bonusVal||0) : 0;
    G.roundScore[who] += letterEarn + bonusEarn;
  }
  updateScores();
  markKey(letter,hit&&G.puzzle.a.includes(letter));
  const delay=hit?(count*90+250):250;

  if(hit){
    if(G.onBonus){
      if(G.roundType==='gold') sndGoldHit(); else sndBonusHit();
      setTimeout(()=>{ shimmerRevealedTiles(); spawnSparkleParticles(); }, count*90+50);
    } else { sndCorrect(); }
  } else {
    if(G.onBonus) sndBonusMiss(); else sndWrong();
  }

  setTimeout(()=>{
    if(isPuzzleSolved()){ sndFanfare(); endRound(who); return; }
    if(hit){
      let earn='';
      if(!isVowel && G.spinVal){
        const le=count*G.spinVal;
        earn = ` = €${le.toLocaleString('nl-NL')}`;
        if(G.onBonus && G.bonusVal){ const icon=G.roundType==='gold'?'👑':'🥈'; earn += ' + €'+G.bonusVal.toLocaleString('nl-NL')+' '+icon+' BONUS!'; }
      }
      setBanner(`✅ ${count}× ${letter}${earn}`,'money');
      G.onBonus=false; G.bonusVal=0;
      G.phase='spin'; G.locked=false; updateTurnUI();
      if(who==='computer') setTimeout(()=>computerTurn(),1300);
    } else {
      if(G.onBonus) setBanner(`❌ Geen ${letter}'s — bonus gemist!`,'neutral');
      else setBanner(`❌ Geen ${letter}'s`,'neutral');
      G.onBonus=false; G.bonusVal=0;
      setTimeout(()=>switchTurn(),900);
    }
  },delay);
}

// ── OPLOSSEN ──────────────────────────────────────────────────────────────────
function openSolveModal(){
  if(G.turn!=='player'||G.locked) return;
  const si = document.getElementById('solve-input');
  si.value='';
  // Blur any active element first so mobile keyboard resets cleanly
  if(document.activeElement) document.activeElement.blur();
  document.getElementById('modal-solve').classList.add('open');
  // Longer delay on mobile ensures the modal is fully visible before focus
  setTimeout(()=>{ si.focus(); si.select(); },220);
}
function closeSolveModal(){ document.getElementById('modal-solve').classList.remove('open'); }
function submitSolve(){
  const guess=document.getElementById('solve-input').value.trim().toUpperCase();
  closeSolveModal(); if(!guess) return;
  if(guess===G.puzzle.a){
    clearTimeout(G.sdInterval);
    G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
    renderPuzzle(); endRound('player');
  } else {
    setBanner('❌ Fout antwoord!','bad');
    if(G.suddenDeath){
      // Wrong answer in sudden death - just show error, keep revealing
      setTimeout(()=>{}, 900);
    } else {
      setTimeout(()=>switchTurn(),1000);
    }
  }
}

// ── COMPUTER AI ───────────────────────────────────────────────────────────────
function computerTurn(){
  if(G.turn!=='computer') return;
  if(isGameStuck()){ startSuddenDeath(); return; }
  if(G.suddenDeath){ sdComputerAttempt(); return; }
  showThinking(true);
  const cfg=DIFF[G.difficulty];
  const total=G.puzzle.a.replace(/ /g,'').length;
  const pct=G.revealed.size/Math.max(1,total);
  setTimeout(()=>{
    showThinking(false);
    // Attempt solve?
    if(pct>=cfg.solve&&Math.random()<cfg.solveChance){
      setBanner('🤖 Oplossen…','money');
      setTimeout(()=>endRound('computer'),1400); return;
    }
    // Buy vowel?
    if(G.roundScore.computer>=(G.vowelCost||VOWEL_COST)&&hasUnrevealedVowels()&&pct>cfg.vowelMin&&Math.random()<cfg.vowel){
      const av=[...VOWELS].filter(v=>!G.usedLetters.has(v)&&G.puzzle.a.includes(v));
      if(av.length>0){
        G.phase='buy_vowel'; G.spinVal=0;
        G.roundScore.computer-=(G.vowelCost||VOWEL_COST); updateScores();
        // Hard picks most frequent unrevealed vowel; others pick randomly
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
  G.locked=true;
  G.totalScore[winner]+=G.roundScore[winner];
  G.puzzle.a.split('').forEach((_,i)=>{ if(G.puzzle.a[i]!==' ') G.revealed.add(i); });
  renderPuzzle(); updateScores();
  if(winner==='player') spawnConfetti();
  const icon=winner==='player'?'🎉':'🤖';
  const title=winner==='player'?'Gewonnen!':'Computer Wint';
  const sub=winner==='player'?`+€${G.roundScore.player.toLocaleString('nl-NL')} toegevoegd aan je totaal!`:'Beter geluk volgende ronde!';
  setTimeout(()=>showResult(title,sub,icon,true,()=>{ if(G.round>=G.maxRounds) endGame(); else startRound(); }),500);
}

function showResult(title,sub,icon,showAns,cb,theme){
  const el=document.getElementById('modal-result');
  const titleEl=document.getElementById('res-title');
  const iconEl=document.getElementById('res-icon');
  titleEl.textContent=title;
  document.getElementById('res-sub').textContent=sub;
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

function endGame(){
  const p=G.totalScore.player, c=G.totalScore.computer;
  document.getElementById('go-ps').textContent='€'+p.toLocaleString('nl-NL');
  document.getElementById('go-cs').textContent='€'+c.toLocaleString('nl-NL');
  document.getElementById('go-p').classList.toggle('winner',p>=c);
  document.getElementById('go-c').classList.toggle('winner',c>p);
  let icon,title,sub;
  if(p>c){ icon='🏆'; title='Jij Wint!'; sub=`Je versloeg de computer met €${(p-c).toLocaleString('nl-NL')}!`; spawnConfetti(); }
  else if(c>p){ icon='🤖'; title='Computer Wint'; sub=`Verschil: €${(c-p).toLocaleString('nl-NL')}. Probeer opnieuw!`; }
  else{ icon='🤝'; title='Gelijkspel!'; sub='Precies gelijk! Ongelooflijk!'; }
  document.getElementById('go-icon').textContent=icon;
  document.getElementById('go-title').textContent=title;
  document.getElementById('go-sub').textContent=sub;
  document.getElementById('modal-go').classList.add('open');
}

// ── CONFETTI ──────────────────────────────────────────────────────────────────
function spawnConfetti(){
  const cols=['#f5c518','#06d6a0','#4895ef','#e63946','#fff0a0','#ff9f1c'];
  for(let i=0;i<65;i++){
    setTimeout(()=>{
      const el=document.createElement('div'); el.className='confetti-piece';
      el.style.cssText=`left:${Math.random()*100}vw;width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;background:${cols[i%cols.length]};border-radius:${Math.random()>.4?'50%':'2px'};animation-duration:${2+Math.random()*2}s;`;
      document.body.appendChild(el);
      setTimeout(()=>el.remove(),3800);
    },i*22);
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize',()=>{
  if(document.getElementById('screen-game').classList.contains('active')){
    sizeWheel();
    if(G.puzzle) renderPuzzle();
  }
});
window.addEventListener('load',()=>{ drawWheel(0); });

