import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../../app/src/main/assets/terminal/terminal.js', import.meta.url), 'utf8');

function page() {
  const messages = [], writes = [], painted = [], listeners = {};
  let terminal;
  class Terminal {
    constructor(options) { terminal = this; this.options = options; this.cols = 80; this.rows = 24; this.parser = { registerOscHandler: (code, handler) => { this.osc = [code, handler]; } }; }
    loadAddon() {}
    open() {}
    focus() {}
    onData(fn) { this.input = fn; }
    onResize(fn) { this.resize = fn; }
    attachCustomKeyEventHandler(fn) { this.key = fn; }
    write(data, done) { writes.push(() => { painted.push(data); done(); }); }
    reset() { painted.length = 0; }
    paste(data) { this.input(data); }
  }
  const window = {
    NativeTerminal: { postMessage: value => messages.push(JSON.parse(value)) },
    addEventListener: (type, callback) => { listeners[type] = callback; },
  };
  vm.runInNewContext(script, {
    window, Terminal, FitAddon: { FitAddon: class { fit() {} } },
    document: { getElementById: () => ({}), addEventListener: (type, fn) => { listeners[type] = fn; } },
    ResizeObserver: class { observe() {} }, setTimeout, clearTimeout,
  });
  return { messages, painted, terminal,
    deliver: (value, origin = 'https://appassets.androidplatform.net') => listeners.message({ data: JSON.stringify(value), origin }),
    flush: () => { while (writes.length) writes.shift()(); },
  };
}

test('output is literal terminal data, acknowledged after rendering, with no duplicate writes', () => {
  const p = page();
  const data = '<script>alert(1)</script>한글\x1b[32mOK';
  p.deliver({ type: 'output', seq: 1, data });
  p.deliver({ type: 'output', seq: 1, data });
  assert.equal(p.messages.filter(m => m.type === 'ack').length, 0);
  p.flush();
  assert.deepEqual(p.painted, [data]);
  assert.equal(p.messages.at(-1).seq, 1);
  p.deliver({ type: 'output', seq: 1, data });
  p.flush();
  assert.deepEqual(p.painted, [data]);
});

test('new session resets after pending output and ignores stale acknowledgements', () => {
  const p = page();
  p.deliver({ type: 'output', seq: 9, data: 'old' });
  p.deliver({ type: 'reset' });
  p.deliver({ type: 'output', seq: 1, data: 'new' });
  p.flush();
  assert.deepEqual(p.painted, ['new']);
  assert.deepEqual(p.messages.filter(m => m.type === 'ack'), [{ type: 'ack', seq: 1 }]);
});

test('input requires connection; modifiers are one-shot and paste uses terminal input', () => {
  const p = page();
  assert.equal(p.terminal.options.disableStdin, true);
  p.terminal.input('lost');
  assert.equal(p.messages.filter(m => m.type === 'input').length, 0);
  p.deliver({ type: 'enabled', value: true });
  p.deliver({ type: 'modifier', key: 'ctrl' }); p.terminal.input('c');
  p.deliver({ type: 'modifier', key: 'alt' }); p.terminal.input('x');
  p.deliver({ type: 'paste', data: '한글' });
  assert.deepEqual(p.messages.filter(m => m.type === 'input').map(m => m.data), ['\x03', '\x1bx', '한글']);
  p.deliver({ type: 'enabled', value: false }); p.terminal.input('lost again');
  assert.equal(p.messages.filter(m => m.type === 'input').length, 3);
});

test('foreign origins cannot write and OSC52 is consumed without clipboard access', () => {
  const p = page();
  p.deliver({ type: 'output', seq: 1, data: 'injected' }, 'https://untrusted.example');
  p.flush();
  assert.deepEqual(p.painted, []);
  assert.equal(p.terminal.osc[0], 52);
  assert.equal(p.terminal.osc[1](), true);
  assert.equal(p.terminal.key({ ctrlKey: true, key: 'v', type: 'keydown' }), false);
  assert.equal(p.messages.at(-1).type, 'paste');
});
