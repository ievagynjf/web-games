const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const livesEl=document.getElementById('lives');
const overlay=document.getElementById('result-overlay');
const resultTitle=document.getElementById('result-title');
const resultMsg=document.getElementById('result-message');

const W=640,H=720;
const CELL=16;
const BRICK_COLS=W/CELL; // 40

let lives=3,gameOver=false;
let last=0;

const paddle={x:W/2-54,y:H-26,w:108,h:6,speed:720,dx:0,lastX:W/2-54};
let balls=[];
let bricks=[];
let drops=[];
let corridor={left:0,right:0,wallTop:0,laneY:0};

const SHOW_GEOMETRY_DEBUG=false;

function updateHUD(){
  livesEl.textContent=String(lives);
}

function createBall(stuck=true){
  return {
    x:paddle.x+paddle.w/2,
    y:paddle.y-6,
    r:4,
    vx:260*(Math.random()<0.5?-1:1),
    vy:-380,
    stuck
  };
}

function resetServe(){
  balls=[createBall(true)];
}

function buildCorridor(){
  const brickRows=22;
  const wallTop=brickRows*CELL;
  const laneY=Math.max(0,wallTop-8*CELL); // 通道再拉长

  const channelCols=4;
  const a=(BRICK_COLS-channelCols)/2;
  const left=a*CELL;
  const right=(a+channelCols)*CELL;

  corridor={left,right,wallTop,laneY,brickRows};
}

