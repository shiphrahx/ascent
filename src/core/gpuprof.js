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
