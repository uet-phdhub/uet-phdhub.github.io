import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePublicationPoint,
  calculateSupervisorQuotaAndHours,
  computeDeadlinesCountdown,
  DEFAULT_REGULATION_3638_CONFIG,
  evaluatePhdPublications,
  evaluateScientistResearchCapacity,
} from '../shared/regulation3638';

test('Quy chế 3638: calculates publication points for main author vs coauthor and explicit HDGSNN override', () => {
  const q1Main = calculatePublicationPoint({ pubType: 'wos_q1', authorRole: 'first' }, DEFAULT_REGULATION_3638_CONFIG);
  assert.equal(q1Main, 2.0);

  const q1Co = calculatePublicationPoint({ pubType: 'wos_q1', authorRole: 'coauthor' }, DEFAULT_REGULATION_3638_CONFIG);
  assert.equal(q1Co, 1.0);

  const explicitOverride = calculatePublicationPoint(
    { pubType: 'vn_hdgsnn_std', authorRole: 'main', hdgsnnMaxPoint: 0.75 },
    DEFAULT_REGULATION_3638_CONFIG
  );
  assert.equal(explicitOverride, 0.75);
});

test('Quy chế 3638: evaluates PhD student publication compliance (>= 2.0 points & >= 1 WoS/Scopus)', () => {
  const notEnough = evaluatePhdPublications(
    [{ title: 'Domestic paper', pubYear: 2025, pubType: 'vn_hdgsnn_high', authorRole: 'first' }],
    DEFAULT_REGULATION_3638_CONFIG
  );
  assert.equal(notEnough.status, 'in_progress');
  assert.equal(notEnough.meetsPoints, false);
  assert.equal(notEnough.meetsWosScopus, false);

  const met = evaluatePhdPublications(
    [
      { title: 'Q2 Journal', pubYear: 2025, pubType: 'wos_q2', authorRole: 'first' },
      { title: 'Scopus Conf', pubYear: 2026, pubType: 'intl_conf_scopus', authorRole: 'first' },
    ],
    DEFAULT_REGULATION_3638_CONFIG
  );
  assert.equal(met.status, 'met');
  assert.equal(met.totalPoints, 2.25);
  assert.equal(met.wosScopusCount, 2);
});

test('Quy chế 3638: detects excellent research capacity (>= 3 WoS/Scopus/year for 3 consecutive years)', () => {
  const pubs: any[] = [];
  for (const year of [2024, 2025, 2026]) {
    for (let i = 0; i < 3; i++) {
      pubs.push({ title: `Paper ${year}-${i}`, pubYear: year, pubType: 'wos_q1', authorRole: 'corresponding' });
    }
  }
  const evalRes = evaluateScientistResearchCapacity(pubs, DEFAULT_REGULATION_3638_CONFIG, 2026);
  assert.equal(evalRes.excellentByPublications, true);
  assert.deepEqual(evalRes.excellentStreakYears, [2024, 2025, 2026]);
  assert.equal(evalRes.meetsSupervisor, true);
  assert.equal(evalRes.meetsReviewer, true);
  assert.equal(evalRes.totalPoints, 18);
});

test('Supervisor Quota & Teaching Hours: weighted 1 / 0.5 / 0.3 / 0.5 on active NCS only', () => {
  const scientist = {
    academic_rank: 'PGS',
    academic_degree: 'TS',
    special_quota_approved: 0,
    special_quota_limit: null,
    has_major_grant_scholarship: 0,
  };
  const supervisions: any[] = [
    { role: 'independent', study_status: 'studying', is_active: 1, is_completed: 0 }, // 1.0
    { role: 'primary', study_status: 'extended', is_active: 1, is_completed: 0 },     // 0.5
    { role: 'secondary', study_status: 'ready_defense', is_active: 1, is_completed: 0 }, // 0.3
    { role: 'co', study_status: 'studying', is_active: 1, is_completed: 0 },          // 0.5
    { role: 'independent', study_status: 'graduated', is_active: 1, is_completed: 1 }, // excluded
  ];

  const q = calculateSupervisorQuotaAndHours(scientist, supervisions, null, DEFAULT_REGULATION_3638_CONFIG);
  assert.equal(q.baseQuota, 5);
  assert.equal(q.effectiveQuota, 5);
  assert.equal(q.activeStudentCount, 4);
  assert.equal(q.equivalentLoad, 2.3);
  assert.equal(q.standardHours, 115); // 2.3 * 50
  assert.equal(q.status, 'ok');
});

test('Deadlines countdown hides confidential IR due date when includeConfidential is false', () => {
  const refDate = new Date('2026-11-25T08:00:00Z');
  const phd = {
    standard_deadline: '2026-12-10',
    max_deadline: '2028-12-10',
    output_fl_review_deadline: '2026-11-20',
    ir_due_date: '2026-11-28',
    ir_result: '',
    study_status: 'studying',
    is_completed: 0,
  };

  const publicDl = computeDeadlinesCountdown(phd, DEFAULT_REGULATION_3638_CONFIG, false, refDate);
  assert.equal(publicDl.standard.level, 'urgent');
  assert.equal(publicDl.outputFlReview.level, 'overdue');
  assert.equal(publicDl.irDue, undefined);

  const staffDl = computeDeadlinesCountdown(phd, DEFAULT_REGULATION_3638_CONFIG, true, refDate);
  assert.equal(staffDl.irDue?.level, 'urgent');
});
