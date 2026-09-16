let audioContext = null;

function ensureContext() {
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!audioContext || audioContext.state === 'closed') audioContext = new Ctor();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => null);
    return audioContext;
}

function tone(ctx, { frequency, start, duration, gain = 0.08 }) {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0, ctx.currentTime + start);
    volume.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02);
    volume.gain.linearRampToValueAtTime(0, ctx.currentTime + start + duration);
    oscillator.connect(volume).connect(ctx.destination);
    oscillator.start(ctx.currentTime + start);
    oscillator.stop(ctx.currentTime + start + duration + 0.02);
}

export function playPing() {
    const ctx = ensureContext();
    if (!ctx) return;
    tone(ctx, { frequency: 880, start: 0, duration: 0.15 });
    tone(ctx, { frequency: 1320, start: 0.12, duration: 0.18 });
}

export function playRingLoop() {
    const ctx = ensureContext();
    if (!ctx) return () => {};
    let stopped = false;
    const pattern = () => {
        if (stopped) return;
        tone(ctx, { frequency: 620, start: 0, duration: 0.4 });
        tone(ctx, { frequency: 840, start: 0.45, duration: 0.4 });
    };
    pattern();
    const interval = setInterval(pattern, 2500);
    return () => {
        stopped = true;
        clearInterval(interval);
    };
}
