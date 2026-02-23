import {html, LitElement} from 'lit';
import {customElement} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';

/* tslint:disable:no-new-decorators */

@customElement('drawing-canvas')
export class DrawingCanvas extends LitElement {
  private canvasRef = createRef<HTMLCanvasElement>();
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  static readonly CANVAS_SIZE = 512;

  override firstUpdated() {
    const canvas = this.canvasRef.value!;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.clear();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvasRef.value!;
  }

  clear() {
    const canvas = this.canvasRef.value;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  private getPos(e: PointerEvent): {x: number; y: number} {
    const canvas = this.canvasRef.value!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private onPointerDown(e: PointerEvent) {
    this.isDrawing = true;
    const {x, y} = this.getPos(e);
    this.lastX = x;
    this.lastY = y;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    // Draw a dot on single click
    const ctx = this.canvasRef.value!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.isDrawing) return;
    const {x, y} = this.getPos(e);
    const ctx = this.canvasRef.value!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
  }

  private onPointerUp() {
    this.isDrawing = false;
  }

  override render() {
    const size = DrawingCanvas.CANVAS_SIZE;
    return html`
      <canvas
        ${ref(this.canvasRef)}
        width=${size}
        height=${size}
        style="display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;"
        @pointerdown=${this.onPointerDown}
        @pointermove=${this.onPointerMove}
        @pointerup=${this.onPointerUp}
        @pointerleave=${this.onPointerUp}
      ></canvas>
    `;
  }
}