function makeEntranceSegments(wallRow,entranceLeft,laneWidth,turnCount){
  // 先生成“方向+长度”数组，再做U型检查，再按数组生成段/拐角
  const upperBoundRow=Math.max(1,Math.floor(wallRow*0.5));

  const inBoundsBlock=(top,left)=>top>=0&&top+laneWidth-1<=wallRow&&left>=0&&left+laneWidth-1<BRICK_COLS;
  const blockCells=(top,left)=>{
    const out=[];
    for(let r=top;r<top+laneWidth;r++){
      for(let c=left;c<left+laneWidth;c++)out.push(`${r},${c}`);
    }
    return out;
  };

  const segAbs=(s)=>Math.abs(s.x!==0?s.x:s.y);
  const segDr=(s)=>s.y===0?0:-Math.sign(s.y); // 上为正y，但行号向下增，所以取负
  const segDc=(s)=>s.x===0?0:Math.sign(s.x);
  // U型判定按“同轴且方向相反”而不是“向量长度完全相反”
  const isOpposite=(a,b)=>{
    if(a.x===0&&b.x===0&&a.y!==0&&b.y!==0)return a.y*b.y<0;
    if(a.y===0&&b.y===0&&a.x!==0&&b.x!==0)return a.x*b.x<0;
    return false;
  };
  const sameAxis=(a,b)=>(a.x===0&&b.x===0&&a.y!==0&&b.y!==0)||(a.y===0&&b.y===0&&a.x!==0&&b.x!==0);

  // md 里的轻量兜底：提交前仅检查“最近 1~2 段”几何冲突（O(1)）
  const localCheckPass=(plan,nextSeg)=>{
    if(plan.length<2)return true;

    const toPoint=(from,seg)=>({r:from.r-seg.y,c:from.c+seg.x});

    const p0={r:wallRow-(laneWidth-1),c:entranceLeft};
    const p1=toPoint(p0,plan[0]);

    let prev=p1;
    for(let i=1;i<plan.length;i++)prev=toPoint(prev,plan[i]);

    const nextEnd=toPoint(prev,nextSeg);
    const cand={a:prev,b:nextEnd};

    const segments=[];
    let a=p0,b=p1;
    segments.push({a,b});
    for(let i=1;i<plan.length;i++){
      const na=segments[segments.length-1].b;
      const nb=toPoint(na,plan[i]);
      segments.push({a:na,b:nb});
    }

    const inter=(s1,s2,allowSharedStart=false)=>{
      const aV=s1.a.c===s1.b.c;
      const bV=s2.a.c===s2.b.c;
      const margin=Math.max(0,laneWidth-1);
      const between=(v,x,y)=>v>=Math.min(x,y)&&v<=Math.max(x,y);
      const overlap=(x1,x2,y1,y2)=>Math.max(Math.min(x1,x2),Math.min(y1,y2))<Math.min(Math.max(x1,x2),Math.max(y1,y2));
      const isSharedStart=(r,c)=>allowSharedStart&&r===s1.a.r&&c===s1.a.c;

      if(aV&&bV){
        const dx=Math.abs(s1.a.c-s2.a.c);
        if(dx>margin)return false;
        const hit=overlap(s1.a.r,s1.b.r,s2.a.r,s2.b.r);
        if(!hit)return false;
        if(dx===0){
          const lo=Math.max(Math.min(s1.a.r,s1.b.r),Math.min(s2.a.r,s2.b.r));
          const hi=Math.min(Math.max(s1.a.r,s1.b.r),Math.max(s2.a.r,s2.b.r));
          if(lo===hi&&isSharedStart(lo,s1.a.c))return false;
        }
        return true;
      }
      if(!aV&&!bV){
        const dy=Math.abs(s1.a.r-s2.a.r);
        if(dy>margin)return false;
        const hit=overlap(s1.a.c,s1.b.c,s2.a.c,s2.b.c);
        if(!hit)return false;
        if(dy===0){
          const lo=Math.max(Math.min(s1.a.c,s1.b.c),Math.min(s2.a.c,s2.b.c));
          const hi=Math.min(Math.max(s1.a.c,s1.b.c),Math.max(s2.a.c,s2.b.c));
          if(lo===hi&&isSharedStart(s1.a.r,lo))return false;
        }
        return true;
      }

      const v=aV?s1:s2;
      const h=aV?s2:s1;
      const ir=v.a.c;
      const ic=h.a.r;
      const hit=between(ir,h.a.c-margin,h.b.c+margin)&&between(ic,v.a.r-margin,v.b.r+margin);
      if(!hit)return false;
      if(isSharedStart(ic,ir))return false;
      return true;
    };

    const n=segments.length;
    // 最近1段允许仅在拐点接触；其余接触/穿越视为冲突
    if(n>=1&&inter(cand,segments[n-1],true))return false;
    if(n>=2&&inter(cand,segments[n-2],false))return false;
    return true;
  };

  const generatePlan=()=>{
    const totalSegments=2+Math.max(1,turnCount);
    const plan=[];
    const yBudgetTrace=[];
    const xBudgetTrace=[];

    const randomCap=4;
    const breakLockProbX=0.42;
    const breakLockProbY=0.36;
    const uTurnBiasProb=0.68;

    // 第一段固定向上，保障有明显入口纵深
    const firstY=4+Math.floor(Math.random()*2);
    plan.push({x:0,y:firstY});

    // 基于 md 的 gap 定义
    // topGap: 到上边界余量；bottomGap: 到 wallRow 的回撤余量
    let topGap=Math.max(0,wallRow-(laneWidth-1)-firstY);
    let bottomGap=Math.max(0,firstY-2);
    let leftGap=Math.max(0,entranceLeft);
    let rightGap=Math.max(0,BRICK_COLS-entranceLeft-laneWidth);

    // Budget Locking（单向阀）：某轴一旦选定方向，不再允许反向
    let lockXDir=0; // -1 | 1 | 0
    let lockYDir=1; // 首段已向上

    yBudgetTrace.push({step:1,topGap,bottomGap});
    xBudgetTrace.push({step:1,a:leftGap,b:rightGap});

    for(let i=1;i<totalSegments;i++){
      const prev=plan[i-1];
      let x=0,y=0;

      if(prev.y!==0){
        // V -> H
        // 恢复防触边提前终止（你原来的边界保护）
        if((prev.y>0&&topGap<=4)||(prev.y<0&&bottomGap<=4))break;

        // 恢复防贴边强制转向（优先避边）
        if(leftGap<=1){
          const stepMax=Math.min(randomCap,Math.max(1,rightGap-laneWidth));
          if(stepMax<=0)break;
          x=1+Math.floor(Math.random()*stepMax);
          lockXDir=1;
        }else if(rightGap<=1){
          const stepMax=Math.min(randomCap,Math.max(1,leftGap-laneWidth));
          if(stepMax<=0)break;
          x=-(1+Math.floor(Math.random()*stepMax));
          lockXDir=-1;
        }else{
          const candidates=[];
          if(lockXDir!==0){
            const lockedGap=lockXDir===-1?leftGap:rightGap;
            if(lockedGap>0)candidates.push(lockXDir);

            const oppositeDir=-lockXDir;
            const oppositeGap=oppositeDir===-1?leftGap:rightGap;
            const breakLock=oppositeGap>(laneWidth+1)&&Math.random()<breakLockProbX;
            if(breakLock&&oppositeGap>0)candidates.push(oppositeDir);
          }else{
            if(leftGap>0)candidates.push(-1);
            if(rightGap>0)candidates.push(1);
          }
          if(candidates.length===0)break;

          let dir=0;
          if(candidates.length===1){
            dir=candidates[0];
          }else if(lockXDir!==0&&candidates.includes(-lockXDir)&&Math.random()<uTurnBiasProb){
            dir=-lockXDir;
          }else if(leftGap>rightGap){
            dir=-1;
          }else if(rightGap>leftGap){
            dir=1;
          }else{
            dir=Math.random()<0.5?-1:1;
          }

          const gap=dir===-1?leftGap:rightGap;
          const stepMax=Math.min(randomCap,gap-laneWidth);
          if(stepMax<=0)break;
          const step=1+Math.floor(Math.random()*stepMax);
          x=dir*step;
          lockXDir=dir;
        }
      }else{
        // H -> V
        // 恢复防触边提前终止（你原来的边界保护）
        if((prev.x>0&&rightGap<=4)||(prev.x<0&&leftGap<=4))break;

        // 恢复防贴边强制转向（优先避边）
        if(bottomGap<=1){
          const stepMax=Math.min(randomCap,Math.max(1,topGap-laneWidth));
          if(stepMax<=0)break;
          y=1+Math.floor(Math.random()*stepMax);
          lockYDir=1;
        }else if(topGap<=1){
          const stepMax=Math.min(randomCap,Math.max(1,bottomGap-laneWidth));
          if(stepMax<=0)break;
          y=-(1+Math.floor(Math.random()*stepMax));
          lockYDir=-1;
        }else{
          const candidates=[];
          if(lockYDir!==0){
            const lockedGap=lockYDir===-1?bottomGap:topGap;
            if(lockedGap>0)candidates.push(lockYDir);

            const oppositeDir=-lockYDir;
            const oppositeGap=oppositeDir===-1?bottomGap:topGap;
            const breakLock=oppositeGap>(laneWidth+1)&&Math.random()<breakLockProbY;
            if(breakLock&&oppositeGap>0)candidates.push(oppositeDir);
          }else{
            if(bottomGap>0)candidates.push(-1);
            if(topGap>0)candidates.push(1);
          }
          if(candidates.length===0)break;

          let dir=0;
          if(candidates.length===1){
            dir=candidates[0];
          }else if(lockYDir!==0&&candidates.includes(-lockYDir)&&Math.random()<uTurnBiasProb){
            dir=-lockYDir;
          }else if(bottomGap>topGap){
            dir=-1;
          }else if(topGap>bottomGap){
            dir=1;
          }else{
            dir=Math.random()<0.5?-1:1;
          }

          const gap=dir===-1?bottomGap:topGap;
          const stepMax=Math.min(randomCap,gap-laneWidth);
          if(stepMax<=0)break;
          const step=1+Math.floor(Math.random()*stepMax);
          y=dir*step;
          lockYDir=dir;
        }
      }

      // 最后一段若是 0,0，直接删掉这段
      if(i===totalSegments-1&&x===0&&y===0)break;

      // 恢复你原来的“转向更新”结构（按上一段方向更新预算）
      if(prev.y>0){
        bottomGap+=1;
        topGap-=2;
        leftGap+=x+(x>0?1:0);
        rightGap-=x-(x<0?1:0);
      }else if(prev.y<0){
        bottomGap-=2;
        topGap+=1;
        leftGap+=x+(x>0?1:0);
        rightGap-=x-(x<0?1:0);
      }else if(prev.x<0){
        bottomGap+=y+(y>0?1:0);
        topGap-=y-(y<0?1:0);
        leftGap-=2;
        rightGap+=1;
      }else if(prev.x>0){
        bottomGap+=y+(y>0?1:0);
        topGap-=y-(y<0?1:0);
        leftGap+=1;
        rightGap-=2;
      }

      topGap=Math.max(0,topGap);
      bottomGap=Math.max(0,bottomGap);
      leftGap=Math.max(0,leftGap);
      rightGap=Math.max(0,rightGap);

      const nextSeg={x,y};
      if(!localCheckPass(plan,nextSeg))continue;

      plan.push(nextSeg);
      yBudgetTrace.push({step:i+1,topGap,bottomGap});
      xBudgetTrace.push({step:i+1,a:leftGap,b:rightGap});
    }

    // 恢复 plan 级 U 型检查/修正
    for(let b=1;b<=plan.length-2;b++){
      const A=plan[b-1],B=plan[b],C=plan[b+1];
      if(sameAxis(A,C)&&isOpposite(A,C)){
        const bl=segAbs(B);
        if(bl===0||bl===2){
          if(B.x!==0)B.x=Math.sign(B.x||1)*3;
          if(B.y!==0)B.y=Math.sign(B.y||1)*3;
        }
      }
    }

    return {plan,yBudgetTrace,xBudgetTrace};
  };

  const buildFromPlan=(plan)=>{
    const moves=[];
    const segmentCells=new Set();
    const cornerSquareCells=new Set();

    let top=wallRow-(laneWidth-1);
    let left=entranceLeft;

    for(let i=0;i<plan.length;i++){
      const seg=plan[i];
      const fromTop=top;
      const fromLeft=left;

      const dr=segDr(seg);
      const dc=segDc(seg);
      const len=segAbs(seg);

      // 生成该段：中间段保持原逻辑；首段和末段不再“+1”
      if(!inBoundsBlock(top,left))return null;
      for(const k of blockCells(top,left))segmentCells.add(k);

      const isFirst=i===0;
      const isLast=i===plan.length-1;
      const stepCount=(isFirst||isLast)?Math.max(0,len-1):len;

      for(let step=0;step<stepCount;step++){
        top+=dr;
        left+=dc;
        if(!inBoundsBlock(top,left))return null;
        for(const k of blockCells(top,left))segmentCells.add(k);
      }

      moves.push({
        x:seg.x,y:seg.y,
        dr,dc,len,
        fromTop,fromLeft,toTop:top,toLeft:left
      });

      if(i===plan.length-1)break;

      // 严格按你给的几何关系：
      // 1) 拐角方块 = 在当前段终点沿“当前方向向量”+1
      // 2) 下一段起点 = 在拐角方块沿“下一段方向向量”+1
      //    例如：第一段向上结束在 (x1,y1) 后，若下一段向右，
      //    则 corner 在 y1+1，第二段从 x1+1,y1+1 开始（其他方向同理）
      const cornerTop=top+dr;
      const cornerLeft=left+dc;
      if(!inBoundsBlock(cornerTop,cornerLeft))return null;
      for(const k of blockCells(cornerTop,cornerLeft))cornerSquareCells.add(k);

      const nextSeg=plan[i+1];
      top=cornerTop+segDr(nextSeg);
      left=cornerLeft+segDc(nextSeg);
      if(!inBoundsBlock(top,left))return null;
    }

    return {moves,segmentCells,cornerSquareCells};
  };

  const violatesUByBuiltMoves=(moves)=>{
    for(let b=1;b<=moves.length-2;b++){
      const A=moves[b-1],B=moves[b],C=moves[b+1];
      if(sameAxis(A,C)&&isOpposite(A,C)){
        if(B.len<=0||B.len===2)return true;
      }
    }
    return false;
  };

  for(let attempt=0;attempt<80;attempt++){
    const generated=generatePlan();
    const plan=generated.plan;
    const yBudgetTrace=generated.yBudgetTrace;
    const xBudgetTrace=generated.xBudgetTrace;

    // 仅新增：先过滤 plan 级自交
    const built=buildFromPlan(plan);
    if(!built)continue;

    // 关键：以最终生成后的 moves 为准再次做 U 型检查，防止边界影响后长度失真
    if(violatesUByBuiltMoves(built.moves))continue;

    return {
      moves:built.moves,
      upperBoundRow,
      segmentCells:built.segmentCells,
      cornerSquareCells:built.cornerSquareCells,
      plan,
      yBudgetTrace,
      xBudgetTrace
    };
  }

  return {moves:[],upperBoundRow,segmentCells:new Set(),cornerSquareCells:new Set(),plan:[],yBudgetTrace:[],xBudgetTrace:[]};
}

