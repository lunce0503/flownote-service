package com.flownote.remote.gesture;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.BatteryManager;
import android.util.Base64;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.SSLContext;
import javax.net.ssl.X509TrustManager;
import okhttp3.*;
import org.json.JSONObject;

final class RemoteLink implements AutoCloseable {
    interface Listener {
        void connected(); void state(JSONObject state); void gesture(String gesture,double confidence);
        void alert(JSONObject alert); void disconnected(boolean intentional); void error(String message);
    }
    // Self-signed device certificates are pinned exactly, checked for validity, and OkHttp's hostname verifier stays enabled.
    @android.annotation.SuppressLint("CustomX509TrustManager")
    static final class PinnedTrust implements X509TrustManager {
        final byte[] pin;
        PinnedTrust(String value)throws Exception {
            value=value.replace(":","").trim();if(!value.matches("[0-9A-Fa-f]{64}"))throw new IllegalArgumentException("서버 지문은 SHA-256 64자리입니다.");
            pin=new byte[32];for(int i=0;i<32;i++)pin[i]=(byte)Integer.parseInt(value.substring(i*2,i*2+2),16);
        }
        public void checkServerTrusted(X509Certificate[] chain,String auth)throws CertificateException {
            try{if(chain.length==0)throw new CertificateException();chain[0].checkValidity();
                if(!MessageDigest.isEqual(pin,MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded())))throw new CertificateException("지문 불일치");
            }catch(CertificateException e){throw e;}catch(Exception e){throw new CertificateException("인증서 확인 실패",e);}
        }
        public void checkClientTrusted(X509Certificate[] chain,String auth)throws CertificateException {throw new CertificateException();}
        public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}
    }
    static HttpUrl address(String text) {
        HttpUrl url=HttpUrl.get(text.trim());String host=url.host();
        if(!url.scheme().equals("https")||!url.username().isEmpty()||!url.password().isEmpty()||!url.encodedPath().equals("/")||url.query()!=null||url.fragment()!=null||!host.matches("[0-9]+(\\.[0-9]+){3}"))throw new IllegalArgumentException("사설/VPN IPv4 HTTPS 주소를 입력하세요.");
        String[] parts=host.split("\\.");int[] b=new int[4];for(int i=0;i<4;i++){b[i]=Integer.parseInt(parts[i]);if(b[i]>255)throw new IllegalArgumentException();}
        if(!(b[0]==10||b[0]==127||b[0]==192&&b[1]==168||b[0]==172&&b[1]>=16&&b[1]<=31||b[0]==100&&b[1]>=64&&b[1]<=127))throw new IllegalArgumentException("공개 인터넷 주소는 현재 지원하지 않습니다.");
        return url;
    }
    private static OkHttpClient http(String pin)throws Exception {
        PinnedTrust trust=new PinnedTrust(pin);SSLContext tls=SSLContext.getInstance("TLS");tls.init(null,new X509TrustManager[]{trust},new SecureRandom());
        return new OkHttpClient.Builder().sslSocketFactory(tls.getSocketFactory(),trust).followRedirects(false).followSslRedirects(false)
                .connectTimeout(8,TimeUnit.SECONDS).readTimeout(15,TimeUnit.SECONDS).pingInterval(5,TimeUnit.SECONDS).build();
    }
    static JSONObject pair(String url,String pin,String code,String name)throws Exception {
        if(name.trim().isEmpty()||name.length()>32)throw new IllegalArgumentException("기기 이름은 1–32자입니다.");
        OkHttpClient client=http(pin);
        JSONObject body=new JSONObject().put("code",code.trim()).put("name",name.trim());
        Request request=new Request.Builder().url(address(url).resolve("/v1/pair"))
                .post(RequestBody.create(body.toString(),MediaType.get("application/json"))).build();
        try(Response response=client.newCall(request).execute()){
            if(!response.isSuccessful()||response.body()==null)throw new IOException("등록 코드·지문·기기 수를 확인하세요.");
            JSONObject result=new JSONObject(response.body().string());
            return new JSONObject().put("address",address(url).toString()).put("pin",pin.replace(":","").trim().toUpperCase(Locale.ROOT))
                    .put("deviceId",result.getString("deviceId")).put("token",result.getString("token"));
        }finally{client.dispatcher().executorService().shutdown();client.connectionPool().evictAll();}
    }
    private final Context context;
    private final Listener listener;
    private final AudioManager audio;
    private final OkHttpClient http;
    private final JSONObject connection;
    private final ScheduledExecutorService timer=Executors.newSingleThreadScheduledExecutor();
    private final AtomicReference<String> pendingFrame=new AtomicReference<>();
    private final AtomicBoolean ended=new AtomicBoolean();
    private final LinkedHashSet<String> applied=new LinkedHashSet<>(),alerts=new LinkedHashSet<>();
    private WebSocket socket;
    private volatile boolean connected,intentional;
    private float volume;
    RemoteLink(Context context,JSONObject connection,Listener listener)throws Exception {
        this.context=context.getApplicationContext();this.connection=connection;this.listener=listener;
        audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);http=http(connection.getString("pin"));
        int max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);volume=max>0?audio.getStreamVolume(AudioManager.STREAM_MUSIC)/(float)max:0;
    }
    boolean connected(){return connected;}
    void connect()throws Exception {
        String token=connection.getString("token");if(!token.matches("[0-9A-Fa-f]{64}"))throw new IllegalArgumentException("등록 자격 증명 오류");
        Request request=new Request.Builder().url(address(connection.getString("address")).resolve("/v1/session"))
                .header("Authorization","Bearer "+token).build();
        socket=http.newWebSocket(request,new WebSocketListener(){
            @Override public void onMessage(WebSocket ws,String text){
                if(text.length()>262144){ws.cancel();return;}
                try{
                    JSONObject message=new JSONObject(text);String type=message.getString("type");
                    switch(type){
                        case "welcome":connected=true;listener.connected();listener.state(message.getJSONObject("state"));
                            timer.scheduleWithFixedDelay(RemoteLink.this::heartbeat,0,3,TimeUnit.SECONDS);break;
                        case "state":listener.state(message.getJSONObject("state"));break;
                        case "frame.result":String expectedFrame=pendingFrame.get();if(expectedFrame!=null&&expectedFrame.equals(message.getString("frameId"))&&pendingFrame.compareAndSet(expectedFrame,null))listener.gesture(message.optString("gesture","None"),message.optDouble("confidence",0));break;
                        case "alert":
                            JSONObject alert=message.getJSONObject("alert");if(alert.optString("message").length()>256||alert.optString("english").length()>256)throw new IllegalArgumentException();
                            if(alert.optString("code").equals("server.stopping"))intentional=true;
                            if(alerts.size()>=128)alerts.clear();if(alerts.add(alert.getString("id")))listener.alert(alert);break;
                        case "output.set":apply(message.getJSONObject("command"));break;
                        default:throw new IllegalArgumentException();
                    }
                }catch(Exception e){listener.error("서버 메시지를 처리할 수 없습니다.");ws.cancel();}
            }
            @Override public void onFailure(WebSocket ws,Throwable error,Response response){ended();}
            @Override public void onClosing(WebSocket ws,int code,String reason){ws.close(code,null);ended();}
        });
    }
    private void ended(){if(!ended.compareAndSet(false,true))return;connected=false;pendingFrame.set(null);timer.shutdownNow();listener.disconnected(intentional);}
    private void send(JSONObject json){if(socket!=null&&!socket.send(json.toString()))listener.error("메시지 전송 실패");}
    private void heartbeat(){try{
        int max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);boolean muted=audio.isStreamMute(AudioManager.STREAM_MUSIC);
        if(!muted&&max>0)volume=audio.getStreamVolume(AudioManager.STREAM_MUSIC)/(float)max;
        JSONObject sample=new JSONObject().put("volume",volume).put("muted",muted).put("outputReady",max>0&&!audio.isVolumeFixed());
        Intent battery=context.registerReceiver(null,new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if(battery!=null){int level=battery.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),scale=battery.getIntExtra(BatteryManager.EXTRA_SCALE,-1);if(level>=0&&scale>0)sample.put("batteryPercent",level*100/scale);}
        send(new JSONObject().put("type","heartbeat").put("health",sample));
    }catch(Exception e){listener.error("기기 상태를 전송하지 못했습니다.");}}
    private void apply(JSONObject command)throws Exception {
        String id=command.getString("commandId");UUID.fromString(id);
        double requested=command.getDouble("volume");boolean muted=command.getBoolean("muted"),success=false;
        if(!Double.isFinite(requested)||requested<0||requested>1)throw new IllegalArgumentException();
        try{
            if(audio.isVolumeFixed())throw new IllegalStateException();
            if(!applied.contains(id)){
                int max=audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);if(max<=0)throw new IllegalStateException();int index=(int)Math.round(requested*max);
                int previous=(int)Math.round(volume*max);
                if(index==previous&&Math.abs(requested-volume)>0.0001)index=Math.max(0,Math.min(max,index+(requested>volume?1:-1)));
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_UNMUTE,0);
                audio.setStreamVolume(AudioManager.STREAM_MUSIC,index,0);
                volume=audio.getStreamVolume(AudioManager.STREAM_MUSIC)/(float)max;
                if(muted)audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_MUTE,0);
                if(applied.size()>=128)applied.clear();applied.add(id);
            }
            success=true;
        }catch(RuntimeException e){listener.error("소리 출력 장치를 제어할 수 없습니다.");}
        send(new JSONObject().put("type","output.result").put("commandId",id).put("result",new JSONObject().put("applied",success).put("volume",volume).put("muted",audio.isStreamMute(AudioManager.STREAM_MUSIC))));
    }
    void command(String target,String action)throws Exception {
        if(!java.util.Arrays.asList("volume_up","volume_down","mute","unmute").contains(action))throw new IllegalArgumentException();UUID.fromString(target);
        send(new JSONObject().put("type","command").put("commandId",UUID.randomUUID().toString()).put("targetId",target).put("action",action));
    }
    void frame(byte[] jpeg){
        String id=UUID.randomUUID().toString();if(!connected||jpeg.length>131072||!pendingFrame.compareAndSet(null,id))return;
        try{send(new JSONObject().put("type","camera.frame").put("frameId",id).put("jpeg",Base64.encodeToString(jpeg,Base64.NO_WRAP)));timer.schedule(()->pendingFrame.compareAndSet(id,null),6,TimeUnit.SECONDS);}
        catch(Exception e){pendingFrame.compareAndSet(id,null);listener.error("영상 전송 실패");}
    }
    void stopCamera(){try{send(new JSONObject().put("type","camera.stop"));}catch(Exception ignored){}}
    @Override public void close(){intentional=true;try{send(new JSONObject().put("type","bye"));}catch(Exception ignored){}connected=false;timer.shutdownNow();if(socket!=null)socket.close(1000,"bye");http.connectionPool().evictAll();http.dispatcher().executorService().shutdown();}
}
