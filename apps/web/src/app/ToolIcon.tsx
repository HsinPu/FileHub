export type ToolIconName = 'empty' | 'up' | 'down' | 'search' | 'sort' | 'list' | 'grid' | 'refresh' | 'folder' | 'menu' | 'close' | 'files' | 'share' | 'trash' | 'settings' | 'person' | 'storage' | 'home' | 'chevron' | 'gallery' | 'download' | 'upload' | 'copy' | 'cut' | 'archive' | 'rename' | 'select' | 'more' | 'arrow' | 'back' | 'preview' | 'info' | 'login' | 'check' | 'error' | 'tasks';
export function ToolIcon({ name }: { name: ToolIconName }) {
  const glyphs = {
    empty: 'inbox', up: 'keyboard_arrow_up', down: 'keyboard_arrow_down',
    tasks:'swap_vert',login:'login',check:'check_circle',error:'error_outline',info:'info', gallery: 'photo_library', search: 'search', sort: 'sort', list: 'view_list', grid: 'view_module', refresh: 'refresh',
    folder: 'create_new_folder', menu: 'menu',
    close: 'close', files: 'folder', share: 'share', trash: 'delete', settings: 'settings_applications', person: 'person', storage: 'storage', home: 'home', chevron: 'chevron_right',
    download:'file_download',upload:'file_upload',copy:'content_copy',cut:'content_cut',archive:'archive',rename:'edit',select:'check_circle',more:'more_vert',arrow:'arrow_upward',back:'arrow_back',preview:'visibility',
  };
  return <span className="tool-icon" aria-hidden="true">{glyphs[name]}</span>;
}
