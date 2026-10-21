// GPU time per pass from EXT_disjoint_timer_query_webgl2. Only switched on by the #gpuprof test hook.
// Queries can't nest, so passes are timed back to back; results arrive a few frames late and are
// averaged. window.__dbg.gpu() returns { pass: ms }.
export class GpuProf {
  constructor(gl, on) {
    this.gl = gl;
    this.ext = on ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.pending = [];
    this.avg = {};
    this.cur = null;
  }
  begin(name) {
    if (!this.ext) return;
    this.end();
    const q = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.cur = { q, name };
  }
  end() {
    if (!this.ext || !this.cur) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.cur);
    this.cur = null;
  }
  // call once per frame after the last pass
  collect() {
    if (!this.ext) return;
    this.end();
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    const keep = [];
    for (const p of this.pending) {
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { keep.push(p); continue; }
      const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
      if (!disjoint) {
        const a = this.avg[p.name] || (this.avg[p.name] = { ms, n: 0 });
        a.ms += (ms - a.ms) * 0.05; a.n++;
      }
      gl.deleteQuery(p.q);
    }
    this.pending = keep.length > 200 ? keep.slice(-200) : keep;
  }
  report() {
    const o = {};
    let total = 0;
    for (const [k, v] of Object.entries(this.avg)) { o[k] = +v.ms.toFixed(2); total += v.ms; }
    o.total = +total.toFixed(2);
    return o;
  }
}

// One timer around the whole frame's GPU work, for the resolution governor. Frame intervals are
// rounded to whole vsync periods, so they can't tell 17ms of work from 30; this can.
export class FrameTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = []; this.cur = null;
    this.ms = 0; this.samples = 0;
  }
  get ok() { return !!this.ext && this.samples > 10; }
  begin() {
    if (!this.ext || this.cur || this.pending.length > 6) return;
    this.cur = this.gl.createQuery();
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.cur);
  }
  end() {
    if (!this.cur) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.cur); this.cur = null;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pending.length && gl.getQueryParameter(this.pending[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift();
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      if (disjoint || !(ms > 0)) continue;
      this.ms = this.samples++ ? this.ms + (ms - this.ms) * 0.1 : ms;
    }
  }
}
