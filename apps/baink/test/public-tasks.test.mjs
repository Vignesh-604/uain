import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicTasks } from '../server/public-tasks.mjs';
const task=(id,title)=>({id,project:'P-OPP-00009',title,criteria:'Main KPI: 300 treatments',claimable:true,solver_amount:'20000000',difficulty:{level:'starter',minutes:{min:5,max:20}}});
function fixture(){let calls=0,now=100000;const centralEarning={tasks:async(_,query,options)=>{calls++;assert.equal(options.public,true);const offset=Number(query.cursor);assert.equal(query.limit,31);const size=Math.min(31,50-offset);return {authority:'native',verified:true,tasks:Array.from({length:size},(_,i)=>task('T-'+(offset+i),i===0?'Telomeres':'Research')),total:'50',more:offset+size<50,nextCursor:String(offset+size),proof:{height:'123'}};}};const catalogue={detail:()=>({project:{title:'Safe telomeres',category:'Human Health & Longevity',description:'Aging biology',kpi:{statement:'300 treatments'}}})};return{service:createPublicTasks({centralEarning,catalogue,now:()=>now}),calls:()=>calls,tick:()=>now+=120001};}
test('total covers every page; search, exact project, limit and cursor use one cached snapshot',async()=>{const f=fixture();const a=await f.service.list();assert.equal(a.totalOpen,50);assert.equal(a.returned,12);assert.equal(a.canTakeOnThisPage,12);assert.equal(a.openNow,12);assert.equal(a.nextCursor,'12');assert.equal(a.more,true);assert.equal(f.calls(),2);const b=await f.service.list({cursor:a.nextCursor,limit:50,q:'LONGEVITY 300'});assert.equal(b.totalOpen,50);assert.equal(b.matched,50);assert.equal(b.tasks.length,38);assert.equal(b.more,false);assert.equal(f.calls(),2);const c=await f.service.list({project:'missing'});assert.equal(c.totalOpen,50);assert.equal(c.matched,0);assert.equal(c.nextCursor,null);assert.equal(f.calls(),2);assert.ok(!('searchText' in a.tasks[0]));});
test('concurrent queries share the scan; bad query is refused before scanning',async()=>{const f=fixture();await Promise.all(Array.from({length:10},(_,i)=>f.service.list({q:String(i)})));assert.equal(f.calls(),2);for(const q of [{q:'x'.repeat(101)},{limit:51},{cursor:'../x'},{project:42}])await assert.rejects(()=>f.service.list(q),{code:'invalid_query'});assert.equal(f.calls(),2);});
test('failed or incomplete reads are unavailable, never a false total',async()=>{const s=createPublicTasks({centralEarning:{tasks:async()=>({authority:'native',verified:false,tasks:[]})}});assert.equal((await s.list()).status,'unavailable');const t=createPublicTasks({centralEarning:{tasks:async()=>({authority:'native',verified:true,tasks:[],more:true,nextCursor:'0'})}});assert.equal((await t.list()).status,'unavailable');});
test('cold callers share one flight and stale refresh retains last complete proved snapshot',async()=>{
 let now=100000,calls=0,release;let gated=false;let gate;const service=createPublicTasks({now:()=>now,centralEarning:{tasks:async()=>{calls++;if(gated)await gate;return {authority:'native',verified:true,total:'1',tasks:[task('T-one','Longevity')],proof:{height:'123'}};}}});
 const first=await service.list();assert.equal(first.totalOpen,1);gated=true;gate=new Promise(r=>release=r);now+=120001;
 const refreshing=await Promise.all(Array.from({length:10},()=>service.list()));assert.ok(refreshing.every(r=>r.totalOpen===1&&r.cachedAt===first.cachedAt));assert.equal(calls,2);release();
});

test('cold deadline reports warming, never zero total, and repeated calls share a load',async(t)=>{
 // The 7.5 s warming timer is unref'd on purpose (a live HTTP request keeps production's loop alive); this fake flight holds no handle, so mock the clock and pass the deadline deliberately.
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,release;const gate=new Promise(r=>release=r);const service=createPublicTasks({centralEarning:{tasks:async()=>{calls++;await gate;return {authority:'native',verified:true,total:'0',tasks:[]};}}});
 const pending=Promise.all([service.list(),service.list({q:'longevity'})]);await new Promise(r=>setImmediate(r));t.mock.timers.tick(7500);const [a,b]=await pending;assert.equal(a.warming,true);assert.equal(b.warming,true);assert.equal(a.totalOpen,undefined);assert.equal(calls,1);release();await new Promise(r=>setImmediate(r));assert.equal((await service.list()).totalOpen,0);
});

// One proved page at a time (19 November 2026): the snapshot refresh never holds both reader slots,
// refreshes after two minutes and serves the last complete snapshot for at most ten.
test('the refresh reads 31-task pages one at a time and keeps the last snapshot for ten minutes',async()=>{
 let now=100000,active=0,peak=0,calls=0,fail=false;const total=200;
 const service=createPublicTasks({now:()=>now,centralEarning:{tasks:async(_,query)=>{calls++;if(fail)throw Error('reader busy');active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));active--;const offset=Number(query.cursor),size=Math.min(query.limit,total-offset);assert.equal(query.limit,31);return {authority:'native',verified:true,total:String(total),tasks:Array.from({length:size},(_,i)=>task('T-'+(offset+i),'Research')),proof:{height:'9'}};}}});
 const first=await service.list();assert.equal(first.totalOpen,200);assert.equal(calls,7);assert.equal(peak,1);
 now+=119999;await service.list();assert.equal(calls,7);
 fail=true;now+=2;const stale=await service.list();assert.equal(stale.status,'available');assert.equal(stale.totalOpen,200);
 now+=479990;await new Promise(r=>setImmediate(r));assert.equal((await service.list()).status,'available');
 now+=31000;assert.equal((await service.list()).status,'unavailable');
});
