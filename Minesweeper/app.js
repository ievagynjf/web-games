const MODES=[
  {id:'beginner',label:'初级 9×9 · 10雷',rows:9,cols:9,mines:10},
  {id:'intermediate',label:'中级 16×16 · 40雷',rows:16,cols:16,mines:40},
  {id:'expert',label:'高级 16×30 · 99雷',rows:16,cols:30,mines:99},
  {id:'custom',label:'自定义',rows:16,cols:20,mines:60},
];

let mode=MODES[0],board=[],started=false,gameOver=false,seconds=0,timer=null,flagsLeft=0,firstClick=true,autoFlagEnabled=true;
let rightDrag=false,longPressTimer=null,longPressKey=null;
let wavePending=new Set();
let cellEls=[];
let waveAnimating=false;
let waveRunId=0;

function fmtTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function idxKey(r,c){return `${r},${c}`;}
function inRange(r,c){return r>=0&&r<mode.rows&&c>=0&&c<mode.cols;}
function neighbors(r,c){const out=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const nr=r+dr,nc=c+dc;if(inRange(nr,nc))out.push([nr,nc]);}return out;}
function getWaveAnimCellLimit(){
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const vw=Math.max(1,window.innerWidth||1920);
  const vh=Math.max(1,window.innerHeight||1080);
  const areaScale=Math.sqrt((vw*vh)/(1920*1080));
  const limit=220/(Math.pow(dpr,0.75)*Math.max(0.85,areaScale));
  return Math.max(90,Math.min(220,Math.round(limit)));
}

function initModeTabs(){
  const wrap=document.getElementById('mode-tabs');
  wrap.innerHTML='';
  MODES.forEach((m,i)=>{
    const b=document.createElement('button');
    b.className='mode-tab'+(i===0?' active':'');
    b.textContent=m.label;
    b.dataset.mode=m.id;
    b.addEventListener('click',()=>setMode(m.id));
    wrap.appendChild(b);
  });
}

function setMode(id){
  if(id==='custom'){
    document.querySelectorAll('.mode-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode==='custom'));
    applyCustom(true);
    return;
  }
  if(mode.id===id)return;
  mode=MODES.find(m=>m.id===id)||MODES[0];
  document.querySelectorAll('.mode-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode===mode.id));
  newGame();
}

function buildEmptyBoard(){
  return Array.from({length:mode.rows},()=>Array.from({length:mode.cols},()=>({mine:false,open:false,flag:false,num:0})));
}

function calcNums(mineMap){
  const nums=Array.from({length:mode.rows},()=>Array(mode.cols).fill(0));
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    if(mineMap[r][c])continue;
    nums[r][c]=neighbors(r,c).reduce((n,[nr,nc])=>n+(mineMap[nr][nc]?1:0),0);
  }
  return nums;
}

function randomMineMap(safeR,safeC){
  const safe=new Set([idxKey(safeR,safeC),...neighbors(safeR,safeC).map(([r,c])=>idxKey(r,c))]);
  const cells=[];
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++)if(!safe.has(idxKey(r,c)))cells.push([r,c]);
  for(let i=cells.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cells[i],cells[j]]=[cells[j],cells[i]];}
  const mineMap=Array.from({length:mode.rows},()=>Array(mode.cols).fill(false));
  for(let i=0;i<mode.mines;i++){const[r,c]=cells[i];mineMap[r][c]=true;}
  return mineMap;
}

