import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PROJECT_AREAS,projectArea} from '../dist/src/native/project-areas.js';

test('pilot search areas match every OPP and PRB catalogue entry',async()=>{
 let dir=new URL('../../../apps/baink/catalogue/',import.meta.url);let files;
 try{files=await readdir(dir);}catch(error){
  if(error.code!=='ENOENT')throw error;
  // The public export includes the real catalogue records at this path.
  // A missing fallback must fail rather than silently losing the comparison.
  dir=new URL('../../../public/projects/',import.meta.url);files=await readdir(dir);
 }
 let n=0;
 for(const file of files.filter(f=>/^domain-\d+\.json$/.test(f))){
  for(const row of JSON.parse(await readFile(new URL(file,dir),'utf8'))){
   assert.equal(projectArea(row.id),row.summary,row.id);
   assert.equal(projectArea('P-'+row.id),row.summary,'P-'+row.id);n++;
  }
 }
 assert.equal(n,21600);
});

void test('pilot search areas handle group boundaries and invalid project IDs without the external catalogue',()=>{
 assert.equal(PROJECT_AREAS.length,450);
 for(const prefix of ['OPP-','PRB-','P-OPP-','P-PRB-']){
  for(const [id,area] of [
   ['00001','Human Health & Longevity · Aging biology & rejuvenation'],
   ['00024','Human Health & Longevity · Aging biology & rejuvenation'],
   ['00025','Human Health & Longevity · Cancer'],
   ['10800','Public Health & Epidemiology · Public health data, ethics & trust'],
  ])assert.equal(projectArea(prefix+id),area,prefix+id);
 }
 for(const id of ['P-OPP-00000','OPP-10801','PRB-10801','P-xxx-00009',null,9,{},'OPP-1','T-OPP-00009-1'])assert.equal(projectArea(id),'');
});
