import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Compass Generator — MCP Learning Path Planner',
  description: 'Automatically generate day-wise structured study plans, YouTube playlists, and synchronized documents using LLMs and Composio MCP tools.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
