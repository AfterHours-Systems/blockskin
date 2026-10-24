export interface LatestWins {
  <T>(
    task: (signal: AbortSignal) => Promise<T>,
  ): Promise<{stale: boolean; value?: T}>;
  /** Supersedes whatever is pending without starting anything new. */
  cancel(): void;
}

/**
 * Runs async loads so that only the most recent one counts. Starting a new
 * load aborts the previous one, and whatever the previous one does afterwards
 * (resolve or reject) is reported as stale instead of being applied.
 */
export function createLatestWins(): LatestWins {
  let current: AbortController | null = null;
  const run = async <T>(task: (signal: AbortSignal) => Promise<T>) => {
    current?.abort();
    const controller = new AbortController();
    current = controller;
    try {
      const value = await task(controller.signal);
      return current === controller ? {stale: false, value} : {stale: true};
    } catch (error) {
      if (current !== controller) return {stale: true};
      throw error;
    }
  };
  return Object.assign(run, {
    cancel() {
      current?.abort();
      current = null;
    },
  });
}
