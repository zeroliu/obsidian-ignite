---
name: merge-pr
description: Merge the current PR, checkout back to main, pull latest changes, and clean up the local branch. Use when the user wants to complete a PR workflow after it has been approved.
---

# Merge PR and Cleanup

Merge the current pull request and clean up the local branch.

## Instructions

Follow these steps in order:

### 1. Verify Current State

Check the current branch and PR status:

```bash
git branch --show-current
gh pr status
```

Confirm there is an open PR for the current branch before proceeding.

### 2. Merge the Pull Request

Merge the PR using squash merge (or the repository's default merge strategy):

```bash
gh pr merge --squash --delete-branch
```

Note: `--delete-branch` deletes the remote branch after merging.

If the user prefers a different merge strategy, use one of:
- `gh pr merge --merge --delete-branch` (merge commit)
- `gh pr merge --rebase --delete-branch` (rebase)

### 3. Checkout Main Branch

Switch back to the main branch:

```bash
git checkout main
```

### 4. Pull Latest Changes

Pull the latest changes from the remote:

```bash
git pull origin main
```

### 5. Clean Up Local Branch

The remote branch was already deleted by `--delete-branch`. Now delete the local branch:

```bash
git branch -d <branch-name>
```

Use `-D` (force delete) only if `-d` fails and you're certain the branch was merged.

### 6. Confirm Cleanup

Verify the cleanup was successful:

```bash
git branch
git log --oneline -3
```

## Important Notes

- Always verify the PR is approved and CI checks pass before merging
- Never force merge a PR that has failing checks
- If merge conflicts exist, inform the user and do not proceed
- The branch name for cleanup is the branch you were on before checking out main