function makeBricks(){
  bricks=[];

  const wallRow=Math.floor(corridor.wallTop/CELL);
  const laneWidth=2;           // 净通道宽2
  const turnCount=1+Math.floor(Math.random()*3);

  const entranceLeft=2+Math.floor(Math.random()*(BRICK_COLS-laneWidth-4));
  const entranceL=entranceLeft;
  const entranceR=entranceLeft+laneWidth-1;

  const built=makeEntranceSegments(wallRow,entranceLeft,laneWidth,turnCount);
  const moves=built.moves;

  const walkable=new Set();
  const wallCells=new Set();
  const segmentCells=new Set(built.segmentCells);
  const cornerSquareCells=new Set(built.cornerSquareCells);
  const lastSegExitWalls=new Set();
  const key=(r,c)=>`${r},${c}`;
  const inBounds=(r,c)=>r>=0&&r<=wallRow&&c>=0&&c<BRICK_COLS;
  const addWalk=(r,c,setRef=null)=>{
    if(!inBounds(r,c))return;
    const k=key(r,c);
    walkable.add(k);
    if(setRef)setRef.add(k);
  };
  const addWall=(r,c,setRef=null)=>{
    if(!inBounds(r,c))return;
    const k=key(r,c);
    wallCells.add(k);
    if(setRef)setRef.add(k);
  };

  // 底部入口（2宽，向上拉2格，避免底部封口）
  for(let r=wallRow-2;r<=wallRow;r++){
    for(let c=entranceL;c<=entranceR;c++)addWalk(r,c,segmentCells);
  }

  // 1) 先生成各段通道（已在 makeEntranceSegments 中按方向流程生成）
  for(const k of segmentCells){
    const [r,c]=k.split(',').map(Number);
    addWalk(r,c,segmentCells);
  }

  // 2) 再补所有拐角正方形（已在 makeEntranceSegments 中生成）
  for(const k of cornerSquareCells){
    const [r,c]=k.split(',').map(Number);
    addWalk(r,c,cornerSquareCells);
  }

  // 3) 终点开口：不再用通道填充，直接记录“最后一段前方一列/一行墙”并拆除
  if(moves.length>0){
    const last=moves[moves.length-1];
    const t=last.toTop;
    const l=last.toLeft;

    const markExitWall=(r,c)=>{ if(inBounds(r,c)) lastSegExitWalls.add(key(r,c)); };

    if(last.dr===-1){
      for(let c=l;c<=l+laneWidth-1;c++)markExitWall(t-1,c);
    }else if(last.dr===1){
      for(let c=l;c<=l+laneWidth-1;c++)markExitWall(t+laneWidth,c);
    }else if(last.dc===1){
      for(let r=t;r<=t+laneWidth-1;r++)markExitWall(r,l+laneWidth);
    }else if(last.dc===-1){
      for(let r=t;r<=t+laneWidth-1;r++)markExitWall(r,l-1);
    }
  }

  // 从2宽通道向外扩1层生成墙（先全量）
  const dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  for(const k of walkable){
    const [r,c]=k.split(',').map(Number);
    for(const [dr,dc] of dirs){
      const nr=r+dr,nc=c+dc;
      if(!inBounds(nr,nc))continue;
      if(!walkable.has(key(nr,nc)))addWall(nr,nc);
    }
  }


  // 底部横墙，保留入口2宽
  for(let c=0;c<BRICK_COLS;c++){
    if(c>=entranceL&&c<=entranceR)continue;
    addWall(wallRow,c);
  }

  // 只拆最后一段方向上的出口墙（不扩圈）
  for(const k of lastSegExitWalls)wallCells.delete(k);

  // 墙角连通：只补一个点（你要求的墙逻辑）
  for(let r=0;r<wallRow;r++){
    for(let c=0;c<BRICK_COLS-1;c++){
      const a=key(r,c), b=key(r,c+1), d=key(r+1,c), e=key(r+1,c+1);
      const wa=wallCells.has(a), wb=wallCells.has(b), wd=wallCells.has(d), we=wallCells.has(e);

      const canPatch=(k)=>!walkable.has(k)&&!lastSegExitWalls.has(k);

      // 对角1: a 与 e，仅补一个（优先 b）
      if(wa&&we&&!wb&&!wd){
        if(canPatch(b)){
          wallCells.add(b);
        }else if(canPatch(d)){
          wallCells.add(d);
        }
      }

      // 对角2: b 与 d，仅补一个（优先 a）
      if(wb&&wd&&!wa&&!we){
        if(canPatch(a)){
          wallCells.add(a);
        }else if(canPatch(e)){
          wallCells.add(e);
        }
      }
    }
  }

  // 通道内部不放墙
  for(const k of walkable)wallCells.delete(k);


  // 在“水平墙上方全部区域”填充可打砖：仅挖空通道与通道墙
  // 并基于“通道出口”动态分配远端高血量砖
  // 区域定义为 [0, wallRow)
  let exitR=Math.max(0,wallRow-2);
  let exitC=Math.floor((entranceL+entranceR)/2);
  if(moves.length>0){
    const last=moves[moves.length-1];
    const t=last.toTop;
    const l=last.toLeft;
    if(last.dr===-1){
      exitR=t-1;
      exitC=l+Math.floor(laneWidth/2);
    }else if(last.dr===1){
      exitR=t+laneWidth;
      exitC=l+Math.floor(laneWidth/2);
    }else if(last.dc===1){
      exitR=t+Math.floor(laneWidth/2);
      exitC=l+laneWidth;
    }else if(last.dc===-1){
      exitR=t+Math.floor(laneWidth/2);
      exitC=l-1;
    }
  }

  const candidates=[];
  let maxDist=1;
  for(let r=0;r<wallRow;r++){
    for(let c=0;c<BRICK_COLS;c++){
      const k=key(r,c);
      if(walkable.has(k))continue; // 通道本体
      if(wallCells.has(k))continue; // 通道墙体

      // 回到曼哈顿距离：整体趋势更贴近原先体感
      const d=Math.abs(r-exitR)+Math.abs(c-exitC);
      if(d>maxDist)maxDist=d;
      candidates.push({r,c,d});
    }
  }

  // 把“点状随机”改成“块状分区”：
  // 1) 先按距离分层出基础 hp
  // 2) 再按 3x3 邻域多数投票平滑，形成一块一块的分布
  const hpGrid=Array.from({length:wallRow},()=>Array(BRICK_COLS).fill(-1));

  for(const cell of candidates){
    const ratio=cell.d/maxDist;

    let hp=1;
    if(ratio>0.8)hp=3;
    else if(ratio>0.62)hp=2;
    hpGrid[cell.r][cell.c]=hp;
  }

  const smoothGrid=hpGrid.map(row=>row.slice());
  const countMap=(arr)=>{
    const m=new Map();
    for(const v of arr)m.set(v,(m.get(v)||0)+1);
    return m;
  };

  for(let r=0;r<wallRow;r++){
    for(let c=0;c<BRICK_COLS;c++){
      if(hpGrid[r][c]===-1)continue;

      const ns=[];
      for(let dr=-1;dr<=1;dr++){
        for(let dc=-1;dc<=1;dc++){
          const nr=r+dr,nc=c+dc;
          if(nr<0||nr>=wallRow||nc<0||nc>=BRICK_COLS)continue;
          const v=hpGrid[nr][nc];
          if(v!==-1)ns.push(v);
        }
      }

      if(ns.length===0)continue;
      const cm=countMap(ns);
      let bestHp=hpGrid[r][c];
      let bestCnt=-1;
      for(const [k,v] of cm.entries()){
        if(v>bestCnt||(v===bestCnt&&k>bestHp)){
          bestHp=k;
          bestCnt=v;
        }
      }
      smoothGrid[r][c]=bestHp;
    }
  }

  for(const cell of candidates){
    const hp=smoothGrid[cell.r][cell.c];
    bricks.push({
      x:cell.c*CELL,
      y:cell.r*CELL,
      w:CELL,
      h:CELL,
      hp,
      alive:true,
      solid:false
    });
  }

  // 通道墙（实心不可打）
  for(const k of wallCells){
    const [r,c]=k.split(',').map(Number);
    bricks.push({
      x:c*CELL,
      y:r*CELL,
      w:CELL,
      h:CELL,
      hp:999,
      alive:true,
      solid:true
    });
  }
}

