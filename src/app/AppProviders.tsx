import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import { LinkProvider } from '@astryxdesign/core/Link';
import jaJP from '@astryxdesign/core/locales/ja-JP.generated.js';
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router';

type RouterLinkProps = Omit<ComponentProps<typeof Link>, 'to'> & { href?: string; to?: string };

/** Astryx のリンクを React Router 経由の画面遷移にする。 */
function RouterLink({ href, to, ...rest }: RouterLinkProps) {
  return <Link to={to ?? href ?? '/'} {...rest} />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="system">
      <InternationalizationProvider locale="ja-JP" messages={{ 'ja-JP': jaJP }}>
        <LinkProvider component={RouterLink}>{children}</LinkProvider>
      </InternationalizationProvider>
    </Theme>
  );
}
