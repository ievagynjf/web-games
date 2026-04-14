/* STATE — all declared before any function that uses them */
let gameMode='normal', difficulty='beginner', notesMode=false;
let solution=[], puzzle=[], userBoard=[], notesBoard=[];
let cages=[], cellCageMap={};
let selectedCell=null, multiSelected=new Set(), isDragging=false, ctrlHeld=false;
let errorCount=0, hintCount=0, secondsElapsed=0, timerInterval=null, gameWon=false;
let givenCells=new Set(), hintCells=new Set();
let longPressTimer=null, longPressOrigin=null;
const LONG_PRESS_MS=120;
let activeColNum=0, bivalueMode=false, colorMarkMode=false;
let cellHintsLeft=3;
let undoStack=[];
let currentMarkColor='#ff6b6b';
let noteColors=Array.from({length:9},()=>Array.from({length:9},()=>({})));
const CS=65;
const MODE_WEIGHT={normal:1,killer:1.6};
const COLOR_PRESETS=['#ff6b6b','#ff9f43','#ffd32a','#0be881','#48dbfb','#ff9ff3','#a29bfe','#fd79a8','#c0c0c0'];
const DIFF_OPTIONS=[
  {value:'beginner',label:'入门'},
  {value:'easy',label:'简单'},
  {value:'medium',label:'中等'},
  {value:'hard',label:'困难'},
  {value:'expert',label:'专家'},
  {value:'master',label:'大师'},
];
const ACTION_OPTIONS=[
  {action:'new-game',label:'新游戏',cls:'primary'},
  {action:'reset-board',label:'重置',cls:''},
  {action:'give-hint',label:'填充数字',cls:'blue-btn'},
  {action:'fill-candidates',label:'填候选数',cls:'purple-btn'},
  {action:'show-import',label:'导入',cls:''},
  {action:'show-export',label:'导出',cls:''},
];
const DIFF_META={
  beginner:{label:'入门',cellVal:10,expectedSecs:180,killerKeep:22,weight:0.6},
  easy:{label:'简单',cellVal:18,expectedSecs:300,killerKeep:15,weight:1},
  medium:{label:'中等',cellVal:35,expectedSecs:480,killerKeep:10,weight:1.8},
  hard:{label:'困难',cellVal:60,expectedSecs:720,killerKeep:5,weight:2.8},
  expert:{label:'专家',cellVal:90,expectedSecs:1080,killerKeep:2,weight:4},
  master:{label:'大师',cellVal:130,expectedSecs:1500,killerKeep:1,weight:5.5},
};
const SIZE=9, BOX=3;
const cellEls=Array.from({length:SIZE},()=>Array(SIZE).fill(null));

function keyOf(r,c){return `${r},${c}`;}
function boxStart(i){return Math.floor(i/BOX)*BOX;}
function scheduleSave(){setTimeout(saveProgress,0);}
function forEachPeer(r,c,fn){
  for(let i=0;i<SIZE;i++){ if(i!==c)fn(r,i); if(i!==r)fn(i,c); }
  const br=boxStart(r),bc=boxStart(c);
  for(let dr=0;dr<BOX;dr++)for(let dc=0;dc<BOX;dc++){
    const nr=br+dr,nc=bc+dc;
    if(nr!==r||nc!==c)fn(nr,nc);
  }
}

function renderButtons(gridId,options,build){
  const grid=document.getElementById(gridId);
  if(!grid)return;
  grid.innerHTML='';
  options.forEach((item,idx)=>grid.appendChild(build(item,idx)));
}

function renderActionButtons(){
  renderButtons('action-grid',ACTION_OPTIONS,item=>{
    const btn=document.createElement('button');
    btn.className='action-btn'+(item.cls?` ${item.cls}`:'');
    btn.dataset.action=item.action;
    btn.textContent=item.label;
    return btn;
  });
}

function renderDiffButtons(){
  renderButtons('diff-grid',DIFF_OPTIONS,(item,idx)=>{
    const btn=document.createElement('button');
    btn.className='diff-btn'+(idx===0?' active':'');
    btn.dataset.action='set-diff';
    btn.dataset.diff=item.value;
    btn.textContent=item.label;
    return btn;
  });
}

function renderNumColumn(){
  const col=document.getElementById('num-column');
  if(!col)return;
  col.innerHTML='';
  for(let n=1;n<=9;n++){
    const btn=document.createElement('button');
    btn.className='num-col-btn';
    btn.id=`nc-${n}`;
    btn.dataset.action='num-col';
    btn.dataset.num=String(n);
    btn.textContent=String(n);
    col.appendChild(btn);
  }
  const erase=document.createElement('button');
  erase.className='num-col-btn erase-col-btn';
  erase.id='nc-0';
  erase.dataset.action='num-col';
  erase.dataset.num='0';
  erase.textContent='✕';
  col.appendChild(erase);

  const notes=document.createElement('button');
  notes.className='num-col-btn notes-col-btn';
  notes.id='nc-notes';
  notes.dataset.action='toggle-notes';
  notes.textContent='✎';
  col.appendChild(notes);

  const bivalue=document.createElement('button');
  bivalue.className='num-col-btn bivalue-btn';
  bivalue.id='nc-bivalue';
  bivalue.dataset.action='toggle-bivalue';
  bivalue.title='高亮已标注两个候选数的格子';
  bivalue.innerHTML='<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="1" y="1" width="26" height="26" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/><text x="5" y="12" font-family="JetBrains Mono,monospace" font-size="9" font-weight="700" fill="currentColor">1</text><text x="17" y="26" font-family="JetBrains Mono,monospace" font-size="9" font-weight="700" fill="currentColor">9</text></svg>';
  col.appendChild(bivalue);

  const color=document.createElement('button');
  color.className='num-col-btn colormark-btn';
  color.id='nc-color';
  color.dataset.action='toggle-color-mark';
  color.title='候选数颜色标记';
  color.innerHTML='<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="1" y="1" width="26" height="26" rx="3" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="3" y="3" width="9" height="9" rx="2" fill="currentColor" opacity="0.9"/><text x="5" y="11" font-family="JetBrains Mono,monospace" font-size="8" font-weight="900" fill="#1a1408">1</text><text x="16" y="11" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="currentColor">2</text><text x="16" y="24" font-family="JetBrains Mono,monospace" font-size="8" font-weight="700" fill="currentColor">3</text></svg>';
  col.appendChild(color);
}