function start(){
  lives=3;gameOver=false;
  paddle.x=W/2-paddle.w/2;paddle.dx=0;
  buildCorridor();
  makeBricks();
  drops=[];
  resetServe();
  overlay.classList.remove('show');
  updateHUD();
  last=performance.now();
  canvas.focus();
  requestAnimationFrame(loop);
}

function end(title,msg){
  gameOver=true;
  resultTitle.textContent=title;
  resultMsg.textContent=msg;
  overlay.classList.add('show');
}

function circleRectHit(cx,cy,cr,rx,ry,rw,rh){
  const nx=Math.max(rx,Math.min(cx,rx+rw));
  const ny=Math.max(ry,Math.min(cy,ry+rh));
  const dx=cx-nx,dy=cy-ny;
  return dx*dx+dy*dy<=cr*cr;
}

function bounceBallRect(ball,rect){
  // 基于最近点与穿透深度做分离，避免“吸墙走”
  const nx=Math.max(rect.x,Math.min(ball.x,rect.x+rect.w));
  const ny=Math.max(rect.y,Math.min(ball.y,rect.y+rect.h));
  let dx=ball.x-nx,dy=ball.y-ny;
  let dist=Math.hypot(dx,dy);

  if(dist===0){
    const leftPen=Math.abs(ball.x-rect.x);
    const rightPen=Math.abs(rect.x+rect.w-ball.x);
    const topPen=Math.abs(ball.y-rect.y);
    const bottomPen=Math.abs(rect.y+rect.h-ball.y);
    const minPen=Math.min(leftPen,rightPen,topPen,bottomPen);
    if(minPen===leftPen){dx=-1;dy=0;dist=1;}
    else if(minPen===rightPen){dx=1;dy=0;dist=1;}
    else if(minPen===topPen){dx=0;dy=-1;dist=1;}
    else {dx=0;dy=1;dist=1;}
  }

  const nxn=dx/dist, nyn=dy/dist;
  const overlap=ball.r-dist;
  if(overlap>0){
    ball.x+=nxn*(overlap+0.6);
    ball.y+=nyn*(overlap+0.6);
  }

  if(Math.abs(nxn)>Math.abs(nyn))ball.vx*=-1;
  else ball.vy*=-1;
}

