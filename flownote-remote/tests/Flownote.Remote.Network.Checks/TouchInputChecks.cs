using System.Collections.Concurrent;
using System.Net;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

internal static class TouchInputChecks
{
    public static async Task RunAsync()
    {
        static void Check(bool ok,string why){if(!ok)throw new InvalidOperationException(why);}
        static async Task Until(Func<bool> ok){for(int i=0;i<120;i++){if(ok())return;await Task.Delay(30);}throw new TimeoutException("Touch acknowledgement missing");}
        using var cert=Protocol.CreateCertificate(IPAddress.Loopback);
        var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;
        await using var hub=new RemoteHub(settings);await hub.StartAsync(IPAddress.Loopback,0,cert);string pin=Protocol.Pin(cert);
        var sourceGrant=hub.RegisterLocal("Phone");var otherGrant=hub.RegisterLocal("Other phone");var targetGrant=hub.RegisterLocal("Windows output");
        var received=new ConcurrentQueue<InterfaceCommand>();bool ready=true;
        var unblock=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);bool stalled=false;
        await using var target=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Windows",PointerReady:ready),async c=>{received.Enqueue(c);if(stalled)await unblock.Task;return new InterfaceResult(true);});
        await using var phone=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Android"));
        await using var other=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Android"));
        await target.ConnectAsync(hub.Address,pin,targetGrant);await phone.ConnectAsync(hub.Address,pin,sourceGrant);await other.ConnectAsync(hub.Address,pin,otherGrant);
        await Until(()=>hub.Snapshot().Devices.Any(d=>d.Id==targetGrant.DeviceId&&d.PointerReady));
        Check(hub.Snapshot().Capabilities is {TouchInput:true,GestureRecognition:false,ScopedGestures:false}&&!hub.Snapshot().GesturesEnabled,"Touch mode negotiation");
        Task Input(string action,double x=0,double y=0)=>phone.ControlAsync(targetGrant.DeviceId,action,x:x,y:y);
        await Input("pointer.move",12,-7);await Until(()=>received.Count==1);Check(received.Last().X==12&&received.Last().Y==-7,"Relative coordinates lost");
        await Input("pointer.click");await Until(()=>received.Count==2);
        await Input("pointer.down");await Until(()=>received.Count==3);
        await Input("pointer.move",20,10);await Input("pointer.hold");await Until(()=>received.Count==5);
        await other.ControlAsync(targetGrant.DeviceId,"pointer.move",x:99);await Task.Delay(100);Check(received.Count==5&&other.Connected,"Another phone hijacked drag lease");
        await Input("pointer.up");await Until(()=>received.Count==6);
        await other.ControlAsync(targetGrant.DeviceId,"pointer.right_click");await Until(()=>received.Count==7);
        await Input("pointer.down");await Until(()=>received.Count==8);
        await phone.SetEnabledAsync(false);await Until(()=>received.Last().Action=="pointer.up");
        int count=received.Count;await Input("pointer.move",15);await Task.Delay(100);Check(received.Count==count,"Paused source controlled pointer");
        await phone.SetEnabledAsync(true);await Until(()=>phone.Enabled);
        await Input("pointer.down");await Until(()=>received.Count==count+1);
        await hub.SetDeviceAllowedAsync(targetGrant.DeviceId,false);await Until(()=>received.Last().Action=="pointer.up");
        count=received.Count;await Input("pointer.click");await Task.Delay(100);Check(received.Count==count,"Paused target received pointer input");
        await hub.SetDeviceAllowedAsync(targetGrant.DeviceId,true);
        await Input("pointer.down");await Until(()=>received.Count==count+1);
        hub.Revoke(sourceGrant.DeviceId);await Until(()=>received.Last().Action=="pointer.up");
        count=received.Count;await other.ControlAsync(targetGrant.DeviceId,"pointer.down");await Until(()=>received.Count==count+1);
        await Until(()=>received.Last().Action=="pointer.up"); // idle lease expiry
        // A slow output must still receive release when all 32 ordinary ack slots are occupied.
        count=received.Count;stalled=true;await other.ControlAsync(targetGrant.DeviceId,"pointer.down");await Until(()=>received.Count==count+1);
        try
        {
            for(int i=0;i<31;i++)await hub.RouteControlAsync(targetGrant.DeviceId,new(Guid.NewGuid(),"precision","interface.reset"));
            await other.ControlAsync(targetGrant.DeviceId,"pointer.up");await Task.Delay(150);Check(other.Connected,"Backpressure disconnected the touch source");
        }
        finally {stalled=false;unblock.TrySetResult();}
        await Until(()=>received.Count==count+33&&received.Last().Action=="pointer.up");
        ready=false;await Until(()=>!hub.Snapshot().Devices.Single(d=>d.Id==targetGrant.DeviceId).PointerReady);
        count=received.Count;await other.ControlAsync(targetGrant.DeviceId,"pointer.click");await Task.Delay(100);Check(received.Count==count,"Pointer readiness bypassed");
        foreach(var invalid in new[]{new InterfaceCommand(Guid.NewGuid(),"precision",null!),new InterfaceCommand(Guid.NewGuid(),"precision","pointer.move",X:129),new InterfaceCommand(Guid.NewGuid(),"precision","pointer.click",X:1),new InterfaceCommand(Guid.NewGuid(),"precision","pointer.scroll",Value:4),new InterfaceCommand(Guid.NewGuid(),"precision","pointer.key"),new InterfaceCommand(Guid.NewGuid(),"precision","pointer.move",X:double.NaN)})Check(!RemoteHub.ValidManual(invalid),"Invalid pointer command accepted");
        Console.WriteLine("PASS: TLS touch routing, bounded relative motion/click/drag, exclusive drag ownership, source/target pause, disconnect/idle release, readiness and strict command validation");
    }
}
