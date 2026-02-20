const VOWELS = new Set(['A','E','I','O','U']);
const VOWEL_COST = 250;
const FREQ_ORDER = 'NETSRLADGOIKMHBVPUWCFZJYXQ'.split('');
// Difficulty frequency orders
const FREQ_HARD = 'ENATIORDSLGKMPBVHWZFJYXQ'.split('');   // strict Dutch frequency
const FREQ_EASY = 'BCDFGHJKLMPQRSTVWXYZ'.split('');        // ignores frequency, rare letters first

// ── STATE ─────────────────────────────────────────────────────────────────────
let G = {};
let wheelRot = 0;
let resultCb = null;
let selectedRounds = 3;
let selectedDiff = 'medium'; // 'easy' | 'medium' | 'hard'

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

function initState(maxR){
  G = {
    maxRounds:maxR, round:0, turn:'player', phase:'spin',
    puzzle:null, revealed:new Set(), usedLetters:new Set(),
    spinVal:0, roundScore:{player:0,computer:0}, totalScore:{player:0,computer:0},
    usedIdx:new Set(), spinning:false, locked:false,
    suddenDeath:false, sdVowelsQueue:[], sdInterval:null,
    difficulty:selectedDiff
  };
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

document.querySelectorAll('#rounds-sel .rounds-opt').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#rounds-sel .rounds-opt').forEach(x=>x.classList.remove('sel'));
    el.classList.add('sel');
    selectedRounds=parseInt(el.dataset.r);
  });
});

document.querySelectorAll('#diff-sel .rounds-opt').forEach(el=>{
  el.addEventListener('click',()=>{
    document.querySelectorAll('#diff-sel .rounds-opt').forEach(x=>x.classList.remove('sel'));
    el.classList.add('sel');
    selectedDiff=el.dataset.d;
  });
});

