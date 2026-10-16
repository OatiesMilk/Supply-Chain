from pathlib import Path
from datetime import datetime, timezone, timedelta
import json, subprocess, re

qa=Path(__file__).resolve().parents[1]
run='RUN-20261015-08'
art=qa/'artifacts'/run
raw=json.loads((art/'sales-results.json').read_text())
superseded={
 'TC-ACC-002':'Initial route observations were captured before the session loader finished. SC-ACCESS-002 is the authoritative route/API check.',
 'SC-API-001':'Included /account-managers, which is not a registered API route. SC-API-002 covers the five actual resource APIs. This 404 is a probe-definition error, not an application defect.',
 'SC-DEL-001':'Matched reference text against a table that renders Record ID. The screenshot already showed the correct single result. SC-DEL-008 verifies the expected ID and total.',
 'SC-MD-001':'Expected role=tab in a customer workspace that renders ordinary buttons. SC-MD-003 verifies the actual controls and audit API.'
}
reviewed=[r for r in raw['results'] if r['id'] not in superseded]
assert len(reviewed)==21 and sum(r['status']=='Pass' for r in reviewed)==17 and sum(r['status']=='Fail' for r in reviewed)==4
refs={'TC-ACC-001':'DEF-003','SC-ACCESS-002':'DEF-003','SC-DEL-004':'DEF-005','SC-SEARCH-001':'DEF-030'}
revision=subprocess.check_output(['git','rev-parse','--short','HEAD'],text=True).strip()
branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip()
meta={'run':run,'build':revision,'branch':branch,'scope':'Sales Coordinator read-only QA and anonymous access','account':'dagodemarcgeraldarante@gmail.com','reviewedChecks':21,'pass':17,'fail':4,'rawAttempts':len(raw['results']),'supersededDiagnostics':superseded,'writeTests':'Blocked: disposable local database configuration guard failed','otherRoles':'Blocked: no authenticated Logistics, Driver, TASS or Admin session','results':reviewed}
(art/'reviewed-results.json').write_text(json.dumps(meta,indent=2)+'\n')

def clean(value):
 text=value if isinstance(value,str) else json.dumps(value,ensure_ascii=False)
 return re.sub(r'\x1b\[[0-9;]*m','',text).replace('|','\\|').replace('\n','<br>')
def evidence_cell(r):
 return f"[{r['screenshot']}](../artifacts/{run}/{r['screenshot']}) · [action trace](../artifacts/{run}/{r['id']}-actions.zip)"
