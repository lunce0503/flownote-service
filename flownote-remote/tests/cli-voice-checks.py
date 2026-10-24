#!/usr/bin/env python3
"""Exercise the CLI process and PCM pipe; offline fixture, not a live voice test."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import pty

root = Path(__file__).resolve().parent.parent
executable = os.environ.get('FLOWNOTE_REMOTE_CLI')
command = [executable] if executable else ['dotnet', str(root / 'src/Flownote.Remote.Cli/bin/Release/net10.0/flownote-remote.dll')]
fixture = root / 'tests/fake-codex.py'
fixture.chmod(0o755)

with tempfile.TemporaryDirectory(prefix='flownote-voice-') as workspace:
    voice = command + ['voice', '--pcm-stdio', '--workspace', workspace, '--codex', str(fixture)]
    pcm = bytes(range(256)) * 80
    result = subprocess.run(voice, input=pcm, capture_output=True, timeout=20)
    assert result.returncode == 0, result.stderr.decode(errors='replace')
    assert result.stdout == pcm, f'PCM stream changed: expected {len(pcm)}, received {len(result.stdout)}'
    assert '오디오 확인' in result.stderr.decode(), 'Transcript missing from stderr'
    for mode in ('denied', 'remote-error', 'exit'):
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
    master, slave = pty.openpty()
    try:
        result = subprocess.run(command + ['voice', '--native', '--remote-tools', '--workspace', workspace,
                               '--codex', str(fixture)], stdin=slave, stdout=slave, stderr=subprocess.PIPE, timeout=15)
        assert result.returncode == 0, result.stderr
    finally:
        os.close(slave)
        os.close(master)
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
print('PASS: PCM input/output byte identity, stderr-only transcripts, unsafe request rejection, entitlement failure, remote failure/exit, odd PCM rejection and invalid CLI options')
print('PASS: remote error interrupts idle microphone pipe, native TTY adapter/MCP configuration and MCP admin-action rejection')
