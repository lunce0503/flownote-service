using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

internal static class SkeletonRecoveryChecks
{
    public static async Task RunAsync(string? modelFixture = null)
    {
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
        static async Task Until(Func<bool> ok){for(int i=0;i<100;i++){if(ok())return;await Task.Delay(30);}throw new TimeoutException("Recovery acknowledgement missing");}
        var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;
        using var cert=Protocol.CreateCertificate(IPAddress.Loopback);
        await using var hub=new RemoteHub(settings);var logs=new ConcurrentQueue<string>();hub.Activity+=logs.Enqueue;
        await hub.StartAsync(IPAddress.Loopback,0,cert);string pin=Protocol.Pin(cert);
        var outputGrant=await RemoteClient.PairAsync(hub.Address,pin,hub.PairingCode,"Output");
        int executions=0;float volume=.4f;bool muted=false;
        await using var output=new RemoteClient(c=>{volume=c.Volume;muted=c.Muted;Interlocked.Increment(ref executions);return Task.FromResult(new OutputResult(true,volume,muted));},()=>new(volume,muted));
        await output.ConnectAsync(hub.Address,pin,outputGrant);await Until(()=>hub.Snapshot().Devices.Any(d=>d.Id==outputGrant.DeviceId&&Math.Abs(d.Volume-.4)<.001));
        hub.SelectTargets(outputGrant.DeviceId,null);
        var cameraGrant=hub.RegisterLocal("Android camera");
        using var socket=new ClientWebSocket();socket.Options.SetRequestHeader("Authorization","Bearer "+cameraGrant.Token);
        socket.Options.RemoteCertificateValidationCallback=(_,c,_,e)=>Protocol.Trust(c,pin,e);
        await socket.ConnectAsync(new UriBuilder(hub.Address){Scheme="wss",Path="/v1/session"}.Uri,CancellationToken.None);
        async Task<JsonElement> Read(string type,Guid? frameId=null)
        {
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(4));byte[] buffer=new byte[262144];
            while(true)
            {
                int count=0;WebSocketReceiveResult result;
                do{
                    result=await socket.ReceiveAsync(new ArraySegment<byte>(buffer,count,buffer.Length-count),timeout.Token);
                    Check(result.MessageType==WebSocketMessageType.Text,"A bad skeleton closed the authenticated session");count+=result.Count;
                }while(!result.EndOfMessage);
                using var doc=JsonDocument.Parse(buffer.AsMemory(0,count));var value=doc.RootElement;
                if(value.GetProperty("type").GetString()==type&&(!frameId.HasValue||value.GetProperty("frameId").GetGuid()==frameId))return value.Clone();
            }
        }
        async Task Send(object message)=>await socket.SendAsync(JsonSerializer.SerializeToUtf8Bytes(message,Protocol.Json),WebSocketMessageType.Text,true,CancellationToken.None);
        await Read("welcome");
        await Send(new{type="heartbeat",health=new{volume=0,muted=false,outputReady=false,platform="Android"}});
        long sequence=0;
        JsonObject Frame()=>JsonSerializer.SerializeToNode(TestSkeletons.Frame(TestSkeletons.Pose("crossed"),sequence:++sequence),Protocol.Json)!.AsObject();
        async Task<JsonElement> FrameAck(JsonObject frame,string? error=null)
        {
            Guid id=Guid.NewGuid();await Send(new{type="skeleton.frame",frameId=id,frame});var ack=await Read("skeleton.result",id);
            if(error is null)Check(!ack.TryGetProperty("accepted",out var accepted)||accepted.GetBoolean(),"Valid recovery frame rejected");
            else Check(!ack.GetProperty("accepted").GetBoolean()&&ack.GetProperty("errorCode").GetString()==error,"Wrong frame rejection reason: "+error);
            Check(socket.State==WebSocketState.Open&&output.Connected,"Frame rejection disconnected a client");return ack;
        }
        await FrameAck(Frame());await Task.Delay(250);
        var invalid=Frame();invalid["pose"]![32]!["y"]=2.33;invalid["pose"]![32]!["visibility"]=.03;
        if(modelFixture is not null){invalid=JsonNode.Parse(await File.ReadAllTextAsync(modelFixture))!.AsObject();invalid["sequence"]=sequence;}
        await FrameAck(invalid,"landmark_out_of_range");
        await Task.Delay(250);await FrameAck(Frame());
        Check(executions==0,"The invalid frame did not reset the held gesture");
        for(int i=0;i<4;i++){await Task.Delay(110);await FrameAck(Frame());}
        await Until(()=>executions==1&&muted);
        // Invalid input never executes commands and cannot poison the accepted sequence.
        var badVersion=Frame();badVersion["schemaVersion"]=2;await FrameAck(badVersion,"invalid_frame");
        var badHands=Frame();badHands["hands"]=new JsonArray(new JsonObject{["side"]="Right",["points"]=new JsonArray()});await FrameAck(badHands,"invalid_hand");
        var badVisibility=Frame();badVisibility["pose"]![0]!["visibility"]=2;await FrameAck(badVisibility,"invalid_visibility");
        var unknown=Frame();unknown["private_payload_marker"]="must-not-be-logged";await FrameAck(unknown,"invalid_schema");
        var oversized=Frame();oversized["padding"]=new string('x',17000);await FrameAck(oversized,"frame_too_large");
        Guid extraId=Guid.NewGuid();await Send(new{type="skeleton.frame",frameId=extraId,frame=Frame(),jpeg="private_payload_marker"});
        Check((await Read("skeleton.result",extraId)).GetProperty("errorCode").GetString()=="unexpected_fields","Original image field was accepted");
        Guid missingId=Guid.NewGuid();await Send(new{type="skeleton.frame",frameId=missingId});Check((await Read("skeleton.result",missingId)).GetProperty("errorCode").GetString()=="missing_frame","Missing frame reason");
        await Send(new{type="skeleton.frame",frameId="private_payload_marker",frame=Frame()});Check((await Read("skeleton.result",Guid.Empty)).GetProperty("errorCode").GetString()=="invalid_frame_id","Bad correlation reason");
        var futureInvalid=Frame();futureInvalid["sequence"]=long.MaxValue;futureInvalid["pose"]![0]!["y"]=3;
        await FrameAck(futureInvalid,"landmark_out_of_range");
        var accepted=Frame();await FrameAck(accepted);await FrameAck(accepted,"stale_sequence");
        await FrameAck(Frame());Check(executions==1,"Rejected/replayed frames executed an action");
        long seen=hub.Snapshot().Devices.Single(d=>d.Id==cameraGrant.DeviceId).LastSeenMs;await Task.Delay(20);
        await Send(new{type="heartbeat",health=new{volume=0,muted=false,outputReady=false,platform="Android"}});
        await Until(()=>hub.Snapshot().Devices.Single(d=>d.Id==cameraGrant.DeviceId).LastSeenMs>seen);
        await Send(new{type="command",commandId=Guid.NewGuid(),targetId=outputGrant.DeviceId,action="volume_up"});
        await Until(()=>executions==2&&volume>.4f);
        var diagnostics=logs.Where(l=>l.Contains("골격 프레임 제외",StringComparison.Ordinal)).ToArray();
        Check(diagnostics.Length==1&&diagnostics[0].Contains("landmark_out_of_range",StringComparison.Ordinal),"Missing or unbounded rejection logs");
        Check(!logs.Any(l=>l.Contains("private_payload_marker",StringComparison.Ordinal)||l.Contains(cameraGrant.Token,StringComparison.Ordinal)||l.Contains("2.33",StringComparison.Ordinal)),"Logs exposed skeleton values or credentials");
        Console.WriteLine("PASS: real TLS camera session rejects an invisible y=2.33 foot, resets gesture hold, keeps heartbeat/manual control, recovers tracking/gesture, rejects schema/size/replay and rate-limits safe diagnostics");
    }
}