function fmtTime(s){return String(~~(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function loadHistory(){try{return JSON.parse(localStorage.getItem('sudoku_history')||'{}');}catch(e){return {};}}
function saveHistory(h){try{localStorage.setItem('sudoku_history',JSON.stringify(h));}catch(e){}}
function refreshHistory(){const h=loadHistory();document.getElementById('best-score').textContent=h.bestScore>0?h.bestScore:'—';document.getElementById('best-time').textContent=h.bestTime!=null?fmtTime(h.bestTime):'—';}
function recordWin(score){const h=loadHistory();if(score>(h.bestScore||0))h.bestScore=score;if(h.bestTime==null||secondsElapsed<h.bestTime)h.bestTime=secondsElapsed;saveHistory(h);refreshHistory();}
function updateStats(){document.getElementById('cur-score').textContent=calcScore(secondsElapsed,errorCount,hintCount,difficulty,gameMode);}
function updateHearts(){
  const el=document.getElementById('life-display');
  if(el)el.textContent=`错误 ${errorCount}/3`;
}
function updateNumColUI(){const counts={};for(let r=0;r<9;r++)for(let c=0;c<9;c++){const v=userBoard[r][c];if(v>0)counts[v]=(counts[v]||0)+1;}for(let i=1;i<=9;i++){const btn=document.getElementById(`nc-${i}`);if(!btn)continue;const done=counts[i]===9;btn.classList.toggle('digit-active',i===activeColNum&&!done);btn.classList.toggle('completed',done);}}

/* TIMER */
function startTimer(){secondsElapsed=0;timerInterval=setInterval(()=>{secondsElapsed++;document.getElementById('timer').textContent=fmtTime(secondsElapsed);updateStats();if(secondsElapsed%30===0)saveProgress();},1000);}
function stopTimer(){clearInterval(timerInterval);}
function resetTimer(){stopTimer();document.getElementById('timer').textContent='00:00';}
document.addEventListener('visibilitychange',()=>{if(gameWon)return;if(document.hidden){stopTimer();}else{timerInterval=setInterval(()=>{secondsElapsed++;document.getElementById('timer').textContent=fmtTime(secondsElapsed);updateStats();},1000);}});

/* ENGINE */
function generateSolution(){const b=Array.from({length:9},()=>Array(9).fill(0));fillBoard(b);return b;}
function fillBoard(b){const e=findEmpty(b);if(!e)return true;const[r,c]=e;for(const n of shuffle([1,2,3,4,5,6,7,8,9]))if(isValid(b,r,c,n)){b[r][c]=n;if(fillBoard(b))return true;b[r][c]=0;}return false;}
function findEmpty(b){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!b[r][c])return[r,c];return null;}
function isValid(b,row,col,num){
  for(let i=0;i<SIZE;i++){if(b[row][i]===num||b[i][col]===num)return false;}
  const br=boxStart(row),bc=boxStart(col);
  for(let dr=0;dr<BOX;dr++)for(let dc=0;dc<BOX;dc++)if(b[br+dr][bc+dc]===num)return false;
  return true;
}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=~~(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function getCandidates(b,r,c){
  if(b[r][c])return new Set();
  const used=new Set();
  forEachPeer(r,c,(nr,nc)=>{const v=b[nr][nc];if(v)used.add(v);});
  const s=new Set();
  for(let n=1;n<=SIZE;n++)if(!used.has(n))s.add(n);
  return s;
}
function cellIsConflict(b,r,c){
  const v=b[r][c];
  if(!v)return false;
  let hasConflict=false;
  forEachPeer(r,c,(nr,nc)=>{if(!hasConflict&&b[nr][nc]===v)hasConflict=true;});
  return hasConflict;
}
function noteConflictsPlaced(b,r,c,n){
  let conflict=false;
  forEachPeer(r,c,(nr,nc)=>{if(!conflict&&b[nr][nc]===n)conflict=true;});
  return conflict;
}


function calcScore(secs,errors,hints,diff,mode){
  const meta=DIFF_META[diff]||DIFF_META.easy;
  const mw=MODE_WEIGHT[mode]||1;
  const timeFactor=Math.max(0.5, Math.min(2.0, meta.expectedSecs/Math.max(30,secs)));
  const errorFactor=Math.max(0.4, 1-errors*0.2);
  const hintFactor=Math.max(0.5, 1-hints*0.15);
  let filled=0;
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    if(userBoard[r][c]!==0&&!givenCells.has(keyOf(r,c))&&userBoard[r][c]===solution[r][c])filled++;
  }
  return Math.round(filled*meta.cellVal*mw*timeFactor*errorFactor*hintFactor);
}

function generateKillerCages(sol){const assigned=Array.from({length:9},()=>Array(9).fill(-1));const out=[];let idx=0;for(const[sr,sc]of shuffle(Array.from({length:81},(_,i)=>[~~(i/9),i%9]))){if(assigned[sr][sc]!==-1)continue;const max=2+~~(Math.random()*4);const cells=[[sr,sc]];assigned[sr][sc]=idx;const q=[[sr,sc]];while(q.length&&cells.length<max){const[r,c]=q.shift();for(const[nr,nc]of shuffle([[r-1,c],[r+1,c],[r,c-1],[r,c+1]])){if(nr>=0&&nr<9&&nc>=0&&nc<9&&assigned[nr][nc]===-1&&cells.length<max){assigned[nr][nc]=idx;cells.push([nr,nc]);q.push([nr,nc]);break;}}}out.push({cells,sum:cells.reduce((s,[r,c])=>s+sol[r][c],0)});idx++;}return out;}

/* RENDER */
function renderBoard(){
  const board=document.getElementById('sudoku-board');board.innerHTML='';givenCells.clear();hintCells.clear();
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){
    const cell=document.createElement('div');cell.className='cell';cell.dataset.row=r;cell.dataset.col=c;
    cellEls[r][c]=cell;
    if(puzzle[r][c]!==0)givenCells.add(keyOf(r,c));
    if(gameMode==='killer'){
      cell.classList.add('killer-cell');
      const key=keyOf(r,c);
      if(cellCageMap[key]!==undefined){
        const cage=cages[cellCageMap[key]];
        const sorted=[...cage.cells].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
        if(sorted[0][0]===r&&sorted[0][1]===c){
          const sl=document.createElement('div');sl.className='cage-sum';sl.textContent=cage.sum;cell.appendChild(sl);
        }
      }
    }
    cell.addEventListener('mousedown',e=>onCellMouseDown(e,r,c));
    cell.addEventListener('mouseenter',e=>onCellMouseEnter(e,r,c));
    board.appendChild(cell);
  }
  if(gameMode==='killer')drawCageOverlay();else document.getElementById('cage-overlay').innerHTML='';
  refreshAllCells();
}

function forEachCell(fn){for(let r=0;r<9;r++)for(let c=0;c<9;c++)fn(r,c);}
function getCellEl(r,c){return cellEls[r]?.[c]||null;}
function clearPeersNotes(r,c,val){forEachPeer(r,c,(nr,nc)=>notesBoard[nr][nc].delete(val));}
function refreshAllCells(){forEachCell((r,c)=>refreshCellContent(r,c));applyHighlights();updateNumColUI();}
function refreshAfterBoardChange({stats=false}={}){refreshAllCells();if(stats)updateStats();}

function refreshCellContent(r,c){
  const cell=getCellEl(r,c);if(!cell)return;
  const cageSum=cell.querySelector('.cage-sum');const isKiller=cell.classList.contains('killer-cell');const isGiven=givenCells.has(`${r},${c}`);
  cell.className='cell'+(isKiller?' killer-cell':'')+(isGiven?' given':'');cell.innerHTML='';if(cageSum)cell.appendChild(cageSum);
  const val=userBoard[r][c];
  if(val!==0){const isWrong=!isGiven&&!hintCells.has(`${r},${c}`)&&val!==solution[r][c];if(!isGiven){if(isWrong)cell.classList.add('num-conflict','user-err');else if(hintCells.has(`${r},${c}`))cell.classList.add('hint-cell');else cell.classList.add('user-ok');}cell.appendChild(document.createTextNode(val));}
  else{const notes=notesBoard[r][c];if(notes.size>0){const grid=document.createElement('div');grid.className='notes-grid';for(let n=1;n<=9;n++){const nd=document.createElement('div');const on=notes.has(n);nd.className='note-num'+(on?' on':'');if(on&&noteConflictsPlaced(userBoard,r,c,n))nd.classList.add('conflict-note');nd.textContent=on?n:'';const mark=noteColors[r][c][n];if(on&&mark){nd.style.background=mark;nd.style.color='#1a1408';nd.style.fontWeight='800';nd.style.textShadow='none';nd.style.borderRadius='3px';}grid.appendChild(nd);}cell.appendChild(grid);}}
}

/* HIGHLIGHTS */
function applyHighlights(){
  document.querySelectorAll('.cell').forEach(cell=>cell.classList.remove('hl-related','hl-same','hl-conflict','hl-selected','hl-bivalue'));
  document.querySelectorAll('.note-num.hl-match').forEach(nd=>nd.classList.remove('hl-match'));
  forEachCell((r,c)=>{if(userBoard[r][c]&&cellIsConflict(userBoard,r,c)){const cell=getCellEl(r,c);if(cell)cell.classList.add('hl-conflict');}});
  if(bivalueMode){forEachCell((r,c)=>{if(userBoard[r][c]!==0)return;if(notesBoard[r][c].size===2){const cell=getCellEl(r,c);if(cell)cell.classList.add('hl-bivalue');}});}

  if(selectedCell){
    const[sr,sc]=selectedCell;
    const selVal=userBoard[sr][sc]||puzzle[sr][sc]||0;
    document.querySelectorAll('.cell').forEach(cell=>{
      const r=+cell.dataset.row,c=+cell.dataset.col;
      if(r===sr&&c===sc){cell.classList.add('hl-selected');return;}
      const sameBox=~~(r/3)===~~(sr/3)&&~~(c/3)===~~(sc/3);
      const cellVal=userBoard[r][c]||puzzle[r][c]||0;
      if(selVal&&cellVal===selVal){cell.classList.add('hl-same');return;}
      if(r===sr||c===sc||sameBox)cell.classList.add('hl-related');
    });
  }

  const hlVal = activeColNum > 0 ? activeColNum :
    (selectedCell ? (userBoard[selectedCell[0]][selectedCell[1]]||puzzle[selectedCell[0]][selectedCell[1]]||0) : 0);

  if(hlVal){
    if(activeColNum>0 && !selectedCell){
      document.querySelectorAll('.cell').forEach(cell=>{
        const r=+cell.dataset.row,c=+cell.dataset.col;
        const cellVal=userBoard[r][c]||puzzle[r][c]||0;
        if(cellVal===hlVal) cell.classList.add('hl-same');
      });
    }
    document.querySelectorAll('.cell').forEach(cell=>{
      const r=+cell.dataset.row,c=+cell.dataset.col;
      if(notesBoard[r]&&notesBoard[r][c]&&notesBoard[r][c].has(hlVal)){
        const nn=cell.querySelectorAll('.note-num');
        if(nn[hlVal-1])nn[hlVal-1].classList.add('hl-match');
      }
    });
  }

  drawMultiOverlay();
}

function drawMultiOverlay(){
  const svg=document.getElementById('multi-overlay');svg.innerHTML='';if(multiSelected.size===0)return;
  const fillColor='rgba(184,122,255,0.18)',strokeColor='#b87aff';
  multiSelected.forEach(key=>{const[r,c]=key.split(',').map(Number);const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.setAttribute('x',c*CS);rect.setAttribute('y',r*CS);rect.setAttribute('width',CS);rect.setAttribute('height',CS);rect.setAttribute('fill',fillColor);svg.appendChild(rect);});
  const drawn=new Set();
  multiSelected.forEach(key=>{const[r,c]=key.split(',').map(Number);[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr,nc])=>{if(multiSelected.has(`${nr},${nc}`))return;const ek=`${Math.min(r,nr)},${Math.min(c,nc)},${r===nr?'h':'v'}`;if(drawn.has(ek))return;drawn.add(ek);const line=document.createElementNS('http://www.w3.org/2000/svg','line');if(r===nr){const x=nc>c?(c+1)*CS:c*CS;line.setAttribute('x1',x);line.setAttribute('y1',r*CS);line.setAttribute('x2',x);line.setAttribute('y2',(r+1)*CS);}else{const y=nr>r?(r+1)*CS:r*CS;line.setAttribute('x1',c*CS);line.setAttribute('y1',y);line.setAttribute('x2',(c+1)*CS);line.setAttribute('y2',y);}line.setAttribute('stroke',strokeColor);line.setAttribute('stroke-width','2.5');svg.appendChild(line);});});
}

