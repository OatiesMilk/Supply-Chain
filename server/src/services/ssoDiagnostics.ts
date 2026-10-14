export type SsoStage = 'initiate' | 'token_exchange' | 'account_lookup' | 'session';

// Only known machine codes are safe to print. Provider messages may include
// credentials, tokens, account details or request URLs, so never log them.
const ERROR_CODES = new Set([
  'invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope',
  'unauthorized_client', 'access_denied', 'interaction_required',
  'temporarily_unavailable', 'server_error', 'service_not_available',
  'client_authentication_failed', 'invalid_client_credential',
  'endpoints_resolution_error', 'network_error', 'post_request_failed',
  'no_network_connectivity', 'openid_config_error', 'invalid_authority',
  'token_parsing_error', 'token_request_cannot_be_made',
]);
const SUB_ERRORS = new Set([
  'consent_required', 'login_required', 'interaction_required',
  'basic_action', 'additional_action', 'message_only', 'bad_token',
  'client_mismatch', 'protection_policy_required',
]);

export function ssoFailureDetails(stage: SsoStage, error: unknown) {
  const details: { stage: SsoStage; errorCode?: string; subError?: string; aadstsCodes?: string[]; prismaCode?: string } = { stage };
  if (!error || typeof error !== 'object') return details;
  const value = error as Record<string, unknown>;
  if (typeof value.errorCode === 'string' && ERROR_CODES.has(value.errorCode)) details.errorCode = value.errorCode;
  if (typeof value.subError === 'string' && SUB_ERRORS.has(value.subError)) details.subError = value.subError;
  if (typeof value.code === 'string' && /^P\d{4}$/.test(value.code)) details.prismaCode = value.code;
  // Extract only bounded numeric AADSTS identifiers, never the raw description.
  const message = typeof value.errorMessage === 'string' ? value.errorMessage : typeof value.message === 'string' ? value.message : '';
  const codes = [...new Set(message.match(/\bAADSTS\d{4,8}\b/g) ?? [])].slice(0, 5);
  if (codes.length) details.aadstsCodes = codes;
  return details;
}
