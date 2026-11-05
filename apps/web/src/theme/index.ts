import type { CSSProperties } from 'react';
import type { ThemeConfig } from 'antd';

const palette = {
  primary: '#245ea8', primaryHover: '#1c4b87', surface: '#ffffff', background: '#ffffff', text: '#202832', secondary: '#596673',
  share: '#245ea8', danger: '#b42318', warning: '#845300', success: '#267044',
  previewBackdrop: '#000000', previewCanvas: '#252525', previewMuted: '#cccccc',
  action: '#596673', folder: '#527eb1', search: '#ffffff', sidebar: '#ffffff', active: '#e0e8f3',
  hoverSurface: '#f7f9fc', disabledBackground: '#f0f2f5',
  border: '#dce1e7', controlBorder: '#8190a2', divider: '#edf0f3', selected: '#eaf1fb', selection: '#245ea8', inverse: '#ffffff',
};
const fontFamily = 'Roboto, "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif';
export const theme: ThemeConfig = {
  token: {
    colorPrimary: palette.primary, colorBgContainer: palette.surface, colorBgLayout: palette.background,
    colorText: palette.text, colorTextSecondary: palette.secondary, colorTextPlaceholder: palette.secondary, colorBorder: palette.controlBorder, colorBorderSecondary: palette.divider,
    colorPrimaryHover: palette.primaryHover, colorLink: palette.primary, colorLinkHover: palette.primaryHover,
    colorError: palette.danger, colorWarning: palette.warning, colorSuccess: palette.success,
    colorInfo: palette.primary, colorInfoBg: '#edf3fb', colorInfoBorder: '#b9cee9', colorWarningBg: '#fff5df', colorWarningBorder: '#e3c688', colorErrorBg: '#fff1ef', colorErrorBorder: '#e8b0aa', colorSuccessBg: '#edf7f0', colorSuccessBorder: '#b9d9c3',
    colorTextDisabled: palette.secondary, colorBgContainerDisabled: palette.disabledBackground,
    fontFamily, fontWeightStrong: 500,
    fontSize: 14, lineHeight: 1.5, controlHeight: 40, borderRadius: 6,
  },
  components: {
    Progress: { defaultColor: palette.share }, Button: { primaryShadow: 'none', textHoverBg: palette.hoverSurface }, Tag: { borderRadiusSM: 4 },
    Table: { headerBg: palette.surface, rowHoverBg: palette.hoverSurface }, Menu: { itemHoverBg: palette.hoverSurface },
  },
};
export const cssVariables: CSSProperties & Record<`--${string}`, string> = {
  '--fh-sidebar-width': '224px', '--fh-header-height': '64px', '--fh-workspace-padding': '24px',
  '--fh-font-family': fontFamily,
  '--fh-font-size': '14px', '--fh-radius': '6px', '--fh-overlay-radius': '8px', '--fh-control-height': '40px',
  '--fh-primary': palette.primary, '--fh-surface': palette.surface, '--fh-background': palette.background,
  '--fh-text': palette.text, '--fh-secondary': palette.secondary, '--fh-border': palette.border,
  '--fh-divider': palette.divider, '--fh-selected': palette.selected,
  '--fh-hover-surface': palette.hoverSurface,
  '--fh-control-border': palette.controlBorder, '--fh-sidebar': palette.sidebar, '--fh-active': palette.active, '--fh-primary-hover': palette.primaryHover,
  '--fh-action': palette.action, '--fh-folder': palette.folder, '--fh-search': palette.search,
  '--fh-share-icon':palette.share, '--fh-danger':palette.danger, '--fh-preview-backdrop':palette.previewBackdrop, '--fh-preview-canvas':palette.previewCanvas, '--fh-preview-muted':palette.previewMuted,
  '--fh-warning': palette.warning, '--fh-success': palette.success, '--fh-selection': palette.selection, '--fh-inverse': palette.inverse,
};
