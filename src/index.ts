import {CompiledModel, loadAndCompile, loadLiteRt} from '@litertjs/core';
import {html, LitElement} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

import {MODEL_URL} from './constants';
import './drawing-canvas.js';
import {DrawingCanvas} from './drawing-canvas.js';
import {runPix2Pix} from './pix2pix';
import {componentStyles} from './styles';

/* tslint:disable:no-new-decorators */

@customElement('pix2pix-maps')
export class Pix2PixMaps extends LitElement {
  static override styles = componentStyles;

  @state() private statusMessage = 'Initializing LiteRT...';
  @state() private resultCanvas: HTMLCanvasElement|null = null;
  @state() private isRunning = false;
  @state() private model: CompiledModel|null = null;
  @state() private inferenceMs: number|null = null;
  @state() private totalMs: number|null = null;

  private drawingCanvasRef = createRef<DrawingCanvas>();

  override async firstUpdated() {
    try {
      await loadLiteRt('./wasm/', {threads: true});
      this.statusMessage = 'Loading model...';
    } catch (e) {
      console.warn(
          'Failed to load LiteRT with threads: true, falling back to threads: false',
          e);
      this.statusMessage = 'Retrying initialization without threading...';
      try {
        await loadLiteRt('./wasm/', {threads: false});
        this.statusMessage = 'Loading model...';
      } catch (e2) {
        this.statusMessage =
            `Error initializing LiteRT: ${(e2 as Error).message}`;
        console.error('Failed to load LiteRT with threads: false', e2);
        return;
      }
    }
    await this.loadModel();
  }

  private async loadModel() {
    try {
      this.statusMessage = 'Downloading & compiling model (208 MB)...';
      const compileOptions = {accelerator: 'webgpu'} as const;
      this.model = await loadAndCompile(MODEL_URL, compileOptions);
      this.statusMessage = 'Ready. Draw on the canvas and click "Start".';
    } catch (e) {
      this.statusMessage = `Error loading model: ${(e as Error).message}`;
      console.error(e);
    }
  }

  private handleToggle() {
    if (this.isRunning) {
      this.isRunning = false;
    } else {
      this.isRunning = true;
      this.runLoop();
    }
  }

  private async runLoop() {
    while (this.isRunning && this.model) {
      const canvas = this.drawingCanvasRef.value!.getCanvas();
      try {
        const {canvas: outCanvas, inferenceMs, totalMs} = await runPix2Pix({
          inputImage: canvas,
          model: this.model!,
          progressCallback: () => {},
        });
        this.resultCanvas = outCanvas;
        this.inferenceMs = inferenceMs;
        this.totalMs = totalMs;
        this.statusMessage =
            `Running — ${totalMs.toFixed(0)} ms/frame  (inference: ${inferenceMs.toFixed(0)} ms)`;
      } catch (e) {
        this.statusMessage = `Error: ${(e as Error).message}`;
        console.error(e);
        break;
      }
    }
    this.isRunning = false;
    this.statusMessage = 'Stopped.';
  }

  private handleClear() {
    this.drawingCanvasRef.value!.clear();
  }

  private get canStart(): boolean {
    return !!this.model;
  }

  override render() {
    return html`
      <div class="container">
        <h1>LiteRT.js Pix2Pix Maps</h1>
        <div class="controls">
          <div class="control-group">
            <button @click=${this.handleClear}>
              Clear
            </button>
            <button @click=${this.handleToggle} .disabled=${!this.canStart}>
              ${this.isRunning ? 'Stop' : 'Start'}
            </button>
          </div>
        </div>

        <div class="image-pair">
          <div class="image-slot">
            <h3>Draw Input</h3>
            <drawing-canvas ${ref(this.drawingCanvasRef)}></drawing-canvas>
          </div>

          <div class="result-zone">
            <h3>Map Output${this.totalMs !== null ?
              html` <span class="inference-time">(${this.totalMs.toFixed(0)} ms total)</span>` : ''}</h3>
            <div class="result-display">
              ${this.resultCanvas ?
                this.resultCanvas :
                html`<p>Map result will appear here</p>`}
            </div>
          </div>
        </div>

        <div class="footer">
          <p class="status">${this.statusMessage}</p>
        </div>
      </div>
    `;
  }
}
