export const logger = {
    info: (...args: unknown[]) => { console.info('[DSEF]', ...args); },
    log: (...args: unknown[]) => { console.log('[DSEF]', ...args); },
    error: (...args: unknown[]) => { console.error('[DSEF]', ...args); },
    debug: (...args: unknown[]) => { console.debug('[DSEF]', ...args); },
};

export const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);