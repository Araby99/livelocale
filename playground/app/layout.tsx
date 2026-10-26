import React from 'react';
import { LiveLocaleProvider } from 'livelocale/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LiveLocaleProvider />
        {children}
      </body>
    </html>
  );
}
