using Flownote.Remote.Core;

// Deliberately synthetic observations, separate from actual MediaPipe fixture tests.
internal static class TestSkeletons
{
    public static SkeletonFrame Frame(Joint[]? pose = null, HandSkeleton[]? hands = null, string mode = "off", string facing = "back", long sequence = 1) =>
        new(1, sequence, 480, 480, facing, .8, pose ?? [], hands ?? [], mode);
    public static Joint[] Pose(string motion)
    {
        var p = Enumerable.Repeat(new Joint(.5,.5),33).ToArray();
        p[11] = new(.4,.45); p[12] = new(.6,.45); p[13] = new(.3,.45); p[14] = new(.7,.45);
        p[15] = motion == "raised" ? new(.3,.2) : motion == "crossed" ? new(.55,.5) : new(.1,.45);
        p[16] = motion == "raised" ? new(.7,.2) : motion == "crossed" ? new(.45,.5) : new(.9,.45);
        return p;
    }
    public static HandSkeleton Hand(string shape = "open", double x = 0, double y = 0, string side = "Right", double gap = .01)
    {
        var p = Enumerable.Repeat(new Joint(.5,.8),21).ToArray();
        for (int f = 0; f < 4; f++)
        {
            int b = 5+f*4; double px = .44+f*.06;
            bool extended = shape == "open" || shape == "victory" && f < 2;
            p[b] = new(px,.65); p[b+1] = new(px,.55); p[b+2] = new(px,extended ? .45 : .68); p[b+3] = new(px,extended ? .35 : .7);
        }
        p[4] = new(.25,.65);
        if (shape == "pinch") { p[4] = new(.5-gap/2,.55); p[8] = new(.5+gap/2,.55); }
        return new(side,p.Select(j => j with { X=j.X+x,Y=j.Y+y }).ToArray());
    }
    public static ScopedCommand? Hold(SkeletonGestureGate gate, RemoteSettings settings, SkeletonFrame frame, long start = 0, long end = 500)
    {
        ScopedCommand? result = null;
        for (long t=start;t<=end;t+=100) result = gate.Observe(settings,frame,t) ?? result;
        return result;
    }
}
