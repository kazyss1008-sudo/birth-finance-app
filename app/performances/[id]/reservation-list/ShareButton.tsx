'use client';

import { useState } from 'react';

interface ShareButtonProps {
  filename: string;
}

export function ShareButton({ filename }: ShareButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleClick = async () => {
    setGenerating(true);
    try {
      // html2pdf.js を遅延ロード (約600KB)
      const mod = await import('html2pdf.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html2pdf: any = mod.default;

      const printArea = document.getElementById('pdf-content');
      if (!printArea) {
        throw new Error('印刷対象が見つかりません');
      }

      const opt = {
        margin: 0,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: ['css'], before: '.sheet + .sheet' },
      };

      const pdfBlob: Blob = await html2pdf().set(opt).from(printArea).outputPdf('blob');
      const url = URL.createObjectURL(pdfBlob);

      // 別タブで PDF を開く。
      // iOS Safari: ネイティブPDFビューアで開く → 右上の共有ボタンから netprint 等にダイレクトで送れる
      // Android Chrome: PDFが新しいタブで開く (またはダウンロード)
      // Desktop: PDFが新しいタブで開く (またはダウンロード)
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = `${filename}.pdf`;
      a.click();

      // PDFビューアが読み込み終わるまで URL を保持
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error('PDF generation error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert('PDF生成でエラーが発生しました: ' + msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={generating}
      style={{
        background: '#10b981',
        color: 'white',
        border: 'none',
        borderRadius: 6,
        padding: '6px 14px',
        fontWeight: 700,
        cursor: generating ? 'wait' : 'pointer',
        fontSize: 13,
        whiteSpace: 'nowrap',
      }}
      title="別タブでPDFを開きます。そこからスマホ標準の共有ボタンで印刷アプリ等に送れます。"
    >
      {generating ? 'PDF生成中…' : '📤 PDFを別タブで開く'}
    </button>
  );
}
