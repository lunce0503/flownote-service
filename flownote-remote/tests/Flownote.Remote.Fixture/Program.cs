using System.Net;
using System.Runtime.InteropServices;
using System.Text.Json;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

if (Environment.GetEnvironmentVariable("CI") != "true") throw new InvalidOperationException("The device acceptance fixture runs only in disposable CI.");
string configFile=args.Length>0?args[0]:throw new ArgumentException("Ready file path required");
using var shutdown=new CancellationTokenSource();
using var registration=PosixSignalRegistration.Create(PosixSignal.SIGTERM,context=>{context.Cancel=true;shutdown.Cancel();});
Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;shutdown.Cancel();};
var settings=RemoteSettings.Defaults();settings.GesturesEnabled=true;settings.ConfidenceThreshold=.7;
using var cert=Protocol.CreateCertificate(IPAddress.Loopback,IPAddress.Parse("10.0.2.2"));
await using var hub=new RemoteHub(settings);
await hub.StartAsync(IPAddress.Loopback,Protocol.Port,cert);
var outputGrant=hub.RegisterLocal("Windows touch test output");
string touchFile="artifacts/tests/touch-events.json";
var touchEvents=new List<string>();
await using var touchOutput=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Windows",PointerReady:true),async c=>{
    touchEvents.Add(c.Action);await File.WriteAllTextAsync(touchFile,JsonSerializer.Serialize(touchEvents));return new InterfaceResult(true);
});
await touchOutput.ConnectAsync(hub.Address,Protocol.Pin(cert),outputGrant);
Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(configFile))!);
await File.WriteAllTextAsync(configFile,JsonSerializer.Serialize(new {address=$"https://10.0.2.2:{Protocol.Port}/",pin=Protocol.Pin(cert),code=hub.PairingCode,
 certificate=Convert.ToBase64String(cert.RawData),invitation=(hub.Invitation(Protocol.Pin(cert)) with {Address=$"https://10.0.2.2:{Protocol.Port}/"}).Encode()},Protocol.Json));
Console.WriteLine("READY: private TLS skeleton-only device fixture; no server vision worker");
try{await Task.Delay(Timeout.Infinite,shutdown.Token);}catch(OperationCanceledException){}
