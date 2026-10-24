using System.Security.Cryptography.X509Certificates;
using System.Net;
using System.Text.Json;
using Flownote.Remote.Network;
using Flownote.Remote.Core;

namespace Flownote.Remote.Cli;

public sealed class StateStore
{
    public static string DefaultDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "flownote-remote");
    public string DirectoryPath { get; }
    private const UnixFileMode PrivateFile = UnixFileMode.UserRead | UnixFileMode.UserWrite;
    private const UnixFileMode PrivateDirectory = PrivateFile | UnixFileMode.UserExecute;
    public StateStore(string directory)
    {
        if (!OperatingSystem.IsLinux()) throw new InvalidOperationException("The server and its owner socket currently require Linux.");
        DirectoryPath = Path.GetFullPath(directory);
        if (!Directory.Exists(DirectoryPath)) Directory.CreateDirectory(DirectoryPath, PrivateDirectory);
        VerifyPrivate(DirectoryPath, true);
    }
    public static void VerifyPrivate(string path, bool directory = false)
    {
        if (!OperatingSystem.IsLinux()) throw new InvalidOperationException("Private state requires Linux file permissions.");
        if (new FileInfo(path).LinkTarget is not null) throw new IOException("State paths cannot be symbolic links: " + path);
        if ((File.GetUnixFileMode(path) & ~(directory ? PrivateDirectory : PrivateFile)) != 0)
            throw new IOException("State permissions must be " + (directory ? "0700: " : "0600: ") + path);
    }
    private string FilePath(string name) => Path.Combine(DirectoryPath, name);
    public byte[]? Read(string name)
    {
        string path = FilePath(name);
        if (!File.Exists(path)) return null;
        VerifyPrivate(path); return File.ReadAllBytes(path);
    }
    public void Write(string name, byte[] data)
    {
        if (!OperatingSystem.IsLinux()) throw new InvalidOperationException();
        string path = FilePath(name), temp = FilePath(".write-" + Guid.NewGuid().ToString("N"));
        try
        {
            using (var output = new FileStream(temp, new FileStreamOptions { Mode = FileMode.CreateNew, Access = FileAccess.Write, UnixCreateMode = PrivateFile }))
            { output.Write(data); output.Flush(true); }
            File.Move(temp, path, true);
        }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    public X509Certificate2 Certificate(IPAddress address)
    {
        byte[]? bytes = Read("server.pfx");
        if (bytes is not null)
        {
            var cert = X509CertificateLoader.LoadPkcs12(bytes, null);
            if (!cert.HasPrivateKey || !cert.MatchesHostname(address.ToString()) || cert.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
            { cert.Dispose(); throw new InvalidOperationException("Stored identity does not match this address or expired. Use a new --data-dir and pair clients again."); }
            return cert;
        }
        var created = Protocol.CreateCertificate(address);
        Write("server.pfx", created.Export(X509ContentType.Pfx)); return created;
    }
    public DeviceGrant[] Grants() => Read("grants.json") is byte[] bytes ? JsonSerializer.Deserialize<DeviceGrant[]>(bytes, Protocol.Json) ?? [] : [];
    public void SaveGrants(IReadOnlyList<DeviceGrant> grants) => Write("grants.json", JsonSerializer.SerializeToUtf8Bytes(grants, Protocol.Json));
    public RemoteSettings Settings() => Read("settings.json") is byte[] bytes ? RemoteSettings.Parse(System.Text.Encoding.UTF8.GetString(bytes)) : RemoteSettings.Defaults();
    public void SaveSettings(RemoteSettings settings) => Write("settings.json", System.Text.Encoding.UTF8.GetBytes(settings.ToJson()));
}