/* CAGE OVERLAY */
function bRight(c){return c===2||c===5?3:1;}
function bBottom(r){return r===2||r===5?3:1;}
function drawCageOverlay(){
  const svg=document.getElementById('cage-overlay');svg.innerHTML='';
  const INS=3, cageColor='#9a7c48';
  function drawLine(x1,y1,x2,y2){
    if(x1===x2&&y1===y2)return;
    const l=document.createElementNS('http://www.w3.org/2000/svg','line');
    l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2);
    l.setAttribute('stroke',cageColor);l.setAttribute('stroke-width','1.5');
    l.setAttribute('stroke-dasharray','4 3');l.setAttribute('stroke-linecap','round');
    l.setAttribute('opacity','0.9');
    svg.appendChild(l);
  }
  const lL=c=>c*CS+INS,  lR=c=>(c+1)*CS-bRight(c)-INS;
  const lT=r=>r*CS+INS,  lB=r=>(r+1)*CS-bBottom(r)-INS;

  cages.forEach(cage=>{
    const cellSet=new Set(cage.cells.map(([r,c])=>`${r},${c}`));
    const hSegs={}, vSegs={};
    cage.cells.forEach(([r,c])=>{
      if(!cellSet.has(`${r-1},${c}`)){const y=lT(r);(hSegs[y]=hSegs[y]||[]).push([lL(c),lR(c)]);}
      if(!cellSet.has(`${r+1},${c}`)){const y=lB(r);(hSegs[y]=hSegs[y]||[]).push([lL(c),lR(c)]);}
      if(!cellSet.has(`${r},${c-1}`)){const x=lL(c);(vSegs[x]=vSegs[x]||[]).push([lT(r),lB(r)]);}
      if(!cellSet.has(`${r},${c+1}`)){const x=lR(c);(vSegs[x]=vSegs[x]||[]).push([lT(r),lB(r)]);}
    });

    function merge(arr){
      if(!arr.length)return[];
      arr.sort((a,b)=>a[0]-b[0]);
      const m=[[...arr[0]]];
      for(let i=1;i<arr.length;i++){
        const last=m[m.length-1];
        if(arr[i][0]<=last[1]+bRight(0)*2+INS*4)
          last[1]=Math.max(last[1],arr[i][1]);
        else m.push([...arr[i]]);
      }
      return m;
    }

    Object.entries(hSegs).forEach(([y,arr])=>merge(arr).forEach(([x1,x2])=>drawLine(x1,+y,x2,+y)));
    Object.entries(vSegs).forEach(([x,arr])=>merge(arr).forEach(([y1,y2])=>drawLine(+x,y1,+x,y2)));

    for(let r=0;r<=9;r++)for(let c=0;c<=9;c++){
      const tl=cellSet.has(`${r-1},${c-1}`);
      const tr=cellSet.has(`${r-1},${c}`);
      const bl=cellSet.has(`${r},${c-1}`);
      const br=cellSet.has(`${r},${c}`);
      if([tl,tr,bl,br].filter(Boolean).length!==3)continue;
      if(!tl){ drawLine(lR(c-1),lT(r),lL(c),lT(r)); drawLine(lL(c),lB(r-1),lL(c),lT(r)); }
      if(!tr){ drawLine(lL(c),lT(r),lR(c-1),lT(r)); drawLine(lR(c-1),lT(r),lR(c-1),lB(r-1)); }
      if(!bl){ drawLine(lL(c),lB(r),lL(c),lB(r-1)); drawLine(lR(c-1),lB(r-1),lL(c),lB(r-1)); }
      if(!br){ drawLine(lR(c-1),lB(r),lR(c-1),lB(r-1)); drawLine(lL(c),lB(r-1),lR(c-1),lB(r-1)); }
    }
  });
}

