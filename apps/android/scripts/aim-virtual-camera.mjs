import grpc from '../../host/node_modules/@grpc/grpc-js/build/src/index.js';
import loader from '../../host/node_modules/@grpc/proto-loader/build/src/index.js';
import { fileURLToPath } from 'node:url';

const definition = loader.loadSync(fileURLToPath(new URL('./emulator-camera.proto', import.meta.url)), { enums: String });
const proto = grpc.loadPackageDefinition(definition);
const client = new proto.android.emulation.control.EmulatorController('127.0.0.1:8554', grpc.credentials.createInsecure());
const set = (target, data) => new Promise((resolve, reject) => {
  client.setPhysicalModel({ target, value: { data } }, { deadline: Date.now() + 10_000 }, error => error ? reject(error) : resolve());
});
try {
  // Toren1BD's wall poster center (-0.807, 0.320, 5.316), normal yaw -150.
  // Face it from 3.5m so the entire QR fits the scanner's central square.
  await set('POSITION', [-2.557, 0.320, 2.285]);
  await set('ROTATION', [0, -150, 0]);
  console.log('Virtual camera aimed at the enrollment QR wall poster.');
} finally { client.close(); }
