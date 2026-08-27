export const PUBLIC_API_SCOPES = [
    'predictions:read',
    'incidents:read',
    'incidents:write',
    'crowd:write',
] as const;

export type PublicApiScope = typeof PUBLIC_API_SCOPES[number];

const PUBLIC_API_SCOPE_SET = new Set<string>(PUBLIC_API_SCOPES);

export function isPublicApiScope(value: unknown): value is PublicApiScope {
    return typeof value === 'string' && PUBLIC_API_SCOPE_SET.has(value);
}

export function normalizePublicApiScopes(value: unknown): PublicApiScope[] {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter(isPublicApiScope)));
}

export function publicApiTokenHasScope(
    scopes: readonly string[],
    requiredScope: PublicApiScope | undefined,
): boolean {
    return !requiredScope || scopes.includes('*') || scopes.includes(requiredScope);
}