function maybeSpawnDrop(x,y){
  if(Math.random()>0.14)return;
  const kind=Math.random()<0.55?'+2':'*2';
  drops.push({x,y,w:24,h:14,vy:210,kind});
}

function spawnPlus2FromPaddle(){
  const speed=380;
  const y=paddle.y-8;
  balls.push({x:paddle.x+paddle.w*0.3,y,r:4,vx:-145,vy:-speed,stuck:false});
  balls.push({x:paddle.x+paddle.w*0.7,y,r:4,vx:145,vy:-speed,stuck:false});
}

function spawnRadialFromBall(source,count){
  if(!source||count<=0)return;
  const speed=Math.max(340,Math.hypot(source.vx,source.vy));
  const base=Math.atan2(source.vy,source.vx);
  for(let i=0;i<count;i++){
    const angle=base+(Math.PI*2*i)/count;
    balls.push({
      x:source.x,
      y:source.y,
      r:source.r,
      vx:Math.cos(angle)*speed,
      vy:Math.sin(angle)*speed,
      stuck:false
    });
  }
}

function applyDrop(kind){
  const moving=balls.filter(b=>!b.stuck);
  if(moving.length<=0)return;

  if(kind==='+2'){
    spawnPlus2FromPaddle();
    return;
  }

  if(kind==='*2'){
    const snapshot=[...moving];
    for(const s of snapshot)spawnRadialFromBall(s,4);
  }
}

