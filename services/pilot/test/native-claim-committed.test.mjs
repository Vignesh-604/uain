import{test}from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const reader=await import('../dist/src/native/public-read.js');
const records=await import('../dist/src/ledger/records.js');
// The verifier's own digest (services/pilot/scripts/verify-ledger.mjs: canonical + sha256 over {version:1,...record}).
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digestOf=r=>createHash('sha256').update(JSON.stringify(canonical({version:1,...r}))).digest('hex');
const committed=tag=>tag.split(' sha256:')[1];
// A pilot claim revision row as the ledger committed it, and the same revision as the native reader serves it.
const row={claim_id:'CL-72',id:3,base:2,action:'revise',statement:'Statement as believed',sources:'["RC-11","RC-12"]',reason:'Narrowed to the measured cohort',author:'kestrel',at:'2026-10-02T10:00:00.000Z'};
const review={revision_id:3,reviewer:'claude-code',verdict:'support',note:'Matches RC-12',at:'2026-10-02T11:00:00.000Z'};
const served=id=>({revision:id(3),base:id(2),action:row.action,statement:row.statement,sources:[{id:'RC-11'},{id:'RC-12'}],reason:row.reason,author:row.author,at:row.at,reviews:[{reviewer:review.reviewer,verdict:review.verdict,note:review.note,at:review.at}]});
// What verify-ledger.mjs builds from GET /api/claims/CL-72 for "CL-72 revision 3" and "... review".
function verifierRecords(claim,rev,actor){
 const r=claim.history.find(x=>x.revision===Number(rev));if(!r)return null;
 const rv=r.reviews.find(x=>x.reviewer===actor);
 return{revision:{record:'claim_revision',claim_id:claim.id,revision:r.revision,base:r.base??null,action:r.action,statement:r.statement,sources:r.sources.map(s=>s.id),reason:r.reason,author:r.author,at:r.at},
  review:rv&&{record:'claim_review',claim_id:claim.id,revision:r.revision,reviewer:rv.reviewer,verdict:rv.verdict,note:rv.note,at:rv.at}};
}
test('claim revision ids are served as the ledger committed them',()=>{
 assert.equal(reader.committedRevisionId('3'),3);assert.equal(reader.committedRevisionId(3),3);
 assert.equal(reader.committedRevisionId('native:00000000000000000042'),'native:00000000000000000042');
});
test('the verifier recomputes the committed claim revision and review digests from the served claim',()=>{
 const claim={id:'CL-72',history:[served(reader.committedRevisionId)]};
 const v=verifierRecords(claim,'3','claude-code');
 assert.ok(v,'revision 3 is found by number');
 assert.equal(digestOf(v.revision),committed(records.revisionCommitment(row)));
 assert.equal(digestOf(v.review),committed(records.reviewCommitment('CL-72',review)));
});
test('the earlier string form could not be verified',()=>{
 const claim={id:'CL-72',history:[served(String)]};
 assert.equal(verifierRecords(claim,'3','claude-code'),null);
});
