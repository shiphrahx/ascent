// Keyboard and pointer input. No on-screen hints by design; keys:
// Space/W/Up burner, S/Down vent, A/D or Left/Right rotation vent, C camera, T hold fast-forward, M mute.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.burn = false; this.vent = false; this.left = false; this.right = false; this.fast = false;
    this.drag = { active: false, dx: 0, dy: 0, lastX: 0, lastY: 0, idle: 99 };
    this.wheel = 0;
    this.onCamera = null; this.onMute = null; this.onFirstGesture = null;
    const down = e => {
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) {
        if (k === 'KeyC' || k === 'KeyV') this.onCamera && this.onCamera();
        if (k === 'Digit1' || k === 'Digit2' || k === 'Digit3') this.onCamera && this.onCamera(+k.slice(-1) - 1);
        if (k === 'KeyM') this.onMute && this.onMute();
      }
      this.keys.add(k);
      this.gesture();
      this.sync();
    };
    const up = e => { this.keys.delete(e.code); this.sync(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => { this.keys.clear(); this.sync(); });
    el.addEventListener('pointerdown', e => {
      this.drag.active = true; this.drag.lastX = e.clientX; this.drag.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      document.body.classList.add('dragging');
      this.gesture();
    });
    el.addEventListener('pointermove', e => {
      if (!this.drag.active) return;
      this.drag.dx += e.clientX - this.drag.lastX; this.drag.dy += e.clientY - this.drag.lastY;
      this.drag.lastX = e.clientX; this.drag.lastY = e.clientY;
      this.drag.idle = 0;
    });
    const end = e => { this.drag.active = false; document.body.classList.remove('dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60); this.drag.idle = 0; }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  gesture() { if (this.onFirstGesture) { const f = this.onFirstGesture; this.onFirstGesture = null; f(); } }
  sync() {
    const k = this.keys;
    this.burn = k.has('Space') || k.has('KeyW') || k.has('ArrowUp');
    this.vent = k.has('KeyS') || k.has('ArrowDown');
    this.left = k.has('KeyA') || k.has('ArrowLeft');
    this.right = k.has('KeyD') || k.has('ArrowRight');
    this.fast = k.has('KeyT') || k.has('KeyF');
  }
  consumeDrag() { const d = { x: this.drag.dx, y: this.drag.dy }; this.drag.dx = 0; this.drag.dy = 0; return d; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
}
