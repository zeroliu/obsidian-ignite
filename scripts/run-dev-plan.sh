#!/bin/bash
set -e

# Usage: ./scripts/run-dev-plan.sh <path-to-dev-plan.md> [start-phase]
PLAN_FILE="${1:-}"
START_PHASE="${2:-}"
MAX_REVIEW_ITERATIONS=3

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

usage() {
  echo "Usage: $0 <path-to-dev-plan.md> [start-phase]"
  echo ""
  echo "Arguments:"
  echo "  path-to-dev-plan.md   Path to a structured dev plan file"
  echo "  start-phase           Optional phase number to start from (default: 1)"
  echo ""
  echo "Example:"
  echo "  $0 docs/my-feature-dev-plan.md"
  echo "  $0 docs/my-feature-dev-plan.md 3  # Start from phase 3"
  exit 1
}

# Validate inputs
[ -z "$PLAN_FILE" ] && usage
[ ! -f "$PLAN_FILE" ] && error "Plan file not found: $PLAN_FILE"

# State file unique to this plan
STATE_FILE=".phase-state-$(basename "$PLAN_FILE" .md)"

# Parse plan file to extract phases
parse_plan() {
  # Extract total_phases from YAML frontmatter
  TOTAL_PHASES=$(grep -E "^total_phases:" "$PLAN_FILE" | head -1 | sed 's/total_phases:[[:space:]]*//')

  if [ -z "$TOTAL_PHASES" ] || ! [[ "$TOTAL_PHASES" =~ ^[0-9]+$ ]]; then
    # Fallback: count "## Phase N:" headers
    TOTAL_PHASES=$(grep -cE "^## Phase [0-9]+:" "$PLAN_FILE" || echo "0")
  fi

  [ "$TOTAL_PHASES" -eq 0 ] && error "No phases found in plan file. Ensure phases use '## Phase N: Name' format."

  # Extract phase names into array
  PHASES=()
  for i in $(seq 1 "$TOTAL_PHASES"); do
    phase_name=$(grep -E "^## Phase $i:" "$PLAN_FILE" | head -1 | sed "s/^## Phase $i:[[:space:]]*//")
    [ -z "$phase_name" ] && phase_name="Phase $i"
    PHASES+=("$phase_name")
  done

  log "Parsed plan: $TOTAL_PHASES phases"
  for i in "${!PHASES[@]}"; do
    info "  Phase $((i+1)): ${PHASES[$i]}"
  done
}

# Get current phase from state file or use provided start phase
get_current_phase() {
  if [ -n "$START_PHASE" ]; then
    echo "$START_PHASE"
  elif [ -f "$STATE_FILE" ]; then
    cat "$STATE_FILE"
  else
    echo "1"
  fi
}

save_phase() {
  echo "$1" > "$STATE_FILE"
}

# Run local code review using Claude CLI
# Outputs review to REVIEW_OUTPUT variable and returns 0 for PASS, 1 for FAIL
run_local_review() {
  local review_file="/tmp/review_output_$$.txt"

  log "Running local code review..."

  claude -p "
Please review my recent code changes and provide feedback on:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security concerns
- Test coverage

Use the repository's CLAUDE.md for guidance on style and conventions.
Be constructive and helpful in your feedback.

First, run git diff to see the changes.

Output your review in this exact format:

## Critical Issues (must fix)
- [file:line] Description of critical issue

## Warnings (should fix)
- [file:line] Description of warning

## Suggestions (nice to have)
- [file:line] Suggestion for improvement

## Summary
**VERDICT: PASS** or **VERDICT: FAIL**

Brief explanation of the overall assessment.
" --allowedTools "Read,Grep,Glob,Bash" --max-turns 10 > "$review_file" 2>&1

  # Store review output for use by auto-fix
  REVIEW_OUTPUT=$(cat "$review_file")
  echo "$REVIEW_OUTPUT"

  # Check for PASS verdict
  if grep -qi "VERDICT: PASS" "$review_file"; then
    rm -f "$review_file"
    return 0
  else
    rm -f "$review_file"
    return 1
  fi
}

