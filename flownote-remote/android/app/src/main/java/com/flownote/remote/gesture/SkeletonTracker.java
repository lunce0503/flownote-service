package com.flownote.remote.gesture;

import android.content.Context;
import android.graphics.Bitmap;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker;
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.List;
import java.util.HashSet;

/** On-device only. No image data is returned to the transport. Use on its owning worker thread. */
final class SkeletonTracker implements AutoCloseable {
    private final HandLandmarker hands;
    private final PoseLandmarker pose;
    final double threshold;
    private long sequence;
    SkeletonTracker(Context context,double threshold) {
        this.threshold=threshold;
        hands=HandLandmarker.createFromOptions(context,HandLandmarker.HandLandmarkerOptions.builder()
            .setBaseOptions(BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build())
            .setRunningMode(RunningMode.IMAGE).setNumHands(2)
            .setMinHandDetectionConfidence((float)threshold).setMinHandPresenceConfidence((float)threshold).build());
        try {
            pose=PoseLandmarker.createFromOptions(context,PoseLandmarker.PoseLandmarkerOptions.builder()
                .setBaseOptions(BaseOptions.builder().setModelAssetPath("pose_landmarker.task").build())
                .setRunningMode(RunningMode.IMAGE).setNumPoses(1).setOutputSegmentationMasks(false)
                .setMinPoseDetectionConfidence((float)threshold).setMinPosePresenceConfidence((float)threshold).build());
        } catch(RuntimeException error) { hands.close();throw error; }
    }
    private JSONArray points(List<NormalizedLandmark> values,boolean visibility)throws Exception {
        var points=new JSONArray();
        for(var point:values){var joint=new JSONObject().put("x",point.x()).put("y",point.y()).put("z",point.z());if(visibility)joint.put("visibility",point.visibility().orElse(0f));points.put(joint);}
        return points;
    }
    JSONObject detect(Bitmap bitmap,boolean rear,String mode)throws Exception {
        // MPImage.close() recycles its bitmap. Preserve the caller's live preview frame.
        var image=new BitmapImageBuilder(bitmap.copy(Bitmap.Config.ARGB_8888,false)).build();
        try {
            var h=hands.detect(image);var p=pose.detect(image);var resultHands=new JSONArray();var sides=new HashSet<String>();
            for(int i=0;i<h.landmarks().size();i++) {
                String side=h.handedness().get(i).get(0).categoryName();
                if((side.equals("Left")||side.equals("Right"))&&sides.add(side))
                    resultHands.put(new JSONObject().put("side",side).put("points",points(h.landmarks().get(i),false)));
            }
            return new JSONObject().put("schemaVersion",1).put("sequence",++sequence).put("width",bitmap.getWidth()).put("height",bitmap.getHeight())
                .put("facing",rear?"back":"front").put("detectionThreshold",threshold).put("precisionMode",mode)
                .put("pose",p.landmarks().isEmpty()?new JSONArray():points(p.landmarks().get(0),true)).put("hands",resultHands);
        } finally { image.close(); }
    }
    @Override public void close(){hands.close();pose.close();}
}
