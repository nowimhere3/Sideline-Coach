import assert from 'node:assert/strict';
import test from 'node:test';
import { StadiumClient } from '../out/stadium-client.js';

const GAME = 'game_test_recent';

function createMockStadium(extra = {}) {
  const frames = [];
  const client = new StadiumClient({
    autoReconnect: false,
    gameContextGetter: () => ({
      game: { gameId: GAME, displayName: 'Test Game', fingerprintSource: 'test' },
      stadium: { stadiumId: 'stadium_1', name: 'Test Stadium', platform: 'win32', stadiumType: 'vscode-desktop' },
      binding: { gameId: GAME, stadiumId: 'stadium_1', rootFsPath: 'C:\\test\\game', boundAt: Date.now(), isPrimary: true, status: 'bound' }
    }),
    ...extra
  });
  client.socket = { readyState: 1, send: (raw) => frames.push(JSON.parse(String(raw))) };
  client.connected = true;
  return { client, frames };
}

const getSnapshotReports = (frames) => frames.filter((f) => f.method === 'report.changed' || f.method === 'report.snapshot').at(-1).params.reports;

test('Recent-1. Newer server report beats older Scout report', async () => {
  const scoutReport = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT.md', path: 'C:\\scout\\Formations\\1\\FORMATION-RESULT.md',
    mtime: 1000, content: 'Scout report content'
  };
  const serverReport = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'claude-report.md', path: 'C:\\test\\game\\Reports\\Claude\\claude-report.md',
    mtime: 2000, content: 'Claude report content'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutReport]
    },
    reportsGetter: async () => [serverReport]
  });

  await client.sendReportSnapshot();
  const reports = getSnapshotReports(frames);

  assert.equal(reports.length, 2);
  assert.equal(reports[0].agent, 'Claude');
  assert.equal(reports[0].mtime, 2000);
  assert.equal(reports[1].agent, 'Scout');
  assert.equal(reports[1].mtime, 1000);
});

test('Recent-2. Newer Scout report beats older server report', async () => {
  const scoutReport = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT.md', path: 'C:\\scout\\Formations\\2\\FORMATION-RESULT.md',
    mtime: 3000, content: 'Scout report content'
  };
  const serverReport = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'claude-report.md', path: 'C:\\test\\game\\Reports\\Claude\\claude-report.md',
    mtime: 2000, content: 'Claude report content'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutReport]
    },
    reportsGetter: async () => [serverReport]
  });

  await client.sendReportSnapshot();
  const reports = getSnapshotReports(frames);

  assert.equal(reports.length, 2);
  assert.equal(reports[0].agent, 'Scout');
  assert.equal(reports[0].mtime, 3000);
  assert.equal(reports[1].agent, 'Claude');
  assert.equal(reports[1].mtime, 2000);
});

test('Recent-3. Producer identity is irrelevant: reports ordered exclusively by chronology', async () => {
  const scoutReport = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT.md', path: 'C:\\scout\\Formations\\1\\FORMATION-RESULT.md',
    mtime: 2500, content: 'Scout'
  };
  const codexReport = {
    gameId: GAME, project: 'Test Game', agent: 'Codex',
    filename: 'codex.md', path: 'C:\\test\\game\\Reports\\Codex\\codex.md',
    mtime: 1500, content: 'Codex'
  };
  const antiGravityReport = {
    gameId: GAME, project: 'Test Game', agent: 'AntiGravity',
    filename: 'antigravity.md', path: 'C:\\test\\game\\Reports\\AntiGravity\\antigravity.md',
    mtime: 3500, content: 'AntiGravity'
  };
  const claudeReport = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'claude.md', path: 'C:\\test\\game\\Reports\\Claude\\claude.md',
    mtime: 500, content: 'Claude'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutReport]
    },
    reportsGetter: async () => [claudeReport, antiGravityReport, codexReport]
  });

  await client.sendReportSnapshot();
  const reports = getSnapshotReports(frames);

  assert.deepEqual(reports.map((r) => r.agent), ['AntiGravity', 'Scout', 'Codex', 'Claude']);
  assert.deepEqual(reports.map((r) => r.mtime), [3500, 2500, 1500, 500]);
});

test('Recent-4. Cross-source merge happens before final ordering (interleaved mtimes)', async () => {
  const scoutA = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT-A.md', path: 'C:\\scout\\Formations\\A\\FORMATION-RESULT.md',
    mtime: 4000, content: 'Scout A'
  };
  const serverB = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'B.md', path: 'C:\\test\\game\\Reports\\Claude\\B.md',
    mtime: 3500, content: 'Server B'
  };
  const scoutC = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT-C.md', path: 'C:\\scout\\Formations\\C\\FORMATION-RESULT.md',
    mtime: 3000, content: 'Scout C'
  };
  const serverD = {
    gameId: GAME, project: 'Test Game', agent: 'Codex',
    filename: 'D.md', path: 'C:\\test\\game\\Reports\\Codex\\D.md',
    mtime: 2500, content: 'Server D'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutC, scoutA]
    },
    reportsGetter: async () => [serverD, serverB]
  });

  await client.sendReportSnapshot();
  const reports = getSnapshotReports(frames);

  assert.deepEqual(reports.map((r) => r.mtime), [4000, 3500, 3000, 2500]);
  assert.deepEqual(reports.map((r) => r.path), [scoutA.path, serverB.path, scoutC.path, serverD.path]);
});

