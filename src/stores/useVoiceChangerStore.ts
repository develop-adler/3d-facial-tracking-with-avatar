import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
    EQType,
    PresetType,
} from "@/components/VoiceChangerModal/VoiceChanger";
import type { Vector2 } from "@/models/3d";

type VoiceChangerStore = {
    enabled: boolean;
    pitch: number;
    gain: number;
    reverbDecay: number;
    eq: EQType;
    preset: PresetType;
    modalPosition: Vector2;
    openVoiceChangerModal: boolean;
    setEnabled: (enabled: boolean) => void;
    setPitch: (pitch: number) => void;
    setGain: (gain: number) => void;
    setReverbDecay: (reverbDecay: number) => void;
    setEq: (eq: EQType) => void;
    setPreset: (preset: PresetType) => void;
    setModalPosition: (position: Vector2) => void;
    toggleVoiceChangerModal: (forceState?: boolean) => void;
};

export const useVoiceChangerStore = create<VoiceChangerStore>()(
    persist(
        (set, get) => ({
            enabled: false,
            pitch: 0,
            gain: 1,
            reverbDecay: 2,
            eq: { low: 0, mid: 0, high: 0 },
            preset: "default",
            modalPosition: { x: 100, y: 100 },
            openVoiceChangerModal: false,
            setEnabled: (enabled: boolean) => set({ enabled }),
            setPitch: (pitch: number) => set({ pitch }),
            setGain: (gain: number) => set({ gain }),
            setReverbDecay: (reverbDecay: number) => set({ reverbDecay }),
            setEq: (eq: { low: number; mid: number; high: number }) => set({ eq }),
            setPreset: (preset: PresetType) => set({ preset }),
            setModalPosition: (position: Vector2) => set({ modalPosition: position }),
            toggleVoiceChangerModal: (forceState?: boolean) => {
                const { openVoiceChangerModal } = get();
                set({ openVoiceChangerModal: forceState ?? !openVoiceChangerModal });
            },
        }),
        {
            name: "voice-changer-settings", // saved in localStorage
            version: 0.1,
            partialize: (state: VoiceChangerStore) => ({
                enabled: state.enabled,
                pitch: state.pitch,
                gain: state.gain,
                reverbDecay: state.reverbDecay,
                eq: state.eq,
                preset: state.preset,
                modalPosition: state.modalPosition,
            }),
        }
    )
);