function canSolveWithoutGuess(mineMap,safeR,safeC){
  const nums=calcNums(mineMap);
  const open=Array.from({length:mode.rows},()=>Array(mode.cols).fill(false));
  const flag=Array.from({length:mode.rows},()=>Array(mode.cols).fill(false));

  const flood=(sr,sc)=>{
    const q=[[sr,sc]],seen=new Set([idxKey(sr,sc)]);
    while(q.length){
      const [r,c]=q.shift();
      if(open[r][c]||flag[r][c])continue;
      if(mineMap[r][c])return false;
      open[r][c]=true;
      if(nums[r][c]!==0)continue;
      for(const [nr,nc] of neighbors(r,c)){
        const k=idxKey(nr,nc);
        if(!seen.has(k)&&!mineMap[nr][nc]){seen.add(k);q.push([nr,nc]);}
      }
    }
    return true;
  };

  if(!flood(safeR,safeC))return false;
  let progress=true,steps=0;
  while(progress&&steps++<3000){
    progress=false;
    for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
      if(!open[r][c]||nums[r][c]===0)continue;
      const ns=neighbors(r,c),hidden=[];
      let flags=0;
      for(const [nr,nc] of ns){
        if(flag[nr][nc])flags++;
        else if(!open[nr][nc])hidden.push([nr,nc]);
      }
      if(!hidden.length)continue;
      if(flags===nums[r][c]){
        for(const [nr,nc] of hidden){if(!open[nr][nc]){if(!flood(nr,nc))return false;progress=true;}}
      }else if(flags+hidden.length===nums[r][c]){
        for(const [nr,nc] of hidden){if(!flag[nr][nc]){flag[nr][nc]=true;progress=true;}}
      }
    }
  }

  let opened=0;
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    if(!mineMap[r][c]&&!open[r][c])return false;
    if(open[r][c]&&!mineMap[r][c])opened++;
  }
  return opened<(mode.rows*mode.cols-mode.mines);
}

function setMineMapToBoard(mineMap){
  const nums=calcNums(mineMap);
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    board[r][c].mine=mineMap[r][c];
    board[r][c].num=mineMap[r][c]?0:nums[r][c];
  }
}

function getFrontierCells(open,flag){
  const out=[];
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    if(open[r][c]||flag[r][c])continue;
    let nearOpen=false;
    for(const [nr,nc] of neighbors(r,c)){ if(open[nr][nc]){nearOpen=true;break;} }
    if(nearOpen)out.push([r,c]);
  }
  return out;
}

function solveState(mineMap,safeR,safeC){
  const nums=calcNums(mineMap);
  const open=Array.from({length:mode.rows},()=>Array(mode.cols).fill(false));
  const flag=Array.from({length:mode.rows},()=>Array(mode.cols).fill(false));

  const flood=(sr,sc)=>{
    const q=[[sr,sc]],seen=new Set([idxKey(sr,sc)]);
    while(q.length){
      const [r,c]=q.shift();
      if(open[r][c]||flag[r][c])continue;
      if(mineMap[r][c])return false;
      open[r][c]=true;
      if(nums[r][c]!==0)continue;
      for(const [nr,nc] of neighbors(r,c)){
        const k=idxKey(nr,nc);
        if(!seen.has(k)&&!mineMap[nr][nc]){seen.add(k);q.push([nr,nc]);}
      }
    }
    return true;
  };

  if(!flood(safeR,safeC))return {solved:false,frontier:[]};

  let progress=true,steps=0;
  while(progress&&steps++<3500){
    progress=false;
    for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
      if(!open[r][c]||nums[r][c]===0)continue;
      const hidden=[];
      let flags=0;
      for(const [nr,nc] of neighbors(r,c)){
        if(flag[nr][nc])flags++;
        else if(!open[nr][nc])hidden.push([nr,nc]);
      }
      if(!hidden.length)continue;
      if(flags===nums[r][c]){
        for(const [nr,nc] of hidden){ if(!open[nr][nc]){ if(!flood(nr,nc))return {solved:false,frontier:[]}; progress=true; } }
      }else if(flags+hidden.length===nums[r][c]){
        for(const [nr,nc] of hidden){ if(!flag[nr][nc]){ flag[nr][nc]=true; progress=true; } }
      }
    }
  }

  let solved=true;
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++)if(!mineMap[r][c]&&!open[r][c]){solved=false;break;}
  return {solved,frontier:getFrontierCells(open,flag)};
}

