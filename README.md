# pix2pix real-time in the browser using LiteRT and WebGPU
This is a project to test the viability of a single-purpose neural-network-model for achieving complex graphical effects in web-based real-time applications.

# Setup:

## Node server
1. install git lfs
2. install dependacies
```bash
$ npm install
```
3. run porject
```bash
$ npm run dev
```

## Browser flags
### Firefox
1. Navigate to `about:config` int the url bar
2. Search for `webgpu`
3. Set `dom.webgpu.enabled` to true
### Chrome
1. Navigate to `chrome://flags/` in the url bar
2. Search for `webgpu`
3. Enable `Unsafe WebGPU Support`
