import type { ReactNode } from 'react';
import { ToolIcon } from '../../app/ToolIcon.js';
import { Button, Tag } from 'antd';
import type { PublicEntry } from '@filehub/contracts';
import { TrashPanel } from './TrashPanel.js';

export function TrashPage({ navigation, entry, csrf, onExpired, onBack }: { navigation:ReactNode; entry: PublicEntry; csrf: string; onExpired(): void; onBack(): void }) {
  return <section className="trash-page" aria-label="垃圾桶管理頁面"><header className="management-heading"><h1>垃圾桶</h1><p>查看並還原目前入口的回收項目。</p></header><div className="management-topline">{navigation}<div className="management-buttons"><Button type="text" aria-label="返回檔案列表" title="返回檔案列表" onClick={onBack}><ToolIcon name="back"/></Button></div></div><div className="management-card"><div className="management-card-heading"><h2>{entry.label}</h2><Tag>{entry.readOnly ? '唯讀' : '可寫入'}</Tag></div><TrashPanel entry={entry.id} csrf={csrf} onExpired={onExpired} onBack={onBack} standalone/></div></section>;
}
