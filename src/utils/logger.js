export const logger = {
    info: (...args) => { console.info('[DSEF]', ...args); },
    log: (...args) => { console.log('[DSEF]', ...args); },
    error: (...args) => { console.error('[DSEF]', ...args); },
    debug: (...args) => { console.debug('[DSEF]', ...args); },
};