function patchMineMapLocally(mineMap,frontier,safeR,safeC){
  if(!frontier.length)return false;
  const pick=frontier[Math.floor(Math.random()*frontier.length)];
  const [fr,fc]=pick;
  if(mineMap[fr][fc])return false;

  const banned=new Set([idxKey(safeR,safeC),...neighbors(safeR,safeC).map(([r,c])=>idxKey(r,c))]);
  const outside=[];
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    if(!mineMap[r][c])continue;
    const k=idxKey(r,c);
    if(banned.has(k))continue;
    if(Math.abs(r-fr)+Math.abs(c-fc)<=2)continue;
    outside.push([r,c]);
  }
  if(!outside.length)return false;
  const [mr,mc]=outside[Math.floor(Math.random()*outside.length)];
  mineMap[mr][mc]=false;
  mineMap[fr][fc]=true;
  return true;
}

function placeMines(safeR,safeC){
  let mineMap=randomMineMap(safeR,safeC);
  let state=solveState(mineMap,safeR,safeC);

  const hardBudgetMs=160;
  const t0=performance.now();
  let tries=0;
  while(!state.solved&&performance.now()-t0<hardBudgetMs&&tries++<300){
    if(!patchMineMapLocally(mineMap,state.frontier,safeR,safeC)){
      mineMap=randomMineMap(safeR,safeC);
    }
    state=solveState(mineMap,safeR,safeC);
  }

  if(!state.solved){
    for(let i=0;i<180;i++){
      const candidate=randomMineMap(safeR,safeC);
      const s=solveState(candidate,safeR,safeC);
      if(s.solved){mineMap=candidate;state=s;break;}
    }
  }

  setMineMapToBoard(mineMap);
}

function renderBoard(){
  const grid=document.getElementById('mine-board');
  grid.style.gridTemplateColumns=`repeat(${mode.cols}, var(--cell-size))`;
  grid.innerHTML='';
  cellEls=Array.from({length:mode.rows},()=>Array(mode.cols));
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
    const cell=document.createElement('div');
    cell.className='cell';
    cell.dataset.r=r;cell.dataset.c=c;
    cellEls[r][c]=cell;
    cell.addEventListener('click',()=>handleCellClick(r,c));
    cell.addEventListener('contextmenu',e=>{e.preventDefault();rightDrag=true;toggleFlag(r,c);});
    cell.addEventListener('mouseenter',e=>{if(rightDrag&&(e.buttons&2))toggleFlag(r,c);});
    cell.addEventListener('mousedown',e=>{
      if(e.button!==0)return;
      longPressKey=idxKey(r,c);
      clearTimeout(longPressTimer);
      longPressTimer=setTimeout(()=>{
        if(longPressKey===idxKey(r,c))toggleFlag(r,c);
      },420);
    });
    cell.addEventListener('mouseup',()=>{clearTimeout(longPressTimer);longPressTimer=null;longPressKey=null;});
    cell.addEventListener('mouseleave',()=>{clearTimeout(longPressTimer);longPressTimer=null;longPressKey=null;});
    grid.appendChild(cell);
  }
  refreshUI();
}

document.addEventListener('mouseup',()=>{rightDrag=false;clearTimeout(longPressTimer);longPressTimer=null;longPressKey=null;});

function getCellEl(r,c){return cellEls[r]?.[c]||null;}

function refreshCell(r,c){
  const d=board[r][c],el=getCellEl(r,c); if(!el)return;
  el.className='cell'; el.textContent='';
  const k=idxKey(r,c);
  if(d.open){
    if(wavePending.has(k)){
      el.classList.add('wave-pending');
      return;
    }
    el.classList.add('open');
    if(d.mine){el.classList.add('mine');el.textContent='✹';}
    else if(d.num>0){el.textContent=d.num;el.classList.add(`num-${d.num}`);}
  }else if(d.flag){el.classList.add('flagged');el.textContent='⚑';}
}

