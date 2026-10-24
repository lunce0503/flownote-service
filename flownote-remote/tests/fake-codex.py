#!/usr/bin/env python3
"""Offline protocol fixture. Never used by production; no account or network access."""
import base64
import json
import os
import pathlib
import sys
import time

if '--no-daemon' in sys.argv:
    assert '--enable' in sys.argv and 'in_app_voice' in sys.argv
    assert '--sandbox' in sys.argv and 'read-only' in sys.argv
    assert any(x.startswith('mcp_servers.flownote_remote.command=') for x in sys.argv)
    args = json.loads(next(x.split('=', 1)[1] for x in sys.argv if x.startswith('mcp_servers.flownote_remote.args=')))
    assert 'mcp' in args and '--data-dir' in args
    print('native adapter ready', flush=True)
    sys.exit(0)

if 'generate-json-schema' in sys.argv:
    root = pathlib.Path(sys.argv[sys.argv.index('--out') + 1])
    (root / 'v2').mkdir(parents=True)
    (root / 'ClientRequest.json').write_text(json.dumps({'methods': [
        'account/read', 'thread/realtime/start', 'thread/realtime/stop']}))
    (root / 'v2/ThreadRealtimeStartParams.json').write_text(json.dumps({'properties': {'outputModality': {}, 'webrtc': {}}}))
    (root / 'v2/ThreadRealtimeSdpNotification.json').write_text('{}')
    sys.exit(0)
if 'login' in sys.argv:
    sys.exit(0)

thread = '00000000-0000-0000-0000-000000000042'
mode = os.environ.get('FLOWNOTE_VOICE_FIXTURE', 'echo')
def send(message):
    print(json.dumps(message), flush=True)
def notify(method, **data):
    send({'method': method, 'params': {'threadId': thread, **data}})

for line in sys.stdin:
    req = json.loads(line)
    if 'method' not in req:  # Client's rejection of a prohibited request.
        assert 'error' in req, 'Unexpected server request was approved'
        continue
    method = req['method']
    if 'id' not in req:
        continue
    result = {}
    assert 'OPENAI_API_KEY' not in os.environ and 'CODEX_API_KEY' not in os.environ, 'API key inherited by voice process'
    if method == 'account/read':
        result = {'account': None if mode == 'signed-out' else {'type': 'apiKey' if mode == 'api-key' else 'chatgpt'}}
    elif method in ('thread/start', 'thread/resume'):
        assert req['params']['sandbox'] == 'read-only'
        assert req['params']['approvalPolicy'] == 'never'
        result = {'thread': {'id': thread}}
    elif method == 'thread/realtime/start':
        assert req['params']['outputModality'] == 'audio'
        assert req['params']['transport'] == {'type': 'webrtc', 'sdp': 'fixture-webrtc-offer'}
        if mode == 'denied':
            send({'id': req['id'], 'error': {'code': -32000, 'message': 'Voice entitlement unavailable (fixture)'}})
            continue
        notify('thread/realtime/started', version='v3')
        notify('thread/realtime/sdp', sdp='fixture-webrtc-answer')
        notify('thread/realtime/item/completed', item={'type': 'transcriptSegment', 'role': 'assistant', 'text': '오디오 확인'})
        notify('thread/realtime/transcript/done', role='assistant', text='오디오 확인')
        if mode == 'remote-error':
            notify('thread/realtime/error', message='Voice backend disconnected (fixture)')
        if mode == 'delayed-error':
            send({'id': req['id'], 'result': result})
            time.sleep(0.5)
            notify('thread/realtime/error', message='Delayed voice failure (fixture)')
            continue
        if mode == 'exit':
            sys.exit(9)
        send({'id': 'danger', 'method': 'item/commandExecution/requestApproval', 'params': {'threadId': thread}})
    elif method == 'thread/realtime/appendAudio':
        raise AssertionError('Account voice must use WebRTC media, not API-key WebSocket audio')
    elif method == 'thread/realtime/stop':
        notify('thread/realtime/closed', reason='requested')
    send({'id': req['id'], 'result': result})
