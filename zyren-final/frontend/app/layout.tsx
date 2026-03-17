import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';

export const metadata: Metadata = {
  title: 'InterviewLens — AI Technical Interview Simulator',
  description:
    'Practice technical interviews with an AI interviewer. Live coding, voice interaction, dynamic follow-ups, and detailed scorecards.',
  keywords: ['interview', 'coding', 'AI', 'practice', 'technical interview', 'simulator'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <div className="animated-bg" />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
