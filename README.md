# pix2pix real-time in the browser using LiteRT and WebGPU

This is a project to test the viability of a single-purpose neural-network-model for achieving complex graphical effects in web-based real-time applications.

# Setup

## git repo
<https://github.com/shounendev/pix2pix_real-time_LiteRT_WebGPU.git>

## model file

if the model can not be downloaded using git-lfs it can be downloaded from this link:

<https://drive.google.com/file/d/1yjLo8xqr0luHA_HaeXQ2OTanvuz_0IBJ/view?usp=sharing>

The file needs to be places int the ./static folder

## Prerequisites

- Linux based operating system or WSL under windows
- git lfs (git large file storage)
- node v20.20.0

## Node server

This project was tested using `node v20.20.0` and `npm 10.8.2`

1. install git lfs
2. install dependacies

```bash
npm install
```

3. if git lfs was not installed before you cloned the repo

```bash
git lfs fetch --all && git lfs checkout
```

4. run porject

```bash
npm run dev
```

## Browser flags

### Firefox

1. navigate to `about:config` int the url bar
2. search for `webgpu`
3. set `dom.webgpu.enabled` to true

### Chrome

1. navigate to `chrome://flags/` in the url bar
2. search for `webgpu`
3. enable `Unsafe WebGPU Support`
