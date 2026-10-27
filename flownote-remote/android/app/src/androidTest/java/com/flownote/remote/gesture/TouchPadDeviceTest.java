package com.flownote.remote.gesture;

import android.os.SystemClock;
import android.view.MotionEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.ArrayList;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class TouchPadDeviceTest {
    @Test public void tapMoveDragCancelAndWatchdogHeartbeat(){
        var instrumentation=InstrumentationRegistry.getInstrumentation();var events=new ArrayList<String>();var values=new ArrayList<Double>();final TouchPadView[] view={null};
        instrumentation.runOnMainSync(()->{view[0]=new TouchPadView(instrumentation.getTargetContext(),(a,v,x,y)->{events.add(a);values.add(x);});view[0].layout(0,0,800,600);});
        long start=SystemClock.uptimeMillis();
        java.util.function.BiConsumer<Integer,float[]> send=(action,xy)->instrumentation.runOnMainSync(()->{var e=MotionEvent.obtain(start,SystemClock.uptimeMillis(),action,xy[0],xy[1],0);view[0].onTouchEvent(e);e.recycle();});
        send.accept(MotionEvent.ACTION_DOWN,new float[]{100,100});send.accept(MotionEvent.ACTION_UP,new float[]{100,100});assertEquals(java.util.List.of("pointer.click"),events);
        events.clear();values.clear();send.accept(MotionEvent.ACTION_DOWN,new float[]{100,100});send.accept(MotionEvent.ACTION_MOVE,new float[]{180,140});SystemClock.sleep(80);send.accept(MotionEvent.ACTION_UP,new float[]{180,140});assertEquals(java.util.List.of("pointer.move"),events);assertTrue(values.get(0)>0&&values.get(0)<=128);
        events.clear();instrumentation.runOnMainSync(()->view[0].setDragMode(true));send.accept(MotionEvent.ACTION_DOWN,new float[]{100,100});SystemClock.sleep(450);send.accept(MotionEvent.ACTION_MOVE,new float[]{140,160});send.accept(MotionEvent.ACTION_CANCEL,new float[]{140,160});
        assertEquals("pointer.down",events.get(0));assertTrue(events.contains("pointer.hold"));assertEquals("pointer.up",events.get(events.size()-1));int count=events.size();SystemClock.sleep(500);assertEquals("Cancelled drag kept transmitting",count,events.size());
        events.clear();send.accept(MotionEvent.ACTION_DOWN,new float[]{100,100});instrumentation.runOnMainSync(()->view[0].cancelInput());assertEquals(java.util.List.of("pointer.down","pointer.up"),events);
        events.clear();instrumentation.runOnMainSync(()->{view[0].setDragMode(false);view[0].setEnabled(false);});send.accept(MotionEvent.ACTION_DOWN,new float[]{100,100});assertTrue("Disabled pad transmitted",events.isEmpty());
    }
}
