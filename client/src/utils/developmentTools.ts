/** Vite removes development-only entry points from staging/production builds. */
export const DATA_SAMPLER_ENABLED = typeof import.meta.env === 'object'
  && import.meta.env.DEV && import.meta.env.MODE === 'development';
