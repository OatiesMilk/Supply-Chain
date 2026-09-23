/**
 * Authentication Context / Store Bridge
 * Backwards-compatible exports forwarding to Zustand authStore
 */

export * from '@/store/authStore';
export { useAuthStore as default } from '@/store/authStore';
