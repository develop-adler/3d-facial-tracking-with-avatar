"use client";

import { useEffect, useRef, useState, type FC } from "react";

import {
    Box,
    Button,
    ButtonGroup,
    Slider,
    TextField,
    Typography,
} from "@mui/material";
import { v4 } from "uuid";

import { StyledPaper } from "./styles";

type VoicePreset = {
    name: string;
    micPitch: number;
    ttsPitch: number;
    gain: number;
    distortion: number;
    bass: number;
    mid: number;
    treble: number;
    reverbWet: number;
};

const presets: VoicePreset[] = [
    {
        name: "Male",
        micPitch: 0.8,
        ttsPitch: 0.9,
        gain: 1.2,
        distortion: 50,
        bass: 10,
        mid: 0,
        treble: -5,
        reverbWet: 0.2,
    },
    {
        name: "Female",
        micPitch: 1.4,
        ttsPitch: 1.5,
        gain: 1,
        distortion: 30,
        bass: -5,
        mid: 5,
        treble: 10,
        reverbWet: 0.3,
    },
    {
        name: "Kid",
        micPitch: 1.8,
        ttsPitch: 1.8,
        gain: 1.1,
        distortion: 20,
        bass: -10,
        mid: 10,
        treble: 12,
        reverbWet: 0.4,
    },
    {
        name: "Old Man",
        micPitch: 0.7,
        ttsPitch: 0.8,
        gain: 1,
        distortion: 100,
        bass: 15,
        mid: -5,
        treble: -10,
        reverbWet: 0.5,
    },
    {
        name: "Old Woman",
        micPitch: 1.3,
        ttsPitch: 1.3,
        gain: 1,
        distortion: 70,
        bass: 0,
        mid: 5,
        treble: 5,
        reverbWet: 0.5,
    },
];

const micStatus = {
    audioContextClosing: false,
    audioContextClosed: false,
    isFetchingAudioStream: false,
    processingStarted: false,
    processingStopped: false,
    processingStopping: false,
};

class AudioContextWithId {
    id: string;
    audioContext: AudioContext;
    isClosing: boolean;
    isClosed: boolean;

    constructor() {
        this.id = v4();
        this.audioContext = new AudioContext();
        this.isClosing = false;
        this.isClosed = false;
    }
    dispose() {
        if (this.isClosing || this.isClosed) return;
        this.isClosing = true;
        this.audioContext.close();
        this.isClosed = true;
    }
}

