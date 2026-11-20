const pentatonic = [0, 2, 4, 7, 9];

// 五声音阶（宫 C、商 D、角 E、徵 G、羽 A）古琴/编钟沉浸泛音频段 (Hz)
const AMBIENT_PENTATONIC_FREQS = [
  130.81, // 宫 C3
  146.83, // 商 D3
  164.81, // 角 E3
  196.00, // 徵 G3
  220.00, // 羽 A3
  261.63, // 宫 C4
  293.66, // 商 D4
  329.63, // 角 E4
  392.00, // 徵 G4
  440.00, // 羽 A4
  523.25, // 宫 C5
  659.25, // 角 E5
];

export class SynthAudio {
  private _muted = false;
  private _ambientMuted = false;
  private context?: AudioContext;

  get muted(): boolean { return this._muted; }
  set muted(val: boolean) {
    this._muted = Boolean(val);
    if (this._muted) {
      this.stopAmbient();
    } else if (!this._ambientMuted && this.context?.state === 'running') {
      this.startAmbient();
    }
  }

  get ambientMuted(): boolean { return this._ambientMuted; }
  set ambientMuted(val: boolean) {
    this._ambientMuted = Boolean(val);
    if (this._ambientMuted) {
      this.stopAmbient();
    } else if (!this._muted && this.context?.state === 'running') {
      this.startAmbient();
    }
  }

  // 五音雅乐背景氛围节点
  private ambientGain?: GainNode;
  private ambientDroneOsc1?: OscillatorNode;
  private ambientDroneOsc2?: OscillatorNode;
  private ambientFilter?: BiquadFilterNode;
  private ambientTimer?: ReturnType<typeof setTimeout>;
  private isAmbientRunning = false;

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

      // 切换标签页时自动休眠/唤醒背景雅乐
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            this.stopAmbient();
          } else if (!this.muted && !this.ambientMuted) {
            this.startAmbient();
          }
        });
      }
    }
  }

  unlock() {
    if (typeof AudioContext === 'undefined') return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') {
        void this.context.resume().then(() => {
          if (!this.muted && !this.ambientMuted && !this.isAmbientRunning) {
            this.startAmbient();
          }
        }).catch(() => undefined);
      } else if (!this.muted && !this.ambientMuted && !this.isAmbientRunning) {
        this.startAmbient();
      }
    } catch { this.context = undefined; }
  }

  /**
   * 启动五音雅乐背景禅意氛围（低频禅意和弦低音床 + 间歇轻柔古琴/编钟泛音）
   */
  startAmbient() {
    if (this.muted || this.ambientMuted || !this.context || this.context.state !== 'running' || this.isAmbientRunning) return;
    try {
      const ctx = this.context;
      const now = ctx.currentTime;

      // 1. 总氛围增益节点与温和低通滤波
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.exponentialRampToValueAtTime(0.018, now + 1.2);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, now);

      // 2. 双低频根音振荡器（65.41Hz 宫 C2 + 97.99Hz 徵 G2）产生祥和静谧的嗡鸣底蕴
      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(65.41, now);

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(97.99, now);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);

      this.ambientGain = masterGain;
      this.ambientFilter = filter;
      this.ambientDroneOsc1 = osc1;
      this.ambientDroneOsc2 = osc2;
      this.isAmbientRunning = true;

      // 3. 开启自适应周期性古琴/编钟泛音拨动
      this.scheduleNextAmbientPluck();
    } catch {
      this.isAmbientRunning = false;
    }
  }

  private scheduleNextAmbientPluck() {
    if (!this.isAmbientRunning || this.muted || this.ambientMuted) return;
    clearTimeout(this.ambientTimer);
    // 间隔 3.6 ~ 6.2 秒随机轻轻拨响一枚五声音阶余音
    const delayMs = 3600 + Math.random() * 2600;
    this.ambientTimer = setTimeout(() => {
      if (this.isAmbientRunning && !this.muted && !this.ambientMuted) {
        this.playProceduralPentatonicPluck();
        this.scheduleNextAmbientPluck();
      }
    }, delayMs);
  }

  /**
   * 程序化拨响一枚古琴/编钟五声音阶禅音
   */
  private playProceduralPentatonicPluck() {
    if (!this.context || this.context.state !== 'running' || this._muted || this._ambientMuted || !this.isAmbientRunning) return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const outputTarget = this.ambientGain ?? ctx.destination;

    // 随机选择五声音阶中的一组谐音
    const idx = Math.floor(Math.random() * AMBIENT_PENTATONIC_FREQS.length);
    const fundamental = AMBIENT_PENTATONIC_FREQS[idx];
    const length = 3.2 + Math.random() * 1.5;

    // 基频主音（三角波，模拟丝弦共振）
    const voice1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    voice1.type = 'triangle';
    voice1.frequency.setValueAtTime(fundamental, now);

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.024, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.0005, now + length);

    voice1.connect(gain1).connect(outputTarget);
    voice1.start(now);
    voice1.stop(now + length + 0.05);

    // 二次泛音（正弦波，模拟编钟金石回荡）
    const voice2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    voice2.type = 'sine';
    voice2.frequency.setValueAtTime(fundamental * 2, now);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.exponentialRampToValueAtTime(0.012, now + 0.03);
    gain2.gain.exponentialRampToValueAtTime(0.0005, now + length * 0.7);

    voice2.connect(gain2).connect(outputTarget);
    voice2.start(now);
    voice2.stop(now + length * 0.7 + 0.05);

    voice1.onended = () => { voice1.disconnect(); gain1.disconnect(); };
    voice2.onended = () => { voice2.disconnect(); gain2.disconnect(); };
  }

  /**
   * 停止五音雅乐背景氛围
   */
  stopAmbient() {
    clearTimeout(this.ambientTimer);
    if (!this.isAmbientRunning) return;
    this.isAmbientRunning = false;

    const osc1 = this.ambientDroneOsc1;
    const osc2 = this.ambientDroneOsc2;
    const filter = this.ambientFilter;
    const gain = this.ambientGain;
    this.ambientDroneOsc1 = undefined;
    this.ambientDroneOsc2 = undefined;
    this.ambientFilter = undefined;
    this.ambientGain = undefined;

    try {
      if (this.context && gain && this.context.state === 'running') {
        const now = this.context.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      }
      setTimeout(() => {
        try {
          osc1?.stop();
          osc2?.stop();
          osc1?.disconnect();
          osc2?.disconnect();
          filter?.disconnect();
          gain?.disconnect();
        } catch {}
      }, 350);
    } catch {}
  }

  /**
   * 切换五音雅乐静音状态
   */
  toggleAmbient(): boolean {
    this.ambientMuted = !this.ambientMuted;
    if (this.ambientMuted) {
      this.stopAmbient();
    } else {
      this.unlock();
      this.startAmbient();
    }
    return !this.ambientMuted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.muted) {
      this.stopAmbient();
    } else if (!this.ambientMuted) {
      this.startAmbient();
    }
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