function refreshUI(){
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++)refreshCell(r,c);
  document.getElementById('mine-left').textContent=String(flagsLeft);
}

function startTimer(){
  clearInterval(timer);
  timer=setInterval(()=>{seconds++;document.getElementById('timer').textContent=fmtTime(seconds);},1000);
}
function stopTimer(){clearInterval(timer);}

function floodOpen(sr,sc){
  const opened=[];
  const q=[[sr,sc]],seen=new Set([idxKey(sr,sc)]);
  while(q.length){
    const [r,c]=q.shift(),d=board[r][c];
    if(d.open||d.flag)continue;
    d.open=true;
    opened.push([r,c]);
    if(d.num!==0)continue;
    neighbors(r,c).forEach(([nr,nc])=>{
      const k=idxKey(nr,nc);
      if(!seen.has(k)&&!board[nr][nc].mine){seen.add(k);q.push([nr,nc]);}
    });
  }
  return opened;
}

function waveOpenEffect(cells,origin,onDone){
  if(!cells.length){if(onDone)onDone();return;}

  const runId=++waveRunId;
  waveAnimating=true;
  const [or,oc]=origin;
  const ringIntervalMs=26; // 波前速度固定：每圈间隔一致
  const animCellLimit=getWaveAnimCellLimit();
  const enableCellAnim=cells.length<=animCellLimit; // 自适应阈值：不同分辨率/设备保持流畅

  const ringBatches=[];
  let maxRing=0;
  for(const [r,c] of cells){
    const d=Math.abs(r-or)+Math.abs(c-oc);
    if(d>maxRing)maxRing=d;
    if(!ringBatches[d])ringBatches[d]=[];
    ringBatches[d].push([r,c]);
    wavePending.add(idxKey(r,c));
    const el=getCellEl(r,c);
    if(el)el.classList.add('wave-pending');
  }

  let ring=0;
  let offset=0;
  let nextRingAt=performance.now();
  let lastNow=0;
  let avgCostPerCell=0.06; // ms，运行中自适应

  function step(now){
    if(runId!==waveRunId)return;

    if(now<nextRingAt){
      requestAnimationFrame(step);
      return;
    }

    const batch=ringBatches[ring]||[];

    // 按设备实时帧间隔给预算，避免高分辨率/高刷新率抖动
    const frameDelta=lastNow?Math.max(8,Math.min(34,now-lastNow)):16.7;
    lastNow=now;
    const frameBudgetMs=Math.max(2.6,Math.min(6.0,frameDelta*0.33));

    // 根据单格平均成本动态估算本帧可处理数量
    const targetCount=Math.max(6,Math.min(160,Math.floor(frameBudgetMs/avgCostPerCell)));

    const frameStart=performance.now();
    let opened=0;

    while(offset<batch.length && opened<targetCount){
      const [r,c]=batch[offset++];
      wavePending.delete(idxKey(r,c));
      refreshCell(r,c);
      const el=getCellEl(r,c);
      if(el&&enableCellAnim){
        el.classList.remove('wave-open');
        el.classList.add('wave-open');
      }
      opened++;

      if(performance.now()-frameStart>=frameBudgetMs)break;
    }

    if(opened>0){
      const spent=performance.now()-frameStart;
      const cost=spent/opened;
      avgCostPerCell=avgCostPerCell*0.82 + cost*0.18;
      avgCostPerCell=Math.max(0.02,Math.min(0.45,avgCostPerCell));
    }

    if(offset<batch.length){
      requestAnimationFrame(step);
      return;
    }

    if(ring>=maxRing){
      waveAnimating=false;
      if(onDone)onDone();
      return;
    }

    ring++;
    offset=0;
    nextRingAt=now+ringIntervalMs;
    requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function revealAllMines(){for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++)if(board[r][c].mine)board[r][c].open=true;}

function handleLose(){
  gameOver=true;stopTimer();revealAllMines();refreshUI();
  showOverlay('FAILED',`踩到地雷，用时 ${fmtTime(seconds)}。`);
}

function checkWin(){
  let opened=0;
  for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++)if(board[r][c].open&&!board[r][c].mine)opened++;
  if(opened!==mode.rows*mode.cols-mode.mines)return;
  gameOver=true;stopTimer();
  showOverlay('COMPLETE',`恭喜通关！用时 ${fmtTime(seconds)}。`);
}

