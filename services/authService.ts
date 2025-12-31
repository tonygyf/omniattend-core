import { AdminUser, ApiResponse } from '../types';

// CONFIGURATION
const API_BASE_URL = "http://localhost:8787"; // Replace with production URL

interface AuthResponse {
  id: string;
  email: string;
  token: string;
}

export const loginAdmin = async (email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
  // --- MOCK DEMO LOGIN ---
  // Allows easy access for testing/viewing without backend setup
  if (email === 'demo@facecheck.com' && password === 'demo123') {
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate network delay
    return {
      success: true,
      data: {
        id: 'mock-admin-id',
        email: 'demo@facecheck.com',
        token: 'mock-demo-jwt-token'
      }
    };
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Login failed' };
    }
    return data;
  } catch (error) {
    return { success: false, error: 'Network error during login. Ensure Worker is running or use Demo account.' };
  }
};

export const registerAdmin = async (email: string, password: string): Promise<ApiResponse<AuthResponse>> => {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || 'Registration failed' };
    }
    return { success: true, data: data.data };
  } catch (error) {
    return { success: false, error: 'Network error during registration' };
  }
};
