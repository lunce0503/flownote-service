namespace Flownote.Remote.Core;

// Client landmarks are observations, never executable commands. Time is server monotonic time.
public sealed class SkeletonGestureGate
{
    private long seen = -1, since, lastAction = -10000, openSince = -1, pinchSince = -1;
    private string? candidate, latched, side;
    private string mode = "off";
    private Joint? openAnchor, pinchAnchor;
    private double span;
    public void Reset()
    { seen = -1; candidate = latched = side = null; openSince = pinchSince = -1; openAnchor = pinchAnchor = null; span = 0; mode = "off"; }
    private static double Distance(Joint a, Joint b, double aspect = 1) => Math.Sqrt(Math.Pow((a.X-b.X)*aspect, 2)+Math.Pow(a.Y-b.Y, 2));
    private static double Palm(HandSkeleton hand, double aspect) => Math.Max(.01, Distance(hand.Points[0], hand.Points[9], aspect));
    private static int Fingers(HandSkeleton h, double aspect)
    {
        int count = 0;
        foreach (int tip in new[] { 8, 12, 16, 20 })
            if (Distance(h.Points[tip],h.Points[0],aspect) > Distance(h.Points[tip-2],h.Points[0],aspect)*1.22) count++;
        return count;
    }
    private static double Pinch(HandSkeleton h, double aspect) => Distance(h.Points[4],h.Points[8],aspect)/Palm(h,aspect);
    private static Joint Center(HandSkeleton h) => new((h.Points[4].X+h.Points[8].X)/2,(h.Points[4].Y+h.Points[8].Y)/2);
    public ScopedCommand? Observe(RemoteSettings settings, SkeletonFrame frame, long now)
    {
        frame.Validate();
        if (!settings.GesturesEnabled || frame.DetectionThreshold + .0001 < settings.ConfidenceThreshold) { Reset(); return null; }
        if (seen >= 0 && (now <= seen || now-seen > 750)) Reset();
        seen = now; double aspect = frame.Width/(double)frame.Height;
        string? global = Global(frame, settings.ConfidenceThreshold, aspect);
        if (global is not null)
        {
            openSince = pinchSince = -1; pinchAnchor = null;
            return Discrete(global, "all", global == "ArmsWide" ? "interface.minimize" : global == "ArmsRaised" ? "interface.restore" : "audio.mute", settings, now);
        }
        if (frame.Hands.Length == 0) { candidate = latched = null; openSince = pinchSince = -1; pinchAnchor = null; return null; }
        if (frame.PrecisionMode != mode) { pinchSince = -1; pinchAnchor = null; span = 0; mode = frame.PrecisionMode; }
        if (mode != "off")
        {
            candidate = latched = null; openSince = -1;
            return Precision(frame, aspect, now);
        }
        pinchSince = -1; pinchAnchor = null;
        if (frame.Hands.Length != 1) { candidate = latched = null; openSince = -1; return null; }
        var hand = frame.Hands[0]; int fingers = Fingers(hand, aspect);
        if (side != hand.Side) { side = hand.Side; openSince = -1; candidate = latched = null; }
        if (fingers >= 4 && Pinch(hand, aspect) > .55)
        {
            candidate = latched = null;
            if (openSince < 0) { openSince = now; openAnchor = hand.Points[0]; }
            double dx = (hand.Points[0].X-openAnchor!.X)*(frame.Facing == "front" ? -1 : 1);
            if (now-openSince >= settings.HoldMs && Math.Abs(dx) > .16 && now-lastAction >= settings.CooldownMs)
            {
                openSince = -1; lastAction = now;
                return new("management", dx > 0 ? "SwipeRight" : "SwipeLeft", dx > 0 ? "task.next" : "task.previous");
            }
            return null;
        }
        if (fingers == 0 && openSince >= 0)
        {
            bool prepared = now-openSince >= settings.HoldMs && now-openSince < 3000;
            openSince = -1;
            if (prepared && now-lastAction >= settings.CooldownMs)
            { lastAction = now; latched = "OpenThenFist"; return new("management", "OpenThenFist", "task.focus"); }
        }
        else if (fingers != 0) openSince = -1;
        bool victory = fingers == 2 && Distance(hand.Points[8],hand.Points[0],aspect) > Distance(hand.Points[6],hand.Points[0],aspect)*1.22 &&
            Distance(hand.Points[12],hand.Points[0],aspect) > Distance(hand.Points[10],hand.Points[0],aspect)*1.22;
        if (victory) return Discrete("VictoryHold", "management", "interface.details", settings, now);
        candidate = null; if (fingers != 0) latched = null;
        return null;
    }
    private ScopedCommand? Discrete(string gesture, string scope, string action, RemoteSettings settings, long now)
    {
        if (candidate != gesture) { candidate = gesture; since = now; if (latched != gesture) latched = null; }
        if (latched == gesture || now-since < settings.HoldMs || now-lastAction < settings.CooldownMs) return null;
        latched = gesture; lastAction = now; return new(scope, gesture, action);
    }
    private static string? Global(SkeletonFrame frame, double threshold, double aspect)
    {
        var p = frame.Pose;
        if (p.Length != 33 || new[] {11,12,13,14,15,16}.Any(i => p[i].Visibility < threshold)) return null;
        double shoulders = Distance(p[11],p[12],aspect);
        if (shoulders < .08) return null;
        double shoulderY = (p[11].Y+p[12].Y)/2;
        if (p[15].Y < shoulderY-shoulders*.55 && p[16].Y < shoulderY-shoulders*.55) return "ArmsRaised";
        double left = Math.Min(p[11].X,p[12].X), right = Math.Max(p[11].X,p[12].X);
        if (Math.Min(p[15].X,p[16].X) < left-shoulders*.45/aspect && Math.Max(p[15].X,p[16].X) > right+shoulders*.45/aspect &&
            Math.Abs(p[15].Y-shoulderY) < shoulders*.4 && Math.Abs(p[16].Y-shoulderY) < shoulders*.4 &&
            Distance(p[15],p[16],aspect) > shoulders*2.1) return "ArmsWide";
        if ((p[15].X-p[16].X)*(p[11].X-p[12].X) < 0 &&
            Math.Abs(p[15].Y-shoulderY) < shoulders*.9 && Math.Abs(p[16].Y-shoulderY) < shoulders*.9 &&
            Distance(p[15],p[16],aspect) < shoulders*.8) return "WristsCrossed";
        return null;
    }
    private ScopedCommand? Precision(SkeletonFrame frame, double aspect, long now)
    {
        var h = frame.Hands[0]; var center = Center(h); double gap = Distance(h.Points[4],h.Points[8],aspect);
        bool two = frame.Hands.Length == 2;
        if (two)
        {
            if (mode != "zoom" || frame.Hands.Any(hand => Pinch(hand,aspect) > .45)) { pinchSince = -1; pinchAnchor = null; return null; }
            gap = Distance(Center(frame.Hands[0]),Center(frame.Hands[1]),aspect);
        }
        if (pinchAnchor is null)
        {
            if (Pinch(h,aspect) > .30) { pinchSince = -1; return null; }
            if (pinchSince < 0) pinchSince = now;
            if (now-pinchSince < 250) return null;
            pinchAnchor = center; span = Math.Max(gap,.01); side = two ? "Both" : h.Side; return null;
        }
        if (side != (two ? "Both" : h.Side) || (!two && (Pinch(h,aspect) > (mode == "zoom" ? 1.65 : .5) || Fingers(h,aspect) >= 4)))
        { pinchSince = -1; pinchAnchor = null; return null; }
        if (now-lastAction < 120) return null;
        double dx = (center.X-pinchAnchor.X)*(frame.Facing == "front" ? -1 : 1), dy = center.Y-pinchAnchor.Y;
        if (mode == "zoom")
        {
            double factor = Math.Clamp(Math.Max(gap,.01)/span,.88,1.12);
            if (Math.Abs(factor-1) < .035) return null;
            span = Math.Max(gap,.01); lastAction = now;
            return new("precision",two ? "TwoHandPinchZoom" : "PinchZoom","interface.zoom",factor);
        }
        if (Math.Abs(dx)+Math.Abs(dy) < .012) return null;
        pinchAnchor = center; lastAction = now;
        return mode == "volume" ? new("precision","PinchVolume","audio.delta",Math.Clamp(-dy*.5,-.02,.02)) :
            new("precision","PinchMove","interface.pan",0,Math.Clamp(dx,-.08,.08),Math.Clamp(dy,-.08,.08));
    }
}
