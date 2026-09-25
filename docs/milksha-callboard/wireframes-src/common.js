const SRC = {
  store: {t:'現場', bg:'#F2F2F2', fg:'#111', bd:'2px solid #111', icon:'店'},
  point: {t:'迷點', bg:'#009E73', fg:'#000', bd:'2px solid #009E73', icon:'迷'},
  panda: {t:'熊貓', bg:'#CC79A7', fg:'#000', bd:'2px solid #CC79A7', icon:'熊'},
  uber:  {t:'Uber', bg:'#0072B2', fg:'#fff', bd:'2px solid #0072B2', icon:'U'},
  udd:   {t:'UDD', bg:'#E69F00', fg:'#000', bd:'2px solid #E69F00', icon:'D'},
};
const KEYS = Object.keys(SRC);
function tag(k, size){ const s=SRC[k]; return `<span class="tag" style="background:${s.bg};color:${s.fg};border:${s.bd};font-size:${size}px"><b class="ic">${s.icon}</b>${s.t}</span>`; }
// o: {W,H, header, split:'row'|'col', readyFrac, ready:{cols,rows,font,tagSize}, prep:{cols,rows,font,tagSize}, readyPage, prepPage, overlay}
function board(o){
  const hH=o.header;
  const readyNums=['1523','1522','0871','1519','0869','1517','2204','1516','0866','1514','1513','0864'];
  const prepNums=['1501','1502','0855','1504','2201','1505','0857','1506','1507','0859','1508','2202','1509','0860','1510','1511','0861','1512','2203','1524','0872','1525','1526','0873','1527'];
  const vert = o.split==='col';
  const rW = vert? o.W : Math.round(o.W*o.readyFrac), rH = vert? Math.round((o.H-hH)*o.readyFrac) : o.H-hH;
  const pW = vert? o.W : o.W-rW, pH = vert? o.H-hH-rH : o.H-hH;
  let h=`<div class="board" style="width:${o.W}px;height:${o.H}px">`;
  h+=`<div class="hdr" style="height:${hH}px"><div class="logo">迷客夏 Milksha<small>LOGO</small></div><div class="htitle">取餐叫號</div><div class="clock">14:32</div></div>`;
  const zone=(cls,x,y,w,hh,title,sub,page,cfg,nums,isReady)=>{
    let z=`<div class="zone ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${hh}px">`;
    z+=`<div class="ztitle" style="height:${cfg.titleH}px;font-size:${cfg.titleF}px"><span>${title} <em>${sub}</em></span><span class="pg" style="font-size:${Math.round(cfg.titleF*0.7)}px">${page}</span></div>`;
    z+=`<div class="grid" style="grid-template-columns:repeat(${cfg.cols},1fr);grid-template-rows:repeat(${cfg.rows},1fr);height:${hh-cfg.titleH-24}px">`;
    const n=cfg.cols*cfg.rows;
    for(let i=0;i<n;i++){ const k=KEYS[(i*3+ (isReady?0:1))%5]; const num=nums[i%nums.length];
      const fresh = isReady && i===0;
      z+= isReady ? `<div class="card r ${fresh?'fresh':''}"><div>${tag(k,cfg.tagSize)}</div><div class="num" style="font-size:${cfg.font}px">${num}</div></div>`
                  : `<div class="card p">${tag(k,cfg.tagSize)}<span class="num" style="font-size:${cfg.font}px">${num}</span></div>`;
    }
    z+=`</div>`;
    if(cfg.progress) z+=`<div class="prog"><i></i></div>`;
    return z+`</div>`;
  };
  h+=zone('ready',0,hH,rW,rH,'可取餐','請取餐 Ready',o.readyPage,o.ready,readyNums,true);
  h+=zone('prep',vert?0:rW,vert?hH+rH:hH,pW,pH,'準備中','Preparing',o.prepPage,o.prep,prepNums,false);
  if(o.overlay){
    h+=`<div class="ov"><div class="ovbox"><div>${tag('store',o.overlay.tag)}</div><div class="ovnum" style="font-size:${o.overlay.font}px">1523</div><div class="ovtxt" style="font-size:${o.overlay.tag}px">請取餐</div></div></div>`;
  }
  return h+`</div>`;
}
function callouts(list){ return list.map(([n,x,y])=>`<div class="co" style="left:${x}px;top:${y}px">${n}</div>`).join(''); }
