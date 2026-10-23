using System.IO;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

internal sealed record SavedConnection(string Address, string Pin, PairResult Grant);
internal sealed record SavedCertificate(string Address, string Pfx);
internal static class PrivateStore
{
    private static readonly object Writer = new();
    private static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Flownote", "Remote", "network");
    public static T? Load<T>(string name)
    {
        string file = Path.Combine(Root, name + ".bin");
        if (!File.Exists(file)) return default;
        byte[] data = ProtectedData.Unprotect(File.ReadAllBytes(file), null, DataProtectionScope.CurrentUser);
        return JsonSerializer.Deserialize<T>(data, Protocol.Json);
    }
    public static void Save<T>(string name, T value)
    {
        lock (Writer) {
        Directory.CreateDirectory(Root); string file = Path.Combine(Root, name + ".bin");
        byte[] data = ProtectedData.Protect(JsonSerializer.SerializeToUtf8Bytes(value, Protocol.Json), null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(file + ".tmp", data); File.Move(file + ".tmp", file, true);
        }
    }
    public static X509Certificate2 Certificate(string address)
    {
        var previous = Load<SavedCertificate>("certificate");
        if (previous?.Address == address)
        {
            var cert = X509CertificateLoader.LoadPkcs12(Convert.FromBase64String(previous.Pfx), null,
                X509KeyStorageFlags.Exportable);
            if (DateTime.UtcNow < cert.NotAfter.ToUniversalTime()) return cert;
            cert.Dispose();
        }
        var certificate = Protocol.CreateCertificate(System.Net.IPAddress.Parse(address));
        Save("certificate", new SavedCertificate(address, Convert.ToBase64String(certificate.Export(X509ContentType.Pfx))));
        return certificate;
    }
}
