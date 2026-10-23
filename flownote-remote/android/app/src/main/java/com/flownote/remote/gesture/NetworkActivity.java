package com.flownote.remote.gesture;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.BitmapFactory;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Build;
import android.text.InputFilter;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class NetworkActivity extends Activity {
    private static final int INK=0xff20352d,MUTED=0xff61736a,ACCENT=0xff276254,BACKGROUND=0xfff3f5f1;
    private LinearLayout content,clients;
    private TextView connectionStatus,notice,detection,soundSummary,clientTitle,emptyClients,gestureSummary;
    private Switch voiceEnabled,cameraToggle,gestureToggle;private ImageView preview;
    private Button reconnect,mute;
    private final Map<String,ClientRow> clientRows=new LinkedHashMap<>();
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private JSONObject saved,state;private String target;private RemoteLink link;private CameraSource camera;private AssistantVoice voice;
    private int generation;private boolean updatingControls,rear;private String history="";
    private AlertDialog activeConnectionDialog;

    @Override public void onCreate(Bundle bundle){
        super.onCreate(bundle);
        var scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(BACKGROUND);
        content=column();content.setPadding(dp(20),dp(20),dp(20),dp(24));scroll.addView(content);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((view,insets)->{
            if(Build.VERSION.SDK_INT>=30){var bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(bars.left,bars.top,bars.right,bars.bottom);}
            else view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        var header=row();var heading=column();text(heading,"Flownote Remote",26,INK);text(heading,"연결된 기기로, 손쉽게 제어하세요.",14,MUTED);header.addView(heading,new LinearLayout.LayoutParams(0,-2,1));
        Button more=button(header,"⋯",()->{});more.setTextSize(26);more.setContentDescription("더 보기");more.setOnClickListener(v->showMore(more));content.addView(header);
        connectionStatus=text(content,"서버 PC의 QR로 연결을 시작하세요.",15,INK);connectionStatus.setPadding(dp(14),dp(12),dp(14),dp(12));connectionStatus.setBackground(shape(0xffe4ece6,12));connectionStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        var join=row();button(join,"QR로 연결",this::scanQr,1);button(join,"연결 코드",()->showConnection(null),1);content.addView(join);
        reconnect=button(content,"저장된 서버에 다시 연결",this::reconnect);reconnect.setVisibility(View.GONE);
        text(content,"빠른 제어",20,INK);
        var sound=card();text(sound,"♪  소리",21,INK);soundSummary=text(sound,"목록에서 제어할 기기를 선택해 주세요.",14,MUTED);
        var audio=row();var down=button(audio,"−",()->command("volume_down"),1);down.setContentDescription("음량 줄이기");var up=button(audio,"＋",()->command("volume_up"),1);up.setContentDescription("음량 높이기");mute=button(audio,"음소거",()->command(selectedMuted()?"unmute":"mute"),1);sound.addView(audio);
        var cameraCard=card();cameraToggle=toggle(cameraCard,"◉  카메라 전송",false);cameraToggle.setContentDescription("카메라 전송");cameraToggle.setOnCheckedChangeListener((v,on)->{if(updatingControls)return;if(on)startCamera();else stopCamera();});
        detection=text(cameraCard,"꺼짐 · 사용할 때만 전송합니다.",14,MUTED);preview=new ImageView(this);preview.setAdjustViewBounds(true);preview.setContentDescription("전송 중인 카메라 미리보기");preview.setVisibility(View.GONE);cameraCard.addView(preview,new LinearLayout.LayoutParams(-1,dp(210)));
        var gestures=card();gestureToggle=toggle(gestures,"✋  제스처",false);gestureToggle.setEnabled(false);gestureSummary=text(gestures,"서버 PC에서 명령 사용을 켤 수 있어요.",14,MUTED);text(gestures,"엄지 ↑ ↓ 음량 · 주먹 음소거",14,INK);
        var speech=card();voiceEnabled=toggle(speech,"◌  이 기기 음성 알림",true);text(speech,"배터리·장치 오류·연결 끊김을 알려드려요.",14,MUTED);voiceEnabled.setOnCheckedChangeListener((v,on)->{if(link!=null)link.setVoiceAlerts(on);});
        clientTitle=text(content,"클라이언트",20,INK);text(content,"서버에서 기기의 사용 여부를 관리합니다. 이 기기는 직접 켜고 끌 수 있어요.",13,MUTED);
        emptyClients=text(content,"아직 연결된 클라이언트가 없어요. 서버 PC의 QR을 읽어 주세요.",15,MUTED);clients=column();content.addView(clients);
        notice=text(content,"사용할 기능을 켜면 상태를 여기에서 확인할 수 있어요.",14,MUTED);notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        voice=new AssistantVoice(this,this::log);
        try{saved=ConnectionStore.load(this);reconnect.setVisibility(saved==null?View.GONE:View.VISIBLE);}catch(Exception e){log("저장된 연결을 읽지 못했어요. 새 QR로 등록해 주세요.");}
        if(getIntent().getData()!=null){String incoming=getIntent().getDataString();getIntent().setData(null);content.post(()->importInvitation(incoming));}
    }
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius){var background=new GradientDrawable();background.setColor(color);background.setCornerRadius(dp(radius));return background;}
    private LinearLayout column(){var view=new LinearLayout(this);view.setOrientation(LinearLayout.VERTICAL);return view;}
    private LinearLayout row(){var view=new LinearLayout(this);view.setOrientation(LinearLayout.HORIZONTAL);view.setGravity(Gravity.CENTER_VERTICAL);return view;}
    private TextView text(LinearLayout parent,String value,int size,int color){var view=new TextView(this);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setPadding(0,dp(6),0,dp(6));parent.addView(view);return view;}
    private LinearLayout card(){var view=column();view.setPadding(dp(16),dp(12),dp(16),dp(14));view.setBackground(shape(Color.WHITE,16));var params=new LinearLayout.LayoutParams(-1,-2);params.setMargins(0,dp(10),0,dp(6));content.addView(view,params);return view;}
    private Button button(LinearLayout parent,String title,Runnable action){return button(parent,title,action,0);}
    private Button button(LinearLayout parent,String title,Runnable action,int weight){
        var button=new Button(this);button.setText(title);button.setTextColor(ACCENT);button.setTextSize(14);button.setAllCaps(false);button.setMinHeight(dp(48));button.setMinimumWidth(dp(48));button.setOnClickListener(v->action.run());
        var params=new LinearLayout.LayoutParams(weight==0?-2:0,-2,weight);params.setMargins(0,dp(4),dp(4),dp(4));parent.addView(button,params);return button;
    }
    private Switch toggle(LinearLayout parent,String title,boolean checked){var view=new Switch(this);view.setText(title);view.setTextSize(18);view.setTextColor(INK);view.setChecked(checked);view.setMinHeight(dp(48));view.setPadding(0,dp(4),0,dp(4));parent.addView(view,new LinearLayout.LayoutParams(-1,-2));return view;}
    private void log(String message){runOnUiThread(()->{if(isDestroyed()||notice==null)return;if(history.length()>6000)history=history.substring(history.length()-3000);history+=message+"\n";notice.setText(message);});}
    private void showMore(View anchor){
        var popup=new PopupMenu(this,anchor);String[] items={"연결 정보와 기록","카메라 방향","제스처 세부 설정","서버에 연결 / 연결 해제","지원 기능과 라이선스"};
        for(int i=0;i<items.length;i++)popup.getMenu().add(0,i,i,items[i]);
        popup.setOnMenuItemClickListener(item->{switch(item.getItemId()){
            case 0:new AlertDialog.Builder(this).setTitle("연결 정보와 기록").setMessage((saved==null?"저장된 서버 없음":saved.optString("address"))+"\n\n"+history).setPositiveButton("닫기",null).show();break;
            case 1:new AlertDialog.Builder(this).setTitle("카메라 방향").setSingleChoiceItems(new String[]{"전면 카메라","후면 카메라"},rear?1:0,(dialog,index)->{rear=index==1;stopCamera();dialog.dismiss();}).show();break;
            case 2:startActivity(new Intent(this,MainActivity.class).putExtra("settings",true));break;
            case 3:if(link!=null&&link.connected()){disconnect();log("서버 연결을 해제했습니다.");}else showConnection(null);break;
            case 4:new AlertDialog.Builder(this).setTitle("지원 기능과 라이선스").setMessage("카메라 전송·서버 제스처 판정·음량 제어·OS 음성 알림을 사용합니다.\n\n음원 분리/합성·화면·프로젝터·대화형 AI는 아직 연결 전입니다.\n\nQR 판독: ZXing 3.5.4 · Apache 2.0\n네트워크: OkHttp 4.12.0 · Apache 2.0\n\n"+apacheLicense()).setPositiveButton("닫기",null).show();break;
            default:return false;
        }return true;});popup.show();
    }
    private String apacheLicense(){try(var input=getAssets().open("Apache-2.0.txt")){var bytes=new java.io.ByteArrayOutputStream();byte[] buffer=new byte[4096];int count;while((count=input.read(buffer))!=-1)bytes.write(buffer,0,count);return bytes.toString(java.nio.charset.StandardCharsets.UTF_8.name());}catch(Exception e){return "라이선스 원문은 소스의 licenses/MediaPipe-LICENSE.txt에서 확인하세요.";}}
    private void scanQr(){if(activeConnectionDialog!=null)activeConnectionDialog.dismiss();startActivityForResult(new Intent(this,QrScannerActivity.class),52);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==52&&result==RESULT_OK&&data!=null)importInvitation(data.getStringExtra(Intent.EXTRA_TEXT));}
    private void importInvitation(String text){try{showConnection(PairingLink.parse(text));}catch(IllegalArgumentException error){log(error.getMessage());}}
    private EditText input(LinearLayout parent,String title,String value,boolean password){
        var label=text(parent,title,14,MUTED);var field=new EditText(this);field.setSingleLine(true);field.setMinHeight(dp(48));field.setContentDescription(title);field.setId(View.generateViewId());label.setLabelFor(field.getId());field.setText(value);if(password)field.setInputType(android.text.InputType.TYPE_CLASS_NUMBER|android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);parent.addView(field);return field;
    }
    private void showConnection(PairingLink invitation){
        if(activeConnectionDialog!=null)activeConnectionDialog.dismiss();
        var form=column();form.setPadding(dp(20),dp(4),dp(20),dp(12));
        text(form,invitation==null?"서버 PC의 연결 QR을 읽거나 연결 코드를 붙여넣어 주세요.":"서버 QR을 읽었어요. 내 서버인지 확인하고 연결해 주세요.",15,INK);
        button(form,"QR로 연결",()->scanQr());
        var summary=text(form,invitation==null?"주소·지문은 연결 코드를 가져오면 채워집니다.":invitation.address+"\n지문 …"+invitation.pin.substring(48),14,MUTED);
        var manual=column();manual.setVisibility(View.GONE);
        var address=input(manual,"서버 HTTPS 주소",invitation!=null?invitation.address:saved==null?"":saved.optString("address"),false);
        var pin=input(manual,"인증서 SHA-256 지문",invitation!=null?invitation.pin:saved==null?"":saved.optString("pin"),false);
        var code=input(manual,"일회용 등록 코드",invitation!=null?invitation.code:"",true);
        button(form,"주소·지문 직접 입력",()->manual.setVisibility(manual.getVisibility()==View.VISIBLE?View.GONE:View.VISIBLE));form.addView(manual);
        var name=input(form,"내 기기 이름",Build.MODEL,false);name.setFilters(new InputFilter[]{new InputFilter.LengthFilter(32)});
        var confirmed=new CheckBox(this);confirmed.setText(R.string.confirm_server);confirmed.setMinHeight(dp(48));form.addView(confirmed);
        var error=text(form,"",14,0xffa33028);final PairingLink[] ticket={invitation};
        android.text.TextWatcher edited=new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int start,int count,int after){}public void onTextChanged(CharSequence s,int start,int before,int count){confirmed.setChecked(false);}public void afterTextChanged(android.text.Editable s){}};address.addTextChangedListener(edited);pin.addTextChangedListener(edited);
        button(form,"연결 코드 붙여넣기",()->{
            try{var clipboard=(ClipboardManager)getSystemService(CLIPBOARD_SERVICE);var clip=clipboard.getPrimaryClip();if(clip==null||clip.getItemCount()==0||clip.getItemAt(0).getText()==null)throw new IllegalArgumentException();
                var parsed=PairingLink.parse(clip.getItemAt(0).getText().toString());ticket[0]=parsed;address.setText(parsed.address);pin.setText(parsed.pin);code.setText(parsed.code);confirmed.setChecked(false);summary.setText(getString(R.string.invitation_summary,parsed.address,parsed.pin.substring(48)));error.setText("");
            }catch(Exception e){error.setText(R.string.invitation_clipboard_error);}
        });
        var scroll=new ScrollView(this);scroll.addView(form);
        java.util.function.Consumer<String> showError=message->{error.setText(message);error.post(()->scroll.smoothScrollTo(0,error.getTop()));};
        var dialog=new AlertDialog.Builder(this).setTitle("서버에 연결").setView(scroll).setNegativeButton("닫기",null).setPositiveButton("확인하고 연결",null).create();
        activeConnectionDialog=dialog;final int[] requested={-1};final boolean[] pending={false};
        dialog.setOnShowListener(ignored->{var connect=dialog.getButton(AlertDialog.BUTTON_POSITIVE);connect.setOnClickListener(v->{
            if(!confirmed.isChecked()){showError.accept(getString(R.string.invitation_needs_confirmation));return;}
            if(ticket[0]!=null&&ticket[0].expires<=System.currentTimeMillis()/1000){showError.accept(getString(R.string.invitation_expired));return;}
            connect.setEnabled(false);connect.setText("연결 중…");
            pending[0]=true;requested[0]=connect(address.getText().toString(),pin.getText().toString(),code.getText().toString(),name.getText().toString(),()->{pending[0]=false;code.setText("");dialog.dismiss();},message->{pending[0]=false;showError.accept(message);connect.setEnabled(true);connect.setText("확인하고 연결");});
        });});dialog.setOnDismissListener(ignored->{code.setText("");if(activeConnectionDialog==dialog)activeConnectionDialog=null;if(pending[0]&&requested[0]==generation)disconnect();});dialog.show();
    }
    private void reconnect(){if(saved==null){showConnection(null);return;}connect(saved.optString("address"),saved.optString("pin"),"",Build.MODEL,()->{},this::log);}
    private int connect(String address,String pin,String code,String name,Runnable success,java.util.function.Consumer<String> failure){
        disconnect();final int current=++generation;final JSONObject previous=saved;connectionStatus.setText("서버에 연결 중…");
        worker.execute(()->{
            try{
                JSONObject connection=previous!=null&&previous.optString("address").equals(RemoteLink.address(address).toString())&&previous.optString("pin").equals(pin.replace(":","").trim().toUpperCase(java.util.Locale.ROOT))&&code.isEmpty()?previous:RemoteLink.pair(address,pin,code,name);
                runOnUiThread(()->{if(current!=generation||isFinishing())return;try{
                    link=new RemoteLink(this,connection,new RemoteLink.Listener(){
                        public void connected(){runOnUiThread(()->{if(current!=generation)return;try{ConnectionStore.save(NetworkActivity.this,connection);saved=connection;reconnect.setVisibility(View.VISIBLE);connectionStatus.setText("서버에 연결됐어요.");success.run();}catch(Exception e){log("연결했지만 자격 증명을 저장하지 못했어요.");success.run();}});}
                        public void state(JSONObject value){runOnUiThread(()->{if(current==generation)render(value);});}
                        public void gesture(String gesture,double confidence){runOnUiThread(()->{if(current==generation)detection.setText(String.format(java.util.Locale.getDefault(),"%s · 신뢰도 %.0f%%",gesture,confidence*100));});}
                        public void alert(JSONObject alert){runOnUiThread(()->{if(current==generation)voice.speak(alert,voiceEnabled.isChecked());});}
                        public void disconnected(boolean intentional){runOnUiThread(()->{if(current!=generation)return;stopCamera();connectionStatus.setText("서버 연결이 끊겼어요. 다시 연결해 주세요.");markOffline();if(!intentional)voice.disconnected(voiceEnabled.isChecked());failure.accept("연결이 종료됐어요. 코드·네트워크·서버 실행 상태를 확인해 주세요.");});}
                        public void error(String message){if(current==generation)log(message);}
                    });link.setVoiceAlerts(voiceEnabled.isChecked());link.connect();
                }catch(Exception e){connectionStatus.setText("연결하지 못했어요.");failure.accept("서버 지문과 등록 정보를 확인해 주세요.");}});
            }catch(Exception e){runOnUiThread(()->{if(current==generation){connectionStatus.setText("연결하지 못했어요.");failure.accept("새 QR과 같은 네트워크인지 확인하고 다시 연결해 주세요.");}});}
        });
        return current;
    }
    private void render(JSONObject value){
        try{
            state=value;var devices=value.getJSONArray("devices");var present=new java.util.HashSet<String>();int connected=0;JSONObject selected=null;
            for(int i=0;i<devices.length();i++){
                var device=devices.getJSONObject(i);String id=device.getString("id");present.add(id);if(device.optBoolean("connected"))connected++;
                var view=clientRows.get(id);if(view==null){view=new ClientRow(id);clientRows.put(id,view);clients.addView(view.root);}view.update(device,value);
                if(id.equals(target)&&device.optBoolean("connected")&&device.optBoolean("enabled",true))selected=device;
            }
            for(String id:new java.util.ArrayList<>(clientRows.keySet()))if(!present.contains(id)){clients.removeView(clientRows.get(id).root);clientRows.remove(id);}
            if(selected==null){for(int i=0;i<devices.length();i++){var d=devices.getJSONObject(i);if(d.optBoolean("connected")&&d.optBoolean("enabled",true)){selected=d;target=d.getString("id");if(target.equals(value.optString("gestureTarget")))break;}}}
            soundSummary.setText(selected==null?"클라이언트 목록에서 제어 대상을 선택하세요.":selected.optString("name")+" · "+(selected.optBoolean("muted")?"음소거":Math.round(selected.optDouble("volume")*100)+"%"));mute.setText(selectedMuted()?"음소거 해제":"음소거");
            clientTitle.setText(String.format(java.util.Locale.getDefault(),"클라이언트 · %d대 연결",connected));emptyClients.setVisibility(clientRows.isEmpty()?View.VISIBLE:View.GONE);
            updatingControls=true;gestureToggle.setChecked(value.optBoolean("gesturesEnabled"));updatingControls=false;gestureSummary.setText(value.optBoolean("gesturesEnabled")?"서버에서 제스처 명령을 허용하고 있어요.":"서버 PC에서 제스처 명령 사용을 켤 수 있어요.");
            if(link!=null&&!link.enabled())stopCamera();
        }catch(Exception e){log("기기 목록을 읽지 못했어요. 다시 연결해 주세요.");}
    }
    private boolean selectedMuted(){try{if(state!=null){var devices=state.getJSONArray("devices");for(int i=0;i<devices.length();i++){var d=devices.getJSONObject(i);if(d.optString("id").equals(target))return d.optBoolean("muted");}}}catch(Exception ignored){}return false;}
    private final class ClientRow {
        final String id;final LinearLayout root;final TextView name,summary;final Switch enabled;final Button more;JSONObject device;boolean updating;
        ClientRow(String id){
            this.id=id;root=row();root.setPadding(dp(12),dp(10),dp(8),dp(10));root.setBackground(shape(Color.WHITE,14));var params=new LinearLayout.LayoutParams(-1,-2);params.setMargins(0,0,0,dp(10));root.setLayoutParams(params);
            enabled=new Switch(NetworkActivity.this);enabled.setMinHeight(dp(48));root.addView(enabled,new LinearLayout.LayoutParams(dp(56),-2));
            var body=column();body.setPadding(dp(12),0,dp(4),0);root.addView(body,new LinearLayout.LayoutParams(0,-2,1));name=text(body,"",17,INK);name.setMaxLines(2);name.setEllipsize(TextUtils.TruncateAt.END);summary=text(body,"",13,MUTED);
            more=button(root,"⋯",()->{});more.setTextSize(24);more.setOnClickListener(v->menu(more));
            enabled.setOnCheckedChangeListener((v,on)->{if(updating)return;try{if(link!=null&&link.deviceId().equals(id))link.setEnabled(on);}catch(Exception e){log("기기 사용 여부를 바꾸지 못했어요.");}});
        }
        void update(JSONObject value,JSONObject state){
            device=value;name.setText(value.optString("name"));more.setContentDescription(value.optString("name")+" 더 보기");enabled.setContentDescription(value.optString("name")+" 사용");
            boolean connected=value.optBoolean("connected"),active=value.optBoolean("enabled",true),allowed=value.optBoolean("allowed",true);
            updating=true;enabled.setChecked(connected&&active);enabled.setEnabled(state.optJSONObject("capabilities")!=null&&state.optJSONObject("capabilities").optBoolean("clientParticipation")&&link!=null&&link.deviceId().equals(id)&&connected&&allowed);updating=false;
            var parts=new java.util.ArrayList<String>();
            if(!connected)parts.add("오프라인");else if(!active)parts.add(allowed?"사용 일시 중지":"서버에서 사용 중지");else{
                parts.add(value.optString("platform","클라이언트"));parts.add(value.optBoolean("outputReady",true)?value.optBoolean("muted")?"소리 음소거":"소리 "+Math.round(value.optDouble("volume")*100)+"%":"출력 장치 확인 필요");
                if(value.optBoolean("cameraActive"))parts.add("카메라 전송 중");if(id.equals(state.optString("voiceTarget"))&&value.optBoolean("speakAlerts",true))parts.add("음성 알림");if(id.equals(target))parts.add("제어 대상");
            }summary.setText(TextUtils.join(" · ",parts));
        }
        void menu(View anchor){
            var popup=new PopupMenu(NetworkActivity.this,anchor);popup.getMenu().add(0,0,0,"이 기기로 소리 제어").setEnabled(device.optBoolean("connected")&&device.optBoolean("enabled",true));popup.getMenu().add(0,1,1,"상세 정보");
            popup.setOnMenuItemClickListener(item->{if(item.getItemId()==0){target=id;if(state!=null)render(state);}else new AlertDialog.Builder(NetworkActivity.this).setTitle(device.optString("name")).setMessage((device.optBoolean("connected")?"연결됨":"오프라인")+"\n"+(device.has("batteryPercent")&&!device.isNull("batteryPercent")?"배터리 "+device.optInt("batteryPercent")+"%":"배터리 정보 없음")+"\n다른 기기의 사용 여부와 등록은 서버에서 관리합니다.").setPositiveButton("닫기",null).show();return true;});popup.show();
        }
    }
    private void markOffline(){for(var view:clientRows.values()){view.updating=true;view.enabled.setChecked(false);view.enabled.setEnabled(false);view.updating=false;view.summary.setText("오프라인");}clientTitle.setText("클라이언트 · 연결 안 됨");soundSummary.setText("클라이언트를 연결해 주세요.");}
    private void command(String action){try{if(link==null||!link.connected()||!link.enabled()||target==null){log("사용 중인 기기로 연결한 뒤 제어 대상을 선택해 주세요.");return;}link.command(target,action);}catch(Exception e){log("명령을 보내지 못했어요.");}}
    private void startCamera(){
        if(link==null||!link.connected()||!link.enabled()){setCameraToggle(false);log("사용 중인 기기로 서버에 연결한 뒤 카메라를 켜 주세요.");return;}
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED){setCameraToggle(false);requestPermissions(new String[]{Manifest.permission.CAMERA},41);return;}
        stopCamera();camera=new CameraSource(this,new CameraSource.Listener(){
            public void frame(byte[] jpeg){if(link!=null)link.frame(jpeg);runOnUiThread(()->{if(camera!=null)preview.setImageBitmap(BitmapFactory.decodeByteArray(jpeg,0,jpeg.length));});}
            public void error(String message){log(message);runOnUiThread(NetworkActivity.this::stopCamera);}
        });try{camera.start(rear);setCameraToggle(true);preview.setVisibility(View.VISIBLE);detection.setText("카메라 전송 중 · 서버 판정 대기");}catch(Exception e){log("카메라를 시작하지 못했어요.");stopCamera();}
    }
    private void setCameraToggle(boolean value){updatingControls=true;cameraToggle.setChecked(value);updatingControls=false;}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==41){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)startCamera();else log("카메라 권한이 거절됐어요. 수동 소리 제어는 사용할 수 있어요.");}}
    private void stopCamera(){boolean wasActive=camera!=null;if(camera!=null){camera.close();camera=null;}if(wasActive&&link!=null)link.stopCamera();setCameraToggle(false);if(preview!=null){preview.setImageDrawable(null);preview.setVisibility(View.GONE);}if(detection!=null)detection.setText("카메라 꺼짐");}
    private void disconnect(){generation++;stopCamera();if(link!=null){link.close();link=null;}target=null;state=null;if(connectionStatus!=null)connectionStatus.setText("서버에 연결되지 않았어요.");markOffline();}
    @Override protected void onStop(){if(activeConnectionDialog!=null)activeConnectionDialog.dismiss();disconnect();super.onStop();}
    @Override protected void onDestroy(){disconnect();if(voice!=null)voice.close();worker.shutdownNow();super.onDestroy();}
}
