/**
 * Wait for a condition to be true and execute a callback function
 * @param condition Condition to be checked
 * @param callback Callback function to be executed when condition is true
 * @param errorCallback Callback function to be executed when timeout
 * @param intervalTime Check condition every intervalTime (ms, 4)
 * @param timeoutTime Amount of time to wait before timeout and stop checking (ms, default: 30000)
 * @param errorMessage The error message to be thrown when timeout
 * @returns Promise void
 */
export const waitForConditionAndExecute = <T>(
    condition: () => boolean,
    callback?: () => T,
    errorCallback?: () => void,
    intervalTime: number = 4,
    timeoutTime: number = 30_000,
    errorMessage?: string
): Promise<T | undefined> => {
    return new Promise((resolve, reject) => {
        if (condition()) {
            // console.log(
            //     'Condition already true',
            //     condition.toString(),
            //     ', executing callback immediately'
            // );
            resolve(callback?.());
        }

        // let checkAmount = 0;
        // let timeSinceStart = 0;
        let checkInterval: ReturnType<typeof setInterval> | undefined;
        let timeout: globalThis.NodeJS.Timeout | undefined;
        checkInterval = setInterval(() => {
            // timeSinceStart += intervalTime;
            // checkAmount++;
            if (condition()) {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
                if (checkInterval) {
                    clearInterval(checkInterval);
                    checkInterval = undefined;
                }
                // console.log(
                //     `Condition: ${condition.toString()} is true after`,
                //     timeSinceStart / 1000,
                //     'seconds (' +
                //     checkAmount,
                //     'checks), executing callback'
                // );
                resolve(callback?.());
            }
        }, intervalTime);
        timeout = setTimeout(() => {
            if (checkInterval) clearInterval(checkInterval);
            timeout = undefined;
            errorCallback?.();
            if (errorMessage) reject(new Error(errorMessage));
            // console.log('Condition', condition.toString(), 'timed out');
            // eslint-disable-next-line unicorn/no-useless-undefined
            resolve(undefined);
        }, timeoutTime);
    });
};

/**
 * Linear interpolation
 * @param start Start amount
 * @param end End amount
 * @param amount Interpolation amount
 * @returns {number} number
 */
export const lerp = (start: number, end: number, amount: number): number => {
    return (1 - amount) * start + amount * end;
};

export const areArraysEqual = <T>(a: Array<T>, b: Array<T>) => {
    if (a.length != b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
};
