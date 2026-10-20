import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoteSaveQueue, waitForNoteSave } from './noteSaveQueue.ts';
import { createDraftQueue } from '../../../entities/blog/model/noteDrafts.ts';
const initial = { id:'note',title:'title',content:{format:'markdown',version:1,markdown:''},created_at:'2026-10-19',revision:1 };
const setup = () => {
  const rows = new Map();
  const drafts = createDraftQueue({read:async k=>rows.get(k)??null,write:async(k,v)=>v?rows.set(k,v):rows.delete(k)});
  return {drafts};
};
const tick = () => new Promise(resolve=>setTimeout(resolve, 0));
test('ack A preserves B, rebases its recovery revision, and route teardown stops further saves', async () => {
  const {drafts} = setup(); let finish;
  const statuses=[]; const saves=[];
  const queue=createNoteSaveQueue('a',initial,async note=>{ saves.push(note); return new Promise(r=>{finish=r;}); },()=>true,s=>statuses.push(s),drafts);
  queue.capture({...initial,title:'A'}); await tick(); queue.retry(); await tick();
  queue.capture({...initial,title:'B'}); queue.pause();
  finish({...saves[0],revision:2}); await waitForNoteSave('a','note');
  assert.equal((await drafts.read('a','note')).note.title,'B');
  assert.equal((await drafts.read('a','note')).baseRevision,2);
  assert.equal(saves.length,1);
  assert.notEqual(statuses.at(-1),'서버에 저장됨');
});
test('conflict never retries over a remote revision and retains local text', async () => {
  const {drafts} = setup(); let calls=0;
  const q=createNoteSaveQueue('b',initial,async()=>{calls++;throw {response:{status:409}};},()=>true,()=>{},drafts);
  q.capture({...initial,title:'local'}); await tick();q.retry();await waitForNoteSave('b','note');q.retry();
  assert.equal(q.conflicted,true);
  assert.equal(calls,1);assert.equal((await drafts.read('b','note')).note.title,'local');q.pause();
});
test('account switch fences delayed persistence before any request', async () => {
  const {drafts}=setup();let sameOwner=true,calls=0;
  const q=createNoteSaveQueue('c',initial,async n=>{calls++;return n;},()=>sameOwner,()=>{},drafts);
  q.capture(initial);sameOwner=false;q.retry();await tick();assert.equal(calls,0);q.pause();
});
test('failed local persistence cannot be called saved or issue a network write', async () => {
  const drafts=createDraftQueue({read:async()=>null,write:async()=>{throw new Error('quota');}});
  let calls=0;const statuses=[];
  const q=createNoteSaveQueue('quota',initial,async n=>{calls++;return n;},()=>true,s=>statuses.push(s),drafts);
  q.capture(initial);await tick();q.retry();await q.settled;
  assert.equal(calls,0);assert.equal(q.hasPending,true);
  assert.ok(statuses.some(s=>s.includes('기기 보관 실패')));assert.ok(!statuses.includes('서버에 저장됨'));q.pause();
});

test('ack A cannot label a newer quota-failed draft B as stored on the device', async () => {
  const rows=new Map();
  const drafts=createDraftQueue({read:async k=>rows.get(k)??null,write:async(k,v)=>{
    if(v?.note.title==='B') throw new Error('quota');
    if(v) rows.set(k,v);else rows.delete(k);
  }});
  let finish;const statuses=[];
  const q=createNoteSaveQueue('quota-order',initial,async n=>new Promise(resolve=>{finish=()=>resolve({...n,revision:2});}),()=>true,s=>statuses.push(s),drafts);
  q.capture({...initial,title:'A'});await tick();q.retry();await tick();
  q.capture({...initial,title:'B'});await tick();q.pause();finish();await q.settled;
  assert.notEqual(statuses.at(-1),'기기에 보관됨');
  assert.match(statuses.at(-1),/실패/);
});