/* CELL INTERACTION */
function onCellMouseDown(e,r,c){
  e.preventDefault();
  if(colorMarkMode){
    const cell=document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);if(!cell)return;
    if(givenCells.has(`${r},${c}`)||userBoard[r][c]!==0)return;
    const rect=cell.getBoundingClientRect();
    const col3=Math.min(2,Math.floor((e.clientX-rect.left)/rect.width*3));
    const row3=Math.min(2,Math.floor((e.clientY-rect.top)/rect.height*3));
    const n=row3*3+col3+1;if(n<1||n>9)return;
    if(!notesBoard[r][c].has(n))return;
    if(noteColors[r][c][n]===currentMarkColor){delete noteColors[r][c][n];}else{noteColors[r][c][n]=currentMarkColor;}
    refreshCellContent(r,c);applyHighlights();return;
  }
  if(activeColNum>0){
    isDragging=true;
    selectCell(r,c);
    return;
  }
  if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}longPressOrigin=null;
  if(ctrlHeld){if(selectedCell&&multiSelected.size===0){multiSelected.add(`${selectedCell[0]},${selectedCell[1]}`);selectedCell=null;}startMultiDrag(r,c,true);}
  else{
    if(selectedCell&&selectedCell[0]===r&&selectedCell[1]===c){selectedCell=null;multiSelected.clear();applyHighlights();return;}
    selectCell(r,c);longPressOrigin=[r,c];longPressTimer=setTimeout(()=>{longPressTimer=null;},LONG_PRESS_MS);
  }
}
function startMultiDrag(r,c,additive){isDragging=true;const key=`${r},${c}`;if(additive&&multiSelected.size>0){if(multiSelected.has(key))multiSelected.delete(key);else multiSelected.add(key);}else{multiSelected.clear();multiSelected.add(key);}selectedCell=null;applyHighlights();}
function onCellMouseEnter(e,r,c){
  if(activeColNum>0&&isDragging){selectCell(r,c);return;}
  if(ctrlHeld&&isDragging){multiSelected.add(`${r},${c}`);selectedCell=null;applyHighlights();return;}
  if(longPressOrigin&&(r!==longPressOrigin[0]||c!==longPressOrigin[1])){if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}if(!isDragging){isDragging=true;multiSelected.clear();multiSelected.add(`${longPressOrigin[0]},${longPressOrigin[1]}`);selectedCell=null;}multiSelected.add(`${r},${c}`);applyHighlights();}
}
document.addEventListener('mouseup',()=>{isDragging=false;longPressOrigin=null;if(longPressTimer){clearTimeout(longPressTimer);longPressTimer=null;}});
function selectCell(r,c){
  if(activeColNum>0){
    selectedCell=[r,c];
    multiSelected.clear();
    applyHighlights();
    inputNum(activeColNum);
    selectedCell=null;
    applyHighlights();
  } else {
    selectedCell=[r,c];
    multiSelected.clear();
    applyHighlights();
  }
}

/* UNDO */
function pushUndo(){
  undoStack.push({
    userBoard:userBoard.map(r=>[...r]),
    notesBoard:notesBoard.map(r=>r.map(s=>new Set(s))),
    noteColors:noteColors.map(r=>r.map(o=>({...o}))),
    hintCells:new Set(hintCells),
    errorCount,
  });
  if(undoStack.length>50)undoStack.shift();
  scheduleSave();
}
function undoLast(){
  if(gameWon||undoStack.length===0)return;
  const s=undoStack.pop();
  userBoard=s.userBoard;
  notesBoard=s.notesBoard;
  noteColors=s.noteColors;
  hintCells=s.hintCells;
  refreshAfterBoardChange({stats:true});
  scheduleSave();
}

