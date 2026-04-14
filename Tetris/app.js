const canvas=document.getElementById('tetris');
const ctx=canvas.getContext('2d');
const nextCanvas=document.getElementById('next');
const nextCtx=nextCanvas.getContext('2d');
const holdCanvas=document.getElementById('hold');
const holdCtx=holdCanvas.getContext('2d');
const scoreEl=document.getElementById('score');
const speedEl=document.getElementById('speed');
const overlay=document.getElementById('result-overlay');
const resultMsg=document.getElementById('result-message');
const modeSwitchCard=document.getElementById('mode-switch-card');
const modeWasdBtn=document.getElementById('mode-wasd');
const modeArrowBtn=document.getElementById('mode-arrow');
const controlHint=document.getElementById('control-hint');

const COLS=10,ROWS=20,BLOCK=32;
const COLORS=['#000000','#d4a84b','#e2aa5f','#6ab8d8','#b59de6','#d98a88','#77bd9f','#d9bf79','#9dbf89'];
const KEYS=['I','J','L','O','S','T','Z'];

const SPAWN={
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J:[[2,0,0,0],[2,2,2,0],[0,0,0,0],[0,0,0,0]],
  L:[[0,0,3,0],[3,3,3,0],[0,0,0,0],[0,0,0,0]],
  O:[[0,4,4,0],[0,4,4,0],[0,0,0,0],[0,0,0,0]],
  S:[[0,5,5,0],[5,5,0,0],[0,0,0,0],[0,0,0,0]],
  T:[[0,6,0,0],[6,6,6,0],[0,0,0,0],[0,0,0,0]],
  Z:[[7,7,0,0],[0,7,7,0],[0,0,0,0],[0,0,0,0]]
};

const JLSTZ_KICKS={
  '0>1':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2':[[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1':[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3':[[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0':[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3':[[0,0],[1,0],[1,1],[0,-2],[1,-2]]
};

const I_KICKS={
  '0>1':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3':[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2':[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0':[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3':[[0,0],[-1,0],[2,0],[-1,2],[2,-1]]
};

function rotateCW(m){
  return m[0].map((_,i)=>m.map(row=>row[i]).reverse());
}

const ROT={};
for(const k of KEYS){
  const r0=SPAWN[k].map(row=>[...row]);
  const r1=rotateCW(r0),r2=rotateCW(r1),r3=rotateCW(r2);
  ROT[k]=[r0,r1,r2,r3];
}

function setupCanvas(c,context,w,h){
  const dpr=window.devicePixelRatio||1;
  c.width=Math.round(w*dpr);
  c.height=Math.round(h*dpr);
  c.style.width=`${w}px`;
  c.style.height=`${h}px`;
  context.setTransform(dpr,0,0,dpr,0,0);
  context.imageSmoothingEnabled=false;
}

setupCanvas(canvas,ctx,COLS*BLOCK,ROWS*BLOCK);
setupCanvas(nextCanvas,nextCtx,120,240);
setupCanvas(holdCanvas,holdCtx,120,120);

let grid,bag=[],queue=[],current;
let holdPiece=null,holdLocked=false;
let score=0,lines=0,level=1;
let dropInterval=800,dropCounter=0,lastTime=0;
let gameOver=false,paused=false,softDrop=false;
let downPressed=false,downBlocked=false,downTimer=null;
let grounded=false,lockTimer=0,lockResets=0;
let lastRotate=false;
let inputMode='wasd';
let clearAnim=null;
let lockInProgress=false;
const LOCK_DELAY=500,MAX_LOCK_RESETS=15;
const SOFT_DROP_HOLD_MS=140;
const CLEAR_WAVE_STEP_MS=10;
const CLEAR_WAVE_FADE_MS=80;

function resetGrid(){grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}}
function pullFromBag(){if(bag.length===0){bag=[...KEYS];shuffle(bag);}return bag.pop();}
function ensureQueue(n=3){while(queue.length<n)queue.push(pullFromBag());}
function createPiece(type){return {type,rot:0,x:3,y:0,matrix:ROT[type][0]};}
function takeNextPiece(){ensureQueue(3);const t=queue.shift();ensureQueue(3);return createPiece(t);}

function collide(piece,dx=0,dy=0,matrix=piece.matrix){
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=matrix[r][c]; if(!v)continue;
    const x=piece.x+c+dx,y=piece.y+r+dy;
    if(x<0||x>=COLS||y>=ROWS)return true;
    if(y>=0&&grid[y][x])return true;
  }
  return false;
}

function merge(piece){
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=piece.matrix[r][c]; if(!v)continue;
    const x=piece.x+c,y=piece.y+r;
    if(y>=0)grid[y][x]=v;
  }
}

