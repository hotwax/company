/**
 * Ordering rules for a facility group's member facilities (`FacilityGroupMember.sequenceNum`).
 *
 * Pure on purpose: the arithmetic is what breaks, not the drag gesture or the POST, so it is
 * unit-tested without a mounted view or a backend.
 *
 * ⚠️ THIS EXISTS BECAUSE THE SEQUENCE SCREEN SHOWED — AND SAVED — THE WRONG ORDER.
 *
 * The member rows arrive from the local cache in Dexie primary-key order, which for the synthetic
 * `memberKey` (`group|facility|fromDate`) means alphabetical by `facilityId` — NOT sequence order.
 * "Manage sequence" rendered that raw order, so 8 of 13 multi-member groups on the dev instance
 * displayed an order that had nothing to do with their stored `sequenceNum` (e.g. WAREHOUSE showed
 * CENTRAL_WAREHOUSE, GARDEN_CITY, OREM for the stored order 2, 4, 3).
 *
 * That misordering then corrupted saves: the reorder handler used to hand each POSITION back the
 * sequence number that position held before the drag. Over a list that was not in sequence order,
 * dragging a row to the top wrote a number that did not put it at the top — verified live, dragging
 * OREM to position 1 left GARDEN_CITY first.
 */

/** A member row as the screen holds it — only the fields the ordering depends on. */
type SequencedMember = { facilityId?: string; sequenceNum?: number | null };

/**
 * Members in the order the group actually applies them.
 *
 * Rows with no `sequenceNum` sort last rather than first: an unsequenced membership is "not yet
 * ranked", and floating it to the top would silently reorder groups that never set a sequence at
 * all (13 of PICKUP's members are unsequenced on the dev instance). `facilityId` breaks ties so a
 * group with duplicate or absent numbers still renders in a stable, repeatable order instead of
 * shuffling between cache emits.
 *
 * Returns a new array — the caller's cache-backed list must not be sorted in place.
 */
export function sortMembersBySequence<T extends SequencedMember>(members: T[]): T[] {
  return [...members].sort((a, b) => {
    const aSeq = a.sequenceNum ?? Number.POSITIVE_INFINITY;
    const bSeq = b.sequenceNum ?? Number.POSITIVE_INFINITY;
    if (aSeq !== bSeq) return aSeq - bSeq;

    return String(a.facilityId ?? "").localeCompare(String(b.facilityId ?? ""));
  });
}

/**
 * Number an arranged list `1..N`, so the positions on screen are the positions that get stored.
 *
 * Applied to the WHOLE list on save rather than to one gesture at a time, and that is deliberate.
 * The screen renders the arranged array, but a reload re-derives the order from stored numbers, and
 * a member left unsequenced ranks last however it was displayed — so picking a number for a single
 * new facility could not keep it where the user saw it. Numbering everything closes that gap for
 * drag, add and remove alike, and heals the absent and duplicate numbers already in the data,
 * because every position ends up with an explicit, distinct value.
 *
 * There is deliberately no "next number for one addition" helper: any number assigned to a facility
 * appended below unsequenced members would sort it above them.
 *
 * Returns new objects; the caller diffs these against the stored members to decide what to write.
 */
export function renumberSequence<T extends SequencedMember>(members: T[]): T[] {
  return members.map((member, index) => ({ ...member, sequenceNum: index + 1 }));
}
