import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Schema revision 與 migration 數量一致；功能 tables 按主計畫新增。
export const SCHEMA_REVISION = 13;
export const schemaState = sqliteTable('schema_state', {
  id: integer('id').primaryKey(),
  revision: integer('revision').notNull(),
}, (table) => [check('schema_state_singleton', sql`${table.id} = 1`)]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(), passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
}, (table) => [check('users_role', sql`${table.role} IN ('admin', 'member')`)]);
export const preferences=sqliteTable('preferences',{
  userId:text('user_id').primaryKey().references(()=>users.id,{onDelete:'cascade'}),defaultView:text('default_view',{enum:['list','mosaic','thumbnails']}).notNull().default('list'),pageSize:integer('page_size').notNull().default(50),
},table=>[check('preferences_view',sql`${table.defaultView} IN ('list','mosaic','thumbnails')`),check('preferences_page_size',sql`${table.pageSize} IN (25,50,100)`)]);
export const entryCandidates=sqliteTable('entry_candidates',{
  id:text('id').primaryKey(),label:text('label').notNull(),kind:text('kind',{enum:['managed','external']}).notNull(),rootPath:text('root_path').notNull().unique(),rootIdentity:text('root_identity').notNull(),
},table=>[check('entry_candidates_kind',sql`${table.kind} IN ('managed','external')`)]);
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
}, (table) => [index('sessions_user').on(table.userId), index('sessions_expiry').on(table.expiresAt)]);
export const loginThrottle = sqliteTable('login_throttle', {
  key: text('key').primaryKey(), windowStart: integer('window_start').notNull(), attempts: integer('attempts').notNull(),
});

export const shares = sqliteTable('shares', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id,{onDelete:'restrict'}),entryId:text('entry_id').notNull().references(()=>entries.id,{onDelete:'restrict'}),
  path:text('path').notNull(),name:text('name').notNull(),kind:text('kind',{enum:['file','directory']}).notNull(),device:text('device').notNull(),inode:text('inode').notNull(),birthtimeNs:text('birthtime_ns').notNull(),
  secretHash:text('secret_hash').notNull(),passwordHash:text('password_hash'),requestHash:text('request_hash').notNull(),revoked:integer('revoked',{mode:'boolean'}).notNull().default(false),createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('shares_user').on(table.userId,table.createdAt),check('shares_kind',sql`${table.kind} IN ('file','directory')`)]);
export const shareSessions=sqliteTable('share_sessions',{
  tokenHash:text('token_hash').primaryKey(),shareId:text('share_id').notNull().references(()=>shares.id,{onDelete:'cascade'}),expiresAt:integer('expires_at').notNull(),
},table=>[index('share_sessions_share').on(table.shareId),index('share_sessions_expiry').on(table.expiresAt)]);
export const shareThrottle=sqliteTable('share_throttle',{key:text('key').primaryKey(),windowStart:integer('window_start').notNull(),attempts:integer('attempts').notNull()});

export const entries = sqliteTable('entries', {
  id: text('id').primaryKey(), label: text('label').notNull(), kind: text('kind', { enum: ['managed', 'external'] }).notNull(),
  rootPath: text('root_path').notNull().unique(), rootDevice: text('root_device').notNull(), rootInode: text('root_inode').notNull(),
  rootAncestors: text('root_ancestors').notNull(), writable: integer('writable', { mode: 'boolean' }).notNull().default(false), controlIdentity: text('control_identity'), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
}, (table) => [check('entries_kind', sql`${table.kind} IN ('managed', 'external')`)]);
export const grants = sqliteTable('grants', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'cascade' }),
  scope: text('scope').notNull(), canWrite: integer('can_write', { mode: 'boolean' }).notNull().default(false), canDownload: integer('can_download', { mode: 'boolean' }).notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.entryId, table.scope] })]);

export const writeIntents = sqliteTable('write_intents', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['mkdir', 'rename', 'trash', 'restore'] }).notNull(),
  status: text('status', { enum: ['prepared', 'applying', 'succeeded', 'failed', 'needs_review'] }).notNull(),
  owner: text('owner').notNull(), generation: integer('generation').notNull(),
  resources: text('resources').notNull(), payload: text('payload').notNull(), evidence: text('evidence').notNull().default('{}'),
  errorCode: text('error_code'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, (table) => [index('write_intents_status').on(table.status), index('write_intents_user').on(table.userId),
  check('write_intents_state', sql`${table.status} IN ('prepared','applying','succeeded','failed','needs_review')`),
  check('write_intents_kind', sql`${table.kind} IN ('mkdir','rename','trash','restore')`)]);

