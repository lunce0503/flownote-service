using System.Net;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Flownote.Remote.Core;
using Flownote.Remote.Network;
using Flownote.Remote.Windows;

internal static class TouchPointerChecks
{
    [StructLayout(LayoutKind.Sequential)] private struct Point { public int X,Y; }
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    public static async Task RunAsync()
    {
        static void Check(bool ok,string why){if(!ok)throw new InvalidOperationException(why);}
        static async Task Until(Func<bool> ok){for(int i=0;i<120;i++){if(ok())return;await Task.Delay(30);}throw new TimeoutException("Native mouse result missing");}
        GetCursorPos(out var original);
        var button=new Button {Content="Native touch target",MinWidth=280,MinHeight=200};int clicks=0,right=0,scroll=0;
        button.Click+=(_,_)=>clicks++;button.PreviewMouseRightButtonUp+=(_,_)=>right++;button.PreviewMouseWheel+=(_,_)=>scroll++;
        var window=new Window {Title="Touch mouse acceptance",Content=button,Width=400,Height=320,WindowStartupLocation=WindowStartupLocation.CenterScreen,Topmost=true};
        using var pointer=new NativePointer {Allowed=true};
        try
        {
            window.Show();window.Activate();await Task.Delay(200);var center=button.PointToScreen(new System.Windows.Point(140,100));SetCursorPos((int)center.X,(int)center.Y);
            using var cert=Protocol.CreateCertificate(IPAddress.Loopback);await using var hub=new RemoteHub(RemoteSettings.Defaults());await hub.StartAsync(IPAddress.Loopback,0,cert);
            var outputGrant=hub.RegisterLocal("Native Windows");var sourceGrant=hub.RegisterLocal("Phone touch");
            await using var output=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Windows",PointerReady:pointer.Allowed),c=>window.Dispatcher.InvokeAsync(()=>pointer.Apply(c)).Task);
            await using var source=new RemoteClient(c=>Task.FromResult(new OutputResult(true,c.Volume,c.Muted)),()=>new(.5f,false,Platform:"Android"));
            await output.ConnectAsync(hub.Address,Protocol.Pin(cert),outputGrant);await source.ConnectAsync(hub.Address,Protocol.Pin(cert),sourceGrant);
            await Until(()=>hub.Snapshot().Devices.Any(d=>d.Id==outputGrant.DeviceId&&d.PointerReady));
            await source.ControlAsync(outputGrant.DeviceId,"pointer.click");await Until(()=>clicks==1);
            await source.ControlAsync(outputGrant.DeviceId,"pointer.right_click");await Until(()=>right==1);
            await source.ControlAsync(outputGrant.DeviceId,"pointer.scroll",1);await Until(()=>scroll==1);
            GetCursorPos(out var before);await source.ControlAsync(outputGrant.DeviceId,"pointer.move",x:12,y:8);
            await Until(()=>{GetCursorPos(out var after);return after.X>before.X&&after.Y>before.Y;});
            await source.ControlAsync(outputGrant.DeviceId,"pointer.down");await Until(()=>(GetAsyncKeyState(1)&0x8000)!=0);
            await source.ControlAsync(outputGrant.DeviceId,"pointer.move",x:10);await source.ControlAsync(outputGrant.DeviceId,"pointer.up");await Until(()=>(GetAsyncKeyState(1)&0x8000)==0);
            await source.ControlAsync(outputGrant.DeviceId,"pointer.down");await Until(()=>(GetAsyncKeyState(1)&0x8000)!=0);
            pointer.Allowed=false;await Until(()=>(GetAsyncKeyState(1)&0x8000)==0);
            pointer.Allowed=true;Check(pointer.Apply(new(Guid.NewGuid(),"precision","pointer.down")).Applied,"Native down failed");
            await Until(()=>(GetAsyncKeyState(1)&0x8000)==0); // local watchdog without server help
            Console.WriteLine("PASS: authenticated phone commands invoke real Windows SendInput cursor movement/click/right-click/wheel/drag, local disable and independent lost-drag watchdog");
        }
        finally {pointer.Release();window.Close();SetCursorPos(original.X,original.Y);}
    }
}
