namespace Flownote.Remote.Network;

// Fixed reason codes only: never put payloads, coordinates or exception messages in logs.
public static class SkeletonDiagnostics
{
    public static string Normalize(string? code) => code is "invalid_frame" or "invalid_hand" or "non_finite_landmark" or
        "landmark_out_of_range" or "invalid_visibility" or "frame_too_large" or "unexpected_fields" or
        "invalid_frame_id" or "missing_frame" or "invalid_schema" or "stale_sequence" ? code : "invalid_frame";
    public static string Message(string? code) => $"골격 프레임 제외 [{Normalize(code)}] · 연결 유지";
}
