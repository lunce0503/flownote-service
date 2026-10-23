using System.Net;
using Flownote.Remote.Core;
using Flownote.Remote.Network;

static void Check(bool condition, string name) { if (!condition) throw new InvalidOperationException(name); }
static async Task Until(Func<bool> condition)
{
    for (int i = 0; i < 100; i++) { if (condition()) return; await Task.Delay(30); }
    throw new InvalidOperationException("Timed out waiting for protocol result");
}
using var certificate = Protocol.CreateCertificate(IPAddress.Loopback);
using var restoredCertificate = System.Security.Cryptography.X509Certificates.X509CertificateLoader.LoadPkcs12(
    certificate.Export(System.Security.Cryptography.X509Certificates.X509ContentType.Pfx), null);
Check(restoredCertificate.HasPrivateKey && Protocol.Pin(restoredCertificate) == Protocol.Pin(certificate), "Server certificate cannot be exported for encrypted profile persistence");
var settings = RemoteSettings.Defaults(); settings.GesturesEnabled = true;
await using var hub = new RemoteHub(settings, _ => Task.FromResult(new GestureSample("Thumb_Up", 0.99)));
await hub.StartAsync(IPAddress.Loopback, 0, certificate);
string pin = Protocol.Pin(certificate);
try { await RemoteClient.PairAsync(hub.Address, new string('0', 64), hub.PairingCode, "bad pin"); throw new Exception("Untrusted certificate accepted"); }
catch (HttpRequestException) { }
string oneTimeCode = hub.PairingCode;
var grant = await RemoteClient.PairAsync(hub.Address, pin, oneTimeCode, "Test client");
try { await RemoteClient.PairAsync(hub.Address, pin, oneTimeCode, "replay"); throw new Exception("Pair code replay accepted"); }
catch (InvalidOperationException) { }
float volume = 0.4f; bool muted = false; int executions = 0, notices = 0;
await using var client = new RemoteClient(command => { volume = command.Volume; muted = command.Muted; executions++; return Task.FromResult(new OutputResult(true, volume, muted)); }, () => new(volume, muted, 10));
client.Alert += _ => Interlocked.Increment(ref notices);
await client.ConnectAsync(hub.Address, pin, grant);
await Until(() => hub.Snapshot().Devices.Any(d => d.BatteryPercent == 10));
await Until(() => notices > 0);
Guid id = Guid.NewGuid();
await client.CommandAsync(grant.DeviceId, "volume_up", id);
await Until(() => executions == 1);
await client.CommandAsync(grant.DeviceId, "volume_up", id);
await Task.Delay(100);
Check(executions == 1 && Math.Abs(volume - 0.45f) < 0.001, "Command deduplication or output result failed");
await client.CommandAsync(grant.DeviceId, "mute"); await Until(() => muted);
Check(hub.Snapshot().Devices.Length == 1, "Authenticated peer missing");
hub.Revoke(grant.DeviceId); await Until(() => !client.Connected);
await using (var revoked = new RemoteClient(_ => throw new Exception("Revoked device received an output command"), () => new(0, false)))
{
    try { await revoked.ConnectAsync(hub.Address, pin, grant); throw new Exception("Revoked credential reconnected"); }
    catch (System.Net.WebSockets.WebSocketException) { }
}
Check(!Protocol.IsPrivate(IPAddress.Parse("8.8.8.8")), "Public address accepted");
foreach (string uri in new[] { "http://127.0.0.1:17843", "https://user:pass@127.0.0.1:17843", "https://8.8.8.8", "https://127.0.0.1/path" })
{ try { Protocol.ServerUri(uri); throw new Exception("Unsafe address accepted"); } catch (ArgumentException) { } }
try { Protocol.ValidateJpeg(new byte[4]); throw new Exception("Invalid camera frame accepted"); } catch (ArgumentException) { }
Console.WriteLine("PASS: real HTTPS/WSS pairing, certificate pin rejection, one-time code, authenticated heartbeat, battery alert, command/output acknowledgement, deduplication and revocation");
