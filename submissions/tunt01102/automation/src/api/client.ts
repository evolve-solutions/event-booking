// Thin typed client over every endpoint in the published OpenAPI document (/docs/json).
// It keeps its own cookie jar so each instance is one independent buyer.

import { config } from '../config';

export const BASE_URL = config.baseUrl;

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
  text: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One request/response pair, as written to evidence logs. Cookies and tokens are never recorded. */
export interface Exchange {
  at: string;
  method: string;
  path: string;
  requestBody?: unknown;
  status: number;
  responseBody: unknown;
}

export class ApiClient {
  private cookies = new Map<string, string>();
  readonly log: Exchange[] = [];

  constructor(
    readonly baseUrl: string = BASE_URL,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  get cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  /** Raw session token, used by E2E tests to hand an API login to a browser context. */
  get sessionToken(): string | undefined {
    return this.cookies.get('token');
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  clearCookies(): void {
    this.cookies.clear();
  }

  private storeCookies(headers: Headers): void {
    const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === '' || /max-age=0/i.test(line) || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request<T = any>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookies.size) headers.cookie = this.cookieHeader;
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    this.storeCookies(res.headers);
    const text = await res.text();
    let parsed: any = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // non-JSON bodies (robots.txt, CSV) stay as text
    }
    this.log.push({ at: new Date().toISOString(), method, path, requestBody: redact(body), status: res.status, responseBody: redact(parsed) });
    return { status: res.status, body: parsed as T, headers: res.headers, text };
  }

  // Meta
  health = () => this.request('GET', '/api/health');
  config = () => this.request('GET', '/api/config');
  robots = () => this.request('GET', '/robots.txt');
  openapi = () => this.request('GET', '/docs/json');

  // Auth
  register = (body: { email: string; password: string; phone?: string }) => this.request('POST', '/api/auth/register', body);
  login = (email: string, password: string) => this.request('POST', '/api/auth/login', { email, password });
  logout = () => this.request('POST', '/api/auth/logout');
  me = () => this.request('GET', '/api/auth/me');

  // Events
  listEvents = (query: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
    return this.request('GET', `/api/events${qs ? `?${qs}` : ''}`);
  };
  getEvent = (id: number) => this.request('GET', `/api/events/${id}`);
  createEvent = (body: unknown) => this.request('POST', '/api/events', body);
  updateEvent = (id: number, body: unknown) => this.request('PUT', `/api/events/${id}`, body);
  deleteEvent = (id: number) => this.request('DELETE', `/api/events/${id}`);
  updateTicketType = (id: number, body: unknown) => this.request('PATCH', `/api/ticket-types/${id}`, body);

  // Cart
  cart = () => this.request('GET', '/api/cart');
  addToCart = (ticketTypeId: number, quantity: unknown) => this.request('POST', '/api/cart/items', { ticketTypeId, quantity });
  updateCartItem = (id: number, quantity: unknown) => this.request('PATCH', `/api/cart/items/${id}`, { quantity });
  applyDiscount = (code: string) => this.request('POST', '/api/cart/discount', { code });

  // Orders
  checkout = (body: { recipientName: string; phone: string; studentCardNo?: string }) => this.request('POST', '/api/orders', body);
  orders = () => this.request('GET', '/api/orders');
  order = (id: number) => this.request('GET', `/api/orders/${id}`);
  cancelOrder = (id: number) => this.request('POST', `/api/orders/${id}/cancel`);

  // Profile
  profile = () => this.request('GET', '/api/profile');
  updateProfile = (body: { phone: string }) => this.request('PATCH', '/api/profile', body);
  changePassword = (currentPassword: string, newPassword: string) =>
    this.request('POST', '/api/profile/password', { currentPassword, newPassword });

  // Administration
  adminOrders = (query: Record<string, string> = {}) =>
    this.request('GET', `/api/admin/orders${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`);
  adminOrdersCsv = (query: Record<string, string> = {}) =>
    this.request('GET', `/api/admin/orders.csv${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ''}`);
  adminDeleteOrder = (id: number) => this.request('DELETE', `/api/admin/orders/${id}`);
}

/** Strips anything token-shaped before a body reaches an evidence log. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<redacted-jwt>');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, /token|password|cookie/i.test(k) ? '<redacted>' : redact(v)]),
    );
  }
  return value;
}