function update(dt){
  const prevPaddleX=paddle.x;
  paddle.x+=paddle.dx*paddle.speed*dt;
  if(paddle.x<0)paddle.x=0;
  if(paddle.x+paddle.w>W)paddle.x=W-paddle.w;
  const paddleV=(paddle.x-prevPaddleX)/Math.max(0.001,dt);
  paddle.lastX=prevPaddleX;

  for(let i=balls.length-1;i>=0;i--){
    const b=balls[i];

    if(b.stuck){
      b.x=paddle.x+paddle.w/2;
      b.y=paddle.y-b.r-2;
      continue;
    }

    b.x+=b.vx*dt;
    b.y+=b.vy*dt;

    if(b.x-b.r<0){b.x=b.r;b.vx=Math.abs(b.vx);} 
    if(b.x+b.r>W){b.x=W-b.r;b.vx=-Math.abs(b.vx);} 
    if(b.y-b.r<0){b.y=b.r;b.vy=Math.abs(b.vy);} 

    if(b.y-b.r>H){
      balls.splice(i,1);
      continue;
    }

    if(circleRectHit(b.x,b.y,b.r,paddle.x,paddle.y,paddle.w,paddle.h)&&b.vy>0){
      // 命中模型：中心趋近直上，边缘大角；板速可明显搓球
      const hit=(b.x-(paddle.x+paddle.w/2))/(paddle.w/2);
      const clamped=Math.max(-1,Math.min(1,hit));

      const speed=Math.max(400,Math.hypot(b.vx,b.vy));
      const maxAngle=Math.PI*0.49; // ~88°

      // 关键：中心线性保持小角，边缘非线性放大
      const shaped=Math.sign(clamped)*Math.pow(Math.abs(clamped),1.25);
      let angle=shaped*maxAngle;

      // 搓球：板子横向速度直接改角度（不是只改vx）
      const spin=Math.max(-0.22,Math.min(0.22,(paddleV/paddle.speed)*0.9));
      angle+=spin;
      angle=Math.max(-maxAngle,Math.min(maxAngle,angle));

      b.vx=Math.sin(angle)*speed;
      b.vy=-Math.cos(angle)*speed;

      // 只在远离中心才限制最小水平速度，保留中心直球能力
      const nearCenter=Math.abs(clamped)<0.16;
      const minVx=nearCenter?0:90;
      if(Math.abs(b.vx)<minVx){
        const dir=(clamped===0?(Math.random()<0.5?-1:1):Math.sign(clamped));
        b.vx=dir*minVx;
        b.vy=-Math.sqrt(Math.max(1,speed*speed-b.vx*b.vx));
      }

      b.y=paddle.y-b.r-1;
    }

    for(const brick of bricks){
      if(!brick.alive)continue;
      if(!circleRectHit(b.x,b.y,b.r,brick.x,brick.y,brick.w,brick.h))continue;
      bounceBallRect(b,brick);

      if(brick.solid)break;

      brick.hp--;
      if(brick.hp<=0){
        brick.alive=false;
        maybeSpawnDrop(brick.x+brick.w/2,brick.y+brick.h/2);
      }
      updateHUD();
      break;
    }
  }

  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i];
    d.y+=d.vy*dt;
    if(circleRectHit(d.x,d.y,8,paddle.x,paddle.y,paddle.w,paddle.h)){
      applyDrop(d.kind);
      drops.splice(i,1);
      continue;
    }
    if(d.y-d.h>H)drops.splice(i,1);
  }

  if(balls.length===0){
    lives--;
    updateHUD();
    if(lives<=0){end('失败','本局结束');return;}
    resetServe();
  }

  const hasBreakable=bricks.some(b=>!b.solid);
  if(hasBreakable){
    const left=bricks.reduce((n,b)=>n+((b.alive&&!b.solid)?1:0),0);
    if(left===0)end('胜利','清空砖块！');
  }
}

