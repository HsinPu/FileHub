import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { Type } from 'typebox';
import { SessionResponseSchema, type SessionResponse } from '@filehub/contracts';
import { ApiClientError } from '../lib/api.js';
import { api, errorText } from '../lib/client.js';
import { Login } from '../features/auth/Login.js';
const Workspace = lazy(async () => ({ default: (await import('../features/files/Workspace.js')).Workspace }));
const SystemOverview = lazy(async () => ({ default: (await import('./SystemOverview.js')).SystemOverview }));

const PublicShare = lazy(async () => ({ default: (await import('../features/shares/PublicShare.js')).PublicShare }));
export function App() {
  const share = new URLSearchParams(window.location.search).get('share');
  return <Suspense fallback={<main className="files-feedback" role="status"><Spin size="small"/><span>正在載入工作空間，請稍候。</span></main>}>{share ? <PublicShare id={share}/> : new URLSearchParams(window.location.search).get('view') === 'status' ? <SystemOverview/> : <SessionApp/>}</Suspense>;
}
function SessionApp() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api('/api/session', SessionResponseSchema, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) { setSession(value); setPhase('ready'); }
    }, (reason: unknown) => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiClientError && reason.status === 401) setPhase('ready');
      else { setError(errorText(reason)); setPhase('error'); }
    });
    return () => { controller.abort(); };
  }, [revision]);
  const expired = useCallback((message?:string) => { setSession(null); setPhase('ready'); setNotice(message??'登入已到期，請重新登入。'); setError(undefined); }, []);
  const logout = () => {
    if (!session || loggingOut) return;
    setLoggingOut(true); setError(undefined);
    void api('/api/session', Type.Null(), { method: 'DELETE', csrf: session.csrfToken }).then(() => { setSession(null); setNotice('已登出。'); }, (reason: unknown) => {
      if (reason instanceof ApiClientError && reason.status === 401) expired();
      else setError(`登出未完成。${errorText(reason)}`);
    }).finally(() => { setLoggingOut(false); });
  };
  if (phase === 'loading') return <main className="files-feedback" role="status"><Spin size="small"/><span>正在確認登入狀態，請稍候。</span></main>;
  if (phase === 'error') return <main><Alert type="error" title={error} action={<Button onClick={() => { setPhase('loading'); setRevision((value) => value + 1); }}>重試</Button>}/></main>;
  if (!session) return <Login onLogin={(value) => { setSession(value); setNotice(undefined); setError(undefined); }} {...(notice ? { notice } : {})}/>;
  return <Workspace key={session.user.id} session={session} onExpired={expired} onLogout={logout} loggingOut={loggingOut} {...(error ? { logoutError: error } : {})}/>;
}
