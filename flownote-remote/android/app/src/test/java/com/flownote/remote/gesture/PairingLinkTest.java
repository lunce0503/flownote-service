package com.flownote.remote.gesture;

import org.json.JSONArray;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class PairingLinkTest {
    @Test public void sharedCrossPlatformInvitationVectors()throws Exception {
        try(var input=getClass().getClassLoader().getResourceAsStream("pairing-links.json")){
            assertNotNull(input);var vectors=new JSONArray(new String(input.readAllBytes(),StandardCharsets.UTF_8));
            for(int i=0;i<vectors.length();i++){
                var vector=vectors.getJSONObject(i);String text=vector.getString("text").replace("EXPIRES",Long.toString(System.currentTimeMillis()/1000+120));
                boolean accepted;try{PairingLink.parse(text);accepted=true;}catch(IllegalArgumentException error){accepted=false;}
                assertEquals(vector.getString("name"),vector.getBoolean("valid"),accepted);
            }
        }
    }
    @Test public void arbitraryPayloadAndOversizedQrAreRejected(){
        for(String text:new String[]{"", "javascript:alert(1)","https://example.com",new String(new char[1025]).replace('\0','x')}){
            try{PairingLink.parse(text);fail("Unsafe invitation accepted");}catch(IllegalArgumentException expected){}
        }
    }
}
