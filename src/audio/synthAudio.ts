const pentatonic = [0, 2, 4, 7, 9];

export class SynthAudio {
  muted = false;
  private context?: AudioContext;

  unlock() {
    if (this.muted || typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch { this.context = undefined; }
  }

  click() { this.tone(530, .08, .052, 'triangle'); }
  merge() { [523, 659, 784, 1047].forEach((note, index) => this.tone(note, .23, .065, 'sine', index * .064)); }
  combo(index: number) {
    const step = Math.min(19, Math.max(0, index - 1));
    this.tone(261.63 * 2 ** ((pentatonic[step % 5] + 12 * Math.floor(step / 5)) / 12), .12, .075, 'sine');
  }
  crit() { this.tone(135, .25, .075, 'triangle', 0, 66); this.tone(880, .085, .044, 'sine'); }
  finish(win: boolean) {
    (win ? [392, 494, 587, 784] : [330, 262, 220, 165]).forEach((note, index) => this.tone(note, .39, .065, 'triangle', index * .085));
  }

  private tone(frequency: number, length: number, peak: number, shape: OscillatorType, delay = 0, endFrequency = frequency) {
    const audio = this.context;
    if (this.muted || !audio || audio.state !== 'running') return;
    const when = audio.currentTime + delay;
    const voice = audio.createOscillator();
    const gain = audio.createGain();
    voice.type = shape;
    voice.frequency.setValueAtTime(frequency, when);
    voice.frequency.exponentialRampToValueAtTime(endFrequency, when + length);
    gain.gain.setValueAtTime(.001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + .014);
    gain.gain.exponentialRampToValueAtTime(.001, when + length);
    voice.connect(gain).connect(audio.destination);
    voice.start(when); voice.stop(when + length + .02);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); };
  }
}
