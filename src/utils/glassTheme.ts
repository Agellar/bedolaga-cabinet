/**
 * Theme-aware glass morphism color tokens.
 * Provides consistent colors for the glassmorphic card components
 * that work on both dark and light backgrounds.
 */
export function getGlassColors(isDark: boolean) {
  return {
    // Card container — aurora glass (fork restyle): frosted translucent
    // surface with a faint accent wash driven by the live --color-accent-*
    // token, so it recolours with the dashboard theme. Matches .glass-card
    // / .aurora-hero used on the Balance & Referral tabs.
    cardBg: isDark
      ? 'linear-gradient(135deg, rgba(var(--color-accent-500),0.07) 0%, rgba(var(--color-accent-400),0) 55%), linear-gradient(145deg, rgba(var(--color-dark-800),0.55) 0%, rgba(var(--color-dark-900),0.42) 100%)'
      : 'linear-gradient(135deg, rgba(var(--color-accent-500),0.05) 0%, rgba(255,255,255,0) 55%), linear-gradient(145deg, rgba(255,255,255,0.90) 0%, rgba(255,255,255,0.80) 100%)',
    cardBorder: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',

    // Inner sections (cards within cards)
    innerBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    innerBorder: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',

    // Hover states
    hoverBg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    hoverBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)',

    // Text
    text: isDark ? '#fff' : '#1a1a2e',
    textSecondary: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.5)',
    textMuted: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
    textFaint: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
    textGhost: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',

    // Progress bar track
    trackBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    trackBorder: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',

    // Code blocks
    codeBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
    codeBorder: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)',

    // Glow effects — reduced in light mode
    glowAlpha: isDark ? '15' : '08',

    // Shadows — aurora glass: top inset highlight + soft drop on both themes
    shadow: isDark
      ? 'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 12px 36px -16px rgba(0,0,0,0.55)'
      : 'inset 0 1px 0 0 rgba(255,255,255,0.6), 0 8px 28px -16px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.03)',
  };
}
