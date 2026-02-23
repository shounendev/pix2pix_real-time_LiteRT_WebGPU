/*
 * Lit web component wrapping the FLIP fluid simulation with a WebGL canvas.
 * Drop-in replacement for <drawing-canvas>: exposes getCanvas() and clear().
 */

import {html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

import {FlipFluid, AIR_CELL, FLUID_CELL, SOLID_CELL} from './flip-fluid.js';

/* tslint:disable:no-new-decorators */

const CANVAS_SIZE = 512;
const SIM_HEIGHT = 3.0;
const cScale = CANVAS_SIZE / SIM_HEIGHT;
const simWidth = CANVAS_SIZE / cScale;  // = SIM_HEIGHT (square domain)

const pointVertexShaderSrc = `
  attribute vec2 attrPosition;
  attribute vec3 attrColor;
  uniform vec2 domainSize;
  uniform float pointSize;
  uniform float drawDisk;
  varying vec3 fragColor;
  varying float fragDrawDisk;
  void main() {
    vec4 t = vec4(2.0 / domainSize.x, 2.0 / domainSize.y, -1.0, -1.0);
    gl_Position = vec4(attrPosition * t.xy + t.zw, 0.0, 1.0);
    gl_PointSize = pointSize;
    fragColor = attrColor;
    fragDrawDisk = drawDisk;
  }
`;

const pointFragmentShaderSrc = `
  precision mediump float;
  varying vec3 fragColor;
  varying float fragDrawDisk;
  void main() {
    if (fragDrawDisk == 1.0) {
      float rx = 0.5 - gl_PointCoord.x;
      float ry = 0.5 - gl_PointCoord.y;
      if (rx * rx + ry * ry > 0.25) discard;
    }
    gl_FragColor = vec4(fragColor, 1.0);
  }
`;

const meshVertexShaderSrc = `
  attribute vec2 attrPosition;
  uniform vec2 domainSize;
  uniform vec3 color;
  uniform vec2 translation;
  uniform float scale;
  varying vec3 fragColor;
  void main() {
    vec2 v = translation + attrPosition * scale;
    vec4 t = vec4(2.0 / domainSize.x, 2.0 / domainSize.y, -1.0, -1.0);
    gl_Position = vec4(v * t.xy + t.zw, 0.0, 1.0);
    fragColor = color;
  }
`;

const meshFragmentShaderSrc = `
  precision mediump float;
  varying vec3 fragColor;
  void main() {
    gl_FragColor = vec4(fragColor, 1.0);
  }
`;

@customElement('fluid-canvas')
export class FluidCanvas extends LitElement {
  private canvasRef = createRef<HTMLCanvasElement>();
  private gl!: WebGLRenderingContext;
  private fluid!: FlipFluid;
  private rafId = 0;

  // Simulation parameters
  private gravity = -9.81;
  private dt = 1.0 / 60.0;
  private flipRatio = 0.9;
  private numPressureIters = 50;
  private numParticleIters = 2;
  private overRelaxation = 1.9;
  private compensateDrift = true;
  private separateParticles = true;
  private obstacleX = 0.0;
  private obstacleY = 0.0;
  private obstacleRadius = 0.15;
  private obstacleVelX = 0.0;
  private obstacleVelY = 0.0;
  private showParticles = true;
  private showGrid = false;

  // WebGL resources (null = not yet created)
  private pointShader: WebGLProgram|null = null;
  private meshShader: WebGLProgram|null = null;
  private pointVertexBuffer: WebGLBuffer|null = null;
  private pointColorBuffer: WebGLBuffer|null = null;
  private gridVertBuffer: WebGLBuffer|null = null;
  private gridColorBuffer: WebGLBuffer|null = null;
  private diskVertBuffer: WebGLBuffer|null = null;
  private diskIdBuffer: WebGLBuffer|null = null;

  private mouseDown = false;

  override firstUpdated() {
    const canvas = this.canvasRef.value!;
    const gl = canvas.getContext('webgl', {preserveDrawingBuffer: true});
    if (!gl) {
      console.error('fluid-canvas: WebGL not supported');
      return;
    }
    this.gl = gl;
    this.setupScene();

    // Register touchmove with passive:false so preventDefault() works
    canvas.addEventListener(
        'touchmove', (e: TouchEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.drag(e.touches[0].clientX, e.touches[0].clientY);
        },
        {passive: false});

    this.runLoop();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvasRef.value!;
  }

  clear() {
    // Reset all GL buffer handles so they are recreated for the new fluid
    this.pointShader = null;
    this.meshShader = null;
    this.pointVertexBuffer = null;
    this.pointColorBuffer = null;
    this.gridVertBuffer = null;
    this.gridColorBuffer = null;
    this.diskVertBuffer = null;
    this.diskIdBuffer = null;
    this.setupScene();
  }

  // ── Simulation setup ──────────────────────────────────────────────────────

  private setupScene() {
    this.obstacleRadius = 0.15;
    this.overRelaxation = 1.9;
    this.dt = 1.0 / 60.0;
    this.numPressureIters = 50;
    this.numParticleIters = 2;

    const res = 100;
    const tankHeight = SIM_HEIGHT;
    const tankWidth = simWidth;
    const h = tankHeight / res;
    const density = 1000.0;

    const relWaterHeight = 0.8;
    const relWaterWidth = 0.6;

    const r = 0.3 * h;
    const dx = 2.0 * r;
    const dy = Math.sqrt(3.0) / 2.0 * dx;

    const numX =
        Math.floor((relWaterWidth * tankWidth - 2.0 * h - 2.0 * r) / dx);
    const numY =
        Math.floor((relWaterHeight * tankHeight - 2.0 * h - 2.0 * r) / dy);
    const maxParticles = numX * numY;

    this.fluid =
        new FlipFluid(density, tankWidth, tankHeight, h, r, maxParticles);
    const f = this.fluid;

    f.numParticles = numX * numY;
    let p = 0;
    for (let i = 0; i < numX; i++) {
      for (let j = 0; j < numY; j++) {
        f.particlePos[p++] = h + r + dx * i + (j % 2 === 0 ? 0.0 : r);
        f.particlePos[p++] = h + r + dy * j;
      }
    }

    const n = f.fNumY;
    for (let i = 0; i < f.fNumX; i++) {
      for (let j = 0; j < f.fNumY; j++) {
        let s = 1.0;
        if (i === 0 || i === f.fNumX - 1 || j === 0) s = 0.0;
        f.s[i * n + j] = s;
      }
    }

    // Place obstacle outside domain initially
    this.setObstacle(3.0, 2.0, true);
  }

  private setObstacle(x: number, y: number, reset: boolean) {
    let vx = 0.0;
    let vy = 0.0;
    if (!reset) {
      vx = (x - this.obstacleX) / this.dt;
      vy = (y - this.obstacleY) / this.dt;
    }

    this.obstacleX = x;
    this.obstacleY = y;
    const r = this.obstacleRadius;
    const f = this.fluid;
    const n = f.fNumY;  // fixed: original used f.numY (wrong property name)

    for (let i = 1; i < f.fNumX - 2; i++) {
      for (let j = 1; j < f.fNumY - 2; j++) {
        f.s[i * n + j] = 1.0;
        const ddx = (i + 0.5) * f.h - x;
        const ddy = (j + 0.5) * f.h - y;
        if (ddx * ddx + ddy * ddy < r * r) {
          f.s[i * n + j] = 0.0;
          f.u[i * n + j] = vx;
          f.u[(i + 1) * n + j] = vx;
          f.v[i * n + j] = vy;
          f.v[i * n + j + 1] = vy;
        }
      }
    }

    this.obstacleVelX = vx;
    this.obstacleVelY = vy;
  }

  // ── WebGL rendering ───────────────────────────────────────────────────────

  private createGlShader(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
      console.error('VS compile error:', gl.getShaderInfoLog(vs));

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
      console.error('FS compile error:', gl.getShaderInfoLog(fs));

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return prog;
  }

  private draw() {
    const gl = this.gl;
    const f = this.fluid;
    const canvas = this.canvasRef.value!;

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (!this.pointShader)
      this.pointShader =
          this.createGlShader(pointVertexShaderSrc, pointFragmentShaderSrc);
    if (!this.meshShader)
      this.meshShader =
          this.createGlShader(meshVertexShaderSrc, meshFragmentShaderSrc);

    const ps = this.pointShader;
    const ms = this.meshShader;

    // ── Grid cell colours ────────────────────────────────────────────────
    if (!this.gridVertBuffer) {
      this.gridVertBuffer = gl.createBuffer()!;
      const cellCenters = new Float32Array(2 * f.fNumCells);
      let p = 0;
      for (let i = 0; i < f.fNumX; i++) {
        for (let j = 0; j < f.fNumY; j++) {
          cellCenters[p++] = (i + 0.5) * f.h;
          cellCenters[p++] = (j + 0.5) * f.h;
        }
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVertBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, cellCenters, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    if (!this.gridColorBuffer) this.gridColorBuffer = gl.createBuffer()!;

    if (this.showGrid) {
      const pointSize = 0.9 * f.h / simWidth * canvas.width;
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainSize'), simWidth, SIM_HEIGHT);
      gl.uniform1f(gl.getUniformLocation(ps, 'pointSize'), pointSize);
      gl.uniform1f(gl.getUniformLocation(ps, 'drawDisk'), 0.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVertBuffer);
      const gPosLoc = gl.getAttribLocation(ps, 'attrPosition');
      gl.enableVertexAttribArray(gPosLoc);
      gl.vertexAttribPointer(gPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, f.cellColor, gl.DYNAMIC_DRAW);
      const gColorLoc = gl.getAttribLocation(ps, 'attrColor');
      gl.enableVertexAttribArray(gColorLoc);
      gl.vertexAttribPointer(gColorLoc, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, f.fNumCells);
      gl.disableVertexAttribArray(gPosLoc);
      gl.disableVertexAttribArray(gColorLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // ── Particles ────────────────────────────────────────────────────────
    if (this.showParticles) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const pointSize = 2.0 * f.particleRadius / simWidth * canvas.width;
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainSize'), simWidth, SIM_HEIGHT);
      gl.uniform1f(gl.getUniformLocation(ps, 'pointSize'), pointSize);
      gl.uniform1f(gl.getUniformLocation(ps, 'drawDisk'), 1.0);

      if (!this.pointVertexBuffer) this.pointVertexBuffer = gl.createBuffer()!;
      if (!this.pointColorBuffer) this.pointColorBuffer = gl.createBuffer()!;

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, f.particlePos, gl.DYNAMIC_DRAW);
      const pPosLoc = gl.getAttribLocation(ps, 'attrPosition');
      gl.enableVertexAttribArray(pPosLoc);
      gl.vertexAttribPointer(pPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, f.particleColor, gl.DYNAMIC_DRAW);
      const pColorLoc = gl.getAttribLocation(ps, 'attrColor');
      gl.enableVertexAttribArray(pColorLoc);
      gl.vertexAttribPointer(pColorLoc, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, f.numParticles);
      gl.disableVertexAttribArray(pPosLoc);
      gl.disableVertexAttribArray(pColorLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // ── Obstacle disk ────────────────────────────────────────────────────
    const numSegs = 50;
    if (!this.diskVertBuffer) {
      this.diskVertBuffer = gl.createBuffer()!;
      const dphi = 2.0 * Math.PI / numSegs;
      const diskVerts = new Float32Array(2 * (numSegs + 1));
      let p = 0;
      diskVerts[p++] = 0.0;
      diskVerts[p++] = 0.0;
      for (let i = 0; i < numSegs; i++) {
        diskVerts[p++] = Math.cos(i * dphi);
        diskVerts[p++] = Math.sin(i * dphi);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.diskVertBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, diskVerts, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      this.diskIdBuffer = gl.createBuffer()!;
      const diskIds = new Uint16Array(3 * numSegs);
      let q = 0;
      for (let i = 0; i < numSegs; i++) {
        diskIds[q++] = 0;
        diskIds[q++] = 1 + i;
        diskIds[q++] = 1 + (i + 1) % numSegs;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.diskIdBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, diskIds, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(ms);
    gl.uniform2f(gl.getUniformLocation(ms, 'domainSize'), simWidth, SIM_HEIGHT);
    gl.uniform3f(gl.getUniformLocation(ms, 'color'), 1.0, 0.0, 0.0);
    gl.uniform2f(
        gl.getUniformLocation(ms, 'translation'), this.obstacleX,
        this.obstacleY);
    gl.uniform1f(
        gl.getUniformLocation(ms, 'scale'),
        this.obstacleRadius + f.particleRadius);

    const dPosLoc = gl.getAttribLocation(ms, 'attrPosition');
    gl.enableVertexAttribArray(dPosLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.diskVertBuffer);
    gl.vertexAttribPointer(dPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.diskIdBuffer);
    gl.drawElements(gl.TRIANGLES, 3 * numSegs, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(dPosLoc);
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  private runLoop() {
    this.fluid.simulate(
        this.dt, this.gravity, this.flipRatio, this.numPressureIters,
        this.numParticleIters, this.overRelaxation, this.compensateDrift,
        this.separateParticles, this.obstacleX, this.obstacleY,
        this.obstacleRadius, this.obstacleVelX, this.obstacleVelY);
    this.draw();
    this.rafId = requestAnimationFrame(() => this.runLoop());
  }

  // ── Input handling ────────────────────────────────────────────────────────

  private startDrag(clientX: number, clientY: number) {
    const canvas = this.canvasRef.value!;
    const bounds = canvas.getBoundingClientRect();
    // Map from CSS pixels to simulation coordinates; flip Y (WebGL origin at bottom)
    const x = ((clientX - bounds.left) / bounds.width) * simWidth;
    const y = (1.0 - (clientY - bounds.top) / bounds.height) * SIM_HEIGHT;
    this.mouseDown = true;
    this.setObstacle(x, y, true);
  }

  private drag(clientX: number, clientY: number) {
    if (!this.mouseDown) return;
    const canvas = this.canvasRef.value!;
    const bounds = canvas.getBoundingClientRect();
    const x = ((clientX - bounds.left) / bounds.width) * simWidth;
    const y = (1.0 - (clientY - bounds.top) / bounds.height) * SIM_HEIGHT;
    this.setObstacle(x, y, false);
  }

  private endDrag() {
    this.mouseDown = false;
    this.obstacleVelX = 0.0;
    this.obstacleVelY = 0.0;
  }

  // ── Lit template ──────────────────────────────────────────────────────────

  static override styles = [];  // no inherited styles; styling via inline style

  override render() {
    return html`
      <style>
        :host { display: block; }
        .fluid-controls {
          font-size: 12px;
          padding: 4px 0;
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          color: #5f6368;
        }
        .fluid-controls label { display: flex; align-items: center; gap: 3px; cursor: pointer; }
        .fluid-controls input[type=range] { width: 60px; }
      </style>
      <div class="fluid-controls">
        <label>
          <input type="checkbox" ?checked=${this.showParticles}
            @change=${(e: Event) => { this.showParticles = (e.target as HTMLInputElement).checked; }}>
          Particles
        </label>
        <label>
          <input type="checkbox" ?checked=${this.showGrid}
            @change=${(e: Event) => { this.showGrid = (e.target as HTMLInputElement).checked; }}>
          Grid
        </label>
        <label>
          <input type="checkbox" ?checked=${this.compensateDrift}
            @change=${(e: Event) => { this.compensateDrift = (e.target as HTMLInputElement).checked; }}>
          Drift
        </label>
        <label>
          <input type="checkbox" ?checked=${this.separateParticles}
            @change=${(e: Event) => { this.separateParticles = (e.target as HTMLInputElement).checked; }}>
          Separate
        </label>
        <span>PIC</span>
        <input type="range" min="0" max="10" value="9"
          @change=${(e: Event) => { this.flipRatio = 0.1 * (e.target as HTMLInputElement).valueAsNumber; }}>
        <span>FLIP</span>
      </div>
      <canvas
        ${ref(this.canvasRef)}
        width=${CANVAS_SIZE}
        height=${CANVAS_SIZE}
        style="display:block;width:100%;touch-action:none;"
        @mousedown=${(e: MouseEvent) => this.startDrag(e.clientX, e.clientY)}
        @mouseup=${() => this.endDrag()}
        @mousemove=${(e: MouseEvent) => this.drag(e.clientX, e.clientY)}
        @mouseleave=${() => this.endDrag()}
        @touchstart=${(e: TouchEvent) => this.startDrag(e.touches[0].clientX, e.touches[0].clientY)}
        @touchend=${() => this.endDrag()}
      ></canvas>
    `;
  }
}

// Re-export so index.ts can import the type
export {FluidCanvas as default};
