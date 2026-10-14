// -----------------------------------------------------------------------------
// The MAC addresses already met on the network, kept in /data (the only
// writable path of the container) so that "new device on the network" never
// fires again after a restart for a device already seen.
//
// File: { "version": 1, "macs": ["aa:bb:cc:dd:ee:ff", ...] }. An absent file
// means a first start: the first reading is a baseline, nothing fires.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_PATH = '/data/known-hosts.json';
// A network never holds that many devices; past it, the oldest are forgotten.
const MAX_MACS = 10000;

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
        initialized = true;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
        macs = new Set();
        initialized = false;
      }
    },
    /** @returns {boolean} Whether a list was ever saved (not a first start). */
    initialized: () => initialized,
    has: (mac) => macs.has(mac),
    size: () => macs.size,
    /**
     * @description Remember MAC addresses and save the file when one is new.
     * @param {string[]} list - The MAC addresses.
     * @returns {Promise<void>}
     */
    async add(list) {
      const before = macs.size;
      list.forEach((mac) => macs.add(mac));
      if (macs.size === before && initialized) {
        return;
      }
      if (macs.size > MAX_MACS) {
        macs = new Set([...macs].slice(macs.size - MAX_MACS));
      }
      initialized = true;
      const content = JSON.stringify({ version: 1, macs: [...macs] });
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
      initialized = false;
      saving = saving.then(() => unlink(path).catch(() => {}));
      await saving;
    },
  };
}

export { createKnownHosts, DEFAULT_PATH };
