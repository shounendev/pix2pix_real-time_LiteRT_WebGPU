/*
 * TypeScript port of FlipFluid from fluid.html
 * Original: Copyright 2022 Matthias Müller - Ten Minute Physics (MIT License)
 */

export const U_FIELD = 0;
export const V_FIELD = 1;

export const FLUID_CELL = 0;
export const AIR_CELL = 1;
export const SOLID_CELL = 2;

function clamp(x: number, min: number, max: number): number {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export class FlipFluid {
  density: number;
  fNumX: number;
  fNumY: number;
  h: number;
  fInvSpacing: number;
  fNumCells: number;

  u: Float32Array;
  v: Float32Array;
  du: Float32Array;
  dv: Float32Array;
  prevU: Float32Array;
  prevV: Float32Array;
  p: Float32Array;
  s: Float32Array;
  cellType: Int32Array;
  cellColor: Float32Array;

  maxParticles: number;
  particlePos: Float32Array;
  particleColor: Float32Array;
  particleVel: Float32Array;
  particleDensity: Float32Array;
  particleRestDensity: number;

  particleRadius: number;
  pInvSpacing: number;
  pNumX: number;
  pNumY: number;
  pNumCells: number;

  numCellParticles: Int32Array;
  firstCellParticle: Int32Array;
  cellParticleIds: Int32Array;

  numParticles: number;

  constructor(
      density: number, width: number, height: number, spacing: number,
      particleRadius: number, maxParticles: number) {
    this.density = density;
    this.fNumX = Math.floor(width / spacing) + 1;
    this.fNumY = Math.floor(height / spacing) + 1;
    this.h = Math.max(width / this.fNumX, height / this.fNumY);
    this.fInvSpacing = 1.0 / this.h;
    this.fNumCells = this.fNumX * this.fNumY;

    this.u = new Float32Array(this.fNumCells);
    this.v = new Float32Array(this.fNumCells);
    this.du = new Float32Array(this.fNumCells);
    this.dv = new Float32Array(this.fNumCells);
    this.prevU = new Float32Array(this.fNumCells);
    this.prevV = new Float32Array(this.fNumCells);
    this.p = new Float32Array(this.fNumCells);
    this.s = new Float32Array(this.fNumCells);
    this.cellType = new Int32Array(this.fNumCells);
    this.cellColor = new Float32Array(3 * this.fNumCells);

    this.maxParticles = maxParticles;

    this.particlePos = new Float32Array(2 * this.maxParticles);
    this.particleColor = new Float32Array(3 * this.maxParticles);
    for (let i = 0; i < this.maxParticles; i++)
      this.particleColor[3 * i + 2] = 1.0;

    this.particleVel = new Float32Array(2 * this.maxParticles);
    this.particleDensity = new Float32Array(this.fNumCells);
    this.particleRestDensity = 0.0;

    this.particleRadius = particleRadius;
    this.pInvSpacing = 1.0 / (2.2 * particleRadius);
    this.pNumX = Math.floor(width * this.pInvSpacing) + 1;
    this.pNumY = Math.floor(height * this.pInvSpacing) + 1;
    this.pNumCells = this.pNumX * this.pNumY;

    this.numCellParticles = new Int32Array(this.pNumCells);
    this.firstCellParticle = new Int32Array(this.pNumCells + 1);
    this.cellParticleIds = new Int32Array(maxParticles);

    this.numParticles = 0;
  }

  integrateParticles(dt: number, gravity: number, damping: number) {
    for (let i = 0; i < this.numParticles; i++) {
      this.particleVel[2 * i + 1] += dt * gravity;
      this.particleVel[2 * i] -= this.particleVel[2 * i] * this.particleVel[2 * i] * damping * Math.sign(this.particleVel[2 * i]);
      this.particleVel[2 * i + 1] -= this.particleVel[2 * i + 1] * this.particleVel[2 * i + 1] * damping * Math.sign(this.particleVel[2 * i + 1]);
      this.particlePos[2 * i] += this.particleVel[2 * i] * dt;
      this.particlePos[2 * i + 1] += this.particleVel[2 * i + 1] * dt;
    }
  }

  pushParticlesApart(numIters: number) {
    const colorDiffusionCoeff = 0.001;

    this.numCellParticles.fill(0);

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];
      const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      const cellNr = xi * this.pNumY + yi;
      this.numCellParticles[cellNr]++;
    }

    let first = 0;
    for (let i = 0; i < this.pNumCells; i++) {
      first += this.numCellParticles[i];
      this.firstCellParticle[i] = first;
    }
    this.firstCellParticle[this.pNumCells] = first;

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];
      const xi = clamp(Math.floor(x * this.pInvSpacing), 0, this.pNumX - 1);
      const yi = clamp(Math.floor(y * this.pInvSpacing), 0, this.pNumY - 1);
      const cellNr = xi * this.pNumY + yi;
      this.firstCellParticle[cellNr]--;
      this.cellParticleIds[this.firstCellParticle[cellNr]] = i;
    }

    const minDist = 2.0 * this.particleRadius;
    const minDist2 = minDist * minDist;

    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 0; i < this.numParticles; i++) {
        const px = this.particlePos[2 * i];
        const py = this.particlePos[2 * i + 1];

        const pxi = Math.floor(px * this.pInvSpacing);
        const pyi = Math.floor(py * this.pInvSpacing);
        const x0 = Math.max(pxi - 1, 0);
        const y0 = Math.max(pyi - 1, 0);
        const x1 = Math.min(pxi + 1, this.pNumX - 1);
        const y1 = Math.min(pyi + 1, this.pNumY - 1);

        for (let xi = x0; xi <= x1; xi++) {
          for (let yi = y0; yi <= y1; yi++) {
            const cellNr = xi * this.pNumY + yi;
            const cellFirst = this.firstCellParticle[cellNr];
            const cellLast = this.firstCellParticle[cellNr + 1];
            for (let j = cellFirst; j < cellLast; j++) {
              const id = this.cellParticleIds[j];
              if (id === i) continue;
              const qx = this.particlePos[2 * id];
              const qy = this.particlePos[2 * id + 1];
              let dx = qx - px;
              let dy = qy - py;
              const d2 = dx * dx + dy * dy;
              if (d2 > minDist2 || d2 === 0.0) continue;
              const d = Math.sqrt(d2);
              const s = 0.5 * (minDist - d) / d;
              dx *= s;
              dy *= s;
              this.particlePos[2 * i] -= dx;
              this.particlePos[2 * i + 1] -= dy;
              this.particlePos[2 * id] += dx;
              this.particlePos[2 * id + 1] += dy;

              for (let k = 0; k < 3; k++) {
                const color0 = this.particleColor[3 * i + k];
                const color1 = this.particleColor[3 * id + k];
                const color = (color0 + color1) * 0.5;
                this.particleColor[3 * i + k] =
                    color0 + (color - color0) * colorDiffusionCoeff;
                this.particleColor[3 * id + k] =
                    color1 + (color - color1) * colorDiffusionCoeff;
              }
            }
          }
        }
      }
    }
  }

  // obstacleVelX/Y replaces the original's reference to scene.obstacleVelX/Y
  handleParticleCollisions(
      obstacleX: number, obstacleY: number, obstacleRadius: number,
      obstacleVelX: number, obstacleVelY: number) {
    const h = 1.0 / this.fInvSpacing;
    const r = this.particleRadius;
    const minDist = obstacleRadius + r;
    const minDist2 = minDist * minDist;

    const minX = h + r;
    const maxX = (this.fNumX - 1) * h - r;
    const minY = h + r;
    const maxY = (this.fNumY - 1) * h - r;

    for (let i = 0; i < this.numParticles; i++) {
      let x = this.particlePos[2 * i];
      let y = this.particlePos[2 * i + 1];

      const dx = x - obstacleX;
      const dy = y - obstacleY;
      const d2 = dx * dx + dy * dy;

      if (d2 < minDist2) {
        let vx = this.particleVel[2 * i];
        let vy = this.particleVel[2 * i + 1];

        // add velocity of moving obstacel
        this.particleVel[2 * i] += obstacleVelX;
        this.particleVel[2 * i + 1] += obstacleVelY;

        // obstacle normal
        let d = Math.sqrt(d2);
        let nx = dx / d
        let ny = dy / d

        x += nx * (minDist - d) * 1;
        y += ny * (minDist - d) * 1;

        this.particleVel[2 * i] -= nx * d2 *3;
        this.particleVel[2 * i + 1] -= ny * d2*3;
      }

      if (x < minX) {
        x = minX;
        this.particleVel[2 * i] = 0.0;
      }
      if (x > maxX) {
        x = maxX;
        this.particleVel[2 * i] = 0.0;
      }
      if (y < minY) {
        y = maxY+y;
      }
      if (y > maxY) {
        y = minY + (y - maxY);
      }

      this.particlePos[2 * i] = x;
      this.particlePos[2 * i + 1] = y;
    }
  }

  updateParticleDensity() {
    const n = this.fNumY;
    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    // Fixed: original had f.particleDensity (global ref), use this.particleDensity
    const d = this.particleDensity;
    d.fill(0.0);

    for (let i = 0; i < this.numParticles; i++) {
      let x = this.particlePos[2 * i];
      let y = this.particlePos[2 * i + 1];

      x = clamp(x, h, (this.fNumX - 1) * h);
      y = clamp(y, h, (this.fNumY - 1) * h);

      const x0 = Math.floor((x - h2) * h1);
      const tx = ((x - h2) - x0 * h) * h1;
      const x1 = Math.min(x0 + 1, this.fNumX - 2);

      const y0 = Math.floor((y - h2) * h1);
      const ty = ((y - h2) - y0 * h) * h1;
      const y1 = Math.min(y0 + 1, this.fNumY - 2);

      const sx = 1.0 - tx;
      const sy = 1.0 - ty;

      if (x0 < this.fNumX && y0 < this.fNumY) d[x0 * n + y0] += sx * sy;
      if (x1 < this.fNumX && y0 < this.fNumY) d[x1 * n + y0] += tx * sy;
      if (x1 < this.fNumX && y1 < this.fNumY) d[x1 * n + y1] += tx * ty;
      if (x0 < this.fNumX && y1 < this.fNumY) d[x0 * n + y1] += sx * ty;
    }

    if (this.particleRestDensity === 0.0) {
      let sum = 0.0;
      let numFluidCells = 0;

      for (let i = 0; i < this.fNumCells; i++) {
        if (this.cellType[i] === FLUID_CELL) {
          sum += d[i];
          numFluidCells++;
        }
      }

      if (numFluidCells > 0) this.particleRestDensity = sum / numFluidCells;
    }
  }

  transferVelocities(toGrid: boolean, flipRatio = 0.0) {
    const n = this.fNumY;
    const h = this.h;
    const h1 = this.fInvSpacing;
    const h2 = 0.5 * h;

    if (toGrid) {
      this.prevU.set(this.u);
      this.prevV.set(this.v);
      this.du.fill(0.0);
      this.dv.fill(0.0);
      this.u.fill(0.0);
      this.v.fill(0.0);

      for (let i = 0; i < this.fNumCells; i++)
        this.cellType[i] = this.s[i] === 0.0 ? SOLID_CELL : AIR_CELL;

      for (let i = 0; i < this.numParticles; i++) {
        const x = this.particlePos[2 * i];
        const y = this.particlePos[2 * i + 1];
        const xi = clamp(Math.floor(x * h1), 0, this.fNumX - 1);
        const yi = clamp(Math.floor(y * h1), 0, this.fNumY - 1);
        const cellNr = xi * n + yi;
        if (this.cellType[cellNr] === AIR_CELL) this.cellType[cellNr] = FLUID_CELL;
      }
    }

    for (let component = 0; component < 2; component++) {
      const dx = component === 0 ? 0.0 : h2;
      const dy = component === 0 ? h2 : 0.0;

      const f = component === 0 ? this.u : this.v;
      const prevF = component === 0 ? this.prevU : this.prevV;
      const weight = component === 0 ? this.du : this.dv;

      for (let i = 0; i < this.numParticles; i++) {
        let x = this.particlePos[2 * i];
        let y = this.particlePos[2 * i + 1];

        x = clamp(x, h, (this.fNumX - 1) * h);
        y = clamp(y, h, (this.fNumY - 1) * h);

        const x0 = Math.min(Math.floor((x - dx) * h1), this.fNumX - 2);
        const tx = ((x - dx) - x0 * h) * h1;
        const x1 = Math.min(x0 + 1, this.fNumX - 2);

        const y0 = Math.min(Math.floor((y - dy) * h1), this.fNumY - 2);
        const ty = ((y - dy) - y0 * h) * h1;
        const y1 = Math.min(y0 + 1, this.fNumY - 2);

        const sx = 1.0 - tx;
        const sy = 1.0 - ty;

        const d0 = sx * sy;
        const d1 = tx * sy;
        const d2 = tx * ty;
        const d3 = sx * ty;

        const nr0 = x0 * n + y0;
        const nr1 = x1 * n + y0;
        const nr2 = x1 * n + y1;
        const nr3 = x0 * n + y1;

        if (toGrid) {
          const pv = this.particleVel[2 * i + component];
          f[nr0] += pv * d0;
          weight[nr0] += d0;
          f[nr1] += pv * d1;
          weight[nr1] += d1;
          f[nr2] += pv * d2;
          weight[nr2] += d2;
          f[nr3] += pv * d3;
          weight[nr3] += d3;
        } else {
          const offset = component === 0 ? n : 1;
          const valid0 =
              (this.cellType[nr0] !== AIR_CELL ||
               this.cellType[nr0 - offset] !== AIR_CELL) ?
              1.0 :
              0.0;
          const valid1 =
              (this.cellType[nr1] !== AIR_CELL ||
               this.cellType[nr1 - offset] !== AIR_CELL) ?
              1.0 :
              0.0;
          const valid2 =
              (this.cellType[nr2] !== AIR_CELL ||
               this.cellType[nr2 - offset] !== AIR_CELL) ?
              1.0 :
              0.0;
          const valid3 =
              (this.cellType[nr3] !== AIR_CELL ||
               this.cellType[nr3 - offset] !== AIR_CELL) ?
              1.0 :
              0.0;

          const v = this.particleVel[2 * i + component];
          const totalWeight =
              valid0 * d0 + valid1 * d1 + valid2 * d2 + valid3 * d3;

          if (totalWeight > 0.0) {
            const picV =
                (valid0 * d0 * f[nr0] + valid1 * d1 * f[nr1] +
                 valid2 * d2 * f[nr2] + valid3 * d3 * f[nr3]) /
                totalWeight;
            const corr =
                (valid0 * d0 * (f[nr0] - prevF[nr0]) +
                 valid1 * d1 * (f[nr1] - prevF[nr1]) +
                 valid2 * d2 * (f[nr2] - prevF[nr2]) +
                 valid3 * d3 * (f[nr3] - prevF[nr3])) /
                totalWeight;
            const flipV = v + corr;
            this.particleVel[2 * i + component] =
                (1.0 - flipRatio) * picV + flipRatio * flipV;
          }
        }
      }

      if (toGrid) {
        for (let i = 0; i < f.length; i++) {
          if (weight[i] > 0.0) f[i] /= weight[i];
        }

        for (let i = 0; i < this.fNumX; i++) {
          for (let j = 0; j < this.fNumY; j++) {
            const solid = this.cellType[i * n + j] === SOLID_CELL;
            if (solid || (i > 0 && this.cellType[(i - 1) * n + j] === SOLID_CELL))
              this.u[i * n + j] = this.prevU[i * n + j];
            if (solid || (j > 0 && this.cellType[i * n + j - 1] === SOLID_CELL))
              this.v[i * n + j] = this.prevV[i * n + j];
          }
        }
      }
    }
  }

  solveIncompressibility(
      numIters: number, dt: number, overRelaxation: number,
      compensateDrift = true) {
    this.p.fill(0.0);
    this.prevU.set(this.u);
    this.prevV.set(this.v);

    const n = this.fNumY;
    const cp = this.density * this.h / dt;

    for (let iter = 0; iter < numIters; iter++) {
      for (let i = 1; i < this.fNumX - 1; i++) {
        for (let j = 1; j < this.fNumY - 1; j++) {
          if (this.cellType[i * n + j] !== FLUID_CELL) continue;

          const center = i * n + j;
          const left = (i - 1) * n + j;
          const right = (i + 1) * n + j;
          const bottom = i * n + j - 1;
          const top = i * n + j + 1;

          const sx0 = this.s[left];
          const sx1 = this.s[right];
          const sy0 = this.s[bottom];
          const sy1 = this.s[top];
          const sNeighbors = sx0 + sx1 + sy0 + sy1;
          if (sNeighbors === 0.0) continue;

          let div = this.u[right] - this.u[center] + this.v[top] - this.v[center];

          if (this.particleRestDensity > 0.0 && compensateDrift) {
            const k = 1.0;
            const compression =
                this.particleDensity[i * n + j] - this.particleRestDensity;
            if (compression > 0.0) div = div - k * compression;
          }

          const p = (-div / sNeighbors) * overRelaxation;
          this.p[center] += cp * p;

          this.u[center] -= sx0 * p;
          this.u[right] += sx1 * p;
          this.v[center] -= sy0 * p;
          this.v[top] += sy1 * p;
        }
      }
    }
  }

  updateParticleColors() {
    const h1 = this.fInvSpacing;

    for (let i = 0; i < this.numParticles; i++) {
      const delta = 0.01;

      this.particleColor[3 * i] =
          clamp(this.particleColor[3 * i] - delta, 0.0, 1.0);
      this.particleColor[3 * i + 1] =
          clamp(this.particleColor[3 * i + 1] - delta, 0.0, 1.0);
      this.particleColor[3 * i + 2] =
          clamp(this.particleColor[3 * i + 2] + delta, 0.0, 1.0);

      const x = this.particlePos[2 * i];
      const y = this.particlePos[2 * i + 1];
      const xi = clamp(Math.floor(x * h1), 1, this.fNumX - 1);
      const yi = clamp(Math.floor(y * h1), 1, this.fNumY - 1);
      const cellNr = xi * this.fNumY + yi;

      const d0 = this.particleRestDensity;
      if (d0 > 0.0) {
        const relDensity = this.particleDensity[cellNr] / d0;
        if (relDensity < 0.7) {
          const bright = 0.8;
          this.particleColor[3 * i] = bright;
          this.particleColor[3 * i + 1] = bright;
          this.particleColor[3 * i + 2] = 1.0;
        }
      }
    }
  }

  setSciColor(cellNr: number, val: number, minVal: number, maxVal: number) {
    val = Math.min(Math.max(val, minVal), maxVal - 0.0001);
    const d = maxVal - minVal;
    val = d === 0.0 ? 0.5 : (val - minVal) / d;
    const m = 0.25;
    const num = Math.floor(val / m);
    const s = (val - num * m) / m;
    let r = 0, g = 0, b = 0;

    switch (num) {
      case 0:
        r = 0.0;
        g = s;
        b = 1.0;
        break;
      case 1:
        r = 0.0;
        g = 1.0;
        b = 1.0 - s;
        break;
      case 2:
        r = s;
        g = 1.0;
        b = 0.0;
        break;
      case 3:
        r = 1.0;
        g = 1.0 - s;
        b = 0.0;
        break;
    }

    this.cellColor[3 * cellNr] = r;
    this.cellColor[3 * cellNr + 1] = g;
    this.cellColor[3 * cellNr + 2] = b;
  }

  updateCellColors() {
    this.cellColor.fill(0.0);

    for (let i = 0; i < this.fNumCells; i++) {
      if (this.cellType[i] === SOLID_CELL) {
        this.cellColor[3 * i] = 0.5;
        this.cellColor[3 * i + 1] = 0.5;
        this.cellColor[3 * i + 2] = 0.5;
      } else if (this.cellType[i] === FLUID_CELL) {
        let d = this.particleDensity[i];
        if (this.particleRestDensity > 0.0) d /= this.particleRestDensity;
        this.setSciColor(i, d, 0.0, 2.0);
      }
    }
  }

  simulate(
      dt: number, gravity: number, flipRatio: number, numPressureIters: number,
      numParticleIters: number, overRelaxation: number,
      compensateDrift: boolean, separateParticles: boolean, obstacleX: number,
      obstacleY: number, obstacleRadius: number, obstacleVelX: number,
      obstacleVelY: number, damping = 1.0) {
    const numSubSteps = 1;
    const sdt = dt / numSubSteps;

    for (let step = 0; step < numSubSteps; step++) {
      this.integrateParticles(sdt, gravity, damping);
      if (separateParticles) this.pushParticlesApart(numParticleIters);
      this.handleParticleCollisions(
          obstacleX, obstacleY, obstacleRadius, obstacleVelX, obstacleVelY);
      this.transferVelocities(true);
      this.updateParticleDensity();
      this.solveIncompressibility(
          numPressureIters, sdt, overRelaxation, compensateDrift);
      this.transferVelocities(false, flipRatio);
      this.handleParticleCollisions(
          obstacleX, obstacleY, obstacleRadius, obstacleVelX, obstacleVelY);
    }

    this.updateParticleColors();
    this.updateCellColors();
  }
}
