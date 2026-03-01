# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Development server (esbuild watch + HTTP server with COOP/COEP headers)
npm run dev
# → http://localhost:8001

# Production build (outputs to dist/)
npm run build
```

There is no test suite. TypeScript type-checking can be run with:
```bash
npx tsc --noEmit
```

## Architecture

This is a self-contained browser demo that runs a pix2pix satellite-to-map translation model entirely client-side using WebGPU acceleration via [LiteRT.js](https://github.com/google-ai-edge/LiteRT-web) (`@litertjs/core`).

### Data flow

1. **User draws** on a 512×512 `<drawing-canvas>` (a Lit web component)
2. **`runPix2Pix()`** (`src/pix2pix.ts`) preprocesses the canvas to a `Float32Array` in NCHW layout with `[-1, 1]` normalization, runs inference via `model.run()`, and converts the output tensor back to a canvas
3. **`<pix2pix-maps>`** (`src/index.ts`) is the root Lit component that owns the model, drives the inference loop, and renders both canvases side-by-side

### Key details

- **Model**: `static/pix2pix_maps_int8.tflite` (int8 quantized, ~208 MB) tracked via Git LFS. Three variants exist (`int8`, `fp16`, `w8`); the active one is set in `src/constants.ts` via `MODEL_URL`.
- **Input/output size**: 256×256 pixels (`IMAGE_SIZE` in `src/constants.ts`). The drawing canvas is 512×512 but gets downscaled to 256 for inference, then the output is upscaled back.
- **WebGPU acceleration**: The model is compiled with `{accelerator: 'webgpu'}`. `model.run()` only dispatches GPU work; actual GPU synchronization happens in `outputTensor.data()` (via WebGPU `mapAsync`).
- **COOP/COEP headers**: Required for SharedArrayBuffer (used by LiteRT threading). The dev server proxy (`scripts/devserver.js`) injects `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on all responses. Any production deployment must set these headers too.
- **Build**: esbuild bundles `src/index.ts` to `dist/_demo_bin.js`. TypeScript is used for type-checking only (`noEmit: true`); esbuild handles the actual transpilation.
- **WASM files**: Copied from `node_modules/@litertjs/core/wasm/` into `dist/wasm/` at build time via the `copy-wasm` script.
