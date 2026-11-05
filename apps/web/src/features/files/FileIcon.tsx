import type { ResourceMetadata } from '@filehub/contracts';

/** 固定 File Browser listing-icons 的類型語言；圖示不宣告 renderer 能力。 */
export function FileIcon({ resource }: { resource: Pick<ResourceMetadata, 'kind' | 'name'> }) {
  const extension = resource.name.split('.').pop()?.toLowerCase() ?? '';
  const glyph = resource.kind === 'directory' ? 'folder' : resource.kind === 'link' ? 'link_off'
    : /^(png|jpe?g|webp|gif|svg|bmp)$/.test(extension) ? 'image'
    : /^(csv|xlsx?|ods|db)$/.test(extension) ? 'border_all'
    : /^(mp3|wav|ogg|flac)$/.test(extension) ? 'volume_up'
    : /^(mp4|mkv|webm|mov)$/.test(extension) ? 'movie'
    : /^(zip|gz|tar|7z|rar)$/.test(extension) ? 'archive'
    : /^(pdf|txt|md|log|json|html?|css|[cm]?jsx?|tsx?|docx?)$/.test(extension) ? 'description' : 'insert_drive_file';
  return <span className={`tool-icon file-kind ${resource.kind}`} aria-hidden="true">{glyph}</span>;
}