/* INPUT */
function inputNum(n){
  if(gameWon)return;
  if(multiSelected.size>0&&n!==0){
    pushUndo();
    let allHave=true;multiSelected.forEach(key=>{const[r,c]=key.split(',').map(Number);if(!givenCells.has(key)&&userBoard[r][c]===0&&!notesBoard[r][c].has(n))allHave=false;});multiSelected.forEach(key=>{const[r,c]=key.split(',').map(Number);if(givenCells.has(key)||userBoard[r][c]!==0)return;if(allHave)notesBoard[r][c].delete(n);else notesBoard[r][c].add(n);refreshCellContent(r,c);});applyHighlights();return;
  }
  if(!selectedCell)return;const[r,c]=selectedCell,k=keyOf(r,c);if(givenCells.has(k))return;
  if(notesMode&&n!==0){if(userBoard[r][c]!==0)return;pushUndo();const notes=notesBoard[r][c];notes.has(n)?notes.delete(n):notes.add(n);refreshCellContent(r,c);applyHighlights();return;}
  if(n===0){
    if(userBoard[r][c]===0&&notesBoard[r][c].size===0)return;
    pushUndo();
    userBoard[r][c]=0;notesBoard[r][c].clear();noteColors[r][c]={};hintCells.delete(k);
    refreshAfterBoardChange();return;
  }
  pushUndo();
  const prevVal=userBoard[r][c];
  notesBoard[r][c].clear();noteColors[r][c]={};userBoard[r][c]=n;hintCells.delete(k);
  clearPeersNotes(r,c,n);
  if(n!==solution[r][c]&&prevVal!==n){errorCount++;updateHearts();updateStats();const cell=document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);if(cell){cell.classList.add('anim-shake');setTimeout(()=>cell.classList.remove('anim-shake'),350);}if(errorCount>=3){gameWon=true;stopTimer();refreshAfterBoardChange();setTimeout(()=>showResultOverlay('lose','错误次数已达三次，挑战失败'),400);return;}}
  refreshAfterBoardChange({stats:true});
  if(n===solution[r][c])checkDigitComplete(n);
  checkWin();
}

function fillAllCandidates(){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){if(userBoard[r][c]!==0)continue;notesBoard[r][c]=getCandidates(userBoard,r,c);}refreshAfterBoardChange();scheduleSave();}

function giveHint(){
  if(gameWon)return;
  let anyFilled=false,progress=true;
  while(progress){
    progress=false;
    forEachCell((r,c)=>{if(userBoard[r][c]!==0)return;const ca=getCandidates(userBoard,r,c);if(ca.size!==1)return;const val=[...ca][0];userBoard[r][c]=val;notesBoard[r][c].clear();hintCells.add(keyOf(r,c));clearPeersNotes(r,c,val);hintCount++;progress=anyFilled=true;});
  }
  if(!anyFilled)return;
  refreshAfterBoardChange({stats:true});
  document.querySelectorAll('.cell.hint-cell').forEach((cell,i)=>setTimeout(()=>{cell.classList.add('anim-hint');setTimeout(()=>cell.classList.remove('anim-hint'),450);},i*6));
  checkWin();scheduleSave();
}

function useCellHint(){
  if(gameWon||cellHintsLeft<=0||!selectedCell)return;
  const[r,c]=selectedCell;
  if(givenCells.has(keyOf(r,c))||userBoard[r][c]===solution[r][c])return;
  cellHintsLeft--;updateCellHintBtn();
  userBoard[r][c]=solution[r][c];notesBoard[r][c].clear();hintCells.add(keyOf(r,c));
  clearPeersNotes(r,c,solution[r][c]);hintCount++;
  const cell=getCellEl(r,c);
  refreshAfterBoardChange({stats:true});
  if(cell){cell.classList.add('anim-hint');setTimeout(()=>cell.classList.remove('anim-hint'),450);}
  checkWin();scheduleSave();
}
function updateCellHintBtn(){
  const btn=document.getElementById('cell-hint-btn');
  const lbl=document.getElementById('cell-hint-left');
  const used=3-cellHintsLeft;
  if(lbl)lbl.textContent=`${used}/3`;
  if(btn){btn.disabled=cellHintsLeft<=0;btn.style.opacity='';}
}

function initRoundState(){
  notesBoard=Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
  hintCells.clear();
  errorCount=0;
  hintCount=0;
  activeColNum=0;
  cellHintsLeft=3;
  undoStack=[];
  selectedCell=null;
  multiSelected.clear();
  gameWon=false;
  updateCellHintBtn();
}

function rebuildGivenCells(){
  givenCells.clear();
  forEachCell((r,c)=>{if(puzzle[r][c]!==0)givenCells.add(keyOf(r,c));});
}

function syncModeDiffUI(){
  document.querySelectorAll('.mode-tab').forEach((b,i)=>b.classList.toggle('active',i===(gameMode==='killer'?1:0)));
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.toggle('active',b.dataset.diff===difficulty));
}
function syncImportModeUI(){
  document.querySelectorAll('.mode-tab').forEach((b,i)=>b.classList.toggle('active',i===0));
  document.querySelectorAll('.diff-btn').forEach(b=>b.classList.remove('active'));
}
function restartRoundAndRender(){resetTimer();startTimer();renderBoard();updateHearts();updateStats();updateNumColUI();}
function resetBoard(){userBoard=puzzle.map(r=>[...r]);initRoundState();restartRoundAndRender();scheduleSave();}

function checkDigitComplete(n){
  let count=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(userBoard[r][c]===n&&userBoard[r][c]===solution[r][c])count++;
  if(count!==9)return;
  document.querySelectorAll('.cell').forEach(cell=>{
    const r=+cell.dataset.row,c=+cell.dataset.col;
    if(userBoard[r][c]===n){
      setTimeout(()=>{cell.classList.add('anim-complete');setTimeout(()=>cell.classList.remove('anim-complete'),500);},~~(Math.random()*80));
    }
  });
}

function showResultOverlay(type,message){
  const overlay=document.getElementById('result-overlay'),title=document.getElementById('result-title'),msg=document.getElementById('result-message'),retry=document.getElementById('result-retry-btn'),secondary=document.getElementById('result-secondary-btn');
  if(!overlay||!title||!msg||!retry||!secondary)return;
  const lose=type==='lose';
  title.textContent=lose?'FAILED':'COMPLETE';
  title.classList.toggle('fail',lose);
  msg.textContent=message||(lose?'错误次数已达三次，挑战失败':'恭喜完成！');
  retry.classList.toggle('fail',lose);
  retry.textContent=lose?'再来一局':'继续';
  retry.dataset.action='result-retry';
  secondary.textContent=lose?'查看答案':'返回';
  secondary.dataset.action=lose?'reveal-board':'close-overlay';
  overlay.classList.add('show');
}

