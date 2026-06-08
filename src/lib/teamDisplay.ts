interface TeamWithDisplay {
  name?: string | null;
  short_name?: string | null;
  team_display_names?: Array<{ display_name: string; locale: string; is_primary: boolean }> | null;
}

export function resolveTeamName(team: TeamWithDisplay | null | undefined, fallback = ''): string {
  if (!team) return fallback;
  const tr = team.team_display_names?.find((d) => d.locale === 'tr-TR' && d.is_primary);
  return tr?.display_name ?? team.short_name ?? team.name ?? fallback;
}