function resetLockOnAction(){
  if(!grounded)return;
  if(!collide(current,0,1)){
    grounded=false;lockTimer=0;lockResets=0;return;
  }
  if(lockResets<MAX_LOCK_RESETS){lockResets++;lockTimer=0;}
}

function tryMove(dx,dy){
  if(collide(current,dx,dy))return false;
  current.x+=dx; current.y+=dy;
  lastRotate=false;
  resetLockOnAction();
  return true;
}

function tryRotateCW(){
  const from=current.rot,to=(from+1)%4;
  const nextM=ROT[current.type][to];
  const key=`${from}>${to}`;
  const kicks=current.type==='I'?I_KICKS[key]:(current.type==='O'?[[0,0]]:JLSTZ_KICKS[key]);
  for(const [kx,ky] of kicks){
    if(!collide(current,kx,-ky,nextM)){
      current.rot=to; current.matrix=nextM; current.x+=kx; current.y-=ky;
      lastRotate=true;
      resetLockOnAction();
      return true;
    }
  }
  return false;
}

function tryRotateCCW(){
  const from=current.rot,to=(from+3)%4;
  const nextM=ROT[current.type][to];
  const key=`${from}>${to}`;
  const kicks=current.type==='I'?I_KICKS[key]:(current.type==='O'?[[0,0]]:JLSTZ_KICKS[key]);
  for(const [kx,ky] of kicks){
    if(!collide(current,kx,-ky,nextM)){
      current.rot=to; current.matrix=nextM; current.x+=kx; current.y-=ky;
      lastRotate=true;
      resetLockOnAction();
      return true;
    }
  }
  return false;
}

function tryRotate180(){
  return tryRotateCW()&&tryRotateCW();
}

function isTSpin(){
  if(current.type!=='T'||!lastRotate)return false;
  const cx=current.x+1,cy=current.y+1;
  const corners=[[cx-1,cy-1],[cx+1,cy-1],[cx-1,cy+1],[cx+1,cy+1]];
  let blocked=0;
  for(const [x,y] of corners){
    if(x<0||x>=COLS||y>=ROWS||(y>=0&&grid[y][x]))blocked++;
  }
  return blocked>=3;
}

