import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { SubscriptionIcon } from '@/components/icons';
import type { Subscription } from '../../types';

interface PurchaseCTAButtonProps {
  subscription: Subscription | null;
  /** In multi-tariff mode, link to /subscriptions/:id/renew instead of /subscription/purchase */
  isMultiTariff?: boolean;
}

export default function PurchaseCTAButton({
  subscription,
  isMultiTariff = false,
}: PurchaseCTAButtonProps) {
  const { t } = useTranslation();

  const isExpired =
    !subscription ||
    (!subscription.is_active && !subscription.is_trial && !subscription.is_limited);
  const isTrial = subscription?.is_trial;
  const isDaily = subscription?.is_daily;

  // Daily tariffs renew automatically — no manual renewal button needed in multi-tariff
  if (isMultiTariff && isDaily && !isExpired) return null;

  const buttonText = isExpired
    ? t('subscription.getSubscription')
    : isTrial
      ? t('subscription.trialUpgrade.title')
      : t('subscription.extend');

  const hintText = isExpired
    ? t('subscription.cta.expiredHint')
    : isTrial
      ? t('subscription.cta.trialHint')
      : isMultiTariff
        ? t('subscription.cta.renewHint', 'Продление подписки')
        : t('subscription.cta.activeHint');

  // Trial → purchase page (buy a real tariff, trial can't be renewed)
  // Multi-tariff active → per-subscription renew page
  // Otherwise → purchase page
  const linkTo = isTrial
    ? '/subscription/purchase'
    : isMultiTariff && subscription?.id
      ? `/subscriptions/${subscription.id}/renew`
      : '/subscription/purchase';

  return (
    <Link
      to={linkTo}
      className="accent-ring group relative block w-full cursor-pointer overflow-hidden rounded-2xl"
    >
      {/* Solid, centered fill — deliberately distinct from the translucent
          glass buttons around it so the primary action stands out. */}
      <div
        className="relative flex flex-col items-center justify-center rounded-2xl px-5 py-3.5 text-center"
        style={{
          background: isExpired
            ? 'linear-gradient(135deg, rgb(var(--color-critical-500)), #ff6b35)'
            : 'linear-gradient(135deg, rgb(var(--color-accent-500)), rgb(var(--color-accent-600)))',
        }}
      >
        <div className="flex items-center gap-2">
          <SubscriptionIcon className="h-5 w-5 text-white" />
          <span className="text-[17px] font-bold tracking-tight text-white">{buttonText}</span>
        </div>
        <span className="mt-0.5 text-[11px] text-white/70">{hintText}</span>
      </div>
    </Link>
  );
}
