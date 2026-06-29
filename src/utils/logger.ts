export const logger = {
  info: (...args: unknown[]) => {
    console.info("[DSEF]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[DSEF]", ...args);
  },
};

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
