import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const reader=await import('../dist/src/native/public-read.js');
const records=await import('../dist/src/ledger/records.js');
// The verifier's own digest (services/pilot/scripts/verify-ledger.mjs: canonical + sha256 over {version:1,...record}).
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digestOf=r=>createHash('sha256').update(JSON.stringify(canonical({version:1,...r}))).digest('hex');
const committed=tag=>tag.split(' sha256:')[1];
// A legacy contribution row as the ledger committed it: lists and objects stored as JSON text, forecast included.
const row={id:'RC-9001',project_id:'P-1',contributor:'kestrel',kind:'forecast',title:'Example forecast',detail:'Harmless fixture',task_id:null,
 reconciles:'[]',karma_claimed:5,verifiers_required:1,artifacts:'[]',reproduction:'{"steps":["run"]}',claim_statement:null,evidence:null,
 sources:'["S-1"]',source_checks:'[]',forecast:'{"question":"Will the example resolve?","p":0.6,"resolves":"2027-01-01"}',meta:null,submitted_at:'2026-10-01T09:00:00.000Z'};
// The served contribution before research-form normalization: structured fields parsed elsewhere, forecast still text.
const served=forecast=>reader.committedResearchForm({...row,reconciles:[],artifacts:[],forecast,verifications:[]});
// What verify-ledger.mjs builds from GET /api/contributions/RC-n for an "RC-n" entry.
const verifierRecord=c=>({record:'contribution',id:c.id,project_id:c.project_id,contributor:c.contributor,
 kind:c.kind,title:c.title,detail:c.detail,task_id:c.task_id??null,
 reconciles:c.reconciles,karma_claimed:c.karma_claimed,
 verifiers_required:c.verifiers_required,artifacts:c.artifacts,
 reproduction:c.reproduction??null,claim_statement:c.claim_statement??null,
 evidence:c.evidence??null,sources:c.sources,source_checks:c.source_checks,
 forecast:c.forecast??null,meta:c.meta??null,submitted_at:c.submitted_at});
test('the verifier recomputes the committed contribution digest when forecast is stored as JSON text',()=>{
 const c=served(row.forecast);
 assert.deepEqual(c.forecast,{question:'Will the example resolve?',p:0.6,resolves:'2027-01-01'});
 assert.equal(digestOf(verifierRecord(c)),committed(records.contributionCommitment(row)));
});
test('the earlier string forecast could not be verified',()=>{
 const c={...served(null),forecast:row.forecast};
 assert.notEqual(digestOf(verifierRecord(c)),committed(records.contributionCommitment(row)));
});
test('structured, null and malformed forecasts keep their meaning',()=>{
 const object={question:'q',p:0.1};
 assert.deepEqual(served(object).forecast,object);
 assert.equal(served(null).forecast,null);
 assert.equal(served(undefined).forecast,undefined);
 assert.equal(served('').forecast,null);
 assert.equal(served('not json {').forecast,'not json {');
});
