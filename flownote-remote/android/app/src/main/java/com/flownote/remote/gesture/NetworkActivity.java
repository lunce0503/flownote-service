package com.flownote.remote.gesture;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class NetworkActivity extends Activity {
    private LinearLayout content;private EditText address,pin,code,name;private CheckBox confirmed,voiceEnabled,rear;
    private Spinner targets;private ImageView preview;private TextView events,detection;
    private final List<String> targetIds=new ArrayList<>();private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private JSONObject saved;private RemoteLink link;private CameraSource camera;private AssistantVoice voice;private int generation;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);ScrollView scroll=new ScrollView(this);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(20),dp(20),dp(20));scroll.addView(content);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view,insets)->{if(Build.VERSION.SDK_INT>=30){var bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
        label("서버 · 클라이언트 연결").setTextSize(24);label("이 기기는 입출력 클라이언트입니다. 서버 PC의 주소·지문·등록 코드를 확인하세요.");
        address=input("서버 HTTPS 주소",101);pin=input("인증서 SHA-256 지문",102);name=input("기기 이름",103);name.setText(Build.MODEL);
        code=input("일회용 등록 코드 (2분)",104);code.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        confirmed=new CheckBox(this);confirmed.setText("서버 화면의 주소·지문을 직접 대조했습니다");content.addView(confirmed);
        button("등록 / 연결",this::connect);button("연결 해제",this::disconnect);
        label("소리 제어 대상 기기");targets=new Spinner(this);targets.setMinimumHeight(dp(48));content.addView(targets);
        button("음량 +",()->command("volume_up"));button("음량 −",()->command("volume_down"));button("음소거",()->command("mute"));button("음소거 해제",()->command("unmute"));
        voiceEnabled=new CheckBox(this);voiceEnabled.setText("비서 음성 알림 사용");voiceEnabled.setChecked(true);content.addView(voiceEnabled);
        rear=new CheckBox(this);rear.setText("후면 카메라 사용");content.addView(rear);
        button("카메라 전송 시작",this::startCamera);button("카메라 전송 중지",this::stopCamera);
        preview=new ImageView(this);preview.setAdjustViewBounds(true);preview.setContentDescription("전송 중인 카메라 영상");content.addView(preview,new LinearLayout.LayoutParams(-1,dp(260)));
        detection=label("카메라 꺼짐");label("음원 스트리밍·분리/합성·화면 배치·프로젝터·대화형 AI는 연결 전입니다.");events=label("연결 안됨");events.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        voice=new AssistantVoice(this,this::log);
        try{saved=ConnectionStore.load(this);if(saved!=null){address.setText(saved.getString("address"));pin.setText(saved.getString("pin"));}}catch(Exception e){log("저장된 연결을 읽지 못했습니다. 새 코드로 등록하세요.");}
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private TextView label(String text){TextView view=new TextView(this);view.setText(text);view.setTextSize(16);view.setPadding(0,dp(8),0,dp(6));content.addView(view);return view;}
    private EditText input(String title,int id){TextView text=label(title);EditText view=new EditText(this);view.setId(id);view.setSingleLine(true);view.setContentDescription(title);text.setLabelFor(id);content.addView(view);return view;}
    private void button(String text,Runnable action){Button view=new Button(this);view.setText(text);view.setAllCaps(false);view.setOnClickListener(v->action.run());content.addView(view);}
    private void log(String text){runOnUiThread(()->{if(events==null)return;String previous=events.getText().toString();if(previous.length()>4000)previous=previous.substring(previous.length()-2000);events.setText(String.format(java.util.Locale.getDefault(),"%s\n%s",previous,text));});}
    private void connect(){
        if(!confirmed.isChecked()){log("서버의 주소와 지문을 먼저 대조하세요.");return;}
        disconnect();int current=++generation;String url=address.getText().toString(),fingerprint=pin.getText().toString(),pairCode=code.getText().toString(),deviceName=name.getText().toString();
        log("서버 연결 확인 중");
        worker.execute(()->{try{
            JSONObject connection=saved!=null&&saved.optString("address").equals(RemoteLink.address(url).toString())&&saved.optString("pin").equals(fingerprint.replace(":","").trim().toUpperCase(java.util.Locale.ROOT))&&pairCode.isEmpty()?saved:RemoteLink.pair(url,fingerprint,pairCode,deviceName);
            runOnUiThread(()->{if(current!=generation)return;try{
                link=new RemoteLink(this,connection,new RemoteLink.Listener(){
                    public void connected(){runOnUiThread(()->{if(current!=generation)return;try{ConnectionStore.save(NetworkActivity.this,connection);saved=connection;code.setText("");log("서버 연결됨");}catch(Exception e){log("연결했지만 자격 증명을 저장하지 못했습니다.");}});}
                    public void state(JSONObject state){runOnUiThread(()->{if(current!=generation)return;try{
                        String previous=targets.getSelectedItemPosition()>=0&&targets.getSelectedItemPosition()<targetIds.size()?targetIds.get(targets.getSelectedItemPosition()):null;
                        JSONArray devices=state.getJSONArray("devices");List<String> names=new ArrayList<>();targetIds.clear();
                        for(int i=0;i<devices.length();i++){JSONObject device=devices.getJSONObject(i);targetIds.add(device.getString("id"));names.add(device.getString("name")+" · "+Math.round(device.getDouble("volume")*100)+"%");}
                        ArrayAdapter<String> adapter=new ArrayAdapter<>(NetworkActivity.this,android.R.layout.simple_spinner_item,names);adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);targets.setAdapter(adapter);if(previous!=null&&targetIds.contains(previous))targets.setSelection(targetIds.indexOf(previous));
                    }catch(Exception e){log("기기 상태 응답 오류");}});}
                    public void gesture(String gesture,double confidence){runOnUiThread(()->{if(current==generation)detection.setText(String.format(java.util.Locale.getDefault(),"서버 판정: %s · %.0f%%",gesture,confidence*100));});}
                    public void alert(JSONObject alert){runOnUiThread(()->{if(current==generation)voice.speak(alert,voiceEnabled.isChecked());});}
                    public void disconnected(boolean intentional){runOnUiThread(()->{if(current!=generation)return;stopCamera();if(!intentional)voice.disconnected(voiceEnabled.isChecked());log("서버 연결 종료");});}
                    public void error(String message){if(current==generation)log(message);}
                });link.connect();
            }catch(Exception e){log("연결 실패: 서버 지문·자격 증명을 확인하세요.");}});
        }catch(Exception e){if(current==generation)log("등록 실패: 주소·지문·코드·기기 수를 확인하세요.");}});
    }
    private void command(String action){try{int selected=targets.getSelectedItemPosition();if(link==null||!link.connected()||selected<0||selected>=targetIds.size()){log("제어할 기기를 연결하세요.");return;}link.command(targetIds.get(selected),action);}catch(Exception e){log("명령 전송 실패");}}
    private void startCamera(){
        if(link==null||!link.connected()){log("서버에 연결한 뒤 카메라를 시작하세요.");return;}
        if(checkSelfPermission(android.Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA},41);return;}
        stopCamera();camera=new CameraSource(this,new CameraSource.Listener(){
            public void frame(byte[] jpeg){if(link!=null)link.frame(jpeg);runOnUiThread(()->{if(camera!=null)preview.setImageBitmap(BitmapFactory.decodeByteArray(jpeg,0,jpeg.length));});}
            public void error(String message){log(message);runOnUiThread(NetworkActivity.this::stopCamera);}
        });try{camera.start(rear.isChecked());rear.setEnabled(false);detection.setText("카메라 전송 중 · 서버 판정 대기");}catch(Exception e){log("카메라를 시작하지 못했습니다.");stopCamera();}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==41){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startCamera();else log("카메라 권한이 거절됐습니다. 수동 소리 제어는 계속 사용할 수 있습니다.");}}
    private void stopCamera(){if(camera!=null){camera.close();camera=null;}if(link!=null)link.stopCamera();if(rear!=null)rear.setEnabled(true);if(preview!=null)preview.setImageDrawable(null);if(detection!=null)detection.setText("카메라 꺼짐");}
    private void disconnect(){generation++;stopCamera();if(link!=null){link.close();link=null;}if(targets!=null)targets.setAdapter(null);targetIds.clear();}
    @Override protected void onStop(){disconnect();super.onStop();}
    @Override protected void onDestroy(){disconnect();if(voice!=null)voice.close();worker.shutdownNow();super.onDestroy();}
}
