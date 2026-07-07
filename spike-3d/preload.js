const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spike", {
  reportFps: (data) => ipcRenderer.send("spike:fps", data),
  toggleClickThrough: () => ipcRenderer.send("spike:toggle-click-through"),
  quit: () => ipcRenderer.send("spike:quit"),
  onFpsUpdate: (cb) => ipcRenderer.on("spike:fps-update", (_e, data) => cb(data)),
  onClickThroughState: (cb) => ipcRenderer.on("spike:click-through-state", (_e, state) => cb(state)),
});
