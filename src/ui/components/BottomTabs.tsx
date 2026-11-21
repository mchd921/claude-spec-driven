import { Link, useLocation } from 'react-router';
import { isNavItemActive, NAV_ITEMS } from '../../app/navigation';
import './BottomTabs.css';

/** 幅 768px 未満で表示する下部タブ。Astryx に該当部品がないため自作する。 */
export function BottomTabs() {
  const { pathname } = useLocation();

  return (
    <nav className="bottom-tabs" aria-label="メインタブ">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="bottom-tabs__link"
            aria-current={isNavItemActive(item, pathname) ? 'page' : undefined}
          >
            <Icon size={22} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
