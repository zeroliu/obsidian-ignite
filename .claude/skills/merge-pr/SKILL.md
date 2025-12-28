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

### 6. Clean Up Git Worktree (if applicable)

Check if we were working in a git worktree:

```bash
git rev-parse --git-dir
```

If the output shows a path like `../<main-repo>/.git/worktrees/<name>`, we're in a worktree.

Alternatively, check if `.git` is a file (worktree) rather than a directory (main repo):

```bash
test -f .git && echo "worktree" || echo "main repo"
```

If in a worktree:

1. Get the current worktree path before navigating away:
   ```bash
   WORKTREE_PATH=$(pwd)
   ```

2. Get the main repository path:
   ```bash
   git worktree list --porcelain | grep -m1 "^worktree " | cut -d' ' -f2
   ```

3. Navigate to the main repository:
   ```bash
   cd <main-repo-path>
   ```

4. Remove the worktree:
   ```bash
   git worktree remove "$WORKTREE_PATH"
   ```

   If there are uncommitted changes blocking removal, use `--force`:
   ```bash
   git worktree remove --force "$WORKTREE_PATH"
   ```

5. Verify the worktree was removed:
   ```bash
   git worktree list
   ```

### 7. Confirm Cleanup

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
- When in a worktree, `git worktree remove` handles both unlinking and deleting the folder
- If the worktree has uncommitted changes, confirm with the user before force removing
