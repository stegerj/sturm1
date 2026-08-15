/**
 * Sound Alert & Tactical Siren Synthesizer
 * Uses Web Audio API to generate zero-latency warning sirens & emergency tones without external audio file dependencies.
 */

class SoundAlertService {
  private audioCtx: AudioContext | null = null;
  private currentSourceNodes: { oscillators: OscillatorNode[]; gain: GainNode } | null = null;
  private isPlaying: boolean = false;

  private initContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Stop any currently playing audio tone
   */
  public stopSound(): void {
    if (this.currentSourceNodes) {
      try {
        this.currentSourceNodes.oscillators.forEach((osc) => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {}
        });
        this.currentSourceNodes.gain.disconnect();
      } catch (e) {}
      this.currentSourceNodes = null;
    }
    this.isPlaying = false;
  }

  /**
   * Play a tactical tone based on user settings or hazard severity
   */
  public playTone(
    toneType: 'eas_emergency' | 'pulsing_siren' | 'marine_horn' | 'radar_chime' = 'eas_emergency',
    volume: number = 0.8,
    durationMs: number = 2400
  ): Promise<void> {
    return new Promise((resolve) => {
      try {
        this.stopSound();
        const ctx = this.initContext();
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(Math.max(0.01, Math.min(1.0, volume)), ctx.currentTime);
        masterGain.connect(ctx.destination);

        const oscillators: OscillatorNode[] = [];
        this.isPlaying = true;

        if (toneType === 'eas_emergency') {
          // Standard Dual-tone Emergency Alert System (853 Hz + 960 Hz)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.setValueAtTime(853, ctx.currentTime);
          osc2.frequency.setValueAtTime(960, ctx.currentTime);

          const subGain = ctx.createGain();
          subGain.gain.setValueAtTime(0.5, ctx.currentTime);
          osc1.connect(subGain);
          osc2.connect(subGain);
          subGain.connect(masterGain);

          osc1.start();
          osc2.start();
          oscillators.push(osc1, osc2);
        } else if (toneType === 'pulsing_siren') {
          // Sweeping Tactical Storm Siren (440Hz -> 880Hz -> 440Hz loop)
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          
          const now = ctx.currentTime;
          osc.frequency.setValueAtTime(450, now);
          osc.frequency.linearRampToValueAtTime(850, now + 0.6);
          osc.frequency.linearRampToValueAtTime(450, now + 1.2);
          osc.frequency.linearRampToValueAtTime(850, now + 1.8);
          osc.frequency.linearRampToValueAtTime(450, now + 2.4);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(1400, now);

          osc.connect(filter);
          filter.connect(masterGain);

          osc.start();
          oscillators.push(osc);
        } else if (toneType === 'marine_horn') {
          // Deep Marine Foghorn / Gale Horn (140Hz harmonic)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc1.type = 'triangle';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(140, ctx.currentTime);
          osc2.frequency.setValueAtTime(210, ctx.currentTime);

          const hornGain = ctx.createGain();
          hornGain.gain.setValueAtTime(0.4, ctx.currentTime);
          osc1.connect(hornGain);
          osc2.connect(hornGain);
          hornGain.connect(masterGain);

          osc1.start();
          osc2.start();
          oscillators.push(osc1, osc2);
        } else {
          // Radar Chime (Ascending clean bell tones)
          const frequencies = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6
          const now = ctx.currentTime;

          frequencies.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);

            noteGain.gain.setValueAtTime(0.01, now + idx * 0.12);
            noteGain.gain.exponentialRampToValueAtTime(0.6, now + idx * 0.12 + 0.02);
            noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);

            osc.connect(noteGain);
            noteGain.connect(masterGain);

            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.5);
            oscillators.push(osc);
          });
        }

        this.currentSourceNodes = { oscillators, gain: masterGain };

        // Auto stop after duration
        setTimeout(() => {
          this.stopSound();
          resolve();
        }, durationMs);
      } catch (err) {
        console.warn('Web Audio playback failed or blocked:', err);
        this.isPlaying = false;
        resolve();
      }
    });
  }

  /**
   * Request Web Notification permission
   */
  public async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    try {
      const perm = await Notification.requestPermission();
      return perm === 'granted';
    } catch (e) {
      return false;
    }
  }

  /**
   * Dispatch system notification and haptic vibration
   */
  public sendNotification(title: string, body: string, vibrate: boolean = true): void {
    if (vibrate && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 300]);
      } catch (e) {}
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'storm-alert'
        });
      } catch (e) {
        console.warn('Notification dispatch failed:', e);
      }
    }
  }
}

export const soundAlertService = new SoundAlertService();
