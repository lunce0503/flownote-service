using SoundManager.Core;

namespace Flownote.Remote.Core;

// Settings preview only: no device capture, output, server or remote command execution.
public sealed class SoundController
{
    public Mixer Mixer { get; } = new();
    public void Apply(RemoteSettings settings)
    {
        settings.Validate();
        Mixer.Settings = MixSettings.Preset(settings.EqPreset, settings.MasterVolume);
    }
}
