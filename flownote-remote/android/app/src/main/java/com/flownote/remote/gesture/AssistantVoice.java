package com.flownote.remote.gesture;

import android.content.Context;
import android.media.AudioAttributes;
import android.speech.tts.TextToSpeech;
import java.util.Locale;
import java.util.function.Consumer;
import org.json.JSONObject;

final class AssistantVoice implements AutoCloseable {
    private TextToSpeech speech;private boolean ready,korean;private final Consumer<String> status;
    AssistantVoice(Context context,Consumer<String> status){
        this.status=status;
        speech=new TextToSpeech(context,result->{
            if(result!=TextToSpeech.SUCCESS){status.accept("음성 엔진을 사용할 수 없어 화면 알림을 유지합니다.");return;}
            var voices=speech.getVoices();
            var selected=voices==null?null:voices.stream().filter(v->!v.isNetworkConnectionRequired()&&v.getLocale().getLanguage().equals("ko")).findFirst()
                .orElseGet(()->voices.stream().filter(v->!v.isNetworkConnectionRequired()&&v.getLocale().getLanguage().equals("en")).findFirst().orElse(null));
            korean=selected!=null&&selected.getLocale().getLanguage().equals("ko");
            ready=selected!=null&&speech.setVoice(selected)==TextToSpeech.SUCCESS;
            speech.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            if(!ready)status.accept("사용할 수 있는 음성이 없습니다. 기기의 TTS 음성 데이터를 확인하세요.");
        });
    }
    void speak(JSONObject notice,boolean enabled){
        status.accept(notice.optString("message"));
        if(!enabled||!notice.optBoolean("speak"))return;
        if(!ready){status.accept("음성 엔진 준비 전이므로 화면에 알림을 표시합니다.");return;}
        int queue=notice.optString("severity").equals("critical")?TextToSpeech.QUEUE_FLUSH:TextToSpeech.QUEUE_ADD;
        int result=speech.speak(notice.optString(korean?"message":"english"),queue,null,notice.optString("id"));
        if(result==TextToSpeech.ERROR)status.accept("음성 출력을 시작하지 못했습니다.");
    }
    void disconnected(boolean enabled){
        try{speak(new JSONObject().put("id",java.util.UUID.randomUUID().toString()).put("severity","critical").put("speak",true)
                .put("message","서버 연결이 끊어졌습니다. 카메라 전송과 제어를 중지합니다.").put("english","Server connection lost. Camera streaming and control have stopped."),enabled);}catch(Exception ignored){}
    }
    @Override public void close(){ready=false;if(speech!=null){speech.stop();speech.shutdown();}}
}
