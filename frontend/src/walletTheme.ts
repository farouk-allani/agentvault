import type { ThemeVars } from '@mysten/dapp-kit';

/**
 * Custom brutalist theme for dapp-kit that matches the AgentVault design system
 *
 * Design tokens:
 * - ink: #0e0e10 (dark text/borders)
 * - paper: #fff9f1 (cream background)
 * - accent colors from feature cards
 */
export const brutalistTheme: ThemeVars = {
  blurs: {
    modalOverlay: 'blur(4px)',
  },
  backgroundColors: {
    primaryButton: '#fff9f1',
    primaryButtonHover: '#fff2df',
    outlineButtonHover: '#fff2df',
    modalOverlay: 'rgba(14, 14, 16, 0.5)',
    modalPrimary: '#fff9f1',
    modalSecondary: '#fff',
    iconButton: 'transparent',
    iconButtonHover: '#f0f0f0',
    dropdownMenu: '#fff9f1',
    dropdownMenuSeparator: '#eee',
    walletItemSelected: '#fff2df',
    walletItemHover: '#fff2df',
  },
  borderColors: {
    outlineButton: '#0e0e10',
  },
  colors: {
    primaryButton: '#0e0e10',
    outlineButton: '#0e0e10',
    iconButton: '#0e0e10',
    body: '#0e0e10',
    bodyMuted: 'rgba(14, 14, 16, 0.6)',
    bodyDanger: '#ef4444',
  },
  radii: {
    small: '8px',
    medium: '12px',
    large: '16px',
    xlarge: '24px',
  },
  shadows: {
    primaryButton: '0 0 0 2px #0e0e10, 4px 4px 0 rgba(0, 0, 0, 0.2)',
    walletItemSelected: '3px 3px 0 rgba(0, 0, 0, 0.15)',
  },
  fontWeights: {
    normal: '500',
    medium: '600',
    bold: '700',
  },
  fontSizes: {
    small: '14px',
    medium: '16px',
    large: '18px',
    xlarge: '20px',
  },
  typography: {
    fontFamily:
      "'Space Grotesk', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontStyle: 'normal',
    lineHeight: '1.4',
    letterSpacing: '0',
  },

};
