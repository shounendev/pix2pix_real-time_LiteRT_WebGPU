/** Available pix2pix models. */
export const MODELS: ReadonlyArray<{label: string; url: string}> = [
  {label: 'Water', url: './static/pix2pix_water.tflite'},
  {label: 'Maps (int8)', url: './static/pix2pix_maps_int8.tflite'},
  {label: 'Maps (fp16)', url: './static/pix2pix_maps_fp16.tflite'},
  {label: 'Maps (w8)', url: './static/pix2pix_maps_w8.tflite'},
];

export const DEFAULT_MODEL_URL = MODELS[0].url;

/** Expected input/output spatial size. */
export const IMAGE_SIZE = 256;
