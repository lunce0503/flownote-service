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
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NetworkDeviceTest {
    private byte[] asset(String name)throws Exception {
        try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)){
            ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)output.write(buffer,0,count);return output.toByteArray();
        }
    }
    @Test public void realTlsCameraGestureOutputAndAlert()throws Exception {
        var instrumentation=InstrumentationRegistry.getInstrumentation();Context context=instrumentation.getTargetContext();
        JSONObject config=new JSONObject(new String(asset("session.json"),StandardCharsets.UTF_8));
        String address=config.getString("address"),pin=config.getString("pin"),code=config.getString("code");
        X509Certificate certificate=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new java.io.ByteArrayInputStream(Base64.decode(config.getString("certificate"),Base64.DEFAULT)));
        new RemoteLink.PinnedTrust(pin).checkServerTrusted(new X509Certificate[]{certificate},"RSA");
        try{new RemoteLink.PinnedTrust(new String(new char[64]).replace('\0','0')).checkServerTrusted(new X509Certificate[]{certificate},"RSA");fail("Wrong pin accepted");}catch(CertificateException expected){}
        JSONObject connection=RemoteLink.pair(address,pin,code,"Android real I/O acceptance");
        try{RemoteLink.pair(address,pin,code,"Replay");fail("Pairing code replay accepted");}catch(java.io.IOException expected){}
        CountDownLatch connected=new CountDownLatch(1),gesture=new CountDownLatch(1),alert=new CountDownLatch(1),lost=new CountDownLatch(1),frames=new CountDownLatch(3);
        AtomicBoolean alive=new AtomicBoolean(),checkingFixture=new AtomicBoolean();
        AudioManager audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);int maximum=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC),initial=Math.max(2,maximum/3);
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_UNMUTE,0);audio.setStreamVolume(AudioManager.STREAM_MUSIC,initial,0);
        instrumentation.getUiAutomation().executeShellCommand("dumpsys battery set level 10").close();
        RemoteLink link=new RemoteLink(context,connection,new RemoteLink.Listener(){
            public void connected(){alive.set(true);connected.countDown();}
            public void state(JSONObject state){}
            public void gesture(String name,double confidence){if(checkingFixture.get()&&name.equals("Thumb_Up")&&confidence>=0.7)gesture.countDown();}
            public void alert(JSONObject notice){if(notice.optString("code").startsWith("battery.low"))alert.countDown();}
            public void disconnected(boolean intentional){alive.set(false);if(!intentional)lost.countDown();}
            public void error(String message){}
        });
        CameraSource[] camera=new CameraSource[1];android.app.Activity activity=null;
        try{
            link.connect();assertTrue("TLS/WSS welcome missing",connected.await(10,TimeUnit.SECONDS));
            assertTrue("Low battery notice missing",alert.await(8,TimeUnit.SECONDS));
            activity=instrumentation.startActivitySync(new Intent(context,NetworkActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(),Manifest.permission.CAMERA);
            camera[0]=new CameraSource(context,new CameraSource.Listener(){public void frame(byte[] jpeg){link.frame(jpeg);frames.countDown();}public void error(String message){}});
            instrumentation.runOnMainSync(()->{try{camera[0].start(false);}catch(Exception e){throw new IllegalStateException(e);}});
            assertTrue("Camera2 did not deliver live YUV/JPEG frames",frames.await(12,TimeUnit.SECONDS));
            instrumentation.runOnMainSync(()->camera[0].close());link.stopCamera();SystemClock.sleep(900);
            audio.setStreamVolume(AudioManager.STREAM_MUSIC,initial,0);SystemClock.sleep(3300);checkingFixture.set(true);
            byte[] thumb=asset("thumb_up.jpg");
            for(int i=0;i<10;i++){link.frame(thumb);SystemClock.sleep(300);}
            assertTrue("Real server MediaPipe gesture missing",gesture.await(5,TimeUnit.SECONDS));
            for(int i=0;i<40&&audio.getStreamVolume(AudioManager.STREAM_MUSIC)<=initial;i++)SystemClock.sleep(100);
            assertTrue("Server gesture did not change actual Android media volume",audio.getStreamVolume(AudioManager.STREAM_MUSIC)>initial);
            var socketField=RemoteLink.class.getDeclaredField("socket");socketField.setAccessible(true);((WebSocket)socketField.get(link)).cancel();
            assertTrue("Unexpected disconnection was not reported",lost.await(8,TimeUnit.SECONDS));assertFalse(alive.get());
            System.out.println("PASS: real Android Camera2 frames, pinned TLS/WSS, actual MediaPipe server gesture, AudioManager volume change, battery alert and unexpected-link-loss signal");
        }finally{
            if(camera[0]!=null)camera[0].close();link.close();
            if(activity!=null){android.app.Activity open=activity;instrumentation.runOnMainSync(open::finish);}
            instrumentation.getUiAutomation().executeShellCommand("dumpsys battery reset").close();
        }
    }
}
