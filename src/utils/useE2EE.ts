import { ExternalE2EEKeyProvider } from "livekit-client";

const useE2EE = (passPhrase: string) => {
    const keyProvider = new ExternalE2EEKeyProvider();
    const e2eePassphrase =
        // eslint-disable-next-line unicorn/no-typeof-undefined
        typeof globalThis.window === "undefined"
            ? undefined
            : decodeURIComponent(passPhrase);

    const worker: Worker | undefined =
        // eslint-disable-next-line unicorn/no-typeof-undefined
        typeof globalThis.window !== "undefined" && e2eePassphrase
            ? new Worker(new URL("livekit-client/e2ee-worker", import.meta.url))
            : undefined;

    return { keyProvider, worker, e2eePassphrase };
};

export default useE2EE;
