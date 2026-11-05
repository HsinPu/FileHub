import { EmptyState } from '../../app/EmptyState.js';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Pagination, Spin } from 'antd';
import { PreferencesSchema, EntriesResponseSchema, ListingResponseSchema, MetadataResponseSchema, type Preferences, type PublicEntry, type ResourceMetadata, type SessionResponse } from '@filehub/contracts';
import { ApiClientError } from '../../lib/api.js';
import { api, errorText } from '../../lib/client.js';
import { useResource } from '../../lib/useResource.js';
import { href, useLocation, type Location } from './navigation.js';

import { TrashPage } from '../trash/TrashPage.js';
import { TrashDialog } from '../trash/TrashDialog.js';
import { WriteDialog } from './WriteDialog.js';
import { UploadController } from '../uploads/controller.js';
import { UploadPicker } from '../uploads/UploadPanel.js';
import { SearchControls } from '../search/SearchControls.js';
import { PreviewDialog } from '../previews/PreviewDialog.js';
import { OperationController, type Clipboard } from '../operations/controller.js';
import { TaskDrawer } from '../tasks/TaskDrawer.js';
import { DestinationDialog } from '../operations/DestinationDialog.js';

import { ShareDialog } from '../shares/ShareDialog.js';
import { ShareManagementPage } from '../shares/ShareManagementPage.js';

import { ManagementNavigation } from '../settings/ManagementNavigation.js';
import { SettingsPage } from '../settings/SettingsPage.js';
import { WorkspaceShell } from './WorkspaceShell.js';
import { FileToolbar } from './FileToolbar.js';
import { PathNavigation } from './PathNavigation.js';
import { SelectionSummary, SelectionToolbar } from './SelectionToolbar.js';
import { ResourceMenu, type MenuPosition } from './ResourceMenu.js';
import type { FileAction } from './actions.js';
import { FileListing } from './FileListing.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { AccountMenu } from '../../app/AccountMenu.js';
import { WorkspaceNavigation } from './WorkspaceNavigation.js';
import { BrandMark } from '../../app/BrandMark.js';

type Navigate = (next: Location, replace?: boolean) => void;
const home = (location: Location, entry: PublicEntry, path = entry.scopes[0]?.path ?? ''): Location => ({ ...location, view: 'files', entry: entry.id, path, filter: '', page: 1, version: '' });