function clearLines(){
  const tspin=isTSpin();
  const fullRows=[];
  for(let r=0;r<ROWS;r++){
    if(grid[r].every(v=>v))fullRows.push(r);
  }
  const cleared=fullRows.length;

  if(cleared===0){
    lastRotate=false;
    return Promise.resolve(false);
  }

  if(tspin){
    const tspinScore=[400,800,1200,1600][cleared]||400;
    score+=tspinScore*level;
  }else{
    score+=[0,40,100,300,1200][cleared]*level;
  }

  lines+=cleared;
  if(lines>=level*10){level++;dropInterval=Math.max(120,800-60*(level-1));}
  updateHUD();
  lastRotate=false;

  const rowsSet=new Set(fullRows);
  const triggerCols=[];
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=current.matrix[r][c]; if(!v)continue;
    const gx=current.x+c,gy=current.y+r;
    if(gx<0||gx>=COLS||gy<0||gy>=ROWS)continue;
    if(rowsSet.has(gy))triggerCols.push(gx);
  }

  const centerX=triggerCols.length
    ? (Math.min(...triggerCols)+Math.max(...triggerCols))/2
    : (COLS-1)/2;

  const layerDistances=[...new Set(
    Array.from({length:COLS},(_,c)=>Math.abs(c-centerX))
  )].sort((a,b)=>a-b);

  clearAnim={
    rows:new Set(fullRows),
    start:performance.now(),
    nextColAt:performance.now(),
    centerX,
    layerDistances,
    clearedLayers:0
  };

  return new Promise(resolve=>{
    const tick=()=>{
      if(!clearAnim){resolve(true);return;}
      const now=performance.now();
      while(clearAnim.clearedLayers<clearAnim.layerDistances.length&&now>=clearAnim.nextColAt){
        clearAnim.clearedLayers++;
        clearAnim.nextColAt+=CLEAR_WAVE_STEP_MS;
      }
      if(clearAnim.clearedLayers>=clearAnim.layerDistances.length){
        grid=grid.filter((row,idx)=>!clearAnim.rows.has(idx));
        while(grid.length<ROWS)grid.unshift(Array(COLS).fill(0));
        clearAnim=null;
        resolve(true);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function lockPiece(){
  if(lockInProgress)return;
  lockInProgress=true;

  merge(current);
  await clearLines();
  holdLocked=false;
  softDrop=false;
  grounded=false;lockTimer=0;lockResets=0;
  current=takeNextPiece();
  drawNext();drawHold();
  if(downPressed)downBlocked=true;
  if(collide(current)){gameOver=true;showGameOver();}

  lockInProgress=false;
}

function stepGravity(){
  if(tryMove(0,1))return;
  if(!grounded){grounded=true;lockTimer=0;lockResets=0;}
}

async function hardDrop(){
  while(tryMove(0,1)){}
  await lockPiece();
  dropCounter=0;
}

function holdSwap(){
  if(holdLocked||gameOver||paused)return;
  const t=current.type;
  if(!holdPiece){holdPiece=t;current=takeNextPiece();}
  else {const tmp=holdPiece;holdPiece=t;current=createPiece(tmp);} 
  holdLocked=true;
  grounded=false;lockTimer=0;lockResets=0;
  drawNext();drawHold();
  if(collide(current)){gameOver=true;showGameOver();}
}

function updateHUD(){
  scoreEl.textContent=score;
  speedEl.textContent=`${(800/dropInterval).toFixed(1)}x`;
}

function drawCell(x,y,v,context,size=BLOCK){
  const px=Math.round(x*size),py=Math.round(y*size),s=Math.round(size);
  context.fillStyle=COLORS[v];
  context.fillRect(px+1,py+1,s-2,s-2);
}

function drawRowGuides(){
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,0.03)';
  ctx.lineWidth=1;
  for(let y=0;y<=ROWS;y++){
    const py=y*BLOCK+0.5;
    ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(COLS*BLOCK,py);ctx.stroke();
  }
  ctx.restore();
}

function getGhostY(piece){
  const g={...piece};
  while(!collide(g,0,1))g.y++;
  return g.y;
}

function drawGhost(piece){
  const gy=getGhostY(piece);
  ctx.save();
  ctx.strokeStyle='rgba(240,200,112,.9)';
  ctx.lineWidth=2;
  for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=piece.matrix[r][c]; if(!v)continue;
    const x=Math.round((piece.x+c)*BLOCK)+3;
    const y=Math.round((gy+r)*BLOCK)+3;
    ctx.strokeRect(x,y,BLOCK-6,BLOCK-6);
  }
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawRowGuides();

  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const v=grid[r][c];
    if(!v)continue;

    if(clearAnim&&clearAnim.rows.has(r)){
      const currentLayer=clearAnim.clearedLayers>0
        ? clearAnim.layerDistances[clearAnim.clearedLayers-1]
        : -1;
      const d=Math.abs(c-clearAnim.centerX);
      if(currentLayer>=0&&d<=currentLayer)continue;
    }

    drawCell(c,r,v,ctx);
  }

  if(!clearAnim)drawGhost(current);
  if(!clearAnim)for(let r=0;r<4;r++)for(let c=0;c<4;c++){
    const v=current.matrix[r][c]; if(!v)continue;
    const y=current.y+r; if(y<0)continue;
    drawCell(current.x+c,y,v,ctx);
  }
}

function drawMiniPiece(context,type,slot,totalSlots){
  if(!type)return;
  const m=ROT[type][0],s=20;
  const cw=120,ch=context===nextCtx?240:120;
  const padY=8;
  const areaH=Math.floor((ch-padY*2)/totalSlots);

  let minR=4,maxR=0,minC=4,maxC=0;
  for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(m[r][c]){minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);} 
  const w=(maxC-minC+1)*s,h=(maxR-minR+1)*s;
  const ox=Math.floor((cw-w)/2),oy=Math.floor(padY + slot*areaH + (areaH-h)/2);
  for(let r=minR;r<=maxR;r++)for(let c=minC;c<=maxC;c++)if(m[r][c])drawCell((ox/s)+(c-minC),(oy/s)+(r-minR),m[r][c],context,s);
}

