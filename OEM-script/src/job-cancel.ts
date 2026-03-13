/**
 * AbortController per job so the scraper can be stopped immediately when the user
 * clicks Stop, including during the detail-list phase (after selection was submitted).
 */
const cancelControllers = new Map<string, AbortController>();

export function registerJobCancel(jobId: string): AbortSignal {
  const controller = new AbortController();
  cancelControllers.set(jobId, controller);
  return controller.signal;
}

export function abortJob(jobId: string): void {
  const controller = cancelControllers.get(jobId);
  if (controller) {
    controller.abort();
    cancelControllers.delete(jobId);
  }
}

export function clearJobCancel(jobId: string): void {
  cancelControllers.delete(jobId);
}
