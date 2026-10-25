using System.Text.Json;
using Flownote.Remote.Core;

internal static class SkeletonChecks
{
    public static void Run()
    {
        static void Check(bool ok,string message) { if (!ok) throw new InvalidOperationException(message); }
        static void Reject(Action action) { try { action(); } catch (Exception e) when (e is ArgumentException or JsonException) { return; } throw new Exception("Invalid skeleton accepted"); }
        var s=RemoteSettings.Defaults(); var g=new SkeletonGestureGate();
        var wide=TestSkeletons.Frame(TestSkeletons.Pose("wide"));
        Check(TestSkeletons.Hold(g,s,wide) is null,"Disabled skeleton action"); s.GesturesEnabled=true; g=new SkeletonGestureGate();
        Check(g.Observe(s,wide,0) is null && g.Observe(s,wide,100) is null,"Global hold skipped");
        Check(TestSkeletons.Hold(g,s,wide,200,600)?.Action=="interface.minimize","Arms wide");
        Check(TestSkeletons.Hold(g,s,wide,700,2000) is null,"Held global repeated");
        g.Observe(s,TestSkeletons.Frame(),2100);
        Check(TestSkeletons.Hold(g,s,wide,2200,2700)?.Scope=="all","Global release did not rearm");
        foreach(var (pose,action) in new[]{("raised","interface.restore"),("crossed","audio.mute")})
        { g=new SkeletonGestureGate(); Check(TestSkeletons.Hold(g,s,TestSkeletons.Frame(TestSkeletons.Pose(pose)))?.Action==action,pose); }
        g=new SkeletonGestureGate(); var low=wide with {Pose=wide.Pose.Select(p=>p with {Visibility=.1}).ToArray()};
        Check(TestSkeletons.Hold(g,s,low) is null,"Low visibility fired");
        Check(TestSkeletons.Hold(g,s,wide with {DetectionThreshold=.5},1000,1500) is null,"Client threshold bypass");
        g=new SkeletonGestureGate(); g.Observe(s,wide,0); Check(g.Observe(s,wide,1000) is null,"Stale skeleton held");
        Check(g.Observe(s,wide,900) is null,"Time reversal held");
        g=new SkeletonGestureGate(); var open=TestSkeletons.Frame(hands:[TestSkeletons.Hand()]);
        TestSkeletons.Hold(g,s,open);
        Check(g.Observe(s,TestSkeletons.Frame(hands:[TestSkeletons.Hand("fist")]),600)?.Action=="task.focus","Open then fist");
        Check(TestSkeletons.Hold(g,s,TestSkeletons.Frame(hands:[TestSkeletons.Hand("fist")]),700,2000) is null,"Fist repeated");
        foreach(var (facing,dx,expected) in new[]{("back",.2,"task.next"),("back",-.2,"task.previous"),("front",.2,"task.previous")})
        { g=new SkeletonGestureGate(); TestSkeletons.Hold(g,s,open with{Facing=facing}); Check(g.Observe(s,TestSkeletons.Frame(hands:[TestSkeletons.Hand(x:dx)],facing:facing),600)?.Action==expected,"Swipe direction "+facing); }
        g=new SkeletonGestureGate(); Check(TestSkeletons.Hold(g,s,TestSkeletons.Frame(hands:[TestSkeletons.Hand("victory")]))?.Action=="interface.details","Victory details");
        g=new SkeletonGestureGate(); var pinch=TestSkeletons.Frame(hands:[TestSkeletons.Hand("pinch")]);
        TestSkeletons.Hold(g,s,pinch); Check(g.Observe(s,pinch with{Hands=[TestSkeletons.Hand("pinch",y:-.1)]},600) is null,"Unarmed precision");
        foreach(var mode in new[]{"volume","move","zoom"})
        {
            g=new SkeletonGestureGate(); pinch=TestSkeletons.Frame(hands:[TestSkeletons.Hand("pinch")],mode:mode);
            TestSkeletons.Hold(g,s,pinch,0,300);
            var changed=pinch with{Hands=[TestSkeletons.Hand("pinch",x:.05,y:-.05,gap:mode=="zoom"?.015:.01)]};
            var command=g.Observe(s,changed,500); Check(command?.Scope=="precision","Precision missing "+mode);
            if(mode=="volume") Check(command!.Value>0 && command.Value<=.02,"Volume step bound");
            if(mode=="move") Check(command!.X>0 && command.Y<0,"Pan direction");
            if(mode=="zoom") Check(command!.Value>1 && command.Value<=1.12,"Zoom bound");
            g.Observe(s,TestSkeletons.Frame(mode:mode),600);
            Check(g.Observe(s,changed,700) is null,"Tracking loss did not rearm");
        }
        g=new SkeletonGestureGate(); var both=TestSkeletons.Frame(hands:[TestSkeletons.Hand("pinch",x:-.15),TestSkeletons.Hand("pinch",x:.15,side:"Left")],mode:"zoom");
        TestSkeletons.Hold(g,s,both,0,300);
        Check(g.Observe(s,both with{Hands=[TestSkeletons.Hand("pinch",x:-.2),TestSkeletons.Hand("pinch",x:.2,side:"Left")]},500)?.Gesture=="TwoHandPinchZoom","Two hand zoom");
        Check(g.Observe(s,both with{Hands=[TestSkeletons.Hand("pinch")]},700) is null,"Two to one jump");
        Reject(()=>(wide with{Width=0}).Validate()); Reject(()=>(wide with{Sequence=0}).Validate());
        Reject(()=>(wide with{Hands=[TestSkeletons.Hand(),TestSkeletons.Hand()]}).Validate());
        Reject(()=>(wide with{Pose=[new(double.NaN,0)]}).Validate());
        string json=JsonSerializer.Serialize(wide,new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Reject(()=>JsonSerializer.Deserialize<SkeletonFrame>(json[..^1]+",\"jpeg\":\"image\"}",new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        var view=new InterfaceViewport(); view.Apply("interface.zoom_set",2);view.Apply("interface.zoom",1.12);view.Apply("interface.pan_set",0,1,-1);
        Check(view.Zoom==2&&view.X==1&&view.Y==-1,"Viewport clamp");view.Apply("interface.reset");Check(view.Zoom==1&&view.X==0,"Viewport reset");
        Check(GestureCatalog.All.Length==11 && GestureCatalog.All.Select(x=>x.Id).Distinct().Count()==11,"Catalog contract");
        Console.WriteLine("PASS: 11 scoped skeleton gestures, hold/release, confidence/stale guards, explicit precision, mirror direction, tracking loss, bounds and strict landmark-only JSON");
    }
}
