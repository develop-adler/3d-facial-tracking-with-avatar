"use-client";

import { createContext, useContext } from "react";

export const WebAudioContext = createContext<AudioContext | undefined>(
    undefined
);

export const useWebAudioContext = () => {
    const ctx = useContext(WebAudioContext);
    if (!ctx) {
        throw "useWebAudio must be used within a WebAudioProvider";
    }
    return ctx;
};
