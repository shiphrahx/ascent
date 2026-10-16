// Fully synthesized soundscape: burner roar on every blast, wind that rises with gusts and
// the storm, wicker creaks as the basket sways, distant dogs, birds at dawn, and the hush of
// falling snow. Starts on the first user gesture; M toggles mute.
export class Sound {
  constructor() {
    this.ctx = null; this.muted = false; this.started = false;
    this.creakT = 2; this.dogT = 12; this.birdT = 1; this.lastSwing = 0;
  }
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;
    const sr = ctx.sampleRate;
    const mk = (fn, secs = 4) => { const b = ctx.createBuffer(1, sr * secs, sr); const d = b.getChannelData(0); fn(d); return b; };
    let last = 0;
    this.white = mk(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = mk(d => { for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });
    let b0 = 0, b1 = 0, b2 = 0;
    this.pink = mk(d => { for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; } });
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3;
    this.master.connect(comp); comp.connect(ctx.destination);
    // a short feedback echo gives far sounds some space
    this.space = ctx.createDelay(1.0); this.space.delayTime.value = 0.23;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const spLP = ctx.createBiquadFilter(); spLP.type = 'lowpass'; spLP.frequency.value = 1800;
    this.space.connect(spLP); spLP.connect(fb); fb.connect(this.space); spLP.connect(this.master);
    const loop = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
    // burner: low rumble + mid roar + hiss
    this.burnGain = ctx.createGain(); this.burnGain.gain.value = 0; this.burnGain.connect(this.master);
    const r1 = loop(this.brown); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; r1.connect(lp); lp.connect(this.burnGain);
    const r2 = loop(this.pink, 0.9); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const g2 = ctx.createGain(); g2.gain.value = 0.9; r2.connect(bp); bp.connect(g2); g2.connect(this.burnGain);
    const r3 = loop(this.white); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g3 = ctx.createGain(); g3.gain.value = 0.12; r3.connect(hp); hp.connect(g3); g3.connect(this.burnGain);
    // distant burners of the fleet: same roar, muffled
    this.farBurn = ctx.createGain(); this.farBurn.gain.value = 0;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500;
    const r4 = loop(this.pink, 0.8); r4.connect(fl); fl.connect(this.farBurn); this.farBurn.connect(this.master); this.farBurn.connect(this.space);
    // wind: body and whistle
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0; this.windGain.connect(this.master);
    const w1 = loop(this.pink, 0.7); this.windLP = ctx.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 500; this.windLP.Q.value = 0.8;
    w1.connect(this.windLP); this.windLP.connect(this.windGain);
    const w2 = loop(this.white, 0.5); this.whistle = ctx.createBiquadFilter(); this.whistle.type = 'bandpass'; this.whistle.frequency.value = 900; this.whistle.Q.value = 6;
    this.whistleGain = ctx.createGain(); this.whistleGain.gain.value = 0;
    w2.connect(this.whistle); this.whistle.connect(this.whistleGain); this.whistleGain.connect(this.master);
    // snowfall hush
    this.hush = ctx.createGain(); this.hush.gain.value = 0;
    const h1 = loop(this.pink, 0.5); const hl = ctx.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 700;
    h1.connect(hl); hl.connect(this.hush); this.hush.connect(this.master);
  }
  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.15);
  }
  // one-shots
  creak(intensity) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 18;
    const f0 = 380 + Math.random() * 260;
    bp.frequency.setValueAtTime(f0, t); bp.frequency.linearRampToValueAtTime(f0 * (1.3 + Math.random() * 0.5), t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    // a rough, ratchety envelope like wicker rubbing
    for (let k = 0; k < 6; k++) g.gain.linearRampToValueAtTime((k % 2 ? 0.05 : 0.6) * intensity, t + 0.02 + k * 0.03);
    g.gain.linearRampToValueAtTime(0, t + 0.26);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 2); s.stop(t + 0.3);
  }
  bark(dist) {
    const ctx = this.ctx;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const t = ctx.currentTime + k * (0.32 + Math.random() * 0.1);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const f = 420 + Math.random() * 120;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.14);
      const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 / (1 + dist);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 / (1 + dist * 1.5), t + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.17);
      o.connect(f1); f1.connect(lp); lp.connect(g); g.connect(this.master); g.connect(this.space);
      o.start(t); o.stop(t + 0.2);
    }
  }
  chirp() {
    const ctx = this.ctx;
    const notes = 2 + Math.floor(Math.random() * 5);
    const base = 2600 + Math.random() * 1800;
    let t = ctx.currentTime;
    for (let k = 0; k < notes; k++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const d = 0.04 + Math.random() * 0.08;
      o.frequency.setValueAtTime(base * (0.8 + Math.random() * 0.5), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.9 + Math.random() * 0.9), t + d);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0003, t + d);
      o.connect(g); g.connect(this.master); g.connect(this.space);
      o.start(t); o.stop(t + d + 0.02);
      t += d + 0.03 + Math.random() * 0.06;
    }
  }
  update(dt, st, hero, fleet, camMode, cam) {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx, now = ctx.currentTime;
    // burner: loud from the basket, quieter from the chase camera's distance
    const d = cam.position.distanceTo(hero.basket.position);
    const near = 1 / (1 + d * 0.025);
    this.burnGain.gain.setTargetAtTime(hero.flameI * 0.85 * (camMode === 1 ? 1.1 : near * 1.6), now, 0.05);
    let far = 0;
    for (const it of fleet.items) if (it.flame > 0.3) far += it.flame / (1 + it.p.distanceTo(cam.position) * 0.01);
    this.farBurn.gain.setTargetAtTime(Math.min(0.25, far * 0.06), now, 0.2);
    // wind
    const rel = hero.flight.relWind.length(), g = hero.flight.gust;
    const w = 0.05 + 0.1 * st.wind + 0.12 * g * st.wind + rel * 0.02 + st.storm * 0.25;
    this.windGain.gain.setTargetAtTime(w * (1 - 0.35 * st.storm), now, 0.4);
    this.windLP.frequency.setTargetAtTime(300 + 900 * g * st.wind + 400 * st.storm, now, 0.4);
    this.whistle.frequency.setTargetAtTime(700 + 600 * g + 300 * Math.sin(now * 0.3), now, 0.5);
    this.whistleGain.gain.setTargetAtTime(0.012 * g * st.wind + 0.02 * st.storm, now, 0.5);
    this.hush.gain.setTargetAtTime(st.storm * 0.16, now, 1.0);
    // creaks follow the basket's swing
    const sw = Math.hypot(hero.flight.swingV.x, hero.flight.swingV.y);
    this.creakT -= dt * (0.3 + sw * 25 + hero.flameI * 0.6);
    if (this.creakT < 0) { this.creakT = 1 + Math.random() * 2.5; this.creak(Math.min(1, 0.25 + sw * 8) * (camMode === 1 ? 1 : near * 2)); }
    // dogs bark from the village, more at night and dawn
    this.dogT -= dt;
    if (this.dogT < 0) { this.dogT = 9 + Math.random() * 20 / (0.3 + st.night); this.bark(0.8 + Math.random() * 2.5); }
    // dawn chorus
    const h = st.hour;
    const dawn = h > 5.9 && h < 9.4 ? 1 : 0;
    this.birdT -= dt * (dawn ? 1 : 0.08) * (1 - st.storm);
    if (this.birdT < 0) { this.birdT = 0.4 + Math.random() * 2.2; this.chirp(); }
  }
}
