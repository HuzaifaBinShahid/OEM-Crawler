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
