import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { initDataUser } from '@telegram-apps/sdk-react';

import { useTheme } from '@/hooks/useTheme';
import { usePlatform } from '@/platform';
import {
  brandingApi,
  getCachedBranding,
  setCachedBranding,
  preloadLogo,
  isLogoPreloaded,
} from '@/api/branding';
import { themeColorsApi } from '@/api/themeColors';
import { cn } from '@/lib/utils';

import LanguageSwitcher from '@/components/LanguageSwitcher';
import TicketNotificationBell from '@/components/TicketNotificationBell';

// Icons
import { UserIcon, SunIcon, MoonIcon, SearchIcon } from './icons';

const FALLBACK_NAME = import.meta.env.VITE_APP_NAME || 'Cabinet';
const FALLBACK_LOGO = import.meta.env.VITE_APP_LOGO || 'V';

import type { TelegramPlatform } from '@/hooks/useTelegramSDK';

interface AppHeaderProps {
  onCommandPaletteOpen: () => void;
  isFullscreen: boolean;
  safeAreaInset: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset: { top: number; bottom: number; left: number; right: number };
  telegramPlatform?: TelegramPlatform;
}

export function AppHeader({
  onCommandPaletteOpen,
  isFullscreen,
  safeAreaInset,
  contentSafeAreaInset,
  telegramPlatform,
}: AppHeaderProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { toggleTheme, isDark } = useTheme();
  const { haptic, platform } = usePlatform();
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(() => isLogoPreloaded());

  // Branding
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: async () => {
      const data = await brandingApi.getBranding();
      setCachedBranding(data);
      await preloadLogo(data);
      return data;
    },
    initialData: getCachedBranding() ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const appName = branding ? branding.name : FALLBACK_NAME;
  const logoLetter = branding?.logo_letter || FALLBACK_LOGO;
  const hasCustomLogo = branding?.has_custom_logo || false;
  const logoUrl = branding ? brandingApi.getLogoUrl(branding) : null;

  // Theme toggle visibility
  const { data: enabledThemes } = useQuery({
    queryKey: ['enabled-themes'],
    queryFn: themeColorsApi.getEnabledThemes,
    staleTime: 1000 * 60 * 5,
  });
  const canToggle = enabledThemes?.dark && enabledThemes?.light;

  // Get user photo from Telegram
  useEffect(() => {
    try {
      const user = initDataUser();
      if (user?.photo_url) {
        setUserPhotoUrl(user.photo_url);
      }
    } catch {
      // Not in Telegram or init data not available
    }
  }, []);

  const isAdminActive = () => location.pathname.startsWith('/admin');

  return (
    <>
      {/* Header - only on mobile */}
      <header
        className="glass fixed left-0 right-0 top-0 z-50 shadow-lg shadow-black/10 lg:hidden"
        style={{
          paddingTop: isFullscreen
            ? `${Math.max(safeAreaInset.top, contentSafeAreaInset.top) + (telegramPlatform === 'android' ? 48 : 45)}px`
            : undefined,
        }}
      >
        <div className="mx-auto w-full px-4">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex flex-shrink-0 items-center">
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-linear-lg border border-dark-700/50 bg-dark-800/80 shadow-md">
                <span
                  className={cn(
                    'absolute text-lg font-bold text-accent-400 transition-opacity duration-200',
                    hasCustomLogo && logoLoaded ? 'opacity-0' : 'opacity-100',
                  )}
                >
                  {logoLetter}
                </span>
                {hasCustomLogo && logoUrl && (
                  <img
                    src={logoUrl}
                    alt={appName || 'Logo'}
                    className={cn(
                      'absolute h-full w-full object-contain transition-opacity duration-200',
                      logoLoaded ? 'opacity-100' : 'opacity-0',
                    )}
                    onLoad={() => setLogoLoaded(true)}
                  />
                )}
              </div>
            </Link>

            {/* Right side */}
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {/* Command palette trigger (web only) */}
              {platform !== 'telegram' && (
                <button
                  onClick={() => {
                    haptic.impact('light');
                    onCommandPaletteOpen();
                  }}
                  className="btn-icon hidden sm:flex"
                  title="Search (⌘K)"
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              )}

              {/* Theme toggle */}
              {canToggle && (
                <button
                  onClick={() => {
                    haptic.impact('light');
                    toggleTheme();
                  }}
                  className="relative rounded-linear-lg border border-dark-700/50 bg-dark-800/50 p-2 text-dark-400 transition-all duration-200 hover:bg-dark-700 hover:text-accent-400"
                  title={isDark ? t('theme.light') || 'Light mode' : t('theme.dark') || 'Dark mode'}
                >
                  <div className="relative h-5 w-5">
                    <div
                      className={cn(
                        'absolute inset-0 transition-all duration-300',
                        isDark ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0',
                      )}
                    >
                      <MoonIcon className="h-5 w-5" />
                    </div>
                    <div
                      className={cn(
                        'absolute inset-0 transition-all duration-300',
                        isDark ? '-rotate-90 opacity-0' : 'rotate-0 opacity-100',
                      )}
                    >
                      <SunIcon className="h-5 w-5" />
                    </div>
                  </div>
                </button>
              )}

              <TicketNotificationBell isAdmin={isAdminActive()} />
              <LanguageSwitcher />

              {/* Profile avatar — replaces the burger menu (nav redesign, step 2).
                  Everything the drawer used to hold now lives on /profile. */}
              <Link
                to="/profile"
                onClick={() => haptic.impact('light')}
                aria-label={t('nav.profile')}
                className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-dark-700/50 bg-dark-800/50 text-dark-300 transition-colors duration-200 hover:text-accent-400"
              >
                {userPhotoUrl ? (
                  <img
                    src={userPhotoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <UserIcon className="h-5 w-5" />
                )}
              </Link>
            </div>
          </div>
        </div>
      </header>

    </>
  );
}
