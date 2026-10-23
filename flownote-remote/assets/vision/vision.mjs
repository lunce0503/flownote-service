import {FilesetResolver,GestureRecognizer} from './vision_bundle.mjs';
const video=document.querySelector('#preview'), received=document.querySelector('#received'), canvas=document.querySelector('#capture'), status=document.querySelector('#status');
let recognizer, stream, timer;
const post=message=>window.chrome?.webview?.postMessage(message);
window.remoteVision={
 async loadModel(){
  if(!recognizer){const files=await FilesetResolver.forVisionTasks('./wasm');recognizer=await GestureRecognizer.createFromOptions(files,{baseOptions:{modelAssetPath:'./gesture_recognizer.task',delegate:'CPU'},runningMode:'IMAGE',numHands:1});}
  post({type:'model.ready'});return true;
 },
 async infer(jpeg,id){
  try{
   const binary=atob(jpeg),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
   if(image.width>640||image.height>640||image.width*image.height>307200)throw Error('Invalid frame size');
   received.src='data:image/jpeg;base64,'+jpeg;received.hidden=false;video.hidden=true;
   try{const result=recognizer.recognize(image),top=result.gestures?.[0]?.[0];post({type:'gesture.result',id,gesture:top?.categoryName??'None',confidence:top?.score??0});}finally{image.close();}
  }catch{post({type:'gesture.error',id});}
 },
 async startCamera(){
  window.remoteVision.stopCamera();
  stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:480},height:{ideal:360}},audio:false});
  video.srcObject=stream;video.hidden=!!recognizer;await video.play();status.textContent='카메라 전송 중 · 중지 버튼으로 종료할 수 있습니다.';
  timer=setInterval(()=>{
   if(!stream||!video.videoWidth)return;
   const scale=Math.min(480/video.videoWidth,360/video.videoHeight,1);
   canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
   canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
   post({type:'camera.frame',jpeg:canvas.toDataURL('image/jpeg',0.6).split(',')[1]});
  },250);
 },
 stopCamera(){clearInterval(timer);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;received.src='';received.hidden=true;status.textContent='카메라 꺼짐';}
};
post({type:'vision.ready'});
