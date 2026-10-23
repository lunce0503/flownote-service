package com.flownote.remote.gesture;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;

// A versioned, expiring invitation. Parsing never performs network I/O.
final class PairingLink {
    final String address,pin,code;final long expires;
    private PairingLink(String address,String pin,String code,long expires){this.address=address;this.pin=pin;this.code=code;this.expires=expires;}
    static PairingLink parse(String text) {
        try {
            if(text==null||text.length()>1024)throw new IllegalArgumentException();
            URI uri=new URI(text.trim());
            if(!"flownote-remote".equals(uri.getScheme())||!"pair".equals(uri.getHost())||uri.getPort()!=-1||uri.getUserInfo()!=null||uri.getFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new IllegalArgumentException();
            var query=new HashMap<String,String>();
            for(String part:uri.getRawQuery().split("&")){
                String[] pair=part.split("=",2);if(pair.length!=2)throw new IllegalArgumentException();
                String key=URLDecoder.decode(pair[0],StandardCharsets.UTF_8.name()),value=URLDecoder.decode(pair[1],StandardCharsets.UTF_8.name());
                if(query.putIfAbsent(key,value)!=null)throw new IllegalArgumentException();
            }
            String address=query.get("address"),pin=query.get("pin"),code=query.get("code");
            if(query.size()!=5||!"1".equals(query.get("v"))||address==null||pin==null||code==null||!code.matches("[0-9]{6}"))throw new IllegalArgumentException();
            pin=pin.replace(":","").trim().toUpperCase(Locale.ROOT);if(!pin.matches("[0-9A-F]{64}"))throw new IllegalArgumentException();
            long expires=Long.parseLong(query.get("expires")),now=System.currentTimeMillis()/1000;
            if(expires<=now||expires>now+150)throw new IllegalArgumentException();
            URI server=new URI(address);String host=server.getHost();
            if(!"https".equals(server.getScheme())||server.getUserInfo()!=null||server.getQuery()!=null||server.getFragment()!=null||!(server.getPath().isEmpty()||server.getPath().equals("/"))||host==null||!host.matches("[0-9]+(\\.[0-9]+){3}")||server.getPort()==0||server.getPort()>65535)throw new IllegalArgumentException();
            String[] parts=host.split("\\.");int[] b=new int[4];for(int i=0;i<4;i++){b[i]=Integer.parseInt(parts[i]);if(b[i]>255)throw new IllegalArgumentException();}
            if(!(b[0]==10||b[0]==127||b[0]==192&&b[1]==168||b[0]==172&&b[1]>=16&&b[1]<=31||b[0]==100&&b[1]>=64&&b[1]<=127))throw new IllegalArgumentException();
            return new PairingLink(address,pin,code,expires);
        }catch(Exception error){throw new IllegalArgumentException("연결 QR이 잘못됐거나 만료됐어요. 서버에서 새 QR을 만들어 주세요.");}
    }
}
