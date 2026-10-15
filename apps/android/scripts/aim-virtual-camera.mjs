import grpc from '../../host/node_modules/@grpc/grpc-js/build/src/index.js';
import loader from '../../host/node_modules/@grpc/proto-loader/build/src/index.js';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const definition = loader.loadSync(fileURLToPath(new URL('./emulator-camera.proto', import.meta.url)), { enums: String });
const proto = grpc.loadPackageDefinition(definition);
const client = new proto.android.emulation.control.EmulatorController('127.0.0.1:8554', grpc.credentials.createInsecure());
const set = (target, data) => new Promise((resolve, reject) => {
  client.setPhysicalModel({ target, value: { data } }, { deadline: Date.now() + 10_000 }, error => error ? reject(error) : resolve());
});
try {
  // Back away and rise above the table so the wall QR is not clipped/occluded.
  await set('POSITION', [-2.717, 1.320, 0.879]);
  await set('ROTATION', [-15, -150, 0]);
  console.log('Virtual camera aimed at the enrollment QR wall poster.');
  if (process.argv.includes('--watch')) {
    const run = promisify(execFile);
    const visible = async () => {
      const { stdout } = await run('adb', ['shell', 'dumpsys', 'activity', 'activities'], { timeout: 5000 });
      return /mResumedActivity:.*kr\.flownote\.remote\/\.QrCaptureActivity/.test(stdout);
    };
    const deadline = Date.now() + 180_000;
    while (!await visible()) {
      if (Date.now() > deadline) throw new Error('QR scanner did not open');
      await new Promise(resolve => setTimeout(resolve, 750));
    }
    // Small changes simulate aiming a phone; the real camera/decoder returns the result.
    for (const pitch of [-15, 0, 15]) {
      for (const yaw of [-150, -160, -140]) {
        if (!await visible()) { console.log('QR scanner returned to the application.'); process.exitCode = 0; break; }
        await set('ROTATION', [pitch, yaw, 0]);
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
      if (!await visible()) break;
    }
    if (await visible()) await set('ROTATION', [-15, -150, 0]);
  }
} finally { client.close(); }
