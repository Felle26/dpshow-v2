import type { ReactNode } from 'react';

export default function ShowLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="show-layout">
      {children}
    </div>
  );
}
