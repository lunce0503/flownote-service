using System.Text.Json;
using Flownote.Remote.Core;

namespace Flownote.Remote.Network;

public sealed partial class RemoteHub
{
    private readonly Dictionary<Guid, RemoteTask> tasks = [];
    private readonly Dictionary<Guid, long> taskLeases = [];
    private Guid? selectedTask;
    public async Task UpsertTaskAsync(RemoteTask task)
    {
        if (task.Id == Guid.Empty || task.Name is null || task.Name.Length is < 1 or > 64 || task.Name.Any(char.IsControl) || task.Kind != "codex.voice")
            throw new ArgumentException("Invalid registered task.");
        lock (gate) { if (tasks.Count >= 32 && !tasks.ContainsKey(task.Id)) throw new InvalidOperationException("작업은 최대 32개입니다."); tasks[task.Id] = task; taskLeases[task.Id] = Environment.TickCount64; selectedTask ??= task.Id; }
        await BroadcastStateAsync(); Changed?.Invoke();
    }
    public async Task RemoveTaskAsync(Guid id)
    { lock (gate) { tasks.Remove(id); taskLeases.Remove(id); if (selectedTask == id) selectedTask = tasks.Keys.Cast<Guid?>().FirstOrDefault(); } await BroadcastStateAsync(); Changed?.Invoke(); }
    public async Task SelectTaskAsync(Guid id)
    { lock (gate) { if (!tasks.ContainsKey(id)) throw new ArgumentException("등록된 작업을 선택하세요."); selectedTask = id; } await BroadcastStateAsync(); Changed?.Invoke(); }

