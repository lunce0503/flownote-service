import {FilesetResolver,GestureRecognizer,HandLandmarker,PoseLandmarker} from './vision_bundle.mjs';
const video=document.querySelector('#preview'),received=document.querySelector('#received'),canvas=document.querySelector('#capture'),status=document.querySelector('#status'),bones=document.querySelector('#bones');
const post=message=>window.chrome?.webview?.postMessage(message);
let files,hands,pose,recognizer,stream,timer,busy=false,sequence=0,threshold=.8,precision='off',facing='front',generation=0;
const HAND=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const POSE=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24]];
// Hand landmarks have no per-joint visibility score; do not treat proto's default 0 as occlusion.
function points(list,visibility=false){return list.map(p=>({x:p.x,y:p.y,z:p.z,...(visibility?{visibility:p.visibility??0}:{})}));}
function extract(image){
 const h=hands.detect(image),p=pose.detect(image),seen=new Set();
 return {schemaVersion:1,sequence:++sequence,width:image.videoWidth||image.width,height:image.videoHeight||image.height,facing,detectionThreshold:threshold,precisionMode:precision,
  pose:points(p.landmarks?.[0]??[],true),hands:(h.landmarks??[]).flatMap((landmarks,index)=>{const side=h.handedness[index]?.[0]?.categoryName;if(!['Left','Right'].includes(side)||seen.has(side))return [];seen.add(side);return [{side,points:points(landmarks)}];})};
}
function draw(frame){
 const ctx=bones.getContext('2d');bones.width=frame.width;bones.height=frame.height;ctx.clearRect(0,0,bones.width,bones.height);ctx.strokeStyle='#62edb4';ctx.fillStyle='#fff';ctx.lineWidth=2;
 function links(ps,edges){for(const [a,b] of edges){if(!ps[a]||!ps[b]||ps[a].visibility<.5||ps[b].visibility<.5)continue;ctx.beginPath();ctx.moveTo(ps[a].x*bones.width,ps[a].y*bones.height);ctx.lineTo(ps[b].x*bones.width,ps[b].y*bones.height);ctx.stroke();}for(const p of ps){if(p.visibility<.5)continue;ctx.beginPath();ctx.arc(p.x*bones.width,p.y*bones.height,3,0,Math.PI*2);ctx.fill();}}
 links(frame.pose,POSE);for(const hand of frame.hands)links(hand.points,HAND);
}
window.remoteVision={
 async loadModel(min=.8){
  files??=await FilesetResolver.forVisionTasks('./wasm');
  if(hands&&threshold===min){post({type:'model.ready'});return true;}
  hands?.close();pose?.close();threshold=min;
  hands=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./hand_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numHands:2,minHandDetectionConfidence:min,minHandPresenceConfidence:min});
  pose=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./pose_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numPoses:1,minPoseDetectionConfidence:min,minPosePresenceConfidence:min,outputSegmentationMasks:false});
  post({type:'model.ready'});return true;
 },
 async extract(jpeg,id){
  try{const bytes=Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));try{await this.loadModel(threshold);const frame=extract(image);draw(frame);post({type:'skeleton.result',id,frame});}finally{image.close();}}
  catch{post({type:'gesture.error',id});}
 },
 // Local diagnostic only. Camera/network paths never call this legacy classifier.
 async infer(jpeg,id){
  try{files??=await FilesetResolver.forVisionTasks('./wasm');recognizer??=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:'./gesture_recognizer.task',delegate:'CPU'},runningMode:'IMAGE',numHands:1});
   const image=await createImageBitmap(new Blob([Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0))],{type:'image/jpeg'}));
   try{const top=recognizer.recognize(image).gestures?.[0]?.[0];post({type:'gesture.result',id,gesture:top?.categoryName??'None',confidence:top?.score??0});}finally{image.close();}
  }catch{post({type:'gesture.error',id});}
 },
 setPrecision(mode){precision=['off','volume','zoom','move'].includes(mode)?mode:'off';},
 async cameras(){return (await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').map((d,i)=>({id:d.deviceId,name:d.label||`카메라 ${i+1}`}));},
 async startCamera(options={}){
  this.stopCamera();const current=++generation;precision=options.precisionMode??'off';facing=options.facing??'front';
  if(!options.qrOnly)await this.loadModel(options.threshold??.8);
  if(current!==generation)return;
  const constraints={width:{ideal:640,max:640},height:{ideal:480,max:480}};
  if(options.deviceId)constraints.deviceId={exact:options.deviceId};else constraints.facingMode=facing==='back'?{exact:'environment'}:{ideal:'user'};
  const capture=await navigator.mediaDevices.getUserMedia({video:constraints,audio:false});
  if(current!==generation){capture.getTracks().forEach(t=>t.stop());return;}
  stream=capture;sequence=0;video.srcObject=stream;video.hidden=false;received.hidden=true;bones.hidden=!!options.qrOnly;
  document.querySelector('#previewWrap').style.transform=facing==='front'?'scaleX(-1)':'';await video.play();
  status.textContent=options.qrOnly?'QR을 보여 주세요.':'이 기기에서 골격 추출 중 · 영상은 서버로 전송하지 않습니다.';
  timer=setInterval(async()=>{if(busy||!stream||!video.videoWidth||current!==generation)return;busy=true;
   try{if(options.qrOnly){canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);post({type:'camera.frame',jpeg:canvas.toDataURL('image/jpeg',.6).split(',')[1]});}
   else{const frame=extract(video);draw(frame);post({type:'camera.skeleton',frame});}}
   catch{post({type:'camera.error'});}finally{busy=false;}
  },100);
 },
 stopCamera(){generation++;clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;received.src='';received.hidden=true;bones.hidden=true;status.textContent='카메라 꺼짐';}
};
post({type:'vision.ready'});
