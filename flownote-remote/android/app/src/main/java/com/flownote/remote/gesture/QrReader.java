package com.flownote.remote.gesture;

import android.graphics.Bitmap;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import java.util.Collections;
import java.util.EnumMap;

final class QrReader {
    static String decode(Bitmap image) {
        if(image==null||image.getWidth()>1024||image.getHeight()>1024)return null;
        int[] pixels=new int[image.getWidth()*image.getHeight()];image.getPixels(pixels,0,image.getWidth(),0,0,image.getWidth(),image.getHeight());
        var reader=new MultiFormatReader();var hints=new EnumMap<DecodeHintType,Object>(DecodeHintType.class);
        hints.put(DecodeHintType.POSSIBLE_FORMATS,Collections.singletonList(BarcodeFormat.QR_CODE));hints.put(DecodeHintType.TRY_HARDER,Boolean.TRUE);
        try{return reader.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(image.getWidth(),image.getHeight(),pixels))),hints).getText();}
        catch(NotFoundException ignored){return null;}finally{reader.reset();}
    }
}