export const VoiceChat: FC = () => {
    const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
    const [isFetchingStream, setIsFetchingStream] = useState(true);
    const [micFetchError, setMicFetchError] = useState<string | null>(null);
    const [isPTTHeld, setIsPTTHeld] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [ttsText, setTtsText] = useState("");
    const [ttsPitchFactor, setTtsPitchFactor] = useState(1);
    const [micPitchFactor, setMicPitchFactor] = useState(1);
    const [gainValue, setGainValue] = useState(1);
    const [distortionAmount, setDistortionAmount] = useState(0);
    const [bassGain, setBassGain] = useState(0);
    const [midGain, setMidGain] = useState(0);
    const [trebleGain, setTrebleGain] = useState(0);
    const [reverbWet, setReverbWet] = useState(0.3);

    const audioCtxRef = useRef<AudioContextWithId>(null);
    const analyserRef = useRef<AnalyserNode>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode>(null);
    const animationFrameRef = useRef<number>(0);
    const gainNodeRef = useRef<GainNode>(null);
    const pitchShifterRef = useRef<AudioParam>(null);
    const distortionRef = useRef<WaveShaperNode>(null);
    const bassEQRef = useRef<BiquadFilterNode>(null);
    const midEQRef = useRef<BiquadFilterNode>(null);
    const trebleEQRef = useRef<BiquadFilterNode>(null);
    const reverbRef = useRef<ConvolverNode>(null);

    // Mic chain:
    // Mic → Pitch → Distortion
    //  → Bass EQ → Mid EQ → Treble EQ
    //  → (Dry + Reverb) → Gain → Output
    const startMicProcessing = async () => {
        if (isFetchingStream || !audioStream) return;

        const audioCtxWithId = new AudioContextWithId();
        const audioCtx = audioCtxWithId.audioContext;
        await audioCtx.audioWorklet.addModule("/audio/pitch-shifter-processor.js");
        const source = audioCtx.createMediaStreamSource(audioStream);

        const pitchShifter = new AudioWorkletNode(
            audioCtx,
            "pitch-shifter-processor"
        );
        const pitchParam = pitchShifter.parameters.get("pitchFactor");
        pitchParam!.value = micPitchFactor;
        pitchShifterRef.current = pitchParam ?? null;

        // Add FX nodes
        const distortion = audioCtx.createWaveShaper();
        const bassEQ = audioCtx.createBiquadFilter();
        bassEQ.type = "lowshelf";
        bassEQ.frequency.value = 200;

        const midEQ = audioCtx.createBiquadFilter();
        midEQ.type = "peaking";
        midEQ.frequency.value = 1000;

        const trebleEQ = audioCtx.createBiquadFilter();
        trebleEQ.type = "highshelf";
        trebleEQ.frequency.value = 3000;

        const reverb = audioCtx.createConvolver();
        reverb.buffer = createFakeReverbBuffer(audioCtx);

        const reverbGain = audioCtx.createGain();
        reverbGain.gain.value = 0.3; // Default wetness

        const dryGain = audioCtx.createGain();
        dryGain.gain.value = 0.7; // 1 - reverb wetness

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = gainValue;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;

        // Connect the full chain
        source.connect(pitchShifter);
        pitchShifter.connect(distortion);
        distortion.connect(bassEQ);
        bassEQ.connect(midEQ);
        midEQ.connect(trebleEQ);
        trebleEQ.connect(dryGain);
        trebleEQ.connect(reverb);
        reverb.connect(reverbGain);

        const finalMix = audioCtx.createGain();
        dryGain.connect(finalMix);
        reverbGain.connect(finalMix);
        finalMix.connect(gainNode);
        gainNode.connect(analyser);
        analyser.connect(audioCtx.destination);

        // 💾 Save refs
        audioCtxRef.current?.dispose();
        audioCtxRef.current = audioCtxWithId;
        analyserRef.current = analyser;
        sourceRef.current = source;
        gainNodeRef.current = gainNode;
        distortionRef.current = distortion;
        bassEQRef.current = bassEQ;
        midEQRef.current = midEQ;
        trebleEQRef.current = trebleEQ;
        reverbRef.current = reverb;

        monitorVAD();
    };

    const monitorVAD = () => {
        const loop = () => {
            const analyser = analyserRef.current;
            if (!analyser) return;

            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setIsSpeaking(avg > 10);

            animationFrameRef.current = requestAnimationFrame(loop);
        };
        loop();
    };

    const closeAudioContext = async () => {
        micStatus.audioContextClosing = true;

        audioCtxRef.current?.dispose();
        audioCtxRef.current = null;
        gainNodeRef.current = null;
        distortionRef.current = null;
        bassEQRef.current = null;
        midEQRef.current = null;
        trebleEQRef.current = null;
        reverbRef.current = null;
        pitchShifterRef.current = null;

        micStatus.audioContextClosing = false;
        micStatus.audioContextClosed = true;
    };

    const stopMicProcessing = async () => {
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        cancelAnimationFrame(animationFrameRef.current);
        setIsSpeaking(false);
        await closeAudioContext();
    };

    const speakText = () => {
        const utterance = new SpeechSynthesisUtterance(ttsText);
        utterance.lang = "en-US";
        utterance.pitch = ttsPitchFactor;
        utterance.rate = 1.1;
        speechSynthesis.speak(utterance);
    };

    const createFakeReverbBuffer = (ctx: AudioContext) => {
        const length = ctx.sampleRate * 1.5;
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const channel = impulse.getChannelData(c);
            for (let i = 0; i < length; i++) {
                channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
            }
        }
        return impulse;
    };

    const applyPreset = (preset: VoicePreset) => {
        setMicPitchFactor(preset.micPitch);
        setTtsPitchFactor(preset.ttsPitch);
        setGainValue(preset.gain);
        setDistortionAmount(preset.distortion);
        setBassGain(preset.bass);
        setMidGain(preset.mid);
        setTrebleGain(preset.treble);
        setReverbWet(preset.reverbWet);
    };

    const setNodeValue = (
        node: GainNode | AudioParam | BiquadFilterNode | null,
        value: number,
        audioCtx?: AudioContext | null
    ) => {
        if (!node) return;

        if (audioCtx) {
            if ("gain" in node) {
                node.gain.setValueAtTime(value, audioCtx.currentTime);
            } else {
                node.setValueAtTime(value, audioCtx.currentTime);
            }
        } else {
            if ("gain" in node) {
                node.gain.value = value;
            } else {
                node.value = value;
            }
        }
    };

    useEffect(() => {
        if (distortionRef.current) {
            const k = distortionAmount;
            const n_samples = 44100;
            const curve = new Float32Array(n_samples);
            const deg = Math.PI / 180;
            for (let i = 0; i < n_samples; ++i) {
                const x = (i * 2) / n_samples - 1;
                curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
            }
            distortionRef.current.curve = curve;
            distortionRef.current.oversample = "4x";
        }
    }, [distortionAmount]);

    useEffect(() => {
        setNodeValue(
            gainNodeRef.current,
            gainValue,
            audioCtxRef.current?.audioContext
        );
    }, [gainValue]);

    useEffect(() => {
        setNodeValue(
            pitchShifterRef.current,
            micPitchFactor,
            audioCtxRef.current?.audioContext
        );
    }, [micPitchFactor]);

    useEffect(() => {
        setNodeValue(
            bassEQRef.current,
            bassGain,
            audioCtxRef.current?.audioContext
        );
    }, [bassGain]);

    useEffect(() => {
        setNodeValue(midEQRef.current, midGain, audioCtxRef.current?.audioContext);
    }, [midGain]);

    useEffect(() => {
        setNodeValue(
            trebleEQRef.current,
            trebleGain,
            audioCtxRef.current?.audioContext
        );
    }, [trebleGain]);

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.key === "d" && !isPTTHeld) {
                e.preventDefault();
                setIsPTTHeld(true);
                await startMicProcessing();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === "d") {
                setIsPTTHeld(false);
                stopMicProcessing();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            stopMicProcessing();
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPTTHeld]);

    useEffect(() => {
        const fetchStream = async () => {
            setIsFetchingStream(true);
            setMicFetchError(null);

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                });
                setAudioStream(stream);
            } catch (err) {
                console.error("Mic access failed:", err);
                setMicFetchError(
                    "Unable to access microphone. Please allow permission."
                );
            } finally {
                setIsFetchingStream(false);
            }
        };

        fetchStream();
    }, []);

    if (isFetchingStream) {
        return (
            <Box
                sx={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    display: "flex",
                    height: "100vh",
                    fontSize: "2rem",
                    fontWeight: "bold",
                }}
            >
                Fetching microphone...
            </Box>
        );
    }

    if (micFetchError) {
        return (
            <Box
                sx={{
                    display: "flex",
                    height: "100vh",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    color: "red",
                    p: 2,
                }}
            >
                {micFetchError}
            </Box>
        );
    }

    return (
        <StyledPaper elevation={3} sx={{ p: 3, maxWidth: 420, mx: "auto" }}>
            <Typography variant="h5" fontWeight="bold" gutterBottom>
                🎤 Voice Chat + Modulation
            </Typography>
            <Typography variant="body2" gutterBottom>
                Hold <strong>Spacebar</strong> to talk
            </Typography>

            <Box
                sx={{
                    width: 100,
                    height: 100,
                    borderRadius: "50%",
                    backgroundColor: isSpeaking ? "limegreen" : "#ccc",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    fontWeight: "bold",
                    my: 2,
                    mx: "auto",
                    transition: "background 0.2s",
                }}
            >
                {isPTTHeld || isSpeaking
                    ? "Speaking"
                    : isPTTHeld && !isSpeaking
                        ? "Listening..."
                        : "Idle"}
            </Box>

            {/* Preset Buttons */}
            <Typography variant="h6" gutterBottom>
                Voice Presets:
            </Typography>
            <ButtonGroup
                variant="outlined"
                fullWidth
                orientation="vertical"
                sx={{ mb: 2 }}
            >
                {presets.map((preset) => (
                    <Button key={preset.name} onClick={() => applyPreset(preset)}>
                        {preset.name}
                    </Button>
                ))}
            </ButtonGroup>

            {/* Gain Control */}
            <Typography gutterBottom>
                Gain (Volume): {gainValue.toFixed(2)}
            </Typography>
            <Slider
                min={0}
                max={3}
                step={0.01}
                value={gainValue}
                onChange={(e, val) => setGainValue(val)}
                sx={{ mb: 2 }}
            />

            {/* Mic Pitch Control */}
            <Typography gutterBottom>
                Mic Pitch: {micPitchFactor.toFixed(2)}
            </Typography>
            <Slider
                min={0.5}
                max={2}
                step={0.01}
                value={micPitchFactor}
                onChange={(e, val) => setMicPitchFactor(val)}
                sx={{ mb: 2 }}
            />

            {/* TTS Pitch Control */}
            <Typography gutterBottom>
                TTS Pitch: {ttsPitchFactor.toFixed(2)}
            </Typography>
            <Slider
                min={0.5}
                max={2}
                step={0.01}
                value={ttsPitchFactor}
                onChange={(e, val) => setTtsPitchFactor(val)}
                sx={{ mb: 2 }}
            />

            {/* Distortion */}
            <Typography gutterBottom>
                Distortion Amount: {distortionAmount.toFixed(0)}
            </Typography>
            <Slider
                min={0}
                max={1000}
                step={1}
                value={distortionAmount}
                onChange={(e, val) => setDistortionAmount(val)}
                sx={{ mb: 2 }}
            />

            {/* Bass EQ */}
            <Typography gutterBottom>Bass Gain: {bassGain.toFixed(1)} dB</Typography>
            <Slider
                min={-20}
                max={20}
                step={0.1}
                value={bassGain}
                onChange={(e, val) => setBassGain(val)}
                sx={{ mb: 2 }}
            />

            {/* Mid EQ */}
            <Typography gutterBottom>Mid Gain: {midGain.toFixed(1)} dB</Typography>
            <Slider
                min={-20}
                max={20}
                step={0.1}
                value={midGain}
                onChange={(e, val) => setMidGain(val)}
                sx={{ mb: 2 }}
            />

            {/* Treble EQ */}
            <Typography gutterBottom>
                Treble Gain: {trebleGain.toFixed(1)} dB
            </Typography>
            <Slider
                min={-20}
                max={20}
                step={0.1}
                value={trebleGain}
                onChange={(e, val) => setTrebleGain(val)}
                sx={{ mb: 2 }}
            />

            {/* Reverb Wet Level */}
            <Typography gutterBottom>
                Reverb Wetness: {reverbWet.toFixed(2)}
            </Typography>
            <Slider
                min={0}
                max={1}
                step={0.01}
                value={reverbWet}
                onChange={(e, val) => setReverbWet(val)}
                sx={{ mb: 2 }}
            />

            {/* 🗣 TTS */}
            <TextField
                fullWidth
                multiline
                rows={3}
                label="Type text to speak"
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                sx={{ mb: 2 }}
            />

            <Button fullWidth variant="contained" onClick={speakText}>
                🔈 Speak Text
            </Button>
        </StyledPaper>
    );
};