export const trashItems = sqliteTable('trash_items', {
  id: text('id').primaryKey(), entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'restrict' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  originalPath: text('original_path').notNull(), kind: text('kind', { enum: ['file', 'directory'] }).notNull(), witness: text('witness').notNull(),
  status: text('status', { enum: ['prepared', 'available', 'restoring', 'restored', 'failed', 'needs_review'] }).notNull(),
  mutationId: text('mutation_id').notNull().references(() => writeIntents.id), restoreMutationId: text('restore_mutation_id').references(() => writeIntents.id),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, (table) => [index('trash_items_entry').on(table.entryId), index('trash_items_user').on(table.userId),
  check('trash_items_state', sql`${table.status} IN ('prepared','available','restoring','restored','failed','needs_review')`),
  check('trash_items_kind', sql`${table.kind} IN ('file','directory')`)]);

export const uploadSessions = sqliteTable('upload_sessions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'restrict' }),
  parent: text('parent').notNull(), name: text('name').notNull(), size: integer('size').notNull(), offset: integer('offset').notNull().default(0),
  expectedSha256: text('expected_sha256'), sha256: text('sha256'),
  state: text('state', { enum: ['open', 'writing', 'finalizing', 'completed', 'cancelled', 'expired', 'needs_review'] }).notNull().default('open'),
  owner: text('owner'), generation: integer('generation').notNull().default(1),
  stagingIdentity: text('staging_identity'), payloadIdentity: text('payload_identity'),
  publicationId: text('publication_id').references(() => writeIntents.id),
  reservedBytes: integer('reserved_bytes').notNull(), cleaned: integer('cleaned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, (table) => [index('uploads_owner').on(table.userId, table.entryId), index('uploads_cleanup').on(table.state, table.expiresAt),
  check('uploads_state', sql`${table.state} IN ('open','writing','finalizing','completed','cancelled','expired','needs_review')`),
  check('uploads_size', sql`${table.size} BETWEEN 0 AND 1073741824 AND ${table.offset} BETWEEN 0 AND ${table.size} AND ${table.reservedBytes} BETWEEN 0 AND ${table.size}`)]);
export const uploadChunks = sqliteTable('upload_chunks', {
  uploadId: text('upload_id').notNull().references(() => uploadSessions.id, { onDelete: 'cascade' }),
  offset: integer('offset').notNull(), length: integer('length').notNull(), sha256: text('sha256').notNull(),
}, (table) => [primaryKey({ columns: [table.uploadId, table.offset] }), check('upload_chunks_bounds', sql`${table.offset} >= 0 AND ${table.length} BETWEEN 1 AND 4194304`)]);
export const operations = sqliteTable('operations', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['copy', 'move', 'archive'] }).notNull(),
  state: text('state', { enum: ['queued','running','cancelling','succeeded','partial','failed','cancelled','interrupted','needs_review'] }).notNull(),
  request: text('request').notNull(), resources: text('resources').notNull(),
  owner: text('owner'), attempt: integer('attempt').notNull().default(0), leaseUntil: integer('lease_until'),
  cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, (table) => [index('operations_user').on(table.userId, table.createdAt), index('operations_queue').on(table.state, table.createdAt),
  check('operations_kind', sql`${table.kind} IN ('copy','move','archive')`),
  check('operations_state', sql`${table.state} IN ('queued','running','cancelling','succeeded','partial','failed','cancelled','interrupted','needs_review')`),
  check('operations_attempt', sql`${table.attempt} >= 0`)]);
export const operationItems = sqliteTable('operation_items', {
  operationId: text('operation_id').notNull().references(() => operations.id, { onDelete: 'restrict' }),
  index: integer('item_index').notNull(), entryId: text('entry_id').notNull().references(() => entries.id, { onDelete: 'restrict' }), path: text('path').notNull(),
  state: text('state', { enum: ['pending','running','succeeded','failed','cancelled','needs_review'] }).notNull().default('pending'),
  bytesDone: integer('bytes_done').notNull().default(0), bytesTotal: integer('bytes_total').notNull().default(0),
  evidence: text('evidence').notNull().default('{}'), errorCode: text('error_code'), updatedAt: integer('updated_at').notNull(),
}, (table) => [primaryKey({ columns: [table.operationId, table.index] }),
  check('operation_items_index', sql`${table.index} BETWEEN 0 AND 15`),
  check('operation_items_state', sql`${table.state} IN ('pending','running','succeeded','failed','cancelled','needs_review')`),
  check('operation_items_bytes', sql`${table.bytesDone} BETWEEN 0 AND ${table.bytesTotal} AND ${table.bytesTotal} BETWEEN 0 AND 2147483648`)]);

export const operationNodes = sqliteTable('operation_nodes', {
  operationId: text('operation_id').notNull().references(() => operations.id, { onDelete: 'restrict' }), item: integer('item_index').notNull(),
  path: text('relative_path').notNull(), kind: text('kind', { enum: ['file','directory'] }).notNull(), sourceWitness: text('source_witness').notNull(),
  bytes: integer('bytes').notNull(), sha256: text('sha256'), destinationWitness: text('destination_witness'),
}, (table) => [primaryKey({columns:[table.operationId,table.item,table.path]}), check('operation_nodes_bytes',sql`${table.bytes} BETWEEN 0 AND 1073741824`),check('operation_nodes_kind',sql`${table.kind} IN ('file','directory')`)]);

export const operationArtifacts=sqliteTable('operation_artifacts',{
  operationId:text('operation_id').primaryKey().references(()=>operations.id,{onDelete:'restrict'}),owner:text('owner').notNull(),
  state:text('state',{enum:['building','available','failed','cancelled','expired','needs_review']}).notNull(),witness:text('witness'),sha256:text('sha256'),
  bytes:integer('bytes').notNull().default(0),reservedBytes:integer('reserved_bytes').notNull(),cleaned:integer('cleaned',{mode:'boolean'}).notNull().default(false),
  createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),
},table=>[index('operation_artifact_expiry').on(table.state,table.expiresAt),check('operation_artifact_bytes',sql`${table.bytes} BETWEEN 0 AND 2155872256 AND ${table.reservedBytes} BETWEEN 0 AND 2155872256`),check('operation_artifact_state',sql`${table.state} IN ('building','available','failed','cancelled','expired','needs_review')`)]);
