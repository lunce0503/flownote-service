using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using ZXing;
using ZXing.Common;
using ZXing.QrCode;

namespace Flownote.Remote.Windows;

public static class QrCode
{
    public static BitmapSource Render(string text, int size = 420)
    {
        var matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size,
            new Dictionary<EncodeHintType, object> { [EncodeHintType.MARGIN] = 4, [EncodeHintType.ERROR_CORRECTION] = ZXing.QrCode.Internal.ErrorCorrectionLevel.M });
        var pixels = new byte[size * size * 4];
        for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
        { int i = (y * size + x) * 4; pixels[i] = pixels[i + 1] = pixels[i + 2] = matrix[x, y] ? (byte)0 : (byte)255; pixels[i + 3] = 255; }
        var bitmap = BitmapSource.Create(size, size, 96, 96, PixelFormats.Bgra32, null, pixels, size * 4); bitmap.Freeze(); return bitmap;
    }
    public static string? Decode(BitmapSource source)
    {
        var image = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
        if (image.PixelWidth > 1024 || image.PixelHeight > 1024) return null;
        var pixels = new byte[image.PixelWidth * image.PixelHeight * 4]; image.CopyPixels(pixels, image.PixelWidth * 4, 0);
        var reader = new BarcodeReaderGeneric { Options = new DecodingOptions { TryHarder = true, PossibleFormats = [BarcodeFormat.QR_CODE] } };
        return reader.Decode(pixels, image.PixelWidth, image.PixelHeight, RGBLuminanceSource.BitmapFormat.BGRA32)?.Text;
    }
    public static string? Decode(byte[] jpeg)
    { using var stream = new MemoryStream(jpeg); return Decode(BitmapDecoder.Create(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad).Frames[0]); }
}
