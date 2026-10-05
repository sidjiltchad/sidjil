import { getRuntime } from './environment.js';
import { resolveAppUrl } from './api-base.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let csrf = '';

export class ApiError extends Error {
  constructor(message, { code = 'API_ERROR', status = 0, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function setCsrfToken(token) {
  csrf = String(token || '');
}

export function getCsrfToken() {
  return csrf;
}

function timeoutSignal(timeoutMs, suppliedSignal) {
  if (suppliedSignal || !timeoutMs || typeof AbortController === 'undefined') {
    return { signal: suppliedSignal, cancel() {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel() { clearTimeout(timer); } };
}

async function readResponse(response) {
  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html') || response.redirected;
  const raw = await response.text();
  if (isHtml || /^\s*<!doctype html/i.test(raw) || /^\s*<html[\s>]/i.test(raw)) {
    throw new ApiError('انتهت جلسة الباحث. سجّل الدخول من جديد.', { code: 'SESSION_REDIRECT', status: response.status || 200 });
  }
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { throw new ApiError('استجابة غير صالحة من الخادم.', { code: 'INVALID_JSON', status: response.status }); }
  }
  return data;
}

export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const { timeoutMs: _ignored, csrf: csrfEnabled = true, headers: inputHeaders, body, signal, ...fetchOptions } = options;
  const headers = new Headers(inputHeaders || {});
  headers.set('Accept', headers.get('Accept') || 'application/json');
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && body !== null && !isForm && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (MUTATING_METHODS.has(method) && csrfEnabled && csrf) headers.set('X-CSRF-Token', csrf);
  const requestBody = body !== undefined && body !== null && !isForm && typeof body !== 'string' ? JSON.stringify(body) : body;
  const timed = timeoutSignal(timeoutMs, signal);
  const credentials = getRuntime() === 'capacitor' ? 'include' : 'same-origin';
  let response;
  try {
    response = await fetch(resolveAppUrl(path), {
      ...fetchOptions,
      method,
      headers,
      body: requestBody,
      credentials,
      signal: timed.signal,
    });
  } catch (error) {
    timed.cancel();
    if (error?.name === 'AbortError') {
      if (signal?.aborted) throw new ApiError('أُلغي الطلب السابق.', { code: 'ABORTED' });
      throw new ApiError('انتهت مهلة الاتصال بالخادم.', { code: 'TIMEOUT' });
    }
    throw new ApiError('تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.', { code: 'NETWORK_ERROR' });
  }
  timed.cancel();
  let data;
  try { data = await readResponse(response); } catch (error) { throw error; }
  if (response.status === 401) throw new ApiError(data?.error || 'انتهت جلسة الباحث. سجّل الدخول من جديد.', { code: 'AUTH_REQUIRED', status: 401, details: data });
  if (response.status === 403) throw new ApiError(data?.error || 'ليس لديك صلاحية لتنفيذ هذه العملية.', { code: 'FORBIDDEN', status: 403, details: data });
  if (!response.ok) throw new ApiError(data?.error || `تعذر تنفيذ الطلب (${response.status}).`, { code: 'HTTP_ERROR', status: response.status, details: data });
  return data;
}

