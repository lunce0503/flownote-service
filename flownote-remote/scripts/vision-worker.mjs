import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import readline from 'node:readline';
const root=path.resolve(fileURLToPath(new URL('../artifacts/vision/',import.meta.url)));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage();
await page.addInitScript(()=>{window.chrome??={};window.chrome.webview={postMessage(){}};});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.origin!=='https://flownote-remote.local'){await route.abort();return;}
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){await route.abort();return;}
 try{await route.fulfill({body:await readFile(file),contentType:file.endsWith('.wasm')?'application/wasm':file.endsWith('.html')?'text/html':/\.(mjs|js)$/.test(file)?'text/javascript':'application/octet-stream'});}catch{await route.fulfill({status:404,body:'missing asset'});}
});
await page.goto('https://flownote-remote.local/index.html');
await page.waitForFunction(()=>!!window.remoteVision);
await page.evaluate(()=>window.remoteVision.loadModel());
console.log(JSON.stringify({ready:true}));
const lines=readline.createInterface({input:process.stdin});let pending=Promise.resolve();
lines.on('line',line=>{pending=pending.then(async()=>{
 const request=JSON.parse(line);
 const result=await page.evaluate(async({jpeg,id})=>await new Promise((resolve,reject)=>{
  window.chrome.webview.postMessage=message=>{if(message.id!==id)return;if(message.type==='gesture.error')reject(Error('Inference failed'));else if(message.type==='gesture.result')resolve(message);};
  window.remoteVision.infer(jpeg,id);
 }),request);
 console.log(JSON.stringify(result));
}).catch(error=>{process.stderr.write('Vision inference failed\n');process.exitCode=1;lines.close();});});
lines.on('close',()=>pending.finally(()=>browser.close()));
