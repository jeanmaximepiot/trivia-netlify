import {getStore} from '@netlify/blobs';
import D from '../../questions.json';
const TEAMS=[['Scaphoïde','#e6194b'],['Lunatum','#3cb44b'],['Triquetrum','#4363d8'],['Pisiforme','#911eb4'],['Trapèze','#f58231'],['Capitatum','#555555']].map(([n,c])=>({n,c})),T0=()=>TEAMS.map((t,i)=>({i,n:t.n,c:t.c,pos:0,w:[]}));
let QS=D.questions;const CATS=D.categories,CODE=process.env.HOST_CODE||'animateur';
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();
const lev=(a,b)=>{const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]};
const same=(a,b)=>{a=norm(a);b=norm(b);return a===b||(b.length>5&&lev(a,b)<=1)};
function grade(q,a){if(a==null)return 0;
 if(q.type==='qcm'){const g=a.filter(i=>q.correct.includes(i)).length;return Math.max(0,(g-(a.length-g))/q.correct.length)}
 if(q.type==='num')return Math.abs(parseFloat(String(a).replace(',','.'))-q.answer)<=(q.tol||0)?1:0;
 if(q.type==='text'){const u=new Set();let ok=0;q.slots.forEach(s=>{const i=a.findIndex((x,k)=>!u.has(k)&&s.some(v=>same(x,v)));if(i>=0){u.add(i);ok++}});return ok/q.slots.length}
 return q.pairs.filter((p,i)=>a[i]===p[1]).length/q.pairs.length}