function drawNext(){
  nextCtx.clearRect(0,0,120,240);
  ensureQueue(3);
  drawMiniPiece(nextCtx,queue[0],0,3);
  drawMiniPiece(nextCtx,queue[1],1,3);
  drawMiniPiece(nextCtx,queue[2],2,3);
}

function drawHold(){
  holdCtx.clearRect(0,0,120,120);
  drawMiniPiece(holdCtx,holdPiece,0,1);
}

function showGameOver(){
  resultMsg.textContent=`得分 ${score}`;
  overlay.classList.add('show');
}

function update(time=0){
  if(gameOver||paused)return;
  const delta=time-lastTime; lastTime=time;

  if(!clearAnim&&!lockInProgress){
    const interval=softDrop?Math.max(30,dropInterval*0.12):dropInterval;
    dropCounter+=delta;
    while(dropCounter>=interval){
      stepGravity();
      dropCounter-=interval;
    }
    if(grounded){
      lockTimer+=delta;
      if(lockTimer>=LOCK_DELAY)lockPiece();
    }
  }

  draw();
  requestAnimationFrame(update);
}

function start(){
  resetGrid();
  score=0;lines=0;level=1;dropInterval=800;gameOver=false;paused=false;
  holdPiece=null;holdLocked=false;queue=[];ensureQueue(3);
  current=takeNextPiece();
  grounded=false;lockTimer=0;lockResets=0;
  downPressed=false;downBlocked=false;softDrop=false;
  clearAnim=null;lockInProgress=false;
  updateHUD();drawNext();drawHold();overlay.classList.remove('show');
  lastTime=performance.now();dropCounter=0;
  canvas.focus();
  requestAnimationFrame(update);
}

function updateModeUI(){
  if(inputMode==='wasd'){
    controlHint.textContent='WASD布局：A/D 移动 · W 顺时针 · Q 逆时针 · R 180° · F Hold · S 长按加速 · 空格硬降';
    if(modeSwitchCard)modeSwitchCard.classList.remove('arrow');
    if(modeWasdBtn)modeWasdBtn.classList.add('active');
    if(modeArrowBtn)modeArrowBtn.classList.remove('active');
  }else{
    controlHint.textContent='↑↓←→布局：←/→ 移动 · ↑ 顺时针 · Z 逆时针 · A 180° · C Hold · ↓ 长按加速 · 空格硬降';
    if(modeSwitchCard)modeSwitchCard.classList.add('arrow');
    if(modeWasdBtn)modeWasdBtn.classList.remove('active');
    if(modeArrowBtn)modeArrowBtn.classList.add('active');
  }
}

