import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { uiLocale } from '@/utils/uiLocale';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { subscriptionApi } from '../api/subscription';
import { DEVICE_ALIAS_MAX_LENGTH } from '../constants/devices';
import { WebBackButton } from '../components/WebBackButton';
import { useDestructiveConfirm } from '../platform/hooks/useNativeDialog';
import { getGlassColors } from '../utils/glassTheme';
import { copyToClipboard } from '../utils/clipboard';
import { useTheme } from '../hooks/useTheme';
import InsufficientBalancePrompt from '../components/InsufficientBalancePrompt';
import { useCurrency } from '../hooks/useCurrency';
import { useCloseOnSuccessNotification } from '../store/successNotification';
import PurchaseCTAButton from '../components/subscription/PurchaseCTAButton';
import {
  CopyIcon,
  CheckIcon,
  PauseIcon,
  DevicesIcon,
  TrashIcon,
  CloseIcon,
  EditIcon,
  LinkIcon,
} from '../components/icons';
import { useHaptic } from '../platform';
import { useToast } from '../components/Toast';
import { resolveConnectionUrlForUi } from '../utils/connectionLink';
import { getErrorMessage, getInsufficientBalanceError } from '../utils/subscriptionHelpers';
import { DeviceTopupSheet } from '../components/subscription/sheets/DeviceTopupSheet';
import { DeviceReductionSheet } from '../components/subscription/sheets/DeviceReductionSheet';
import { TrafficTopupSheet } from '../components/subscription/sheets/TrafficTopupSheet';
import { ServerManagementSheet } from '../components/subscription/sheets/ServerManagementSheet';
import { DeleteSubscriptionSheet } from '../components/subscription/sheets/DeleteSubscriptionSheet';
import { Sheet } from '../components/ui/Sheet';
import { QRCodeSVG } from 'qrcode.react';

