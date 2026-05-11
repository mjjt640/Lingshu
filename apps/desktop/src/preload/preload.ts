import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("lingshu", {
  platform: process.platform
});