export function Workspace({ session, onExpired, onLogout, loggingOut, logoutError }: { session: SessionResponse; onExpired(message?:string): void; onLogout(): void; loggingOut: boolean; logoutError?: string }) {
  const preferences=useResource('/api/settings',PreferencesSchema,onExpired,true);
  const { location, navigate, registerGuard, canLeave } = useLocation();
  const entries = useResource('/api/entries', EntriesResponseSchema, onExpired);
  const current = entries.value?.entries.find((entry) => entry.id === location.entry);
  const [uploadRevision, setUploadRevision] = useState(0);
  const [uploads] = useState(() => new UploadController(session.csrfToken, onExpired, () => { setUploadRevision((value) => value + 1); }));
  const [operations] = useState(() => new OperationController(session.user.id, session.csrfToken, onExpired, () => { setUploadRevision((value) => value + 1); }));
  const operationState = useSyncExternalStore(operations.subscribe, operations.getSnapshot);
  const [destination, setDestination] = useState<Clipboard>();
  const uploadLifetime = useRef(0);
  useEffect(() => {
    const generation = ++uploadLifetime.current;
    // StrictMode 的 setup/cleanup/setup 不應永久關閉同一個 controller。
    operations.start();
    return () => { queueMicrotask(() => { if (uploadLifetime.current === generation) { uploads.dispose(); operations.dispose(); } }); };
  }, [uploads, operations]);
  useEffect(() => { if (current) void uploads.load({ entryId: current.id, label: current.label, parent: '' }); }, [uploads, current?.id, current?.label]);
  useEffect(() => { if (entries.value) operations.validateEntries(entries.value.entries); }, [entries.value, operations]);
  useEffect(() => { const reconnect = () => { void operations.refresh(); }; window.addEventListener('online', reconnect); window.addEventListener('focus', reconnect); return () => { window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect); }; }, [operations]);
  useEffect(() => {
    const first = entries.value?.entries[0];
    if (!location.entry && first) navigate({ ...home(location, first), view: location.view ?? 'files', section: location.section ?? 'personal' }, true);
  }, [entries.value, location, navigate]);
  const selectedScope = current?.scopes.filter((scope) => !scope.path || location.path === scope.path || location.path.startsWith(`${scope.path}/`)).sort((a, b) => b.path.length - a.path.length)[0]?.path ?? '';
  const privatePage = location.view ?? 'files';
  const showFiles = () => navigate({ ...location, view: 'files' });
  const managementNavigation=<ManagementNavigation location={location} administrator={session.user.role==='admin'} canTrash={Boolean(current)} navigate={navigate}/>;
  const previousPage = useRef(`${privatePage}:${location.section}`);
  useEffect(() => { const next = `${privatePage}:${location.section}`; if (previousPage.current !== next) { previousPage.current = next; document.getElementById('main')?.focus({ preventScroll: true }); } }, [privatePage, location.section]);
  return <WorkspaceShell brand={<a className="workspace-brand workspace-wordmark" href={href(current ? home(location,current) : {...location,view:'files'})} aria-label="FileHub 首頁" title="FileHub" onClick={event => { if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); if (current) navigate(home(location,current)); else showFiles(); }}><BrandMark/><strong>FileHub</strong></a>} navigation={activate => <WorkspaceNavigation entries={entries.value?.entries ?? []} current={current} scope={selectedScope} location={location} page={privatePage} navigate={navigate} files={showFiles} shares={() => navigate({ ...location, view: 'shares' })} trash={() => navigate({ ...location, view: 'trash' })} activate={activate} username={session.user.username}/>} header={<><div className="account-actions"><TaskDrawer uploads={uploads} operations={operations} blocked={Boolean(destination)}/><AccountMenu session={session} settings={() => navigate({ ...location, view: 'settings', section: 'personal' })} logout={() => { if (canLeave()) onLogout(); }} busy={loggingOut}/></div></>}>
        {logoutError && <Alert type="error" showIcon title={logoutError}/>}
        {operationState.notice && (!operationState.open || Boolean(destination)) && <Alert className="operation-notice" type="info" showIcon title={operationState.notice} closable onClose={() => operations.dismissNotice()}/>}
        {operationState.clipboard && <div className="operation-clipboard" role="region" aria-label="檔案剪貼簿"><span>{operationState.clipboard.kind === 'move' ? '待搬移' : '待複製'}：{operationState.clipboard.label}，{operationState.clipboard.sources.length} 項</span><div><Button disabled={operationState.creating} onClick={() => setDestination(operationState.clipboard)}>選擇目的地</Button><Button disabled={operationState.creating} onClick={() => operations.clearClipboard()}>清除剪貼簿</Button></div></div>}
        {destination && <DestinationDialog controller={operations} clipboard={destination} entries={entries.value?.entries ?? []} current={{entry:location.entry,path:location.path}} onClose={() => setDestination(undefined)} onExpired={onExpired}/>}
        {privatePage === 'settings' ? <SettingsPage navigation={managementNavigation} session={session} location={location} navigate={navigate} registerGuard={registerGuard} onExpired={onExpired} onPasswordChanged={() => onExpired('密碼已更新，請重新登入。')} onChanged={() => { entries.reload(); preferences.reload(); setUploadRevision(value => value + 1); }} onBack={showFiles}/> : privatePage === 'shares' ? <ShareManagementPage navigation={managementNavigation} csrf={session.csrfToken} registerGuard={registerGuard} onExpired={onExpired} onBack={showFiles}/> : entries.loading ? <Loading text="正在取得儲存入口"/> : entries.error ? <Failure error={entries.error} retry={entries.reload}/> : !entries.value?.entries.length ? <EmptyState description="目前沒有可存取的入口，請聯絡管理員。"/> : !current ? <Failure error={new ApiClientError('http', 404, 'NOT_FOUND')} retry={entries.reload}/> : privatePage === 'trash' ? <TrashPage navigation={managementNavigation} key={current.id} entry={current} csrf={session.csrfToken} onExpired={onExpired} onBack={showFiles}/> : <FilePanel key={href(location)} preferredView={preferences.value?.defaultView??'list'} pageSize={preferences.value?.pageSize??50} entry={current} location={location} navigate={navigate} onExpired={onExpired} refreshEntries={entries.reload} csrf={session.csrfToken} uploads={uploads} operations={operations} uploadRevision={uploadRevision}/>}
  </WorkspaceShell>;
}
function Loading({ text }: { text: string }) { return <div className="files-feedback" role="status"><Spin size="small"/><span>{text}，請稍候。</span></div>; }
function Failure({ error, retry }: { error: unknown; retry(): void }) { return <div className="files-feedback"><Alert type="error" showIcon title={errorText(error)} action={<Button onClick={retry}>重試</Button>}/></div>; }

