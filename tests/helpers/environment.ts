export function childEnvironment(overrides: NodeJS.ProcessEnv = {}, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(Object.entries(source).filter(([key]) =>
    !key.toUpperCase().startsWith('FILEHUB_') && !['NODE_OPTIONS', 'NODE_COMPILE_CACHE', 'FORCE_COLOR', 'NO_COLOR'].includes(key.toUpperCase())));
  return { ...inherited, FORCE_COLOR: '0', ...overrides };
}
