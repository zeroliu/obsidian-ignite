---
name: git-tree
description: Create a new git worktree for working on a feature in isolation. Handles stashing uncommitted changes and sets up a parallel development environment. Use when starting work on a new feature that should be isolated from the current branch.
---

# Create Git Worktree

Create a new git worktree for isolated feature development.

## Instructions

Follow these steps in order:

### 1. Get Feature Name

If the user provided a feature name/description as an argument, use that. Otherwise, ask the user:

> What feature or task will you be working on in this worktree?

The feature name will be used to create the branch name and worktree directory.

### 2. Check for Uncommitted Changes

Check if there are any uncommitted changes (staged or unstaged):

```bash
git status --porcelain
```

If there are changes, stash them:

```bash
git stash push -m "Auto-stash before creating worktree for <feature>"
```

Remember whether you stashed changes for step 6.

### 3. Determine Branch Name

Create a branch name from the feature description:
- Use prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`
- Use kebab-case for the description
- Keep it concise but descriptive

Example: "user authentication" -> `feat/user-authentication`

### 4. Create the Worktree

Create the worktree in a sibling directory with the branch name:

```bash
git worktree add ../<repo-name>-<branch-name> -b <branch-name>
```

For example, if the repo is `my-project` and branch is `feat/auth`:
```bash
git worktree add ../my-project-feat-auth -b feat/auth
```

### 5. Set Up the Worktree

Navigate to the new worktree and install dependencies if needed:

```bash
cd ../<worktree-directory>
```

Check if package.json exists and run install if so:
```bash
npm install
```

Copy .env file from the original directory if it exists:
```bash
cp <original-directory>/.env .env 2>/dev/null || true
```

### 6. Restore Stashed Changes

If changes were stashed in step 2, restore them in the **original** directory:

```bash
cd <original-directory>
git stash pop
```

### 7. Provide Next Steps

Tell the user:

1. The worktree location (full path)
2. The branch name created
3. How to start working:
   ```bash
   cd <worktree-path>
   claude
   ```
4. How to list all worktrees: `git worktree list`
5. How to remove the worktree when done: `git worktree remove <path>`

## Important Notes

- Never delete or modify existing worktrees without user confirmation
- The worktree shares git history with the main repo but has isolated working files
- Each worktree should have its own Claude Code session for best results
- If a branch with the same name already exists, ask the user if they want to use it or choose a different name
