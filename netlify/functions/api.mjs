import {getStore} from '@netlify/blobs';
import D from '../../questions.json';
const QS=D.questions,CATS=D.categories,CODE=process.env.HOST_CODE||'animateur';
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
 let S=(await get('state'))||{phase:'lobby',qi:-1,end:0,gid:'0',rank:[],res:{}};
 const save=()=>st.setJSON('state',S);
 const view=(host,id,x={})=>{const q=QS[S.qi],r=S.rank,i=r.findIndex(p=>p.id===id),p=r[i],res=(S.res||{})[id]||{gain:0,frac:0};
  return{phase:S.phase,qi:S.qi,gid:S.gid,total:QS.length,left:Math.max(0,S.end-Date.now()),cats:CATS,q:q&&(S.phase==='q'||S.phase==='reveal')?pub(q):null,sol:S.phase==='reveal'?sol(q):null,
  rank:r.slice(0,host?40:8).map(({n,s,w})=>({n,s,w})),n:x.n??r.length,ans:x.ans??0,me:p?{name:p.n,score:p.s,w:p.w,gain:res.gain,frac:res.frac,pos:i+1}:null}};
 const u=new URL(req.url);
 if(req.method==='GET'){const h=u.searchParams.get('host');if(h!==null&&h!==CODE)return J({err:'Code animateur incorrect'});let x={};
  if(h!==null){const ps=await st.list({prefix:'p:'}),as=S.phase==='q'?await st.list({prefix:`a:${S.qi}:`}):{blobs:[]};x={n:ps.blobs.length,ans:as.blobs.length}}
  return J(view(h!==null,u.searchParams.get('id'),x))}
 const m=await req.json().catch(()=>({})),id=String(m.id||'').slice(0,40);
 if(m.t==='join'&&id&&m.name){const p=(await get('p:'+id))||{g:{}};await st.setJSON('p:'+id,{...p,n:String(m.name).slice(0,20)});return J({ok:1})}
 if(m.t==='ans'&&id){if(S.phase!=='q'||Date.now()>S.end+1500)return J({err:'Temps écoulé'});const k=`a:${S.qi}:${id}`;if(!(await get(k)))await st.setJSON(k,{a:m.a,at:Date.now()});return J({ok:1})}
 if(m.code!==CODE)return J({err:'Code animateur incorrect'},403);
 if(m.t==='next'&&S.phase!=='q'){S=S.qi+1>=QS.length?{...S,phase:'end'}:{...S,qi:S.qi+1,phase:'q',end:Date.now()+QS[S.qi+1].time*1000};await save()}
 if(m.t==='reveal'&&S.phase==='q'){const q=QS[S.qi],res={};
  const rank=await Promise.all((await st.list({prefix:'p:'})).blobs.map(async b=>{const pid=b.key.slice(2),p=await get(b.key),a=await get(`a:${S.qi}:${pid}`);
   const f=a?grade(q,a.a):0,rem=a?Math.max(0,(S.end-a.at)/(q.time*1000)):0,g=Math.round(f*q.pts*(100+100*rem));
   p.g={...p.g,[S.qi]:{g,f,c:q.cat}};await st.setJSON(b.key,p);res[pid]={gain:g,frac:f};return{id:pid,n:p.n,s:tot(p),w:wed(p)}}));
  rank.sort((a,b)=>b.w.length-a.w.length||b.s-a.s);S={...S,phase:'reveal',rank,res};await save()}
 if(m.t==='reset'){for(const b of (await st.list({prefix:'a:'})).blobs)await st.delete(b.key);
  for(const b of (await st.list({prefix:'p:'})).blobs){const p=await get(b.key);await st.setJSON(b.key,{...p,g:{}})}
  S={phase:'lobby',qi:-1,end:0,gid:Date.now().toString(36),rank:[],res:{}};await save()}
 return J(view(true,null,{}))};