// ── PHYSICAL KEYBOARD SUPPORT ─────────────────────────────────────────────────
window.addEventListener('keydown', e=>{
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  const letter = e.key.toUpperCase();
  if(letter.length===1 && letter>='A' && letter<='Z'){
    e.preventDefault();
    handleKeyPress(letter);
  }
  if(e.key==='Enter'){
    // Enter opens solve modal if btn-solve is enabled
    const solveBtn = document.getElementById('btn-solve');
    if(solveBtn && !solveBtn.disabled){
      const solveModal = document.getElementById('modal-solve');
      if(!solveModal.classList.contains('open')) openSolveModal();
      else submitSolve();
    }
  }
  if(e.key==='Escape'){
    closeSolveModal();
    closeRulesModal();
  }
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
  const n=SEGS.length, arc=(2*Math.PI)/n;
  ctx.clearRect(0,0,sz,sz);
  for(let i=0;i<n;i++){
    const s=rot+i*arc-Math.PI/2, e=s+arc;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,s,e); ctx.closePath();
    ctx.fillStyle=SEGS[i].col; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(s+arc/2); ctx.textAlign='right';
    ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,0.9)'; ctx.shadowBlur=3;
    const fs=Math.max(7,sz*0.040);
    ctx.font=`bold ${fs}px Oswald,sans-serif`;
    ctx.fillText(SEGS[i].lbl,r-5,fs*0.37);
    ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,r,0,2*Math.PI);
  ctx.strokeStyle='rgba(245,197,24,0.4)'; ctx.lineWidth=2.5; ctx.stroke();
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
  G.turn='player';
  // Pre-revealed letters based on difficulty
  const preReveal = G.difficulty==='easy' ? ['R','S','T','L'] :
                    G.difficulty==='medium' ? ['R','S'] : [];
  preReveal.forEach(l=>{
    G.usedLetters.add(l);
    for(let i=0;i<G.puzzle.a.length;i++) if(G.puzzle.a[i]===l) G.revealed.add(i);
  });
  document.getElementById('round-pill').textContent=`Ronde ${G.round} van ${G.maxRounds}`;
  document.getElementById('cat-display').textContent=G.puzzle.c;
  setBanner('','empty');
  renderPuzzle(); buildKeyboard(); updateScores(); updateTurnUI();
  if(G.turn==='computer') setTimeout(computerTurn,1600);
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
  document.getElementById('btn-vowel').disabled=!(isP&&(G.phase==='spin'||G.phase==='guess')&&!G.locked&&G.roundScore.player>=VOWEL_COST&&hasUnrevealedVowels()&&!G.suddenDeath);
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
  const playerCanBuy = G.roundScore.player >= VOWEL_COST;
  const compCanBuy   = G.roundScore.computer >= VOWEL_COST;
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
  document.getElementById('modal-sd').classList.remove('open');
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
  const dur=3000+Math.random()*900;
  const t0=performance.now(), startRot=wheelRot;
  let lastSeg=-1;

  function frame(now){
    const elapsed=now-t0, prog=Math.min(elapsed/dur,1);
    const ease=1-Math.pow(1-prog,3);
    const curRot=startRot+totalRot*ease;
    drawWheel(curRot);

    // Tick sound — same precise method as reference game
    const norm=((curRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const segArc=(2*Math.PI)/SEGS.length;
    const si=Math.floor((((-norm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)/segArc)%SEGS.length;
    if(si!==lastSeg){ lastSeg=si; sndTick(); }

    if(prog<1){ requestAnimationFrame(frame); return; }
    G.spinning=false;
    const fRot=startRot+totalRot;
    const fNorm=((fRot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const pAngle=(((-fNorm)%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
    const fsi=Math.floor((pAngle/(2*Math.PI))*SEGS.length)%SEGS.length;
    onLanded(SEGS[fsi],who);
  }
  requestAnimationFrame(frame);
}

function onLanded(seg,who){
  if(seg.val==='BANKRUPT'){
    sndBankrupt();
    setBanner('💸 FAILLIET!','bad');
    G.roundScore[who]=0; updateScores();
    setTimeout(()=>showResult(
      who==='player'?'💸 FAILLIET!':'🤖 Failliet!',
      (who==='player'?'Je verliest':'Computer verliest')+' alle rondeverdiensten!',
      '😱',false,()=>switchTurn()),500);
  } else if(seg.val==='LOSE'){
    sndWrong();
    setBanner('😬 BEURT VERLIES','neutral');
    setTimeout(()=>showResult(
      who==='player'?'😬 Beurt Verlies':'🤖 Beurt Verlies',
      (who==='player'?'Je verliest':'Computer verliest')+' deze beurt!',
      '😞',false,()=>switchTurn()),500);
  } else {
    // money segment — no extra sound, sndTick already fired
    G.spinVal=seg.val;
    setBanner(`💰 ${seg.lbl} per letter`,'money');
    G.phase='guess'; G.locked=false;
    if(who==='player') updateTurnUI();
    else setTimeout(()=>computerGuessConsonant(),1100);
  }
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
  if(G.roundScore.player<VOWEL_COST||!hasUnrevealedVowels()) return;
  G.phase='buy_vowel'; G.spinVal=0; G.locked=false;
  setBanner('🔤 Kies een klinker — kost €250','money');
  updateTurnUI();
}

function processGuess(letter,who){
  if(G.usedLetters.has(letter)) return;
  G.usedLetters.add(letter); G.locked=true;
  const isVowel=VOWELS.has(letter);
  const count=animateReveal(letter), hit=count>0;
  if(isVowel&&who==='player') G.roundScore.player-=VOWEL_COST;
  if(!isVowel&&hit) G.roundScore[who]+=count*G.spinVal;
  updateScores();
  markKey(letter,hit&&G.puzzle.a.includes(letter));
  if(hit) sndCorrect(); else sndWrong();
  const delay=hit?(count*90+250):250;
  setTimeout(()=>{
    if(isPuzzleSolved()){ sndFanfare(); endRound(who); return; }
    if(hit){
      const earn=(!isVowel&&G.spinVal)?` = €${(count*G.spinVal).toLocaleString('nl-NL')}`:'';
      setBanner(`✅ ${count}× ${letter}${earn}`,'money');
      G.phase='spin'; G.locked=false; updateTurnUI();
      if(who==='computer') setTimeout(()=>computerTurn(),1300);
    } else {
      setBanner(`❌ Geen ${letter}'s`,'neutral');
      setTimeout(()=>switchTurn(),900);
    }
  },delay);
}

// ── OPLOSSEN ──────────────────────────────────────────────────────────────────
function openSolveModal(){
  if(G.turn!=='player'||G.locked) return;
  document.getElementById('solve-input').value='';
  document.getElementById('modal-solve').classList.add('open');
  setTimeout(()=>document.getElementById('solve-input').focus(),100);
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
  // Check stuck before computer acts
  if(isGameStuck()){ startSuddenDeath(); return; }
  if(G.suddenDeath){ sdComputerAttempt(); return; }
  showThinking(true);
  const total=G.puzzle.a.replace(/ /g,'').length;
  const pct=G.revealed.size/Math.max(1,total);
  const diff=G.difficulty;

  // Solve thresholds per difficulty
  const solveThreshold = diff==='hard'?0.45 : diff==='easy'?0.90 : 0.68;
  const solveChance    = diff==='hard'?0.80 : diff==='easy'?0.40 : 0.60;
  // Vowel buy chances per difficulty
  const vowelChance    = diff==='hard'?0.65 : diff==='easy'?0.08 : 0.25;
  const vowelMinPct    = diff==='hard'?0.15 : diff==='easy'?0.50 : 0.25;
  // Think delay (hard is quicker/confident)
  const thinkDelay     = diff==='hard'?700  : diff==='easy'?1400 : 1100;

  setTimeout(()=>{
    showThinking(false);
    if(pct>solveThreshold&&Math.random()<solveChance){
      setBanner('🤖 Oplossen…','money');
      setTimeout(()=>endRound('computer'),1400);
      return;
    }
    if(G.roundScore.computer>=VOWEL_COST&&hasUnrevealedVowels()&&pct>vowelMinPct&&Math.random()<vowelChance){
      const av=[...VOWELS].filter(v=>!G.usedLetters.has(v)&&G.puzzle.a.includes(v));
      if(av.length>0){
        G.phase='buy_vowel'; G.spinVal=0;
        G.roundScore.computer-=VOWEL_COST; updateScores();
        // Hard always picks the most frequent unrevealed vowel
        const v = diff==='hard'
          ? (FREQ_HARD.find(l=>av.includes(l))||av[0])
          : av[Math.floor(Math.random()*av.length)];
        setBanner(`🤖 Koopt klinker ${v}`,'money');
        setTimeout(()=>processGuess(v,'computer'),900);
        return;
      }
    }
    doSpin('computer');
  },thinkDelay);
}

function computerGuessConsonant(){
  showThinking(true);
  const diff = G.difficulty;

  let freqList;
  if(diff==='hard')       freqList=FREQ_HARD;
  else if(diff==='easy')  freqList=FREQ_EASY;
  else                    freqList=FREQ_ORDER;

  const available=freqList.filter(c=>!VOWELS.has(c)&&!G.usedLetters.has(c));
  const inPuzzle=available.filter(c=>G.puzzle.a.includes(c));

  // Hard: always picks best in-puzzle letter; Easy: often picks random wrong letter
  let pick;
  if(diff==='hard'){
    pick = inPuzzle.length>0 ? inPuzzle[0] : (available[0]||null);
  } else if(diff==='easy'){
    // Easy picks smartly only 25% of the time
    pick = inPuzzle.length>0&&Math.random()<0.25
      ? inPuzzle[0]
      : (available[Math.floor(Math.random()*Math.min(available.length,12))]||null);
  } else {
    pick = inPuzzle.length>0&&Math.random()<0.6 ? inPuzzle[0] : (available[0]||null);
  }

  const delay = diff==='hard'?600 : diff==='easy'?1600 : 1000;
  setTimeout(()=>{
    showThinking(false);
    if(!pick){ switchTurn(); return; }
    setBanner(`🤖 Raadt: ${pick}`,'money');
    setTimeout(()=>processGuess(pick,'computer'),700);
  },delay);
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

function showResult(title,sub,icon,showAns,cb){
  document.getElementById('res-title').textContent=title;
  document.getElementById('res-sub').textContent=sub;
  document.getElementById('res-icon').textContent=icon;
  const ra=document.getElementById('res-answer');
  ra.textContent=showAns?G.puzzle.a:''; ra.style.display=showAns?'block':'none';
  document.getElementById('modal-result').classList.add('open');
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

