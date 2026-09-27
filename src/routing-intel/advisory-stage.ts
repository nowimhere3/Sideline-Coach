/**
 * R8 advisory stage gate (S57.1 §19.4, §20 R8).
 *
 * R8 (the Dad advisory chip and its `[USE]` path) is implemented but DORMANT until the shadow exit
 * criteria hold: at least 50 dispatched shadow Plays, median absolute relative burn error <= 50% on
 * qualifying isolated Plays, and the invariant suite green. There is no honest runtime source for
 * "the invariant suite passed", so none is invented here.
 *
 * This is a compile-time constant on purpose: no preference, no persisted flag, no HTTP field, no Dad
 * switch can open it. Only a later, dedicated gate-opening Play that has proved the criteria changes
 * `R8_ADVISORY_STAGE_GATE.open`. Anything other than a literal `open === true` is closed (fail closed).
 * The daemon accepts a gate object only through its constructor options, a test seam of the same kind as
 * the Film journal seam; production never passes one.
 */

export interface AdvisoryStageGate {
  readonly open: boolean;
  /** Why the gate is in this state; for Dev/audit reading only. */
  readonly reason: string;
}

export const R8_ADVISORY_STAGE_GATE: AdvisoryStageGate = Object.freeze({
  open: false,
  reason: 'S57.1 section 19.4 shadow exit criteria are not yet satisfied; a later gate-opening Play must prove them.'
});

/** Fail closed: only an exact `open === true` opens the stage. */
export function advisoryStageOpen(gate: AdvisoryStageGate | undefined = R8_ADVISORY_STAGE_GATE): boolean {
  return Boolean(gate) && gate!.open === true;
}
