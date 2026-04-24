declare module "html-to-docx" {
  export type HTMLtoDOCXOptions = {
    orientation?: "portrait" | "landscape";
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    font?: string;
    fontSize?: number;
    title?: string;
    header?: boolean;
    footer?: boolean;
  };
  const HTMLtoDOCX: (
    html: string,
    header?: string,
    options?: HTMLtoDOCXOptions,
  ) => Promise<Buffer | Blob>;
  export default HTMLtoDOCX;
}
