/* KSE Enterprise CRM Progressive Web App
 * - Secure email/password authentication
 * - Offline-first Dexie storage scoped per user
 * - ECD workflow cockpit with AI narration
 * - Syncs directly to the Node API (/api/crm) for state + queue flushing
 */
/* global Dexie, Chart */

const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
const AUTH_DISABLED = resolveAuthDisabled();
const PROD_API_HOST = 'https://kse-tools-server.up.railway.app';
const API_HOST = resolveApiHost();
const API_BASE = `${API_HOST}/api`;
const AUTH_ROUTES = {
  login: `${API_BASE}/auth/login`,
  refresh: `${API_BASE}/auth/refresh`,
  me: `${API_BASE}/auth/me`,
  logout: `${API_BASE}/auth/logout`
};

const CRM_SYNC_ENDPOINT = `${API_BASE}/crm`;
const AI_TRANSCRIBE_ENDPOINT = `${API_BASE}/transcribe`;
const AI_EXTRACT_ENDPOINT = `${API_BASE}/extractBD`;
const AI_BRIEFING_ENDPOINT = `${API_BASE}/briefing`;
const EXTERNAL_INFO_ENDPOINT = `${API_BASE}/external-info`;

const DB_NAME = 'kse-enterprise-crm';
const DB_VERSION = 7;
const STORE_SCHEMA = {
  users: '&id, email, role',
  enterpriseAccounts: '&id, userId, ownerId, updatedAt, stage, stalled, city, state',
  contacts: '&id, userId, accountId, role',
  activityLog: '&id, userId, accountId, date',
  movementLog: '&id, userId, accountId, date',
  opportunities: '&id, userId, accountId, type, bidStatus',
  weeklySummaries: '&id, userId, createdAt',
  queue: '++id, userId, kind, status, createdAt'
};

const DEMO_USERS = [
  { id: 'dev-user', name: 'Dev User', email: 'dev@example.com', role: 'admin' },
  { id: 'demo-admin', name: 'BD Lead', email: 'bdlead@example.com', role: 'admin' },
  { id: 'demo-user', name: 'BD Rep', email: 'bdrep@example.com', role: 'standard' }
];
const CUSTOMER_SEED_FLAG = 'kse_crm_customer_seed_v1';

const ECD_STAGES = [
  'Discovery',
  'Gatekeeper Contact',
  'First Conversation',
  'Site Tour',
  'Pain Identified',
  'Technical Fit',
  'Pilot / First Project',
  'Expansion',
  'Embedded Partner'
];

const STAGE_WEIGHTS = {
  'Discovery': 10,
  'Gatekeeper Contact': 20,
  'First Conversation': 30,
  'Site Tour': 45,
  'Pain Identified': 60,
  'Technical Fit': 70,
  'Pilot / First Project': 80,
  'Expansion': 90,
  'Embedded Partner': 100
};

const ENTRENCHMENT_PENALTY = { High: -40, Medium: -20, Low: 0 };
const RELATIONSHIP_MULTIPLIER = { 'Strong': 20, 'Balanced': 10, 'Neutral': 0, 'Weak': -10, 'At Risk': -20 };
const VELOCITY_WINDOW_DAYS = 30;
const STALL_THRESHOLD_DAYS = 14;

const PROJECT_ECD_STAGES = [
  { key: '1', label: '1 • Discovery' },
  { key: '1a', label: '1a • Gatekeeper Contacted' },
  { key: '2', label: '2 • First Conversation' },
  { key: '3', label: '3 • Site Tour' },
  { key: '4', label: '4 • Pain Identified' },
  { key: '5', label: '5 • Technical Fit' },
  { key: '6', label: '6 • Pilot / First Project' },
  { key: '7', label: '7 • Expansion' },
  { key: '8', label: '8 • Embedded Partner' }
];

const PROJECT_BID_STATUSES = [
  { value: 'discovery', label: 'In Discovery' },
  { value: 'bid_in_progress', label: 'Bid in Progress' },
  { value: 'bid_sent', label: 'Bid Sent' },
  { value: 'awaiting_handoff', label: 'Awarded – Awaiting Handoff' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'declined', label: 'Declined' }
];
const PROJECT_STAGE_MAP = Object.fromEntries(PROJECT_ECD_STAGES.map((stage) => [stage.key, stage]));
const PROJECT_BID_STATUS_MAP = Object.fromEntries(PROJECT_BID_STATUSES.map((status) => [status.value, status]));
const NOTES_V1_PREFIX = '[[v1-notes]]';

const state = {
  session: null,
  accounts: [],
  contacts: [],
  activities: [],
  movements: [],
  opportunities: [],
  selectedAccountId: null,
  filters: { search: '', stage: '', industry: '' },
  queueLength: 0,
  queueState: 'idle',
  queueRetryCount: 0,
  latestSummaryCsv: null,
  dictation: { transcript: '', extraction: null },
  stalledAccountIds: new Set(),
  aiDrawerOpen: false,
  aiTarget: 'activity',
  projectFilter: 'all',
  briefing: { open: false, loading: false, data: null, error: null },
  knownUsers: [...DEMO_USERS]
};

const el = {
  newAccountForm: document.getElementById('newAccountForm'),
  newAccountName: document.getElementById('newAccountName'),
  newAccountIndustry: document.getElementById('newAccountIndustry'),
  newAccountCity: document.getElementById('newAccountCity'),
  newAccountState: document.getElementById('newAccountState'),
  newAccountAnnual: document.getElementById('newAccountAnnual'),
  newAccountProjected: document.getElementById('newAccountProjected'),
  newAccountEntrenchment: document.getElementById('newAccountEntrenchment'),
  newAccountStage: document.getElementById('newAccountStage'),
  newAccountRelationship: document.getElementById('newAccountRelationship'),
  newAccountOwner: document.getElementById('newAccountOwner'),
  newAccountNextStep: document.getElementById('newAccountNextStep'),
  newAccountNotes: document.getElementById('newAccountNotes'),
  newAccountStatus: document.getElementById('newAccountStatus'),
  aiAssistAccountBtn: document.getElementById('aiAssistAccountBtn'),
  aiAssistOpportunityBtn: document.getElementById('aiAssistOpportunityBtn'),
  loginView: document.getElementById('loginView'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginError: document.getElementById('loginError'),
  appShell: document.getElementById('appShell'),
  authUser: document.getElementById('authUser'),
  authRole: document.getElementById('authRole'),
  logoutBtn: document.getElementById('logoutBtn'),
  networkStatus: document.getElementById('networkStatus'),
  lastSync: document.getElementById('lastSync'),
  queueStatus: document.getElementById('queueStatus'),
  accountSearch: document.getElementById('accountSearch'),
  voiceLookupBtn: document.getElementById('voiceLookupBtn'),
  filterStage: document.getElementById('filterStage'),
  filterIndustry: document.getElementById('filterIndustry'),
  applyAccountFilters: document.getElementById('applyAccountFilters'),
  resetAccountFilters: document.getElementById('resetAccountFilters'),
  refreshBtn: document.getElementById('refreshBtn'),
  accountList: document.getElementById('accountList'),
  accountCount: document.getElementById('accountCount'),
  stageSelect: document.getElementById('stageSelect'),
  stageNextSelect: document.getElementById('stageNextSelect'),
  stageNotes: document.getElementById('stageNotes'),
  advanceStageBtn: document.getElementById('advanceStageBtn'),
  stageSaveStatus: document.getElementById('stageSaveStatus'),
  accountOwnerSelect: document.getElementById('accountOwnerSelect'),
  accountUpdatedBy: document.getElementById('accountUpdatedBy'),
  accountUpdatedAt: document.getElementById('accountUpdatedAt'),
  activityForm: document.getElementById('activityForm'),
  activityAccount: document.getElementById('activityAccount'),
  activityContact: document.getElementById('activityContact'),
  activityOpportunity: document.getElementById('activityOpportunity'),
  activityContactName: document.getElementById('activityContactName'),
  activityType: document.getElementById('activityType'),
  activityChannel: document.getElementById('activityChannel'),
  activitySubject: document.getElementById('activitySubject'),
  activityNotes: document.getElementById('activityNotes'),
  activityTags: document.getElementById('activityTags'),
  activityNextFollowUp: document.getElementById('activityNextFollowUp'),
  activityOutcome: document.getElementById('activityOutcome'),
  activitySentiment: document.getElementById('activitySentiment'),
  sentimentValue: document.getElementById('sentimentValue'),
  activityDuration: document.getElementById('activityDuration'),
  activityAttachments: document.getElementById('activityAttachments'),
  activityStatus: document.getElementById('activityStatus'),
  activityList: document.getElementById('activityList'),
  activityCount: document.getElementById('activityCount'),
  accountActivityChart: document.getElementById('accountActivityChart'),
  relationshipMap: document.getElementById('relationshipMap'),
  accountOpportunitiesList: document.getElementById('accountOpportunitiesList'),
  accountOpportunityCount: document.getElementById('accountOpportunityCount'),
  projectOpportunitiesList: document.getElementById('projectOpportunitiesList'),
  projectFilterAll: document.getElementById('projectFilterAll'),
  projectFilterActive: document.getElementById('projectFilterActive'),
  projectFilterWon: document.getElementById('projectFilterWon'),
  opportunityForm: document.getElementById('opportunityForm'),
  opportunityType: document.getElementById('opportunityType'),
  opportunityDescription: document.getElementById('opportunityDescription'),
  opportunityContact: document.getElementById('opportunityContact'),
  opportunityContactName: document.getElementById('opportunityContactName'),
  opportunityNotes: document.getElementById('opportunityNotes'),
  opportunityValue: document.getElementById('opportunityValue'),
  opportunityStage: document.getElementById('opportunityStage'),
  opportunityStatus: document.getElementById('opportunityStatus'),
  projectFields: document.getElementById('projectFields'),
  projectName: document.getElementById('projectName'),
  projectEstimator: document.getElementById('projectEstimator'),
  projectStage: document.getElementById('projectStage'),
  projectBidStatus: document.getElementById('projectBidStatus'),
  projectBidDue: document.getElementById('projectBidDue'),
  projectBudgetary: document.getElementById('projectBudgetary'),
  projectGcList: document.getElementById('projectGcList'),
  projectAddress: document.getElementById('projectAddress'),
  projectCity: document.getElementById('projectCity'),
  projectState: document.getElementById('projectState'),
  projectLat: document.getElementById('projectLat'),
  projectLng: document.getElementById('projectLng'),
  projectAccuracy: document.getElementById('projectAccuracy'),
  useAccountLocationBtn: document.getElementById('useAccountLocationBtn'),
  useCurrentLocationBtn: document.getElementById('useCurrentLocationBtn'),
  generateWeeklyBtn: document.getElementById('generateWeeklyBtn'),
  copyWeeklySummary: document.getElementById('copyWeeklySummary'),
  weeklySummaryCsvBtn: document.getElementById('weeklySummaryCsvBtn'),
  weeklySummaryText: document.getElementById('weeklySummaryText'),
  weeklySummaryStatus: document.getElementById('weeklySummaryStatus'),
  exportPipeline: document.getElementById('exportPipeline'),
  exportMovement: document.getElementById('exportMovement'),
  exportOpportunities: document.getElementById('exportOpportunities'),
  exportActivities: document.getElementById('exportActivities'),
  exportWeekly: document.getElementById('exportWeekly'),
  exportAll: document.getElementById('exportAll'),
  exportPdf: document.getElementById('exportPdf'),
  exportType: document.getElementById('exportType'),
  exportStart: document.getElementById('exportStart'),
  exportEnd: document.getElementById('exportEnd'),
  exportCsv: document.getElementById('exportCsv'),
  selectedAccountName: document.getElementById('selectedAccountName'),
  selectedAccountMeta: document.getElementById('selectedAccountMeta'),
  selectedAccountHealth: document.getElementById('selectedAccountHealth'),
  selectedAccountValue: document.getElementById('selectedAccountValue'),
  summaryStage: document.getElementById('summaryStage'),
  summaryScore: document.getElementById('summaryScore'),
  summaryAnnualPotential: document.getElementById('summaryAnnualPotential'),
  summaryProjectedValue: document.getElementById('summaryProjectedValue'),
  summaryEntrenchment: document.getElementById('summaryEntrenchment'),
  summaryLastContact: document.getElementById('summaryLastContact'),
  summaryRelationship: document.getElementById('summaryRelationship'),
  summaryCity: document.getElementById('summaryCity'),
  summaryState: document.getElementById('summaryState'),
  summaryKeyContacts: document.getElementById('summaryKeyContacts'),
  summaryNextSteps: document.getElementById('summaryNextSteps'),
  summaryOpportunity: document.getElementById('summaryOpportunity'),
  summaryAiInsights: document.getElementById('summaryAiInsights'),
  stalledBadge: document.getElementById('stalledBadge'),
  summaryOwner: document.getElementById('summaryOwner'),
  summaryUpdatedBy: document.getElementById('summaryUpdatedBy'),
  movementTimeline: document.getElementById('movementTimeline'),
  aiDrawer: document.getElementById('aiDrawer'),
  openAiAssist: document.getElementById('openAiAssist'),
  closeAiAssist: document.getElementById('closeAiAssist'),
  aiTargetSelect: document.getElementById('aiTargetSelect'),
  dictateRecord: document.getElementById('dictateRecord'),
  dictateStop: document.getElementById('dictateStop'),
  dictateTranscribe: document.getElementById('dictateTranscribe'),
  dictateExtract: document.getElementById('dictateExtract'),
  dictateAutofill: document.getElementById('dictateAutofill'),
  dictateApplyNotes: document.getElementById('dictateApplyNotes'),
  dictateReject: document.getElementById('dictateReject'),
  aiTranscript: document.getElementById('aiTranscript'),
  dictationStatus: document.getElementById('dictationStatus'),
  aiExtractionStatus: document.getElementById('aiExtractionStatus'),
  aiStructuredPreview: document.getElementById('aiStructuredPreview'),
  aiConfidenceBadge: document.getElementById('aiConfidenceBadge'),
  prepBriefingBtn: document.getElementById('prepBriefingBtn'),
  briefingModal: document.getElementById('briefingModal'),
  briefingTitle: document.getElementById('briefingTitle'),
  briefingStatus: document.getElementById('briefingStatus'),
  briefingContent: document.getElementById('briefingContent'),
  briefingOverview: document.getElementById('briefingOverview'),
  briefingInternal: document.getElementById('briefingInternal'),
  briefingExternal: document.getElementById('briefingExternal'),
  briefingTalkingPoints: document.getElementById('briefingTalkingPoints'),
  briefingNextSteps: document.getElementById('briefingNextSteps'),
  briefingEmail: document.getElementById('briefingEmail'),
  closeBriefingBtn: document.getElementById('closeBriefingBtn'),
  copyBriefingBtn: document.getElementById('copyBriefingBtn'),
  toastContainer: document.getElementById('toastContainer')
};

const tabButtons = Array.from(document.querySelectorAll('.tab-btn'));
const tabPanels = {
  activityTab: document.getElementById('activityTab'),
  relationshipTab: document.getElementById('relationshipTab'),
  opportunitiesTab: document.getElementById('opportunitiesTab'),
  weeklyTab: document.getElementById('weeklyTab')
};

const db = new Dexie(DB_NAME);
db.version(DB_VERSION)
  .stores(STORE_SCHEMA)
  .upgrade((tx) =>
    Promise.all([
      tx
        .table('enterpriseAccounts')
        .toCollection()
        .modify((account) => {
          let changed = false;
          if (!account.ownerId) {
            account.ownerId = account.userId;
            changed = true;
          }
          if (!account.ownerName) {
            account.ownerName = 'Unassigned';
            changed = true;
          }
          if (!account.updatedById) {
            account.updatedById = account.userId;
            changed = true;
          }
          if (!account.updatedByName) {
            account.updatedByName = account.ownerName || 'Unknown';
            changed = true;
          }
          if (account.city == null) {
            account.city = '';
            changed = true;
          }
          if (account.state == null) {
            account.state = '';
            changed = true;
          }
          if (changed) account.updatedAt = account.updatedAt || new Date().toISOString();
        }),
      tx
        .table('opportunities')
        .toCollection()
        .modify((opp) => {
          opp.type = opp.type || 'account';
          if (!opp.createdAt) opp.createdAt = new Date().toISOString();
          if (!opp.updatedAt) opp.updatedAt = opp.createdAt;
          if (opp.type === 'project') {
            opp.ecdStageKey = opp.ecdStageKey || '1';
            opp.ecdStageLabel = opp.ecdStageLabel || '1 • Discovery';
            opp.bidStatus = opp.bidStatus || 'discovery';
            opp.gcList = Array.isArray(opp.gcList) ? opp.gcList : (opp.gcList ? [].concat(opp.gcList) : []);
            opp.projectCity = opp.projectCity || '';
            opp.projectState = opp.projectState || '';
            opp.projectAddress = opp.projectAddress || '';
          }
        })
    ])
  );

let activityChartInstance = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;
let refreshTimer = null;
let appListenersAttached = false;

init();

function resolveAuthDisabled() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('authDisabled')) {
    const flag = params.get('authDisabled') === 'true';
    localStorage.setItem('kse_crm_auth_disabled', String(flag));
    return flag;
  }
  const stored = localStorage.getItem('kse_crm_auth_disabled');
  if (stored !== null) return stored === 'true';
  if (typeof window !== 'undefined' && '__CRM_AUTH_DISABLED' in window) {
    return Boolean(window.__CRM_AUTH_DISABLED);
  }
  return DEV_HOSTNAMES.has(window.location.hostname);
}

