import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';

/**
 * The network's name for the top capsule: the Wi-Fi's name (from `networksetup`), "Ethernet" on a cable, or null.
 * Recent macOS versions keep the Wi-Fi's name private unless the app has Location access; then the capsule says
 * "Connected".
 */
export function networkName(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(null);
    execFile('/usr/sbin/networksetup', ['-getairportnetwork', 'en0'], { timeout: 5000 }, (err, stdout) => {
      const ssid = !err && /Current Wi-Fi Network:\s*(.+?)\s*$/m.exec(stdout)?.[1];
      if (ssid) return resolve(ssid.slice(0, 40));
      const ifaces = networkInterfaces();
      const up = (name: string): boolean => !!ifaces[name]?.some((a) => !a.internal && a.family === 'IPv4');
      // en0 is the built-in Wi-Fi on most Macs; another enN with an address is a cable or an adapter.
      const wired = Object.keys(ifaces).some((n) => /^en[1-9]/.test(n) && up(n));
      resolve(wired && !up('en0') ? 'Ethernet' : null);
    });
  });
}
