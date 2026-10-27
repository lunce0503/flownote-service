package com.flownote.remote.gesture;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;

/** Relative touchpad. Finger-up/cancel releases a drag; multiple fingers cancel without clicking. */
final class TouchPadView extends View {
    interface Listener { void input(String action,double value,double x,double y); }
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Listener listener;
    private final float density,slop;
    private float x,y,startX,startY,markerX=.5f,markerY=.5f,totalDistance;
    private double pendingX,pendingY;
    private int finger=-1;
    private long started;
    private boolean moved,dragging,dragMode;
    TouchPadView(Context context,Listener listener){
        super(context);this.listener=listener;density=getResources().getDisplayMetrics().density;
        slop=ViewConfiguration.get(context).getScaledTouchSlop();setFocusable(true);
        setContentDescription("드래그 영역 · 손가락으로 커서 이동, 탭하여 클릭");
    }
    void setDragMode(boolean value){cancelInput();dragMode=value;}
    void cancelInput(){
        handler.removeCallbacks(flush);handler.removeCallbacks(hold);pendingX=pendingY=0;
        if(dragging)listener.input("pointer.up",0,0,0);
        dragging=false;finger=-1;getParentDisallow(false);invalidate();
    }
    private void getParentDisallow(boolean value){if(getParent()!=null)getParent().requestDisallowInterceptTouchEvent(value);}
    private void flushPending(){
        if(finger<0)return;
        double dx=Math.max(-128,Math.min(128,pendingX)),dy=Math.max(-128,Math.min(128,pendingY));pendingX=pendingY=0;
        if(dx!=0||dy!=0)listener.input("pointer.move",0,dx,dy);
    }
    private final Runnable flush=this::flushPending;
    private final Runnable hold=new Runnable(){public void run(){if(dragging){listener.input("pointer.hold",0,0,0);handler.postDelayed(this,400);}}};
    @Override public boolean onTouchEvent(MotionEvent event){
        if(!isEnabled())return false;
        switch(event.getActionMasked()){
            case MotionEvent.ACTION_DOWN:
                cancelInput();finger=event.getPointerId(0);x=startX=event.getX();y=startY=event.getY();totalDistance=0;started=event.getEventTime();moved=false;getParentDisallow(true);
                if(dragMode){dragging=true;listener.input("pointer.down",0,0,0);handler.postDelayed(hold,400);}invalidate();return true;
            case MotionEvent.ACTION_POINTER_DOWN:case MotionEvent.ACTION_CANCEL:cancelInput();return true;
            case MotionEvent.ACTION_MOVE:
                int index=event.findPointerIndex(finger);if(index<0)return true;
                float nx=event.getX(index),ny=event.getY(index);
                totalDistance+=Math.hypot(nx-x,ny-y);moved|=totalDistance>slop;
                pendingX+=(nx-x)/density*1.5;pendingY+=(ny-y)/density*1.5;x=nx;y=ny;
                markerX=Math.max(0,Math.min(1,markerX+(float)((nx-startX)/Math.max(1,getWidth()))));
                markerY=Math.max(0,Math.min(1,markerY+(float)((ny-startY)/Math.max(1,getHeight()))));startX=nx;startY=ny;
                if(!handler.hasCallbacks(flush))handler.postDelayed(flush,33);invalidate();return true;
            case MotionEvent.ACTION_UP:
                if(finger<0)return true;
                handler.removeCallbacks(flush);flush.run();
                boolean tap=!dragMode&&!moved&&event.getEventTime()-started<500;
                cancelInput();if(tap)performClick();return true;
            default:return true;
        }
    }
    @Override public boolean performClick(){if(!isEnabled())return false;super.performClick();listener.input("pointer.click",0,0,0);return true;}
    @Override protected void onDetachedFromWindow(){cancelInput();super.onDetachedFromWindow();}
    @Override protected void onDraw(Canvas c){
        super.onDraw(c);float w=getWidth(),h=getHeight();c.drawColor(isEnabled()?0xffedf3ef:0xffeceeec);
        paint.setStrokeWidth(density);paint.setColor(0xffd3dfd6);
        float step=28*density;for(float gx=w/2%step;gx<w;gx+=step)c.drawLine(gx,0,gx,h,paint);for(float gy=h/2%step;gy<h;gy+=step)c.drawLine(0,gy,w,gy,paint);
        paint.setColor(0xff799b89);paint.setStrokeWidth(2*density);c.drawLine(w/2,0,w/2,h,paint);c.drawLine(0,h/2,w,h/2,paint);
        paint.setStyle(Paint.Style.STROKE);c.drawCircle(w/2,h/2,12*density,paint);paint.setStyle(Paint.Style.FILL);
        paint.setColor(isEnabled()?0xff276254:0xff84958b);c.drawCircle(markerX*w,markerY*h,7*density,paint);
        if(finger>=0){paint.setColor(0x55276254);c.drawCircle(x,y,22*density,paint);}
    }
}
