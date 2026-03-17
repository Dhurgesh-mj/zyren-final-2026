import type { Metadata } from 'next';
import './globals.css';

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
        <div className="animated-bg" />
        {children}
      </body>
    </html>
  );
}
