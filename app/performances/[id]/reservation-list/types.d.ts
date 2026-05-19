// PDF生成系のライブラリは型を簡易宣言 (本物は npm install 後に上書きされる)
declare module 'jspdf' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsPDF: any;
  export default jsPDF;
}

declare module 'html2canvas' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2canvas: any;
  export default html2canvas;
}

declare module 'html2pdf.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf: any;
  export default html2pdf;
}
