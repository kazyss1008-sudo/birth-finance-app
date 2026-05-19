// html2pdf.js は型定義を同梱していないため最小限の宣言を入れる
declare module 'html2pdf.js' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html2pdf: any;
  export default html2pdf;
}
