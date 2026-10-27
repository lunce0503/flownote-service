using System.IO;
using System.Net;
using System.Speech.Synthesis;
using System.Windows;
using Flownote.Remote.Core;
using Flownote.Remote.Network;
using Flownote.Remote.Windows;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        var app = new Application(); var vision = new VisionHost();
        var window = new Window { Title = "Remote network and vision acceptance", Width = 640, Height = 420, Content = vision.View };
        window.Loaded += async (_, _) =>
        {
            try { await RunAsync(vision, args.Length > 0 ? args[0] : "artifacts/tests/thumb_up.jpg"); vision.Dispose(); app.Shutdown(0); }
            catch (Exception error) { Console.Error.WriteLine(error); vision.Dispose(); app.Shutdown(1); }
        };
        app.Run(window);
    }
    private static void Check(bool value, string name) { if (!value) throw new InvalidOperationException(name); }
    private static async Task RunAsync(VisionHost vision, string imagePath)
    {
        await TouchPointerChecks.RunAsync();
        string invitation = new PairingLink("https://192.168.1.10:17843/", new string('A', 64), "123456", DateTimeOffset.UtcNow.ToUnixTimeSeconds() + 120).Encode();
        Check(QrCode.Decode(QrCode.Render(invitation)) == invitation, "Displayed connection QR could not be decoded");
        Console.WriteLine("PASS: actual displayed QR pixels round-trip through the QR decoder");
        await vision.InitializeAsync(); await vision.LoadModelAsync();
        byte[] image = await File.ReadAllBytesAsync(imagePath); Protocol.ValidateJpeg(image);
        var skeleton=await vision.ExtractSkeletonAsync(image);
        Check(skeleton.Hands.Length==1&&skeleton.Hands[0].Points.Length==21,"Real WebView hand skeleton missing");
        // Exercise the trusted WebView message path without needing physical runner hardware.
        var allowed=typeof(VisionHost).GetField("cameraAllowed",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic)!;
        allowed.SetValue(vision,true);int acceptedFrames=0,rejectedFrames=0;
        vision.SkeletonFrame+=_=>acceptedFrames++;
        vision.Activity+=message=>{if(message.Contains("landmark_out_of_range",StringComparison.Ordinal))rejectedFrames++;};
        var invalid=TestSkeletons.Frame(TestSkeletons.Pose("crossed"));invalid.Pose[32]=new Joint(.5,2.33,0,.03);
        async Task PostFrame(SkeletonFrame frame)=>await vision.View.CoreWebView2.ExecuteScriptAsync("window.chrome.webview.postMessage("+
            System.Text.Json.JsonSerializer.Serialize(new{type="camera.skeleton",frame},Protocol.Json)+")");
        await PostFrame(invalid);
        for(int i=0;i<40&&rejectedFrames==0;i++)await Task.Delay(50);
        Check(rejectedFrames==1&&acceptedFrames==0&&(bool)allowed.GetValue(vision)!,"Invalid WebView frame stopped capture or reached transport");
        await PostFrame(skeleton);
        for(int i=0;i<40&&acceptedFrames==0;i++)await Task.Delay(50);
        Check(acceptedFrames==1,"WebView did not recover after dropping an invalid frame");allowed.SetValue(vision,false);
        Console.WriteLine("PASS: WebView invalid frame dropped with safe reason; camera consent and subsequent valid frame preserved");
        var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;
        using var cert=Protocol.CreateCertificate(IPAddress.Loopback);
        await using var hub=new RemoteHub(settings);
        await hub.StartAsync(IPAddress.Loopback,0,cert);
        var grant=await RemoteClient.PairAsync(hub.Address,Protocol.Pin(cert),hub.PairingCode,"Camera acceptance client");
        float volume=.4f;int commands=0,spokenAlerts=0;bool muted=false;
        var viewport=new InterfaceViewport();
        await using var client=new RemoteClient(command=>{volume=command.Volume;muted=command.Muted;commands++;return Task.FromResult(new OutputResult(true,volume,muted));},()=>new(volume,muted),command=>{
            viewport.Apply(command.Action,command.Value,command.X,command.Y);return Task.FromResult(new InterfaceResult(true,viewport.Zoom,viewport.X,viewport.Y));});
        client.Alert+=alert=>{if(alert.Speak)Interlocked.Increment(ref spokenAlerts);};
        await client.ConnectAsync(hub.Address,Protocol.Pin(cert),grant);await Task.Delay(250);
        Check(client.State?.Capabilities is {SkeletonFrames:true,CameraFrames:false},"Skeleton-only capability missing");
        await client.SendSkeletonAsync(skeleton);Check(commands==0,"Legacy thumb unexpectedly executed action");
        await client.StopCameraAsync();
        for(int i=1;i<=6;i++){await client.SendSkeletonAsync(TestSkeletons.Frame(TestSkeletons.Pose("crossed"),sequence:i));await Task.Delay(150);}
        Check(commands==0&&!muted,"Gesture command escaped suspension");
        await client.CommandAsync(grant.DeviceId,"mute");
        for(int i=0;i<30&&!muted;i++)await Task.Delay(100);
        Check(commands==1&&muted,"Manual output acknowledgement failed");
        await client.ControlAsync(grant.DeviceId,"interface.zoom_set",1.5);
        for(int i=0;i<30&&viewport.Zoom!=1.5;i++)await Task.Delay(100);
        Check(viewport.Zoom==1.5,"Exact interface control failed");
        await hub.AnnounceAsync("test.server.warning", "critical", "서버 상태를 확인하세요.", "Please check the server status.");
        for (int i = 0; i < 30 && spokenAlerts == 0; i++) await Task.Delay(50);
        Check(spokenAlerts > 0, "Server critical notice did not reach the voice client");
        using var speech = new SpeechSynthesizer(); using var wave = new MemoryStream();
        speech.SetOutputToWaveStream(wave); speech.Speak("Please check the server status.");
        Check(wave.Length > 1000, "OS assistant voice did not synthesize a WAV");
        Console.WriteLine("PASS: real local hand skeleton model, landmark-only TLS/WSS routing, gesture suspension/manual mute, exact interface command, critical alert and real OS speech synthesis");
    }
}
