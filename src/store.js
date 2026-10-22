// -----------------------------------------------------------------------------
// The MAC addresses already met on the network, kept in /data (the only
// writable path of the container) so that "new device on the network" never
// fires again after a restart for a device already seen.
//
// File: { "version": 2, "macs": ["aa:bb:cc:dd:ee:ff", ...], "firstSeen":
// { "aa:bb:cc:dd:ee:ff": 1760000000000 } }. An absent file means a first start:
// the first reading is a baseline, nothing fires. The baseline has no date:
// only the addresses met after it are new, for the "new devices" widget. A
// version 1 file (no dates) reads as a list of old addresses.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/known-hosts.json';
// A network never holds that many devices; past it, the oldest are forgotten.
const MAX_MACS = 10000;
// The "new devices" widget looks back this far; older dates are dropped.
const NEW_HOST_WINDOW_MS = 7 * 24 * 3600 * 1000;

/**
 * @description Create the store of the known MAC addresses.
 * @param {object} [options] - Options.
 * @param {string} [options.path] - The JSON file.
 * @param {object} options.logger - Logger.
 * @returns {object} The store.
 * @example
 * const known = createKnownHosts({ logger });
 * await known.load();
 */
function createKnownHosts({ path = DEFAULT_PATH, logger }) {
  let macs = new Set();
  let firstSeen = new Map();
  let initialized = false;
  let saving = Promise.resolve();

  return {
    /**
     * @description Read the file; a missing or broken file starts empty.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        const data = JSON.parse(await readFile(path, 'utf8'));
        macs = new Set(
          Array.isArray(data.macs) ? data.macs.filter((m) => typeof m === 'string') : [],
        );
        firstSeen = new Map(
          Object.entries(data.firstSeen ?? {}).filter(
            ([mac, at]) => macs.has(mac) && Number.isFinite(at),
          ),
        );
        initialized = true;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
        macs = new Set();
        firstSeen = new Map();
        initialized = false;
      }
    },
    /** @returns {boolean} Whether a list was ever saved (not a first start). */
    initialized: () => initialized,
    has: (mac) => macs.has(mac),
    size: () => macs.size,
    /**
     * @description The MAC addresses first met since a date, newest first.
     * @param {number} since - The date, in ms.
     * @returns {Array<{ mac: string, firstSeen: number }>} The addresses.
     */
    recent: (since) =>
      [...firstSeen]
        .filter(([, at]) => at >= since)
        .sort((a, b) => b[1] - a[1])
        .map(([mac, at]) => ({ mac, firstSeen: at })),
    /**
     * @description Remember MAC addresses and save the file when one is new.
     * @param {string[]} list - The MAC addresses.
     * @param {number} [at] - When they were met; none for the baseline.
     * @returns {Promise<void>}
     */
    async add(list, at) {
      const before = macs.size;
      list.forEach((mac) => {
        if (!macs.has(mac) && at !== undefined) {
          firstSeen.set(mac, at);
        }
        macs.add(mac);
      });
      if (macs.size === before && initialized) {
        return;
      }
      if (macs.size > MAX_MACS) {
        macs = new Set([...macs].slice(macs.size - MAX_MACS));
      }
      // Only the window is ever read: the file does not grow with the dates.
      const oldest = (at ?? 0) - NEW_HOST_WINDOW_MS;
      firstSeen = new Map([...firstSeen].filter(([mac, date]) => macs.has(mac) && date >= oldest));
      initialized = true;
      const content = JSON.stringify({
        version: 2,
        macs: [...macs],
        firstSeen: Object.fromEntries(firstSeen),
      });
      saving = saving.then(async () => {
        try {
          await mkdir(dirname(path), { recursive: true });
          await writeFile(`${path}.tmp`, content);
          await rename(`${path}.tmp`, path);
        } catch (err) {
          logger.warn(`Unable to write ${path}: ${err.message}`);
        }
      });
      await saving;
    },
    /** @description Forget everything (another firewall): the next reading is a baseline. */
    async clear() {
      macs = new Set();
      firstSeen = new Map();
      initialized = false;
      saving = saving.then(() => unlink(path).catch(() => {}));
      await saving;
    },
  };
}

export { createKnownHosts, DEFAULT_PATH, NEW_HOST_WINDOW_MS };
