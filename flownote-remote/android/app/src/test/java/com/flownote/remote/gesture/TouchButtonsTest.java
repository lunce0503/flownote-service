package com.flownote.remote.gesture;
import org.junit.Test;
import static org.junit.Assert.*;
public class TouchButtonsTest {
    @Test public void customButtonsUseOnlyKnownCommands(){
        assertEquals("pointer.click",TouchButtons.find("pointer.click").id());assertEquals("책 읽기",TouchButtons.label(" 책 읽기 "));
        for(String bad:new String[]{"rm -rf /","https://example.com","pointer.key",""})try{TouchButtons.find(bad);fail("Unknown action accepted");}catch(IllegalArgumentException expected){}
        for(String bad:new String[]{"","\n명령","a".repeat(21)})try{TouchButtons.label(bad);fail("Invalid label accepted");}catch(IllegalArgumentException expected){}
    }
}
