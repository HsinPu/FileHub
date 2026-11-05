import { Button } from 'antd';
import type { ResourceMetadata } from '@filehub/contracts';
import { ToolIcon } from '../../app/ToolIcon.js';

export function ResourceActions({ resource, open }: { resource: ResourceMetadata; open(anchor: HTMLElement): void }) {
  return <Button className="resource-more" type="text" data-resource-menu aria-label={`更多操作 ${resource.name}`} title="更多操作" onClick={event => open(event.currentTarget)}><ToolIcon name="more"/></Button>;
}
