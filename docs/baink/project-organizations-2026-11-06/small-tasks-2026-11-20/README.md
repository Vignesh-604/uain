# 10 new follow-on tasks (20 November 2026)

Operator request, 20 November 2026: open 10 new tasks.

Nothing here is opened, signed or funded. The files are a batch ready for review and for the
manager stage on the custody host.

## Files

- `drafts.json`: 10 of the 12 small-task drafts from `../small-tasks-2026-11-07/drafts.json`.
  Task text, criteria, prices and prior-art notes are **unchanged**. Two drafts were dropped
  (see `dropped`).
- `candidates.draft.json`: the same 10 tasks converted by
  `services/project-organizations/ops/manager-candidates.mjs build`. It passes
  `manager-candidates.mjs check` against the frozen selection. `reviewed.by` says
  `PENDING operator review` on purpose: rebuild it with your own name once you have read the tasks.

## The 10 tasks

| # | Project | Task | Est. | Solver / reviewer (micro-units) | Trials the query returns today |
|---|---|---|---|---|---|
| 1 | OPP-00002 | Senolytic trials completed: registered versus published primary outcomes audit | 50 min | 200000000 / 50000000 | 23 |
| 2 | OPP-00002 | Senolytic trial arms: dosing-interval census from the registry | 45 min | 150000000 / 40000000 | 64 |
| 3 | OPP-00004 | Thymic function outcome measures in completed adult intervention trials: census | 45 min | 150000000 / 40000000 | 39 |
| 4 | OPP-00005 | Mesenchymal stem cell frailty and ageing trials: registered versus published primary outcomes | 40 min | 200000000 / 50000000 | 9 |
| 5 | OPP-00006 | Alagebrium crosslink breaker trials: results-reporting audit | 35 min | 150000000 / 40000000 | 13 |
| 6 | OPP-00007 | Urolithin, elamipretide and MitoQ ageing muscle trials: registered versus published primary outcomes | 50 min | 200000000 / 50000000 | 15 |
| 7 | OPP-00007 | Phosphocreatine recovery and ATPmax endpoints in ageing muscle trials: registry census | 35 min | 150000000 / 40000000 | 16 |
| 8 | OPP-00009 | Telomerase activator trials (TA-65, danazol, cycloastragenol): registered versus published telomere outcomes | 35 min | 150000000 / 40000000 | 9 |
| 9 | OPP-00010 | Metformin ageing trials completed: registered versus published primary outcomes | 45 min | 200000000 / 50000000 | 12 |
| 10 | OPP-00014 | Plasma exchange and young plasma ageing trials: registered versus published primary outcomes | 35 min | 150000000 / 40000000 | 9 |

Checks run on 20 November 2026:
- None of the 10 titles exists on uain.global (open, answered, under review or closed).
- All 8 projects exist natively and are `active`.
- Each task's fixed ClinicalTrials.gov API query returns 9 to 64 studies, so each fits in under an hour.

Dropped:
- OPP-00008 (rapamycin/everolimus/spermidine audit): `P-OPP-00008` is not a native project yet.
- OPP-00003 (epigenetic-clock reporting audit): overlaps answered task T-45.

## Important: the manager stage will hold these today

`manager-stage.mjs` only proposes follow-on tasks for a project whose **prior-art survey is
accepted** and that has **no other open task**. On 20 November 2026 every one of these 8 projects
still has open survey parts (for example OPP-00010 has 8 open parts). The stage will report
them as gated and open nothing until those surveys finish.

The choice is the operator's:
1. **Wait (follows the process).** Install the candidates now. Each project gets its tasks as
   soon as its survey is accepted.
2. **Open now.** This needs a deliberate exception to the survey gate. Record that decision
   before signing. The trusted prior-art search, independent assessment and pricing still have
   to run for each task.

## Steps on the custody host (root)

```bash
# The organizations release is /opt/uain-organizations/current (a reviewed release link).
# Deploy a release that contains this folder first, then:
cd /opt/uain-organizations/current
NODE=/opt/uain-review-runtime/node-v22.22.0-linux-x64/bin/node

# 1. Review the 10 tasks, then rebuild the candidates with your name
$NODE services/project-organizations/ops/manager-candidates.mjs build \
  docs/baink/project-organizations-2026-11-06/small-tasks-2026-11-20/drafts.json \
  --reviewed-by "<your name>" --reviewed-at <YYYY-MM-DD> \
  --source small-tasks-2026-11-20/drafts.json > /tmp/candidates.json
$NODE services/project-organizations/ops/manager-candidates.mjs check /tmp/candidates.json

# 2. Install root-owned and private
install -o root -g root -m 0600 /tmp/candidates.json /etc/uain-custody/manager-stage/candidates.json

# 3. Make sure the 8 projects are in /etc/uain-custody/manager-stage/config.json "projects"

# 4. Dry check: gates and candidate counts, no model call, no write
/opt/uain-custody/venv/bin/python -I /opt/uain-custody/manager_stage.py check

# 5. Let the timer run (uain-manager-stage.timer), or run once:
systemctl start uain-manager-stage.service
```

Step 5 runs the trusted prior-art search, the independent assessment and pricing for each
candidate. It writes batches under `/var/lib/uain-custody/manager-stage/batches/<OPP>/` and
signs each `central_task_open` with the project manager key through `project_organizations.py sign`.
Afterwards, check that the tasks appear at https://uain.global/tasks.
