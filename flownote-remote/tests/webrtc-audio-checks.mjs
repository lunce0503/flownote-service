import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {createVoicePeer} = await import(process.env.FLOWNOTE_REMOTE_VOICE_WORKER
  ? pathToFileURL(path.resolve(process.env.FLOWNOTE_REMOTE_VOICE_WORKER)).href : '../scripts/voice-worker.mjs');

let connected = 0, received = 0, energetic = 0;
const errors = [];
function event(message) {
  if (message.type === 'connected') connected++;
  if (message.type === 'error') errors.push(message.message);
  if (message.type === 'audio') {
    assert.equal(message.sampleRate, 24000); assert.equal(message.numChannels, 1);
    const bytes = Buffer.from(message.data, 'base64');
    assert.equal(bytes.length, 4800);
    let energy = 0;
    for (let i=0; i<bytes.length; i+=2) energy += (bytes.readInt16LE(i) / 32768) ** 2;
    received++; if (Math.sqrt(energy / (bytes.length/2)) > 0.02) energetic++;
  }
}
const a = await createVoicePeer(event), b = await createVoicePeer(event, false);
async function until(test, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (test()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw Error('Timed out waiting for WebRTC audio');
}
try {
  const offer = await a.description('offer'); const answer = await b.description('answer', offer); await a.answer(answer);
  await until(() => connected === 2);
  for (let chunk=0; chunk<16; chunk++) {
    const pcm = Buffer.alloc(2400);
    for (let sample=0; sample<1200; sample++) pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*(chunk*1200+sample)/24000)*12000), sample*2);
    await a.input(pcm.toString('base64')); await new Promise(resolve => setTimeout(resolve, 50));
  }
  await until(() => energetic > 1);
  assert.deepEqual(errors, []);
  console.log(`PASS: real Chromium AudioWorklet → WebRTC/Opus → PCM24k mono (${received} chunks, ${energetic} non-silent); no external account/network required`);
} finally { await a.close(); await b.close(); }
