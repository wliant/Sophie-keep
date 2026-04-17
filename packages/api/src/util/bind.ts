export function isPrivateAddress(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === '0.0.0.0' || a === '::' || a === '127.0.0.1' || a === '::1' || a === 'localhost') {
    return a !== '0.0.0.0' && a !== '::';
  }
  const m4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
  if (m4) {
    const o = m4.slice(1, 5).map((n) => parseInt(n, 10));
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 172 && o[1]! >= 16 && o[1]! <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    return false;
  }
  if (a.startsWith('fc') || a.startsWith('fd')) return true;
  if (a.startsWith('fe80')) return true;
  return false;
}

export function isBindRoutable(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === '0.0.0.0' || a === '::') return true;
  return !isPrivateAddress(a);
}
