export function te(key: string, params?: any, error?: any): Error {
  const e = new Error(`${key} ${params ? JSON.stringify(params) : ''}${error ? ' <- ' + (error.message ?? error) : ''}`);
  return e;
}
