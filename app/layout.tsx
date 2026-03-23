import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '劇団Birth公演収支管理',
  description: 'Theater finance management app',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