function autoFlagCascade(){
  if(!autoFlagEnabled||gameOver)return false;
  let any=false,changed=true,guard=0;
  while(changed&&guard++<300){
    changed=false;
    for(let r=0;r<mode.rows;r++)for(let c=0;c<mode.cols;c++){
      const d=board[r][c];
      if(!d.open||d.num<=0)continue;
      const hidden=[];
      let flags=0;
      for(const [nr,nc] of neighbors(r,c)){
        const nd=board[nr][nc];
        if(nd.flag)flags++;
        else if(!nd.open&&!wavePending.has(idxKey(nr,nc)))hidden.push([nr,nc]);
      }
      if(hidden.length&&flags+hidden.length===d.num){
        for(const [nr,nc] of hidden){
          if(board[nr][nc].flag||flagsLeft<=0)continue;
          board[nr][nc].flag=true;
          flagsLeft--;
          changed=true;
          any=true;
        }
      }
    }
  }
  if(any)refreshUI();
  return any;
}

function chordOpen(r,c){
  const d=board[r][c];
  if(!d.open||d.num<=0||gameOver)return false;
  const ns=neighbors(r,c);
  let flags=0;
  ns.forEach(([nr,nc])=>{if(board[nr][nc].flag)flags++;});
  if(flags!==d.num)return false;

  let changed=false;
  const openedAll=[];
  for(const [nr,nc] of ns){
    const nd=board[nr][nc];
    if(nd.open||nd.flag)continue;
    if(nd.mine){handleLose();return true;}
    const opened=floodOpen(nr,nc);
    if(opened.length)openedAll.push(...opened);
    changed=true;
  }
  if(changed){
    waveOpenEffect(openedAll,[r,c],()=>{autoFlagCascade();checkWin();});
    checkWin();
  }
  return changed;
}

function handleCellClick(r,c){
  if(gameOver||waveAnimating)return;
  const d=board[r][c];
  if(d.open)return chordOpen(r,c);
  if(d.flag)return;
  if(firstClick){placeMines(r,c);firstClick=false;started=true;startTimer();}
  if(d.mine)return handleLose();
  const opened=floodOpen(r,c);
  waveOpenEffect(opened,[r,c],()=>{autoFlagCascade();checkWin();});
  checkWin();
}

function toggleFlag(r,c){
  if(gameOver||waveAnimating)return;
  const d=board[r][c];
  if(d.open)return;
  if(d.flag){d.flag=false;flagsLeft++;}
  else if(flagsLeft>0){d.flag=true;flagsLeft--;}
  refreshCell(r,c);
  document.getElementById('mine-left').textContent=String(flagsLeft);
}

function getCustomLimits(){
  const rootStyle=getComputedStyle(document.documentElement);
  const cellSize=parseFloat(rootStyle.getPropertyValue('--cell-size'))||34;
  const cellGap=2;
  const pitch=cellSize+cellGap;

  const main=document.querySelector('.main-container');
  const panel=document.querySelector('.controls-panel');
  const wrapper=document.querySelector('.board-wrapper');
  const mainStyle=main?getComputedStyle(main):null;
  const px=v=>parseFloat(v)||0;

  const padX=mainStyle?px(mainStyle.paddingLeft)+px(mainStyle.paddingRight):24;
  const padY=mainStyle?px(mainStyle.paddingTop)+px(mainStyle.paddingBottom):24;
  const mainGap=mainStyle?px(mainStyle.gap):16;
  const panelW=panel?.offsetWidth||260;

  const wrapStyle=wrapper?getComputedStyle(wrapper):null;
  const boardChromeX=wrapStyle?(px(wrapStyle.paddingLeft)+px(wrapStyle.paddingRight)+px(wrapStyle.borderLeftWidth)+px(wrapStyle.borderRightWidth)):18;
  const boardChromeY=wrapStyle?(px(wrapStyle.paddingTop)+px(wrapStyle.paddingBottom)+px(wrapStyle.borderTopWidth)+px(wrapStyle.borderBottomWidth)):18;
  const safeEdge=0;

  const availW=Math.max(5*pitch,window.innerWidth-padX-panelW-mainGap-boardChromeX-safeEdge);
  const availH=Math.max(5*pitch,window.innerHeight-padY-boardChromeY-safeEdge);

  const maxCols=Math.max(5,Math.floor((availW+cellGap)/pitch));
  const maxRows=Math.max(5,Math.floor((availH+cellGap)/pitch));
  return {maxCols,maxRows};
}