const pub=q=>({cat:q.cat,type:q.type,text:q.text,image:q.image,pts:q.pts,time:q.time,options:q.options,lefts:q.pairs&&q.pairs.map(p=>p[0]),rights:q.pairs&&[...new Set(q.pairs.map(p=>p[1]))].sort(),n:q.slots&&q.slots.length});
const sol=q=>q.type==='qcm'?q.correct.map(i=>q.options[i]).join(' · '):q.type==='num'?String(q.answer):q.type==='text'?q.slots.map(s=>s[0]).join(' · '):q.pairs.map(p=>p[0]+' → '+p[1]).join(' · ');
const J=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const tot=p=>Object.values(p.g||{}).reduce((a,x)=>a+x.g,0),wed=p=>[...new Set(Object.values(p.g||{}).filter(x=>x.f===1).map(x=>x.c))];
export const config={path:'/api'};
export default async req=>{
 const st=getStore({name:'game',consistency:'strong'}),get=k=>st.get(k,{type:'json'});
 QS=(await get('qbank'))||D.questions;let S=(await get('state'))||{phase:'lobby',qi:-1,end:0,gid:'0',rank:[],res:{},teams:T0(),done:[],roller:null,die:null,goAt:0};
 const save=()=>st.setJSON('state',S);
 const view=(host,id,x={})=>{const q=QS[S.qi],r=S.rank,i=r.findIndex(p=>p.id===id),p=r[i],res=(S.res||{})[id]||{gain:0,frac:0};
  return{phase:S.phase,qi:S.qi,gid:S.gid,total:QS.length,left:Math.max(0,(S.phase==='rolled'?S.goAt:S.end)-Date.now()),cats:CATS,q:q&&(S.phase==='q'||S.phase==='reveal')?pub(q):null,sol:S.phase==='reveal'?sol(q):null,
  nq:S.done.length,nb:QS.length,fin:S.fin??null,finName:S.fin!=null?TEAMS[S.fin].n:null,winner:S.winner??null,dist:S.phase==='reveal'?S.dist:null,nans:S.nans||0,roller:S.roller??null,rollerName:S.roller!=null?TEAMS[S.roller].n:null,die:S.die?{k:S.die.k}:null,teams:S.teams||T0(),rank:r.slice(0,host?40:8).map(({n,s,w})=>({n,s,w})),n:x.n??r.length,ans:x.ans??0,me:p?{name:p.n,score:p.s,w:p.w,gain:res.gain,frac:res.frac,pos:i+1}:null}};
 const u=new URL(req.url);
 if(req.method==='GET'){const h=u.searchParams.get('host');if(h!==null&&h!==CODE)return J({err:'Code animateur incorrect'});let x={};
  if(h!==null){const ps=await st.list({prefix:'p:'}),as=S.phase==='q'?await st.list({prefix:`a:${S.qi}:`}):{blobs:[]};x={n:ps.blobs.length,ans:as.blobs.length}}
  return J(view(h!==null,u.searchParams.get('id'),x))}
 const m=await req.json().catch(()=>({})),id=String(m.id||'').slice(0,40);
 if(m.t==='join'&&id&&m.name){const p=(await get('p:'+id))||{g:{}};await st.setJSON('p:'+id,{...p,n:String(m.name).slice(0,20),t:Number.isInteger(m.team)&&m.team>=0&&m.team<6?m.team:null});return J({ok:1})}
 if(m.t==='ans'&&id){if(S.phase!=='q'||Date.now()>S.end+1500)return J({err:'Temps écoulé'});const k=`a:${S.qi}:${id}`;if(!(await get(k)))await st.setJSON(k,{a:m.a,at:Date.now()});return J({ok:1})}
 if(m.t==='roll'&&S.phase==='roll'&&(m.code===CODE||(id&&S.roller!=null&&(await get('p:'+id))?.t===S.roller))){
  const av=CATS.map((c,k)=>QS.some((q,i)=>q.cat===c.id&&!S.done.includes(i))?k:-1).filter(k=>k>=0),k=av[Math.floor(Math.random()*av.length)],pool=QS.map((q,i)=>i).filter(i=>QS[i].cat===CATS[k].id&&!S.done.includes(i));
  S={...S,phase:'rolled',die:{k,qi:pool[Math.floor(Math.random()*pool.length)]},goAt:Date.now()+4500};await save();return J(view(m.code===CODE,id))}
 if(m.t==='pick'&&S.phase==='pick'){const pl=id?await get('p:'+id):null;if(m.code===CODE||(pl&&pl.t!=null&&pl.t!==S.fin)){const k=+m.k,pool=QS.map((q,i)=>i).filter(i=>QS[i].cat===CATS[k]?.id&&!S.done.includes(i));if(pool.length){const qi=pool[Math.floor(Math.random()*pool.length)];S={...S,phase:'q',qi,done:[...S.done,qi],end:Date.now()+QS[qi].time*1000,die:null};await save()}}return J(view(m.code===CODE,id))}
 if(m.code!==CODE)return J({err:'Code animateur incorrect'},403);
 if(m.t==='next'&&(S.phase==='lobby'||S.phase==='reveal')){const fin=S.roller!=null&&S.teams[S.roller].w.length>=6;S=S.winner!=null||S.done.length>=QS.length?{...S,phase:'end'}:fin?{...S,phase:'pick',die:null,fin:S.roller}:{...S,phase:'roll',die:null,fin:null};await save()}
 if(m.t==='go'&&S.phase==='rolled'){const qi=S.die.qi;S={...S,phase:'q',qi,done:[...S.done,qi],end:Date.now()+QS[qi].time*1000,die:null};await save()}
 if(m.t==='end'){S={...S,phase:'end'};await save()}
 if(m.t==='getbank')return J({bank:QS});
 if(m.t==='setbank'&&Array.isArray(m.bank)&&m.bank.length){await st.setJSON('qbank',m.bank);return J({ok:m.bank.length})}
 if(m.t==='reveal'&&S.phase==='q'){const q=QS[S.qi],res={};
  const all=await Promise.all((await st.list({prefix:'p:'})).blobs.map(async b=>{const pid=b.key.slice(2),p=await get(b.key),a=await get(`a:${S.qi}:${pid}`);
   const f=a?grade(q,a.a):0,rem=a?Math.max(0,(S.end-a.at)/(q.time*1000)):0,g=Math.round(f*q.pts*(100+100*rem));
   p.g={...p.g,[S.qi]:{g,f,c:q.cat}};await st.setJSON(b.key,p);res[pid]={gain:g,frac:f};return{r:{id:pid,n:p.n,s:tot(p),w:wed(p)},p,a}}));const rank=all.map(x=>x.r),ps=all.map(x=>x.p),T=T0(),ks=new Set(ps.flatMap(p=>Object.keys(p.g)));
  for(const k of ks){const q2=QS[k];T.forEach((tm,i)=>{const ms=ps.filter(p=>p.t===i&&p.g[k]);if(!ms.length)return;const fr=ms.reduce((a,p)=>a+p.g[k].f,0)/ms.length,full=ms.filter(p=>p.g[k].f===1).length;tm.pos+=Math.ceil(fr*q2.pts);if(full>=Math.ceil(ms.length/2)&&!tm.w.includes(q2.cat))tm.w.push(q2.cat)})}
  rank.sort((a,b)=>b.w.length-a.w.length||b.s-a.s);const cur=T.map((tm,i)=>{const ms=ps.filter(p=>p.t===i&&p.g[S.qi]);return ms.length?ms.reduce((a,p)=>a+p.g[S.qi].f,0)/ms.length:-1}),mx=Math.max(...cur),tops=cur.map((v,i)=>v===mx?i:-1).filter(i=>i>=0),roller=mx>0?tops[Math.floor(Math.random()*tops.length)]:null;
  const ms2=ps.filter(p=>p.t===S.fin&&p.g[S.qi]),won=S.fin!=null&&ms2.length>0&&ms2.filter(p=>p.g[S.qi].f===1).length>=Math.ceil(ms2.length/2),dist=q.type==='qcm'?q.options.map((o,i)=>all.filter(x=>x.a&&Array.isArray(x.a.a)&&x.a.a.includes(i)).length):null;S={...S,phase:'reveal',rank,res,teams:T,roller,winner:won?S.fin:null,dist,nans:all.filter(x=>x.a).length};await save()}
 if(m.t==='reset'){for(const b of (await st.list({prefix:'a:'})).blobs)await st.delete(b.key);
  for(const b of (await st.list({prefix:'p:'})).blobs){const p=await get(b.key);await st.setJSON(b.key,{...p,g:{}})}
  S={phase:'lobby',qi:-1,end:0,gid:Date.now().toString(36),rank:[],res:{},teams:T0(),done:[],roller:null,die:null,goAt:0};await save()}
 return J(view(true,null,{}))};
