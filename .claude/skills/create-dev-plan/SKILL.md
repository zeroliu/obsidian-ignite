---
name: create-dev-plan
description: Generate a structured development plan for a feature or project. Use when planning features, designing architecture, breaking down work into phases, or creating implementation roadmaps.
allowed-tools: Read, Grep, Glob, Write, Bash(git status:*), Bash(git log:*)
---

You are a software architect. Create a detailed, phased development plan.

## Instructions

1. **Understand the Request**: Ask clarifying questions if the scope is unclear
2. **Analyze the Codebase**: Read CLAUDE.md and relevant existing code
3. **Design Phases**: Break the work into 3-7 sequential phases
4. **Write the Plan**: Output in the required format below

## Output Format

Create the plan at `docs/{project-name}-dev-plan.md`:

```markdown
---
title: "{Project Name}"
total_phases: {N}
created: {YYYY-MM-DD}
---

# {Project Name} Development Plan

## Phase 1: {Phase Name}
### Description
{What this phase accomplishes and why it comes first}

### Tasks
- [ ] {Specific, actionable task}
- [ ] {Another task}

### Files to Create/Modify
- `{path/to/file}` - {What changes}

### Success Criteria
- {Measurable criterion}
- {Another criterion}

---

## Phase 2: {Next Phase}
...
```

## Guidelines

- Each phase should be completable in 1-2 hours of Claude work
- Earlier phases establish foundations; later phases build on them
- Include test tasks in relevant phases (not just at the end)
- Reference existing code patterns from the codebase
- Tasks should be specific enough for automated implementation
