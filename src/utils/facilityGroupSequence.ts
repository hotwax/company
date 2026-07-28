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
 * The sequence number a newly added member should take.
 *
 * Max + 1, deliberately NOT `last-in-the-list + 1`. The list is rendered in sequence order, but a
 * group whose numbers are sparse or duplicated has no guarantee the last ROW holds the highest
 * NUMBER — and reading the last row is what produced two members sharing `sequenceNum: 3` when
 * "Include all" ran against a group that already had members.
 *
 * Non-numeric and absent values count as 0, so the first member of an unsequenced group gets 1.
 */
export function nextSequenceNum(members: SequencedMember[]): number {
  return Math.max(0, ...members.map((member) => Number(member.sequenceNum) || 0)) + 1;
}

/**
 * Renumber a reordered list to `1..N`, matching the positions the user just arranged.
 *
 * Assigning fresh consecutive numbers rather than recycling the previous ones is what makes the
 * saved order equal the shown order. It also heals the two states the dev data is already in —
 * absent numbers and duplicates — on the next save, because every position gets an explicit,
 * distinct value.
 *
 * Returns new objects; the caller diffs these against the stored members to decide what to write.
 */
export function renumberSequence<T extends SequencedMember>(members: T[]): T[] {
  return members.map((member, index) => ({ ...member, sequenceNum: index + 1 }));
}
