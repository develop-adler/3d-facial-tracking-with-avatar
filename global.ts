
export let globalTimestamp = 0;

export function updateGlobalTimestamp(newTimestamp: number) {
    globalTimestamp = newTimestamp;
}

export let mediaStreamFrom3DCanvas: MediaStream | undefined;
export function updateMediaStream(newStream?: MediaStream) {
    mediaStreamFrom3DCanvas = newStream;
}