function applyCustom(silent=false){
  const limits=getCustomLimits();
  const rowEl=document.getElementById('custom-rows');
  const colEl=document.getElementById('custom-cols');
  const mineEl=document.getElementById('custom-mines');
  let rows=+rowEl.value, cols=+colEl.value, mines=+mineEl.value;
  if(!Number.isInteger(rows)||!Number.isInteger(cols)||!Number.isInteger(mines))return false;

  rows=Math.min(Math.max(5,rows),limits.maxRows);
  cols=Math.min(Math.max(5,cols),limits.maxCols);
  const maxMines=rows*cols-9;
  mines=Math.min(Math.max(1,mines),maxMines);

  rowEl.value=rows;colEl.value=cols;mineEl.value=mines;

  const custom=MODES.find(m=>m.id==='custom');
  const changed = mode.id!=='custom' || custom.rows!==rows || custom.cols!==cols || custom.mines!==mines;

  custom.rows=rows;custom.cols=cols;custom.mines=mines;
  mode=custom;
  document.querySelectorAll('.mode-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode==='custom'));

  if(changed)newGame();
  return changed;
}

function syncCustomInputLimits(){
  const {maxCols,maxRows}=getCustomLimits();
  const colEl=document.getElementById('custom-cols');
  const rowEl=document.getElementById('custom-rows');
  if(colEl)colEl.max=String(maxCols);
  if(rowEl)rowEl.max=String(maxRows);
}

function bindCustomInputs(){
  ['custom-rows','custom-cols','custom-mines'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('input',()=>{ if(mode.id==='custom')applyCustom(true); });
  });
}

function showOverlay(title,msg){
  document.getElementById('result-title').textContent=title;
  document.getElementById('result-message').textContent=msg;
  document.getElementById('result-overlay').classList.add('show');
}
function closeOverlay(){document.getElementById('result-overlay').classList.remove('show');}

function newGame(){
  waveRunId++; // 取消正在进行的波动画任务
  waveAnimating=false;
  wavePending.clear();
  stopTimer();seconds=0;document.getElementById('timer').textContent='00:00';
  board=buildEmptyBoard();started=false;gameOver=false;firstClick=true;flagsLeft=mode.mines;
  closeOverlay();renderBoard();
}

function updateAutoFlagToggleUI(){
  const sw=document.getElementById('auto-flag-toggle');
  if(sw)sw.checked=autoFlagEnabled;
}

function bindActions(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-action]'); if(!btn)return;
    const a=btn.dataset.action;
    if(a==='new-game')newGame();
    else if(a==='reset-game')newGame();
    else if(a==='close-overlay')closeOverlay();
  });
  const sw=document.getElementById('auto-flag-toggle');
  if(sw)sw.addEventListener('change',()=>{autoFlagEnabled=sw.checked;});
}

syncCustomInputLimits();
window.addEventListener('resize',()=>{syncCustomInputLimits();if(mode.id==='custom')applyCustom(true);});
initModeTabs();
bindActions();
bindCustomInputs();
updateAutoFlagToggleUI();
newGame();