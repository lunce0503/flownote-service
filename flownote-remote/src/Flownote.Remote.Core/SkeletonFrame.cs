using System.Text.Json.Serialization;

namespace Flownote.Remote.Core;

public sealed class SkeletonFrameException(string code) : ArgumentException("Invalid skeleton frame.")
{
    public string Code { get; } = code;
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record Joint(double X, double Y, double Z = 0, double Visibility = 1);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record HandSkeleton(string Side, Joint[] Points);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SkeletonFrame(int SchemaVersion, long Sequence, int Width, int Height, string Facing,
    double DetectionThreshold, Joint[] Pose, HandSkeleton[] Hands, string PrecisionMode = "off")
{
    public void Validate()
    {
        if (SchemaVersion != 1 || Sequence < 1 || Width is < 1 or > 1920 || Height is < 1 or > 1920 ||
            Facing is not ("front" or "back" or "external") || !double.IsFinite(DetectionThreshold) || DetectionThreshold is < .5 or > 1 ||
            PrecisionMode is not ("off" or "volume" or "zoom" or "move") || Pose is null || Hands is null ||
            Pose.Length is not (0 or 33) || Hands.Length > 2) throw new SkeletonFrameException("invalid_frame");
        var sides = new HashSet<string>();
        foreach (var hand in Hands)
            if (hand is null || hand.Side is not ("Left" or "Right") || !sides.Add(hand.Side) || hand.Points is null || hand.Points.Length != 21)
                throw new SkeletonFrameException("invalid_hand");
        foreach (var p in Pose.Concat(Hands.SelectMany(h => h.Points)))
        {
            if (p is null || !double.IsFinite(p.X) || !double.IsFinite(p.Y) || !double.IsFinite(p.Z) || !double.IsFinite(p.Visibility))
                throw new SkeletonFrameException("non_finite_landmark");
            if (p.X is < -1 or > 2 || p.Y is < -1 or > 2 || p.Z is < -5 or > 5)
                throw new SkeletonFrameException("landmark_out_of_range");
            if (p.Visibility is < 0 or > 1) throw new SkeletonFrameException("invalid_visibility");
        }
    }
}

public sealed record ScopedCommand(string Scope, string Gesture, string Action, double Value = 0, double X = 0, double Y = 0);
public sealed record GestureDefinition(string Scope, string Id, string Name, string Motion, string Action);
public static class GestureCatalog
{
    public static readonly GestureDefinition[] All = Read();
    private static GestureDefinition[] Read()
    {
        using var stream = typeof(GestureCatalog).Assembly.GetManifestResourceStream("scoped-gestures.json")!;
        return System.Text.Json.JsonSerializer.Deserialize<GestureDefinition[]>(stream,new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
    }
}