function draw(){
  ctx.clearRect(0,0,W,H);

  for(const b of bricks){
    if(!b.alive)continue;
    if(b.solid){
      ctx.fillStyle='#3a342c';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.strokeStyle='rgba(20,18,14,.55)';
    }else{
      ctx.fillStyle=b.hp===2?'#f0c870':'#d4a84b';
      ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.strokeStyle='rgba(26,20,8,.38)';
    }
    ctx.lineWidth=1;
    ctx.strokeRect(b.x+0.5,b.y+0.5,b.w-1,b.h-1);
  }

  for(const d of drops){
    ctx.fillStyle=d.kind==='+2'?'#60b8ff':'#b06aff';
    ctx.fillRect(d.x-d.w/2,d.y-d.h/2,d.w,d.h);
    ctx.fillStyle='#1a1408';
    ctx.font='700 12px JetBrains Mono';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillText(d.kind,d.x,d.y+0.5);
  }

  ctx.fillStyle='#60b8ff';
  ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);

  for(const b of balls){
    ctx.beginPath();
    ctx.arc(b.x,b.y,b.r,0,Math.PI*2);
    ctx.fillStyle='#e8dcc8';
    ctx.fill();
  }

}

function loop(t=0){
  if(gameOver)return;
  const dt=Math.min(0.033,(t-last)/1000||0);
  last=t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

let controlMode='pointer'; // 'keyboard' | 'pointer'
const controlModeBtn=document.getElementById('control-mode');
const boardHintEl=document.getElementById('board-hint');

const applyControlMode=()=>{
  if(controlModeBtn){
    controlModeBtn.classList.toggle('pointer',controlMode==='pointer');
    controlModeBtn.classList.toggle('keyboard',controlMode==='keyboard');
  }
  canvas.classList.toggle('pointer-mode',controlMode==='pointer');
  if(boardHintEl){
    boardHintEl.textContent=controlMode==='pointer'
      ? '鼠标/触控移动　点击画布发球'
      : 'A / D 或 ← / → 移动　空格发球';
  }
  paddle.dx=0;
};

if(controlModeBtn){
  controlModeBtn.addEventListener('click',()=>{
    controlMode=controlMode==='keyboard'?'pointer':'keyboard';
    applyControlMode();
  });
}

document.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space'].includes(e.code))e.preventDefault();
  if(gameOver)return;

  if(e.code==='Space'){
    const s=balls.find(b=>b.stuck);
    if(s)s.stuck=false;
    return;
  }

  if(controlMode!=='keyboard')return;
  if(e.code==='ArrowLeft'||e.code==='KeyA')paddle.dx=-1;
  if(e.code==='ArrowRight'||e.code==='KeyD')paddle.dx=1;
});

