const severity = {
  A1: 'ERROR', A2: 'ERROR', A3: 'WARN', A4: 'ERROR',
  A5: 'WARN', A6: 'ERROR', A7: 'ERROR', A8: 'WARN'
};

function result(id, passed, detail, applicable = true) {
  return { id, severity: severity[id], passed, applicable, detail };
}

export function evaluateAssertions(snapshot) {
  const { identity, launch, server, reports, collector } = snapshot;
  const assertions = [
    result('A1', identity.buildVerdict === 'built-current', `build verdict is ${identity.buildVerdict}`),
    result('A2', identity.dependenciesInstalled || launch.compileFeasible === true, 'dependencies are absent and compile is not demonstrably feasible'),
    result('A3', launch.preLaunchTaskDefinedInTasksJson === true, `preLaunchTask ${launch.preLaunchTask ?? 'unknown'} has no explicit tasks.json definition`),
    result('A4', launch.hostFolderExists === true, 'launch host folder target is absent or unknown'),
    result('A5', identity.copyCount === 1, `${identity.copyCount ?? 'unknown'} Sideline Coach copies found under parent directory`),
    result('A6', server.portInOsEphemeralRange === false, `configured port ${server.configuredPort ?? 'unknown'} lies inside or cannot be compared with the OS ephemeral range`),
    collector === 'extension'
      ? result('A7', snapshot.extension?.activationCompleted === true && snapshot.extension?.listenerMatchesAutoStart === true, 'activation or listener state does not match autoStart intent')
      : result('A7', true, 'not evaluated by the preflight collector', false),
    result('A8', reports.matchedCount > 0, 'report globs matched no files in the intended host workspace')
  ];
  return assertions;
}

export function failingAssertions(snapshot) {
  const rank = { ERROR: 0, WARN: 1 };
  return evaluateAssertions(snapshot)
    .filter((entry) => entry.applicable && !entry.passed)
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id));
}
