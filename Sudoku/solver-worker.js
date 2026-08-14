const SIZE=9,BOX=3;
const valid=(b,r,c,n)=>{for(let i=0;i<SIZE;i++)if(b[r][i]===n||b[i][c]===n)return false;const br=Math.floor(r/BOX)*BOX,bc=Math.floor(c/BOX)*BOX;for(let y=br;y<br+BOX;y++)for(let x=bc;x<bc+BOX;x++)if(b[y][x]===n)return false;return true;};
self.onmessage=e=>{
  const {id,puzzle}=e.data,board=puzzle.map(row=>[...row]);
  let count=0,first=null;
  for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++){const n=board[r][c];if(!n)continue;board[r][c]=0;const ok=valid(board,r,c,n);board[r][c]=n;if(!ok){self.postMessage({id,count:0});return;}}
  const search=()=>{
    if(count>=2)return;
    let best=null;
    for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(!board[r][c]){const candidates=[];for(let n=1;n<=9;n++)if(valid(board,r,c,n))candidates.push(n);if(!candidates.length)return;if(!best||candidates.length<best.candidates.length)best={r,c,candidates};}
    if(!best){count++;if(count===1)first=board.map(row=>[...row]);return;}
    for(const n of best.candidates){board[best.r][best.c]=n;search();board[best.r][best.c]=0;if(count>=2)return;}
  };
  search();self.postMessage({id,count,solution:first});
};