test('Recent-5. Equal-mtime tie is deterministic using path descending', async () => {
  const reportA = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'a.md', path: 'C:\\test\\game\\Reports\\Claude\\a.md',
    mtime: 2000, content: 'A'
  };
  const reportZ = {
    gameId: GAME, project: 'Test Game', agent: 'Codex',
    filename: 'z.md', path: 'C:\\test\\game\\Reports\\Codex\\z.md',
    mtime: 2000, content: 'Z'
  };

  // Run 1: input order [reportA, reportZ]
  const { client: client1, frames: frames1 } = createMockStadium({
    reportsGetter: async () => [reportA, reportZ]
  });
  await client1.sendReportSnapshot();
  const run1 = getSnapshotReports(frames1);

  // Run 2: reversed input order [reportZ, reportA]
  const { client: client2, frames: frames2 } = createMockStadium({
    reportsGetter: async () => [reportZ, reportA]
  });
  await client2.sendReportSnapshot();
  const run2 = getSnapshotReports(frames2);

  // Path descending tie-break: reportZ ('...z.md') > reportA ('...a.md')
  assert.deepEqual(run1.map((r) => r.path), [reportZ.path, reportA.path]);
  assert.deepEqual(run2.map((r) => r.path), [reportZ.path, reportA.path]);
  assert.deepEqual(run1.map((r) => r.path), run2.map((r) => r.path), 'repeated runs produce the same result');
});

test('Recent-6. Duplicate path behavior survives: Scout representation wins over duplicate server path', async () => {
  const sharedPath = 'C:\\shared\\Reports\\FORMATION-RESULT.md';
  const scoutReport = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT.md', path: sharedPath,
    mtime: 2000, content: 'Scout-owned representation',
    provenance: { playerInstanceId: 'scout', clientRef: 'play_1' }
  };
  const serverDuplicate = {
    gameId: GAME, project: 'Test Game', agent: 'Generic',
    filename: 'FORMATION-RESULT.md', path: sharedPath,
    mtime: 2000, content: 'Server scan duplicate'
  };
  const otherServerReport = {
    gameId: GAME, project: 'Test Game', agent: 'Claude',
    filename: 'other.md', path: 'C:\\shared\\Reports\\other.md',
    mtime: 1500, content: 'Other report'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutReport]
    },
    reportsGetter: async () => [serverDuplicate, otherServerReport]
  });

  await client.sendReportSnapshot();
  const reports = getSnapshotReports(frames);

  assert.equal(reports.length, 2, 'duplicate path is collapsed to one report');
  assert.equal(reports[0].path, sharedPath);
  assert.equal(reports[0].agent, 'Scout');
  assert.equal(reports[0].content, 'Scout-owned representation', 'Scout-owned representation wins');
  assert.equal(reports[1].path, otherServerReport.path);
});

test('Recent-7. Refresh still exposes newest report at position 1', async () => {
  let serverReports = [
    {
      gameId: GAME, project: 'Test Game', agent: 'Claude',
      filename: 'first.md', path: 'C:\\test\\game\\Reports\\Claude\\first.md',
      mtime: 1000, content: 'first'
    }
  ];

  const scoutReport = {
    gameId: GAME, project: 'Test Game', agent: 'Scout',
    filename: 'FORMATION-RESULT.md', path: 'C:\\scout\\Formations\\1\\FORMATION-RESULT.md',
    mtime: 2000, content: 'Scout parent'
  };

  const { client, frames } = createMockStadium({
    scoutReportSource: {
      id: 'scout-intelligence', agentLabel: 'Scout', roots: () => [], parentGlob: '',
      list: async () => [scoutReport]
    },
    reportsGetter: async () => serverReports
  });

  // Initial snapshot: Scout (2000) beats Claude first (1000)
  await client.sendReportSnapshot();
  let reports = getSnapshotReports(frames);
  assert.equal(reports[0].agent, 'Scout');
  assert.equal(reports[1].agent, 'Claude');

  // New report lands with mtime 5000:
  serverReports = [
    ...serverReports,
    {
      gameId: GAME, project: 'Test Game', agent: 'AntiGravity',
      filename: 'newest.md', path: 'C:\\test\\game\\Reports\\AntiGravity\\newest.md',
      mtime: 5000, content: 'newest'
    }
  ];

  // Refresh Incoming triggers publishReportsChanged ('report.changed')
  await client.publishReportsChanged();
  reports = getSnapshotReports(frames);
  assert.equal(reports[0].agent, 'AntiGravity');
  assert.equal(reports[0].mtime, 5000);
  assert.equal(reports[1].agent, 'Scout');
  assert.equal(reports[1].mtime, 2000);
  assert.equal(reports[2].agent, 'Claude');
  assert.equal(reports[2].mtime, 1000);
});
