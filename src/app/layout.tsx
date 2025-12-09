import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { StudySessionProvider } from '@/contexts/StudySessionContext';
import { RelationshipsProvider } from '@/contexts/RelationshipsContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HaHaHa English - 재미있는 영어 학습',
  description: '아빠와 함께하는 재미있는 영어 학습 앱',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={inter.className} suppressHydrationWarning>
        <StudySessionProvider>
          <RelationshipsProvider>
        {children}
          </RelationshipsProvider>
        </StudySessionProvider>
      </body>
    </html>
  );
}