// Render the saved receipt, so retries retain the original venue and map URL.
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]!));

export function reservationMailHtml(text: string) {
    const lines = text.split('\n');
    const content = lines.map((line, index) => {
        const url = line.startsWith('　') ? line.slice(1) : '';
        if (lines[index - 1]?.startsWith('会場：') && lines[index + 1]?.startsWith('予約番号：')) {
            try {
                const parsed = new URL(url);
                if (['https:', 'http:'].includes(parsed.protocol))
                    return `　<a href="${escapeHtml(url)}">会場地図</a>`;
            } catch { /* An invalid URL stays escaped text. */ }
        }
        return escapeHtml(line);
    }).join('<br>\n');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"></head><body><div style="font-family:sans-serif;font-size:16px;line-height:1.7;color:#1f2937">${content}</div></body></html>`;
}