document.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp','Space','KeyX','KeyA','KeyD','KeyW','KeyS','KeyQ','KeyR','KeyF','KeyZ','KeyC','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();
  if(gameOver||paused)return;

  if(inputMode==='wasd'){
    if(e.code==='KeyA'){tryMove(-1,0);return;}
    if(e.code==='KeyD'){tryMove(1,0);return;}
    if(e.code==='KeyW'||e.code==='KeyX'){tryRotateCW();return;}
    if(e.code==='KeyQ'){tryRotateCCW();return;}
    if(e.code==='KeyR'){tryRotate180();return;}
    if(e.code==='KeyF'||e.code==='ControlLeft'||e.code==='ControlRight'){holdSwap();return;}
    if(e.code==='Space'){hardDrop();return;}
    if(e.code==='KeyS'){
      if(downPressed)return;
      downPressed=true;
      if(downBlocked)return;
      clearTimeout(downTimer);
      downTimer=setTimeout(()=>{
        if(downPressed&&!downBlocked){
          softDrop=true;
          dropCounter=0;
        }
      },SOFT_DROP_HOLD_MS);
    }
    return;
  }

  if(e.code==='ArrowLeft'){tryMove(-1,0);return;}
  if(e.code==='ArrowRight'){tryMove(1,0);return;}
  if(e.code==='ArrowUp'||e.code==='KeyX'){tryRotateCW();return;}
  if(e.code==='KeyZ'){tryRotateCCW();return;}
  if(e.code==='KeyA'){tryRotate180();return;}
  if(e.code==='KeyC'||e.code==='ControlLeft'||e.code==='ControlRight'){holdSwap();return;}
  if(e.code==='Space'){hardDrop();return;}
  if(e.code==='ArrowDown'){
    if(downPressed)return;
    downPressed=true;
    if(downBlocked)return;
    clearTimeout(downTimer);
    downTimer=setTimeout(()=>{
      if(downPressed&&!downBlocked){
        softDrop=true;
        dropCounter=0;
      }
    },SOFT_DROP_HOLD_MS);
  }
});

document.addEventListener('keyup',e=>{
  if(e.code==='ArrowDown'||e.code==='KeyS'){
    downPressed=false;downBlocked=false;softDrop=false;
    clearTimeout(downTimer);downTimer=null;
  }
});

function setInputMode(mode){
  inputMode=mode;
  updateModeUI();
  downPressed=false;downBlocked=false;softDrop=false;
  clearTimeout(downTimer);downTimer=null;
}

if(modeSwitchCard){
  modeSwitchCard.addEventListener('pointerdown',e=>{
    e.preventDefault();
    setInputMode(inputMode==='wasd'?'arrow':'wasd');
  });
  modeSwitchCard.addEventListener('keydown',e=>{
    if(e.code==='Enter'||e.code==='Space'){
      e.preventDefault();
      setInputMode(inputMode==='wasd'?'arrow':'wasd');
    }
  });
}

updateModeUI();
canvas.addEventListener('pointerdown',()=>canvas.focus());
window.addEventListener('blur',()=>{paused=true;softDrop=false;clearTimeout(downTimer);downTimer=null;downPressed=false;});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){paused=true;softDrop=false;clearTimeout(downTimer);downTimer=null;downPressed=false;}
  else if(!gameOver){paused=false;lastTime=performance.now();requestAnimationFrame(update);}
});
window.addEventListener('focus',()=>{if(!document.hidden&&!gameOver){paused=false;lastTime=performance.now();requestAnimationFrame(update);}});

document.getElementById('new-game').addEventListener('click',start);
document.getElementById('restart-btn').addEventListener('click',start);

start();
