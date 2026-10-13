/** REST 호출 래퍼 — 서버의 한국어 오류 메시지를 그대로 Error로 던진다 */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없어요. 네트워크를 확인해 주세요.');
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/login')) onUnauthorized?.();
    const msg = (data as { error?: string } | null)?.error ?? (res.status >= 500 ? '서버에서 문제가 생겼어요.' : '요청을 처리하지 못했어요.');
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** 진행률 콜백이 있는 파일 업로드 (fetch는 업로드 진행률을 알 수 없어 XHR 사용) */
export function uploadFile<T>(url: string, file: Blob, filename: string, onProgress?: (ratio: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        if (xhr.status === 401) onUnauthorized?.();
        reject(new ApiError(xhr.status, (data as { error?: string } | null)?.error ?? '업로드에 실패했어요.'));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, '업로드 중 연결이 끊겼어요.'));
    xhr.onabort = () => reject(new ApiError(0, '업로드를 취소했어요.'));
    signal?.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', file, filename);
    xhr.send(form);
  });
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : '알 수 없는 오류가 발생했어요.');
