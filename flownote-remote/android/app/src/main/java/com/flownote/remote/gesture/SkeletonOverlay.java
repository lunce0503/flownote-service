package com.flownote.remote.gesture;

import android.content.Context;
import android.graphics.*;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;

final class SkeletonOverlay extends View {
    private final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);
    private JSONObject frame;
    private static final int[][] HAND={{0,1},{1,2},{2,3},{3,4},{0,5},{5,6},{6,7},{7,8},{5,9},{9,10},{10,11},{11,12},{9,13},{13,14},{14,15},{15,16},{13,17},{17,18},{18,19},{19,20},{0,17}};
    private static final int[][] POSE={{11,12},{11,13},{13,15},{12,14},{14,16},{11,23},{12,24},{23,24}};
    SkeletonOverlay(Context context){super(context);setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);paint.setStrokeWidth(3);}
    void show(JSONObject value){frame=value;invalidate();}
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);if(frame==null)return;
        int saved=canvas.save();
        try { double w=frame.getDouble("width"),h=frame.getDouble("height"),scale=Math.min(getWidth()/w,getHeight()/h),dx=(getWidth()-w*scale)/2,dy=(getHeight()-h*scale)/2;
            canvas.translate((float)dx,(float)dy);canvas.scale((float)scale,(float)scale);
            links(canvas,frame.getJSONArray("pose"),POSE);var hands=frame.getJSONArray("hands");for(int i=0;i<hands.length();i++)links(canvas,hands.getJSONObject(i).getJSONArray("points"),HAND);
        } catch(Exception ignored) { } finally {canvas.restoreToCount(saved);}
    }
    private void links(Canvas canvas,JSONArray points,int[][] edges)throws Exception {
        paint.setColor(0xff62edb4);double w=frame.getDouble("width"),h=frame.getDouble("height");
        for(int[] edge:edges){if(edge[0]>=points.length()||edge[1]>=points.length())continue;var a=points.getJSONObject(edge[0]);var b=points.getJSONObject(edge[1]);if(a.optDouble("visibility",1)<.5||b.optDouble("visibility",1)<.5)continue;
            canvas.drawLine((float)(a.getDouble("x")*w),(float)(a.getDouble("y")*h),(float)(b.getDouble("x")*w),(float)(b.getDouble("y")*h),paint);}
        paint.setColor(Color.WHITE);for(int i=0;i<points.length();i++){var p=points.getJSONObject(i);if(p.optDouble("visibility",1)>=.5)canvas.drawCircle((float)(p.getDouble("x")*w),(float)(p.getDouble("y")*h),3,paint);}
    }
}
