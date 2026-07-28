import { describe, expect, it } from "vitest";
import { nextSequenceNum, renumberSequence, sortMembersBySequence } from "@/utils/facilityGroupSequence";

/**
 * The facility group sequence screen showed one order and saved a different one.
 *
 * Member rows reach the screen in cache primary-key order — alphabetical by `facilityId` — which is
 * unrelated to the stored `sequenceNum`. Rendering that raw order misordered 8 of 13 multi-member
 * groups on the dev OMS, and the old reorder handler then recycled each POSITION's previous number,
 * so a drag over a misordered list wrote an order nobody asked for.
 *
 * These cases pin the three rules that make shown order == saved order, using the shapes the real
 * data is actually in: sparse numbers, duplicates, and outright absent ones.
 */
describe("sortMembersBySequence", () => {
  it("orders by sequenceNum rather than the order rows arrive in", () => {
    // WAREHOUSE on the dev OMS: cache hands these back alphabetically, stored order is 2, 4, 3.
    const cacheOrder = [
      { facilityId: "CENTRAL_WAREHOUSE", sequenceNum: 2 },
      { facilityId: "GARDEN_CITY", sequenceNum: 4 },
      { facilityId: "OREM", sequenceNum: 3 },
    ];

    expect(sortMembersBySequence(cacheOrder).map((m) => m.facilityId))
      .toEqual(["CENTRAL_WAREHOUSE", "OREM", "GARDEN_CITY"]);
  });

  it("keeps sparse numbering in ascending order", () => {
    const members = [
      { facilityId: "C", sequenceNum: 25 },
      { facilityId: "A", sequenceNum: 3 },
      { facilityId: "B", sequenceNum: 16 },
    ];

    expect(sortMembersBySequence(members).map((m) => m.sequenceNum)).toEqual([3, 16, 25]);
  });

  it("sorts unsequenced members last, not first", () => {
    // An unsequenced membership is "not yet ranked" — floating it to the top would reorder groups
    // that never set a sequence (13 of PICKUP's members have none).
    const members = [
      { facilityId: "NO_SEQ_B", sequenceNum: null },
      { facilityId: "RANKED", sequenceNum: 7 },
      { facilityId: "NO_SEQ_A", sequenceNum: undefined },
    ];

    expect(sortMembersBySequence(members).map((m) => m.facilityId))
      .toEqual(["RANKED", "NO_SEQ_A", "NO_SEQ_B"]);
  });

  it("breaks ties on facilityId so duplicate numbers render stably", () => {
    // Duplicates exist in the live data; without a tiebreak the rows could swap between emits.
    const members = [
      { facilityId: "CENTRAL_WAREHOUSE", sequenceNum: 3 },
      { facilityId: "BACKORDER_PARKING", sequenceNum: 3 },
    ];
    const once = sortMembersBySequence(members).map((m) => m.facilityId);
    const twice = sortMembersBySequence([...members].reverse()).map((m) => m.facilityId);

    expect(once).toEqual(["BACKORDER_PARKING", "CENTRAL_WAREHOUSE"]);
    expect(twice).toEqual(once);
  });

  it("does not sort the caller's array in place", () => {
    // The input is the cache-backed list; mutating it would reorder shared state.
    const members = [{ facilityId: "B", sequenceNum: 2 }, { facilityId: "A", sequenceNum: 1 }];
    sortMembersBySequence(members);

    expect(members.map((m) => m.facilityId)).toEqual(["B", "A"]);
  });
});

describe("nextSequenceNum", () => {
  it("takes max + 1, not last-row + 1", () => {
    // The regression: reading the LAST ROW of a group whose highest number sits earlier handed the
    // new member a number already in use. Live, "Include all" gave a second member sequenceNum 3.
    const members = [{ facilityId: "CENTRAL_WAREHOUSE", sequenceNum: 3 }, { facilityId: "OREM", sequenceNum: 2 }];

    expect(nextSequenceNum(members)).toBe(4);
  });

  it("clears the whole range when numbering is sparse", () => {
    expect(nextSequenceNum([{ sequenceNum: 3 }, { sequenceNum: 5 }, { sequenceNum: 10 }])).toBe(11);
  });

  it("starts at 1 for a group with no numbers at all", () => {
    expect(nextSequenceNum([{ sequenceNum: null }, { sequenceNum: undefined }])).toBe(1);
  });

  it("starts at 1 for an empty group", () => {
    // Math.max over nothing is -Infinity without the seed — this guards that.
    expect(nextSequenceNum([])).toBe(1);
  });
});

describe("renumberSequence", () => {
  it("numbers the arranged positions 1..N", () => {
    const dragged = [{ facilityId: "OREM" }, { facilityId: "CENTRAL_WAREHOUSE" }, { facilityId: "GARDEN_CITY" }];

    expect(renumberSequence(dragged)).toEqual([
      { facilityId: "OREM", sequenceNum: 1 },
      { facilityId: "CENTRAL_WAREHOUSE", sequenceNum: 2 },
      { facilityId: "GARDEN_CITY", sequenceNum: 3 },
    ]);
  });

  it("puts a row dragged to the top at the lowest number", () => {
    // The exact live failure: dragging OREM to position 1 over a misordered list left GARDEN_CITY
    // first, because OREM was handed position 1's OLD number instead of the lowest one.
    const beforeDrag = [
      { facilityId: "CENTRAL_WAREHOUSE", sequenceNum: 2 },
      { facilityId: "GARDEN_CITY", sequenceNum: 4 },
      { facilityId: "OREM", sequenceNum: 3 },
    ];
    const afterDrag = [beforeDrag[2], beforeDrag[0], beforeDrag[1]];
    const saved = renumberSequence(afterDrag);

    expect(saved[0]).toMatchObject({ facilityId: "OREM", sequenceNum: 1 });
    expect(sortMembersBySequence(saved).map((m) => m.facilityId))
      .toEqual(["OREM", "CENTRAL_WAREHOUSE", "GARDEN_CITY"]);
  });

  it("heals duplicates and gaps into distinct consecutive numbers", () => {
    const messy = [{ facilityId: "A", sequenceNum: 3 }, { facilityId: "B", sequenceNum: 3 }, { facilityId: "C", sequenceNum: null }];
    const seqs = renumberSequence(messy).map((m) => m.sequenceNum);

    expect(seqs).toEqual([1, 2, 3]);
    expect(new Set(seqs).size).toBe(3);
  });

  it("preserves the other fields the save diff reads", () => {
    const members = [{ facilityId: "OREM", fromDate: 1785241802874, facilityName: "Orem", sequenceNum: 9 }];

    expect(renumberSequence(members)[0]).toEqual({
      facilityId: "OREM", fromDate: 1785241802874, facilityName: "Orem", sequenceNum: 1,
    });
  });

  it("does not mutate the input rows", () => {
    const members = [{ facilityId: "A", sequenceNum: 8 }];
    renumberSequence(members);

    expect(members[0].sequenceNum).toBe(8);
  });
});
