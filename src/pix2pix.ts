import {CompiledModel, Tensor} from '@litertjs/core';

import {IMAGE_SIZE} from './constants';

export interface Pix2PixOptions {
  inputImage: HTMLCanvasElement|HTMLImageElement;
  model: CompiledModel;
  progressCallback: (progress: {message: string; value: number}) => void;
}

/**
 * Converts an image or canvas to Float32 in NCHW layout with [-1, 1] normalization.
 */
function imageToFloat32NCHW(
    image: HTMLCanvasElement|HTMLImageElement, size: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const pixels = imageData.data;

  const float32Data = new Float32Array(3 * size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixelIdx = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        float32Data[c * size * size + y * size + x] =
            pixels[pixelIdx + c] / 127.5 - 1.0;
      }
    }
  }
  return float32Data;
}

/**
 * Runs pix2pix satellite-to-map translation.
 */
export async function runPix2Pix({
  inputImage,
  model,
  progressCallback,
}: Pix2PixOptions): Promise<{canvas: HTMLCanvasElement; inferenceMs: number; totalMs: number}> {
  const totalStart = performance.now();
  progressCallback({message: 'Preprocessing image...', value: 0});
  const inputData = imageToFloat32NCHW(inputImage, IMAGE_SIZE);
  const inputTensor = new Tensor(inputData, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);

  progressCallback({message: 'Running inference...', value: 0.3});
  const inferenceStart = performance.now();
  const [outputTensor] = await model.run([inputTensor]);
  inputTensor.delete();

  // model.run() only dispatches GPU work. The actual synchronization happens
  // in data(), which calls mapAsync() and blocks until the GPU is done.
  progressCallback({message: 'Reading result from GPU...', value: 0.6});
  const outputData = await outputTensor.data() as Float32Array;
  const inferenceMs = performance.now() - inferenceStart;
  outputTensor.delete();

  progressCallback({message: 'Rendering result...', value: 0.8});

  // Output is [1, 3, 256, 256] in CHW layout, values [-1, 1]
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = IMAGE_SIZE;
  tempCanvas.height = IMAGE_SIZE;
  const tempCtx = tempCanvas.getContext('2d')!;
  const tempImageData = tempCtx.createImageData(IMAGE_SIZE, IMAGE_SIZE);

  for (let y = 0; y < IMAGE_SIZE; y++) {
    for (let x = 0; x < IMAGE_SIZE; x++) {
      const pixelIdx = (y * IMAGE_SIZE + x) * 4;
      for (let c = 0; c < 3; c++) {
        const val = outputData[c * IMAGE_SIZE * IMAGE_SIZE + y * IMAGE_SIZE + x];
        tempImageData.data[pixelIdx + c] =
            Math.max(0, Math.min(255, (val + 1) * 127.5));
      }
      tempImageData.data[pixelIdx + 3] = 255;
    }
  }
  tempCtx.putImageData(tempImageData, 0, 0);

  // Scale to original input dimensions
  const outCanvas = document.createElement('canvas');
  const source = inputImage;
  outCanvas.width = source.width;
  outCanvas.height = source.height;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.drawImage(tempCanvas, 0, 0, source.width, source.height);

  const totalMs = performance.now() - totalStart;
  progressCallback({message: 'Done.', value: 1});
  return {canvas: outCanvas, inferenceMs, totalMs};
}
