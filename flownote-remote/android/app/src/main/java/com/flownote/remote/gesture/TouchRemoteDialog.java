package com.flownote.remote.gesture;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputFilter;
import android.view.View;
import android.view.Window;
import android.widget.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

final class TouchRemoteDialog extends Dialog {
    private record Entry(String label,String action){}
    private final Activity activity;
    private final Consumer<String> log;
    private final List<Entry> entries=new ArrayList<>();
    private final List<String> ids=new ArrayList<>();
    private final List<Button> actions=new ArrayList<>();
    private RemoteLink link;
    private JSONObject state,device;
    private String target,signature="";
    private TextView status;
    private Spinner targets;
    private TouchPadView pad;
    private Switch drag;
    private LinearLayout buttons;
    private boolean refreshing;
    TouchRemoteDialog(Activity activity,Consumer<String> log){super(activity);this.activity=activity;this.log=log;load();}
    private int dp(int n){return Math.round(n*getContext().getResources().getDisplayMetrics().density);}
    private LinearLayout column(){var v=new LinearLayout(getContext());v.setOrientation(LinearLayout.VERTICAL);return v;}
    private TextView text(LinearLayout parent,String value,int size){var v=new TextView(getContext());v.setText(value);v.setTextSize(size);v.setTextColor(0xff20352d);v.setPadding(0,dp(8),0,dp(8));parent.addView(v);return v;}
    private Button button(LinearLayout parent,String label,Runnable action){var v=new Button(getContext());v.setText(label);v.setAllCaps(false);v.setMinHeight(dp(48));v.setTextColor(0xff276254);v.setOnClickListener(w->action.run());parent.addView(v,new LinearLayout.LayoutParams(-1,-2));return v;}
    @Override protected void onCreate(Bundle saved){
        super.onCreate(saved);requestWindowFeature(Window.FEATURE_NO_TITLE);
        var scroll=new ScrollView(getContext());scroll.setFillViewport(true);scroll.setBackgroundColor(0xfff3f5f1);var root=column();root.setPadding(dp(18),dp(12),dp(18),dp(24));scroll.addView(root);setContentView(scroll);
        var header=new LinearLayout(getContext());header.setOrientation(LinearLayout.HORIZONTAL);root.addView(header);
        var title=text(header,"터치 리모컨",24);title.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));var close=button(header,"닫기",this::dismiss);close.setLayoutParams(new LinearLayout.LayoutParams(-2,-2));
        text(root,"조종할 기기",14);targets=new Spinner(getContext());targets.setContentDescription("터치 리모컨 대상 기기");targets.setMinimumHeight(dp(48));root.addView(targets);
        targets.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onNothingSelected(AdapterView<?> p){}public void onItemSelected(AdapterView<?> p,View v,int index,long id){if(refreshing||index>=ids.size())return;String chosen=ids.get(index);if(!chosen.equals(target)){stopInput();target=chosen;}updateEnabled();}});
        status=text(root,"서버에 연결한 뒤 기기를 선택하세요.",14);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        text(root,"드래그 영역",20);text(root,"손가락으로 커서 이동 · 가볍게 탭하여 클릭",13);
        pad=new TouchPadView(getContext(),this::pointer);pad.setId(View.generateViewId());int height=Math.max(160,Math.min(240,(int)(getContext().getResources().getDisplayMetrics().heightPixels/getContext().getResources().getDisplayMetrics().density*.27)));root.addView(pad,new LinearLayout.LayoutParams(-1,dp(height)));
        drag=new Switch(getContext());drag.setText("누른 채 드래그");drag.setContentDescription("누른 채 드래그");drag.setMinHeight(dp(48));drag.setOnCheckedChangeListener((v,on)->pad.setDragMode(on));root.addView(drag);
        text(root,"버튼 영역",20);buttons=column();root.addView(buttons);renderButtons();
        button(root,"＋ 커스텀 버튼 추가",()->{if(entries.size()<8)edit(-1);else status.setText("버튼은 최대 8개까지 만들 수 있어요.");});
        text(root,"버튼의 ⋯에서 이름과 실행할 명령을 바꿀 수 있어요.",13);
        refresh(link,state);
    }
    @Override protected void onStart(){super.onStart();if(getWindow()!=null)getWindow().setLayout(-1,-1);}
    void refresh(RemoteLink next,JSONObject value){
        if(pad!=null&&link!=next)stopInput();link=next;state=value;if(pad==null)return;
        var names=new ArrayList<String>();var nextIds=new ArrayList<String>();
        if(value!=null){var devices=value.optJSONArray("devices");if(devices!=null)for(int i=0;i<devices.length();i++){var d=devices.optJSONObject(i);if(d!=null&&d.optBoolean("connected")&&d.optBoolean("enabled")&&(d.optBoolean("pointerReady")||d.optBoolean("outputReady")||d.optBoolean("interfaceReady"))){names.add(d.optString("name")+(d.optBoolean("pointerReady")?" · 마우스":""));nextIds.add(d.optString("id"));}}}
        String nextSignature=nextIds.toString()+names;
        if(!nextSignature.equals(signature)){
            if(target!=null&&!nextIds.contains(target))stopInput();signature=nextSignature;ids.clear();ids.addAll(nextIds);
            if(!ids.contains(target))target=ids.isEmpty()?null:ids.get(Math.max(0,firstPointer(value,ids)));
            refreshing=true;try{targets.setAdapter(new ArrayAdapter<>(getContext(),android.R.layout.simple_spinner_dropdown_item,names.isEmpty()?List.of("연결된 기기 없음"):names));if(target!=null)targets.setSelection(ids.indexOf(target));}finally{refreshing=false;}
        }
        updateEnabled();
    }
    private static int firstPointer(JSONObject state,List<String> ids){if(state==null)return 0;var list=state.optJSONArray("devices");if(list!=null)for(int i=0;i<list.length();i++){var d=list.optJSONObject(i);if(d!=null&&d.optBoolean("pointerReady")&&ids.contains(d.optString("id")))return ids.indexOf(d.optString("id"));}return 0;}
    private boolean connected(){return link!=null&&link.connected()&&link.enabled()&&state!=null&&state.optJSONObject("capabilities")!=null&&state.optJSONObject("capabilities").optBoolean("touchInput");}
    private void updateEnabled(){
        device=null;if(state!=null&&target!=null){var list=state.optJSONArray("devices");if(list!=null)for(int i=0;i<list.length();i++){var d=list.optJSONObject(i);if(d!=null&&target.equals(d.optString("id")))device=d;}}
        boolean ready=connected()&&device!=null&&device.optBoolean("connected")&&device.optBoolean("enabled"),mouse=ready&&device.optBoolean("pointerReady");
        if(!mouse&&pad.isEnabled())stopInput();pad.setEnabled(mouse);drag.setEnabled(mouse);
        for(int i=0;i<actions.size();i++){var a=TouchButtons.find(entries.get(i).action());actions.get(i).setEnabled(ready&&(a.pointer()?mouse:a.id().startsWith("volume_")||a.id().equals("mute")||a.id().equals("unmute")?device.optBoolean("outputReady"):device.optBoolean("interfaceReady")));}
        status.setText(!connected()?"터치 입력을 지원하는 서버에 연결하세요.":device==null?"조종할 기기를 연결하세요.":mouse?device.optString("name")+" · 커서 조작 가능":device.optString("name")+" · 버튼 사용 가능 · 마우스는 Windows에서 허용하세요.");
    }
    void stopInput(){if(pad!=null)pad.cancelInput();if(drag!=null)drag.setChecked(false);}
    private void pointer(String action,double value,double x,double y){
        try{if(link!=null&&link.connected()&&target!=null&&(action.equals("pointer.up")||connected()&&device!=null&&device.optBoolean("pointerReady")))link.control(target,action,value,x,y);}
        catch(Exception error){status.setText("입력을 보내지 못했어요. 연결을 확인하세요.");}
    }
    private void execute(Entry entry){
        try{
            if(!connected()||device==null)throw new IllegalStateException();String a=entry.action();
            if(a.startsWith("pointer."))pointer(a,0,0,0);
            else if(a.startsWith("scroll_"))pointer("pointer.scroll",a.equals("scroll_up")?1:-1,0,0);
            else if(a.startsWith("volume_")||a.equals("mute")||a.equals("unmute"))link.command(target,a);
            else if(a.startsWith("zoom_"))link.control(target,"interface.zoom_set",Math.max(.5,Math.min(2,device.optDouble("zoom",1)*(a.equals("zoom_in")?1.1:1/1.1))),0,0);
            else link.control(target,a,0,0,0);
        }catch(Exception error){status.setText("명령을 보내지 못했어요. 기기 연결을 확인하세요.");}
    }
    private void renderButtons(){
        buttons.removeAllViews();actions.clear();for(int i=0;i<entries.size();i++){
            final int index=i;var entry=entries.get(i);var a=TouchButtons.find(entry.action());var row=new LinearLayout(getContext());row.setOrientation(LinearLayout.HORIZONTAL);buttons.addView(row);
            var b=button(row,a.icon()+"  "+entry.label(),()->execute(entry));b.setContentDescription(entry.label()+" · "+a.label());b.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1));actions.add(b);
            var more=button(row,"⋯",()->edit(index));more.setContentDescription(entry.label()+" 버튼 설정");more.setLayoutParams(new LinearLayout.LayoutParams(dp(52),-2));
        }if(pad!=null)updateEnabled();
    }
    private void edit(int index){
        stopInput();var form=column();form.setPadding(dp(18),dp(8),dp(18),dp(8));text(form,"버튼 이름",14);var name=new EditText(getContext());name.setSingleLine(true);name.setContentDescription("커스텀 버튼 이름");name.setFilters(new InputFilter[]{new InputFilter.LengthFilter(20)});name.setText(index<0?"클릭":entries.get(index).label());form.addView(name);
        text(form,"실행할 명령",14);var choice=new Spinner(getContext());choice.setMinimumHeight(dp(48));choice.setContentDescription("커스텀 버튼 명령");var labels=TouchButtons.ACTIONS.stream().map(a->a.icon()+"  "+a.label()).toArray(String[]::new);choice.setAdapter(new ArrayAdapter<>(getContext(),android.R.layout.simple_spinner_dropdown_item,labels));form.addView(choice);
        if(index>=0)choice.setSelection(TouchButtons.ACTIONS.indexOf(TouchButtons.find(entries.get(index).action())));
        var error=text(form,"",13);var builder=new AlertDialog.Builder(getContext()).setTitle(index<0?"커스텀 버튼 추가":"버튼 설정").setView(form).setNegativeButton("취소",null).setPositiveButton("저장",null);
        if(index>=0)builder.setNeutralButton("삭제",(d,w)->{entries.remove(index);save();renderButtons();});
        var dialog=builder.create();dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{var e=new Entry(TouchButtons.label(name.getText().toString()),TouchButtons.ACTIONS.get(choice.getSelectedItemPosition()).id());if(index<0)entries.add(e);else entries.set(index,e);save();renderButtons();dialog.dismiss();}catch(IllegalArgumentException ex){error.setText("버튼 이름을 1–20자로 입력하세요.");}}));dialog.show();
    }
    private void load(){try{var list=new JSONArray(activity.getSharedPreferences("touch-remote-v1",Context.MODE_PRIVATE).getString("buttons","[]"));for(int i=0;i<Math.min(8,list.length());i++){var e=list.getJSONObject(i);entries.add(new Entry(TouchButtons.label(e.getString("label")),TouchButtons.find(e.getString("action")).id()));}if(list.length()==0&&activity.getSharedPreferences("touch-remote-v1",Context.MODE_PRIVATE).contains("buttons"))return;}catch(Exception ignored){entries.clear();}
        if(entries.isEmpty())for(String id:List.of("pointer.click","pointer.right_click","volume_up","volume_down","mute","interface.reset")){var a=TouchButtons.find(id);entries.add(new Entry(a.label(),id));}}
    private void save(){try{var list=new JSONArray();for(var e:entries)list.put(new JSONObject().put("label",e.label()).put("action",e.action()));activity.getSharedPreferences("touch-remote-v1",Context.MODE_PRIVATE).edit().putString("buttons",list.toString()).apply();}catch(Exception error){log.accept("버튼 설정을 저장하지 못했어요.");}}
    @Override protected void onStop(){stopInput();super.onStop();}
}
