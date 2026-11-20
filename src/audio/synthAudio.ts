const pentatonic = [0, 2, 4, 7, 9];

export class SynthAudio {
  muted = false;
  private context?: AudioContext;

  constructor() {
    if (typeof window !== 'undefined') {
      const resume = () => {
        this.unlock();
        if (this.context) {
          if (this.context.state === 'running') {
            window.removeEventListener('pointerdown', resume, true);
            window.removeEventListener('touchstart', resume, true);
            window.removeEventListener('click', resume, true);
          } else {
            void this.context.resume().then(() => {
              if (this.context?.state === 'running') {
                window.removeEventListener('pointerdown', resume, true);
                window.removeEventListener('touchstart', resume, true);
                window.removeEventListener('click', resume, true);
              }
            }).catch(() => undefined);
          }
        }
      };
      window.addEventListener('pointerdown', resume, { capture: true, passive: true });
      window.addEventListener('touchstart', resume, { capture: true, passive: true });
      window.addEventListener('click', resume, { capture: true, passive: true });
    }
  }

  unlock() {
    if (typeof AudioContext === 'undefined') return;
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
  hitStopChord() {
    // Low frequency punchy chord: 55Hz (A1), 82.4Hz (E2), 110Hz (A2)
    this.tone(55, .28, .12, 'sawtooth');
    this.tone(82.4, .26, .09, 'triangle');
    this.tone(110, .22, .075, 'triangle');
  }

  /** 古风铜磬 (Singing bowl / resonant bronze temple chime) */
  singingBowl() {
    this.tone(392, 1.6, 0.08, 'sine');
    this.tone(784, 1.4, 0.04, 'sine', 0.01);
    this.tone(1176, 1.1, 0.02, 'triangle', 0.02);
  }

  /** 清脆金石之声 (Crisp Jade & stone sound) */
  jadeChime() {
    this.tone(1318, 0.16, 0.065, 'sine');
    this.tone(1760, 0.22, 0.08, 'triangle', 0.02);
    this.tone(2637, 0.28, 0.045, 'sine', 0.04);
  }

  /** 雷音和弦 (Thunder resonance chord) */
  thunderChord() {
    this.tone(48, 0.65, 0.15, 'sawtooth', 0, 32);
    this.tone(72, 0.55, 0.12, 'triangle');
    this.tone(144, 0.45, 0.09, 'triangle', 0.03);
    this.tone(288, 0.35, 0.06, 'sine', 0.05);
  }

  /** 朱砂印章沉重盖落 (Vermilion stamp slam) */
  stampSlam() {
    this.tone(42, 0.45, 0.18, 'sawtooth', 0, 24);
    this.tone(160, 0.18, 0.14, 'triangle');
    this.tone(620, 0.12, 0.09, 'sine', 0.01, 300);
  }

  /** 羁绊激活共鸣声 (Synergy resonance chime) */
  synergyChime() {
    const notes = [392, 440, 523, 659, 784]; // G4, A4, C5, E5, G5
    notes.forEach((freq, idx) => {
      this.tone(freq, 0.45, 0.055, 'sine', idx * 0.045);
    });
  }

  finish(win: boolean) {
    if (win) {
      this.thunderChord();
      [392, 494, 587, 784].forEach((note, index) => this.tone(note, .39, .065, 'triangle', index * .085));
    } else {
      ( [330, 262, 220, 165] ).forEach((note, index) => this.tone(note, .39, .065, 'triangle', index * .085));
    }
  }

  private tone(frequency: number, length: number, peak: number, shape: OscillatorType, delay = 0, endFrequency = frequency) {
    const audio = this.context;
    if (this.muted || !audio || audio.state !== 'running') return;
    const when = Math.max(audio.currentTime, audio.currentTime + delay);
    const startFreq = Math.max(1, frequency);
    const targetFreq = Math.max(1, endFrequency);
    const voice = audio.createOscillator();
    const gain = audio.createGain();
    voice.type = shape;
    voice.frequency.setValueAtTime(startFreq, when);
    voice.frequency.exponentialRampToValueAtTime(targetFreq, when + length);
    gain.gain.setValueAtTime(.001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + .014);
    gain.gain.exponentialRampToValueAtTime(.001, when + length);
    voice.connect(gain).connect(audio.destination);
    voice.start(when); voice.stop(when + length + .02);
    voice.onended = () => { voice.disconnect(); gain.disconnect(); };
  }
}
