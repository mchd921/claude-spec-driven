import { Heading } from '@astryxdesign/core/Heading';
import type { ReactNode } from 'react';

/** 各画面を実装するまでの仮ページ（T3.x で置き換える）。 */
export function PlaceholderPage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <>
      <Heading level={1}>{title}</Heading>
      {children}
    </>
  );
}
