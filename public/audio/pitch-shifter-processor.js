class PitchShifterProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: "pitchFactor", defaultValue: 1, minValue: 0.5, maxValue: 2 },
        ];
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const pitchFactor = parameters.pitchFactor[0] || 1;

        for (let channel = 0; channel < input.length; ++channel) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];

            for (let i = 0; i < outputChannel.length; ++i) {
                // 🛠️ Correct: higher pitch factor = higher voice (normal behavior)
                const inputIndex = Math.floor(i * pitchFactor);
                outputChannel[i] = inputChannel[inputIndex] || 0;
            }
        }
        return true;
    }
}

registerProcessor("pitch-shifter-processor", PitchShifterProcessor);
