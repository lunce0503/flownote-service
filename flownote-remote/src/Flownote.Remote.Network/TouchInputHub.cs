namespace Flownote.Remote.Network;

public sealed partial class RemoteHub
{
    private sealed record PointerLease(Peer Source, long Seen);
    private readonly Dictionary<Guid, PointerLease> pointerLeases = [];
    private readonly SemaphoreSlim pointerWriter = new(1);

    private async Task RoutePointerAsync(Peer source, Guid target, InterfaceCommand command)
    {
        await pointerWriter.WaitAsync(stop.Token);
        try
        {
            string? error = null;
            lock (gate)
            {
                long now = Environment.TickCount64;
                if (!Enabled(source)) error = "source_paused";
                else if (!peers.TryGetValue(target, out var output) || !Enabled(output) || !output.PointerReady) error = "pointer_unavailable";
                else if (command.Action != "pointer.up" && output.PendingControls.Count >= 30) error = "input_backpressure";
                else if (pointerLeases.TryGetValue(target, out var lease) && !ReferenceEquals(lease.Source, source)) error = "pointer_busy";
                else
                {
                    if (now - source.PointerWindow >= 1000) { source.PointerWindow = now; source.PointerCount = 0; }
                    if (command.Action != "pointer.up" && ++source.PointerCount > 60) error = "input_rate_limited";
                    else if (!source.Commands.Add(command.CommandId)) error = "duplicate_input";
                    else
                    {
                        source.CommandOrder.Enqueue(command.CommandId);
                        if (source.CommandOrder.Count > 128) source.Commands.Remove(source.CommandOrder.Dequeue());
                        bool down = pointerLeases.ContainsKey(target);
                        if (command.Action == "pointer.down" && down || command.Action == "pointer.hold" && !down) error = "invalid_pointer_state";
                        else if (command.Action is "pointer.click" or "pointer.right_click" && down) error = "invalid_pointer_state";
                        else if (command.Action == "pointer.up") pointerLeases.Remove(target);
                        else if (command.Action == "pointer.down" || down) pointerLeases[target] = new(source, now);
                    }
                }
            }
            if (error is null) await RouteControlAsync(target, command);
            await SendAsync(source, new { type = "pointer.result", commandId = command.CommandId, accepted = error is null, error });
        }
        finally { pointerWriter.Release(); }
    }

    private async Task SweepPointersAsync(Peer? disconnected = null)
    {
        await pointerWriter.WaitAsync(stop.Token);
        try
        {
            Guid[] expired;
            lock (gate) expired = pointerLeases.Where(p => ReferenceEquals(p.Value.Source, disconnected) ||
                !peers.TryGetValue(p.Value.Source.Grant.Id, out var source) || !ReferenceEquals(source, p.Value.Source) || !Enabled(source) ||
                !peers.TryGetValue(p.Key, out var output) || !Enabled(output) || !output.PointerReady ||
                Environment.TickCount64 - p.Value.Seen > 1500).Select(p => p.Key).ToArray();
            foreach (var id in expired)
            {
                Peer? output;
                lock (gate) { pointerLeases.Remove(id); peers.TryGetValue(id, out output); }
                if (output is not null)
                    try { await SendAsync(output, new { type = "interface.set", command = new InterfaceCommand(Guid.NewGuid(), "precision", "pointer.up") }); }
                    catch (Exception e) when (e is System.Net.WebSockets.WebSocketException or OperationCanceledException) { }
            }
        }
        finally { pointerWriter.Release(); }
    }
}
