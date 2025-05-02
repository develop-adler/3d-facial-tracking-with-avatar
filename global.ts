
export let globalTimestamp = 0;

export function updateGlobalTimestamp(newTimestamp: number) {
    globalTimestamp = newTimestamp;
}

export let mediaStreamFrom3DCanvas: MediaStream | null = null;
export function updateMediaStream(newStream: MediaStream | null) {
    mediaStreamFrom3DCanvas = newStream;
}
