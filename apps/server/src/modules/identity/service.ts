import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import type { PublicUser, SessionResponse } from '@filehub/contracts';
import type { FileHubDatabase } from '../../persistence/database.js';
import { users, sessions, loginThrottle } from '../../persistence/schema.js';
import { PublicError } from '../../plugins/errors.js';
import { hashPassword, verifyPassword } from './password.js';

const lifetime = 12 * 60 * 60_000;
const windowMs = 15 * 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const csrf = (token: string) => createHmac('sha256', token).update('filehub-csrf-v1').digest('hex');
const publicUser = (user: typeof users.$inferSelect): PublicUser => ({ id: user.id, username: user.username, role: user.role });
export interface SessionIdentity { readonly tokenHash: string; readonly user: PublicUser; readonly expiresAt: number; readonly csrfToken: string }

export function normalizeUsername(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/.test(value)) throw new PublicError('BAD_REQUEST');
  return value.toLowerCase();
}

export class IdentityService {
  constructor(readonly database: FileHubDatabase, private readonly now: () => number = Date.now) {}
  private assertReady(): void { if (!this.database.isReady()) throw new PublicError('SERVICE_UNAVAILABLE'); }

  async bootstrap(username: string, password: string): Promise<PublicUser> {
    return this.create(username, password, true);
  }
  async createUser(username: string, password: string, role:'admin'|'member'='member', reauthorize=()=>{}): Promise<PublicUser> {
    if(!['admin','member'].includes(role))throw new PublicError('BAD_REQUEST');
    return this.create(username, password, false, role, reauthorize);
  }
  private async create(name: string, password: string, bootstrap: boolean, role:'admin'|'member'='member',reauthorize=()=>{}): Promise<PublicUser> {
    this.assertReady();
    const username = normalizeUsername(name);
    const passwordHash = await hashPassword(password);
    return this.database.sqlite.transaction(() => {
      this.assertReady();reauthorize();
      const existing = this.database.db.select().from(users).limit(101).all();
      if(existing.length>=100)throw new PublicError('RESOURCE_LIMIT');
      if ((bootstrap && existing.length !== 0) || existing.some((user) => user.username === username)) throw new PublicError('CONFLICT');
      if (!bootstrap && !existing.some((user) => user.role === 'admin' && user.enabled)) throw new PublicError('CONFLICT');
      const user = { id: randomUUID(), username, passwordHash, role: bootstrap ? 'admin' as const : role, enabled: true, createdAt: this.now() };
      this.database.db.insert(users).values(user).run();
      return publicUser(user);
    }).immediate();
  }

  updateUser(id:string,enabled:boolean|undefined,role:'admin'|'member'|undefined,reauthorize=()=>{}):void{
    this.assertReady();if((enabled===undefined&&role===undefined)||(enabled!==undefined&&typeof enabled!=='boolean')||(role!==undefined&&!['admin','member'].includes(role)))throw new PublicError('BAD_REQUEST');
    this.database.sqlite.transaction(()=>{reauthorize();const user=this.database.db.select().from(users).where(eq(users.id,id)).get();if(!user)throw new PublicError('NOT_FOUND');
      const nextEnabled=enabled??user.enabled,nextRole=role??user.role;
      if(user.enabled&&user.role==='admin'&&(!nextEnabled||nextRole!=='admin')&&this.database.db.select().from(users).where(and(eq(users.role,'admin'),eq(users.enabled,true))).all().length<=1)throw new PublicError('CONFLICT');
      if(user.enabled!==nextEnabled||user.role!==nextRole){this.database.db.update(users).set({enabled:nextEnabled,role:nextRole}).where(eq(users.id,id)).run();this.database.db.delete(sessions).where(eq(sessions.userId,id)).run();}
    }).immediate();
  }
  async disableUser(name:string):Promise<void>{this.assertReady();const user=this.database.db.select().from(users).where(eq(users.username,normalizeUsername(name))).get();if(!user)throw new PublicError('NOT_FOUND');this.updateUser(user.id,false,undefined);}

  async changePassword(name: string, password: string, reauthorize=()=>{}): Promise<void> {
    this.assertReady();
    const username = normalizeUsername(name);
    const passwordHash = await hashPassword(password);
    this.database.sqlite.transaction(() => {
      this.assertReady();reauthorize();
      const user = this.database.db.select().from(users).where(eq(users.username, username)).get();
      if (!user) throw new PublicError('NOT_FOUND');
      this.database.db.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
      this.database.db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    }).immediate();
  }