    private async Task SkeletonAsync(Peer peer, JsonElement message)
    {
        Guid id = Guid.Empty;
        SkeletonFrame frame;
        ScopedCommand? action = null;
        try
        {
            if (!message.TryGetProperty("frameId",out var frameId) || frameId.ValueKind != JsonValueKind.String || !frameId.TryGetGuid(out id) || id == Guid.Empty)
                throw new SkeletonFrameException("invalid_frame_id");
            if (System.Text.Encoding.UTF8.GetByteCount(message.GetRawText()) > 16384) throw new SkeletonFrameException("frame_too_large");
            if (message.EnumerateObject().Any(p => p.Name is not ("type" or "frameId" or "frame"))) throw new SkeletonFrameException("unexpected_fields");
            if (!message.TryGetProperty("frame",out var data)) throw new SkeletonFrameException("missing_frame");
            frame = data.Deserialize<SkeletonFrame>(Protocol.Json) ?? throw new SkeletonFrameException("invalid_frame");
            frame.Validate();
            lock (gate)
            {
                if (frame.Sequence <= peer.Sequence) throw new SkeletonFrameException("stale_sequence");
                peer.Sequence = frame.Sequence;
                if (Enabled(peer) && Environment.TickCount64-peer.LastFrame >= 60)
                { peer.LastFrame = Environment.TickCount64; peer.CameraActive = true; action = peer.Motion.Observe(settings, frame, peer.LastFrame); }
            }
        }
        catch (SkeletonFrameException error) { await RejectSkeletonAsync(peer,id,error.Code); return; }
        catch (JsonException) { await RejectSkeletonAsync(peer,id,"invalid_schema"); return; }
        await SendAsync(peer, new { type = "skeleton.result", frameId = id, accepted = true, errorCode = (string?)null,
            gesture = action?.Gesture ?? (frame.Hands.Length > 0 || frame.Pose.Length > 0 ? "Tracking" : "None"), scope = action?.Scope, confidence = 0 });
        if (action is not null) await ApplyGestureAsync(action);
        Changed?.Invoke();
    }
    private async Task RejectSkeletonAsync(Peer peer, Guid id, string reason)
    {
        string code = SkeletonDiagnostics.Normalize(reason); bool log; long count;
        lock (gate)
        {
            peer.Motion.Reset(); peer.Gate.Reset(); count = ++peer.RejectedFrames;
            log = count == 1 || Environment.TickCount64-peer.LastSkeletonLog >= 5000;
            if (log) peer.LastSkeletonLog = Environment.TickCount64;
        }
        if (log) Activity?.Invoke($"{peer.Grant.Name}: {SkeletonDiagnostics.Message(code)} · 누적 {count}개");
        await SendAsync(peer,new { type = "skeleton.result", frameId = id, accepted = false, errorCode = code, gesture = "Rejected", scope = (string?)null, confidence = 0 });
    }
    private async Task ApplyGestureAsync(ScopedCommand command)
    {
        Guid? target; lock (gate) target = gestureTarget;
        if (command.Scope == "all")
        {
            DeviceState[] clients = Snapshot().Devices.Where(d => d.Connected && d.Enabled).ToArray();
            foreach (var device in clients)
                if (command.Action == "audio.mute" && device.OutputReady) await ExecuteAsync(device.Id,"mute",Guid.NewGuid());
                else if (command.Action != "audio.mute" && device.InterfaceReady)
                    await RouteControlAsync(device.Id,new(Guid.NewGuid(),"all",command.Action));
            return;
        }
        if (command.Scope == "management")
        {
            Guid? chosen;
            lock (gate)
            {
                var ids = tasks.Keys.ToArray();
                if (ids.Length == 0) chosen = null;
                else
                {
                    int index = selectedTask is Guid current ? Array.IndexOf(ids,current) : 0;
                    if (command.Action == "task.next") index++;
                    if (command.Action == "task.previous") index--;
                    selectedTask = ids[(index%ids.Length+ids.Length)%ids.Length]; chosen = selectedTask;
                }
            }
            if (chosen is null) { await AnnounceAsync("tasks.empty","info","선택할 실행 작업이 없습니다.","No running task interface is registered."); return; }
            await BroadcastStateAsync(); Changed?.Invoke();
            if (target.HasValue) await RouteControlAsync(target.Value,new(Guid.NewGuid(),"management",command.Action == "interface.details" ? "interface.details" : "task.focus", TaskId: chosen));
            return;
        }
        if (!target.HasValue) return;
        if (command.Action == "audio.delta") await VolumeAsync(target.Value, command.Value, false, Guid.NewGuid());
        else await RouteControlAsync(target.Value,new(Guid.NewGuid(),"precision",command.Action,command.Value,command.X,command.Y));
    }
    public static bool ValidManual(InterfaceCommand c) => c.CommandId != Guid.Empty && c.Scope is "precision" && double.IsFinite(c.Value) && double.IsFinite(c.X) && double.IsFinite(c.Y) && c.Action switch
    {
        "audio.set" => c.Value is >= 0 and <= 1,
        "interface.zoom_set" => c.Value is >= .5 and <= 2,
        "interface.pan_set" => c.X is >= -1 and <= 1 && c.Y is >= -1 and <= 1,
        "interface.reset" => true,
        _ => false
    };
    public async Task RouteControlAsync(Guid target, InterfaceCommand command)
    {
        if (command.Action == "audio.set") { if (!ValidManual(command)) throw new ArgumentException(); await VolumeAsync(target,command.Value,true,command.CommandId); return; }
        command.Validate();
        Peer? peer;
        lock (gate)
        {
            if (!peers.TryGetValue(target,out peer) || !Enabled(peer) || !peer.InterfaceReady) return;
            if (peer.PendingControls.ContainsKey(command.CommandId)) return;
            foreach (var old in peer.PendingControls.Where(x => Environment.TickCount64-x.Value > 5000).Select(x => x.Key).ToArray()) peer.PendingControls.Remove(old);
            if (peer.PendingControls.Count >= 32) throw new InvalidOperationException("화면 응답을 기다리고 있습니다.");
            peer.PendingControls.Add(command.CommandId,Environment.TickCount64);
        }
        await SendAsync(peer,new { type = "interface.set", command });
    }
    private async Task VolumeAsync(Guid target, double value, bool absolute, Guid commandId)
    {
        Peer? peer; float volume; bool muted;
        lock (gate)
        {
            if (!peers.TryGetValue(target,out peer) || !Enabled(peer) || !peer.OutputReady || peer.PendingOutputs.Count >= 128) return;
            if (!peer.PendingOutputs.Add(commandId)) return;
            peer.FineVolume = Math.Clamp(absolute ? value : (peer.FineVolume ?? peer.DesiredVolume ?? peer.Volume)+value,0,1);
            volume = (float)peer.FineVolume.Value; muted = peer.Muted;
            peer.DesiredVolume = volume; peer.DesiredMuted = muted;
        }
        await SendAsync(peer,new { type = "output.set", command = new OutputCommand(commandId,volume,muted,StepIfUnchanged:false) });
    }
}
