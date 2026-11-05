import type { PropsWithChildren } from 'react';
import { ConfigProvider } from 'antd';
import zhTW from 'antd/locale/zh_TW';
import { cssVariables, theme } from '../theme/index.js';

export function Providers({ children }: PropsWithChildren) {
  return <ConfigProvider locale={zhTW} theme={theme} button={{ autoInsertSpace: false }} modal={{styles:{root:cssVariables}}}><div className="filehub-root" style={cssVariables}>{children}</div></ConfigProvider>;
}