document.addEventListener('keyup',e=>{
  if(controlMode!=='keyboard')return;
  if((e.code==='ArrowLeft'||e.code==='KeyA')&&paddle.dx<0)paddle.dx=0;
  if((e.code==='ArrowRight'||e.code==='KeyD')&&paddle.dx>0)paddle.dx=0;
});

document.getElementById('new-game').addEventListener('click',start);
document.getElementById('restart-btn').addEventListener('click',start);
canvas.addEventListener('pointerdown',()=>{
  canvas.focus();
  if(controlMode==='pointer'&&!gameOver){
    const s=balls.find(b=>b.stuck);
    if(s)s.stuck=false;
  }
});

const movePaddleByPointer=(clientX)=>{
  const rect=canvas.getBoundingClientRect();
  const localX=clientX-rect.left;
  paddle.dx=0;
  paddle.x=Math.max(0,Math.min(W-paddle.w,localX-paddle.w/2));
};

canvas.addEventListener('pointermove',e=>{
  if(controlMode!=='pointer')return;
  movePaddleByPointer(e.clientX);
});

canvas.addEventListener('touchmove',e=>{
  if(controlMode!=='pointer')return;
  if(e.touches&&e.touches.length>0){
    movePaddleByPointer(e.touches[0].clientX);
    e.preventDefault();
  }
},{passive:false});

applyControlMode();
start();

start();