function buildReportSection(sectionType, range) {
  switch (sectionType) {
    case 'pipeline': {
      const rows = filterAccountsByRange(range);
      const totalValue = rows.reduce((sum, acc) => sum + (Number(acc.projectedValue) || Number(acc.annualPotential) || 0), 0);
      return `
        <div class="section">
          <h2>Enterprise Pipeline</h2>
          <div class="summary-row"><span>${rows.length} accounts</span><span>Total Value: ${formatCurrency(totalValue)}</span></div>
          <table>
            <thead><tr><th>Account</th><th>Industry</th><th>Stage</th><th>Score</th><th>Location</th><th class="num">Value</th><th>Owner</th><th>Updated</th></tr></thead>
            <tbody>${rows.map((acc) => `<tr>
              <td class="primary">${escapeHtml(acc.name)}</td>
              <td>${escapeHtml(acc.industry || '')}</td>
              <td><span class="badge">${escapeHtml(acc.stage || '')}</span></td>
              <td class="num">${acc.score ?? ''}</td>
              <td>${escapeHtml(acc.city || '')}${acc.city && acc.state ? ', ' : ''}${escapeHtml(acc.state || '')}</td>
              <td class="num">${formatCurrency(acc.projectedValue || acc.annualPotential || 0)}</td>
              <td>${escapeHtml(acc.ownerName || '')}</td>
              <td class="date">${formatDateString(acc.updatedAt)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    }
    case 'opportunities': {
      const rows = filterOpportunitiesByRange(range);
      const totalValue = rows.reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
      return `
        <div class="section">
          <h2>Opportunity Tracking</h2>
          <div class="summary-row"><span>${rows.length} opportunities</span><span>Total Value: ${formatCurrency(totalValue)}</span></div>
          <table>
            <thead><tr><th>Type</th><th>Account</th><th>Project / Description</th><th class="num">Value</th><th>Stage</th><th>Bid Status</th><th>Status</th><th>Due</th><th>Estimator</th><th>Updated</th></tr></thead>
            <tbody>${rows.map((opp) => {
              const accountName = state.accounts.find((acc) => acc.id === opp.accountId)?.name || '';
              const stage = opp.type === 'project' ? getProjectStageLabel(opp.ecdStageKey) : opp.stage || '';
              const bid = opp.type === 'project' ? getBidStatusLabel(opp.bidStatus) : '';
              return `<tr>
                <td><span class="badge ${opp.type === 'project' ? 'project' : 'account'}">${opp.type || 'account'}</span></td>
                <td class="primary">${escapeHtml(accountName)}</td>
                <td>${escapeHtml(opp.type === 'project' ? (opp.projectName || opp.description || '') : (opp.description || ''))}</td>
                <td class="num">${formatCurrency(opp.value || 0)}</td>
                <td><span class="badge">${escapeHtml(stage)}</span></td>
                <td>${escapeHtml(bid)}</td>
                <td><span class="badge ${opp.status === 'won' ? 'won' : opp.status === 'lost' ? 'lost' : ''}">${escapeHtml(opp.status || '')}</span></td>
                <td class="date">${opp.type === 'project' ? formatDateString(opp.bidDueDate) : ''}</td>
                <td>${escapeHtml(opp.type === 'project' ? opp.assignedEstimator || '' : '')}</td>
                <td class="date">${formatDateString(opp.updatedAt)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>`;
    }
    case 'movements': {
      const rows = filterMovementsByRange(range);
      return `
        <div class="section">
          <h2>Movement Log</h2>
          <div class="summary-row"><span>${rows.length} movements</span></div>
          <table>
            <thead><tr><th>Date</th><th>Account</th><th>Context</th><th>Type</th><th>From</th><th>To</th><th>By</th></tr></thead>
            <tbody>${rows.map((m) => `<tr>
              <td class="date">${formatDateString(m.date)}</td>
              <td class="primary">${escapeHtml(state.accounts.find((a) => a.id === m.accountId)?.name || '')}</td>
              <td>${escapeHtml(m.context || '')}</td>
              <td>${escapeHtml(m.movementType || '')}</td>
              <td><span class="badge muted">${escapeHtml(m.oldStage || '')}</span></td>
              <td><span class="badge">${escapeHtml(m.newStage || '')}</span></td>
              <td>${escapeHtml(m.userName || '')}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    }
    case 'activities': {
      const rows = filterActivitiesByRange(range);
      return `
        <div class="section">
          <h2>Activity Log</h2>
          <div class="summary-row"><span>${rows.length} activities</span></div>
          <table>
            <thead><tr><th>Date</th><th>Account</th><th>Opportunity</th><th>Contact</th><th>Type</th><th>Channel</th><th>Subject</th><th>By</th></tr></thead>
            <tbody>${rows.map((act) => `<tr>
              <td class="date">${formatDateString(act.date)}</td>
              <td class="primary">${escapeHtml(state.accounts.find((acc) => acc.id === act.accountId)?.name || '')}</td>
              <td>${escapeHtml(state.opportunities.find((o) => o.id === act.opportunityId)?.projectName || state.opportunities.find((o) => o.id === act.opportunityId)?.description || '')}</td>
              <td>${escapeHtml(state.contacts.find((c) => c.id === act.contactId)?.name || act.contactName || '')}</td>
              <td>${escapeHtml(act.type || '')}</td>
              <td>${escapeHtml(act.channel || '')}</td>
              <td>${escapeHtml(act.subject || '')}</td>
              <td>${escapeHtml(act.userName || '')}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    }
    default:
      return '';
  }
}

function buildPrintableReport(type, range) {
  const typeLabels = { pipeline: 'Enterprise Pipeline', movements: 'Movement Log', opportunities: 'Opportunity Tracking', activities: 'Activity Log', all: 'Full ECD Report' };
  const title = typeLabels[type] || 'ECD Export';
  const rangeText = `${el.exportStart?.value || ''} to ${el.exportEnd?.value || ''}`;
  const now = new Date().toLocaleString();

  let contentHtml = '';
  if (type === 'all') {
    contentHtml = ['pipeline', 'opportunities', 'movements', 'activities'].map((t) => buildReportSection(t, range)).join('');
  } else {
    const sectionHtml = buildReportSection(type, range);
    if (!sectionHtml) return null;
    contentHtml = sectionHtml;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #00458c; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #00458c; }
    .header .meta { text-align: right; font-size: 10px; color: #64748b; }
    .section { margin-bottom: 32px; page-break-inside: avoid; }
    .section h2 { font-size: 16px; font-weight: 700; color: #00458c; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; }
    .summary-row { display: flex; justify-content: space-between; background: #f1f5f9; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-weight: 600; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
    thead { background: #00458c; color: #fff; }
    th { padding: 10px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
    th.num { text-align: right; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.date { white-space: nowrap; color: #64748b; }
    td.primary { font-weight: 600; color: #0f172a; }
    tr:nth-child(even) { background: #f8fafc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 9px; font-weight: 600; background: #e0f2fe; color: #0369a1; }
    .badge.muted { background: #f1f5f9; color: #64748b; }
    .badge.project { background: #dbeafe; color: #1d4ed8; }
    .badge.account { background: #f0fdf4; color: #15803d; }
    .badge.won { background: #dcfce7; color: #166534; }
    .badge.lost { background: #fee2e2; color: #b91c1c; }
    @media print {
      body { padding: 0; }
      .header { page-break-after: avoid; }
      .section { page-break-before: auto; }
      .section h2 { page-break-after: avoid; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div>Range: ${escapeHtml(rangeText)}</div>
      <div>Generated: ${escapeHtml(now)}</div>
    </div>
  </div>
  ${contentHtml}
  <script>window.onload = () => { window.print(); };<\/script>
</body>
</html>`;
}

async function exportPdfByType(type, range) {
  const html = buildPrintableReport(type, range);
  if (!html) {
    toast('Select an export type', 'warning');
    return;
  }
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    toast('Popup blocked – allow popups and try again', 'warning');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  toast('Print dialog opened – save as PDF', 'info');
}

function resolveApiHost() {
  const params = new URLSearchParams(window.location.search);
  const normalized = (value) => (value ? String(value).replace(/\/$/, '') : '');
  if (params.has('apiHost')) {
    const host = normalized(params.get('apiHost'));
    if (host) localStorage.setItem('kse_crm_api_host', host);
    return host || normalized(getGlobalApiHost()) || localStorage.getItem('kse_crm_api_host') || 'http://localhost:4000';
  }
  const globalHost = normalized(getGlobalApiHost());
  if (globalHost) return globalHost;
  const stored = localStorage.getItem('kse_crm_api_host');
  if (stored) return stored;
  if (DEV_HOSTNAMES.has(window.location.hostname)) return 'http://localhost:4000';
  // If the current origin is an old/non-resolving server hostname, fall back to the known production API host.
  const origin = normalized(window.location.origin);
  if (origin.includes('kse-tools-server-production.up.railway.app')) return PROD_API_HOST;
  return origin || PROD_API_HOST;
}

function getGlobalApiHost() {
  if (typeof window === 'undefined') return '';
  if ('__CRM_API_HOST' in window && window.__CRM_API_HOST) return window.__CRM_API_HOST;
  return '';
}

function init() {
  attachGlobalListeners();
  updateAiConfidenceBadge(null);
  setAiTarget(state.aiTarget);
setNetworkStatus();
  if (AUTH_DISABLED) {
    const dummySession = {
      user: { id: 'dev-user', email: 'dev@example.com', name: 'Dev User', role: 'admin' },
      tokens: { accessToken: '', refreshToken: '', expiresIn: 60 * 60 * 24 }
    };
    setSession(dummySession);
    showAppShell();
    ensureAppEventListeners();
    bootstrapAfterAuth();
    return;
  }
  window.addEventListener('online', () => {
setNetworkStatus();
    if (!state.session) return;
    flushQueue();
    syncFromServer();
  });
window.addEventListener('offline', setNetworkStatus);
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'crm-sync') flushQueue();
    });
  }
  const cached = loadSessionFromStorage();
  if (cached) {
    resumeSession(cached).catch(() => {
      clearPersistedSession();
      showLoginView();
    });
  } else {
    showLoginView();
  }
}

function attachGlobalListeners() {
  if (el.loginForm) {
    el.loginForm.addEventListener('submit', handleLoginSubmit);
  }
  if (el.logoutBtn) {
    el.logoutBtn.addEventListener('click', handleLogout);
  }
  if (el.newAccountForm) {
    el.newAccountForm.addEventListener('submit', handleNewAccountSubmit);
  }
  if (el.openAiAssist) el.openAiAssist.addEventListener('click', () => openAiDrawer('activity'));
  if (el.aiAssistAccountBtn) el.aiAssistAccountBtn.addEventListener('click', () => openAiDrawer('account'));
  if (el.aiAssistOpportunityBtn) el.aiAssistOpportunityBtn.addEventListener('click', () => openAiDrawer('opportunity'));
  if (el.closeAiAssist) el.closeAiAssist.addEventListener('click', closeAiDrawer);
  if (el.aiTargetSelect) el.aiTargetSelect.addEventListener('change', (e) => setAiTarget(e.target.value));
  if (el.dictateApplyNotes) el.dictateApplyNotes.addEventListener('click', applyExtractionNotesOnly);
  if (el.dictateReject) el.dictateReject.addEventListener('click', rejectAiExtraction);
  if (el.voiceLookupBtn) el.voiceLookupBtn.addEventListener('click', quickVoiceLookup);
  if (el.prepBriefingBtn) el.prepBriefingBtn.addEventListener('click', openBriefingModal);
  if (el.closeBriefingBtn) el.closeBriefingBtn.addEventListener('click', closeBriefingModal);
  if (el.copyBriefingBtn) el.copyBriefingBtn.addEventListener('click', copyBriefingToClipboard);
}

function showLoginView(message = '') {
  if (el.loginError) el.loginError.textContent = message;
  if (el.loginView) el.loginView.classList.remove('hidden');
  if (el.appShell) el.appShell.classList.add('hidden');
}

function showAppShell() {
  if (el.loginView) el.loginView.classList.add('hidden');
  if (el.appShell) el.appShell.classList.remove('hidden');
}

function setSession(session) {
  state.session = session;
  if (session?.user) {
    upsertKnownUser(session.user);
    db.users.put({ ...session.user, createdAt: session.user.createdAt || new Date().toISOString(), lastLoginAt: new Date().toISOString() }).catch(() => {});
  }
  persistSession(session);
  updateAuthHeader();
  scheduleTokenRefresh(session.tokens.expiresIn);
}

function persistSession(session) {
  localStorage.setItem('kse_crm_session', JSON.stringify(session));
}

function loadSessionFromStorage() {
  try {
    const raw = localStorage.getItem('kse_crm_session');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPersistedSession() {
  localStorage.removeItem('kse_crm_session');
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!el.loginEmail || !el.loginPassword) return;
  const email = el.loginEmail.value.trim().toLowerCase();
  const password = el.loginPassword.value;
  if (!email || !password) {
    if (el.loginError) el.loginError.textContent = 'Enter email and password.';
    return;
  }
  try {
    const res = await fetch(AUTH_ROUTES.login, {
    method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'Invalid credentials');
    }
    const data = await res.json();
    setSession({ user: data.user, tokens: data.tokens });
    el.loginForm.reset();
    showAppShell();
    await resumeSession(state.session);
  } catch (err) {
    if (el.loginError) el.loginError.textContent = err.message || 'Login failed';
  }
}

async function resumeSession(session) {
  state.session = session;
  updateAuthHeader();
  showAppShell();
  ensureAppEventListeners();
  await verifySession(session);
  await bootstrapAfterAuth();
}

async function verifySession(session) {
  try {
    const res = await fetch(AUTH_ROUTES.me, {
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` }
    });
    if (!res.ok) throw new Error('Session expired');
    const data = await res.json();
    if (data?.user) {
      session.user = data.user;
      setSession(session);
    }
  } catch (err) {
    clearPersistedSession();
    state.session = null;
    showLoginView(err.message || 'Session expired');
    throw err;
  }
}

async function refreshAccessToken() {
  if (!state.session?.tokens?.refreshToken) return;
  try {
    const res = await fetch(AUTH_ROUTES.refresh, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.session.tokens.refreshToken })
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    setSession({ user: state.session.user, tokens: data.tokens });
  } catch (err) {
    console.warn('Token refresh failed', err);
    await handleLogout();
  }
}

function scheduleTokenRefresh(expiresInSeconds) {
  if (refreshTimer) clearTimeout(refreshTimer);
  const refreshMs = Math.max(10_000, (expiresInSeconds - 60) * 1000);
  refreshTimer = setTimeout(refreshAccessToken, refreshMs);
}

async function handleLogout() {
  state.session = null;
  clearPersistedSession();
  if (refreshTimer) clearTimeout(refreshTimer);
  await clearAllStores();
  closeAiDrawer();
  showLoginView();
  toast('Logged out', 'info');
}

function getAuthHeaders(headers = {}) {
  if (!state.session?.tokens?.accessToken) return headers;
  return { ...headers, Authorization: `Bearer ${state.session.tokens.accessToken}` };
}

async function bootstrapAfterAuth() {
  await loadKnownUsers();
  populateStageOptions();
  ensureAppEventListeners();
  handleOpportunityTypeChange();
  await bootstrapFromDb();
  await ensureCustomerSeedImported();
  populateAccountSelects();
  renderAccountList();
  if (!selectAccountFromUrl()) selectDefaultAccount();
  refreshOwnerUi(getSelectedAccount());
  updateQueueStatus();
  setActiveTab('activityTab');
  await flushQueue();
  await syncFromServer();
  refreshOwnerUi(getSelectedAccount());
}

async function clearAllStores() {
  await Promise.all(
    db.tables.map((table) => table.clear().catch(() => {}))
  );
  state.accounts = [];
  state.contacts = [];
  state.activities = [];
  state.movements = [];
  state.opportunities = [];
  state.selectedAccountId = null;
  state.stalledAccountIds = new Set();
  state.queueLength = 0;
  state.queueState = 'idle';
  updateQueueStatus();
}

async function loadKnownUsers() {
  try {
    const stored = await db.users.toArray();
    const map = new Map();
    [...DEMO_USERS, ...stored].forEach((user) => {
      if (user?.id) map.set(user.id, user);
    });
    if (state.session?.user?.id) map.set(state.session.user.id, state.session.user);
    state.knownUsers = Array.from(map.values());
  } catch (err) {
    console.warn('Failed to load known users', err);
    state.knownUsers = [...DEMO_USERS];
  }
  populateNewAccountOwnerSelect();
}

async function ensureCustomerSeedImported() {
  if (!state.session?.user?.id) return;
  const userId = state.session.user.id;
  const seedFlagKey = `${CUSTOMER_SEED_FLAG}_${userId}`;
  if (localStorage.getItem(seedFlagKey)) return;
  const existingCount = await db.enterpriseAccounts.where('userId').equals(userId).count();
  if (existingCount > 0) return;
  try {
    const res = await fetch('data/customer-strategy-seed.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Seed fetch failed');
    const seeds = await res.json();
    if (!Array.isArray(seeds) || !seeds.length) return;
    const inserted = await insertSeedAccounts(seeds);
    if (inserted) {
      localStorage.setItem(seedFlagKey, 'true');
      toast(`Imported ${inserted} accounts from Customer Strategy`, 'success');
    }
  } catch (err) {
    console.warn('Seed import failed', err);
  }
}

async function insertSeedAccounts(seeds) {
  if (!state.session?.user?.id) return 0;
  const userId = state.session.user.id;
  const currentUser = getCurrentUserMeta();
  const timestamp = new Date().toISOString();
  const prepared = seeds
    .filter((seed) => seed?.name)
    .map((seed) => {
      const ownerMeta = buildOwnerMeta(seed.accountOwner || seed.huntingOwner || 'Unassigned');
      upsertKnownUser(ownerMeta);
      return {
        id: uuid(),
        userId,
        name: seed.name,
        industry: seed.industry || '',
        annualPotential: Number(seed.annualPotential) || 0,
        projectedValue: Number(seed.projectedValue) || 0,
        entrenchment: '',
        stage: '',
        relationshipHealth: '',
        nextStep: seed.nextStep || '',
        notes: seed.notes || '',
        lastContact: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        stalled: false,
        ownerId: ownerMeta.id,
        ownerName: ownerMeta.name,
        ownerEmail: ownerMeta.email || '',
        createdById: currentUser.id,
        createdByName: currentUser.name,
        updatedById: currentUser.id,
        updatedByName: currentUser.name,
        city: seed.city || '',
        state: seed.state || '',
        source: 'customer-strategy'
      };
    });
  if (!prepared.length) return 0;
  await db.enterpriseAccounts.bulkPut(prepared);
  state.accounts = hydrateAccounts([...state.accounts, ...prepared]);
  return prepared.length;
}

function ensureAppEventListeners() {
  if (appListenersAttached) return;
  appListenersAttached = true;
  if (el.accountSearch) {
    el.accountSearch.addEventListener('input', (e) => {
      state.filters.search = e.target.value.toLowerCase();
      renderAccountList();
    });
  }
  if (el.applyAccountFilters) {
    el.applyAccountFilters.addEventListener('click', () => {
      state.filters.stage = el.filterStage?.value || '';
      state.filters.industry = (el.filterIndustry?.value || '').toLowerCase();
      renderAccountList();
    });
  }
  if (el.resetAccountFilters) {
    el.resetAccountFilters.addEventListener('click', () => {
      state.filters = { search: '', stage: '', industry: '' };
      if (el.accountSearch) el.accountSearch.value = '';
      if (el.filterStage) el.filterStage.value = '';
      if (el.filterIndustry) el.filterIndustry.value = '';
      renderAccountList();
    });
  }
  if (el.refreshBtn) el.refreshBtn.addEventListener('click', () => syncFromServer());
  if (el.accountList) {
    el.accountList.addEventListener('click', (event) => {
      const row = event.target.closest('[data-account-id]');
      if (row) selectAccount(row.dataset.accountId);
    });
  }
  if (el.stageSelect && el.stageNextSelect) {
    el.stageSelect.addEventListener('change', () => {
      if (!el.stageNextSelect.value) el.stageNextSelect.value = el.stageSelect.value;
    });
  }
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });
  if (el.activityForm) el.activityForm.addEventListener('submit', handleActivitySubmit);
  if (el.activityAccount) el.activityAccount.addEventListener('change', (e) => {
    populateActivityContacts(e.target.value);
    populateActivityOpportunities(e.target.value);
  });
  if (el.activityContact) {
    el.activityContact.addEventListener('change', () => {
      const contact = state.contacts.find((c) => c.id === el.activityContact.value);
      if (el.activityContactName) el.activityContactName.value = contact?.name || '';
    });
  }
  if (el.activitySentiment && el.sentimentValue) {
    el.activitySentiment.addEventListener('input', () => {
      el.sentimentValue.textContent = `(${el.activitySentiment.value})`;
    });
  }
  if (el.advanceStageBtn) el.advanceStageBtn.addEventListener('click', handleAdvanceStage);
  if (el.accountOwnerSelect) el.accountOwnerSelect.addEventListener('change', handleAccountOwnerChange);
  if (el.opportunityForm) el.opportunityForm.addEventListener('submit', handleOpportunitySubmit);
  if (el.opportunityType) el.opportunityType.addEventListener('change', handleOpportunityTypeChange);
  if (el.useAccountLocationBtn) el.useAccountLocationBtn.addEventListener('click', handleUseAccountLocation);
  if (el.useCurrentLocationBtn) el.useCurrentLocationBtn.addEventListener('click', handleUseCurrentLocation);
  if (el.projectFilterAll) el.projectFilterAll.addEventListener('click', () => setProjectFilter('all'));
  if (el.projectFilterActive) el.projectFilterActive.addEventListener('click', () => setProjectFilter('active'));
  if (el.projectFilterWon) el.projectFilterWon.addEventListener('click', () => setProjectFilter('won'));
  if (el.opportunityContact) {
    el.opportunityContact.addEventListener('change', () => {
      const contact = state.contacts.find((c) => c.id === el.opportunityContact.value);
      if (el.opportunityContactName) el.opportunityContactName.value = contact?.name || '';
    });
  }
  if (el.accountOpportunitiesList) {
    el.accountOpportunitiesList.addEventListener('change', handleOpportunityFieldChange);
    el.accountOpportunitiesList.addEventListener('input', handleOpportunityFieldChange);
  }
  if (el.projectOpportunitiesList) {
    el.projectOpportunitiesList.addEventListener('change', handleProjectOpportunityChange);
    el.projectOpportunitiesList.addEventListener('input', handleProjectOpportunityChange);
    el.projectOpportunitiesList.addEventListener('click', handleProjectOpportunityClick);
  }
  if (el.generateWeeklyBtn) el.generateWeeklyBtn.addEventListener('click', generateWeeklySummary);
  if (el.copyWeeklySummary) el.copyWeeklySummary.addEventListener('click', copyWeeklySummaryToClipboard);
  if (el.weeklySummaryCsvBtn) el.weeklySummaryCsvBtn.addEventListener('click', downloadWeeklySummaryCsv);
  // Unified export controls (date range required)
  if (el.exportCsv) el.exportCsv.addEventListener('click', () => handleExport('csv'));
  if (el.exportPdf) el.exportPdf.addEventListener('click', () => handleExport('pdf'));
  if (el.dictateRecord) el.dictateRecord.addEventListener('click', startRecording);
  if (el.dictateStop) el.dictateStop.addEventListener('click', stopRecording);
  if (el.dictateTranscribe) el.dictateTranscribe.addEventListener('click', handleTranscriptionRequest);
  if (el.dictateExtract) el.dictateExtract.addEventListener('click', handleExtractionRequest);
  if (el.dictateAutofill) el.dictateAutofill.addEventListener('click', applyAiToContext);
}

function setNetworkStatus() {
  if (el.networkStatus) el.networkStatus.textContent = navigator.onLine ? 'online' : 'offline';
}

function updateAuthHeader() {
  if (!state.session?.user) return;
  if (el.authUser) el.authUser.textContent = state.session.user.name || state.session.user.email;
  if (el.authRole) el.authRole.textContent = state.session.user.role || 'standard';
}

function setActiveTab(tabId) {
  tabButtons.forEach((btn) => {
    if (btn.dataset.tab === tabId) btn.classList.add('bg-brand/20', 'text-brand', 'font-semibold');
    else btn.classList.remove('bg-brand/20', 'text-brand', 'font-semibold');
  });
  Object.entries(tabPanels).forEach(([id, panel]) => {
    if (!panel) return;
    panel.classList.toggle('hidden', id !== tabId);
  });
}

function populateStageOptions() {
  if (el.filterStage) {
    el.filterStage.innerHTML = '<option value="">All stages</option>' + ECD_STAGES.map((stage) => `<option value="${stage}">${stage}</option>`).join('');
  }
  const options = ECD_STAGES.map((stage) => `<option value="${stage}">${stage}</option>`).join('');
  if (el.stageSelect) el.stageSelect.innerHTML = options;
  if (el.stageNextSelect) el.stageNextSelect.innerHTML = options;
  if (el.newAccountStage) el.newAccountStage.innerHTML = options;
  if (el.projectStage) {
    el.projectStage.innerHTML = PROJECT_ECD_STAGES.map((stage) => `<option value="${stage.key}">${stage.label}</option>`).join('');
  }
  if (el.projectBidStatus) {
    el.projectBidStatus.innerHTML = PROJECT_BID_STATUSES.map((status) => `<option value="${status.value}">${status.label}</option>`).join('');
  }
}

function upsertKnownUser(user) {
  if (!user?.id) return;
  const idx = state.knownUsers.findIndex((entry) => entry.id === user.id);
  if (idx >= 0) {
    state.knownUsers[idx] = { ...state.knownUsers[idx], ...user };
  } else {
    state.knownUsers.push({ ...user });
  }
  populateNewAccountOwnerSelect();
}

function getOwnerCandidates() {
  const map = new Map();
  [...DEMO_USERS, ...state.knownUsers].forEach((user) => {
    if (user?.id) map.set(user.id, user);
  });
  if (state.session?.user?.id) map.set(state.session.user.id, state.session.user);
  state.accounts.forEach((acc) => {
    if (acc.ownerId && !map.has(acc.ownerId)) {
      map.set(acc.ownerId, { id: acc.ownerId, name: acc.ownerName || acc.ownerEmail || 'Owner', email: acc.ownerEmail || '' });
    }
  });
  return Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function populateNewAccountOwnerSelect() {
  if (!el.newAccountOwner) return;
  const owners = getOwnerCandidates();
  const currentValue = el.newAccountOwner.value;
  el.newAccountOwner.innerHTML = owners.map((user) => `<option value="${user.id}">${escapeHtml(user.name || user.email || user.id)}</option>`).join('');
  const defaultOwner = currentValue || state.session?.user?.id || owners[0]?.id || '';
  if (defaultOwner) el.newAccountOwner.value = defaultOwner;
}

function populateAccountOwnerSelect(account) {
  if (!el.accountOwnerSelect) return;
  const owners = getOwnerCandidates();
  const options = ['<option value="">Unassigned</option>', ...owners.map((user) => `<option value="${user.id}">${escapeHtml(user.name || user.email || user.id)}</option>`)];
  el.accountOwnerSelect.innerHTML = options.join('');
  el.accountOwnerSelect.disabled = !account;
  if (account?.ownerId) el.accountOwnerSelect.value = account.ownerId;
  else el.accountOwnerSelect.value = '';
  updateAccountAuditMeta(account);
}

function refreshOwnerUi(account) {
  populateNewAccountOwnerSelect();
  populateAccountOwnerSelect(account);
}

async function handleAccountOwnerChange(event) {
  const account = getSelectedAccount();
  if (!account) {
    toast('Select an account first.', 'warning');
    if (event?.target) event.target.value = '';
    return;
  }
  const ownerId = event.target.value;
  const currentOwner = account.ownerId || '';
  if ((ownerId || '') === currentOwner) return;
  if (ownerId) {
    const ownerMeta = getUserMetaById(ownerId) || { id: ownerId, name: 'Owner', email: '' };
    account.ownerId = ownerMeta.id;
    account.ownerName = ownerMeta.name || ownerMeta.email || 'Owner';
    account.ownerEmail = ownerMeta.email || '';
  } else {
    account.ownerId = null;
    account.ownerName = 'Unassigned';
    account.ownerEmail = '';
  }
  await persistAccount(account);
  renderSummaryPanel(account);
  updateAccountAuditMeta(account);
  renderAccountList();
  toast(`Owner set to ${account.ownerName}`, 'success');
}

function updateAccountAuditMeta(account) {
  if (el.accountUpdatedBy) el.accountUpdatedBy.textContent = account?.updatedByName || '-';
  if (el.accountUpdatedAt) el.accountUpdatedAt.textContent = account?.updatedAt ? formatDateTime(account.updatedAt) : '-';
}

function populateAccountSelects() {
  if (!el.activityAccount) return;
  el.activityAccount.innerHTML = state.accounts
    .map((acc) => `<option value="${acc.id}">${escapeHtml(acc.name)}</option>`)
    .join('');
  if (state.selectedAccountId) el.activityAccount.value = state.selectedAccountId;
  populateActivityContacts(el.activityAccount.value);
  populateActivityOpportunities(el.activityAccount.value);
  populateOpportunityContacts(el.activityAccount.value);
}

function populateActivityContacts(accountId) {
  if (!el.activityContact) return;
  const options = state.contacts.filter((c) => !accountId || c.accountId === accountId);
  const opts = ['<option value="">No contact</option>', ...options.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.role || '')}</option>`)];
  el.activityContact.innerHTML = opts.join('');
  // Default the contact name input to the selected contact, if any.
  if (el.activityContactName) {
    const selected = state.contacts.find((c) => c.id === el.activityContact.value);
    el.activityContactName.value = selected?.name || '';
  }
}

function populateOpportunityContacts(accountId) {
  if (!el.opportunityContact) return;
  const options = state.contacts.filter((c) => !accountId || c.accountId === accountId);
  const opts = ['<option value="">No contact</option>', ...options.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${escapeHtml(c.role || '')}</option>`)];
  el.opportunityContact.innerHTML = opts.join('');
  // Reset or set freeform name to selected contact.
  if (el.opportunityContactName) {
    const selected = state.contacts.find((c) => c.id === el.opportunityContact.value);
    el.opportunityContactName.value = selected?.name || '';
  }
}

function populateActivityOpportunities(accountId) {
  if (!el.activityOpportunity) return;
  const options = state.opportunities.filter((o) => !accountId || o.accountId === accountId);
  const opts = ['<option value="">No opportunity</option>', ...options.map((o) => `<option value="${o.id}">${escapeHtml(o.projectName || o.description || 'Opportunity')}</option>`)];
  el.activityOpportunity.innerHTML = opts.join('');
}

async function ensureInlineContact(contactName, accountId) {
  if (!contactName || !accountId) return null;
  const normalized = contactName.trim().toLowerCase();
  const existing = state.contacts.find(
    (c) => c.accountId === accountId && (c.name || '').trim().toLowerCase() === normalized
  );
  if (existing) return existing;
  const user = getCurrentUserMeta();
  const now = new Date().toISOString();
  const contact = {
    id: uuid(),
    userId: user.id,
    accountId,
    name: contactName.trim(),
    role: '',
    email: '',
    phone: '',
    createdAt: now,
    updatedAt: now
  };
  await db.contacts.put(contact);
  state.contacts.push(contact);
  await queueOfflineOperation('contact', { action: 'contactUpsert', ...contact });
  populateActivityContacts(accountId);
  populateOpportunityContacts(accountId);
  return contact;
}

function selectAccountFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const accountId = params.get('accountId');
  if (accountId && state.accounts.some((acc) => acc.id === accountId)) {
    selectAccount(accountId);
    return true;
  }
  return false;
}

function selectDefaultAccount() {
  if (state.selectedAccountId && state.accounts.some((acc) => acc.id === state.selectedAccountId)) {
    selectAccount(state.selectedAccountId);
  } else if (state.accounts.length) {
    selectAccount(state.accounts[0].id);
  } else {
    renderSelectedAccount(null);
  }
}

function selectAccount(accountId) {
  state.selectedAccountId = accountId;
  if (el.activityAccount) el.activityAccount.value = accountId || '';
  populateActivityContacts(accountId);
  populateActivityOpportunities(accountId);
  renderSelectedAccount(getSelectedAccount());
  renderAccountList();
}

function getSelectedAccount() {
  return state.accounts.find((acc) => acc.id === state.selectedAccountId) || null;
}

function renderAccountList() {
  if (!el.accountList) return;
  const filtered = state.accounts
    .filter((acc) => {
      const matchesSearch = !state.filters.search || (acc.name || '').toLowerCase().includes(state.filters.search);
      const matchesStage = !state.filters.stage || acc.stage === state.filters.stage;
      const matchesIndustry = !state.filters.industry || (acc.industry || '').toLowerCase().includes(state.filters.industry);
      return matchesSearch && matchesStage && matchesIndustry;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  if (el.accountCount) el.accountCount.textContent = `${filtered.length} accounts`;
  el.accountList.innerHTML = filtered
    .map((acc) => {
      const isSelected = acc.id === state.selectedAccountId;
      const highlightClass = isSelected ? 'bg-kse-blue/10 border border-kse-blue/30 shadow-sm' : 'hover:bg-slate-100';
      const stalled = state.stalledAccountIds.has(acc.id) ? '<span class="ml-2 text-xs text-amber-500 font-semibold">Stalled</span>' : '';
      const location = formatLocation(acc);
      return `
        <button class="w-full text-left px-4 py-3 rounded-2xl transition flex flex-col gap-1 ${highlightClass}" data-account-id="${acc.id}">
          <div class="flex items-center justify-between">
            <span class="font-semibold">${escapeHtml(acc.name)}</span>
            <span class="text-xs text-slate-400">${acc.stage || '-'}</span>
        </div>
          <div class="text-xs text-slate-400 flex justify-between">
            <span>Score ${acc.score ?? '-'}</span>
            <span>${location || ''}</span>
      </div>
          <div class="text-xs text-slate-500 flex justify-between">
            <span>Owner ${escapeHtml(acc.ownerName || 'Unassigned')}</span>
            <span>${formatCurrency(acc.projectedValue || acc.annualPotential)}</span>
          </div>
          <div class="text-xs text-slate-500 flex justify-between">
            <span>Last contact ${formatDateString(acc.lastContact)}</span>
            <span>${stalled || ''}</span>
          </div>
          <div class="text-xs text-slate-500">Updated ${formatDateString(acc.updatedAt)}</div>
        </button>
      `;
    })
    .join('');
}

function renderSelectedAccount(account) {
  if (!account) {
    if (el.selectedAccountName) el.selectedAccountName.textContent = 'Select an Enterprise account';
    if (el.selectedAccountMeta) el.selectedAccountMeta.textContent = '';
    if (el.selectedAccountHealth) el.selectedAccountHealth.textContent = '-';
    if (el.selectedAccountValue) el.selectedAccountValue.textContent = '-';
    populateAccountOwnerSelect(null);
    updateAccountAuditMeta(null);
    renderSummaryPanel(null);
    renderMovementTimeline(null);
    renderActivitySection(null);
    renderRelationshipMap(null);
    renderOpportunitiesSection(null);
    return;
  }
  if (el.selectedAccountName) el.selectedAccountName.textContent = account.name;
  if (el.selectedAccountMeta) {
    const metaParts = [];
    if (account.industry) metaParts.push(account.industry);
    const location = formatLocation(account);
    if (location) metaParts.push(location);
    metaParts.push(`Annual Potential ${formatCurrency(account.annualPotential)}`);
    el.selectedAccountMeta.textContent = metaParts.filter(Boolean).join(' • ');
  }
  if (el.selectedAccountHealth) el.selectedAccountHealth.textContent = account.relationshipHealth || 'Unknown';
  if (el.selectedAccountValue) el.selectedAccountValue.textContent = formatCurrency(account.projectedValue || account.annualPotential);
  if (el.stageSelect) el.stageSelect.value = account.stage || '';
  if (el.stageNextSelect) el.stageNextSelect.value = account.stage || '';
  if (el.stageNotes) el.stageNotes.value = account.nextStep || '';
  populateAccountOwnerSelect(account);
  updateAccountAuditMeta(account);
  renderSummaryPanel(account);
  renderMovementTimeline(account);
  renderActivitySection(account);
  renderRelationshipMap(account);
  renderOpportunitiesSection(account);
  prefillProjectForm(account);
}

function renderSummaryPanel(account) {
  if (!account) {
    if (el.summaryStage) el.summaryStage.textContent = '-';
    if (el.summaryScore) el.summaryScore.textContent = '-';
    if (el.summaryCity) el.summaryCity.textContent = '-';
    if (el.summaryState) el.summaryState.textContent = '-';
    if (el.summaryAnnualPotential) el.summaryAnnualPotential.textContent = '-';
    if (el.summaryProjectedValue) el.summaryProjectedValue.textContent = '-';
    if (el.summaryEntrenchment) el.summaryEntrenchment.textContent = '-';
    if (el.summaryLastContact) el.summaryLastContact.textContent = '-';
    if (el.summaryRelationship) el.summaryRelationship.textContent = '-';
    if (el.summaryOwner) el.summaryOwner.textContent = '-';
    if (el.summaryUpdatedBy) el.summaryUpdatedBy.textContent = '-';
    if (el.summaryOpportunity) el.summaryOpportunity.textContent = '-';
    if (el.summaryAiInsights) el.summaryAiInsights.innerHTML = '';
    if (el.summaryKeyContacts) el.summaryKeyContacts.innerHTML = '';
    if (el.summaryNextSteps) el.summaryNextSteps.innerHTML = '';
    if (el.stalledBadge) el.stalledBadge.textContent = 'Healthy';
    return;
  }
  if (el.summaryStage) el.summaryStage.textContent = account.stage || '-';
  if (el.summaryScore) el.summaryScore.textContent = account.score != null ? account.score : '—';
  if (el.summaryCity) el.summaryCity.textContent = account.city || '—';
  if (el.summaryState) el.summaryState.textContent = account.state || '—';
  if (el.summaryOwner) el.summaryOwner.textContent = account.ownerName || 'Unassigned';
  if (el.summaryUpdatedBy) el.summaryUpdatedBy.textContent = formatUpdatedSummary(account);
  if (el.summaryAnnualPotential) el.summaryAnnualPotential.textContent = formatCurrency(account.annualPotential);
  if (el.summaryProjectedValue) el.summaryProjectedValue.textContent = formatCurrency(account.projectedValue || account.annualPotential);
  if (el.summaryEntrenchment) el.summaryEntrenchment.textContent = account.entrenchment || 'Unknown';
  if (el.summaryLastContact) el.summaryLastContact.textContent = formatDateString(account.lastContact);
  if (el.summaryRelationship) el.summaryRelationship.textContent = account.relationshipHealth || 'Unknown';
  const keyContacts = state.contacts
    .filter((c) => c.accountId === account.id)
    .sort((a, b) => (b.influenceScore || 0) - (a.influenceScore || 0))
    .slice(0, 3);
  if (el.summaryKeyContacts) {
    el.summaryKeyContacts.innerHTML = keyContacts
      .map((c) => `<li class="flex items-center justify-between"><span>${escapeHtml(c.name)} (${escapeHtml(c.role || '')})</span><span class="text-xs text-slate-400">Influence ${c.influenceScore || '-'}</span></li>`)
      .join('');
  }
  const steps = (account.nextStep || '')
    .split(/\n|•|-/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (el.summaryNextSteps) el.summaryNextSteps.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  const stalled = state.stalledAccountIds.has(account.id);
  if (el.stalledBadge) {
    el.stalledBadge.textContent = stalled ? 'Stalled' : 'Healthy';
    el.stalledBadge.className = `text-xs px-3 py-1 rounded-full border ${stalled ? 'border-amber-500 text-amber-300' : 'border-emerald-500 text-emerald-300'}`;
  }
  if (el.summaryOpportunity) {
    const openValue = state.opportunities.filter((opp) => opp.accountId === account.id && opp.status !== 'lost').reduce((sum, opp) => sum + (Number(opp.value) || 0), 0);
    el.summaryOpportunity.textContent = openValue ? `${formatCurrency(openValue)} open` : 'No pipeline';
  }
  if (el.summaryAiInsights) {
    const insights = [];
    if (account.relationshipHealth === 'At Risk') insights.push('Relationship at risk – plan authentic touch');
    if (stalled) insights.push('No recent movement • schedule follow-up');
    el.summaryAiInsights.innerHTML = insights.length ? insights.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('') : '<li>No AI insights yet.</li>';
  }
}

function renderMovementTimeline(account) {
  if (!el.movementTimeline) return;
  if (!account) {
    el.movementTimeline.innerHTML = '<li class="text-slate-500 text-sm">Select an account to see movement history.</li>';
    return;
  }
  const moves = state.movements
    .filter((m) => m.accountId === account.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  if (!moves.length) {
    el.movementTimeline.innerHTML = '<li class="text-slate-500 text-sm">No movement recorded yet.</li>';
    return;
  }
  el.movementTimeline.innerHTML = moves
    .map(
      (move) => `
      <li class="border-l-2 border-brand/30 pl-3">
        <p class="text-xs text-slate-400">${formatDateString(move.date)}</p>
        <p class="text-sm font-semibold">${escapeHtml(formatMovementDescription(move))}</p>
        <p class="text-xs text-slate-400">By ${escapeHtml(move.userName || 'Unknown')}</p>
        <p class="text-xs text-slate-400">${escapeHtml(move.notes || '')}</p>
      </li>`
    )
    .join('');
}

function renderActivitySection(account) {
  renderActivityList(account);
  renderActivityChart(account);
}

function renderActivityList(account) {
  if (!el.activityList) return;
  if (!account) {
    el.activityList.innerHTML = '';
    if (el.activityCount) el.activityCount.textContent = '0 entries';
    return;
  }
  const items = state.activities
    .filter((act) => act.accountId === account.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50);
  if (el.activityCount) el.activityCount.textContent = `${items.length} entries`;
  el.activityList.innerHTML = items
    .map(
      (act) => `
      <li class="py-3">
        <div class="flex items-center justify-between text-sm">
          <span class="font-semibold capitalize text-slate-800">${escapeHtml(act.type || '')}</span>
          <span class="text-xs text-slate-500">${formatDateString(act.date)} via ${escapeHtml(act.channel || '')}</span>
        </div>
        <p class="text-xs text-slate-500">Logged by ${escapeHtml(act.userName || 'Unknown')}</p>
        <p class="text-xs text-slate-500">Contact ${escapeHtml(act.contactName || '') || '—'}</p>
        <p class="text-xs text-slate-500">Opportunity ${escapeHtml(state.opportunities.find((o) => o.id === act.opportunityId)?.projectName || state.opportunities.find((o) => o.id === act.opportunityId)?.description || '') || '—'}</p>
        <p class="text-xs text-slate-500">Next follow-up ${formatDateString(act.nextFollowUp)}</p>
        <p class="text-sm text-slate-700">${escapeHtml(act.subject || 'No subject')}</p>
        <p class="text-xs text-slate-600 whitespace-pre-wrap">${escapeHtml(act.notes || '')}</p>
        <div class="mt-2 flex flex-wrap gap-1 text-[11px]">
          ${(act.tags || []).map((tag) => `<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">${escapeHtml(tag)}</span>`).join('')}
          ${act.aiConfidence != null ? `<span class="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">AI ${(act.aiConfidence * 100).toFixed(0)}%</span>` : ''}
        </div>
      </li>`
    )
    .join('');
}

function renderActivityChart(account) {
  if (!el.accountActivityChart) return;
  if (!account) {
    if (activityChartInstance) {
      activityChartInstance.destroy();
      activityChartInstance = null;
    }
    return;
  }
  const context = el.accountActivityChart.getContext('2d');
  const days = [];
  const counts = [];
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    days.push(key);
    counts.push(0);
  }
  const indexMap = Object.fromEntries(days.map((d, i) => [d, i]));
  state.activities
    .filter((a) => a.accountId === account.id)
    .forEach((act) => {
      const key = (act.date || '').slice(0, 10);
      if (indexMap[key] != null) counts[indexMap[key]] += 1;
    });
  if (activityChartInstance) activityChartInstance.destroy();
  activityChartInstance = new Chart(context, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'Interactions',
          data: counts,
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14,165,233,0.2)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } },
      maintainAspectRatio: false
    }
  });
}

function renderRelationshipMap(account) {
  if (!el.relationshipMap) return;
  if (!account) {
    el.relationshipMap.innerHTML = '<p class="text-sm text-slate-400">Select an account to load relationship map.</p>';
    return;
  }
  const grouped = state.contacts
    .filter((c) => c.accountId === account.id)
    .reduce((acc, contact) => {
      const bucket = normalizeRoleBucket(contact.role);
      acc[bucket] = acc[bucket] || [];
      acc[bucket].push(contact);
      return acc;
    }, {});
  const roles = Object.keys(grouped);
  if (!roles.length) {
    el.relationshipMap.innerHTML = '<p class="text-sm text-slate-400">No contacts on file.</p>';
    return;
  }
  el.relationshipMap.innerHTML = roles
    .map(
      (role) => `
      <div class="rounded-2xl border border-white/5 p-4 bg-slate-950/50">
        <div class="flex items-center justify-between">
          <h4 class="font-semibold">${escapeHtml(role)}</h4>
          <span class="text-xs text-slate-400">${grouped[role].length} contact(s)</span>
        </div>
        <ul class="mt-2 space-y-1 text-sm">
          ${grouped[role]
            .map(
              (c) => `
                <li class="flex items-center justify-between">
                  <span>${escapeHtml(c.name)}</span>
                  <span class="text-xs text-slate-400">Influence ${c.influenceScore || '-'}</span>
                </li>`
            )
            .join('')}
        </ul>
      </div>`
    )
    .join('');
}

function renderOpportunitiesSection(account) {
  if (!account) {
    if (el.accountOpportunitiesList) el.accountOpportunitiesList.innerHTML = '<p class="text-sm text-slate-400">Select an account to manage opportunities.</p>';
    if (el.projectOpportunitiesList) el.projectOpportunitiesList.innerHTML = '<p class="text-sm text-slate-400">Select an account to manage project pursuits.</p>';
    if (el.accountOpportunityCount) el.accountOpportunityCount.textContent = '0 active';
    return;
  }
  const opps = state.opportunities.filter((opp) => opp.accountId === account.id).map(hydrateOpportunity);
  const accountOpps = opps.filter((opp) => opp.type !== 'project');
  const projectOpps = opps.filter((opp) => opp.type === 'project');
  populateOpportunityContacts(account.id);
  renderAccountOpportunities(accountOpps);
  renderProjectOpportunities(account, projectOpps);
}

function renderAccountOpportunities(opps) {
  if (!el.accountOpportunitiesList) return;
  if (el.accountOpportunityCount) el.accountOpportunityCount.textContent = `${opps.length} active`;
  if (!opps.length) {
    el.accountOpportunitiesList.innerHTML = '<p class="text-sm text-slate-500">No account growth opportunities yet.</p>';
    return;
  }
  const stageOptions = ['lead', 'qualified', 'proposal', 'pilot', 'expansion', 'recurring'];
  const statusOptions = ['open', 'won', 'lost', 'declined'];
  el.accountOpportunitiesList.innerHTML = opps
    .map(
      (opp) => `
      <div class="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3" data-opportunity-card="${opp.id}">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--kse-text)]">${escapeHtml(opp.description || 'Untitled opportunity')}</p>
            <p class="text-xs text-slate-500">Created ${formatDateString(opp.createdAt)} • Updated ${formatDateString(opp.updatedAt)}</p>
          </div>
          <span class="text-sm font-semibold text-emerald-600">${formatCurrency(opp.value)}</span>
        </div>
        <div class="grid md:grid-cols-3 gap-3 text-sm">
          <label class="flex flex-col gap-1 text-slate-500">Value
            <input type="number" data-opportunity-id="${opp.id}" data-field="value" value="${opp.value ?? ''}" class="panel-input">
          </label>
          <label class="flex flex-col gap-1 text-slate-500">Stage
            <select data-opportunity-id="${opp.id}" data-field="stage" class="panel-input">
              ${stageOptions.map((stage) => `<option value="${stage}" ${opp.stage === stage ? 'selected' : ''}>${stage}</option>`).join('')}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-slate-500">Status
            <select data-opportunity-id="${opp.id}" data-field="status" class="panel-input">
              ${statusOptions.map((status) => `<option value="${status}" ${opp.status === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="grid md:grid-cols-2 gap-3 text-sm">
          <label class="flex flex-col gap-1 text-slate-500">Primary contact
            <select data-opportunity-id="${opp.id}" data-field="contactId" class="panel-input">
              ${['<option value="">No contact</option>', ...state.contacts.filter((c) => c.accountId === opp.accountId).map((c) => `<option value="${c.id}" ${c.id === opp.contactId ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.role || '')}</option>`)].join('')}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-slate-500">Contact name (freeform)
            <input type="text" data-opportunity-id="${opp.id}" data-field="contactName" value="${escapeHtml(opp.contactName || '')}" class="panel-input" placeholder="Add or override contact name">
          </label>
        </div>
        <div class="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p class="font-semibold text-slate-600 mb-2">Recent activity</p>
          ${renderOpportunityActivityList(opp.id)}
        </div>
      </div>`
    )
    .join('');
}

function renderProjectOpportunities(account, projectOpps) {
  if (!el.projectOpportunitiesList) return;
  const filtered = projectOpps.filter((opp) => {
    if (state.projectFilter === 'all') return true;
    if (state.projectFilter === 'active') return !['won', 'lost', 'declined'].includes(opp.bidStatus) && !['won', 'lost', 'declined'].includes(opp.status);
    if (state.projectFilter === 'won') return opp.bidStatus === 'won' || opp.status === 'won';
    return true;
  });
  updateProjectFilterButtons();
  if (!filtered.length) {
    el.projectOpportunitiesList.innerHTML = '<p class="text-sm text-slate-500">No project pursuits logged yet.</p>';
    return;
  }
  el.projectOpportunitiesList.innerHTML = filtered
    .map((opp) => {
      const stageOptions = PROJECT_ECD_STAGES.map(
        (stage) => `<option value="${stage.key}" ${opp.ecdStageKey === stage.key ? 'selected' : ''}>${stage.label}</option>`
      ).join('');
      const bidOptions = PROJECT_BID_STATUSES.map(
        (status) => `<option value="${status.value}" ${opp.bidStatus === status.value ? 'selected' : ''}>${status.label}</option>`
      ).join('');
      const gcs = opp.gcList?.length ? opp.gcList.join(', ') : '';
      const locationRaw = opp.projectCity || opp.projectState ? `${opp.projectCity || ''}${opp.projectCity && opp.projectState ? ', ' : ''}${opp.projectState || ''}` : (account.city && account.state ? `${account.city}, ${account.state}` : '');
      const locationText = locationRaw || 'Set project location';
      const budgetaryBadge = opp.budgetaryOnly ? '<span class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Budgetary</span>' : '';
      return `
      <div class="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4" data-project-card="${opp.id}">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-semibold text-[var(--kse-text)]">${escapeHtml(opp.projectName || opp.description || 'Project opportunity')}</p>
            <p class="text-xs text-slate-500">${getProjectStageLabel(opp.ecdStageKey)} • ${getBidStatusLabel(opp.bidStatus)}</p>
            <p class="text-xs text-slate-400">${escapeHtml(locationText)}</p>
          </div>
          <div class="text-right">
            <p class="text-sm font-semibold text-emerald-600">${formatCurrency(opp.value)}</p>
            ${budgetaryBadge}
          </div>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs text-slate-500">ECD Stage
            <select data-project-input="ecdStage" data-opportunity-id="${opp.id}" class="panel-input">${stageOptions}</select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-500">Bid Status
            <select data-project-input="bidStatus" data-opportunity-id="${opp.id}" class="panel-input">${bidOptions}</select>
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-500">Bid Due
            <input type="date" data-project-input="bidDueDate" data-opportunity-id="${opp.id}" class="panel-input" value="${opp.bidDueDate || ''}">
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-500">Estimator
            <input type="text" data-project-input="assignedEstimator" data-opportunity-id="${opp.id}" class="panel-input" value="${escapeHtml(opp.assignedEstimator || '')}">
          </label>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs text-slate-500">GC / Partners
            <input type="text" data-project-input="gcList" data-opportunity-id="${opp.id}" class="panel-input" value="${escapeHtml(gcs)}" placeholder="Turner, JE Dunn">
          </label>
          <label class="flex flex-col gap-1 text-xs text-slate-500">Primary contact
            <select data-project-input="contactId" data-opportunity-id="${opp.id}" class="panel-input">
              ${['<option value="">No contact</option>', ...state.contacts.filter((c) => c.accountId === opp.accountId).map((c) => `<option value="${c.id}" ${c.id === opp.contactId ? 'selected' : ''}>${escapeHtml(c.name)} — ${escapeHtml(c.role || '')}</option>`)].join('')}
            </select>
          </label>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-xs text-slate-500">Contact name (freeform)
            <input type="text" data-project-input="contactName" data-opportunity-id="${opp.id}" class="panel-input" value="${escapeHtml(opp.contactName || '')}" placeholder="Add or override contact name">
          </label>
          <div class="flex items-center gap-3">
            <button type="button" class="px-4 py-2 rounded-xl border ${opp.budgetaryOnly ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}" data-opportunity-id="${opp.id}" data-project-action="toggleBudgetary">${opp.budgetaryOnly ? 'Mark as formal bid' : 'Mark budgetary only'}</button>
            <span class="text-xs text-slate-400">Last update ${formatDateString(opp.updatedAt)}</span>
          </div>
        </div>
        <div class="text-xs text-slate-500">
          <p class="font-semibold text-slate-600">Project address</p>
          <p>${escapeHtml(opp.projectAddress || 'Add address or GPS note')}</p>
        </div>
        <div class="text-xs text-slate-500 space-y-2">
          <p class="font-semibold text-slate-600">Add update</p>
          <textarea data-project-note-input="${opp.id}" class="panel-input w-full" rows="2" placeholder="Append a quick update without overwriting history"></textarea>
          <div class="flex items-center gap-2">
            <button type="button" class="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" data-opportunity-id="${opp.id}" data-project-action="appendNote">Add update</button>
            <span class="text-[11px] text-slate-400">Appends with timestamp; previous updates stay visible.</span>
          </div>
        </div>
        <div class="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p class="font-semibold text-slate-600 mb-2">Project updates</p>
          <div data-project-notes="${opp.id}" class="space-y-2">${renderProjectNotes(opp)}</div>
        </div>
        <div class="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3">
          <p class="font-semibold text-slate-600 mb-2">Recent activity</p>
          ${renderOpportunityActivityList(opp.id)}
        </div>
      </div>`;
    })
    .join('');
}

function renderOpportunityActivityList(opportunityId) {
  const items = state.activities
    .filter((a) => a.opportunityId === opportunityId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  if (!items.length) return '<p class="text-slate-400">No activity yet.</p>';
  return `
    <ul class="space-y-1">
      ${items
        .map(
          (a) => `
          <li class="flex justify-between gap-2">
            <span class="flex-1 text-slate-600 truncate">${escapeHtml(a.subject || a.notes || 'Activity')}</span>
            <span class="text-slate-400">${formatDateString(a.date)}</span>
          </li>`
        )
        .join('')}
    </ul>
  `;
}

function normalizeRoleBucket(role = '') {
  const lower = role.toLowerCase();
  if (lower.includes('engineer')) return 'Engineering';
  if (lower.includes('maint')) return 'Maintenance';
  if (lower.includes('procure') || lower.includes('supply')) return 'Procurement';
  if (lower.includes('gate')) return 'Gatekeepers';
  if (lower.includes('decision')) return 'Decision Makers';
  if (lower.includes('champion')) return 'Champions';
  return 'Other Stakeholders';
}

function setAiTarget(target = 'activity') {
  state.aiTarget = target;
  if (el.aiTargetSelect) el.aiTargetSelect.value = target;
}

function openAiDrawer(target = state.aiTarget || 'activity') {
  setAiTarget(target);
  state.aiDrawerOpen = true;
  if (el.aiDrawer) el.aiDrawer.classList.remove('hidden');
}

function closeAiDrawer() {
  state.aiDrawerOpen = false;
  if (el.aiDrawer) el.aiDrawer.classList.add('hidden');
}

function applyExtractionNotesOnly() {
  const extraction = state.dictation.extraction;
  if (!extraction || !el.activityNotes) {
    toast('Run Extract Details first.', 'warning');
      return;
  }
  if (extraction.notes) el.activityNotes.value = extraction.notes;
  toast('Applied AI notes only', 'info');
}

function rejectAiExtraction() {
  state.dictation = { transcript: '', extraction: null };
  if (el.aiTranscript) el.aiTranscript.value = '';
  if (el.aiExtractionStatus) el.aiExtractionStatus.textContent = 'AI output cleared.';
  if (el.aiStructuredPreview) el.aiStructuredPreview.textContent = 'Run extraction to see structured data.';
  updateAiConfidenceBadge(null);
  toast('AI output rejected', 'warning');
}

function getTranscriptText() {
  return (el.aiTranscript?.value || state.dictation.transcript || '').trim();
}

function applyAiToContext() {
  const target = state.aiTarget || 'activity';
  if (target === 'activity') {
    applyExtractionToForm();
    return;
  }
  const transcript = getTranscriptText();
  if (!transcript) {
    toast('Transcribe or paste notes first.', 'warning');
    return;
  }
  switch (target) {
    case 'account':
      applyAccountTranscript(transcript);
      break;
    case 'opportunity':
      applyOpportunityTranscript(transcript);
      break;
    case 'contact':
      applyContactTranscript(transcript);
      break;
    case 'lookup':
      runLookupFromTranscript(transcript);
      break;
    default:
      applyExtractionToForm();
  }
}

function applyAccountTranscript(transcript) {
  const extraction = buildAccountExtractionFromTranscript(transcript);
  if (!extraction.name && !extraction.industry) {
    toast('Could not find account fields in transcript.', 'warning');
    return;
  }
  if (extraction.name && el.newAccountName) el.newAccountName.value = extraction.name;
  if (extraction.industry && el.newAccountIndustry) el.newAccountIndustry.value = extraction.industry;
  if (extraction.city && el.newAccountCity) el.newAccountCity.value = extraction.city;
  if (extraction.state && el.newAccountState) el.newAccountState.value = extraction.state;
  if (extraction.entrenchment && el.newAccountEntrenchment) el.newAccountEntrenchment.value = extraction.entrenchment;
  if (extraction.stage && el.newAccountStage) el.newAccountStage.value = extraction.stage;
  if (extraction.nextStep && el.newAccountNextStep) el.newAccountNextStep.value = extraction.nextStep;
  if (extraction.ownerId && el.newAccountOwner) el.newAccountOwner.value = extraction.ownerId;
  if (el.newAccountStatus) el.newAccountStatus.textContent = 'AI filled account fields from transcript.';
  if (el.aiExtractionStatus) el.aiExtractionStatus.textContent = 'Applied to new account card.';
  toast('Applied AI to new account card', 'success');
}

function buildAccountExtractionFromTranscript(transcript = '') {
  const lower = transcript.toLowerCase();
  const result = {};
  const nameMatch = transcript.match(/(?:add|create|new)\s+([A-Za-z0-9&.'\- ]+?)(?:\sin the|\sin\s|,|\.)/i);
  if (nameMatch) result.name = nameMatch[1].trim();
  const industryMatch = transcript.match(/in the ([A-Za-z0-9&.'\- ]+?) industry/i);
  if (industryMatch) result.industry = industryMatch[1].trim();
  const locationMatch = transcript.match(/located in ([A-Za-z0-9.'\- ]+),?\s*([A-Za-z]{2})/i);
  if (locationMatch) {
    result.city = locationMatch[1].trim();
    result.state = locationMatch[2].toUpperCase();
  }
  const entrenchmentMatch = transcript.match(/entrenchment (?:level\s*)?(?:is|let's call it)?\s*([A-Za-z ]+)/i);
  if (entrenchmentMatch) result.entrenchment = matchEntrenchment(entrenchmentMatch[1]);
  const stageMatch = transcript.match(/(?:phase|stage)\s*(?:is|at|for now)?\s*([A-Za-z 0-9]+)/i);
  if (stageMatch) result.stage = matchStage(stageMatch[1]);
  if (!result.stage) result.stage = ECD_STAGES.find((stage) => lower.includes(stage.toLowerCase())) || '';
  const ownerMatch = transcript.match(/account owner is ([A-Za-z .'’-]+)/i);
  if (ownerMatch) {
    const ownerMeta = resolveOwnerByName(ownerMatch[1]);
    if (ownerMeta?.id) result.ownerId = ownerMeta.id;
  }
  const nextStepMatch = transcript.match(/next step (?:is|:)?\s*([^\.]+)/i);
  if (nextStepMatch) result.nextStep = nextStepMatch[1].trim();
  return result;
}

function matchStage(input = '') {
  const cleaned = input.trim().toLowerCase();
  const found = ECD_STAGES.find((stage) => stage.toLowerCase().includes(cleaned) || cleaned.includes(stage.toLowerCase()));
  return found || '';
}

function matchEntrenchment(input = '') {
  const lower = input.toLowerCase();
  if (lower.includes('high')) return 'High';
  if (lower.includes('medium') || lower.includes('mid')) return 'Medium';
  if (lower.includes('low')) return 'Low';
  return '';
}

function resolveOwnerByName(name = '') {
  const target = name.trim().toLowerCase();
  return state.knownUsers.find((user) => (user.name || user.email || '').toLowerCase().includes(target)) || null;
}

function applyOpportunityTranscript(transcript) {
  if (!el.opportunityDescription) {
    toast('Opportunity form not available', 'warning');
    return;
  }
  if (!el.opportunityDescription.value) el.opportunityDescription.value = transcript.slice(0, 240);
  const valueMatch = transcript.match(/\$?([\d,.]+)\s?(k|m|million)?/i);
  if (valueMatch && el.opportunityValue) {
    const base = Number(valueMatch[1].replace(/,/g, ''));
    const multiplier = valueMatch[2]?.toLowerCase().startsWith('m') ? 1_000_000 : valueMatch[2]?.toLowerCase().startsWith('k') ? 1_000 : 1;
    const value = Math.round(base * multiplier);
    if (!Number.isNaN(value)) el.opportunityValue.value = value;
  }
  const oppStage = matchOpportunityStage(transcript);
  if (oppStage && el.opportunityStage) el.opportunityStage.value = oppStage;
  if (el.opportunityNotes && !el.opportunityNotes.value) el.opportunityNotes.value = transcript;
  if (el.aiExtractionStatus) el.aiExtractionStatus.textContent = 'Applied to opportunity card.';
  toast('Applied AI to opportunity card', 'success');
}

function matchOpportunityStage(transcript = '') {
  const lower = transcript.toLowerCase();
  if (lower.includes('lead')) return 'lead';
  if (lower.includes('qualif')) return 'qualified';
  if (lower.includes('proposal') || lower.includes('bid')) return 'proposal';
  if (lower.includes('pilot')) return 'pilot';
  if (lower.includes('expansion') || lower.includes('expand')) return 'expansion';
  if (lower.includes('recurring') || lower.includes('renew')) return 'recurring';
  return '';
}

function applyContactTranscript(transcript) {
  if (!el.activityContactName) {
    toast('Contact field not available', 'warning');
    return;
  }
  const nameMatch = transcript.match(/(?:contact|person|name is)\s+([A-Za-z .'’-]+)/i);
  if (nameMatch) el.activityContactName.value = nameMatch[1].trim();
  else el.activityContactName.value = transcript.split(/[.,]/)[0].trim();
  if (el.aiExtractionStatus) el.aiExtractionStatus.textContent = 'Applied contact name to activity card.';
  toast('Contact name applied from transcript', 'success');
}

function runLookupFromTranscript(transcript) {
  const lookupMatch = transcript.match(/pull up ([^\.]+)|open ([^\.]+)/i);
  const query = (lookupMatch?.[1] || lookupMatch?.[2] || transcript).trim().toLowerCase();
  if (!query) {
    toast('Could not parse account name to open.', 'warning');
    return;
  }
  const account = state.accounts.find((acc) => acc.name?.toLowerCase() === query) ||
    state.accounts.find((acc) => acc.name?.toLowerCase().includes(query));
  if (!account) {
    toast(`No account found for "${query}"`, 'warning');
    return;
  }
  if (el.accountSearch) el.accountSearch.value = account.name;
  selectAccount(account.id);
  toast(`Opened ${account.name}`, 'success');
}

async function quickVoiceLookup() {
  try {
    recordedBlob = null;
    recordedChunks = [];
    setAiTarget('lookup');
    setDictationStatus('Listening for account lookup...');
    await startRecording();
    setTimeout(() => stopRecording(), 4500);
    const blob = await waitForRecordingResult();
    const transcript = await transcribeAudio(blob);
    state.dictation.transcript = transcript;
    if (el.aiTranscript) el.aiTranscript.value = transcript;
    runLookupFromTranscript(transcript);
  } catch (err) {
    console.warn('Voice lookup failed', err);
    toast('Voice lookup failed', 'warning');
  }
}

function waitForRecordingResult(timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (recordedBlob) return resolve(recordedBlob);
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out waiting for recording'));
      setTimeout(tick, 150);
    };
    tick();
  });
}

function updateAiConfidenceBadge(confidence) {
  if (!el.aiConfidenceBadge) return;
  if (confidence == null) {
    el.aiConfidenceBadge.textContent = 'Confidence: —';
    el.aiConfidenceBadge.className = 'text-xs px-3 py-1 rounded-full border border-slate-700';
    return;
  }
  const pct = (confidence * 100).toFixed(0);
  el.aiConfidenceBadge.textContent = `Confidence: ${pct}%`;
  const variant = confidence < 0.85 ? 'border-amber-400 text-amber-200' : 'border-emerald-400 text-emerald-200';
  el.aiConfidenceBadge.className = `text-xs px-3 py-1 rounded-full border ${variant}`;
}

function updateQueueStatus(message) {
  const base = state.queueLength ? `${state.queueLength} ${state.queueState}` : '0 pending';
  if (el.queueStatus) el.queueStatus.textContent = message || base;
}

function uuid() {
  return self.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function getCurrentUserMeta() {
  return {
    id: state.session?.user?.id || 'local',
    name: state.session?.user?.name || state.session?.user?.email || 'CRM User',
    email: state.session?.user?.email || ''
  };
}

function getUserMetaById(id) {
  if (!id) return null;
  return state.knownUsers.find((user) => user.id === id) || DEMO_USERS.find((user) => user.id === id) || null;
}

function buildOwnerMeta(name = 'Unassigned') {
  const label = (name || 'Unassigned').trim() || 'Unassigned';
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'owner';
  return { id: `owner-${slug}`, name: label, email: '' };
}

function ensureAccountOwnership(account) {
  if (!account) return account;
  if (!account.ownerId) {
    const fallbackId = account.createdById || account.userId || getCurrentUserMeta().id;
    const meta = getUserMetaById(fallbackId) || { id: fallbackId, name: account.createdByName || 'Owner', email: '' };
    account.ownerId = meta.id;
    account.ownerName = account.ownerName || meta.name || meta.email || 'Owner';
    account.ownerEmail = account.ownerEmail || meta.email || '';
  }
  if (!account.updatedById) account.updatedById = account.ownerId;
  if (!account.updatedByName) account.updatedByName = account.ownerName || 'Unknown';
  return account;
}

async function persistAccount(account, { action = 'accountUpdate', kind = 'account' } = {}) {
  if (!account) return account;
  ensureAccountOwnership(account);
  const currentUser = getCurrentUserMeta();
  account.city = account.city || '';
  account.state = account.state || '';
  account.updatedAt = new Date().toISOString();
  account.updatedById = currentUser.id;
  account.updatedByName = currentUser.name || currentUser.email || 'CRM User';
  await db.enterpriseAccounts.put(account);
  await queueOfflineOperation(kind, { action, ...account });
  return account;
}

function hydrateAccounts(accounts = []) {
  return accounts.map((acc) => {
    ensureAccountOwnership(acc);
    if (acc.city == null) acc.city = '';
    if (acc.state == null) acc.state = '';
    if (!acc.updatedAt) acc.updatedAt = acc.createdAt || new Date().toISOString();
    if (!acc.createdById && acc.ownerId) acc.createdById = acc.ownerId;
    if (!acc.createdByName && acc.ownerName) acc.createdByName = acc.ownerName;
    return acc;
  });
}

function hydrateOpportunity(opp = {}) {
  const hydrated = { ...opp };
  hydrated.type = hydrated.type || 'account';
  hydrated.description = hydrated.description || hydrated.projectName || 'Opportunity';
  hydrated.notes = hydrated.notes || '';
  hydrated.contactId = hydrated.contactId || null;
  hydrated.contactName = hydrated.contactName || '';
  hydrated.stage = hydrated.stage || '';
  hydrated.status = hydrated.status || 'open';
  hydrated.createdAt = hydrated.createdAt || new Date().toISOString();
  hydrated.updatedAt = hydrated.updatedAt || hydrated.createdAt;
  hydrated.value = Number(hydrated.value) || 0;
  if (hydrated.type === 'project') {
    hydrated.projectName = hydrated.projectName || hydrated.description;
    hydrated.ecdStageKey = hydrated.ecdStageKey || '1';
    hydrated.ecdStageLabel = hydrated.ecdStageLabel || getProjectStageLabel(hydrated.ecdStageKey);
    hydrated.bidStatus = hydrated.bidStatus || 'discovery';
    hydrated.bidDueDate = hydrated.bidDueDate || null;
    hydrated.budgetaryOnly = Boolean(hydrated.budgetaryOnly);
    hydrated.assignedEstimator = hydrated.assignedEstimator || '';
    hydrated.gcList = parseGcList(hydrated.gcList);
    hydrated.projectCity = hydrated.projectCity || '';
    hydrated.projectState = hydrated.projectState || '';
    hydrated.projectAddress = hydrated.projectAddress || '';
    hydrated.projectLat = hydrated.projectLat || '';
    hydrated.projectLng = hydrated.projectLng || '';
    hydrated.lastStageChange = hydrated.lastStageChange || hydrated.createdAt;
  } else {
    hydrated.type = 'account';
    hydrated.stage = hydrated.stage || 'lead';
  }
  return hydrated;
}

function parseProjectNotes(raw) {
  if (!raw) return [];
  if (typeof raw !== 'string') return [];
  if (raw.startsWith(NOTES_V1_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(NOTES_V1_PREFIX.length));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to legacy handling
    }
  }
  const legacy = raw.trim();
  if (!legacy) return [];
  return [{ date: null, author: 'Previous note', text: legacy }];
}

function serializeProjectNotes(entries = []) {
  // keep most recent 50 notes to avoid unbounded growth
  const limited = entries.slice(0, 50);
  return `${NOTES_V1_PREFIX}${JSON.stringify(limited)}`;
}

function appendProjectNote(opportunity, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return false;
  const user = getCurrentUserMeta();
  const existing = parseProjectNotes(opportunity.notes);
  existing.unshift({
    date: new Date().toISOString(),
    author: user.name,
    text: trimmed
  });
  opportunity.notes = serializeProjectNotes(existing);
  return true;
}

function renderProjectNotes(opportunity) {
  const entries = parseProjectNotes(opportunity.notes);
  if (!entries.length) return '<p class="text-slate-400">No updates yet.</p>';
  return `
    <ul class="space-y-2">
      ${entries
        .map(
          (entry) => `
          <li class="rounded-lg border border-slate-100 bg-white/70 p-2">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>${escapeHtml(entry.author || 'Update')}</span>
              <span>${formatDateTime(entry.date) || ''}</span>
            </div>
            <p class="text-[13px] text-slate-700 whitespace-pre-wrap">${escapeHtml(entry.text || '')}</p>
          </li>`
        )
        .join('')}
    </ul>
  `;
}

function formatCurrency(value) {
  if (value == null || value === '') return '-';
  return `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDateString(value, fallback = '-') {
  if (!value) return fallback;
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return fallback;
  }
}

function formatLocation(account) {
  if (!account) return '';
  const parts = [];
  if (account.city) parts.push(account.city);
  if (account.state) parts.push(account.state);
  return parts.join(', ');
}

function formatDateTime(value, fallback = '-') {
  if (!value) return fallback;
  try {
    return new Date(value).toLocaleString();
  } catch {
    return fallback;
  }
}

function formatUpdatedSummary(account) {
  if (!account) return '-';
  const who = account.updatedByName || 'Unknown';
  return `${who} • ${formatDateTime(account.updatedAt)}`;
}

function getProjectStageLabel(key) {
  return PROJECT_STAGE_MAP[key]?.label || key || 'Set stage';
}

function getBidStatusLabel(value) {
  return PROJECT_BID_STATUS_MAP[value]?.label || 'Set bid status';
}

function parseGcList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMovementDescription(move) {
  if (move.movementType === 'projectStage') {
    return `${move.context || 'Project'} • ${move.oldStage || 'Unknown'} → ${move.newStage || 'Updated'}`;
  }
  if (move.movementType === 'projectBid') {
    return `${move.context || 'Project'} • Bid ${move.oldStage || 'status'} → ${move.newStage || ''}`;
  }
  return `${move.oldStage || 'N/A'} → ${move.newStage || ''}`;
}

function daysBetween(iso) {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function toast(message, variant = 'info') {
  if (!el.toastContainer) return;
  const tone = {
    success: 'bg-emerald-500/90 border-emerald-400',
    error: 'bg-rose-500/90 border-rose-400',
    warning: 'bg-amber-500/90 border-amber-400',
    info: 'bg-slate-800/90 border-slate-600'
  }[variant] || 'bg-slate-800/90 border-slate-600';
  const item = document.createElement('div');
  item.className = `pointer-events-auto rounded-xl px-4 py-2 text-sm text-white border ${tone} shadow-xl transition`;
  item.textContent = message;
  el.toastContainer.appendChild(item);
  setTimeout(() => {
    item.classList.add('opacity-0', '-translate-y-1');
    setTimeout(() => item.remove(), 300);
  }, 3200);
}

async function bootstrapFromDb() {
  if (!state.session?.user?.id) return;
  const userId = state.session.user.id;
  const [accounts, contacts, activities, movements, opportunities, queueLength] = await Promise.all([
    db.enterpriseAccounts.where('userId').equals(userId).toArray(),
    db.contacts.where('userId').equals(userId).toArray(),
    db.activityLog.where('userId').equals(userId).toArray(),
    db.movementLog.where('userId').equals(userId).toArray(),
    db.opportunities.where('userId').equals(userId).toArray(),
    db.queue.where('userId').equals(userId).count()
  ]);
  state.accounts = hydrateAccounts(accounts);
  state.contacts = contacts;
  state.activities = activities;
  state.movements = movements;
  state.opportunities = opportunities.map(hydrateOpportunity);
  state.queueLength = queueLength;
  updateStalledAccounts();
}

// Unified export helpers (date range required)
function getExportRange() {
  const start = el.exportStart?.value;
  const end = el.exportEnd?.value;
  if (!start || !end) {
    toast('Select start and end dates before exporting', 'warning');
    return null;
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    toast('Invalid date range', 'warning');
    return null;
  }
  if (startDate > endDate) {
    toast('Start date must be before end date', 'warning');
    return null;
  }
  return { startDate, endDate };
}

function withinRange(value, range) {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d >= range.startDate && d <= range.endDate;
}

function handleExport(format) {
  const type = el.exportType?.value;
  const range = getExportRange();
  if (!type || !range) return;
  const btn = format === 'pdf' ? el.exportPdf : el.exportCsv;
  const original = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = format === 'pdf' ? 'Exporting PDF...' : 'Exporting CSV...';
  }
  Promise.resolve()
    .then(() => {
      if (format === 'csv') {
        exportCsvByType(type, range);
      } else {
        return exportPdfByType(type, range);
      }
    })
    .catch((err) => {
      console.error('Export failed', err);
      toast('Export failed', 'warning');
    })
    .finally(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original || (format === 'pdf' ? 'Export PDF' : 'Export CSV');
      }
    });
}

async function handleActivitySubmit(event) {
  event.preventDefault();
  const accountId = el.activityAccount.value || state.selectedAccountId;
  if (!accountId) {
    toast('Select an account before logging activity.', 'warning');
    return;
  }
  const payload = await buildActivityPayload(accountId);
  await db.activityLog.put(payload);
  state.activities.push(payload);
  await queueOfflineOperation('activity', { action: 'interaction', ...payload });
  await updateAccountAfterActivity(accountId, payload.date);
  renderActivitySection(getSelectedAccount());
  toast('Activity logged', 'success');
  el.activityForm.reset();
}

async function handleNewAccountSubmit(event) {
  event.preventDefault();
  if (!el.newAccountName?.value?.trim()) {
    if (el.newAccountStatus) el.newAccountStatus.textContent = 'Name is required.';
    return;
  }
  const record = buildNewAccountRecord();
  record.score = calculateAccountScore(record);
  await persistAccount(record, { action: 'accountCreate' });
  state.accounts.unshift(record);
  populateAccountSelects();
  renderAccountList();
  selectAccount(record.id);
  if (el.newAccountForm) el.newAccountForm.reset();
  populateNewAccountOwnerSelect();
  if (el.newAccountStatus) el.newAccountStatus.textContent = 'Account added locally. Syncing...';
  toast(`Created ${record.name}`, 'success');
}

async function buildActivityPayload(accountId) {
  const files = [];
  if (el.activityAttachments?.files?.length) {
    for (const file of el.activityAttachments.files) {
      files.push({ name: file.name, type: file.type, data: await blobToBase64(file) });
  }
  }
  const userId = state.session?.user?.id || 'local';
  const userName = state.session?.user?.name || state.session?.user?.email || 'CRM User';
  const contact = state.contacts.find((c) => c.id === el.activityContact.value);
  let contactId = el.activityContact.value || null;
  let contactName = (el.activityContactName?.value || '').trim() || contact?.name || '';
  const opportunityId = el.activityOpportunity?.value || null;
  if (!contactId && contactName) {
    const created = await ensureInlineContact(contactName, accountId);
    contactId = created?.id || contactId;
    contactName = created?.name || contactName;
  }
  return {
    id: uuid(),
    userId,
    userName,
    accountId,
    contactId,
    contactName,
    opportunityId,
    type: el.activityType.value,
    channel: el.activityChannel.value,
    subject: el.activitySubject.value || '',
    notes: el.activityNotes.value || '',
    tags: (el.activityTags.value || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    nextFollowUp: el.activityNextFollowUp.value || null,
    outcome: el.activityOutcome.value || '',
    sentimentScore: Number(el.activitySentiment.value || 3),
    duration: Number(el.activityDuration.value || 0),
    date: new Date().toISOString(),
    files,
    aiConfidence: state.dictation.extraction?.aiConfidence ?? null
  };
}

function buildNewAccountRecord() {
  const currentUser = getCurrentUserMeta();
  const userId = currentUser.id;
  const ownerSelection = el.newAccountOwner?.value || currentUser.id;
  const ownerMeta = getUserMetaById(ownerSelection) || currentUser;
  const stage = el.newAccountStage?.value || 'Discovery';
  const entrenchment = el.newAccountEntrenchment?.value || 'Low';
  const relationshipHealth = el.newAccountRelationship?.value || 'Balanced';
  const now = new Date().toISOString();
  const annualPotential = Number(el.newAccountAnnual?.value || 0);
  const projectedValue = Number(el.newAccountProjected?.value || annualPotential);
  return {
    id: uuid(),
    userId,
    name: (el.newAccountName?.value || '').trim(),
    industry: (el.newAccountIndustry?.value || '').trim(),
    city: (el.newAccountCity?.value || '').trim(),
    state: (el.newAccountState?.value || '').trim(),
    annualPotential,
    projectedValue,
    entrenchment,
    stage,
    relationshipHealth,
    nextStep: el.newAccountNextStep?.value || '',
    notes: el.newAccountNotes?.value || '',
    lastContact: null,
    createdAt: now,
    updatedAt: now,
    stalled: false,
    ownerId: ownerMeta.id,
    ownerName: ownerMeta.name || ownerMeta.email || 'Unassigned',
    ownerEmail: ownerMeta.email || '',
    createdById: currentUser.id,
    createdByName: currentUser.name || currentUser.email || 'CRM User',
    updatedById: currentUser.id,
    updatedByName: currentUser.name || currentUser.email || 'CRM User'
  };
}
async function updateAccountAfterActivity(accountId, lastContactIso) {
  const account = state.accounts.find((acc) => acc.id === accountId);
  if (!account) return;
  account.lastContact = lastContactIso;
  account.userId = state.session?.user?.id || account.userId || 'local';
  account.score = calculateAccountScore(account);
  await persistAccount(account);
  updateStalledAccounts();
  renderSummaryPanel(account);
  renderAccountList();
  updateAccountAuditMeta(account);
}
async function handleAdvanceStage() {
  const account = getSelectedAccount();
  if (!account) {
    toast('Select an account first', 'warning');
    return;
  }
  const newStage = el.stageNextSelect.value;
  const notes = el.stageNotes.value || 'Stage advanced';
  if (!newStage || newStage === account.stage) {
    toast('Choose a different stage to move into.', 'warning');
    return;
  }
  const currentUser = getCurrentUserMeta();
  const movement = {
    id: uuid(),
    userId: currentUser.id,
    userName: currentUser.name || currentUser.email || 'CRM User',
    accountId: account.id,
    context: account.name,
    oldStage: account.stage,
    newStage,
    notes,
    movementType: 'accountStage',
    date: new Date().toISOString()
  };
  account.stage = newStage;
  account.nextStep = notes;
  account.projectedValue = account.projectedValue || account.annualPotential;
  account.score = calculateAccountScore(account);
  account.userId = currentUser.id;
  await persistAccount(account);
  await db.movementLog.put(movement);
  state.movements.push(movement);
  await queueOfflineOperation('movement', { action: 'movement', ...movement });
  updateStalledAccounts();
  renderMovementTimeline(account);
  renderSummaryPanel(account);
  renderAccountList();
  updateAccountAuditMeta(account);
  toast(`Advanced to ${newStage}`, 'success');
}
function calculateAccountScore(account) {
  const stageWeight = STAGE_WEIGHTS[account.stage] ?? 20;
  const entrenchmentDelta = ENTRENCHMENT_PENALTY[account.entrenchment] ?? 0;
  const relationshipBonus = RELATIONSHIP_MULTIPLIER[account.relationshipHealth] ?? 0;
  const accountActivities = state.activities.filter((act) => act.accountId === account.id);
  const velocityCount = accountActivities.filter((act) => daysBetween(act.date) <= VELOCITY_WINDOW_DAYS).length;
  const velocityFactor = Math.min(30, velocityCount * 2);
  const authenticTouches = accountActivities.filter((act) => act.type === 'authenticTouch').length * 2;
  const lastContactPenalty = Math.min(25, Math.max(0, daysBetween(account.lastContact) - STALL_THRESHOLD_DAYS) * 1.5);
  const decisionInfluence = state.contacts
    .filter((c) => c.accountId === account.id && c.role?.toLowerCase().includes('decision'))
    .reduce((sum, c) => sum + (Number(c.influenceScore) || 0), 0);
  const influenceBonus = Math.min(20, decisionInfluence);
  const stalledPenalty = state.stalledAccountIds.has(account.id) ? 20 : 0;
  const score = stageWeight + relationshipBonus + velocityFactor + authenticTouches + influenceBonus + entrenchmentDelta - lastContactPenalty - stalledPenalty;
  return clamp(Math.round(score), 0, 100);
}
async function handleOpportunitySubmit(event) {
  event.preventDefault();
  const account = getSelectedAccount();
  if (!account) {
    toast('Select an account first.', 'warning');
    return;
  }
  const userId = state.session?.user?.id || 'local';
  const now = new Date().toISOString();
  const type = el.opportunityType?.value || 'account';
  const base = {
    id: uuid(),
    userId,
    accountId: account.id,
    description: el.opportunityDescription.value || 'New opportunity',
    notes: el.opportunityNotes?.value || '',
    value: Number(el.opportunityValue.value || 0),
    status: el.opportunityStatus.value || 'open',
    createdAt: now,
    updatedAt: now
  };
  const contactNameInput = (el.opportunityContactName?.value || '').trim();
  const selectedContact = state.contacts.find((c) => c.id === el.opportunityContact?.value);
  if (selectedContact) {
    base.contactId = selectedContact.id;
    base.contactName = selectedContact.name || '';
  } else if (contactNameInput) {
    const created = await ensureInlineContact(contactNameInput, account.id);
    base.contactId = created?.id || null;
    base.contactName = created?.name || contactNameInput;
  } else {
    base.contactId = null;
    base.contactName = '';
  }
  if (type === 'project') {
    const stageKey = el.projectStage?.value || '1';
    base.type = 'project';
    base.projectName = el.projectName?.value || base.description;
    base.ecdStageKey = stageKey;
    base.ecdStageLabel = getProjectStageLabel(stageKey);
    base.bidStatus = el.projectBidStatus?.value || 'discovery';
    base.bidDueDate = el.projectBidDue?.value || null;
    base.budgetaryOnly = Boolean(el.projectBudgetary?.checked);
    base.assignedEstimator = el.projectEstimator?.value || '';
    base.gcList = parseGcList(el.projectGcList?.value || '');
    base.projectAddress = el.projectAddress?.value || '';
    base.projectCity = el.projectCity?.value || account.city || '';
    base.projectState = el.projectState?.value || account.state || '';
    base.projectLat = el.projectLat?.value || '';
    base.projectLng = el.projectLng?.value || '';
    base.projectLocationAccuracy = el.projectAccuracy?.value || '';
    base.lastStageChange = now;
    base.stage = '';
  } else {
    base.type = 'account';
    base.stage = el.opportunityStage?.value || 'lead';
  }
  const opportunity = hydrateOpportunity(base);
  await db.opportunities.put(opportunity);
  state.opportunities.push(opportunity);
  await queueOfflineOperation('opportunity', { action: 'opportunity', ...opportunity });
  el.opportunityForm.reset();
  handleOpportunityTypeChange();
  prefillProjectForm(account);
  renderOpportunitiesSection(account);
  toast(`${opportunity.type === 'project' ? 'Project' : 'Account'} opportunity added`, 'success');
}
async function handleOpportunityFieldChange(event) {
  const field = event.target.dataset.field;
  const id = event.target.dataset.opportunityId;
  if (!field || !id) return;
  const opp = state.opportunities.find((o) => o.id === id);
  if (!opp || opp.type === 'project') return;
  if (field === 'value') opp.value = Number(event.target.value || 0);
  else if (field === 'contactId') {
    opp.contactId = event.target.value || null;
    const contact = state.contacts.find((c) => c.id === opp.contactId);
    opp.contactName = contact?.name || opp.contactName || '';
  } else if (field === 'contactName') {
    opp.contactName = event.target.value;
    if (!opp.contactId && opp.contactName) {
      const created = await ensureInlineContact(opp.contactName, opp.accountId);
      opp.contactId = created?.id || opp.contactId;
      opp.contactName = created?.name || opp.contactName;
    }
  } else {
    opp[field] = event.target.value;
  }
  opp.updatedAt = new Date().toISOString();
  opp.userId = opp.userId || state.session?.user?.id || 'local';
  await db.opportunities.put(opp);
  await queueOfflineOperation('opportunity', { action: 'opportunity', ...opp });
  toast('Opportunity updated', 'info');
  renderOpportunitiesSection(getSelectedAccount());
}

async function handleProjectOpportunityChange(event) {
  const input = event.target.dataset.projectInput;
  const id = event.target.dataset.opportunityId;
  if (!input || !id) return;
  const opp = state.opportunities.find((o) => o.id === id);
  if (!opp || opp.type !== 'project') return;
  const value = event.target.value;
  switch (input) {
    case 'ecdStage':
      applyProjectStageChange(opp, value);
      break;
    case 'bidStatus':
      applyProjectBidStatusChange(opp, value);
      break;
    case 'bidDueDate':
      opp.bidDueDate = value || null;
      persistOpportunityChange(opp, 'opportunity', 'Bid due date updated');
      break;
    case 'assignedEstimator':
      opp.assignedEstimator = value || '';
      persistOpportunityChange(opp, 'opportunity', 'Estimator updated');
      break;
    case 'gcList':
      opp.gcList = parseGcList(value);
      persistOpportunityChange(opp, 'opportunity', 'GC list updated');
      break;
    case 'notes':
      opp.notes = value;
      persistOpportunityChange(opp, 'opportunity', 'Project notes updated', false);
      break;
    case 'contactId':
      opp.contactId = value || null;
      opp.contactName = state.contacts.find((c) => c.id === opp.contactId)?.name || opp.contactName || '';
      persistOpportunityChange(opp, 'opportunity', 'Project contact updated', false);
      break;
    case 'contactName':
      opp.contactName = value;
      if (!opp.contactId && value) {
        const created = await ensureInlineContact(value, opp.accountId);
        opp.contactId = created?.id || opp.contactId;
        opp.contactName = created?.name || value;
      }
      persistOpportunityChange(opp, 'opportunity', 'Project contact updated', false);
      break;
    default:
      break;
  }
}

async function handleProjectOpportunityClick(event) {
  const action = event.target.dataset.projectAction;
  const id = event.target.dataset.opportunityId;
  if (!action || !id) return;
  const opp = state.opportunities.find((o) => o.id === id);
  if (!opp || opp.type !== 'project') return;
  if (action === 'appendNote') {
    const input = el.projectOpportunitiesList?.querySelector(`[data-project-note-input="${id}"]`);
    const text = input?.value?.trim();
    if (!text) {
      toast('Add an update before saving.', 'warning');
      return;
    }
    appendProjectNote(opp, text);
    if (input) input.value = '';
    await persistOpportunityChange(opp, 'opportunity', 'Project update added');
    return;
  }
  if (action === 'toggleBudgetary') {
    opp.budgetaryOnly = !opp.budgetaryOnly;
    persistOpportunityChange(opp, 'opportunity', opp.budgetaryOnly ? 'Marked as budgetary' : 'Marked as formal bid');
  }
}

async function applyProjectStageChange(opportunity, stageKey) {
  if (!stageKey || opportunity.ecdStageKey === stageKey) return;
  const previousLabel = getProjectStageLabel(opportunity.ecdStageKey);
  const nextLabel = getProjectStageLabel(stageKey);
  opportunity.ecdStageKey = stageKey;
  opportunity.ecdStageLabel = nextLabel;
  opportunity.lastStageChange = new Date().toISOString();
  await persistOpportunityChange(opportunity);
  await recordOpportunityMovement(opportunity, 'projectStage', previousLabel, nextLabel);
  toast('Project stage updated', 'success');
}

async function applyProjectBidStatusChange(opportunity, bidStatus) {
  if (!bidStatus || opportunity.bidStatus === bidStatus) return;
  const previousLabel = getBidStatusLabel(opportunity.bidStatus);
  const nextLabel = getBidStatusLabel(bidStatus);
  opportunity.bidStatus = bidStatus;
  if (['won', 'lost', 'declined'].includes(bidStatus)) {
    opportunity.status = bidStatus;
  }
  await persistOpportunityChange(opportunity);
  await recordOpportunityMovement(opportunity, 'projectBid', previousLabel, nextLabel);
  toast('Bid status updated', 'info');
}

async function persistOpportunityChange(opportunity, action = 'opportunity', toastMessage, reRender = true) {
  opportunity.updatedAt = new Date().toISOString();
  await db.opportunities.put(opportunity);
  await queueOfflineOperation('opportunity', { action, ...opportunity });
  if (reRender) renderOpportunitiesSection(getSelectedAccount());
  if (toastMessage) toast(toastMessage, 'info');
}

async function recordOpportunityMovement(opportunity, movementType, oldStage, newStage) {
  const user = getCurrentUserMeta();
  const movement = {
    id: uuid(),
    userId: user.id,
    userName: user.name,
    accountId: opportunity.accountId,
    opportunityId: opportunity.id,
    movementType,
    oldStage,
    newStage,
    context: opportunity.projectName || opportunity.description,
    notes: `${opportunity.projectName || opportunity.description}`,
    date: new Date().toISOString()
  };
  await db.movementLog.put(movement);
  state.movements.push(movement);
  await queueOfflineOperation('movement', { action: 'movement', ...movement });
}

function setProjectFilter(filter) {
  state.projectFilter = filter;
  renderOpportunitiesSection(getSelectedAccount());
}

function updateProjectFilterButtons() {
  const buttons = [
    { el: el.projectFilterAll, value: 'all' },
    { el: el.projectFilterActive, value: 'active' },
    { el: el.projectFilterWon, value: 'won' }
  ];
  buttons.forEach(({ el: button, value }) => {
    if (!button) return;
    button.classList.toggle('bg-brand/10', state.projectFilter === value);
    button.classList.toggle('text-brand', state.projectFilter === value);
  });
}

function handleOpportunityTypeChange() {
  const type = el.opportunityType?.value || 'account';
  const accountBlocks = document.querySelectorAll('[data-account-only]');
  if (type === 'project') {
    if (el.projectFields) el.projectFields.classList.remove('hidden');
    accountBlocks.forEach((block) => block.classList.add('hidden'));
    prefillProjectForm(getSelectedAccount());
  } else {
    if (el.projectFields) el.projectFields.classList.add('hidden');
    accountBlocks.forEach((block) => block.classList.remove('hidden'));
  }
}

function prefillProjectForm(account) {
  if (!account || !el.projectFields || el.projectFields.classList.contains('hidden')) return;
  if (el.projectCity && !el.projectCity.value) el.projectCity.value = account.city || '';
  if (el.projectState && !el.projectState.value) el.projectState.value = account.state || '';
  if (el.projectAddress && !el.projectAddress.value && account.city) {
    el.projectAddress.placeholder = `${account.city}${account.state ? `, ${account.state}` : ''}`;
  }
  if (el.projectLat) el.projectLat.value = '';
  if (el.projectLng) el.projectLng.value = '';
  if (el.projectAccuracy) el.projectAccuracy.value = '';
}

function handleUseAccountLocation() {
  const account = getSelectedAccount();
  if (!account) {
    toast('Select an account first.', 'warning');
    return;
  }
  if (el.projectCity) el.projectCity.value = account.city || '';
  if (el.projectState) el.projectState.value = account.state || '';
  if (el.projectAddress && !el.projectAddress.value) {
    el.projectAddress.value = `${account.city || ''}${account.city && account.state ? ', ' : ''}${account.state || ''}`;
  }
  toast('Loaded account location', 'success');
}

function handleUseCurrentLocation() {
  if (!navigator.geolocation) {
    toast('Browser blocked GPS access.', 'warning');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (el.projectAddress) el.projectAddress.value = `GPS ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      if (el.projectLat) el.projectLat.value = latitude;
      if (el.projectLng) el.projectLng.value = longitude;
      if (el.projectAccuracy) el.projectAccuracy.value = accuracy ?? '';
      toast('Captured GPS coordinates', 'success');
    },
    (err) => {
      console.warn('GPS error', err);
      toast('Unable to fetch location', 'error');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function generateWeeklySummary() {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekActivities = state.activities.filter((act) => new Date(act.date).getTime() >= weekAgo);
  const authenticTouches = weekActivities.filter((act) => act.type === 'authenticTouch');
  const movedAccounts = state.movements.filter((move) => new Date(move.date).getTime() >= weekAgo);
  const stalled = state.accounts.filter((acc) => state.stalledAccountIds.has(acc.id));
  const atRisk = state.accounts.filter((acc) => (acc.relationshipHealth || '').toLowerCase().includes('risk'));
  const priorities = [...state.accounts]
    .sort((a, b) => (b.projectedValue || 0) - (a.projectedValue || 0))
    .slice(0, 3)
    .map((acc, idx) => `${idx + 1}. ${acc.name} (${formatCurrency(acc.projectedValue || acc.annualPotential)})`);
  const nextWeek = state.accounts
    .map((acc) => acc.nextStep)
    .filter(Boolean)
    .slice(0, 5);
  const summaryText = [
    `Weekly BD Summary (${new Date(weekAgo).toLocaleDateString()} - ${new Date(now).toLocaleDateString()})`,
    '',
    `Authentic touches (${authenticTouches.length}): ${authenticTouches.map((act) => act.subject || act.notes?.slice(0, 40) || 'Touch').join('; ') || 'None'}`,
    `Accounts moved (${movedAccounts.length}): ${movedAccounts.map((m) => `${m.oldStage || '---'}→${m.newStage} (${state.accounts.find((a) => a.id === m.accountId)?.name || ''})`).join('; ') || 'None'}`,
    `Accounts at risk (${atRisk.length}): ${atRisk.map((acc) => acc.name).join(', ') || 'None'}`,
    `Accounts stalled (${stalled.length}): ${stalled.map((acc) => acc.name).join(', ') || 'None'}`,
    `Top 3 enterprise priorities: ${priorities.join(' | ') || 'Set priorities for upcoming week.'}`,
    `What’s happening next week: ${nextWeek.join(' | ') || 'Update next steps for key accounts.'}`,
    `Executive-ready summary: Keeping ${state.accounts.length} accounts engaged with ${weekActivities.length} logged interactions.`
  ].join('\n');
  el.weeklySummaryText.value = summaryText;
  el.weeklySummaryStatus.textContent = `Generated ${new Date().toLocaleString()}`;
  const rows = [
    ['AuthenticTouches', authenticTouches.length],
    ['AccountsMoved', movedAccounts.length],
    ['AccountsAtRisk', atRisk.length ? atRisk.map((acc) => acc.name).join('; ') : 'None'],
    ['AccountsStalled', stalled.length],
    ['TopPriorities', priorities.join('; ')],
    ['NextWeek', nextWeek.join('; ')],
    ['ExecutiveSummary', 'Keeping enterprise funnel active with AI-supported BD.']
  ];
  state.latestSummaryCsv = { headers: ['Metric', 'Value'], rows };
  toast('Weekly summary ready', 'success');
  return summaryText;
}

async function copyWeeklySummaryToClipboard() {
  const text = el.weeklySummaryText.value || generateWeeklySummary();
  try {
    await navigator.clipboard.writeText(text);
    toast('Summary copied to clipboard', 'success');
  } catch {
    toast('Clipboard blocked by browser', 'error');
  }
}

function downloadWeeklySummaryCsv() {
  if (!state.latestSummaryCsv) generateWeeklySummary();
  const { headers, rows } = state.latestSummaryCsv || { headers: [], rows: [] };
  downloadCsv('ecd-weekly-summary', headers, rows);
}

function filterAccountsByRange(range) {
  return state.accounts.filter((acc) => withinRange(acc.updatedAt || acc.createdAt, range));
}

function filterMovementsByRange(range) {
  return state.movements.filter((move) => withinRange(move.date, range));
}

function filterOpportunitiesByRange(range) {
  return state.opportunities.filter((opp) => withinRange(opp.updatedAt || opp.createdAt, range));
}

function filterActivitiesByRange(range) {
  return state.activities.filter((act) => withinRange(act.date, range));
}

function exportPipelineCsv(range) {
  const headers = [
    'Account Name',
    'Industry',
    'Stage',
    'Score',
    'City',
    'State',
    'Annual Potential',
    'Projected Value',
    'Entrenchment',
    'Relationship Health',
    'Last Contact',
    'Next Step',
    'Relationship Strength',
    'Notes',
    'Owner',
    'Last Updated By',
    'Last Updated'
  ];
  const rows = filterAccountsByRange(range).map((acc) => [
    acc.name,
    acc.industry || '',
    acc.stage || '',
    acc.score || '',
    acc.city || '',
    acc.state || '',
    acc.annualPotential || '',
    acc.projectedValue || '',
    acc.entrenchment || '',
    acc.relationshipHealth || '',
    acc.lastContact || '',
    acc.nextStep || '',
    acc.relationshipHealth || '',
    acc.notes || '',
    acc.ownerName || 'Unassigned',
    acc.updatedByName || '',
    acc.updatedAt || ''
  ]);
  downloadCsv('ecd-enterprise-pipeline', headers, rows);
}

function exportMovementCsv(range) {
  const headers = ['Account', 'Opportunity / Context', 'Movement Type', 'Old Stage', 'New Stage', 'Date', 'Notes', 'Updated By'];
  const rows = filterMovementsByRange(range).map((move) => [
    state.accounts.find((acc) => acc.id === move.accountId)?.name || '',
    move.context || '',
    move.movementType || 'accountStage',
    move.oldStage || '',
    move.newStage || '',
    move.date || '',
    move.notes || '',
    move.userName || ''
  ]);
  downloadCsv('ecd-movement-log', headers, rows);
}

function exportOpportunitiesCsv(range) {
  const headers = [
    'Opportunity Type',
    'Account',
    'Project Name',
    'Description',
    'Value',
    'ECD Stage',
    'Bid Status',
    'Budgetary Only',
    'Bid Due',
    'Estimator',
    'GCs',
    'Project Address',
    'Project City',
    'Project State',
    'Account Stage',
    'Status',
    'Created',
    'Updated'
  ];
  const rows = filterOpportunitiesByRange(range).map((opp) => {
    const accountName = state.accounts.find((acc) => acc.id === opp.accountId)?.name || '';
    return [
      opp.type || 'account',
      accountName,
      opp.type === 'project' ? opp.projectName || '' : '',
      opp.description || '',
      opp.value || '',
      opp.type === 'project' ? getProjectStageLabel(opp.ecdStageKey) : opp.stage || '',
      opp.type === 'project' ? getBidStatusLabel(opp.bidStatus) : '',
      opp.type === 'project' ? (opp.budgetaryOnly ? 'Yes' : 'No') : '',
      opp.type === 'project' ? opp.bidDueDate || '' : '',
      opp.type === 'project' ? opp.assignedEstimator || '' : '',
      opp.type === 'project' ? (opp.gcList || []).join('; ') : '',
      opp.type === 'project' ? opp.projectAddress || '' : '',
      opp.type === 'project' ? opp.projectCity || '' : '',
      opp.type === 'project' ? opp.projectState || '' : '',
      opp.type === 'account' ? (opp.stage || '') : '',
      opp.status || '',
      opp.createdAt || '',
      opp.updatedAt || ''
    ];
  });
  downloadCsv('ecd-opportunity-tracking', headers, rows);
}

function exportActivitiesCsv(range) {
  const headers = ['Date', 'Account', 'Opportunity', 'Contact', 'Type', 'Channel', 'Logged By', 'Subject', 'Notes', 'Tags', 'Outcome', 'Sentiment', 'Duration', 'AI Confidence'];
  const rows = filterActivitiesByRange(range).map((act) => [
    act.date || '',
    state.accounts.find((acc) => acc.id === act.accountId)?.name || '',
    state.opportunities.find((o) => o.id === act.opportunityId)?.projectName || state.opportunities.find((o) => o.id === act.opportunityId)?.description || '',
    state.contacts.find((c) => c.id === act.contactId)?.name || act.contactName || '',
    act.type || '',
    act.channel || '',
    act.userName || '',
    act.subject || '',
    act.notes || '',
    (act.tags || []).join('|'),
    act.outcome || '',
    act.sentimentScore || '',
    act.duration || '',
    act.aiConfidence != null ? act.aiConfidence : ''
  ]);
  downloadCsv('ecd-activity-log', headers, rows);
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function exportCsvByType(type, range) {
  switch (type) {
    case 'all':
      exportPipelineCsv(range);
      exportOpportunitiesCsv(range);
      exportMovementCsv(range);
      exportActivitiesCsv(range);
      break;
    case 'pipeline':
      exportPipelineCsv(range);
      break;
    case 'movements':
      exportMovementCsv(range);
      break;
    case 'opportunities':
      exportOpportunitiesCsv(range);
      break;
    case 'activities':
      exportActivitiesCsv(range);
      break;
    default:
      toast('Select an export type', 'warning');
      break;
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast('Recording not supported in this browser', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(recordedChunks, { type: 'audio/webm' });
      setDictationStatus('Recording saved, ready to transcribe.');
    };
    mediaRecorder.start();
    setDictationStatus('Recording...');
  } catch (err) {
    console.error(err);
    toast('Unable to access microphone', 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    setDictationStatus('Recording stopped.');
  }
}

function setDictationStatus(text) {
  if (el.dictationStatus) el.dictationStatus.textContent = text;
}

async function handleTranscriptionRequest() {
  if (!recordedBlob) {
    toast('Record audio first.', 'warning');
    return;
  }
  setDictationStatus('Transcribing with Whisper...');
  try {
    const transcript = await transcribeAudio(recordedBlob);
    state.dictation.transcript = transcript;
    el.aiTranscript.value = transcript;
    setDictationStatus('Transcript ready.');
  } catch (err) {
    console.error(err);
    setDictationStatus('Transcription failed.');
    toast('Transcription failed', 'error');
  }
}

async function handleExtractionRequest() {
  const transcript = el.aiTranscript.value || state.dictation.transcript;
  if (!transcript) {
    toast('Transcribe audio or paste notes first.', 'warning');
    return;
  }
  el.aiExtractionStatus.textContent = 'Extracting structured data...';
  try {
    const extraction = await extractBDInsights(transcript);
    state.dictation.extraction = extraction;
    el.aiExtractionStatus.textContent = `AI ready (confidence ${(extraction.aiConfidence * 100 || 0).toFixed(0)}%)`;
    updateAiConfidenceBadge(extraction.aiConfidence);
    if (el.aiStructuredPreview) {
      el.aiStructuredPreview.innerHTML = `
        <p><strong>Subject:</strong> ${escapeHtml(extraction.subject || '')}</p>
        <p><strong>Outcome:</strong> ${escapeHtml(extraction.outcome || '')}</p>
        <p><strong>Next Follow-Up:</strong> ${escapeHtml(extraction.nextFollowUp || '')}</p>
        <p><strong>Tags:</strong> ${(extraction.tags || []).map((tag) => `<span class="px-2 py-0.5 rounded-full bg-slate-800 text-xs">${escapeHtml(tag)}</span>`).join(' ')}</p>
      `;
    }
    toast('AI extraction complete', 'success');
  } catch (err) {
    console.error(err);
    el.aiExtractionStatus.textContent = 'Extraction failed. Try again.';
    toast('Extraction failed', 'error');
  }
}

function applyExtractionToForm() {
  const extraction = state.dictation.extraction;
  if (!extraction) {
    toast('Run Extract Details first.', 'warning');
    return;
  }
  if (extraction.subject) el.activitySubject.value = extraction.subject;
  if (extraction.notes) el.activityNotes.value = extraction.notes;
  if (Array.isArray(extraction.tags)) el.activityTags.value = extraction.tags.join(', ');
  if (extraction.sentiment != null) {
    el.activitySentiment.value = extraction.sentiment;
    el.sentimentValue.textContent = `(${extraction.sentiment})`;
  }
  if (extraction.nextFollowUp) el.activityNextFollowUp.value = extraction.nextFollowUp;
  if (extraction.outcome) el.activityOutcome.value = extraction.outcome;
  if (extraction.movementTriggered && extraction.movementStage) {
    el.stageNextSelect.value = extraction.movementStage;
    toast('AI recommends stage movement', 'info');
  }
  toast('AI fields applied', 'success');
}

async function transcribeAudio(blob) {
  const formData = new FormData();
  formData.append('file', blob, 'interaction.webm');
  try {
    const headers = getAuthHeaders();
    const res = await fetch(AI_TRANSCRIBE_ENDPOINT, { method: 'POST', headers, body: formData });
    if (!res.ok) throw new Error(`Transcription failed ${res.status}`);
    const data = await res.json();
    return data.text || data.transcript || '';
  } catch (err) {
    if (window.Whisper?.transcribe) {
      const data = await window.Whisper.transcribe(blob);
      return data.text || '';
    }
    throw err;
  }
}

async function extractBDInsights(transcript) {
  const res = await fetch(AI_EXTRACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ transcript })
  });
  if (!res.ok) throw new Error(`Extraction failed ${res.status}`);
  return res.json();
}

async function queueOfflineOperation(kind, payload) {
  if (!state.session?.user?.id) {
    toast('Please login before logging activity.', 'warning');
    return;
  }
  await db.queue.add({ userId: state.session.user.id, kind, status: 'pending', payload, createdAt: Date.now() });
  state.queueState = 'pending';
  state.queueLength = await db.queue.where('userId').equals(state.session.user.id).count();
  updateQueueStatus();
  if (navigator.onLine) {
    await flushQueue();
  } else if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('crm-sync');
    } catch {
      // ignore sync registration errors
    }
  }
}

async function flushQueue() {
  if (!state.session?.user?.id) return;
  const queued = await db.queue.where('userId').equals(state.session.user.id).toArray();
  if (!queued.length) return;
  state.queueState = 'syncing';
  updateQueueStatus();
  for (const item of queued) {
    try {
      await sendQueuedItem(item);
      await db.queue.delete(item.id);
    } catch (err) {
      console.warn('Failed to flush queue item', err);
      break;
    }
  }
  state.queueLength = await db.queue.where('userId').equals(state.session.user.id).count();
  state.queueState = state.queueLength ? 'pending' : 'idle';
  updateQueueStatus();
  if (el.lastSync) el.lastSync.textContent = new Date().toLocaleTimeString();
}

async function sendQueuedItem(item) {
  const body = item.payload;
  if (!body) return;
  await apiPost(body);
}

async function syncFromServer() {
  if (!state.session?.user?.id) return;
  try {
    const [
      accountsRes,
      contactsRes,
      activitiesRes,
      movementsRes,
      opportunitiesRes
    ] = await Promise.allSettled([
      apiGet('action=enterpriseAccounts'),
      apiGet('action=contacts'),
      apiGet('action=activityLog'),
      apiGet('action=movementLog'),
      apiGet('action=opportunities')
    ]);
    const userId = state.session.user.id;
    if (accountsRes.status === 'fulfilled' && accountsRes.value?.accounts) {
      const items = accountsRes.value.accounts.map((acc) => ({ ...acc, userId }));
      const hydrated = hydrateAccounts(items);
      await db.enterpriseAccounts.where('userId').equals(userId).delete();
      await db.enterpriseAccounts.bulkPut(hydrated);
      state.accounts = hydrated;
    }
    if (contactsRes.status === 'fulfilled' && contactsRes.value?.contacts) {
      const items = contactsRes.value.contacts.map((c) => ({ ...c, userId }));
      await db.contacts.where('userId').equals(userId).delete();
      await db.contacts.bulkPut(items);
      state.contacts = items;
    }
    if (activitiesRes.status === 'fulfilled' && activitiesRes.value?.activities) {
      const items = activitiesRes.value.activities.map((a) => ({ ...a, userId }));
      await db.activityLog.where('userId').equals(userId).delete();
      await db.activityLog.bulkPut(items);
      state.activities = items;
    }
    if (movementsRes.status === 'fulfilled' && movementsRes.value?.movements) {
      const items = movementsRes.value.movements.map((m) => ({ ...m, userId }));
      await db.movementLog.where('userId').equals(userId).delete();
      await db.movementLog.bulkPut(items);
      state.movements = items;
    }
    if (opportunitiesRes.status === 'fulfilled' && opportunitiesRes.value?.opportunities) {
      const items = opportunitiesRes.value.opportunities.map((o) => ({ ...o, userId }));
      await db.opportunities.where('userId').equals(userId).delete();
      await db.opportunities.bulkPut(items);
      state.opportunities = items.map(hydrateOpportunity);
    }
    populateAccountSelects();
    renderAccountList();
    selectDefaultAccount();
    updateStalledAccounts();
    if (el.lastSync) el.lastSync.textContent = new Date().toLocaleTimeString();
    toast('Synced enterprise data', 'success');
  } catch (err) {
    console.warn('Sync failed', err);
    toast('Sync failed, working offline', 'warning');
  }
}

async function apiGet(path) {
  const url = `${CRM_SYNC_ENDPOINT}?${path}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`GET ${path} failed ${res.status}`);
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(CRM_SYNC_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST failed ${res.status}`);
  return res.json();
}

function blobToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateStalledAccounts() {
  const stalled = new Set();
  state.accounts.forEach((acc) => {
    const lastTouch = state.activities
      .filter((act) => act.accountId === acc.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date;
    const lastMove = state.movements
      .filter((move) => move.accountId === acc.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date;
    const stalledTouch = !lastTouch || daysBetween(lastTouch) > STALL_THRESHOLD_DAYS;
    const stalledMove = !lastMove || daysBetween(lastMove) > STALL_THRESHOLD_DAYS * 3;
    const isStalled = stalledTouch && stalledMove;
    acc.stalled = isStalled;
    if (isStalled) stalled.add(acc.id);
  });
  state.stalledAccountIds = stalled;
  renderSummaryPanel(getSelectedAccount());
}

async function openBriefingModal() {
  const account = getSelectedAccount();
  if (!account) {
    toast('Select an account first.', 'warning');
    return;
  }
  state.briefing = { open: true, loading: true, data: null, error: null };
  if (el.briefingModal) el.briefingModal.classList.remove('hidden');
  if (el.briefingTitle) el.briefingTitle.textContent = account.name || 'Customer Briefing';
  if (el.briefingStatus) el.briefingStatus.textContent = 'Preparing briefing...';
  if (el.briefingContent) el.briefingContent.hidden = true;
  await loadBriefingForAccount(account);
}

function closeBriefingModal() {
  state.briefing.open = false;
  if (el.briefingModal) el.briefingModal.classList.add('hidden');
}

async function loadBriefingForAccount(account) {
  try {
    const payload = buildBriefingPayload(account);
    const external = await fetchExternalInfo(account.name).catch(() => null);
    if (external) payload.external = external;
    const briefing = (await fetchBriefingFromApi(payload).catch(() => null)) || buildLocalBriefing(payload);
    state.briefing = { open: true, loading: false, data: briefing, error: null };
    renderBriefing(briefing);
  } catch (err) {
    console.warn('Briefing failed', err);
    state.briefing = { open: true, loading: false, data: null, error: err };
    if (el.briefingStatus) el.briefingStatus.textContent = 'Briefing failed. Try again.';
  }
}

function buildBriefingPayload(account) {
  const recentActivities = state.activities
    .filter((a) => a.accountId === account.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);
  const openOpportunities = state.opportunities.filter((o) => o.accountId === account.id);
  return {
    account,
    recentActivities,
    opportunities: openOpportunities,
    lastContact: recentActivities[0]?.date || account.lastContact,
    internalNotes: [account.notes, recentActivities.map((a) => a.notes).join('\n')].filter(Boolean).join('\n').trim()
  };
}

async function fetchExternalInfo(companyName) {
  if (!companyName) return null;
  const url = `${EXTERNAL_INFO_ENDPOINT}?company=${encodeURIComponent(companyName)}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('External info failed');
  return res.json();
}

async function fetchBriefingFromApi(payload) {
  const res = await fetch(AI_BRIEFING_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Briefing API failed');
  return res.json();
}

function buildLocalBriefing(payload) {
  const activitySummary = payload.recentActivities.map((a) => `${formatDateString(a.date)} • ${a.subject || a.notes || 'Activity'}`).slice(0, 3);
  return {
    overview: `${payload.account.name} • ${payload.account.industry || ''} • ${payload.account.stage || ''}`.trim(),
    internalHighlights: [
      `Relationship: ${payload.account.relationshipHealth || 'Unknown'}`,
      `Entrenchment: ${payload.account.entrenchment || 'Unknown'}`,
      `Projected value: ${formatCurrency(payload.account.projectedValue || payload.account.annualPotential || 0)}`,
      ...activitySummary
    ],
    externalHighlights: payload.external?.signals || payload.external?.news || [],
    talkingPoints: ['Highlight recent wins', 'Ask about upcoming projects', 'Confirm next step'],
    risks: ['Limited fresh intel — confirm decision maker', 'Check budget timeline'],
    nextSteps: [payload.account.nextStep || 'Schedule next touchpoint'],
    emailDraft: `Hi ${payload.account.ownerName || 'team'},\n\nThanks for the recent conversation with ${payload.account.name}. I'd like to align on next steps and discuss how we can help in the ${payload.account.stage || 'current'} phase.\n\nBest,\n${state.session?.user?.name || 'BD'}`
  };
}

function renderBriefing(briefing) {
  if (el.briefingStatus) el.briefingStatus.textContent = '';
  if (el.briefingContent) el.briefingContent.hidden = false;
  if (el.briefingOverview) el.briefingOverview.textContent = briefing.overview || 'No overview';
  if (el.briefingInternal) el.briefingInternal.innerHTML = (briefing.internalHighlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No internal highlights</li>';
  if (el.briefingExternal) el.briefingExternal.innerHTML = (briefing.externalHighlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No external signals</li>';
  if (el.briefingTalkingPoints) el.briefingTalkingPoints.innerHTML = (briefing.talkingPoints || briefing.risks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>No talking points</li>';
  const nextSteps = (briefing.nextSteps || briefing.risks || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  if (el.briefingNextSteps) el.briefingNextSteps.innerHTML = nextSteps || '<li>No next steps</li>';
  if (el.briefingEmail) el.briefingEmail.textContent = briefing.emailDraft || 'No draft generated.';
}

async function copyBriefingToClipboard() {
  const briefing = state.briefing?.data;
  if (!briefing) {
    toast('Generate briefing first.', 'warning');
    return;
  }
  const text = [
    `Overview: ${briefing.overview || ''}`,
    '',
    'Internal:',
    ...(briefing.internalHighlights || []),
    '',
    'External:',
    ...(briefing.externalHighlights || []),
    '',
    'Talking points:',
    ...(briefing.talkingPoints || []),
    '',
    'Next steps:',
    ...(briefing.nextSteps || []),
    '',
    'Email draft:',
    briefing.emailDraft || ''
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    toast('Briefing copied', 'success');
  } catch {
    toast('Copy failed', 'warning');
  }
}