  async changeOwnPassword(id:string,currentPassword:string,password:string,ip:string,reauthorize=()=>{}):Promise<void>{
    this.assertReady();const user=this.database.db.select().from(users).where(eq(users.id,id)).get();if(!user?.enabled)throw new PublicError('UNAUTHORIZED');this.reserve(`password:${user.username}`,ip);
    if(!await verifyPassword(currentPassword,user.passwordHash))throw new PublicError('FORBIDDEN');reauthorize();
    await this.changePassword(user.username,password,()=>{reauthorize();const current=this.database.db.select().from(users).where(eq(users.id,id)).get();if(!current?.enabled||current.passwordHash!==user.passwordHash)throw new PublicError('UNAUTHORIZED');});
  }

  private reserve(username: string, ip: string): void {
    this.assertReady();
    const now = this.now();
    this.database.sqlite.transaction(() => {
      this.database.db.delete(loginThrottle).where(lte(loginThrottle.windowStart, now - windowMs)).run();
      const accountKey = digest(`account:${username}`);
      const ipKey = digest(`ip:${ip}`);
      for (const [key, maximum] of [[accountKey, 5], [ipKey, 30]] as const) {
        const prior = this.database.db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).get();
        if (prior && prior.attempts >= maximum) throw new PublicError('RATE_LIMITED');
      }
      if ((this.database.sqlite.prepare<[], { n: number }>('SELECT count(*) AS n FROM login_throttle').get()?.n ?? 10_001) > 10_000) throw new PublicError('RATE_LIMITED');
      for (const key of [accountKey, ipKey]) {
        const prior = this.database.db.select().from(loginThrottle).where(eq(loginThrottle.key, key)).get();
        this.database.db.insert(loginThrottle).values({ key, windowStart: now, attempts: 1 }).onConflictDoUpdate({ target: loginThrottle.key, set: { attempts: (prior?.attempts ?? 0) + 1 } }).run();
      }
    }).immediate();
  }

  async login(name: string, password: string, ip: string, previousToken?: string): Promise<{ token: string; session: SessionResponse }> {
    const username = normalizeUsername(name);
    this.reserve(username, ip);
    const user = this.database.db.select().from(users).where(eq(users.username, username)).get();
    const valid = await verifyPassword(password, user?.passwordHash);
    return this.database.sqlite.transaction(() => {
      this.assertReady();
      const current = user ? this.database.db.select().from(users).where(eq(users.id, user.id)).get() : undefined;
      if (!valid || !current?.enabled || current.passwordHash !== user?.passwordHash) throw new PublicError('UNAUTHORIZED');
      this.database.db.delete(loginThrottle).where(eq(loginThrottle.key, digest(`account:${username}`))).run();
      this.database.db.delete(sessions).where(lte(sessions.expiresAt, this.now())).run();
      if (previousToken && /^[a-f0-9]{64}$/.test(previousToken)) this.database.db.delete(sessions).where(eq(sessions.tokenHash, digest(previousToken))).run();
      // 有界保存：每帳號最多 10 個有效 session，達上限拒絕；不踢掉未知的另一台裝置。
      if (this.database.db.select().from(sessions).where(eq(sessions.userId, current.id)).all().length >= 10) throw new PublicError('RATE_LIMITED');
      const token = randomBytes(32).toString('hex');
      const expiresAt = this.now() + lifetime;
      this.database.db.insert(sessions).values({ tokenHash: digest(token), userId: current.id, expiresAt }).run();
      return { token, session: { user: publicUser(current), csrfToken: csrf(token), expiresAt: new Date(expiresAt).toISOString() } };
    }).immediate();
  }

  authenticate(token: string | undefined): SessionIdentity {
    this.assertReady();
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new PublicError('UNAUTHORIZED');
    const row = this.database.db.select().from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(eq(sessions.tokenHash, digest(token))).get();
    if (!row || !row.users.enabled || row.sessions.expiresAt <= this.now()) throw new PublicError('UNAUTHORIZED');
    return { tokenHash: row.sessions.tokenHash, user: publicUser(row.users), expiresAt: row.sessions.expiresAt, csrfToken: csrf(token) };
  }

  logout(identity: SessionIdentity): void {
    this.database.db.delete(sessions).where(eq(sessions.tokenHash, identity.tokenHash)).run();
  }
}