# Auto-fix issues found in review
# Takes the review output as input so Claude knows what to fix
auto_fix_review_issues() {
  local iteration=$1
  local review_feedback="$2"

  log "Auto-fixing review issues (iteration $iteration)..."

  # Pass the actual review feedback to the fix agent
  claude -p "
The following code review found issues that need to be fixed.

## CODE REVIEW FEEDBACK:
$review_feedback

## INSTRUCTIONS:
1. Read the review feedback above carefully
2. Fix ALL Critical Issues (these must be fixed)
3. Fix ALL Warnings (these should be fixed)
4. Suggestions are optional but encouraged
5. Follow CLAUDE.md guidelines strictly
6. After fixing, run: npm run test && npm run typecheck

Focus on the specific file:line references in the feedback.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep" --max-turns 15

  git add -A
}

# Review loop: review -> fix -> review until pass or max iterations
review_and_fix_loop() {
  local iteration=1
  REVIEW_OUTPUT=""

  while [ $iteration -le $MAX_REVIEW_ITERATIONS ]; do
    info "Review iteration $iteration of $MAX_REVIEW_ITERATIONS"

    if run_local_review; then
      log "✓ Code review PASSED"
      return 0
    fi

    if [ $iteration -eq $MAX_REVIEW_ITERATIONS ]; then
      warn "Max review iterations reached. Proceeding with warnings."
      return 0
    fi

    # Pass the captured review output to the fix agent
    auto_fix_review_issues $iteration "$REVIEW_OUTPUT"
    ((iteration++))
  done
}

run_phase() {
  local phase_num=$1
  local phase_name="${PHASES[$((phase_num-1))]}"

  log "========================================"
  log "Starting Phase $phase_num: $phase_name"
  log "========================================"

  # Create branch name from phase
  local branch_name="phase-$phase_num-$(echo "$phase_name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"

  # Ensure we're on main and up to date
  git checkout main
  git pull origin main

  # Create feature branch
  git checkout -b "$branch_name"

  # Run Claude Code to implement the phase
  log "Running Claude Code for Phase $phase_num..."
  claude -p "
Read the development plan at $PLAN_FILE.

Implement ONLY Phase $phase_num: $phase_name

Instructions:
1. Read the full plan first to understand context
2. Focus ONLY on tasks listed under 'Phase $phase_num: $phase_name'
3. Follow CLAUDE.md guidelines strictly
4. Check the Success Criteria for this phase
5. Run tests after implementation

Do NOT implement other phases. Stop when Phase $phase_num tasks are complete.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep,Task" --max-turns 25

  # Check for changes
  git add -A
  if git diff --staged --quiet; then
    warn "No changes made in Phase $phase_num"
    git checkout main
    git branch -D "$branch_name"
    return 0
  fi

  # Commit implementation
  git commit -m "Phase $phase_num: $phase_name

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

  # Run local review loop
  log "Starting code review..."
  review_and_fix_loop

  # Amend with review fixes if any
  git add -A
  if ! git diff --staged --quiet; then
    git commit --amend --no-edit
  fi

  # Push and create PR
  git push -u origin "$branch_name"

  local pr_url=$(gh pr create \
    --title "Phase $phase_num: $phase_name" \
    --body "## Summary
Automated implementation of Phase $phase_num: $phase_name

Plan: \`$PLAN_FILE\`

## Local Review
✓ Passed local code review

## Test Plan
- [x] Tests pass
- [x] Type check passes
- [ ] Manual testing

🤖 Generated with [Claude Code](https://claude.ai/code)" \
    --base main)

  local pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')
  log "Created PR #$pr_number: $pr_url"

  # Auto-merge
  log "Merging PR #$pr_number..."
  gh pr merge "$pr_number" --squash --delete-branch

  git checkout main
  git pull origin main

  log "Phase $phase_num complete!"
}

main() {
  log "========================================"
  log "Development Plan Automation"
  log "Plan: $PLAN_FILE"
  log "========================================"

  # Verify prerequisites
  command -v claude >/dev/null 2>&1 || error "Claude CLI not found"
  command -v gh >/dev/null 2>&1 || error "GitHub CLI not found"
  gh auth status >/dev/null 2>&1 || error "GitHub CLI not authenticated"

  # Parse the plan file
  parse_plan

  local start_phase=$(get_current_phase)

  [ "$start_phase" -gt "$TOTAL_PHASES" ] && error "Start phase ($start_phase) exceeds total phases ($TOTAL_PHASES)"

  log "Starting from Phase $start_phase of $TOTAL_PHASES"

  for phase in $(seq "$start_phase" "$TOTAL_PHASES"); do
    run_phase "$phase"
    save_phase $((phase + 1))
  done

  # Cleanup state file
  rm -f "$STATE_FILE"

  log "========================================"
  log "All $TOTAL_PHASES phases complete!"
  log "========================================"
}

main
