---
name: code-review
description: Review code changes for quality, security, and best practices. Use when reviewing PRs, checking recent changes, or auditing code before merging.
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Please review my recent code changes and provide feedback on:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security concerns
- Test coverage

Use the repository's CLAUDE.md for guidance on style and conventions.
Be constructive and helpful in your feedback.

First, run `git diff` to see the changes.

Output your review in this exact format:

## Critical Issues (must fix)
- [file:line] Description of critical issue
- [file:line] Another critical issue

## Warnings (should fix)
- [file:line] Description of warning
- [file:line] Another warning

## Suggestions (nice to have)
- [file:line] Suggestion for improvement

## Summary
**VERDICT: PASS** or **VERDICT: FAIL**

Brief explanation of the overall assessment.
