import type { ReactNode } from 'react';
import Image from 'next/image';

export function Shell({ title, subtitle, actions, children, hideManual }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; hideManual?: boolean }) {
  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Image src="/logo.png" alt="劇団Birth" width={48} height={48} style={{ height: 48, width: 'auto', objectFit: 'contain' }} priority />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', color: '#e74c3c' }}>BIRTH FINANCE SYSTEM</div>
              <h1 className="title brand">{title}</h1>
              {subtitle ? <p className="subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {actions}
            {!hideManual && <a href="/manual.html" target="_blank" rel="noopener noreferrer" className="secondary" style={{ fontSize: 13, padding: '6px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}>📖 マニュアル</a>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
