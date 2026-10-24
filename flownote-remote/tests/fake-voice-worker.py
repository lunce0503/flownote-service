#!/usr/bin/env python3
"""Offline media pipe fixture; real Chromium/Opus is checked separately."""
import json
import sys
import os

assert 'OPENAI_API_KEY' not in os.environ and 'CODEX_API_KEY' not in os.environ

print(json.dumps({'type': 'offer', 'sdp': 'fixture-webrtc-offer'}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if request['type'] == 'answer':
        assert request['sdp'] == 'fixture-webrtc-answer'
        print(json.dumps({'type': 'connected'}), flush=True)
    elif request['type'] == 'input':
        print(json.dumps({'type': 'audio', 'sampleRate': 24000, 'numChannels': 1, 'data': request['data']}), flush=True)
    else:
        raise AssertionError('Unknown media request')
    print(json.dumps({'type': 'ack', 'id': request['id']}), flush=True)
