import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: '劇団Birth 管理アプリ',
  description: '劇団Birthの公演・スケジュール・チケット・収支管理',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