function checkWin(){
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(userBoard[r][c]!==solution[r][c])return;
  if(gameMode==='killer')for(const cage of cages)if(cage.cells.reduce((s,[r,c])=>s+userBoard[r][c],0)!==cage.sum)return;
  gameWon=true;stopTimer();
  const score=calcScore(secondsElapsed,errorCount,hintCount,difficulty,gameMode);recordWin(score);
  showResultOverlay('win',`难度: ${(DIFF_META[difficulty]?.label)||difficulty} · 用时: ${fmtTime(secondsElapsed)} · 错误: ${errorCount} · 得分: ${score}`);
}
function revealBoard(){for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const k=keyOf(r,c);if(!givenCells.has(k)){userBoard[r][c]=solution[r][c];notesBoard[r][c].clear();hintCells.add(k);}}refreshAfterBoardChange();}

function getTransformCoord(tf,r,c){
  switch(tf){
    case 0:return[r,c];
    case 1:return[c,8-r];
    case 2:return[8-r,8-c];
    case 3:return[8-c,r];
    case 4:return[r,8-c];
    case 5:return[8-r,c];
    case 6:return[c,r];
    case 7:return[8-c,8-r];
    default:return[r,c];
  }
}

function parseGridString(s){return Array.from({length:9},(_,r)=>Array.from({length:9},(_,c)=>+s[r*9+c]));}

function morphGrid(grid,tf,digitMap){
  const out=Array.from({length:9},()=>Array(9).fill(0));
  forEachCell((r,c)=>{const[nr,nc]=getTransformCoord(tf,r,c);out[nr][nc]=digitMap[grid[r][c]];});
  return out;
}

function buildNormalPuzzleFromBank(){
  const bank=PUZZLE_BANK[difficulty]||PUZZLE_BANK.easy;
  const entry=bank[~~(Math.random()*bank.length)];
  const digitMap=[0,...shuffle([1,2,3,4,5,6,7,8,9])];
  const tf=~~(Math.random()*8);
  const basePuzzle=parseGridString(entry[0]);
  const baseSolution=parseGridString(entry[1]);
  return {
    puzzle:morphGrid(basePuzzle,tf,digitMap),
    solution:morphGrid(baseSolution,tf,digitMap),
  };
}

function newGame(){
  if(gameMode==='killer'){
    solution=generateSolution();
    puzzle=solution.map(r=>[...r]);
  } else {
    const normal=buildNormalPuzzleFromBank();
    puzzle=normal.puzzle;
    solution=normal.solution;
  }
  userBoard=puzzle.map(r=>[...r]);
  cages=[];cellCageMap={};
  initRoundState();
  bivalueMode=false;
  const bivalueBtn=document.getElementById('nc-bivalue');
  if(bivalueBtn)bivalueBtn.classList.remove('active');
  if(colorMarkMode){
    colorMarkMode=false;
    const colorBtn=document.getElementById('nc-color');
    if(colorBtn)colorBtn.classList.remove('active');
    const strip=document.getElementById('color-strip');
    if(strip)strip.style.display='none';
  }
  if(gameMode==='killer'){
    cages=generateKillerCages(solution);
    cages.forEach((cage,idx)=>cage.cells.forEach(([r,c])=>{cellCageMap[keyOf(r,c)]=idx;}));
    const keepCount=DIFF_META[difficulty]?.killerKeep??15;
    const keep=new Set(shuffle(Array.from({length:81},(_,i)=>[~~(i/9),i%9])).slice(0,keepCount).map(([r,c])=>keyOf(r,c)));
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!keep.has(keyOf(r,c)))puzzle[r][c]=0;
    userBoard=puzzle.map(r=>[...r]);
  }
  restartRoundAndRender();
  refreshHistory();
  scheduleSave();
}

/* UI */
function setMode(m){if(gameMode===m)return;gameMode=m;syncModeDiffUI();newGame();}
function setDiff(d){if(difficulty===d)return;difficulty=d;syncModeDiffUI();newGame();}
function closeOverlay(){const el=document.getElementById('result-overlay');if(el)el.classList.remove('show');}

function bindTopControls(){
  const actionMap={
    'set-mode':btn=>setMode(btn.dataset.mode),
    'set-diff':btn=>setDiff(btn.dataset.diff),
    'new-game':()=>newGame(),
    'reset-board':()=>resetBoard(),
    'give-hint':()=>giveHint(),
    'fill-candidates':()=>fillAllCandidates(),
    'show-import':()=>showImportModal(),
    'show-export':()=>showExportModal(),
    'use-cell-hint':()=>useCellHint(),
    'copy-io':btn=>copyIOText(btn.dataset.target,btn.dataset.msg||'已复制'),
    'do-import':()=>doImportFromModal(),
    'select-mark-color':btn=>selectMarkColor(btn.dataset.color),
    'num-col':btn=>numColClick(+btn.dataset.num),
    'toggle-notes':()=>toggleNotes(),
    'toggle-bivalue':()=>toggleBivalue(),
    'toggle-color-mark':()=>toggleColorMark(),
    'clear-note-colors':()=>clearAllNoteColors(),
    'close-io':()=>closeIOModal(),
    'result-retry':()=>{closeOverlay();newGame();},
    'close-overlay':()=>closeOverlay(),
    'reveal-board':()=>{closeOverlay();revealBoard();},
  };

  document.addEventListener('click',function(e){
    const btn=e.target.closest('[data-action]');
    if(!btn)return;
    const action=btn.dataset.action;
    if(action==='io-overlay'&&e.target===btn)return closeIOModal();
    const handler=actionMap[action];
    if(handler)handler(btn);
  });

  const bindHover=(el,on,off)=>el&&(el.addEventListener('mouseenter',()=>on(el)),el.addEventListener('mouseleave',()=>off(el)));
  bindHover(document.getElementById('clear-note-colors-btn'),el=>{el.style.color='#ff6b6b';el.style.borderColor='#ff6b6b';},el=>{el.style.color='#a09080';el.style.borderColor='#3a3530';});
  bindHover(document.querySelector('[data-action="close-io"]'),el=>el.style.color='var(--text)',el=>el.style.color='var(--text3)');
}

function numColClick(n){
  if(n===0){
    activeColNum=0;updateNumColUI();
    if(selectedCell||multiSelected.size>0){inputNum(0);} else{applyHighlights();}
    return;
  }
  if(activeColNum===n){
    activeColNum=0;selectedCell=null;multiSelected.clear();
    updateNumColUI();applyHighlights();return;
  }
  activeColNum=n;
  selectedCell=null;multiSelected.clear();
  updateNumColUI();applyHighlights();
}
function toggleNotes(){notesMode=!notesMode;document.getElementById('notes-label').style.opacity=notesMode?'1':'0';document.getElementById('nc-notes').classList.toggle('active',notesMode);document.querySelector('.board-wrapper').classList.toggle('notes-active',notesMode);updateNumColUI();}
function toggleBivalue(){bivalueMode=!bivalueMode;document.getElementById('nc-bivalue').classList.toggle('active',bivalueMode);applyHighlights();}

