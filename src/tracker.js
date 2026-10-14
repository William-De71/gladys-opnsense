// -----------------------------------------------------------------------------
// Snapshots -> scene trigger transitions. Pure logic, no I/O.
//
// One event per transition, never a periodic snapshot. A `previous` of
// undefined is the baseline (first reading after a start or a new address):
// nothing fires from it, so a restart never replays what happened before.
// -----------------------------------------------------------------------------

/**
 * @description The presence of a host after a reading. A host is present as
 * soon as it answers in the ARP table, and absent once it has been gone for
 * the absence delay (a phone asleep on Wi-Fi leaves the table for a while).
 * @param {object|undefined} previous - `{ present, lastSeen }` of the last
 * reading, undefined for the baseline.
 * @param {boolean} seen - Whether the host answers now.
 * @param {number} now - Now, in ms.
 * @param {number} absenceMs - The absence delay, in ms.
 * @returns {{ present: boolean, lastSeen: number|null, event: string|null }}
 * `event` is `arrived`, `left` or null.
 * @example
 * nextPresence({ present: true, lastSeen: 0 }, false, 600000, 300000); // left
 */
function nextPresence(previous, seen, now, absenceMs) {
  if (seen) {
    return {
      present: true,
      lastSeen: now,
      event: previous && previous.present === false ? 'arrived' : null,
    };
  }
  const lastSeen = previous?.lastSeen ?? null;
  if (!previous) {
    return { present: false, lastSeen, event: null };
  }
  if (previous.present && lastSeen !== null && now - lastSeen < absenceMs) {
    return { present: true, lastSeen, event: null };
  }
  return { present: false, lastSeen, event: previous.present ? 'left' : null };
}

/**
 * @description The status change of a gateway; `pending` (dpinger starting)
 * is never a transition.
 * @param {object|undefined} previous - The previous gateway snapshot.
 * @param {object} current - The gateway snapshot.
 * @returns {{ previous: string }|null} The transition.
 */
function diffGateway(previous, current) {
  if (
    !previous ||
    previous.status === current.status ||
    previous.status === 'pending' ||
    current.status === 'pending'
  ) {
    return null;
  }
  return { previous: previous.status };
}

/**
 * @description The connection change of a WireGuard peer.
 * @param {object|undefined} previous - The previous peer snapshot.
 * @param {object} current - The peer snapshot.
 * @returns {boolean} True when it connected or disconnected.
 */
const diffPeer = (previous, current) => Boolean(previous) && previous.online !== current.online;

/**
 * @description The start or stop of a service.
 * @param {object|undefined} previous - The previous service snapshot.
 * @param {object} current - The service snapshot.
 * @returns {boolean} True when it started or stopped.
 */
const diffService = (previous, current) =>
  Boolean(previous) && previous.running !== current.running;

/**
 * @description Whether the last firmware check found updates the previous one
 * did not have (a first check that finds some counts too).
 * @param {object|null|undefined} previous - The previous readFirmware, undefined for the baseline.
 * @param {object|null} current - The readFirmware of now.
 * @returns {boolean} True when an update became available.
 */
function diffFirmware(previous, current) {
  if (!previous || !current || !(current.updates > 0)) {
    return false;
  }
  return previous.updates === null || previous.updates === 0 || previous.latest !== current.latest;
}

export { nextPresence, diffGateway, diffPeer, diffService, diffFirmware };
