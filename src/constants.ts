/** Available pix2pix models. */
export const MODELS: ReadonlyArray<{label: string; url: string}> = [
  {label: 'Water', url: './static/pix2pix_water.tflite'},
];

export const DEFAULT_MODEL_URL = MODELS[0].url;

/** Expected input/output spatial size. */
export const IMAGE_SIZE = 256;
