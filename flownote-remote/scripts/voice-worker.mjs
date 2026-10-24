// WebRTC media only. Authentication and call creation remain inside Codex CLI.
import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import readline from 'node:readline';
import {realpathSync} from 'node:fs';

export async function createVoicePeer(onEvent, offerer = true) {
  const browser = await chromium.launch({headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.request().url() === 'https://flownote-voice.local/'
      ? route.fulfill({body: '<!doctype html><title>Flownote voice media</title>', contentType: 'text/html'}) : route.abort());
    await page.exposeFunction('voiceEvent', onEvent);
    await page.goto('https://flownote-voice.local/');
    await page.evaluate(async offerer => {
      const workletSource = `
        class Microphone extends AudioWorkletProcessor {
          constructor() {
            super(); this.queue = []; this.offset = 0; this.buffered = 0;
            this.port.onmessage = event => {
              const pcm = new Int16Array(event.data);
              if (this.buffered + pcm.length > 48000) { this.port.postMessage({overflow:true}); return; }
              this.queue.push(pcm); this.buffered += pcm.length;
            };
          }
          process(inputs, outputs) {
            const out = outputs[0][0];
            for (let i=0; i<out.length; i++) {
              if (!this.queue.length) { out[i]=0; continue; }
              const first=this.queue[0]; out[i]=first[this.offset++]/32768; this.buffered--;
              if (this.offset===first.length) { this.queue.shift(); this.offset=0; }
            }
            return true;
          }
        }
        class Speaker extends AudioWorkletProcessor {
          constructor() { super(); this.chunk=new Int16Array(2400); this.offset=0; }
          process(inputs) {
            const input=inputs[0]?.[0]; if(!input) return true;
            for(const sample of input) {
              this.chunk[this.offset++]=Math.round(Math.max(-1,Math.min(1,sample))*32767);
              if(this.offset===this.chunk.length) {
                this.port.postMessage(this.chunk.buffer,[this.chunk.buffer]);
                this.chunk=new Int16Array(2400); this.offset=0;
              }
            }
            return true;
          }
        }
        registerProcessor('flownote-microphone',Microphone);
        registerProcessor('flownote-speaker',Speaker);
      `;
      const context = new AudioContext({sampleRate: 24000});
      const moduleUrl = URL.createObjectURL(new Blob([workletSource], {type: 'text/javascript'}));
      await context.audioWorklet.addModule(moduleUrl); URL.revokeObjectURL(moduleUrl);
      const microphone = new AudioWorkletNode(context, 'flownote-microphone', {numberOfInputs: 0, outputChannelCount: [1]});
      const destination = context.createMediaStreamDestination(); microphone.connect(destination);
      microphone.port.onmessage = () => window.voiceEvent({type: 'error', message: 'Microphone audio queue exceeded 2 seconds.'});
      const pc = new RTCPeerConnection();
      pc.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
      let channel, announced = false, stopping = false, disconnectTimer;
      function connected() {
        if (!announced && pc.connectionState === 'connected' && channel?.readyState === 'open') {
          announced = true; window.voiceEvent({type: 'connected'});
        }
      }
      function wireChannel(dc) {
        channel = dc;
        dc.onopen = connected;
        dc.onmessage = event => {
          if (typeof event.data !== 'string' || event.data.length > 65536) return;
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'error') window.voiceEvent({type: 'error', message: String(message.error?.message ?? 'Remote voice error').slice(0, 512)});
            if (message.type === 'input_audio_buffer.speech_started') window.voiceEvent({type: 'interrupt'});
          } catch { /* Ignore non-JSON/unknown data channel messages. */ }
        };
      }
      if (offerer) wireChannel(pc.createDataChannel('oai-events'));
      else pc.ondatachannel = event => wireChannel(event.channel);
      pc.onconnectionstatechange = () => {
        connected(); clearTimeout(disconnectTimer);
        if (!stopping && pc.connectionState === 'failed') window.voiceEvent({type: 'error', message: 'WebRTC media connection failed.'});
        if (!stopping && pc.connectionState === 'disconnected') disconnectTimer = setTimeout(() =>
          window.voiceEvent({type: 'error', message: 'WebRTC media connection disconnected.'}), 3000);
      };
      pc.ontrack = event => {
        const stream = new MediaStream([event.track]);
        // Chromium's WebRTC decoder needs an active media element as well as the
        // WebAudio consumer. Keep that element silent; PCM is played by the CLI.
        const element = document.createElement('audio'); element.autoplay = true; element.volume = 0;
        element.srcObject = stream; document.body.append(element);
        element.play().catch(() => window.voiceEvent({type: 'error', message: 'WebRTC audio decoder could not start.'}));
        const source = context.createMediaStreamSource(stream);
        const speaker = new AudioWorkletNode(context, 'flownote-speaker', {channelCount: 1, channelCountMode: 'explicit'});
        // Keep the graph clock running without playing through the browser's OS output.
        source.connect(speaker); speaker.connect(context.destination);
        speaker.port.onmessage = event => {
          const bytes = new Uint8Array(event.data);
          let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
          window.voiceEvent({type: 'audio', data: btoa(binary), sampleRate: 24000, numChannels: 1});
        };
      };
      await context.resume();
      window.voicePeer = {pc,
        push(data) {
          const binary = atob(data), bytes = new Uint8Array(binary.length);
          for (let i=0; i<binary.length; i++) bytes[i]=binary.charCodeAt(i);
          microphone.port.postMessage(bytes.buffer, [bytes.buffer]);
        },
        async close() { stopping=true; clearTimeout(disconnectTimer); pc.close(); await context.close(); }
      };
    }, offerer);
    return {browser, page,
      async description(type, remoteSdp) {
        return await page.evaluate(async ({type, remoteSdp}) => {
          const pc = window.voicePeer.pc;
          if (remoteSdp) await pc.setRemoteDescription({type: 'offer', sdp: remoteSdp});
          await pc.setLocalDescription(type === 'offer' ? await pc.createOffer() : await pc.createAnswer());
          if (pc.iceGatheringState !== 'complete') await Promise.race([
            new Promise(resolve => pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve(); })),
            new Promise((_, reject) => setTimeout(() => reject(Error('ICE gathering timed out.')), 10000))
          ]);
          return pc.localDescription.sdp;
        }, {type, remoteSdp});
      },
      async answer(sdp) { await page.evaluate(sdp => window.voicePeer.pc.setRemoteDescription({type: 'answer', sdp}), sdp); },
      async input(data) { await page.evaluate(data => window.voicePeer.push(data), data); },
      async close() { try { await page.evaluate(() => window.voicePeer.close()); } finally { await browser.close(); } }
    };
  } catch (error) { await browser.close(); throw error; }
}

async function main() {
  // Keep PCM output bounded even if the owning CLI stops reading the pipe.
  let blocked = false;
  const emit = message => {
    if (blocked) throw Error('Voice output pipe is blocked.');
    if (!process.stdout.write(JSON.stringify(message) + '\n')) {
      blocked = true; process.stdout.once('drain', () => { blocked = false; });
    }
  };
  const peer = await createVoicePeer(emit);
  try {
    emit({type: 'offer', sdp: await peer.description('offer')});
    for await (const line of readline.createInterface({input: process.stdin})) {
      if (line.length > 131072) throw Error('Voice input message exceeds limit.');
      const request = JSON.parse(line);
      if (request.type === 'answer' && typeof request.sdp === 'string' && request.sdp.length <= 65536) await peer.answer(request.sdp);
      else if (request.type === 'input' && typeof request.data === 'string' && request.data.length <= 12800) await peer.input(request.data);
      else throw Error('Invalid voice worker request.');
      emit({type: 'ack', id: request.id});
    }
  } finally { await peer.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({type: 'error', message: 'WebRTC worker failed. Check Node 24, Playwright Chromium and its OS dependencies.'}) + '\n');
    process.exitCode = 1;
  });
}
