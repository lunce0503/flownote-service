using System.Net;
using System.Net.WebSockets;
using System.Text.Json;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

internal static class ScopedNetworkChecks
{
    public static async Task RunAsync()
    {
        static void Check(bool ok,string message) { if(!ok)throw new InvalidOperationException(message); }
        static async Task Until(Func<bool> ok) { for(int i=0;i<100;i++){if(ok())return;await Task.Delay(30);}throw new TimeoutException("Scoped protocol result missing"); }
        Check(JsonSerializer.Deserialize<HubCapabilities>("{\"cameraFrames\":true}",Protocol.Json)?.SkeletonFrames==false,"Old server must not imply skeleton support");
        var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;settings.HoldMs=100;settings.CooldownMs=300;
        using var cert=Protocol.CreateCertificate(IPAddress.Loopback);
        await using var hub=new RemoteHub(settings);
        await hub.StartAsync(IPAddress.Loopback,0,cert);string pin=Protocol.Pin(cert);
        var grant1=await RemoteClient.PairAsync(hub.Address,pin,hub.PairingCode,"First interface");
        var grant2=await RemoteClient.PairAsync(hub.Address,pin,hub.PairingCode,"Second interface");
        var first=new List<InterfaceCommand>();var second=new List<InterfaceCommand>();
        var viewport1=new InterfaceViewport();var viewport2=new InterfaceViewport();
        int outputs1=0,outputs2=0;float volume2=.4f;
        Task<InterfaceResult> Apply(InterfaceCommand c,List<InterfaceCommand> list,InterfaceViewport v)
        {lock(list)list.Add(c);v.Apply(c.Action,c.Value,c.X,c.Y);return Task.FromResult(new InterfaceResult(true,v.Zoom,v.X,v.Y));}
        await using var a=new RemoteClient(c=>{outputs1++;return Task.FromResult(new OutputResult(true,c.Volume,c.Muted));},()=>new(.4f,false),c=>Apply(c,first,viewport1));
        await using var b=new RemoteClient(c=>{outputs2++;volume2=c.Volume;return Task.FromResult(new OutputResult(true,c.Volume,c.Muted));},()=>new(volume2,false),c=>Apply(c,second,viewport2));
        await a.ConnectAsync(hub.Address,pin,grant1);await b.ConnectAsync(hub.Address,pin,grant2);
        await Until(()=>hub.Snapshot().Devices.All(d=>d.InterfaceReady));hub.SelectTargets(grant2.DeviceId,null);
        Check(a.State?.Capabilities is{SkeletonFrames:true,CameraFrames:false},"Skeleton-only negotiation");
        long seq=0;
        async Task Feed(SkeletonFrame frame,int count=4)
        {for(int i=0;i<count;i++){await a.SendSkeletonAsync(frame with{Sequence=++seq});await Task.Delay(100);}}
        await Feed(TestSkeletons.Frame(TestSkeletons.Pose("wide")));
        await Until(()=>first.Count==1&&second.Count==1);
        Check(first[0].Scope=="all"&&second[0].Action=="interface.minimize","Global scope fanout");
        await Feed(TestSkeletons.Frame(TestSkeletons.Pose("wide")),5);
        Check(first.Count==1&&second.Count==1,"Held global repeated over wire");
        var task1=new RemoteTask(Guid.NewGuid(),"Voice one");var task2=new RemoteTask(Guid.NewGuid(),"Voice two");
        await hub.UpsertTaskAsync(task1);await hub.UpsertTaskAsync(task2);
        await Feed(TestSkeletons.Frame(hands:[TestSkeletons.Hand()]));
        await Feed(TestSkeletons.Frame(hands:[TestSkeletons.Hand("fist")]),1);
        await Until(()=>second.Any(c=>c.Action=="task.focus"));
        Check(first.Count==1&&second.Last().TaskId==task1.Id,"Management target isolation");
        await a.SelectTaskAsync(task2.Id);await Until(()=>hub.Snapshot().SelectedTask==task2.Id);
        await hub.RemoveTaskAsync(task2.Id);await Until(()=>a.State?.SelectedTask==task1.Id);
        await a.ControlAsync(grant2.DeviceId,"interface.zoom_set",1.75);await Until(()=>hub.Snapshot().Devices.Single(d=>d.Id==grant2.DeviceId).Zoom==1.75);
        Check(viewport1.Zoom==1&&viewport2.Zoom==1.75,"Keyboard precise target routing");
        await a.ControlAsync(grant2.DeviceId,"audio.set",.33);await Until(()=>Math.Abs(volume2-.33f)<.001);
        Check(outputs1==0&&outputs2==1,"Exact volume isolation");
        int countBefore=second.Count;var duplicate=new InterfaceCommand(Guid.NewGuid(),"precision","interface.pan",X:.04);
        await hub.RouteControlAsync(grant2.DeviceId,duplicate);await Until(()=>second.Count==countBefore+1);
        await hub.RouteControlAsync(grant2.DeviceId,duplicate);await Task.Delay(100);
        Check(second.Count==countBefore+1&&Math.Abs(viewport2.X-.04)<.001,"Client interface deduplication");
        await b.SetEnabledAsync(false);await Until(()=>!hub.Snapshot().Devices.Single(d=>d.Id==grant2.DeviceId).Enabled);
        await a.ControlAsync(grant2.DeviceId,"interface.zoom_set",1);await Task.Delay(100);Check(viewport2.Zoom==1.75,"Paused target moved");
        await a.SetEnabledAsync(false);await Until(()=>!a.Enabled);
        await a.ControlAsync(grant1.DeviceId,"interface.zoom_set",2);await Task.Delay(100);Check(viewport1.Zoom==1,"Paused source controlled");
        await a.SetEnabledAsync(true);await Until(()=>a.Enabled);
        try{await a.SendCameraAsync([255,216,255,217]);throw new Exception("Legacy image sender accepted");}catch(InvalidOperationException){}
        // Exercise actual server rejection, independently of client-side validators.
        async Task Reject(object message)
        {
            var grant=hub.RegisterLocal("Malformed skeleton");
            using var socket=new ClientWebSocket();socket.Options.SetRequestHeader("Authorization","Bearer "+grant.Token);
            socket.Options.RemoteCertificateValidationCallback=(_,c,_,e)=>Protocol.Trust(c,pin,e);
            await socket.ConnectAsync(new UriBuilder(hub.Address){Scheme="wss",Path="/v1/session"}.Uri,CancellationToken.None);
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(3));
            byte[] buffer=new byte[262144];await socket.ReceiveAsync(buffer,timeout.Token); // welcome
            await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(message,Protocol.Json),WebSocketMessageType.Text,true,timeout.Token);
            bool rejected=false;
            try{while(true){var r=await socket.ReceiveAsync(buffer,timeout.Token);if(r.MessageType==WebSocketMessageType.Close){rejected=true;break;}}}
            catch(WebSocketException){rejected=true;}
            Check(rejected,"Malformed message was not rejected");hub.Revoke(grant.DeviceId);
        }
        await Reject(new{type="camera.frame",jpeg="/9j/2Q=="});
        await Reject(new{type="skeleton.frame",frameId=Guid.NewGuid(),frame=TestSkeletons.Frame(),jpeg="forbidden"});
        await Reject(new{type="skeleton.frame",frameId=Guid.NewGuid(),frame=TestSkeletons.Frame() with{SchemaVersion=2}});
        await Reject(new{type="control",targetId=grant1.DeviceId,command=new InterfaceCommand(Guid.NewGuid(),"all","interface.minimize")});
        // Replayed sequence must close this camera session instead of repeating commands.
        try{await a.SendSkeletonAsync(TestSkeletons.Frame(sequence:seq));}catch(OperationCanceledException){}
        await Until(()=>!a.Connected);
        Console.WriteLine("PASS: skeleton-only TLS negotiation, global fanout, selected-task routing, keyboard values, actual acknowledgements, deduplication, pause guards and image/schema/replay rejection");
    }
}
