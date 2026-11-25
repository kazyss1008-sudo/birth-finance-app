import type { ReactNode } from 'react';
import { PerformanceSubtitle } from './PerformanceSubtitle';
import { PerformanceNav } from './PerformanceNav';
import Image from 'next/image';

export function Shell({ title, subtitle, actions, children, hideManual, compact }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; hideManual?: boolean; compact?: boolean }) {
  return (
    <div className="container">
      <div className="card" style={{ marginBottom: compact ? 10 : 16, padding: compact ? 14 : undefined }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: '1 1 240px' }}>
            <Image src="/logo.png" alt="劇団Birth" width={48} height={48} style={{ height: 48, width: 'auto', objectFit: 'contain', flexShrink: 0 }} priority />
            <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', color: '#e74c3c' }}>BIRTH MANAGEMENT SYSTEM</div>
              <h1 className="title brand" style={compact?{fontSize:22,margin:'6px 0',whiteSpace:'normal'}:undefined}>{title}</h1>
              <PerformanceSubtitle fallback={subtitle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {actions}
            {!hideManual && <a href="/manual.html" target="_blank" rel="noopener noreferrer" className="secondary" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>📖 マニュアル</a>}
          </div>
        </div>
      </div>
      <PerformanceNav />
      {children}
    </div>
  );
}