export default function Subscription() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const navigate = useNavigate();
  const { subscriptionId: subIdParam } = useParams<{ subscriptionId?: string }>();
  const subscriptionId = subIdParam ? parseInt(subIdParam, 10) : undefined;
  const { isDark } = useTheme();
  const g = getGlassColors(isDark);
  const haptic = useHaptic();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const destructiveConfirm = useDestructiveConfirm();

  // Helper to format price from kopeks
  const formatPrice = (kopeks: number) =>
    kopeks === 0
      ? t('subscription.free', 'Бесплатно')
      : `${formatAmount(kopeks / 100)} ${currencySymbol}`;

  // Device/traffic topup state
  const [showDeviceTopup, setShowDeviceTopup] = useState(false);
  const [devicesToAdd, setDevicesToAdd] = useState(1);
  const [showDeviceReduction, setShowDeviceReduction] = useState(false);
  const [targetDeviceLimit, setTargetDeviceLimit] = useState<number>(1);
  const [showTrafficTopup, setShowTrafficTopup] = useState(false);
  const [selectedTrafficPackage, setSelectedTrafficPackage] = useState<number | null>(null);
  const [showServerManagement, setShowServerManagement] = useState(false);
  const [selectedServersToUpdate, setSelectedServersToUpdate] = useState<string[]>([]);

  // Traffic refresh state
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);

  // Revoke (reissue) cooldown state
  const [revokeCooldown, setRevokeCooldown] = useState(0);

  // Detect multi-tariff mode from cached subscriptions-list
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading } = useQuery({
    queryKey: ['subscription', subscriptionId],
    queryFn: () => subscriptionApi.getSubscription(subscriptionId),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: connectionLink, isLoading: isConnectionLinkLoading } = useQuery({
    queryKey: ['connection-link', subscriptionId],
    queryFn: () => subscriptionApi.getConnectionLink(subscriptionId),
    retry: false,
    staleTime: 0,
  });

  // Extract subscription from response (null if no subscription)
  const subscription = subscriptionResponse?.subscription ?? null;
  const displayedConnectionUrl = useMemo(
    () =>
      resolveConnectionUrlForUi({
        mode: connectionLink?.connect_mode,
        happSchemeLink: connectionLink?.happ_scheme_link,
        displayLink: connectionLink?.display_link,
        subscriptionUrl: connectionLink?.subscription_url,
        happCryptLink: connectionLink?.happ_cryptolink,
        happCryptoLink: connectionLink?.happ_crypto_link,
        happLink: connectionLink?.happ_link,
        fallbackUrl: isConnectionLinkLoading ? null : (subscription?.subscription_url ?? null),
      }),
    [
      connectionLink?.connect_mode,
      connectionLink?.display_link,
      connectionLink?.happ_cryptolink,
      connectionLink?.happ_crypto_link,
      connectionLink?.happ_link,
      connectionLink?.happ_scheme_link,
      connectionLink?.subscription_url,
      isConnectionLinkLoading,
      subscription?.subscription_url,
    ],
  );
  const shouldHideConnectionLink =
    subscription?.hide_subscription_link || connectionLink?.hide_link;

  // Purchase options (needed for balance_kopeks in device/traffic/server management)
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const isTariffsMode = purchaseOptions?.sales_mode === 'tariffs';

  // Devices query
  const { data: devicesData, isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
    enabled: !!subscription,
  });

  // Delete device mutation
  const deleteDeviceMutation = useMutation({
    mutationFn: (hwid: string) => subscriptionApi.deleteDevice(hwid, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
    },
  });

  // Delete all devices mutation
  const deleteAllDevicesMutation = useMutation({
    mutationFn: () => subscriptionApi.deleteAllDevices(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
    },
  });

  // Local device alias (rename) state. Only one device can be in edit-mode
  // at a time — `editingDeviceHwid` doubles as both the toggle and the
  // identifier of the row being edited.
  const [editingDeviceHwid, setEditingDeviceHwid] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState('');

  const renameDeviceMutation = useMutation({
    mutationFn: ({ hwid, name }: { hwid: string; name: string | null }) =>
      subscriptionApi.renameDevice(hwid, name, subscriptionId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
      // Soft success-tap, like other mutations on this page.
      haptic.notification('success');
      // Не сбрасываем edit-state, если пользователь уже перешёл на другой
      // девайс пока шёл запрос — иначе теряем его новый input. Имя не чистим
      // безусловно: оно либо принадлежит уже другому девайсу (нужно сохранить),
      // либо инпут уже закрылся (значение не отображается).
      setEditingDeviceHwid((current) => (current === variables.hwid ? null : current));
    },
    onError: () => {
      haptic.notification('error');
    },
  });

  // Pause subscription mutation
  const pauseMutation = useMutation({
    mutationFn: () => subscriptionApi.togglePause(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
  });

  // Auto-close all modals/forms when success notification appears
  const handleCloseAllModals = useCallback(() => {
    setShowDeviceTopup(false);
    setShowDeviceReduction(false);
    setShowTrafficTopup(false);
    setShowServerManagement(false);
  }, []);
  useCloseOnSuccessNotification(handleCloseAllModals);

  // (device price + purchase moved into <DeviceTopupSheet>)
  // (device reduction info + mutation moved into <DeviceReductionSheet>)

  // (traffic packages + purchase moved into <TrafficTopupSheet>)
  // (countries query + update mutation moved into <ServerManagementSheet>)

  // Traffic refresh mutation
  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscriptionId),
    onSuccess: (data) => {
      localStorage.setItem(
        `traffic_refresh_ts_${subscriptionId ?? 'default'}`,
        Date.now().toString(),
      );
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (key: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficRefreshCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  // Track if we've already triggered auto-refresh this session
  const hasAutoRefreshed = useRef(false);

  // Cooldown timer for traffic refresh
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Initialize revoke cooldown from localStorage on mount
  useEffect(() => {
    const ts = localStorage.getItem(`revoke_ts_${subscriptionId ?? 'default'}`);
    if (ts) {
      const elapsed = Math.floor((Date.now() - parseInt(ts, 10)) / 1000);
      const remaining = Math.max(0, 900 - elapsed);
      setRevokeCooldown(remaining);
    }
  }, [subscriptionId]);

  // Countdown timer for revoke cooldown
  useEffect(() => {
    if (revokeCooldown <= 0) return;
    const timer = setInterval(() => {
      setRevokeCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [revokeCooldown]);

  // Revoke (reissue) subscription mutation
  const revokeMutation = useMutation({
    mutationFn: () => subscriptionApi.revokeSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['connection-link', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      // Remnawave resets device HWIDs on revoke — make sure the cabinet
      // re-reads the now-empty device list instead of showing the stale cache.
      queryClient.invalidateQueries({ queryKey: ['devices', subscriptionId] });
      haptic.notification('success');
      localStorage.setItem(`revoke_ts_${subscriptionId ?? 'default'}`, Date.now().toString());
      setRevokeCooldown(900);
    },
    onError: () => {
      haptic.notification('error');
    },
  });

  // Auto-refresh traffic on mount (with 30s caching)
  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = localStorage.getItem(`traffic_refresh_ts_${subscriptionId ?? 'default'}`);
    const now = Date.now();
    const cacheMs = 30 * 1000;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation, subscriptionId]);

  const copyUrl = () => {
    if (displayedConnectionUrl) {
      void copyToClipboard(displayedConnectionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      haptic.notification('success');
      showToast({ type: 'success', message: t('subscription.linkCopied', 'Ссылка скопирована') });
    }
  };

  const handleRevoke = async () => {
    const confirmed = await destructiveConfirm(
      t('subscription.revoke.warning'),
      t('subscription.revoke.confirmBtn'),
      t('subscription.revoke.title'),
    );
    if (!confirmed) return;
    revokeMutation.mutate();
  };

  // In multi-tariff mode without a specific subscription ID, redirect to list
  if (isMultiTariff && !subscriptionId && !isLoading) {
    return <Navigate to="/subscriptions" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (!subscription && subscriptionId) {
    return (
      <div className="mx-auto max-w-lg p-4 text-center">
        <div className="mb-4 text-4xl">😕</div>
        <h2 className="mb-2 text-xl font-bold text-dark-50">
          {t('subscription.notFound', 'Подписка не найдена')}
        </h2>
        <p className="mb-4 text-sm text-dark-50/60">
          {t('subscription.notFoundDesc', 'Возможно, подписка была удалена или не существует')}
        </p>
        <button
          onClick={() => navigate('/subscriptions')}
          className="rounded-xl bg-accent-500 px-6 py-2.5 text-sm font-medium text-on-accent"
        >
          {t('subscription.backToList', 'Мои подписки')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-center gap-3">
        <WebBackButton to={isMultiTariff ? '/subscriptions' : '/'} />
        <h1 className="text-2xl font-bold text-dark-50 sm:text-3xl">
          {isMultiTariff && subscription?.tariff_name
            ? subscription.tariff_name
            : t('subscription.title')}
        </h1>
      </div>

      {/* Renew / purchase CTA — raised to the top (clean accent outline) */}
      <PurchaseCTAButton subscription={subscription} isMultiTariff={isMultiTariff} />

      {/* Connection link card — prominent aurora-glass, highly readable URL */}
      {subscription && displayedConnectionUrl && !shouldHideConnectionLink && (
        <>
          <div className="aurora-hero rounded-3xl p-5">
            <div className="relative z-10">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent-500/15 text-accent-400">
                  <LinkIcon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold tracking-tight text-dark-50">
                  {t('subscription.connectionLink', 'Ссылка для подключения устройств')}
                </h2>
              </div>
              <div className="flex gap-2">
                <code
                  className="block min-w-0 flex-1 truncate whitespace-nowrap rounded-xl border border-white/10 px-3 py-2.5 font-mono text-xs text-dark-50/85"
                  style={{ background: 'rgba(0,0,0,0.22)' }}
                  title={displayedConnectionUrl}
                >
                  {displayedConnectionUrl}
                </code>
                <button
                  onClick={() => setShowQr(true)}
                  className="flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 text-dark-50/80 transition-colors hover:bg-white/10"
                  aria-label={t('subscription.showQr', 'Показать QR-код')}
                  title={t('subscription.showQr', 'Показать QR-код')}
                >
                  <svg
                    className="h-[18px] w-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h3v3M21 14v.01M14 21h.01M17.5 21H21v-3.5" />
                  </svg>
                </button>
                <button
                  onClick={copyUrl}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-colors ${
                    copied ? 'bg-success-500' : 'bg-accent-500 hover:bg-accent-600'
                  }`}
                  aria-label={t('subscription.copyLink')}
                  title={t('subscription.copyLink')}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  <span className="hidden sm:inline">
                    {copied
                      ? t('subscription.copied', 'Скопировано')
                      : t('common.copy', 'Копировать')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* QR code with the connection link inside */}
          <Sheet
            isOpen={showQr}
            onClose={() => setShowQr(false)}
            title={t('subscription.connectionQr', 'QR для подключения')}
            snapPoints={[0.8]}
          >
            <div className="relative flex flex-col items-center px-4 pb-8">
              {/* Close button */}
              <button
                onClick={() => setShowQr(false)}
                className="absolute right-1 top-0 flex h-9 w-9 items-center justify-center rounded-full text-dark-50/50 transition-colors hover:bg-white/10 hover:text-dark-50"
                aria-label={t('common.close', 'Закрыть')}
                title={t('common.close', 'Закрыть')}
              >
                <CloseIcon className="h-5 w-5" />
              </button>

              <p className="mb-6 max-w-xs text-center text-sm text-dark-400">
                {t(
                  'subscription.qrScanHint',
                  'Отсканируйте QR-код в VPN-приложении, чтобы добавить подписку',
                )}
              </p>
              <div className="rounded-3xl bg-white p-5">
                <QRCodeSVG
                  value={displayedConnectionUrl}
                  size={240}
                  level="M"
                  includeMargin={false}
                  className="h-60 w-60"
                />
              </div>
              <p className="mt-6 w-full max-w-full truncate text-center font-mono text-[11px] text-dark-500">
                {displayedConnectionUrl}
              </p>
              <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
                <button
                  onClick={copyUrl}
                  className={`flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                    copied ? 'bg-success-500' : 'bg-accent-500 hover:bg-accent-600'
                  }`}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied
                    ? t('subscription.copied', 'Скопировано')
                    : t('common.copy', 'Копировать')}
                </button>
                <button
                  onClick={() => setShowQr(false)}
                  className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-dark-200 transition-colors hover:bg-white/5"
                >
                  {t('common.close', 'Закрыть')}
                </button>
              </div>
            </div>
          </Sheet>
        </>
      )}

      {/* My Devices — moved under the connection link (rename / delete) */}
      {subscription && (
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: g.cardBg,
            border: `1px solid ${g.cardBorder}`,
            boxShadow: g.shadow,
            padding: '18px 20px',
          }}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-dark-50">
              {t('subscription.myDevices')}
            </h2>
            {devicesData && devicesData.devices.length > 0 && (
              <button
                onClick={async () => {
                  const confirmed = await destructiveConfirm(
                    t('subscription.confirmDeleteAllDevices'),
                    t('subscription.deleteAllDevices'),
                    t('subscription.deleteAllDevices'),
                  );
                  if (confirmed) deleteAllDevicesMutation.mutate();
                }}
                disabled={deleteAllDevicesMutation.isPending}
                className="text-[11px] font-medium transition-colors"
                style={{ color: 'rgb(var(--color-critical-500))' }}
              >
                {t('subscription.deleteAllDevices')}
              </button>
            )}
          </div>

          {devicesLoading ? (
            <div className="flex items-center justify-center py-8">
              <div
                className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
                style={{
                  borderColor: 'rgb(var(--color-accent-500))',
                  borderTopColor: 'transparent',
                }}
              />
            </div>
          ) : devicesData && devicesData.devices.length > 0 ? (
            <div className="space-y-2">
              <div className="mb-2 font-mono text-[11px] text-dark-50/30">
                {devicesData.device_limit === 0
                  ? `${devicesData.total} · ∞`
                  : `${devicesData.total} / ${t('subscription.devices', { count: devicesData.device_limit })}`}
              </div>
              {devicesData.devices.map((device) => {
                const isEditing = editingDeviceHwid === device.hwid;
                const displayName =
                  (device.local_name && device.local_name.trim()) ||
                  device.device_model ||
                  device.platform;

                return (
                  <div
                    key={device.hwid}
                    className="flex items-center justify-between rounded-[12px] p-3.5"
                    style={{
                      background: g.innerBg,
                      border: `1px solid ${g.innerBorder}`,
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px]"
                        style={{ background: g.trackBg }}
                      >
                        <DevicesIcon className="h-4 w-4 text-dark-50/40" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingDeviceName}
                            maxLength={DEVICE_ALIAS_MAX_LENGTH}
                            placeholder={device.device_model || device.platform}
                            onChange={(e) => setEditingDeviceName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const trimmed = editingDeviceName.trim();
                                renameDeviceMutation.mutate({
                                  hwid: device.hwid,
                                  name: trimmed || null,
                                });
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingDeviceHwid(null);
                                setEditingDeviceName('');
                              }
                            }}
                            className="w-full rounded-md border-none bg-transparent px-2 py-1 text-sm font-semibold text-dark-50 outline-none focus:ring-1"
                            style={{
                              background: g.trackBg,
                              boxShadow: `inset 0 0 0 1px ${g.innerBorder}`,
                            }}
                          />
                        ) : (
                          <div className="truncate text-sm font-semibold text-dark-50">
                            {displayName}
                          </div>
                        )}
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dark-50/30">
                          <span className="truncate">{device.platform}</span>
                          <span className="font-mono text-dark-50/20">
                            {device.hwid.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const trimmed = editingDeviceName.trim();
                              renameDeviceMutation.mutate({
                                hwid: device.hwid,
                                name: trimmed || null,
                              });
                            }}
                            disabled={renameDeviceMutation.isPending}
                            className="p-2 transition-colors"
                            style={{ color: g.textSecondary }}
                            title={t('subscription.renameDeviceSave', 'Сохранить')}
                            aria-label={t('subscription.renameDeviceSave', 'Сохранить')}
                          >
                            <CheckIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceHwid(null);
                              setEditingDeviceName('');
                            }}
                            disabled={renameDeviceMutation.isPending}
                            className="p-2 transition-colors"
                            style={{ color: g.textFaint }}
                            title={t('subscription.renameDeviceCancel', 'Отмена')}
                            aria-label={t('subscription.renameDeviceCancel', 'Отмена')}
                          >
                            <CloseIcon className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDeviceHwid(device.hwid);
                              setEditingDeviceName(device.local_name || '');
                            }}
                            className="p-2 transition-colors"
                            style={{ color: g.textFaint }}
                            title={t('subscription.renameDevice', 'Переименовать')}
                            aria-label={t('subscription.renameDevice', 'Переименовать')}
                          >
                            <EditIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const confirmed = await destructiveConfirm(
                                t('subscription.confirmDeleteDevice'),
                                t('subscription.deleteDevice'),
                                t('subscription.deleteDevice'),
                              );
                              if (confirmed) deleteDeviceMutation.mutate(device.hwid);
                            }}
                            disabled={deleteDeviceMutation.isPending}
                            className="p-2 transition-colors"
                            style={{ color: g.textFaint }}
                            title={t('subscription.deleteDevice')}
                            aria-label={t('subscription.deleteDevice')}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-[12px] text-dark-50/25">
              {t('subscription.noDevices')}
            </div>
          )}
        </div>
      )}

      {/* Additional options — moved under the renew CTA; actions 2 per row */}
      {subscription &&
        (subscription.is_active || subscription.is_limited) &&
        !subscription.is_trial &&
        subscription.device_limit !== 0 && (
          <div
            className="relative overflow-hidden rounded-3xl"
            style={{
              background: g.cardBg,
              border: `1px solid ${g.cardBorder}`,
              boxShadow: g.shadow,
              padding: '18px 20px',
            }}
          >
            <h2 className="mb-3 text-base font-bold tracking-tight text-dark-50">
              {t('subscription.additionalOptions.title')}
            </h2>

            <div className="space-y-4">
              {/* Buy Devices */}
              <DeviceTopupSheet
                open={showDeviceTopup}
                onOpen={() => setShowDeviceTopup(true)}
                onClose={() => setShowDeviceTopup(false)}
                subscription={subscription}
                subscriptionId={subscriptionId}
                devicesToAdd={devicesToAdd}
                onDevicesToAddChange={setDevicesToAdd}
                purchaseOptions={purchaseOptions}
                isDark={isDark}
              />

              {/* Reduce Devices */}
              <DeviceReductionSheet
                open={showDeviceReduction}
                onOpen={() => setShowDeviceReduction(true)}
                onClose={() => setShowDeviceReduction(false)}
                subscriptionPresent={!!subscription}
                subscriptionId={subscriptionId}
                targetDeviceLimit={targetDeviceLimit}
                onTargetDeviceLimitChange={setTargetDeviceLimit}
                isDark={isDark}
              />

              {/* Buy Traffic */}
              {subscription.traffic_limit_gb > 0 && (
                <TrafficTopupSheet
                  open={showTrafficTopup}
                  onOpen={() => setShowTrafficTopup(true)}
                  onClose={() => setShowTrafficTopup(false)}
                  subscription={subscription}
                  subscriptionId={subscriptionId}
                  selectedTrafficPackage={selectedTrafficPackage}
                  onSelectedTrafficPackageChange={setSelectedTrafficPackage}
                  purchaseOptions={purchaseOptions}
                  isDark={isDark}
                />
              )}

              {/* Server Management - only in classic mode */}
              {!isTariffsMode && (
                <ServerManagementSheet
                  open={showServerManagement}
                  onOpen={() => setShowServerManagement(true)}
                  onClose={() => setShowServerManagement(false)}
                  subscription={subscription}
                  subscriptionId={subscriptionId}
                  selectedServers={selectedServersToUpdate}
                  onSelectedServersChange={setSelectedServersToUpdate}
                  purchaseOptions={purchaseOptions}
                  isDark={isDark}
                />
              )}
            </div>
          </div>
        )}

      {/* Reissue Subscription — moved under Additional options */}
      {subscription &&
        (subscription.is_active || subscription.is_limited) &&
        !subscription.is_trial && (
          <div
            className="relative overflow-hidden rounded-3xl"
            style={{
              background: g.cardBg,
              border: `1px solid ${g.cardBorder}`,
              boxShadow: g.shadow,
              padding: '16px 20px',
            }}
          >
            <button
              onClick={handleRevoke}
              disabled={revokeMutation.isPending || revokeCooldown > 0}
              className="w-full rounded-xl border border-warning-500/30 bg-warning-500/10 p-4 text-left transition-colors hover:bg-warning-500/20 disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-warning-400">
                    {t('subscription.revoke.button')}
                  </div>
                  <div className="mt-1 text-sm text-dark-400">
                    {revokeCooldown > 0
                      ? t('subscription.revoke.cooldown', {
                          minutes: Math.floor(revokeCooldown / 60),
                          seconds: revokeCooldown % 60,
                        })
                      : t('subscription.revoke.description')}
                  </div>
                </div>
                <div className="text-warning-400">
                  {revokeMutation.isPending ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-warning-400/30 border-t-amber-400" />
                  ) : (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                      />
                    </svg>
                  )}
                </div>
              </div>
            </button>
            {revokeMutation.error && (
              <p className="mt-2 text-sm text-error-400">{getErrorMessage(revokeMutation.error)}</p>
            )}
          </div>
        )}

      {/* Daily Subscription Pause */}
      {subscription && subscription.is_daily && !subscription.is_trial && (
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: g.cardBg,
            border: `1px solid ${g.cardBorder}`,
            boxShadow: g.shadow,
            padding: '24px 28px',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight text-dark-50">
                {t('subscription.pause.title')}
              </h2>
              <div className="mt-1 text-[12px] text-dark-50/35">
                {subscription.is_limited
                  ? t('subscription.trafficLimited')
                  : subscription.status === 'disabled'
                    ? t('subscription.pause.suspended')
                    : subscription.is_daily_paused
                      ? t('subscription.pause.paused')
                      : t('subscription.pause.active')}
              </div>
            </div>
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="rounded-[10px] px-4 py-2 text-sm font-semibold transition-colors duration-300"
              style={{
                background:
                  subscription.is_daily_paused || subscription.status === 'disabled'
                    ? 'rgba(var(--color-accent-400), 0.12)'
                    : 'rgba(255,184,0,0.12)',
                border:
                  subscription.is_daily_paused || subscription.status === 'disabled'
                    ? '1px solid rgba(var(--color-accent-400), 0.2)'
                    : '1px solid rgba(255,184,0,0.2)',
                color:
                  subscription.is_daily_paused || subscription.status === 'disabled'
                    ? 'rgb(var(--color-accent-400))'
                    : 'rgb(var(--color-urgent-400))',
              }}
            >
              {pauseMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                </span>
              ) : subscription.is_daily_paused || subscription.status === 'disabled' ? (
                t('subscription.pause.resumeBtn')
              ) : (
                t('subscription.pause.pauseBtn')
              )}
            </button>
          </div>

          {/* Pause mutation error */}
          {pauseMutation.isError &&
            (() => {
              const balanceError = getInsufficientBalanceError(pauseMutation.error);
              if (balanceError) {
                const missingAmount = balanceError.required - balanceError.balance;
                return (
                  <div className="mt-4">
                    <InsufficientBalancePrompt
                      missingAmountKopeks={missingAmount}
                      message={t('subscription.pause.insufficientBalance')}
                      compact
                    />
                  </div>
                );
              }
              return (
                <div
                  className="mt-4 rounded-[10px] p-3 text-center text-sm"
                  style={{
                    background: 'rgba(255,59,92,0.08)',
                    border: '1px solid rgba(255,59,92,0.15)',
                    color: 'rgb(var(--color-critical-500))',
                  }}
                >
                  {getErrorMessage(pauseMutation.error)}
                </div>
              );
            })()}

          {/* Paused info or Next charge progress bar */}
          {subscription.is_daily_paused ? (
            <div
              className="mt-4 rounded-[12px] p-4"
              style={{
                background: 'rgba(255,184,0,0.06)',
                border: '1px solid rgba(255,184,0,0.12)',
              }}
            >
              <div className="flex items-start gap-3">
                <PauseIcon
                  className="h-5 w-5 shrink-0"
                  style={{ color: 'rgb(var(--color-urgent-400))' }}
                />
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: 'rgb(var(--color-urgent-400))' }}
                  >
                    {t('subscription.pause.pausedInfo')}
                  </div>
                  <div className="mt-1 text-[12px] text-dark-50/35">
                    {t('subscription.pause.pausedDescription')}{' '}
                    {new Date(subscription.end_date).toLocaleDateString(uiLocale())} (
                    {t('subscription.pause.days', { count: subscription.days_left })})
                  </div>
                </div>
              </div>
            </div>
          ) : (
            subscription.next_daily_charge_at &&
            (() => {
              const now = new Date();
              const nextChargeStr = subscription.next_daily_charge_at.endsWith('Z')
                ? subscription.next_daily_charge_at
                : subscription.next_daily_charge_at + 'Z';
              const nextCharge = new Date(nextChargeStr);
              const totalMs = 24 * 60 * 60 * 1000;
              const remainingMs = Math.max(0, nextCharge.getTime() - now.getTime());
              const elapsedMs = totalMs - remainingMs;
              const progress = Math.min(100, (elapsedMs / totalMs) * 100);

              const hours = Math.floor(remainingMs / (1000 * 60 * 60));
              const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

              return (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-dark-50/35">
                      {t('subscription.pause.nextCharge')}
                    </span>
                    <span className="font-mono text-[12px] font-semibold text-dark-50">
                      {hours > 0
                        ? `${hours}${t('subscription.pause.hours')} ${minutes}${t('subscription.pause.minutes')}`
                        : `${minutes}${t('subscription.pause.minutes')}`}
                    </span>
                  </div>
                  <div
                    className="relative h-2 overflow-hidden rounded-full"
                    style={{ background: g.trackBg }}
                  >
                    <div
                      className="absolute inset-0 origin-left rounded-full transition-transform duration-500"
                      style={{
                        transform: `scaleX(${progress / 100})`,
                        background:
                          'linear-gradient(90deg, rgb(var(--color-accent-500)), rgb(var(--color-accent-400)))',
                      }}
                    />
                  </div>
                  {subscription.daily_price_kopeks && (
                    <div className="mt-2 text-center text-[11px] text-dark-50/25">
                      {t('subscription.pause.willBeCharged')}:{' '}
                      {formatPrice(subscription.daily_price_kopeks)}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Delete expired subscription */}
      {isMultiTariff &&
        subscription &&
        !subscription.is_active &&
        !subscription.is_trial &&
        !subscription.is_limited && (
          <div className="space-y-3">
            <DeleteSubscriptionSheet
              subscriptionId={subscription.id}
              open={showDeleteSheet}
              onOpen={() => setShowDeleteSheet(true)}
              onClose={() => setShowDeleteSheet(false)}
              textSecondary={g.textSecondary}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
                navigate('/subscriptions', { replace: true });
              }}
            />
          </div>
        )}
    </div>
  );
}