function FilePanel({ preferredView,pageSize,entry, location, navigate, onExpired, refreshEntries, csrf, uploads, operations, uploadRevision }: { preferredView:Preferences['defaultView'];pageSize:number;entry: PublicEntry; location: Location; navigate: Navigate; onExpired(): void; refreshEntries(): void; csrf: string; uploads: UploadController; operations: OperationController; uploadRevision: number }) {
  const query = new URLSearchParams({ path: location.path, sort: location.sort, direction: location.direction, offset: String((location.page - 1) * pageSize), limit: String(pageSize) });
  if (location.page > 1) query.set('version', location.version);
  if (location.filter) query.set('filter', location.filter);
  const listing = useResource(`/api/entries/${entry.id}/files?${query.toString()}`, ListingResponseSchema, onExpired);
  const seenUpload = useRef(uploadRevision), reloadListing = listing.reload;
  useEffect(() => { if (seenUpload.current !== uploadRevision) { seenUpload.current = uploadRevision; reloadListing(); } }, [uploadRevision, reloadListing]);
  const [selected, setSelected] = useState<{ version: string; paths: string[] }>({ version: '', paths: [] });
  const [selecting, setSelecting] = useState(false);
  const [menu, setMenu] = useState<{version:string; resources:ResourceMetadata[]; position:MenuPosition; trigger:HTMLElement}>();
  const clearSelection = () => { setSelected({version:'',paths:[]}); setSelecting(false); setMenu(undefined); };
  const [trash, setTrash] = useState<ResourceMetadata>();
  const [dialog, setDialog] = useState<{ source?: ResourceMetadata }>();
  const [share,setShare]=useState<ResourceMetadata>();
  const [preview, setPreview] = useState<ResourceMetadata>();
  const [view, setView] = useState<Preferences['defaultView']>(preferredView);
  useEffect(()=>{setView(preferredView);},[preferredView]);
  const [recursive, setRecursive] = useState(false);
  const [download, setDownload] = useState<{ pending: boolean; message?: string; error?: string }>({ pending: false });
  const lifecycle = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifecycle.current = controller; return () => { controller.abort(); }; }, []);
  const value = listing.value;
  const operationState = useSyncExternalStore(operations.subscribe, operations.getSnapshot);
  useEffect(() => { if (value) operations.validateListing(entry.id, value, !location.filter && value.total <= value.items.length); }, [entry.id, value, location.filter, operations]);
  const selectedPaths = value?.version === selected.version ? selected.paths : [];
  const open = (path: string) => { navigate({ ...location, path, filter: '', page: 1, version: '' }); };
  const refresh = () => { requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-file-refresh]')?.focus()); clearSelection(); setDownload({ pending: false }); refreshEntries(); if (location.page > 1) navigate({ ...location, page: 1, version: '' }); else listing.reload(); };
  const startDownload = (resource: ResourceMetadata) => {
    if (download.pending || !resource.canDownload) return;
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted) return;
    setDownload({ pending: true });
    const params = new URLSearchParams({ path: resource.path, version: resource.version });
    void api(`/api/entries/${entry.id}/metadata?${params.toString()}`, MetadataResponseSchema, { signal: controller.signal }).then(() => {
      if (controller.signal.aborted) return;
      const anchor = document.createElement('a'); anchor.href = `/api/entries/${entry.id}/download?${params.toString()}`; anchor.download = resource.name;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setDownload({ pending: false, message: '已交給瀏覽器下載，請在瀏覽器確認結果。' });
    }, (error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof ApiClientError && error.status === 401) onExpired();
      else setDownload({ pending: false, error: errorText(error) });
    });
  };
  const chosen = value?.items.filter((item) => selectedPaths.includes(item.path)) ?? [];
  const actionsFor = (resources: ResourceMetadata[]): [FileAction,FileAction,FileAction,FileAction,FileAction,FileAction,FileAction] => {
    const first = resources[0], one = resources.length === 1;
    return [
      { key:'share', icon:'share', label:'分享', name:'分享所選項目', disabled:!one || !first?.canShare, run:()=>{if(first)setShare(first);} },
      { key:'download', icon:'download', label:'下載', name:'下載所選檔案', busy:download.pending, disabled:!one || !first?.canDownload || download.pending, run:()=>{if(first)startDownload(first);} },
      { key:'copy', icon:'copy', label:'複製', name:'複製所選項目', disabled:operationState.creating || !operationState.capabilities?.kinds.includes('copy') || !resources.length || resources.length>16 || resources.some(row=>!row.canCopy), run:()=>operations.capture('copy',entry,location.path,resources) },
      { key:'cut', icon:'cut', label:'剪下', name:'剪下所選項目', disabled:operationState.creating || !operationState.capabilities?.kinds.includes('move') || !resources.length || resources.length>16 || resources.some(row=>!row.canCopy || !row.canWrite), run:()=>operations.capture('move',entry,location.path,resources) },
      { key:'archive', icon:'archive', label:'ZIP', name:'建立 ZIP', disabled:operationState.creating || !operationState.capabilities?.kinds.includes('archive') || !resources.length || resources.length>16 || resources.some(row=>!row.canCopy), run:()=>{void operations.archive(entry,resources);} },
      { key:'rename', icon:'rename', label:'重新命名', name:'重新命名', disabled:!one || !first?.canWrite, run:()=>{if(first)setDialog({source:first});} },
      { key:'trash', icon:'trash', label:'移至垃圾桶', name:'移至垃圾桶', disabled:!one || !first?.canWrite, run:()=>{if(first)setTrash(first);} },
    ];
  };
  const actions=actionsFor(chosen), rename=actions[5], trashAction=actions[6];
  const activeMenu=menu?.version===value?.version?menu:undefined;
  const menuActions=actionsFor(activeMenu?.resources??[]).map(action=>action.key==='download' && activeMenu?.resources.length===1?{...action,name:'下載 '+activeMenu.resources[0]?.name}:action);
  if(activeMenu?.resources.length===1 && activeMenu.resources[0]?.kind==='file') { const resource=activeMenu.resources[0]; menuActions.unshift({key:'preview',icon:'preview',label:'預覽',name:'預覽 '+resource.name,disabled:!resource.canDownload,run:()=>setPreview(resource)}); }
  const openMenu=(resource:ResourceMetadata,trigger:HTMLElement,position?:MenuPosition)=>{
    if(!value)return;
    const resources=selectedPaths.includes(resource.path)?chosen:[resource];
    if(resource.canDownload || resource.canWrite || resource.canCopy || resource.canShare){setSelected({version:value.version,paths:resources.map(row=>row.path)});setSelecting(true);}
    const box=trigger.getBoundingClientRect();setMenu({version:value.version,resources,trigger,position:position??{x:Math.min(box.left,window.innerWidth-220),y:Math.min(box.bottom,window.innerHeight-340)}});
  };
  return <section className="file-panel" aria-label="檔案列表">
    {share&&<ShareDialog entry={entry.id} resource={share} csrf={csrf} onExpired={onExpired} onClose={()=>setShare(undefined)}/>}
    {preview && <PreviewDialog entry={entry.id} resource={preview} onExpired={onExpired} onCancel={() => { setPreview(undefined); }}/>}
    <PathNavigation value={value} location={location} navigate={navigate} label={entry.label} readOnly={entry.readOnly} summary={<SelectionSummary total={recursive?undefined:value?.total} omitted={value?.omitted??0}/>} actions={selectedPaths.length?null:<div className="primary-actions"><UploadPicker controller={uploads} onSelected={() => operations.setOpen(true)} target={{ entryId: entry.id, label: entry.label, parent: location.path }} disabled={!value?.canCreate || listing.loading}/><Button type="default" className="new-folder" aria-label="新建資料夾" title="新建資料夾" onClick={() => { setDialog({}); }} disabled={!value?.canCreate || listing.loading}><ToolIcon name="folder"/><span className="toolbar-label">新建資料夾</span></Button></div>}/>
    <div className="file-command-row"><FileToolbar location={location} navigate={navigate} view={view} onView={setView} loading={listing.loading} refresh={refresh} selecting={selecting || selectedPaths.length>0} selected={selectedPaths.length>0} onSelecting={()=>{if(selecting || selectedPaths.length)clearSelection();else setSelecting(true);}} search={<SearchControls filter={location.filter ?? ''} onFilter={filter => navigate({ ...location, filter, page: 1, version: '' })} onMode={mode => { setRecursive(mode); clearSelection(); }} entry={entry.id} path={location.path} onExpired={onExpired} open={(resource) => { if (resource.kind === 'file' && resource.canDownload) setPreview(resource); else open(resource.kind === 'directory' ? resource.path : resource.path.split('/').slice(0, -1).join('/')); }}/>}/>
    <SelectionToolbar location={location} navigate={navigate} refresh={refresh} loading={listing.loading} view={view} onView={setView} count={selectedPaths.length} clear={clearSelection} actions={actions.slice(0,5)} rename={rename} trash={trashAction}/></div>
    <ResourceMenu position={activeMenu?.position} actions={menuActions} close={focus=>{if(focus)activeMenu?.trigger.focus();setMenu(undefined);}}/>
    {chosen.length > 16 && <p role="status" className="selection-note">每份背景工作最多 16 項，請減少選取後再複製、剪下或建立 ZIP。</p>}
    {trash && <TrashDialog entry={entry.id} source={trash} csrf={csrf} onExpired={onExpired} onCancel={() => { setTrash(undefined); }} onDone={() => { setTrash(undefined); refresh(); }}/>}
    {dialog && <WriteDialog entry={entry.id} parent={location.path} {...(dialog.source ? { source: dialog.source } : {})} csrf={csrf} onExpired={onExpired} onCancel={() => { setDialog(undefined); }} onDone={() => { setDialog(undefined); refresh(); }}/>}
    {download.error && <Alert type="error" showIcon title={download.error}/>}{download.message && <p className="download-feedback" role="status">{download.message}</p>}
    {!recursive && (listing.loading ? <Loading text="正在載入目錄"/> : listing.error ? <Failure error={listing.error} retry={refresh}/> : value && <>
      <FileListing entry={entry.id} value={value} view={view} selected={selectedPaths} selecting={selecting || selectedPaths.length>0} onSelected={paths => {setSelecting(true);setSelected({ version: value.version, paths });}} onMenu={openMenu} sort={location.sort} direction={location.direction} onSort={sort=>navigate({...location,sort,direction:sort===location.sort && location.direction==='asc'?'desc':'asc',page:1,version:''})} open={open} preview={setPreview} onExpired={onExpired}/>
      {value.total > pageSize && <Pagination className="file-pagination" current={location.page} pageSize={pageSize} total={value.total} showSizeChanger={false} responsive onChange={(page) => { navigate({ ...location, page, version: value.version }); }}/>}<p className="listing-note">僅顯示此層內容。檔案可能由其他程式更新，重新整理可取得最新列表。</p>
    </>)}
  </section>;
}
