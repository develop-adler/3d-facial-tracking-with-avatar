declare module 'ifvisible.js' {
    const ifvisible: {
        on: (eventName: string, callback: () => void) => void;
        off: (eventName: string) => void;
        setIdleDuration: (duration: number) => void;
        getIdleDuration: () => number;
        getIdleInfo: () => {
            isIdle: boolean;
            idleFor: number;
            timeLeft: number;
            timeLeftPer: number;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        idle(callback?: (data: any) => any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blur(callback?: (data: any) => any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        focus(callback?: (data: any) => any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wakeup(callback?: (data: any) => any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onEvery(seconds: number, callback: (data: any) => any);
        now(check?: string): boolean;
    };

    export = ifvisible;
}

declare module 'earcut' {
    // eslint-disable-next-line
    const earcut: {};
    export = earcut;
}