rows='\n'.join(f"| {r['id']} | {r['title']} | {r['status']} | {refs.get(r['id'],'—')} | {evidence_cell(r)} |" for r in reviewed)
actual='\n\n'.join(f"### {r['id']}: {r['title']}\n\nCoverage: {r['coverage']}.\n\nObserved: {clean(r['actual'])}\n\nStatus: **{r['status']}**. {evidence_cell(r)}." for r in reviewed)
start=datetime.fromisoformat(raw['started'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).isoformat()
end=datetime.fromisoformat(raw['ended'].replace('Z','+00:00')).astimezone(timezone(timedelta(hours=8))).isoformat()
report=f'''# Sales Coordinator QA: {run}

| Document control | Value |
|---|---|
| Title | Sales Coordinator read-only QA |
| Date | 2026-10-15 |
| Status | Read-only phase complete; write and other-role phases Blocked |
| Build | {revision}, branch {branch}, working tree |
| Account | dagodemarcgeraldarante@gmail.com — SALES_COORDINATOR |
| Time (Asia/Manila) | {start} to {end} |

## Result

**21 reviewed checks: 17 Pass, 4 Fail**, with three existing findings reproduced: DEF-003 (Major/P1), DEF-005 (Trivial/P4, label subset) and DEF-030 (Minor/P3, adapted Sales check). These are focused checks, not 21 complete approved UAT cases. Twenty checks used the Sales Coordinator session; one used a separate anonymous context.

The execution produced 25 raw attempts. Four preliminary attempts had timing, locator or endpoint-definition errors and are superseded explicitly below; they are not counted as application failures. Original evidence and raw outcomes remain preserved in [sales-results.json](../artifacts/{run}/sales-results.json). The authoritative reviewed set is [reviewed-results.json](../artifacts/{run}/reviewed-results.json).

Microsoft sign-in and user-completed MFA established the correct account/role. Only read operations were performed on business data. The current database configuration failed the repository's local `_sandbox`/`_test` guard, so submissions, edits, uploads and destructive/refusal probes were not performed. No application code, environment files, roles, permissions, seed data, commits or branches changed. Cookies and authentication tokens were not exported. The QA browser was closed after these checks.

## Passed behavior

- Pending Driver Assignment and On-Hold dashboard cards matched list totals: 23/23 and 3/3.
- Admin, SKU Master and Driver Manager direct routes redirected to Dashboard; the users API returned 403.
- Delivery resource reads, reference search, Draft filtering and invalid-filter rejection worked. Inverted dates, a 101-character search and unknown status returned the specified HTTP 400 errors.
- Existing record detail, audit (five events), document metadata and a Draft workspace were readable. Sales had no Dispatch & Logistics tab or delete control.
- Transaction Center offered exactly the three Sales categories and returned 79 transactions across those categories, without RMA or Accounting Collection.
- Customer and supplier reads, customer audit access, AM Directory, empty notifications and refresh persistence worked. The selected pre-existing customer's audit list was empty; this establishes access only, not creation-audit correctness.
- The settled Sales chart displayed five nonzero bars; Delivered tooltip matched 33 delivered records. This does not retest the Admin chart case.
- Anonymous access redirected to Login, with HTTP 401 for records and users APIs.

## Findings

### DEF-003 — approved Calendar and Reports access remains denied

The sidebar omitted both modules. Direct Calendar/Reports URLs redirected to Dashboard, and `GET /api/reports/summary` returned HTTP 403 with `{{"error":"Module access denied"}}`. Admin route redirects and the users API 403 were expected protections and passed their subchecks. The access case fails because the approved Sales modules are unavailable. The POST driver refusal step was blocked and is not claimed as executed.

![Sales sidebar](../artifacts/{run}/TC-ACC-001-01-sidebar.png)

### DEF-005 — Delivery Date still says optional

The create form displayed “Delivery Date (optional)”. Only the label was checked; submission rejection was not rerun because write tests were blocked. The existing label issue remains observed.

![Delivery Date label](../artifacts/{run}/SC-DEL-004-01-date-label.png)

### DEF-030 — direct Enter leaves global-search overlay open

A one-character query showed the minimum-length prompt, and a full reference produced one result. Direct Enter left the overlay open at Dashboard. A separate keyboard control using ArrowDown then Enter opened the record and closed the overlay. This is a Sales-account adaptation; the original Logistics-role case was not rerun.

![Search after Enter](../artifacts/{run}/SC-SEARCH-001-02-failure.png)

## Reviewed checks

| Check | Description | Status | Defect | Evidence |
|---|---|---|---|---|
{rows}

## Observations and coverage per check

{actual}

## Superseded execution diagnostics

'''+ '\n'.join(f"- **{case}**: {reason}" for case,reason in superseded.items())+f'''

These corrections changed only evidence-capture checks. Application source, configuration and data were not changed to make a check pass. The original screenshots distinguish transient loading, an invalid endpoint and mismatched selectors from application findings.

## Blocked and unexecuted scope

- **Blocked — current target not verified disposable:** Delivery create/submit/edit/comment writes, malformed create probes, attachment uploads/removals, master-data writes and driver-assignment refusal writes. TC-ACC-002's POST step and TC-DEL-004's submission step are explicitly unexecuted.
- **Blocked — other-role sessions unavailable:** Logistics dispatch, Driver Time In/completion, TASS/Admin behavior, permission overrides and multi-role privacy/concurrency workflows. No role was impersonated.
- **Not Run — cycle exclusions:** RMA, Accounting Collection, Procurement Pick-up and Sales Orders workflows, TASS-specific work and completion email remain deferred under the existing plan. Reading Sales transaction scope does not execute those workflows.
- Sign-out was not exercised in this read-only phase. Other historical defects retain their previous status; absence from this focused run does not resolve them.

## Recommendation

**No-Go for UAT sign-off.** A Major approved-access finding remains open, and write/multi-role coverage is blocked. The next phase requires a running API against a verified disposable local target plus the relevant role sessions. This report does not authorize seeding, resetting or changing the current environment.

[Artifact index](../artifacts/{run}/index.md)
'''
(qa/'06-reports'/f'UAT-summary-{run}.md').write_text(report)
execution=qa/'04-execution'/run;execution.mkdir(exist_ok=True)
(execution/'execution-log.md').write_text(report.replace('../artifacts/','../../artifacts/'))

# Update only cells of cases with observed acceptance results. Partial coverage is explicit.
updates={
 'TC-ACC-001':('Sales sidebar shows Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders, Customers, Suppliers, AM Directory and Transaction Center; Delivery Calendar and Reports are missing. No Drivers, SKU Master, Data Sampler or Admin Panel item. Microsoft Sales account used instead of seeded Maria Reyes.','Fail','TC-ACC-001-01-sidebar.png','DEF-003'),
 'TC-ACC-002':('Steps 1-4 checked after session loading: Admin, inventory and driver-manager routes redirect to Dashboard as expected; Calendar and Reports also redirect to Dashboard, contrary to approved access. GET users returns 403 Module access denied; GET reports/summary returns 403 Module access denied. POST drivers step 5 Blocked by disposable-target guard.','Fail','SC-ACCESS-002-08-failure.png','DEF-003'),
 'TC-RPT-001':('Microsoft Sales account: Pending Driver Assignment card 23 and drilldown total 23; On-Hold Items card 3 and drilldown total 3.','Pass','TC-RPT-001-03-result.png','—'),
 'TC-AUTH-011':('New anonymous context: /admin redirects to /login and Microsoft sign-in button is visible. GET records returns 401 with error Not authenticated; GET users returns 401 with the same error. Authenticated Sales context remained separate.','Pass','TC-AUTH-011-01-anonymous-login.png','—'),
 'TC-DEL-004':('Label subset observed: create form reads Delivery Date (optional), contrary to the required-label expectation. Submit/cancel validation step was not run because the disposable database guard blocked writes. Form was cancelled without submission.','Fail','SC-DEL-004-01-date-label.png','DEF-005')
}
for file in (qa/'02-test-design/test-cases').glob('*.md'):
 text=file.read_text()
 for case,(observed,status,shot,defect) in updates.items():
  pattern=r'(### '+re.escape(case)+r':[^\n]*\n)(.*?)(?=\n### |\Z)'
  match=re.search(pattern,text,re.S)
  if not match:continue
  block=match.group(0)
  values={'Actual Result':observed,'Status':status,'Evidence':f'[{shot}](../../artifacts/{run}/{shot})','Defect ID':defect}
  for key,value in values.items():
   block=re.sub(r'^\| '+key+r' \|.*$',lambda _:f'| {key} | {run}: {value} |',block,flags=re.M)
  text=text[:match.start()]+block+text[match.end():]
 file.write_text(text)

# Append retest evidence to existing findings; no new duplicate defects.
for defect,shot,note in [
 ('DEF-003','TC-ACC-001-01-sidebar.png','Fail: Microsoft Sales sidebar omits Calendar/Reports; both routes redirect to Dashboard and Reports API returns 403. POST refusal probe not executed.'),
 ('DEF-005','SC-DEL-004-01-date-label.png','Fail, label subset: Delivery Date (optional) remains visible. Submission not attempted because the current target did not pass the disposable database guard.'),
 ('DEF-030','SC-SEARCH-001-02-failure.png','Fail, Sales-account adaptation: direct Enter on a unique global-search result leaves the overlay open; ArrowDown then Enter works. Original Logistics-role case not rerun.')]:
 file=next((qa/'05-defects').glob(defect+'-*.md'))
 text=file.read_text()+f'\n### Retest observation: {run}\n\n{note}\n\n![{defect} retest](../artifacts/{run}/{shot})\n\n[Focused run report](../06-reports/UAT-summary-{run}.md)\n'
 file.write_text(text)

files=sorted(p.name for p in art.iterdir() if p.name!='index.md')
(art/'index.md').write_text(f'# Artifact index: {run}\n\nAll files belong to the focused read-only Sales QA phase. Raw failed attempts and superseding checks are distinguished in the report. Traces record post-login actions/screenshots with network/DOM snapshots disabled.\n\n'+ '\n'.join(f'- [{name}]({name})' for name in files)+'\n')
print('Reviewed checks: 21; Pass: 17; Fail: 4; distinct existing findings: 3. Report and case observations written.')
