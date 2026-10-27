package com.flownote.remote.gesture;

import java.util.List;

/** Fixed command catalogue; custom button names never become executable commands. */
final class TouchButtons {
    record Action(String id,String icon,String label,boolean pointer){}
    static final List<Action> ACTIONS=List.of(
        new Action("pointer.click","↖","클릭",true),new Action("pointer.right_click","☰","우클릭",true),
        new Action("scroll_up","↑","위로 스크롤",true),new Action("scroll_down","↓","아래로 스크롤",true),
        new Action("volume_up","＋","음량 높이기",false),new Action("volume_down","−","음량 줄이기",false),
        new Action("mute","♪","음소거",false),new Action("unmute","♫","음소거 해제",false),
        new Action("interface.reset","↺","배치 초기화",false),new Action("zoom_in","⊕","확대",false),new Action("zoom_out","⊖","축소",false));
    static Action find(String id){return ACTIONS.stream().filter(a->a.id().equals(id)).findFirst().orElseThrow(IllegalArgumentException::new);}
    static String label(String value){if(value==null||value.isBlank()||value.length()>20||value.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException();return value.trim();}
}
