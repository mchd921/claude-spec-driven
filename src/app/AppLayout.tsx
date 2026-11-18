import { AppShell } from '@astryxdesign/core/AppShell';
import { Icon } from '@astryxdesign/core/Icon';
import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav';
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav';
import { Outlet, useLocation } from 'react-router';
import { BottomTabs } from '../ui/components/BottomTabs';
import './AppLayout.css';
import { isNavItemActive, NAV_ITEMS } from './navigation';

export function AppLayout() {
  const { pathname } = useLocation();

  return (
    <>
      <AppShell
        height="auto"
        variant="section"
        contentPadding={4}
        mobileNav={{ hasToggle: false }}
        topNav={<TopNav label="アプリ情報" heading={<TopNavHeading heading="筋トレ管理" />} />}
        sideNav={
          <SideNav aria-label="メインナビゲーション">
            {NAV_ITEMS.map((item) => (
              <SideNavItem
                key={item.to}
                href={item.to}
                label={item.label}
                icon={<Icon icon={item.icon} />}
                isSelected={isNavItemActive(item, pathname)}
              />
            ))}
          </SideNav>
        }
      >
        <div className="app-page">
          <Outlet />
        </div>
      </AppShell>
      <BottomTabs />
    </>
  );
}
