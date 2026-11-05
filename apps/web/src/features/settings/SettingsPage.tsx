import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import type { TSchema } from 'typebox';
import { AdminSnapshotSchema, PreferencesSchema, type SessionResponse } from '@filehub/contracts';
import { api, errorText } from '../../lib/client.js';
import { ApiClientError } from '../../lib/api.js';
import { useResource } from '../../lib/useResource.js';
import { type Location, type RegisterNavigationGuard } from '../files/navigation.js';
import { ToolIcon } from '../../app/ToolIcon.js';
import { PersonalSettings } from './PersonalSettings.js';
import { AccountSettings } from './AccountSettings.js';
import { StorageSettings } from './StorageSettings.js';

export function SettingsPage({ navigation, session, location, navigate, registerGuard, onExpired, onPasswordChanged, onChanged, onBack }: {
  navigation: ReactNode; session: SessionResponse; location: Location; navigate(next: Location, replace?: boolean): boolean; registerGuard: RegisterNavigationGuard;
  onExpired(): void; onPasswordChanged(): void; onChanged(): void; onBack(): void;
}) {
  const administrator = session.user.role === 'admin', section = location.section ?? 'personal';
  const denied = !administrator && section !== 'personal';
  const preferences = useResource('/api/settings', PreferencesSchema, onExpired, true);
  const admin = useResource(administrator && section !== 'personal' ? '/api/admin' : null, AdminSnapshotSchema, onExpired, true);
  const [busy, setBusy] = useState(false), busyRef = useRef(false), [error, setError] = useState<string>(), [notice, setNotice] = useState<string>(), [dirty, setDirty] = useState<Record<string, boolean>>({});
  const unsaved = Object.values(dirty).some(Boolean);
  const onDirty = useCallback((key: string, value: boolean) => { setDirty(prior => prior[key] === value ? prior : { ...prior, [key]: value }); }, []);
  useLayoutEffect(() => { setDirty({}); setError(undefined); setNotice(undefined); }, [section]);
  useLayoutEffect(() => registerGuard(() => {
    if (busyRef.current) { setNotice('正在儲存，完成後才能離開。'); return false; }
    return !unsaved || window.confirm('仍有未儲存的輸入，確定捨棄並離開？');
  }), [registerGuard, unsaved]);
  useEffect(() => {
    if (!unsaved && !busy) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', unload); return () => window.removeEventListener('beforeunload', unload);
  }, [unsaved, busy]);
  const save = async (url: string, schema: TSchema, body: unknown, options?: { refresh?: boolean }) => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(undefined); setNotice(undefined);
    try {
      await api(url, schema, { method: 'POST', csrf: session.csrfToken, ...(body === undefined ? {} : { body }) });
      setNotice('設定已儲存。');
      if (options?.refresh !== false) { preferences.reload(); admin.reload(); onChanged(); }
      return true;
    } catch (reason) {
      if (reason instanceof ApiClientError && reason.status === 401) onExpired();
      else setError(reason instanceof ApiClientError && reason.code === 'FORBIDDEN' && url === '/api/settings/password' ? '目前密碼不正確，請重新輸入。' : reason instanceof ApiClientError && reason.code === 'CONFLICT' ? '名稱重複、資料狀態已變更，或此操作會移除最後一位管理員。請重新整理後確認。' : errorText(reason));
      return false;
    } finally { busyRef.current = false; setBusy(false); }
  };
  return <section className="settings-page" aria-label="設定頁面">
<header className="management-heading"><h1>設定</h1><p>{administrator?'管理個人偏好、帳號與儲存授權。':'管理檔案偏好與登入密碼。'}</p></header>
    <div className="management-topline">{navigation}<div className="management-buttons"><Button type="text" aria-label="返回檔案" title="返回檔案" onClick={onBack}><ToolIcon name="back"/></Button><Button type="text" aria-label="重新整理設定" title="重新整理設定" disabled={busy} loading={preferences.loading||admin.loading} onClick={()=>{preferences.reload();admin.reload();setError(undefined);}}><ToolIcon name="refresh"/></Button></div></div>
    {denied ? <Alert type="warning" showIcon title="沒有權限開啟這個設定分類" action={<Button onClick={() => navigate({ ...location, section: 'personal' })}>前往個人設定</Button>}/> : <>
      {Boolean(error || preferences.error || admin.error) && <Alert type="error" showIcon title={error ?? errorText(preferences.error ?? admin.error)}/>}
      {notice && <Alert type="info" showIcon title={notice}/>}
      <div className="settings-actions settings-save-status">{unsaved && <span role="status">有尚未儲存的變更</span>}{busy && <span role="status"><Spin size="small"/> 正在儲存</span>}</div>
      <fieldset disabled={busy} aria-busy={busy} className={`settings-fieldset settings-section-${section}`} key={section}>
        {section === 'personal' && preferences.value && <PersonalSettings value={preferences.value} save={save} onDirty={onDirty} onPasswordChanged={onPasswordChanged}/>}
        {section === 'accounts' && admin.value && <AccountSettings users={admin.value.users} save={save} onDirty={onDirty}/>}
        {section === 'storage' && admin.value && <StorageSettings value={admin.value} save={save} onDirty={onDirty}/>}
      </fieldset>
    </>}
  </section>;
}
