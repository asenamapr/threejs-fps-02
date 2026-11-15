// Sound: every effect is synthesized with WebAudio, no audio files. The context starts
// on the first click, so the title screen is silent until the player opts in.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ duration = 0.1, frequency = 1200, gain = 0.5, type = 'lowpass' }) {
    if (!ensure()) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(duration);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(envelope).connect(master);
    source.start();
    source.stop(ctx.currentTime + duration);
  }

  function tone({ frequency = 440, end = null, duration = 0.12, gain = 0.25, type = 'sine', when = 0 }) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + when);
    if (end) osc.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + when + duration);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(gain, ctx.currentTime + when);
    envelope.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + duration);
    osc.connect(envelope).connect(master);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + duration);
  }

  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    shot(weaponId) {
      if (weaponId === 'sniper') burst({ duration: 0.28, frequency: 700, gain: 0.7 });
      else if (weaponId === 'smg') burst({ duration: 0.06, frequency: 1800, gain: 0.35 });
      else burst({ duration: 0.09, frequency: 1400, gain: 0.5 });
      tone({ frequency: 180, end: 60, duration: 0.08, gain: 0.3, type: 'square' });
    },
    dryFire() {
      tone({ frequency: 1200, duration: 0.03, gain: 0.12, type: 'square' });
    },
    reload() {
      tone({ frequency: 500, duration: 0.05, gain: 0.15, type: 'square' });
      tone({ frequency: 700, duration: 0.05, gain: 0.15, type: 'square', when: 0.18 });
    },
    hit(head) {
      tone({ frequency: head ? 1400 : 900, duration: 0.06, gain: 0.2, type: 'sine' });
    },
    hurt() {
      tone({ frequency: 220, end: 110, duration: 0.18, gain: 0.3, type: 'sawtooth' });
    },
    kill() {
      tone({ frequency: 660, duration: 0.08, gain: 0.22 });
      tone({ frequency: 990, duration: 0.12, gain: 0.22, when: 0.08 });
    },
    explosion() {
      burst({ duration: 0.7, frequency: 300, gain: 0.9 });
      tone({ frequency: 90, end: 30, duration: 0.6, gain: 0.5, type: 'sine' });
    },
    plantBeep() {
      tone({ frequency: 1100, duration: 0.07, gain: 0.2, type: 'square' });
    },
    plantDone() {
      tone({ frequency: 880, duration: 0.12, gain: 0.25 });
      tone({ frequency: 1320, duration: 0.18, gain: 0.25, when: 0.12 });
    },
    defuseDone() {
      tone({ frequency: 1320, duration: 0.12, gain: 0.25 });
      tone({ frequency: 1760, duration: 0.18, gain: 0.25, when: 0.12 });
    },
    roundWin() {
      tone({ frequency: 523, duration: 0.14, gain: 0.25 });
      tone({ frequency: 659, duration: 0.14, gain: 0.25, when: 0.14 });
      tone({ frequency: 784, duration: 0.24, gain: 0.25, when: 0.28 });
    },
    roundLose() {
      tone({ frequency: 392, duration: 0.18, gain: 0.25, type: 'triangle' });
      tone({ frequency: 311, duration: 0.3, gain: 0.25, type: 'triangle', when: 0.18 });
    },
    buy() {
      tone({ frequency: 988, duration: 0.06, gain: 0.2 });
      tone({ frequency: 1319, duration: 0.1, gain: 0.2, when: 0.06 });
    },
    denied() {
      tone({ frequency: 220, duration: 0.12, gain: 0.2, type: 'square' });
    },
  };
}
