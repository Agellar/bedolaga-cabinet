import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

import { cn } from '@/lib/utils';
import { usePlatform } from '@/platform';

// Icons
import { HomeIcon, SubscriptionIcon, WalletIcon, UsersIcon } from './icons';
import { UserIcon } from '@/components/icons';

interface MobileBottomNavProps {
  isKeyboardOpen: boolean;
  referralEnabled?: boolean;
}

export function MobileBottomNav({ isKeyboardOpen, referralEnabled }: MobileBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { haptic } = usePlatform();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  // Fixed tab set: Dashboard / Subscription / Balance / Referrals / Profile.
  // Referrals is the only flag-driven slot (it disappears when the operator
  // turns the programme off) — the rest never move, so the bar stays
  // predictable. Everything else that used to live in the burger drawer
  // (Support, Info, Wheel, Contests, Gift, admin, logout) lives in Profile.
  const coreItems = [
    { path: '/', label: t('nav.dashboard'), icon: HomeIcon },
    { path: '/subscriptions', label: t('nav.devices'), icon: SubscriptionIcon },
    { path: '/balance', label: t('nav.balance'), icon: WalletIcon },
    ...(referralEnabled
      ? [{ path: '/referral', label: t('nav.referral'), icon: UsersIcon }]
      : []),
    { path: '/profile', label: t('nav.profile'), icon: UserIcon },
  ];

  const handleNavClick = () => {
    haptic.impact('light');
  };

  return (
    <nav
      className={cn(
        'fixed z-50 transition-all duration-200 lg:hidden',
        'bg-dark-900/95 backdrop-blur-linear',
        'border border-dark-700/30',
        isKeyboardOpen ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
      style={{
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: '16px',
        right: '16px',
        borderRadius: 'var(--bento-radius, 24px)',
        padding: '8px 4px',
        boxShadow: '0 4px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
      }}
    >
      <div className="flex justify-around">
        {coreItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={handleNavClick}
            className={cn(
              // px-1.5 (not px-3): with five tabs the labels must still fit on a
              // 320px-wide screen without truncating or wrapping.
              'relative flex min-w-0 flex-1 shrink flex-col items-center justify-center rounded-2xl px-1.5 py-2.5 transition-all duration-200',
              isActive(item.path) ? 'text-accent-400' : 'text-dark-300 hover:text-dark-100',
            )}
          >
            {isActive(item.path) && (
              <motion.div
                layoutId="bottom-nav-active"
                className="absolute inset-0 rounded-2xl bg-accent-500/15"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <item.icon className="relative z-10 h-5 w-5 shrink-0" />
            <span className="relative z-10 mt-1 max-w-full truncate text-[10.5px] font-semibold">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
