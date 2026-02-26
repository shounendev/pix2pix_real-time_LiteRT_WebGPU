/*
 * Lit web component wrapping the FLIP fluid simulation with a WebGL canvas.
 * Drop-in replacement for <drawing-canvas>: exposes getCanvas() and clear().
 */

import {html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

import {FlipFluid, AIR_CELL, FLUID_CELL, SOLID_CELL} from './flip-fluid.js';

/* tslint:disable:no-new-decorators */

const CANVAS_SIZE = 512;
const CROP_CELLS = 2;

const pointVertexShaderSrc = `
  attribute vec2 attrPosition;
  attribute vec3 attrColor;
  uniform vec2 domainSize;
  uniform vec2 domainOffset;
  uniform float pointSize;
  uniform float drawDisk;
  varying vec3 fragColor;
  varying float fragDrawDisk;
  void main() {
    vec4 t = vec4(2.0 / domainSize.x, 2.0 / domainSize.y,
                  -(domainOffset.x * 2.0 / domainSize.x + 1.0),
                  -(domainOffset.y * 2.0 / domainSize.y + 1.0));
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
  uniform vec2 domainOffset;
  uniform vec3 color;
  uniform vec2 translation;
  uniform float scale;
  varying vec3 fragColor;
  void main() {
    vec2 v = translation + attrPosition * scale;
    vec4 t = vec4(2.0 / domainSize.x, 2.0 / domainSize.y,
                  -(domainOffset.x * 2.0 / domainSize.x + 1.0),
                  -(domainOffset.y * 2.0 / domainSize.y + 1.0));
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
  private damping = 0.01;
  private dt = 1.0 / 60.0;
  private flipRatio = 0.9;
  private numPressureIters = 50;
  private numParticleIters = 2;
  private overRelaxation = 1.9;
  private compensateDrift = true;
  private separateParticles = true;
  private obstacleX = 0.0;
  private obstacleY = 0.0;
  private obstacleScreenFraction = 0.1;
  private get obstacleRadius() { return this.obstacleScreenFraction * this.simHeight; }
  private obstacleVelX = 0.0;
  private obstacleVelY = 0.0;
  private showParticles = true;
  private showGrid = false;
  private showVelocity = false;
  private particleVelColor = false;
  private velScale = 1.0;
  @state() private resSlider = 50;
  @state() private particlePercent = 100;
  @state() private paused = false;
  @state() private gravitySlider = -9.81;

  private get simHeight() { return 3.0 * this.resSlider / 100; }
  private get simWidth()  { return this.simHeight; }
  private get cropOffset() { return CROP_CELLS * this.fluid.h; }
  private get visibleWidth() { return this.simWidth - 2 * this.cropOffset; }
  private get visibleHeight() { return this.simHeight - 2 * this.cropOffset; }
  private get cScale()    { return CANVAS_SIZE / this.visibleHeight; }

  // WebGL resources (null = not yet created)
  private pointShader: WebGLProgram|null = null;
  private meshShader: WebGLProgram|null = null;
  private pointVertexBuffer: WebGLBuffer|null = null;
  private pointColorBuffer: WebGLBuffer|null = null;
  private gridVertBuffer: WebGLBuffer|null = null;
  private gridColorBuffer: WebGLBuffer|null = null;
  private velColorBuffer: WebGLBuffer|null = null;
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
    this.setupGridBuffers();
    this.setupVelocityBuffer();
    this.setupParticleBuffers();

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
    this.overRelaxation = 1.9;
    this.dt = 1.0 / 60.0;
    this.numPressureIters = 50;
    this.numParticleIters = 2;

    const res = this.resSlider;
    const tankHeight = this.simHeight;
    const tankWidth = this.simWidth;
    const h = tankHeight / res;
    const density = 1000.0;

    const relWaterHeight = 0.85;
    const relWaterWidth = 1.0;

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
        if (i === 0 || i === f.fNumX - 1) s = 0.0;
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

  // ── Reinitialise on resolution change ────────────────────────────────────

  private reinit() {
    cancelAnimationFrame(this.rafId);
    const gl = this.gl;
    gl.deleteBuffer(this.gridVertBuffer);
    gl.deleteBuffer(this.gridColorBuffer);
    gl.deleteBuffer(this.velColorBuffer);
    gl.deleteBuffer(this.pointVertexBuffer);
    gl.deleteBuffer(this.pointColorBuffer);
    this.gridVertBuffer = null;
    this.gridColorBuffer = null;
    this.velColorBuffer = null;
    this.pointVertexBuffer = null;
    this.pointColorBuffer = null;
    this.setupScene();
    this.setupGridBuffers();
    this.setupVelocityBuffer();
    this.setupParticleBuffers();
    this.rafId = requestAnimationFrame(() => this.runLoop());
  }

  private setupGridBuffers() {
    const gl = this.gl;
    const f = this.fluid;
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
    this.gridColorBuffer = gl.createBuffer()!;
  }

  private setupVelocityBuffer() {
    this.velColorBuffer = this.gl.createBuffer()!;
  }

  private setupParticleBuffers() {
    const gl = this.gl;
    this.pointVertexBuffer = gl.createBuffer()!;
    this.pointColorBuffer = gl.createBuffer()!;
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
    if (this.showGrid) {
      const pointSize = 0.9 * f.h / this.visibleWidth * canvas.width;
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainSize'), this.visibleWidth, this.visibleHeight);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainOffset'), this.cropOffset, this.cropOffset);
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

    // ── Velocity colours ─────────────────────────────────────────────────
    if (this.showVelocity) {
      const n = f.fNumY;
      const scale = this.velScale;
      const velColors = new Float32Array(3 * f.fNumCells);
      for (let i = 0; i < f.fNumX; i++) {
        for (let j = 0; j < f.fNumY; j++) {
          const ci = i * n + j;
          const uc = (f.u[ci] + (i + 1 < f.fNumX ? f.u[(i + 1) * n + j] : 0.0)) * 0.5;
          const vc = (f.v[ci] + (j + 1 < f.fNumY ? f.v[i * n + j + 1] : 0.0)) * 0.5;
          velColors[3 * ci]     = Math.min(-vc * scale + 0.5, 1.0);  // R
          //velColors[3 * ci]     = 0;  // R
          velColors[3 * ci + 1] = Math.min(-uc * scale + 0.5, 1.0);  // G
          //velColors[3 * ci + 1]     = 0;  // R
          velColors[3 * ci + 2] = 0.0;                                    // B
        }
      }
      const pointSize = 0.9 * f.h / this.visibleWidth * canvas.width;
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainSize'), this.visibleWidth, this.visibleHeight);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainOffset'), this.cropOffset, this.cropOffset);
      gl.uniform1f(gl.getUniformLocation(ps, 'pointSize'), pointSize);
      gl.uniform1f(gl.getUniformLocation(ps, 'drawDisk'), 0.0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.gridVertBuffer);
      const vPosLoc = gl.getAttribLocation(ps, 'attrPosition');
      gl.enableVertexAttribArray(vPosLoc);
      gl.vertexAttribPointer(vPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.velColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, velColors, gl.DYNAMIC_DRAW);
      const vColorLoc = gl.getAttribLocation(ps, 'attrColor');
      gl.enableVertexAttribArray(vColorLoc);
      gl.vertexAttribPointer(vColorLoc, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, f.fNumCells);
      gl.disableVertexAttribArray(vPosLoc);
      gl.disableVertexAttribArray(vColorLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // ── Particles ────────────────────────────────────────────────────────
    if (this.showParticles) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const pointSize = 2.0 * f.particleRadius / this.visibleWidth * canvas.width;
      gl.useProgram(ps);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainSize'), this.visibleWidth, this.visibleHeight);
      gl.uniform2f(gl.getUniformLocation(ps, 'domainOffset'), this.cropOffset, this.cropOffset);
      gl.uniform1f(gl.getUniformLocation(ps, 'pointSize'), pointSize);
      gl.uniform1f(gl.getUniformLocation(ps, 'drawDisk'), 1.0);

      // Compute step from percentage (e.g. 50% → every 2nd particle)
      const step = this.particlePercent >= 100 ? 1 : Math.max(1, Math.round(100 / this.particlePercent));
      const drawCount = step === 1 ? f.numParticles : Math.ceil(f.numParticles / step);

      let drawPos: Float32Array;
      let drawColors: Float32Array;

      // Build base colours (velocity or density)
      let particleColors = f.particleColor;
      if (this.particleVelColor) {
        const scale = this.velScale;
        const n = f.numParticles;
        const velColors = new Float32Array(3 * n);
        for (let i = 0; i < n; i++) {
          const vx = f.particleVel[2 * i];
          const vy = f.particleVel[2 * i + 1];
          velColors[3 * i]     = Math.max(0.0, Math.min(-vy * scale + 0.5, 1.0));
          velColors[3 * i + 1] = Math.max(0.0, Math.min(-vx * scale + 0.5, 1.0));
          velColors[3 * i + 2] = 0.0;
        }
        particleColors = velColors;
      }

      if (step === 1) {
        drawPos = f.particlePos;
        drawColors = particleColors;
      } else {
        // Pick every nth particle
        drawPos = new Float32Array(2 * drawCount);
        drawColors = new Float32Array(3 * drawCount);
        for (let i = 0, src = 0; src < f.numParticles; src += step, i++) {
          drawPos[2 * i]     = f.particlePos[2 * src];
          drawPos[2 * i + 1] = f.particlePos[2 * src + 1];
          drawColors[3 * i]     = particleColors[3 * src];
          drawColors[3 * i + 1] = particleColors[3 * src + 1];
          drawColors[3 * i + 2] = particleColors[3 * src + 2];
        }
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointVertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, drawPos, gl.DYNAMIC_DRAW);
      const pPosLoc = gl.getAttribLocation(ps, 'attrPosition');
      gl.enableVertexAttribArray(pPosLoc);
      gl.vertexAttribPointer(pPosLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointColorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, drawColors, gl.DYNAMIC_DRAW);
      const pColorLoc = gl.getAttribLocation(ps, 'attrColor');
      gl.enableVertexAttribArray(pColorLoc);
      gl.vertexAttribPointer(pColorLoc, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, drawCount);
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
    gl.uniform2f(gl.getUniformLocation(ms, 'domainSize'), this.visibleWidth, this.visibleHeight);
    gl.uniform2f(gl.getUniformLocation(ms, 'domainOffset'), this.cropOffset, this.cropOffset);
    gl.uniform3f(gl.getUniformLocation(ms, 'color'), 0.0, 0.0, 0.0);
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
    if (!this.paused) {
      this.fluid.simulate(
          this.dt, this.gravitySlider, this.flipRatio, this.numPressureIters,
          this.numParticleIters, this.overRelaxation, this.compensateDrift,
          this.separateParticles, this.obstacleX, this.obstacleY,
          this.obstacleRadius, this.obstacleVelX, this.obstacleVelY,
          this.damping);
    }
    this.draw();
    this.rafId = requestAnimationFrame(() => this.runLoop());
  }

  // ── Input handling ────────────────────────────────────────────────────────

  private startDrag(clientX: number, clientY: number) {
    const canvas = this.canvasRef.value!;
    const bounds = canvas.getBoundingClientRect();
    // Map from CSS pixels to simulation coordinates; flip Y (WebGL origin at bottom)
    const x = ((clientX - bounds.left) / bounds.width) * this.visibleWidth + this.cropOffset;
    const y = (1.0 - (clientY - bounds.top) / bounds.height) * this.visibleHeight + this.cropOffset;
    this.mouseDown = true;
    this.setObstacle(x, y, true);
  }

  private drag(clientX: number, clientY: number) {
    if (!this.mouseDown) return;
    const canvas = this.canvasRef.value!;
    const bounds = canvas.getBoundingClientRect();
    const x = ((clientX - bounds.left) / bounds.width) * this.visibleWidth + this.cropOffset;
    const y = (1.0 - (clientY - bounds.top) / bounds.height) * this.visibleHeight + this.cropOffset;
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
        .fluid-controls button {
          font-size: 12px; padding: 1px 8px; cursor: pointer;
        }
      </style>
      <div class="fluid-controls">
        <button @click=${() => { this.paused = !this.paused; }}>
          ${this.paused ? 'Resume' : 'Pause'}
        </button>
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
          <input type="checkbox" ?checked=${this.showVelocity}
            @change=${(e: Event) => { this.showVelocity = (e.target as HTMLInputElement).checked; }}>
          Velocity
        </label>
        <label>
          <input type="checkbox" ?checked=${this.particleVelColor}
            @change=${(e: Event) => { this.particleVelColor = (e.target as HTMLInputElement).checked; }}>
          Vel Color
        </label>
        <input type="range" min="0.001" max="1" step="0.001" .value=${String(Math.round(this.velScale * 2))}
          @input=${(e: Event) => { this.velScale = (e.target as HTMLInputElement).valueAsNumber; }}>
        <span>×${this.velScale.toFixed(1)}</span>
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
        <label>Particles</label>
        <input type="range" min="1" max="100" step="1"
          .value=${String(this.particlePercent)}
          @input=${(e: Event) => {
            this.particlePercent = Number((e.target as HTMLInputElement).value);
          }}>
        <span>${this.particlePercent}%</span>
        <label>Sim Res</label>
        <input type="range" min="10" max="100" step="10"
          .value=${String(this.resSlider)}
          @change=${(e: Event) => {
            this.resSlider = Number((e.target as HTMLInputElement).value);
            this.reinit();
          }}>
        <span>${this.resSlider}%</span>
        <label>Gravity</label>
        <input type="range" min="-20" max="20" step="0.1"
          .value=${String(this.gravitySlider)}
          @input=${(e: Event) => {
            this.gravitySlider = (e.target as HTMLInputElement).valueAsNumber;
          }}>
        <span>${this.gravitySlider.toFixed(1)}</span>
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
