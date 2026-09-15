/// <reference types="vite/client" />

declare module "*.css";
declare module "*.svg" {
  const src: string;
  export default src;
}

/** Строка билда (vite define) — кэш-бастер кадров «Развития». */
declare const __BUILD_VERSION__: string;
