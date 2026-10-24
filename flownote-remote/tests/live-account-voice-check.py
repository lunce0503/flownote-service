#!/usr/bin/env python3
"""Opt-in real account check. No credentials/audio saved; not run in CI."""
import argparse
import math
import os
from pathlib import Path
import signal
import struct
import subprocess
import tempfile
import threading
import time

parser = argparse.ArgumentParser()
parser.add_argument('--run', action='store_true', help='Explicitly use the existing Codex login and voice allowance')
parser.add_argument('--executable', help='Exact extracted release executable; otherwise use the built source DLL')
args = parser.parse_args()
if not args.run:
    parser.error('Pass --run to use the existing signed-in account for this live voice check.')
root = Path(__file__).resolve().parent.parent
command = [args.executable] if args.executable else ['dotnet', str(root / 'src/Flownote.Remote.Cli/bin/Release/net10.0/flownote-remote.dll')]
voice_root = str(Path(args.executable).resolve().parent if args.executable else root)
with tempfile.TemporaryDirectory(prefix='flownote-live-voice-') as work:
    # Deliberately invalid markers verify that shell API keys cannot satisfy the check.
    env = {**os.environ, 'OPENAI_API_KEY': 'invalid-test-key-must-not-be-used', 'CODEX_API_KEY': 'invalid-test-key-must-not-be-used'}
    process = subprocess.Popen(command + ['voice', '--pcm-stdio', '--voice-root', voice_root, '--workspace', work,
                               '--message', '음성 연결 확인이라고 한국어로 짧게 한 번만 말해줘.'],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, start_new_session=True)
    connected = threading.Event()
    failed = threading.Event()
    transcript = threading.Event()
    counts = {'bytes': 0, 'peakRms': 0.0, 'nonSilentChunks': 0}
    errors = []

    def status():
        for raw in process.stderr:
            line = raw.decode(errors='replace').strip()
            if line.startswith('Using the account'):
                print('Account-managed WebRTC selected; API-key markers ignored', flush=True)
            elif line.startswith('Voice connected'):
                connected.set()
                print('Codex account session and WebRTC media connected', flush=True)
            elif line.startswith('[assistant]'):
                transcript.set()  # Do not print/persist the conversation text.
            elif line.startswith('ERROR:'):
                errors.append(line)
                failed.set()

    def audio():
        while True:
            chunk = process.stdout.read(4800)
            if not chunk:
                return
            counts['bytes'] += len(chunk)
            samples = struct.unpack('<' + 'h' * (len(chunk)//2), chunk)
            rms = math.sqrt(sum((value/32768)**2 for value in samples) / len(samples))
            counts['peakRms'] = max(counts['peakRms'], rms)
            if rms > .02:
                counts['nonSilentChunks'] += 1

    def input_silence():
        connected.wait(50)
        while process.poll() is None and not failed.is_set():
            try:
                process.stdin.write(bytes(2400))
                process.stdin.flush()
            except (BrokenPipeError, ValueError):
                return
            time.sleep(.05)

    threads = [threading.Thread(target=target, daemon=True) for target in (status, audio, input_silence)]
    for thread in threads:
        thread.start()
    try:
        deadline = time.monotonic() + 70
        first_voice = None
        while time.monotonic() < deadline and process.poll() is None and not failed.is_set():
            if counts['nonSilentChunks'] >= 3:
                first_voice = first_voice or time.monotonic()
                if transcript.is_set() or time.monotonic() - first_voice > 3:
                    break
            time.sleep(.1)
    finally:
        if process.poll() is None:
            process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        for thread in threads:
            thread.join(timeout=2)
    print('Live voice result:', {'exit': process.returncode, 'connected': connected.is_set(), **counts,
                                'assistantTranscript': transcript.is_set(), 'errors': errors}, flush=True)
    assert process.returncode == 0 and connected.is_set() and counts['nonSilentChunks'] >= 3 and not errors
