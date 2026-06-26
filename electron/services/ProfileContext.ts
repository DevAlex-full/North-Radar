export function getActiveProfileId(): string {
  return 'default';
}

/** Monta o segmento de caminho `profiles/{profileId}/{...parts}` para uso com getWorkspaceSubdir(). */
export function profilePath(...parts: string[]): string {
  return ['profiles', getActiveProfileId(), ...parts].join('/');
}