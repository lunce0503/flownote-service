package com.flownote.remote.gesture;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.SystemClock;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import okhttp3.WebSocket;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import android.view.accessibility.AccessibilityNodeInfo;
import android.graphics.Bitmap;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NetworkDeviceTest {
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node,String value){
        if(node==null)return null;
        if(node.isVisibleToUser()&&(value.contentEquals(node.getText()==null?"":node.getText())||value.contentEquals(node.getContentDescription()==null?"":node.getContentDescription())))return node;
        for(int i=0;i<node.getChildCount();i++){var result=find(node.getChild(i),value);if(result!=null)return result;}return null;
    }
    private AccessibilityNodeInfo scrollable(AccessibilityNodeInfo node){if(node==null)return null;if(node.isScrollable())return node;for(int i=0;i<node.getChildCount();i++){var value=scrollable(node.getChild(i));if(value!=null)return value;}return null;}
    private AccessibilityNodeInfo visible(String text){
        var automation=InstrumentationRegistry.getInstrumentation().getUiAutomation();
        for(int i=0;i<35;i++){var value=find(automation.getRootInActiveWindow(),text);if(value!=null)return value;SystemClock.sleep(150);}return null;
    }
    private void click(String text){var value=visible(text);assertNotNull("Missing accessible control: "+text,value);assertTrue("Control was not clickable: "+text,value.performAction(AccessibilityNodeInfo.ACTION_CLICK));SystemClock.sleep(200);}
    private void scroll(boolean forward){var value=scrollable(InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow());if(value!=null)value.performAction(forward?AccessibilityNodeInfo.ACTION_SCROLL_FORWARD:AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);SystemClock.sleep(200);}
    private void capture(String name)throws Exception {
        String path="/data/local/tmp/flownote-remote-"+name+".png";
        var automation=InstrumentationRegistry.getInstrumentation().getUiAutomation();
        // executeShellCommand uses direct argv execution; do not pass shell quotes, pipes or &&.
        try(var input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("screencap -p "+path))){byte[] buffer=new byte[4096];while(input.read(buffer)!=-1){}}
        try(var input=new java.io.BufferedReader(new java.io.InputStreamReader(new android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("ls "+path)),StandardCharsets.UTF_8))){assertEquals("Dashboard capture export failed",path,input.readLine());}
    }
    private byte[] asset(String name)throws Exception {
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)){
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);return output.toByteArray();
        }
    }
    private JSONObject crossedPose(int sequence)throws Exception {
        var pose=new org.json.JSONArray();for(int i=0;i<33;i++){
            double x=i==11?.4:i==12?.6:i==15?.55:i==16?.45:.5;
            double y=i==11||i==12||i==13||i==14?.45:.5;
            pose.put(new JSONObject().put("x",x).put("y",y).put("z",0).put("visibility",1));
        }
        return new JSONObject().put("schemaVersion",1).put("sequence",sequence).put("width",480).put("height",480).put("facing","back")
            .put("detectionThreshold",.7).put("precisionMode","off").put("pose",pose).put("hands",new org.json.JSONArray());
    }
    private void exerciseTouchRemote(android.app.Activity activity)throws Exception {
        var instrumentation=InstrumentationRegistry.getInstrumentation();
        click("터치 리모컨 열기");assertNotNull("Touch drag area missing",visible("드래그 영역"));capture("touch-remote");
        var field=NetworkActivity.class.getDeclaredField("touchWindow");field.setAccessible(true);var dialog=(TouchRemoteDialog)field.get(activity);
        var padField=TouchRemoteDialog.class.getDeclaredField("pad");padField.setAccessible(true);var pad=(TouchPadView)padField.get(dialog);
        for(int i=0;i<40&&!pad.isEnabled();i++)SystemClock.sleep(100);assertTrue("Windows pointer target was not selected",pad.isEnabled());
        long start=SystemClock.uptimeMillis();
        java.util.function.BiConsumer<Integer,float[]> send=(action,xy)->instrumentation.runOnMainSync(()->{var event=android.view.MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,xy[0],xy[1],0);pad.onTouchEvent(event);event.recycle();});
        send.accept(android.view.MotionEvent.ACTION_DOWN,new float[]{70,70});send.accept(android.view.MotionEvent.ACTION_UP,new float[]{70,70});SystemClock.sleep(150);
        send.accept(android.view.MotionEvent.ACTION_DOWN,new float[]{70,70});send.accept(android.view.MotionEvent.ACTION_MOVE,new float[]{110,90});SystemClock.sleep(100);send.accept(android.view.MotionEvent.ACTION_UP,new float[]{110,90});
        for(int i=0;i<8&&find(instrumentation.getUiAutomation().getRootInActiveWindow(),"누른 채 드래그")==null;i++)scroll(true);
        click("누른 채 드래그");send.accept(android.view.MotionEvent.ACTION_DOWN,new float[]{70,70});SystemClock.sleep(500);send.accept(android.view.MotionEvent.ACTION_MOVE,new float[]{110,100});SystemClock.sleep(80);send.accept(android.view.MotionEvent.ACTION_UP,new float[]{110,100});SystemClock.sleep(200);
        for(int i=0;i<14&&find(instrumentation.getUiAutomation().getRootInActiveWindow(),"＋ 커스텀 버튼 추가")==null;i++)scroll(true);
        click("＋ 커스텀 버튼 추가");var name=visible("커스텀 버튼 이름");assertNotNull(name);var args=new android.os.Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,"내 클릭");assertTrue(name.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args));click("저장");
        assertTrue("Custom button did not persist",activity.getSharedPreferences("touch-remote-v1",Context.MODE_PRIVATE).getString("buttons","").contains("내 클릭"));
        for(int i=0;i<12;i++)scroll(false);capture("touch-remote");click("닫기");
        instrumentation.runOnMainSync(()->{var fresh=new TouchRemoteDialog(activity,m->{});fresh.show();try{var saved=TouchRemoteDialog.class.getDeclaredField("entries");saved.setAccessible(true);assertTrue("Custom button was not restored in a new window",saved.get(fresh).toString().contains("내 클릭"));}catch(ReflectiveOperationException e){throw new AssertionError(e);}fresh.dismiss();});
    }
    @Test public void realTlsCameraGestureOutputAndAlert()throws Exception {
        var instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        JSONObject config=new JSONObject(new String(asset("session.json"),StandardCharsets.UTF_8));
        String address=config.getString("address"),pin=config.getString("pin"),code=config.getString("code");
        X509Certificate certificate=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new java.io.ByteArrayInputStream(Base64.decode(config.getString("certificate"),Base64.DEFAULT)));
        new RemoteLink.PinnedTrust(pin).checkServerTrusted(new X509Certificate[]{certificate},"RSA");
        try{new RemoteLink.PinnedTrust(new String(new char[64]).replace('\0','0')).checkServerTrusted(new X509Certificate[]{certificate},"RSA");fail("Wrong pin accepted");}catch(CertificateException expected){}
        String invitation=config.getString("invitation");var parsed=PairingLink.parse(invitation);
        var matrix=new com.google.zxing.qrcode.QRCodeWriter().encode(invitation,com.google.zxing.BarcodeFormat.QR_CODE,480,480);
        int[] qrPixels=new int[480*480];for(int y=0;y<480;y++)for(int x=0;x<480;x++)qrPixels[y*480+x]=matrix.get(x,y)?0xff000000:0xffffffff;
        var qr=Bitmap.createBitmap(qrPixels,480,480,Bitmap.Config.ARGB_8888);assertTrue("Actual Android QR bitmap reader failed",invitation.equals(QrReader.decode(qr)));qr.recycle();
        JSONObject connection=RemoteLink.pair(parsed.address,parsed.pin,parsed.code,"Android real I/O acceptance");
        try{RemoteLink.pair(address,pin,code,"Replay");fail("Pairing code replay accepted");}catch(java.io.IOException expected){}
        CountDownLatch connected=new CountDownLatch(1),gesture=new CountDownLatch(1),alert=new CountDownLatch(1),lost=new CountDownLatch(1),frames=new CountDownLatch(3),rejected=new CountDownLatch(1),recovered=new CountDownLatch(1);
        var rejectionLog=new java.util.concurrent.atomic.AtomicReference<String>("");
        AtomicBoolean alive=new AtomicBoolean(),checkingFixture=new AtomicBoolean();
        AudioManager audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);int maximum=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC),initial=Math.max(2,maximum/3);
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_UNMUTE,0);audio.setStreamVolume(AudioManager.STREAM_MUSIC,initial,0);
        instrumentation.getUiAutomation().executeShellCommand("dumpsys battery set level 10").close();
        RemoteLink link=new RemoteLink(context,connection,new RemoteLink.Listener(){
            public void connected(){alive.set(true);connected.countDown();}
            public void state(JSONObject state){}
            public void gesture(String name,double confidence){if(name.equals("Rejected"))rejected.countDown();if(rejected.getCount()==0&&name.equals("Tracking"))recovered.countDown();if(checkingFixture.get()&&name.equals("WristsCrossed"))gesture.countDown();}
            public void alert(JSONObject notice){if(notice.optString("code").startsWith("battery.low"))alert.countDown();}
            public void disconnected(boolean intentional){alive.set(false);if(!intentional)lost.countDown();}
            public void error(String message){if(message.contains("landmark_out_of_range"))rejectionLog.set(message);}
        });
        CameraSource[] camera=new CameraSource[1];android.app.Activity activity=null;
        try{
            link.connect();assertTrue("TLS/WSS welcome missing",connected.await(10,TimeUnit.SECONDS));
            assertTrue("Low battery notice missing",alert.await(8,TimeUnit.SECONDS));
            activity=instrumentation.startActivitySync(new Intent(context,NetworkActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.CAMERA);
            camera[0]=new CameraSource(context,new CameraSource.Listener(){public void frame(byte[] jpeg){frames.countDown();}public void error(String message){}});
            instrumentation.runOnMainSync(()->{try{camera[0].start(true);}catch(Exception e){throw new IllegalStateException(e);}});
            assertTrue("Camera2 did not deliver live YUV/JPEG frames",frames.await(12,TimeUnit.SECONDS));
            instrumentation.runOnMainSync(()->camera[0].close());link.stopCamera();SystemClock.sleep(900);
            audio.setStreamVolume(AudioManager.STREAM_MUSIC,initial,0);SystemClock.sleep(3300);checkingFixture.set(true);
            byte[] thumb=asset("thumb_up.jpg");
            try(var tracker=new SkeletonTracker(context,.7)){
                var bitmap=android.graphics.BitmapFactory.decodeByteArray(thumb,0,thumb.length);
                var bones=tracker.detect(bitmap,true,"off");
                assertFalse("Native inference recycled the live preview bitmap",bitmap.isRecycled());
                bitmap.recycle();
                assertEquals("Real on-device hand landmarks missing",21,bones.getJSONArray("hands").getJSONObject(0).getJSONArray("points").length());
                assertEquals("back",bones.getString("facing"));assertFalse(bones.toString().contains("jpeg"));assertFalse(bones.toString().contains("base64"));
                var overlay=new SkeletonOverlay(context);instrumentation.runOnMainSync(()->{overlay.layout(0,0,480,480);overlay.show(bones);});
                var drawing=Bitmap.createBitmap(480,480,Bitmap.Config.ARGB_8888);overlay.draw(new android.graphics.Canvas(drawing));
                int[] pixels=new int[480*480];drawing.getPixels(pixels,0,480,0,0,480,480);boolean drawn=false;for(int pixel:pixels)if(pixel!=0){drawn=true;break;}assertTrue("Skeleton overlay drew no bones",drawn);drawing.recycle();
                link.skeleton(bones);SystemClock.sleep(500);
                var invalid=crossedPose(2);invalid.put("hands",bones.getJSONArray("hands"));
                invalid.getJSONArray("pose").getJSONObject(32).put("y",2.33).put("visibility",.03);
                link.skeleton(invalid);
                assertTrue("Bad skeleton frame was not acknowledged",rejected.await(5,TimeUnit.SECONDS));
                assertTrue("Bad skeleton frame disconnected Android",alive.get()&&link.connected());
                assertTrue("Missing safe rejection reason",rejectionLog.get().contains("landmark_out_of_range"));
                assertFalse("Coordinate data leaked to diagnostics",rejectionLog.get().contains("2.33"));
                bones.put("sequence",3);link.skeleton(bones);
                assertTrue("Android frame acknowledgement did not recover",recovered.await(5,TimeUnit.SECONDS));
            }
            assertFalse("Legacy thumb fixture must not control audio",audio.isStreamMute(AudioManager.STREAM_MUSIC));
            link.stopCamera();SystemClock.sleep(200);
            // Synthetic temporal pose verifies routing separately from the real native model above.
            for(int i=1;i<=8;i++){link.skeleton(crossedPose(i));SystemClock.sleep(200);}
            assertFalse("Gesture command escaped suspension",audio.isStreamMute(AudioManager.STREAM_MUSIC));
            link.command(connection.getString("deviceId"),"mute");
            for(int i=0;i<40&&!audio.isStreamMute(AudioManager.STREAM_MUSIC);i++)SystemClock.sleep(100);
            assertTrue("Manual button command did not mute output",audio.isStreamMute(AudioManager.STREAM_MUSIC));
            link.command(connection.getString("deviceId"),"unmute");
            for(int i=0;i<40&&audio.isStreamMute(AudioManager.STREAM_MUSIC);i++)SystemClock.sleep(100);
            assertFalse("Output did not unmute",audio.isStreamMute(AudioManager.STREAM_MUSIC));
            int exact=(int)Math.round(.33*maximum);
            link.control(connection.getString("deviceId"),"audio.set",.33,0,0);
            for(int i=0;i<40&&audio.getStreamVolume(AudioManager.STREAM_MUSIC)!=exact;i++)SystemClock.sleep(100);
            assertEquals("Absolute input did not choose the nearest OS volume step",exact,audio.getStreamVolume(AudioManager.STREAM_MUSIC));
            for(int i=0;i<3;i++){link.control(connection.getString("deviceId"),"audio.set",.33,0,0);SystemClock.sleep(350);assertEquals("Repeating exact volume drifted",exact,audio.getStreamVolume(AudioManager.STREAM_MUSIC));}
            var socketField=RemoteLink.class.getDeclaredField("socket");socketField.setAccessible(true);((WebSocket)socketField.get(link)).cancel();
            assertTrue("Unexpected disconnection was not reported",lost.await(8,TimeUnit.SECONDS));assertFalse(alive.get());
            // Reuse the already authenticated grant through the real dashboard's encrypted saved-connection path.
            link.close();ConnectionStore.save(context,connection);android.app.Activity old=activity;instrumentation.runOnMainSync(old::finish);
            activity=instrumentation.startActivitySync(new Intent(context,NetworkActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            assertNotNull("Dashboard title missing",visible("Flownote Remote"));
            assertNull("Advanced server address must not be on the home screen",find(instrumentation.getUiAutomation().getRootInActiveWindow(),"서버 HTTPS 주소"));
            click("더 보기");assertNotNull("Overflow settings missing",visible("연결 정보와 기록"));instrumentation.getUiAutomation().performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK);
            click("저장된 서버에 다시 연결");
            for(int i=0;i<18&&find(instrumentation.getUiAutomation().getRootInActiveWindow(),"Android real I/O acceptance 사용")==null;i++)scroll(true);
            assertNotNull("Client row and accessible toggle missing",visible("Android real I/O acceptance 사용"));
            click("Android real I/O acceptance 사용");
            var stateField=NetworkActivity.class.getDeclaredField("state");stateField.setAccessible(true);final android.app.Activity currentActivity=activity;boolean[] paused={false};
            for(int i=0;i<50&&!paused[0];i++){instrumentation.runOnMainSync(()->{try{var current=(JSONObject)stateField.get(currentActivity);if(current!=null){var list=current.getJSONArray("devices");for(int j=0;j<list.length();j++){var device=list.getJSONObject(j);if(device.optString("id").equals(connection.optString("deviceId")))paused[0]=!device.optBoolean("enabled");}}}catch(Exception error){throw new AssertionError(error);}});if(!paused[0])SystemClock.sleep(100);}
            assertTrue("Server state did not pause the source",paused[0]);
            for(int i=0;i<4&&find(instrumentation.getUiAutomation().getRootInActiveWindow(),"사용 일시 중지")==null;i++)scroll(true);
            capture("clients-paused");assertNotNull("Client pause summary was not visible after scrolling",visible("사용 일시 중지"));
            click("Android real I/O acceptance 사용");SystemClock.sleep(600);
            assertTrue("Client did not resume",visible("Android real I/O acceptance 사용").isChecked());
            capture("clients");
            for(int i=0;i<18;i++)scroll(false);
            exerciseTouchRemote(activity);
            for(int i=0;i<18;i++)scroll(false);
            capture("dashboard");
            click("연결 코드");click("확인하고 연결");assertNotNull("Pairing must require explicit server confirmation",visible("내 서버의 QR 또는 지문인지 확인해 주세요."));click("닫기");
            System.out.println("PASS: actual QR pixels/parser, Android Camera2, native hand skeleton extraction/overlay, landmark-only TLS/WSS, suspended gestures, touch window/custom button persistence, AudioManager, alerts, overflow dashboard at 320dp/font1.3, saved reconnect, accessible client pause/resume and required pairing confirmation");
        }finally{
            if(camera[0]!=null)camera[0].close();link.close();
            if(activity!=null){android.app.Activity open=activity;instrumentation.runOnMainSync(open::finish);}
            instrumentation.getUiAutomation().executeShellCommand("dumpsys battery reset").close();
        }
    }
}
