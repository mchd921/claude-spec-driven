import { ChartLine, History, House, ListChecks, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** このナビ項目を選択中として扱うパスの先頭 */
  matches: readonly string[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'ホーム', icon: House, matches: [] },
  { to: '/history', label: '履歴', icon: History, matches: ['/history', '/workouts'] },
  { to: '/progress', label: 'グラフ', icon: ChartLine, matches: ['/progress'] },
  { to: '/templates', label: 'メニュー', icon: ListChecks, matches: ['/templates'] },
  { to: '/settings', label: '設定', icon: Settings, matches: ['/settings', '/exercises'] },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  return item.matches.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}
