package com.flownote.remote.gesture;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.Surface;
import android.view.WindowManager;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Comparator;

final class CameraSource implements AutoCloseable {
    interface Listener {void frame(byte[] jpeg);void error(String message);}
    private final Context context;private final Listener listener;
    private HandlerThread worker;private ImageReader reader;private CameraDevice device;private CameraCaptureSession session;
    private volatile boolean running;private long lastFrame;private int orientation;private boolean front;
    CameraSource(Context context,Listener listener){this.context=context;this.listener=listener;}
    void start(boolean rear)throws Exception {
        if(context.checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("카메라 권한이 필요합니다.");
        CameraManager manager=(CameraManager)context.getSystemService(Context.CAMERA_SERVICE);
        String[] ids=manager.getCameraIdList();if(ids.length==0)throw new IllegalStateException("카메라 없음");
        String selected=ids[0];
        for(String id:ids){Integer facing=manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);if(facing!=null&&facing==(rear?CameraCharacteristics.LENS_FACING_BACK:CameraCharacteristics.LENS_FACING_FRONT)){selected=id;break;}}
        var info=manager.getCameraCharacteristics(selected);Integer sensor=info.get(CameraCharacteristics.SENSOR_ORIENTATION);orientation=sensor==null?0:sensor;
        Integer facing=info.get(CameraCharacteristics.LENS_FACING);front=facing!=null&&facing==CameraCharacteristics.LENS_FACING_FRONT;
        var map=info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);if(map==null)throw new IllegalStateException("카메라 형식 없음");
        Size size=Arrays.stream(map.getOutputSizes(ImageFormat.YUV_420_888)).filter(s->s.getWidth()<=640&&s.getHeight()<=480)
                .max(Comparator.comparingInt(s->s.getWidth()*s.getHeight())).orElseThrow(()->new IllegalStateException("저해상도 카메라 형식 없음"));
        worker=new HandlerThread("remote-camera");worker.start();Handler handler=new Handler(worker.getLooper());running=true;
        reader=ImageReader.newInstance(size.getWidth(),size.getHeight(),ImageFormat.YUV_420_888,2);
        reader.setOnImageAvailableListener(source->{
            try(Image image=source.acquireLatestImage()){
                if(image==null||!running||android.os.SystemClock.elapsedRealtime()-lastFrame<240)return;
                lastFrame=android.os.SystemClock.elapsedRealtime();listener.frame(jpeg(image));
            }catch(Exception e){if(running)listener.error("카메라 프레임을 읽지 못했습니다.");}
        },handler);
        manager.openCamera(selected,new CameraDevice.StateCallback(){
            public void onOpened(CameraDevice camera){
                if(!running){camera.close();return;}device=camera;
                try{camera.createCaptureSession(java.util.Collections.singletonList(reader.getSurface()),new CameraCaptureSession.StateCallback(){
                    public void onConfigured(CameraCaptureSession configured){
                        if(!running){configured.close();return;}session=configured;
                        try{var request=camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);request.addTarget(reader.getSurface());request.set(CaptureRequest.CONTROL_AF_MODE,CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);configured.setRepeatingRequest(request.build(),null,handler);}
                        catch(Exception e){listener.error("카메라 전송을 시작하지 못했습니다.");}
                    }
                    public void onConfigureFailed(CameraCaptureSession failed){listener.error("카메라 구성을 지원하지 않습니다.");}
                },handler);}catch(Exception e){listener.error("카메라 연결 실패");}
            }
            public void onDisconnected(CameraDevice camera){camera.close();listener.error("카메라 연결이 끊어졌습니다.");}
            public void onError(CameraDevice camera,int error){camera.close();listener.error("카메라 장치를 사용할 수 없습니다.");}
        },handler);
    }
    private byte[] jpeg(Image image)throws Exception {
        int width=image.getWidth(),height=image.getHeight();byte[] nv21=new byte[width*height*3/2];Image.Plane[] planes=image.getPlanes();
        for(int plane=0;plane<3;plane++){
            ByteBuffer bytes=planes[plane].getBuffer();int rows=plane==0?height:height/2,columns=plane==0?width:width/2;
            for(int y=0;y<rows;y++)for(int x=0;x<columns;x++){
                byte value=bytes.get(y*planes[plane].getRowStride()+x*planes[plane].getPixelStride());
                if(plane==0)nv21[y*width+x]=value;else nv21[width*height+(y*columns+x)*2+(plane==1?1:0)]=value;
            }
        }
        ByteArrayOutputStream raw=new ByteArrayOutputStream();new YuvImage(nv21,ImageFormat.NV21,width,height,null).compressToJpeg(new Rect(0,0,width,height),60,raw);
        Bitmap original=BitmapFactory.decodeByteArray(raw.toByteArray(),0,raw.size());
        int rotation=((WindowManager)context.getSystemService(Context.WINDOW_SERVICE)).getDefaultDisplay().getRotation();
        int degrees=rotation==Surface.ROTATION_90?90:rotation==Surface.ROTATION_180?180:rotation==Surface.ROTATION_270?270:0;
        Matrix matrix=new Matrix();matrix.postRotate(front?(orientation+degrees)%360:(orientation-degrees+360)%360);if(front)matrix.postScale(-1,1);
        Bitmap rotated=Bitmap.createBitmap(original,0,0,width,height,matrix,true);ByteArrayOutputStream output=new ByteArrayOutputStream();rotated.compress(Bitmap.CompressFormat.JPEG,60,output);
        if(rotated!=original)rotated.recycle();original.recycle();return output.toByteArray();
    }
    @Override public void close(){running=false;if(session!=null){session.close();session=null;}if(device!=null){device.close();device=null;}if(reader!=null){reader.close();reader=null;}if(worker!=null){worker.quitSafely();worker=null;}}
}
