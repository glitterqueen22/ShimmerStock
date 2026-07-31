# Branch Protection Rules — `main`

This document lists the branch protection rules that must be configured on GitHub for the `main` branch. Only the repository owner (or someone with admin access) can configure these settings.

---

## How to Configure

1. Go to the repository on GitHub: `glitterqueen22/ShimmerStock`
2. Click **Settings** (top bar, right side)
3. In the left sidebar, click **Branches** (under "Code and automation")
4. Under "Branch protection rules", click **Add rule** (or edit the existing `main` rule if one exists)
5. In the "Branch name pattern" field, enter: `main`
6. Configure the settings below
7. Click **Create** (or **Save changes**) at the bottom

---

## Required Settings

### Require a pull request before merging
**Check this box ON.** When checked, configure its sub-options:

- **Require approvals:** Check ON. Set "Required number of approvals before merging" to **1**.
- **Dismiss stale pull request approvals when new commits are pushed:** Check ON. If someone pushes new commits after approval, the approval is reset.
- **Require review from Code Owners:** Leave OFF (no CODEOWNERS file configured yet).

### Require status checks to pass before merging
**Check this box ON.** Configure:

- **Require branches to be up to date before merging:** Check ON. This ensures PR branches are rebased onto the latest `main` before they can be merged.
- **Status checks that are required:** In the search box, type `ci` and select the **CI** workflow job that appears. (You must have run the CI workflow at least once on a PR for it to appear in this list — push any PR first, then return here to select it.)

### Require conversation resolution before merging
**Check this box ON.** All review threads/comments must be marked as resolved before merging.

### Do not allow bypassing the above settings
At the very bottom of the page, ensure these are checked:

- **Do not allow bypassing the above settings:** Check ON. This prevents even administrators from merging without meeting the requirements.
- **Allow deletions:** Leave OFF.
- **Allow force pushes:** Leave OFF.

---

## Summary Checklist for the Owner

| Setting | Value |
|---------|-------|
| Require pull request before merging | ON |
| Required approvals | 1 |
| Dismiss stale approvals on new commits | ON |
| Require status checks | ON |
| Require branches up to date | ON |
| Required check name | `CI` / `ci` |
| Require conversation resolution | ON |
| Do not allow bypassing (admins included) | ON |
| Allow deletions | OFF |
| Allow force pushes | OFF |

---

## Verifying the Setup

After configuring:

1. Create a test PR from any branch to `main`
2. Confirm that the "Merge" button is **grayed out** until:
   - The `CI` workflow completes successfully (green check)
   - At least 1 approving review is submitted
   - The branch is up to date with `main`
3. Confirm that even an admin cannot bypass these requirements

---

## Troubleshooting

**"CI" doesn't appear in the status checks list:**
The CI workflow must run at least once on a PR targeting `main` before GitHub recognizes it as an available check. Push any open PR first, wait for the CI workflow to complete, then return to branch protection settings — `CI` will appear in the searchable list.

**CI workflow fails on first run:**
The type-check step (`tsc --noEmit`) is set to `continue-on-error: true` and will not block the build. The build check (`bun run build`) is the hard gate. If the build fails, check the error log in the Actions tab.