/* COLOR MARK */
function initColorPicker(){
  const container=document.getElementById('cs-swatches');if(!container)return;
  COLOR_PRESETS.forEach(col=>{const sw=document.createElement('div');sw.style.cssText=`width:20px;height:20px;border-radius:4px;background:${col};cursor:pointer;border:2px solid ${col===currentMarkColor?'white':'transparent'};flex-shrink:0;`;sw.dataset.action='select-mark-color';sw.dataset.color=col;container.appendChild(sw);});
  const inp=document.getElementById('cs-custom');const preview=document.getElementById('cs-custom-preview');
  if(inp){inp.addEventListener('input',e=>{selectMarkColor(e.target.value);preview.style.background=e.target.value;});}
}
function selectMarkColor(col){currentMarkColor=col;document.querySelectorAll('#cs-swatches div').forEach((sw,i)=>{sw.style.borderColor=COLOR_PRESETS[i]===col?'white':'transparent';});}
function toggleColorMark(){
  colorMarkMode=!colorMarkMode;document.getElementById('nc-color').classList.toggle('active',colorMarkMode);
  const strip=document.getElementById('color-strip');
  if(colorMarkMode){strip.style.display='block';requestAnimationFrame(()=>{const btn=document.getElementById('nc-color');const rect=btn.getBoundingClientRect();const w=strip.offsetWidth||120,h=strip.offsetHeight||80;strip.style.left=Math.max(4,rect.left-w-8)+'px';strip.style.top=Math.min(rect.top,window.innerHeight-h-8)+'px';});}
  else strip.style.display='none';
}
function clearAllNoteColors(){noteColors=Array.from({length:9},()=>Array.from({length:9},()=>({})));refreshAllCells();}

/* KEYBOARD */
document.addEventListener('keydown',e=>{
  if(e.key==='Control'){ctrlHeld=true;return;}
  if((e.key==='z'||e.key==='Z')&&ctrlHeld){e.preventDefault();undoLast();return;}
  if(e.key==='n'||e.key==='N'){toggleNotes();return;}
  if(e.code&&e.code.startsWith('Numpad')&&e.key>='1'&&e.key<='9'){const prev=notesMode;notesMode=true;inputNum(+e.key);notesMode=prev;return;}
  if(e.code==='Numpad0'||e.code==='NumpadDecimal'){inputNum(0);return;}
  if(e.key>='1'&&e.key<='9'){inputNum(+e.key);return;}
  if(e.key==='0'||e.key==='Backspace'||e.key==='Delete'){inputNum(0);return;}
  if(!selectedCell)return;const[r,c]=selectedCell;let nr=r,nc=c;
  if(e.key==='ArrowUp'){nr--;e.preventDefault();}else if(e.key==='ArrowDown'){nr++;e.preventDefault();}else if(e.key==='ArrowLeft'){nc--;e.preventDefault();}else if(e.key==='ArrowRight'){nc++;e.preventDefault();}else return;
  if(nr>=0&&nr<9&&nc>=0&&nc<9)selectCell(nr,nc);
});
document.addEventListener('keyup',e=>{if(e.key==='Control'){ctrlHeld=false;isDragging=false;}});

const SAVE_KEY = 'sudoku_autosave_v2';

function encodeB1() {
  const vals = [];
  for(let r=0;r<9;r++) for(let c=0;c<9;c++) {
    const key=`${r},${c}`;
    if(givenCells.has(key)) {
      vals.push(521 + (puzzle[r][c]||0) - 1);
    } else if(userBoard[r][c]!==0) {
      vals.push(512 + userBoard[r][c] - 1);
    } else {
      const notes = notesBoard[r][c];
      if(notes.size===0) { vals.push(0); }
      else { let mask=0; notes.forEach(n=>mask|=(1<<(n-1))); vals.push(mask); }
    }
  }
  const bits = vals.flatMap(v=>[...Array(10)].map((_,i)=>(v>>(9-i))&1));
  while(bits.length%8) bits.push(0);
  const bytes = [];
  for(let i=0;i<bits.length;i+=8) {
    let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; bytes.push(b);
  }
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return 'B1:' + b64;
}

function decodeB1(str) {
  if(!str.startsWith('B1:')) return null;
  try {
    const b64 = str.slice(3).replace(/-/g,'+').replace(/_/g,'/');
    const bin = atob(b64);
    const bytes = [...bin].map(c=>c.charCodeAt(0));
    const bits = bytes.flatMap(b=>[...Array(8)].map((_,i)=>(b>>(7-i))&1));
    const vals = [];
    for(let i=0;i<810;i+=10) {
      let v=0; for(let j=0;j<10;j++) v=(v<<1)|bits[i+j]; vals.push(v);
    }
    const newPuzzle=Array.from({length:9},()=>Array(9).fill(0));
    const newUser=Array.from({length:9},()=>Array(9).fill(0));
    const newNotes=Array.from({length:9},()=>Array.from({length:9},()=>new Set()));
    for(let i=0;i<81;i++) {
      const r=~~(i/9), c=i%9, v=vals[i];
      if(v>=521) { const d=v-521+1; newPuzzle[r][c]=d; newUser[r][c]=d; }
      else if(v>=512) { newUser[r][c]=v-512+1; }
      else if(v>0) { for(let n=1;n<=9;n++) if(v&(1<<(n-1))) newNotes[r][c].add(n); }
    }
    return {newPuzzle, newUser, newNotes};
  } catch(e) { return null; }
}

