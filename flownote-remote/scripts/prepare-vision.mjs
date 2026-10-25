import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const lock=JSON.parse(await readFile(path.join(root,'vision.lock.json'),'utf8'));
const output=path.join(root,'artifacts/vision');
await mkdir(output,{recursive:true});
async function download(url,file,algorithm,expected,encoding='hex'){
 let bytes;
 try{bytes=await readFile(file);if(createHash(algorithm).update(bytes).digest(encoding)===expected)return;}catch{}
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('Vision asset download failed: '+response.status);
 bytes=Buffer.from(await response.arrayBuffer());
 if(createHash(algorithm).update(bytes).digest(encoding)!==expected)throw Error('Vision asset integrity mismatch');
 await writeFile(file,bytes);
}
const archive=path.join(root,'artifacts/vision-package.tgz');
await download(lock.packageUrl,archive,'sha512',lock.packageIntegrity,'base64');
const entries=['vision_bundle.mjs',...['vision_wasm_internal','vision_wasm_nosimd_internal','vision_wasm_module_internal'].flatMap(n=>['wasm/'+n+'.js','wasm/'+n+'.wasm'])];
execFileSync('tar',['-xzf',archive,'-C',output,'--strip-components=1',...entries.map(n=>'package/'+n)]);
await download(lock.modelUrl,path.join(output,'gesture_recognizer.task'),'sha256',lock.modelSha256);
for (const [key,file] of [['handLandmarker','hand_landmarker.task'],['poseLandmarker','pose_landmarker.task']])
 await download(lock[key+'Url'],path.join(output,file),'sha256',lock[key+'Sha256']);
const androidModels=path.join(root,'artifacts/android-vision');
await mkdir(androidModels,{recursive:true});
for(const file of ['hand_landmarker.task','pose_landmarker.task'])await cp(path.join(output,file),path.join(androidModels,file));
await cp(path.join(root,'assets/vision'),output,{recursive:true});
await mkdir(path.join(root,'artifacts/tests'),{recursive:true});
await download(lock.testImageUrl,path.join(root,'artifacts/tests/thumb_up.jpg'),'sha256',lock.testImageSha256);
await download(lock.poseTestImageUrl,path.join(root,'artifacts/tests/pose.jpg'),'sha256',lock.poseTestImageSha256);
console.log('PASS: pinned MediaPipe code, WASM, model and public test image prepared');
