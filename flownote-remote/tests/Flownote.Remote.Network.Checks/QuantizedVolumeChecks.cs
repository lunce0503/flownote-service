using System.Net;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

internal static class QuantizedVolumeChecks
{
    public static async Task RunAsync()
    {
        static void Check(bool ok,string message){if(!ok)throw new InvalidOperationException(message);}
        static async Task Until(Func<bool> ok){for(int i=0;i<100;i++){if(ok())return;await Task.Delay(30);}throw new TimeoutException("Quantized output acknowledgement missing");}
        var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;
        using var cert=Protocol.CreateCertificate(IPAddress.Loopback);
        await using var hub=new RemoteHub(settings);await hub.StartAsync(IPAddress.Loopback,0,cert);
        var grant=await RemoteClient.PairAsync(hub.Address,Protocol.Pin(cert),hub.PairingCode,"15 step output");
        int index=5,executions=0;OutputCommand? last=null;
        await using var client=new RemoteClient(c=>{
            int next=(int)Math.Round(c.Volume*15,MidpointRounding.AwayFromZero);
            if(c.StepIfUnchanged&&next==index&&Math.Abs(c.Volume-index/15f)>.0001)next=Math.Clamp(next+(c.Volume>index/15f?1:-1),0,15);
            index=next;last=c;executions++;return Task.FromResult(new OutputResult(true,index/15f,c.Muted));
        },()=>new(index/15f,false));
        await client.ConnectAsync(hub.Address,Protocol.Pin(cert),grant);
        await Until(()=>Math.Abs(hub.Snapshot().Devices[0].Volume-5/15f)<.001);
        for(int i=1;i<=3;i++)
        {await client.ControlAsync(grant.DeviceId,"audio.set",.33);int expected=i;await Until(()=>executions==expected);Check(index==5&&last?.StepIfUnchanged==false,"Repeating an exact volume drifted on discrete hardware");}
        long seq=0;
        for(int i=0;i<5;i++){await client.SendSkeletonAsync(TestSkeletons.Frame(hands:[TestSkeletons.Hand("pinch")],mode:"volume",sequence:++seq));await Task.Delay(100);}
        for(int i=1;i<=4;i++){await client.SendSkeletonAsync(TestSkeletons.Frame(hands:[TestSkeletons.Hand("pinch",y:-.02*i)],mode:"volume",sequence:++seq));await Task.Delay(160);}
        Check(executions==3&&index==5,"Suspended pinch changed quantized hardware volume");
        index=8;await Until(()=>Math.Abs(hub.Snapshot().Devices[0].Volume-8/15f)<.001);
        await client.ControlAsync(grant.DeviceId,"audio.set",.6);await Until(()=>executions==4);
        Check(index==9,"Manual input did not resync after physical hardware change");
        Console.WriteLine("PASS: exact volume repeat stability, suspended pinch and manual resync on a TLS session with a 15-step output adapter");
    }
}