function saveProgress() {
  try {
    const envelope = {
      v: 2, gameMode, difficulty,
      b1: encodeB1(),
      sol: solution.map(r=>r.join('')).join(''),
      hintCells: [...hintCells].join(','),
      errorCount, hintCount, cellHintsLeft,
      seconds: secondsElapsed,
      cages: gameMode==='killer' ? cages : [],
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
  } catch(e) {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const s = JSON.parse(raw);
    if(!s.b1||!s.sol) return false;
    const decoded = decodeB1(s.b1);
    if(!decoded) return false;
    gameMode = s.gameMode||'normal';
    difficulty = s.difficulty||'beginner';
    syncModeDiffUI();
    puzzle = decoded.newPuzzle;
    userBoard = decoded.newUser;
    notesBoard = decoded.newNotes;
    solution=[]; for(let r=0;r<9;r++){const row=[];for(let c=0;c<9;c++)row.push(+s.sol[r*9+c]);solution.push(row);}
    noteColors = Array.from({length:9},()=>Array.from({length:9},()=>({})));
    hintCells = new Set(s.hintCells?s.hintCells.split(',').filter(Boolean):[]);
    errorCount=s.errorCount||0; hintCount=s.hintCount||0;
    cellHintsLeft=s.cellHintsLeft!=null?s.cellHintsLeft:3;
    secondsElapsed=s.seconds||0;
    if(s.cages&&s.cages.length&&gameMode==='killer') {
      cages=s.cages; cellCageMap={};
      cages.forEach((cage,idx)=>cage.cells.forEach(([r,c])=>{cellCageMap[`${r},${c}`]=idx;}));
    }
    return true;
  } catch(e) { return false; }
}

function closeIOModal(){document.getElementById('io-overlay').classList.remove('show');}
function showIOModal(title,bodyHtml,focusId=''){
  document.getElementById('io-title').textContent=title;
  document.getElementById('io-body').innerHTML=bodyHtml;
  document.getElementById('io-overlay').classList.add('show');
  if(focusId)setTimeout(()=>document.getElementById(focusId)?.focus(),50);
}

function buildExportBody(b1,plain){
  return `
    <div class="io-tip io-tip-primary"><b>B1 格式</b>（SudokuWiki 通用，含候选数，${b1.length} 字符）</div>
    <textarea id="io-b1-text" class="io-textarea io-textarea-b1" readonly>${b1}</textarea>
    <button data-action="copy-io" data-target="io-b1-text" data-msg="B1 字符串已复制" class="io-btn io-btn-primary">复制 B1 字符串</button>
    <div class="io-tip io-tip-secondary"><b>81字符格式</b>（纯谜题，兼容所有工具）</div>
    <textarea id="io-plain-text" class="io-textarea io-textarea-plain" readonly>${plain}</textarea>
    <button data-action="copy-io" data-target="io-plain-text" data-msg="81字符谜题已复制" class="io-btn io-btn-secondary">复制 81字符格式</button>
  `;
}

function buildImportBody(){
  return `
    <div class="io-tip">粘贴 <b class="io-accent">B1:</b> 字符串（含候选数进度）或 <b class="io-strong">81字符</b>谜题字符串</div>
    <textarea id="io-import-text" class="io-textarea io-textarea-import" placeholder="粘贴字符串到此处…" oninput="this.style.borderColor=this.value.trim()?'var(--accent)':'var(--border)'"></textarea>
    <button data-action="do-import" class="io-btn io-btn-primary io-btn-import">确认导入</button>
  `;
}

function showExportModal(){const b1=encodeB1(),plain=puzzle.map(r=>r.map(v=>v||'.').join('')).join('');showIOModal('导出局面',buildExportBody(b1,plain));}
function showImportModal(){showIOModal('导入局面',buildImportBody(),'io-import-text');}
function copyIOText(id,msg){const el=document.getElementById(id);navigator.clipboard.writeText(el.value).then(()=>showToast(msg)).catch(()=>{el.select();document.execCommand('copy');showToast(msg);});}
function doImportFromModal(){const text=document.getElementById('io-import-text').value.trim();if(!text)return showToast('请先粘贴字符串');closeIOModal();parseAndLoad(text);}
function parseAndLoad(text){
  const lines=text.trim().split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
  const b1line=lines.find(l=>l.startsWith('B1:'));
  if(b1line)return importFromB1(b1line);
  const plain=lines.join('').replace(/[^0-9.]/g,'');
  if(plain.length===81)return importPuzzleString(plain);
  showToast('格式不识别，支持 B1: 字符串或 81 字符谜题');
}

function applyImportedGameState(successMsg){
  noteColors=Array.from({length:9},()=>Array.from({length:9},()=>({})));
  hintCells=new Set();
  rebuildGivenCells();
  errorCount=0;
  hintCount=0;
  cellHintsLeft=3;
  cages=[];
  cellCageMap={};
  undoStack=[];
  gameWon=false;
  gameMode='normal';
  difficulty='import';
  syncImportModeUI();
  updateCellHintBtn();
  restartRoundAndRender();
  refreshHistory();
  showToast(successMsg);
}

function importFromB1(b1str) {
  const decoded=decodeB1(b1str);
  if(!decoded){showToast('B1 字符串解码失败');return;}
  stopTimer();
  puzzle=decoded.newPuzzle;
  userBoard=decoded.newUser;
  notesBoard=decoded.newNotes;
  const sol=puzzle.map(r=>[...r]);
  if(!backtrackSolve(sol)){showToast('该谜题无解');return;}
  solution=sol;
  applyImportedGameState(`导入成功（含候选数，共 ${b1str.length} 字符）`);
}

function importPuzzleString(str){
  stopTimer();
  puzzle=Array.from({length:SIZE},(_,r)=>Array.from({length:SIZE},(_,c)=>str[r*SIZE+c]==='.'?0:+str[r*SIZE+c]));
  const sol=puzzle.map(r=>[...r]);
  if(!backtrackSolve(sol))return showToast('该谜题无解');
  solution=sol;userBoard=puzzle.map(r=>[...r]);
  notesBoard=Array.from({length:SIZE},()=>Array.from({length:SIZE},()=>new Set()));
  applyImportedGameState('谜题导入成功（81字符格式）');
}

function backtrackSolve(b) {
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(b[r][c]!==0)continue;
    for(let n=1;n<=9;n++){if(isValid(b,r,c,n)){b[r][c]=n;if(backtrackSolve(b))return true;b[r][c]=0;}}
    return false;
  }
  return true;
}

function showToast(msg) {
  let t=document.getElementById('sdk-toast');
  if(!t){t=document.createElement('div');t.id='sdk-toast';t.style.cssText='position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-family:"Noto Sans SC",sans-serif;font-size:13px;padding:10px 20px;border-radius:8px;z-index:9999;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.5);';document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity='1';
  clearTimeout(t._hide);t._hide=setTimeout(()=>t.style.opacity='0',2500);
}


renderDiffButtons();
renderActionButtons();
renderNumColumn();
bindTopControls();
initColorPicker();
if(!loadProgress()){
  newGame();
} else {
  givenCells=new Set();
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(puzzle[r][c]!==0)givenCells.add(`${r},${c}`);
  gameWon=false; selectedCell=null; multiSelected=new Set();
  bivalueMode=false; colorMarkMode=false; notesMode=false; activeColNum=0;
  updateCellHintBtn();
  resetTimer(); startTimer();
  renderBoard(); updateHearts(); updateStats(); updateNumColUI();  refreshHistory();
}
