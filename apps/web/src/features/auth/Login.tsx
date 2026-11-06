import { useState, type FormEvent } from 'react';
import { Alert, Button, Input } from 'antd';
import { SessionResponseSchema, type SessionResponse } from '@filehub/contracts';
import { api, errorText } from '../../lib/client.js';
import { appHref } from '../../lib/paths.js';
import { BrandMark } from '../../app/BrandMark.js';

export function Login({ onLogin, notice }: { onLogin(session: SessionResponse): void; notice?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(undefined);
    void api('/api/session', SessionResponseSchema, { method: 'POST', body: { username, password } }).then(onLogin, (reason: unknown) => { setError(errorText(reason)); }).finally(() => { setPassword(''); setPending(false); });
  };
  return <main id="main" className="login-page">
    <section className="login-panel" aria-labelledby="login-title">
      <a className="login-brand workspace-brand" href={appHref('/')} aria-label="FileHub 首頁"><BrandMark/></a>
      <h1 id="login-title">登入 FileHub</h1><p className="login-caption">使用管理員建立的帳號登入。</p>
      {notice && <Alert type="info" title={notice} showIcon/>}
      {error && <Alert type="error" title={error} showIcon/>}
      <form onSubmit={submit}>
        <label htmlFor="username">帳號</label><Input id="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" value={username} onChange={(event) => { setUsername(event.target.value); }} disabled={pending}/>
        <label htmlFor="password">密碼</label><Input.Password id="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); }} disabled={pending}/>
        <Button type="primary" htmlType="submit" aria-label="登入" aria-busy={pending} loading={pending} disabled={pending} block>登入</Button>
      </form>
      <p className="login-help">需要協助時，請聯絡管理員。</p>
    </section>
    <footer className="login-footer"><a href={appHref('/?view=status')}>服務狀態</a><span>FileHub {__FILEHUB_VERSION__}</span></footer>
  </main>;
}
