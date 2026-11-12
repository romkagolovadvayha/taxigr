import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('Run iOS UI review on the EAS macOS builder');
const output = path.resolve('artifacts/ios-native-qa');
fs.mkdirSync(output, { recursive: true });
const sim = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', timeout: args[0] === 'bootstatus' ? 600_000 : 180_000 });
const requiredRuntime = process.env.TAXIGR_IOS_QA_RUNTIME;
const runtimes = JSON.parse(sim('list', 'runtimes', '--json')).runtimes
  .filter(r => r.isAvailable && r.identifier.includes('.iOS-') && (!requiredRuntime || r.version === requiredRuntime))
  .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
if (!runtimes.length) throw new Error('No available iOS runtime');
const devicesByRuntime = JSON.parse(sim('list', 'devices', 'available', '--json')).devices;
const types = JSON.parse(sim('list', 'devicetypes', '--json')).devicetypes;
const products = path.resolve('ios/build/Build/Products');
const apps = process.env.TAXIGR_IOS_QA_APP_PATH ? [process.env.TAXIGR_IOS_QA_APP_PATH]
  : fs.readdirSync(products).filter(n => n.endsWith('simulator'))
    .flatMap(n => fs.readdirSync(path.join(products, n)).filter(a => a.endsWith('.app')).map(a => path.join(products, n, a)));
if (apps.length !== 1) throw new Error(`Expected one simulator app, found ${apps.length}`);
const results = [];
const onlyDevice = process.env.TAXIGR_IOS_QA_DEVICE;
if (onlyDevice && !['iphone', 'ipad'].includes(onlyDevice)) throw new Error('Invalid iOS QA device filter');
fs.writeFileSync(path.join(output, 'simulator-candidates.json'), JSON.stringify({ runtimes, types }, null, 2));
for (const [kind, matches] of [
  ['iphone', name => /iPhone.*Pro Max/.test(name)],
  ['ipad', name => /iPad.*Pro.*13/.test(name)],
]) {
  if (onlyDevice && kind !== onlyDevice) continue;
  let device, runtime;
  const candidates = types.filter(d => matches(d.name))
    .sort((a,b) => b.name.localeCompare(a.name, undefined, {numeric:true}));
  for (const candidateRuntime of runtimes) {
    device = (devicesByRuntime[candidateRuntime.identifier] ?? []).filter(d => matches(d.name))
      .sort((a,b) => b.name.localeCompare(a.name, undefined, {numeric:true}))[0];
    if (!device) {
      for (const type of candidates) {
        try {
          device = { name: type.name, udid: sim('create', `TaxiGR review ${kind}`, type.identifier, candidateRuntime.identifier).trim() };
          break;
        } catch (error) {
          if (!/Incompatible device/.test(String(error.stderr ?? error.message))) throw error;
          console.log(`Skipping ${type.name}: unsupported by iOS ${candidateRuntime.version}`);
        }
      }
    }
    if (device) { runtime = candidateRuntime; break; }
  }
  if (!device || !runtime) throw new Error(`No compatible ${kind} device and runtime on builder`);
  const dir = path.join(output, kind);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Testing ${device.name} on iOS ${runtime.version}`);
  if (device.state !== 'Booted') sim('boot', device.udid);
  try {
    sim('bootstatus', device.udid, '-b');
    sim('install', device.udid, apps[0]);
    sim('status_bar', device.udid, 'override', '--time', '09:41', '--batteryState', 'charged', '--batteryLevel', '100', '--wifiBars', '3', '--cellularBars', '4');
    const test = spawnSync('maestro', ['--device', device.udid, 'test', '--test-output-dir', dir,
      '--format', 'junit', '--output', path.join(dir, 'junit.xml'), '.maestro/ios-review.yaml'], {
      stdio: 'inherit', timeout: 360_000, env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_DRIVER_STARTUP_TIMEOUT: '180000' },
    });
    results.push({ kind, device: device.name, runtime: runtime.version, status: test.status, passed: test.status === 0 });
    fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(results, null, 2));
    if (test.status === 0) sim('io', device.udid, 'screenshot', path.join(dir, 'store-home.png'));
  } finally { sim('shutdown', device.udid); }
}
if (results.some(result => !result.passed)) throw new Error('iOS UI review failed; inspect both device receipts');
