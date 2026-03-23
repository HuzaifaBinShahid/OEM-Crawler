import { randomUUID } from "node:crypto";

export type SelectionPart = {
  sku?: string;
  description?: string;
  section?: string;
  compatibility?: string;
};

export type SelectionOutcome =
  | { selectedPart: SelectionPart; partIndex?: number }
  | { selections: Array<{ termIndex: number; selectedPart: SelectionPart }> }
  | { stop: true };

const pending = new Map<
  string,
  { resolve: (value: SelectionOutcome) => void }
>();

export function createJob(): {
  jobId: string;
  promise: Promise<SelectionOutcome>;
} {
  const jobId = randomUUID();
  let resolve: (value: SelectionOutcome) => void;
  const promise = new Promise<SelectionOutcome>((r) => {
    resolve = r;
  });
  pending.set(jobId, { resolve: resolve! });
  return { jobId, promise };
}

export function resolveSelection(
  jobId: string,
  outcome: SelectionOutcome,
): boolean {
  const entry = pending.get(jobId);
  if (!entry) return false;
  pending.delete(jobId);
  entry.resolve(outcome);
  return true;
}
