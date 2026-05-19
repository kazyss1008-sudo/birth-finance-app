'use client';

import { useState } from 'react';

interface ShareButtonProps {
  filename: string;
}

export function ShareButton({ filename }: ShareButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleShare = async () => {
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
        pagebreak: { mode: ['css', 'legacy'] },
      };

      const pdfBlob: Blob = await html2pdf().set(opt).from(printArea).outputPdf('blob');

      const file = new File([pdfBlob], `${filename}.pdf`, { type: 'application/pdf' });

      // navigator.share に files 対応があるか確認 (主にモバイル)
      const canShareFiles =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        try {
          await navigator.share({
            files: [file],
            title: filename,
          });
        } catch (err) {
          // ユーザーが共有シートをキャンセルした場合は無視
          if (err instanceof Error && err.name === 'AbortError') return;
          throw err;
        }
      } else {
        // 共有非対応 (デスクトップなど) はそのままダウンロード
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (err) {
      console.error('PDF share error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert('PDF生成または共有でエラーが発生しました: ' + msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
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
      title="スマホはコンビニ印刷アプリ等への共有、PCはダウンロード"
    >
      {generating ? 'PDF生成中…' : '📤 PDFを共有'}
    </button>
  );
}
