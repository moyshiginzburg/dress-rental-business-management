/**
 * API Client Module
 * 
 * Purpose: Provides a centralized API client for making requests to the backend.
 * Handles authentication tokens and error responses.
 */

// Use environment variable for API base URL, default to /api for same-origin requests
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on initialization
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('auth_token', token);
      } else {
        localStorage.removeItem('auth_token');
      }
    }
  }

  getToken() {
    return this.token;
  }

  isAuthenticated() {
    return !!this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const isFormData = options.body instanceof FormData;

    const headers: HeadersInit = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle 401 - unauthorized
        if (response.status === 401) {
          this.setToken(null);
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
        throw new Error(data.message || 'שגיאה בבקשה');
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('שגיאת רשת');
    }
  }

  // GET request
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  // POST request
  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    // Debug logging for order creation
    if (endpoint.includes('/orders')) {
      console.log('=== API POST /orders ===');
      console.log('Endpoint:', endpoint);
      console.log('Body before stringify:', body);
      console.log('Body stringified:', body instanceof FormData ? 'FormData' : JSON.stringify(body, null, 2));
    }
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    });
  }

  // PUT request
  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // PATCH request
  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Export singleton instance
export const api = new ApiClient();

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: { id: number; email: string; name: string; role: string } }>(
      '/auth/login',
      { email, password }
    ),

  me: () => api.get<{ user: { id: number; email: string; name: string; role: string } }>('/auth/me'),

  verify: () => api.post<{ user: { id: number; email: string; name: string; role: string } }>('/auth/verify'),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
};

// Customers API
export const customersApi = {
  list: (params?: { search?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return api.get(`/customers?${searchParams.toString()}`);
  },

  get: (id: number) => api.get(`/customers/${id}`),

  create: (data: { name: string; phone?: string; email?: string; source?: string; notes?: string }) =>
    api.post('/customers', data),

  update: (id: number, data: { name: string; phone?: string; email?: string; source?: string; notes?: string }) =>
    api.put(`/customers/${id}`, data),

  delete: (id: number) => api.delete(`/customers/${id}`),

  quickSearch: (q: string) => api.get(`/customers/search/quick?q=${encodeURIComponent(q)}`),

  merge: (targetCustomerId: number, sourceCustomerId: number, updatedTargetData?: any) =>
    api.post('/customers/merge', { targetCustomerId, sourceCustomerId, updatedTargetData }),
};

// Dresses API
export const dressesApi = {
  list: (params?: { search?: string; status?: string; intended_use?: string; sortBy?: string; sortOrder?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);
    if (params?.intended_use) searchParams.set('intended_use', params.intended_use);
    if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
    if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return api.get(`/dresses?${searchParams.toString()}`);
  },

  get: (id: number) => api.get(`/dresses/${id}`),

  create: (data: { name: string; base_price?: number; status?: string; intended_use?: 'rental' | 'sale'; photo_url?: string; thumbnail_url?: string; notes?: string }) =>
    api.post('/dresses', data),

  update: (id: number, data: { name: string; base_price?: number; status?: string; intended_use?: 'rental' | 'sale'; photo_url?: string; thumbnail_url?: string; notes?: string }) =>
    api.put(`/dresses/${id}`, data),

  updateStatus: (id: number, status: string) =>
    api.patch(`/dresses/${id}/status`, { status }),

  addRental: (id: number, data: { wearer_name: string; amount: number; rental_type?: string; event_date?: string }) =>
    api.post(`/dresses/${id}/rental`, data),

  delete: (id: number) => api.delete(`/dresses/${id}`),

  available: () => api.get('/dresses/available'),

  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ imageUrl: string; thumbnailUrl: string }>('/dresses/upload', formData);
  }
};

// Transactions API
export const transactionsApi = {
  list: (params?: { type?: string; category?: string; orderId?: number; customer_id?: number; startDate?: string; endDate?: string; search?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.category) searchParams.set('category', params.category);
    if (params?.orderId) searchParams.set('orderId', params.orderId.toString());
    if (params?.customer_id) searchParams.set('customer_id', params.customer_id.toString());
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.search) searchParams.set('search', params.search);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return api.get(`/transactions?${searchParams.toString()}`);
  },

  get: (id: number) => api.get(`/transactions/${id}`),

  summary: (startDate?: string, endDate?: string) => {
    const searchParams = new URLSearchParams();
    if (startDate) searchParams.set('startDate', startDate);
    if (endDate) searchParams.set('endDate', endDate);
    return api.get(`/transactions/summary?${searchParams.toString()}`);
  },

  create: (data: {
    date: string;
    type: 'income' | 'expense';
    category: string;
    customer_id?: number;
    customer_name?: string;
    supplier?: string;
    product?: string;
    amount: number;
    payment_method?: string;
    notes?: string;
    dress_id?: number;
    order_id?: number;
    customer_charge_amount?: number;
  }) => api.post('/transactions', data),

  update: (id: number, data: unknown) => api.put(`/transactions/${id}`, data),

  delete: (id: number) => api.delete(`/transactions/${id}`),
};

