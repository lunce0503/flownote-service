package com.flownote.remote.gesture;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.*;
import android.os.Build;
import android.view.WindowInsets;

public final class QrScannerActivity extends Activity {
    private CameraSource camera;private ImageView preview;private TextView status;private volatile boolean accepted;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        var content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        int space=Math.round(20*getResources().getDisplayMetrics().density);content.setPadding(space,space,space,space);
        content.setOnApplyWindowInsetsListener((view,insets)->{
            if(Build.VERSION.SDK_INT>=30){var bars=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());view.setPadding(space+bars.left,space+bars.top,space+bars.right,space+bars.bottom);}
            else view.setPadding(space+insets.getSystemWindowInsetLeft(),space+insets.getSystemWindowInsetTop(),space+insets.getSystemWindowInsetRight(),space+insets.getSystemWindowInsetBottom());return insets;
        });
        status=new TextView(this);status.setText(R.string.qr_scan_prompt);status.setTextSize(20);content.addView(status);
        preview=new ImageView(this);preview.setAdjustViewBounds(true);preview.setContentDescription("연결 QR 카메라 미리보기");content.addView(preview,new LinearLayout.LayoutParams(-1,0,1));
        var close=new Button(this);close.setText("읽기 취소");close.setOnClickListener(v->finish());content.addView(close);setContentView(content);
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},42);
    }
    @Override protected void onResume(){super.onResume();if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)start();}
    private void start(){
        if(camera!=null||accepted)return;
        camera=new CameraSource(this,new CameraSource.Listener(){
            public void frame(byte[] jpeg){
                if(accepted)return;var image=BitmapFactory.decodeByteArray(jpeg,0,jpeg.length);String text=QrReader.decode(image);
                runOnUiThread(()->{if(isFinishing()||camera==null)return;preview.setImageBitmap(image);if(text==null)return;
                    try{PairingLink.parse(text);accepted=true;setResult(RESULT_OK,new Intent().putExtra(Intent.EXTRA_TEXT,text));finish();}
                    catch(IllegalArgumentException e){status.setText(e.getMessage());}
                });
            }
            public void error(String message){runOnUiThread(()->status.setText(getString(R.string.qr_camera_error,message)));}
        });
        try{camera.start(true);}catch(Exception e){status.setText("카메라를 사용할 수 없어요. 취소 후 연결 코드를 입력해 주세요.");camera.close();camera=null;}
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);if(request==42){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)start();else status.setText("카메라 권한이 필요해요. 취소 후 연결 코드를 입력할 수 있어요.");}}
    @Override protected void onStop(){if(camera!=null){camera.close();camera=null;}preview.setImageDrawable(null);super.onStop();}
}
