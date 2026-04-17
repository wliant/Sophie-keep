import type { ErrorEnvelope } from '@sophie/shared';

export class ApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly fields?: Record<string, string[]>;
  public readonly request_id?: string;
  public readonly extra?: Record<string, unknown>;
  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
    request_id?: string,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.request_id = request_id;
    this.extra = extra;
  }
}

type FetchOptions = RequestInit & { query?: Record<string, unknown> };

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.pathname + url.search;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorEnvelope | undefined;
  try {
    body = (await res.json()) as ErrorEnvelope;
  } catch {
    // ignore
  }
  const err = body?.error;
  return new ApiError(
    res.status,
    err?.code ?? 'INTERNAL_ERROR',
    err?.message ?? `HTTP ${res.status}`,
    err?.fields,
    err?.request_id,
    body as unknown as Record<string, unknown>,
  );
}

export const api = {
  async request<T = unknown>(method: string, path: string, opts: FetchOptions = {}): Promise<T> {
    const url = buildUrl(path, opts.query);
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(opts.headers as Record<string, string> | undefined),
    };
    let body = opts.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const res = await fetch(url, { method, body, headers });
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  },
  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>('GET', path, { query });
  },
  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body: body as BodyInit });
  },
  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body: body as BodyInit });
  },
  del<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  },
  async upload<T = unknown>(path: string, form: FormData): Promise<T> {
    const res = await fetch(path, { method: 'POST', body: form });
    if (!res.ok) throw await parseError(res);
    return (await res.json()) as T;
  },
};
