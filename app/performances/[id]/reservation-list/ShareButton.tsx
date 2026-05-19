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
      // jspdf + html2canvas を遅延ロード (合計 約700KB)
      const [jsPdfMod, html2canvasMod] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ]);
      const jsPDF = jsPdfMod.default;
      const html2canvas = html2canvasMod.default;

      const sheets = document.querySelectorAll<HTMLElement>('#pdf-content .sheet');
      if (sheets.length === 0) {
        throw new Error('印刷対象が見つかりません');
      }

      // A4 横 (297mm × 210mm) でPDFを初期化
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });

      for (let i = 0; i < sheets.length; i++) {
        const canvas = await html2canvas(sheets[i], {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: sheets[i].scrollWidth,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        if (i > 0) pdf.addPage('a4', 'landscape');
        // ページ全面に画像を配置 (297mm × 210mm)
        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
      }

      const pdfBlob: Blob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);

      // 別タブで PDF を開く (iOS は Safari の PDF ビューア → 右上の共有から netprint 等へ)
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = `${filename}.pdf`;
      a.click();

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
      title="別タブでPDFを開きます。スマホはそこからの共有ボタンで印刷アプリ等に送れます。"
    >
      {generating ? 'PDF生成中…' : '📤 PDFを別タブで開く'}
    </button>
  );
}
