namespace Flownote.Remote.Core;

// The controlled task pane only; never moves the OS pointer or unrelated applications.
public sealed class InterfaceViewport
{
    public double Zoom { get; private set; } = 1;
    public double X { get; private set; }
    public double Y { get; private set; }
    public void Apply(string action, double value = 0, double x = 0, double y = 0)
    {
        if (!double.IsFinite(value) || !double.IsFinite(x) || !double.IsFinite(y)) throw new ArgumentException();
        switch (action)
        {
            case "interface.zoom": Zoom = Math.Clamp(Zoom*Math.Clamp(value,.88,1.12),.5,2); break;
            case "interface.zoom_set": Zoom = Math.Clamp(value,.5,2); break;
            case "interface.pan": X = Math.Clamp(X+Math.Clamp(x,-.08,.08),-1,1); Y = Math.Clamp(Y+Math.Clamp(y,-.08,.08),-1,1); break;
            case "interface.pan_set": X = Math.Clamp(x,-1,1); Y = Math.Clamp(y,-1,1); break;
            case "interface.reset": Zoom = 1; X = Y = 0; break;
            case "interface.minimize" or "interface.restore" or "interface.details" or "task.focus": break;
            default: throw new ArgumentException("Unsupported interface operation.");
        }
    }
}
