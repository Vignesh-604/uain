import {test} from 'node:test';import assert from 'node:assert/strict';import {publicRecordResponse} from '../dist/src/api/public-record-pages.js';
test('record catalogue crossing 50000 URLs exposes compatible leaf shards',async()=>{
 const read=async url=>{const page=Number(url.searchParams.get('page'));if(url.pathname==='/api/projects')return {status:200,body:{pages:250,projects:Array.from({length:200},(_,i)=>({id:'p'+((page-1)*200+i)}))}};return{status:200,body:{pages:1,participants:[{id:'member'}]}};};
 const root=await publicRecordResponse(new URL('https://uain.global/records/sitemap.xml'),read);assert.equal(root.status,200);assert.match(root.body,/<sitemapindex/);assert.match(root.body,/sitemap-2.xml/);
 const last=await publicRecordResponse(new URL('https://uain.global/records/sitemap-2.xml'),read);assert.equal(last.status,200);assert.equal((last.body.match(/<url>/g)??[]).length,3);assert.match(last.body,/directory\/member/);
 const missing=await publicRecordResponse(new URL('https://uain.global/records/sitemap-3.xml'),read);assert.equal(missing.status,404);
});