// Dashboard API
export const dashboardApi = {
  summary: () => api.get('/dashboard/summary'),
  upcomingEvents: (days?: number) => api.get(`/dashboard/upcoming-events?days=${days || 7}`),
  recentTransactions: (limit?: number) => api.get(`/dashboard/recent-transactions?limit=${limit || 10}`),
  monthlyChart: (months?: number) => api.get(`/dashboard/monthly-chart?months=${months || 12}`),
  topDresses: (limit?: number) => api.get(`/dashboard/top-dresses?limit=${limit || 5}`),
  requiresAttention: () => api.get('/dashboard/requires-attention'),
};

// Agreements API (public)
export const agreementsApi = {
  config: () => api.get('/agreements/config'),
  terms: () => api.get('/agreements/content/terms'),
  prefill: (token: string) => api.get(`/agreements/prefill?token=${encodeURIComponent(token)}`),
  createSignLink: (orderId: number) => api.post<{
    orderId: number;
    link: string;
    expiresIn: string;
    customerPhone: string;
    whatsappLink?: string | null;
  }>(`/agreements/order/${orderId}/sign-link`),
  sign: (data: {
    full_name: string;
    phone: string;
    email?: string;
    event_date?: string;
    signature_data: string;
    order_id?: number;
    token?: string;
  }) => api.post('/agreements/sign', data),
  list: (page?: number, limit?: number) =>
    api.get(`/agreements?page=${page || 1}&limit=${limit || 50}`),
  get: (id: number) => api.get(`/agreements/${id}`),
};

// Orders API
export const ordersApi = {
  list: (params?: { status?: string; customer_id?: number; startDate?: string; endDate?: string; page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.customer_id) searchParams.set('customer_id', params.customer_id.toString());
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    return api.get(`/orders?${searchParams.toString()}`);
  },
  get: (id: number) => api.get(`/orders/${id}`),
  upcoming: (days?: number) => api.get(`/orders/upcoming?days=${days || 14}`),
  create: (data: unknown) => api.post('/orders', data),
  update: (id: number, data: unknown) => api.put(`/orders/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/orders/${id}/status`, { status }),
  addPayment: (id: number, data: { amount: number; payment_method?: string; payment_date?: string; notes?: string }) =>
    api.post(`/orders/${id}/payment`, data),
  delete: (id: number) => api.delete(`/orders/${id}`),
  
  merge: (targetOrderId: number, sourceOrderId: number, updatedOrderData?: any) =>
    api.post('/orders/merge', { targetOrderId, sourceOrderId, updatedOrderData }),
};

export interface ExportFilterOption {
  value: string;
  label: string;
}

export interface ExportFilterDefinition {
  key: string;
  label: string;
  inputType: 'text' | 'number' | 'date' | 'select' | 'checkbox';
  placeholder: string | null;
  options: ExportFilterOption[];
}

export interface ExportDataset {
  id: string;
  label: string;
  description: string;
  totalRows: number;
  filters: ExportFilterDefinition[];
}

function extractFileName(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/"/g, '').trim());
    } catch {
      return utf8Match[1].replace(/"/g, '').trim();
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] || null;
}

async function downloadCsvFile(endpoint: string): Promise<{ blob: Blob; fileName: string }> {
  const headers: HeadersInit = {};
  const token = api.getToken();

  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'GET',
    headers,
  });

  if (response.status === 401) {
    api.setToken(null);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('פג תוקף ההתחברות - נא להתחבר מחדש');
  }

  if (!response.ok) {
    let message = 'שגיאה בייצוא נתונים';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = await response.json() as any;
      if (payload?.message) {
        message = payload.message;
      }
    } catch {
      // Keep default message when response is not JSON
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const fileName = extractFileName(response.headers.get('content-disposition')) ||
    `export-${new Date().toISOString().slice(0, 10)}.csv`;

  return { blob, fileName };
}

// Export API
export const exportApi = {
  datasets: () => api.get<{ datasets: ExportDataset[] }>('/export/datasets'),

  downloadCsv: (
    dataset: string,
    filters?: Record<string, string | number | boolean | null | undefined>
  ) => {
    const searchParams = new URLSearchParams();
    searchParams.set('dataset', dataset);

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      const normalized = String(value).trim();
      if (!normalized) return;
      searchParams.set(key, normalized);
    });

    return downloadCsvFile(`/export/csv?${searchParams.toString()}`);
  },
};

export default api;
