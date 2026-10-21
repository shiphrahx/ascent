// Non-blocking GPU readback: read a float target into a fresh pixel-pack buffer, unbind straight away,
// and poll its fence once a frame. three's own async read keeps the pack buffer bound while it waits,
// which breaks every other readPixels in the meantime, and reusing one buffer made Chrome throw away
// its readback copy (and say so in the console every frame).
export class AsyncReader {
  constructor(renderer, rt) {
    this.renderer = renderer; this.rt = rt;
    this.buf = new Float32Array(rt.width * rt.height * 4);
    this.sync = null; this.pbo = null;
  }
  // call once a frame after rt has been drawn; returns true on the frame new data lands in buf
  poll() {
    const gl = this.renderer.getContext();
    if (this.sync) {
      if (gl.getSyncParameter(this.sync, gl.SYNC_STATUS) !== gl.SIGNALED) return false;
      gl.deleteSync(this.sync); this.sync = null;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.buf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      gl.deleteBuffer(this.pbo); this.pbo = null;
      return true;
    }
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.buf.byteLength, gl.STREAM_READ);
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    gl.readPixels(0, 0, this.rt.width, this.rt.height, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.renderer.setRenderTarget(prev);
    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    return false;
  }
}
