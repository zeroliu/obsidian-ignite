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

### 2. Detect Worktree Context

Check if we're in a git worktree (not the main repo):

```bash
test -f .git && echo "worktree" || echo "main repo"
```

If `.git` is a file, we're in a worktree. **Follow the Worktree Workflow below.**
If `.git` is a directory, we're in the main repo. **Follow the Main Repo Workflow below.**

---

## Worktree Workflow

Use this workflow when running from a git worktree.

### W1. Save Context Before Navigating Away

Before doing anything destructive, save the current context:

```bash
BRANCH_NAME=$(git branch --show-current)
WORKTREE_PATH=$(pwd)
MAIN_REPO=$(git worktree list --porcelain | grep -m1 "^worktree " | cut -d' ' -f2)
echo "Branch: $BRANCH_NAME"
echo "Worktree: $WORKTREE_PATH"
echo "Main repo: $MAIN_REPO"
```

### W2. Navigate to Main Repo First

**Critical:** Navigate to the main repo BEFORE any destructive operations. This prevents "path does not exist" errors after the worktree is removed.

```bash
cd "$MAIN_REPO"
```

### W3. Merge the PR (Without Local Checkout)

Merge the PR without the `--delete-branch` flag (which tries to checkout main locally):

```bash
gh pr merge --squash
```

If the user prefers a different merge strategy:
- `gh pr merge --merge` (merge commit)
- `gh pr merge --rebase` (rebase)

### W4. Delete Remote Branch

Delete the remote branch manually:

```bash
git push origin --delete "$BRANCH_NAME"
```

Note: This may fail if the branch was already deleted by GitHub's auto-delete setting. That's fine.

### W5. Remove the Worktree

Remove the worktree from the main repo:

```bash
git worktree remove "$WORKTREE_PATH"
```

If there are uncommitted changes blocking removal, confirm with user then use:
```bash
git worktree remove --force "$WORKTREE_PATH"
```

### W6. Clean Up Local Branch

Delete the local branch:

```bash
git branch -d "$BRANCH_NAME"
```

Use `-D` (force delete) only if `-d` fails and you're certain the branch was merged.

### W7. Pull Latest Changes

Pull the latest changes on main:

```bash
git pull origin main
```

### W8. Confirm Cleanup

Verify everything was cleaned up:

```bash
git worktree list
git branch
git log --oneline -3
```

---

## Main Repo Workflow

Use this workflow when running from the main repo (not a worktree).

### M1. Merge the Pull Request

Merge the PR using squash merge:

```bash
gh pr merge --squash --delete-branch
```

Note: `--delete-branch` deletes the remote branch after merging.

If the user prefers a different merge strategy:
- `gh pr merge --merge --delete-branch` (merge commit)
- `gh pr merge --rebase --delete-branch` (rebase)

### M2. Checkout Main Branch

Switch back to the main branch:

```bash
git checkout main
```

### M3. Pull Latest Changes

Pull the latest changes from the remote:

```bash
git pull origin main
```

### M4. Clean Up Local Branch

The remote branch was already deleted by `--delete-branch`. Now delete the local branch:

```bash
git branch -d <branch-name>
```

Use `-D` (force delete) only if `-d` fails and you're certain the branch was merged.

### M5. Confirm Cleanup

Verify the cleanup was successful:

```bash
git branch
git log --oneline -3
```

---

## Important Notes

- Always verify the PR is approved and CI checks pass before merging
- Never force merge a PR that has failing checks
- If merge conflicts exist, inform the user and do not proceed
- The branch name for cleanup is the branch you were on before checking out main
- When in a worktree, navigate to the main repo BEFORE any destructive operations
- If the worktree has uncommitted changes, confirm with the user before force removing
