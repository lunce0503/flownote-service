#!/usr/bin/env python3
"""Exercise the CLI process and PCM pipe; offline fixture, not a live voice test."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import pty
import signal
import threading
import time
import fcntl
import termios
import array

root = Path(__file__).resolve().parent.parent
executable = os.environ.get('FLOWNOTE_REMOTE_CLI')
command = [executable] if executable else ['dotnet', str(root / 'src/Flownote.Remote.Cli/bin/Release/net10.0/flownote-remote.dll')]
fixture = root / 'tests/fake-codex.py'
fixture.chmod(0o755)
media_fixture = root / 'tests/fake-voice-worker.py'
media_fixture.chmod(0o755)
voice_root = str(Path(executable).parent if executable else root)

with tempfile.TemporaryDirectory(prefix='flownote-voice-') as workspace:
    voice = command + ['voice', '--pcm-stdio', '--workspace', workspace, '--codex', str(fixture),
                       '--node', str(media_fixture), '--voice-root', voice_root]
    pcm = bytes(range(256)) * 80
    result = subprocess.run(voice, input=pcm, capture_output=True, timeout=20,
                            env={**os.environ, 'OPENAI_API_KEY': 'invalid-test-key-must-not-be-used', 'CODEX_API_KEY': 'invalid-test-key-must-not-be-used'})
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    assert result.stdout == pcm, f'PCM stream changed: expected {len(pcm)}, received {len(result.stdout)}'
    assert '오디오 확인' in result.stderr.decode(), 'Transcript missing from stderr'
    assert result.stderr.decode().count('오디오 확인') == 1, 'Canonical/legacy transcripts duplicated'
    for mode in ('denied', 'remote-error', 'exit', 'api-key', 'signed-out'):
        env = {**os.environ, 'FLOWNOTE_VOICE_FIXTURE': mode}
        result = subprocess.run(voice, input=bytes(2400), capture_output=True, timeout=15, env=env)
        assert result.returncode != 0, f'{mode} was reported as success'
        assert result.stdout == b'', f'{mode} leaked status into audio output'
        assert b'ERROR:' in result.stderr and b'Unhandled exception' not in result.stderr, result.stderr
    result = subprocess.run(voice, input=b'\x01', capture_output=True, timeout=15)
    assert result.returncode != 0 and b'Truncated PCM16' in result.stderr, result.stderr
    for args in (['server', '--listen', '0.0.0.0'], ['server', '--listen', '8.8.8.8'], ['voice', '--unknown', 'x']):
        result = subprocess.run(command + args, capture_output=True, timeout=10)
        assert result.returncode != 0 and b'ERROR:' in result.stderr, result.stderr
    process = subprocess.Popen(voice, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               env={**os.environ, 'FLOWNOTE_VOICE_FIXTURE': 'delayed-error'})
    # Keep stdin open without audio: a remote error must still unblock capture.
    process.wait(timeout=10)
    assert process.returncode != 0 and b'Delayed voice failure' in process.stderr.read()
    process.stdin.close()
    stalled = subprocess.Popen(voice, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True, pipesize=4096)
    ready = threading.Event()
    def drain_status():
        for line in stalled.stderr:
            if b'Voice connected' in line:
                ready.set()
    threading.Thread(target=drain_status, daemon=True).start()
    def fill():
        try:
            stalled.stdin.write(bytes(200000))
            stalled.stdin.flush()
        except (BrokenPipeError, ValueError):
            pass
    threading.Thread(target=fill, daemon=True).start()
    try:
        assert ready.wait(12), 'Stalled-output fixture never connected'
        # Wait for a genuinely full pipe instead of assuming startup timing.
        capacity = fcntl.fcntl(stalled.stdout.fileno(), fcntl.F_GETPIPE_SZ)
        deadline = time.monotonic() + 8
        while True:
            waiting = array.array('i', [0])
            fcntl.ioctl(stalled.stdout.fileno(), termios.FIONREAD, waiting, True)
            if waiting[0] >= capacity - 2400:
                break
            assert time.monotonic() < deadline, 'Audio output never filled the pipe'
            time.sleep(.05)
        time.sleep(.2)
        stalled.send_signal(signal.SIGTERM)
        stalled.wait(timeout=6)
        assert stalled.returncode == 0, 'Blocked playback did not stop cleanly'
    finally:
        if stalled.poll() is None:
            os.killpg(stalled.pid, signal.SIGKILL)
            stalled.wait()
        stalled.stdin.close()
    master, slave = pty.openpty()
    try:
        result = subprocess.run(command + ['voice', '--native', '--remote-tools', '--workspace', workspace,
                               '--codex', str(fixture)], stdin=slave, stdout=slave, stderr=subprocess.PIPE, timeout=15)
        assert result.returncode == 0, result.stderr
    finally:
        os.close(slave)
        os.close(master)
    # Real owner socket: only a connected voice session appears in the task registry.
    import json
    state = str(Path(workspace) / 'server')
    server = subprocess.Popen(command + ['server', '--listen', '127.0.0.1', '--port', '0', '--data-dir', state],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    registered = None
    try:
        for attempt in range(100):
            status = subprocess.run(command + ['tasks', '--data-dir', state], capture_output=True, timeout=3)
            if status.returncode == 0:
                break
            time.sleep(.05)
        assert status.returncode == 0, 'Task registry server did not start'
        registered = subprocess.Popen(voice + ['--data-dir', state], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        for attempt in range(100):
            status = subprocess.run(command + ['tasks', '--data-dir', state], capture_output=True, timeout=3)
            tasks = json.loads(status.stdout)['tasks']
            if tasks:
                break
            assert registered.poll() is None, 'Voice exited before registering its task'
            time.sleep(.05)
        assert len(tasks) == 1 and tasks[0]['id'] == '00000000-0000-0000-0000-000000000042', tasks
        registered.stdin.close()
        registered.wait(timeout=10)
        assert registered.returncode == 0, registered.stderr.read()
        status = subprocess.run(command + ['tasks', '--data-dir', state], capture_output=True, timeout=3)
        assert json.loads(status.stdout)['tasks'] == [], 'Voice task survived session shutdown'
    finally:
        if registered is not None and registered.poll() is None:
            registered.kill(); registered.wait()
        server.terminate(); server.wait(timeout=10)
    requests = [
        {'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {'protocolVersion': '2024-11-05'}},
        {'jsonrpc': '2.0', 'id': 2, 'method': 'tools/list'},
        {'jsonrpc': '2.0', 'id': 3, 'method': 'tools/call', 'params': {'name': 'flownote_remote', 'arguments': {'action': 'revoke', 'deviceId': '00000000-0000-0000-0000-000000000001'}}},
    ]
    import json
    result = subprocess.run(command + ['mcp'], input=''.join(json.dumps(r)+'\n' for r in requests).encode(), capture_output=True, timeout=10)
    assert result.returncode == 0, result.stderr
    responses = [json.loads(line) for line in result.stdout.splitlines()]
    assert responses[1]['result']['tools'][0]['name'] == 'flownote_remote'
    assert responses[2]['result']['isError'] and 'Action denied' in responses[2]['result']['content'][0]['text']
print('PASS: Codex account/WebRTC path, API-key inheritance/fallback blocked, PCM pipes, transcripts, approvals, entitlement/remote failure/exit and malformed input')
print('PASS: remote error interrupts idle microphone pipe, native TTY adapter/MCP configuration and MCP admin-action rejection')

print('PASS: connected Codex voice registers/removes its actual thread through the private owner socket')
