/**
 * Human Player labels are a projection of the currently present roster.
 * Opaque instanceId remains identity; stable seats only order siblings.
 */

interface RosterInstanceLike {
  readonly instanceId?: unknown;
  readonly seat?: unknown;
  readonly fieldLabel?: unknown;
  readonly displayName?: unknown;
}

interface RosterGroupLike {
  readonly name?: unknown;
  readonly instances?: unknown;
}

function baseName(group: RosterGroupLike, instance: RosterInstanceLike): string {
  if (typeof group.name === 'string' && group.name.trim()) return group.name.trim();
  const source = typeof instance.fieldLabel === 'string'
    ? instance.fieldLabel
    : typeof instance.displayName === 'string'
      ? instance.displayName
      : 'Player';
  return source.split(' · ')[0].replace(/\s+\d+$/, '').trim() || 'Player';
}

/** One Game's exact instanceId -> current, contiguous Dad-mode label. */
export function friendlyInstanceNames(roster: readonly unknown[] | undefined): Map<string, string> {
  const names = new Map<string, string>();
  for (const raw of Array.isArray(roster) ? roster : []) {
    const group = raw as RosterGroupLike;
    const instances = (Array.isArray(group.instances) ? group.instances : [])
      .map((item) => item as RosterInstanceLike)
      .filter((item): item is RosterInstanceLike & { instanceId: string } => typeof item.instanceId === 'string')
      .sort((a, b) => (Number(a.seat) || 0) - (Number(b.seat) || 0) || a.instanceId.localeCompare(b.instanceId));
    instances.forEach((instance, index) => {
      const label = baseName(group, instance);
      names.set(instance.instanceId, instances.length > 1 ? `${label} ${index + 1}` : label);
    });
  }
  return names;
}

/** Add the shared presentation label to roster instances without mutating Stadium truth. */
export function projectFriendlyRoster(roster: readonly unknown[] | undefined): unknown[] {
  const source = Array.isArray(roster) ? roster : [];
  const names = friendlyInstanceNames(source);
  return source.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const group = raw as RosterGroupLike & Record<string, unknown>;
    if (!Array.isArray(group.instances)) return raw;
    return {
      ...group,
      instances: group.instances.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        const instance = item as Record<string, unknown>;
        const displayName = typeof instance.instanceId === 'string' ? names.get(instance.instanceId) : undefined;
        return displayName ? { ...instance, displayName } : item;
      })
    };
  });
}
