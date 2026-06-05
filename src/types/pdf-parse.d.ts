declare module 'pdf-parse' {
  interface PdfData { text: string; numpages: number; numrender: number; info: any; metadata: any; version: string; }
  function pdfParse(data: Buffer | ArrayBuffer, options?: any): Promise<PdfData>;
  export default pdfParse;
}
