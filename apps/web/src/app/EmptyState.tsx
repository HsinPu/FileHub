import { ToolIcon } from './ToolIcon.js';

/** 共用空狀態保留原文案；錯誤與載入仍由原功能處理。 */
export function EmptyState({ description }: { description: string }) {
  return <div className="empty-state"><ToolIcon name="empty"/><p>{description}</p></div>;
}
