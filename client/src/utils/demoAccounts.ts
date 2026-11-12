/** Demo credentials and shortcuts are opt-in and limited to Vite development. */
export function demoAccountsEnabled(env: { dev: boolean; mode: string; showDemoAccounts?: string }): boolean {
  return env.dev && env.mode === 'development' && env.showDemoAccounts === 'true';
}
