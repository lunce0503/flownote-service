using System.Runtime.InteropServices;
using Flownote.Remote.Network;

namespace Flownote.Remote.Windows;

/// <summary>Bounded mouse input; a lost drag lease releases the button locally.</summary>
public sealed class NativePointer : IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Input { public uint Type; public MouseInput Mouse; }
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, Input[] inputs, int size);
    private readonly object gate = new();
    private readonly Timer watchdog;
    private bool allowed, down;
    private long seen;
    public NativePointer() => watchdog = new(_ => { lock (gate) if (down && Environment.TickCount64 - seen > 1500) ReleaseCore(); }, null, 250, 250);
    public bool Allowed { get { lock (gate) return allowed; } set { lock (gate) { allowed = value; if (!value) ReleaseCore(); } } }
    public void Release() { lock (gate) ReleaseCore(); }
    private bool Inject(params MouseInput[] actions) => SendInput((uint)actions.Length, actions.Select(a => new Input { Mouse = a }).ToArray(), Marshal.SizeOf<Input>()) == actions.Length;
    private void ReleaseCore() { if (down && Inject(new MouseInput() { Flags = 0x0004 })) down = false; }
    public InterfaceResult Apply(InterfaceCommand command)
    {
        command.Validate();
        lock (gate)
        {
            if (command.Action == "pointer.up") { ReleaseCore(); return new(!down, Error: down ? "pointer_release_failed" : null); }
            if (!allowed) return new(false, Error: "pointer_unavailable");
            bool ok;
            switch (command.Action)
            {
                case "pointer.move": ok = Inject(new MouseInput() { X = (int)Math.Round(command.X), Y = (int)Math.Round(command.Y), Flags = 0x0001 }); break;
                case "pointer.down": ok = !down && Inject(new MouseInput() { Flags = 0x0002 }); if (ok) down = true; break;
                case "pointer.hold": ok = down; break;
                case "pointer.click":
                case "pointer.right_click":
                    if (down) return new(false, Error: "invalid_pointer_state");
                    uint press = command.Action == "pointer.click" ? 0x0002u : 0x0008u;
                    ok = Inject(new MouseInput() { Flags = press }, new MouseInput() { Flags = press * 2 });
                    if (!ok) Inject(new MouseInput() { Flags = press * 2 });
                    break;
                case "pointer.scroll": ok = Inject(new MouseInput() { Data = unchecked((uint)(int)Math.Round(command.Value * 120)), Flags = 0x0800 }); break;
                default: return new(false, Error: "unsupported_pointer_command");
            }
            if (ok) seen = Environment.TickCount64;
            return new(ok, Error: ok ? null : "pointer_input_failed");
        }
    }
    public void Dispose() { lock (gate) { allowed = false; ReleaseCore(); } watchdog.Dispose(); }
}
