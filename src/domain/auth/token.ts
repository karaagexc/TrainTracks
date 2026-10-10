import { isExplicitOrigin, isRecord, type ValidationResult } from '@/domain/config';
import { isPublicApiScope, normalizePublicApiScopes } from '@/domain/predictions/apiScopes';

export function validateTokenEdit(value: unknown, creating = false): ValidationResult<Record<string, unknown>> {
    const fields = creating ? ['name', 'scopes', 'allowedOrigins', 'expiresAt'] : ['name', 'scopes', 'allowedOrigins', 'expiresAt', 'isActive'];
    if (!isRecord(value) || !Object.keys(value).length || Object.keys(value).some(key => !fields.includes(key))) {
        return { ok: false, error: 'invalid_token_edit' };
    }
    const result: Record<string, unknown> = {};
    if (creating || 'name' in value) {
        if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 80) return { ok: false, error: 'invalid_name' };
        result.name = value.name.trim();
    }
    if ('scopes' in value) {
        if (!Array.isArray(value.scopes) || !value.scopes.length || !value.scopes.every(isPublicApiScope)) return { ok: false, error: 'invalid_scopes' };
        result.scopes = normalizePublicApiScopes(value.scopes);
    } else if (creating) result.scopes = ['predictions:read'];
    if ('allowedOrigins' in value) {
        if (!Array.isArray(value.allowedOrigins) || value.allowedOrigins.length > 20 || !value.allowedOrigins.every(isExplicitOrigin)) {
            return { ok: false, error: 'invalid_allowed_origins' };
        }
        result.allowed_origins = [...new Set(value.allowedOrigins)];
    } else if (creating) result.allowed_origins = [];
    if ('expiresAt' in value) {
        if (value.expiresAt === null) result.expires_at = null;
        else if (typeof value.expiresAt === 'string' && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now()) {
            result.expires_at = new Date(value.expiresAt).toISOString();
        } else return { ok: false, error: 'invalid_expiry' };
    } else if (creating) result.expires_at = null;
    if ('isActive' in value) {
        if (typeof value.isActive !== 'boolean') return { ok: false, error: 'invalid_active_state' };
        result.is_active = value.isActive;
    }
    return { ok: true, value: result };
}
