import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {chromium} from 'playwright';

const root=path.resolve('artifacts/vision');
const browser=await chromium.launch({headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try {
 const context=await browser.newContext({permissions:['camera']});const page=await context.newPage();
 await page.addInitScript(()=>{
  window.messages=[];window.chrome={webview:{postMessage:m=>window.messages.push(m)}};
  const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.constraints=[];
  navigator.mediaDevices.getUserMedia=async options=>{
   window.constraints.push(options);
   // This desktop fixture has no rear camera; exercise the explicit error path.
   if(options.video.facingMode?.exact==='environment')throw new DOMException('Rear camera absent','OverconstrainedError');
   return capture(options);
  };
 });
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url()),file=path.resolve(root,u.pathname==='/'?'index.html':u.pathname.slice(1));
  if(u.origin!=='https://flownote-remote.local'||!file.startsWith(root+path.sep)){await route.abort();return;}
  await route.fulfill({body:await readFile(file),contentType:file.endsWith('.html')?'text/html':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream'});
 });
 await page.goto('https://flownote-remote.local/');await page.waitForFunction(()=>window.remoteVision);
 const jpeg=(await readFile('artifacts/tests/thumb_up.jpg')).toString('base64');
 await page.evaluate(async jpeg=>window.remoteVision.extract(jpeg,'fixture'),jpeg);
 await page.waitForFunction(()=>window.messages.some(m=>m.id==='fixture'));
 const frame=await page.evaluate(()=>window.messages.find(m=>m.id==='fixture').frame);
 assert.equal(frame.hands[0].points.length,21);assert.ok([0,33].includes(frame.pose.length));
 assert.ok(!JSON.stringify(frame).match(/jpeg|base64|data:/i));
 assert.ok(await page.evaluate(()=>document.querySelector('#bones').getContext('2d').getImageData(0,0,document.querySelector('#bones').width,document.querySelector('#bones').height).data.some(v=>v)));
 await page.evaluate(()=>window.remoteVision.startCamera({facing:'front',threshold:.8}));
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='camera.skeleton'),{timeout:15000});
 assert.equal(await page.evaluate(()=>window.messages.filter(m=>m.type==='camera.frame').length),0);
 assert.equal(await page.evaluate(()=>document.querySelector('#previewWrap').style.transform),'scaleX(-1)');
 assert.equal(await page.evaluate(()=>window.messages.find(m=>m.type==='camera.skeleton').frame.precisionMode),'off');
 await page.evaluate(()=>window.remoteVision.setPrecision('move'));
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='camera.skeleton'&&m.frame.precisionMode==='move'));
 await page.evaluate(()=>{window.activeTracks=document.querySelector('#preview').srcObject.getTracks();window.remoteVision.stopCamera();});
 assert.equal(await page.evaluate(()=>window.activeTracks.every(t=>t.readyState==='ended')),true);
 const before=await page.evaluate(()=>window.constraints.length);
 assert.equal(await page.evaluate(async()=>{try{await window.remoteVision.startCamera({facing:'back'});return false;}catch(e){return e.name==='OverconstrainedError';}}),true);
 assert.equal(await page.evaluate(()=>window.constraints.length),before+1,'Rear failure must not reopen front camera');
 assert.deepEqual(await page.evaluate(()=>window.constraints.at(-1).video.facingMode),{exact:'environment'});
 // QR capture is explicitly local and remains separate from skeleton transport.
 await page.evaluate(()=>window.remoteVision.startCamera({facing:'front',qrOnly:true}));
 await page.waitForFunction(()=>window.messages.some(m=>m.type==='camera.frame'));
 await page.evaluate(()=>window.remoteVision.stopCamera());
 // Reproduce the real partial-body model output that disconnected 0.5.1.
 const poseJpeg=(await readFile('artifacts/tests/pose.jpg')).toString('base64');
 await page.evaluate(async jpeg=>{
  const image=await createImageBitmap(new Blob([Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0))],{type:'image/jpeg'}));
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=640;
  canvas.getContext('2d').drawImage(image,.4*image.width,.3*image.height,.2*image.width,.3*image.height,0,0,480,640);image.close();
  await window.remoteVision.extract(canvas.toDataURL('image/jpeg',.8).split(',')[1],'partial-body');
 },poseJpeg);
 const partial=await page.evaluate(()=>window.messages.find(m=>m.id==='partial-body').frame);
 assert.equal(partial.pose.length,33);
 assert.ok(partial.pose.some(p=>p.y>2&&p.visibility<.1),'Pinned partial body must reproduce an out-of-range hidden joint');
 const fixture='artifacts/tests/partial-body-skeleton.json';await writeFile(fixture,JSON.stringify(partial));
 execFileSync('dotnet',['run','--project','tests/Flownote.Remote.Network.Checks','-c','Release','--','--recovery-fixture',fixture],{stdio:'inherit'});
 console.log('PASS: real partial-body pose → rejected TLS frame → same session recovers normal gestures and output control');
 console.log('PASS: real local hand model/overlay, fake-camera capture, skeleton-only live bridge, explicit precision, stop tracks, rear exact/no fallback and local QR path');
} finally {await browser.close();}
