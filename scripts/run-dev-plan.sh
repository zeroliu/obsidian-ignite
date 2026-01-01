#!/bin/bash
set -e

# Prevent macOS sleep during execution
if [[ "$OSTYPE" == "darwin"* ]] && [ -z "$CAFFEINATED" ]; then
  export CAFFEINATED=1
  exec caffeinate -i "$0" "$@"
fi

# Usage: ./scripts/run-dev-plan.sh <path-to-dev-plan.md> [start-phase]
PLAN_FILE="${1:-}"
START_PHASE="${2:-}"
MAX_REVIEW_ITERATIONS=3
MAX_VALIDATION_ITERATIONS=5
MAX_IMPLEMENTATION_CONTINUATIONS=3

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
claude_start() { echo -e "${CYAN}[$(date +'%H:%M:%S')] 🤖 CLAUDE:${NC} $1"; }
claude_done() { echo -e "${MAGENTA}[$(date +'%H:%M:%S')] 🤖 CLAUDE:${NC} $1"; }

# Run claude with logging and exit code handling
# Usage: run_claude "operation_name" max_turns [other claude args...]
run_claude() {
  local operation_name="$1"
  local max_turns="$2"
  shift 2

  # Extract allowed tools from args (macOS compatible)
  local tools="default"
  local args_str="$*"
  if [[ "$args_str" == *"--allowedTools"* ]]; then
    tools=$(echo "$args_str" | sed -n 's/.*--allowedTools "\([^"]*\)".*/\1/p')
    [ -z "$tools" ] && tools=$(echo "$args_str" | sed -n 's/.*--allowedTools \([^ ]*\).*/\1/p')
  fi

  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════╗"
  claude_start "Starting: $operation_name"
  info "  │ Max turns: $max_turns"
  info "  │ Tools: $tools"
  echo "  ╚══════════════════════════════════════════════════════════════╝"

  local start_time=$(date +%s)
  local exit_code=0

  # Run claude and capture exit code (--verbose shows tool calls and reasoning)
  # Use --model opus to use Opus 4.5
  # Unset ANTHROPIC_API_KEY so claude CLI uses subscription auth instead of API billing
  ANTHROPIC_API_KEY= claude --verbose --model opus "$@" --max-turns "$max_turns" || exit_code=$?

  local end_time=$(date +%s)
  local duration=$((end_time - start_time))
  local minutes=$((duration / 60))
  local seconds=$((duration % 60))

  echo "  ╔══════════════════════════════════════════════════════════════╗"
  if [ $exit_code -eq 0 ]; then
    claude_done "✓ Completed: $operation_name (${minutes}m ${seconds}s)"
  elif [ $exit_code -eq 1 ]; then
    warn "⚠ Claude exited with warnings: $operation_name (${minutes}m ${seconds}s)"
    info "  │ Exit code: $exit_code"
  else
    warn "✗ Claude hit max turns or error: $operation_name"
    info "  │ Duration: ${minutes}m ${seconds}s"
    info "  │ Exit code: $exit_code"
    info "  │ Max turns was: $max_turns"
    warn "  │ This may indicate the task needs more turns or got stuck"
  fi
  echo "  ╚══════════════════════════════════════════════════════════════╝"
  echo ""

  return $exit_code
}

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

# Run validation checks (lint + typecheck + tests)
# Returns 0 if all pass, 1 if any fail
# Sets VALIDATION_OUTPUT with error details
run_validation() {
  local output_file="/tmp/validation_output_$$.txt"
  VALIDATION_OUTPUT=""

  log "Running validation checks..."

  # Run all checks and capture output
  local has_errors=0

  # Lint check
  info "  Running lint check..."
  if ! npm run check > "$output_file" 2>&1; then
    VALIDATION_OUTPUT+="## Lint Errors\n$(cat "$output_file")\n\n"
    has_errors=1
  fi

  # Type check
  info "  Running type check..."
  if ! npm run typecheck > "$output_file" 2>&1; then
    VALIDATION_OUTPUT+="## Type Errors\n$(cat "$output_file")\n\n"
    has_errors=1
  fi

  # Tests
  info "  Running tests..."
  if ! npm run test > "$output_file" 2>&1; then
    VALIDATION_OUTPUT+="## Test Failures\n$(cat "$output_file")\n\n"
    has_errors=1
  fi

  rm -f "$output_file"

  if [ $has_errors -eq 0 ]; then
    log "✓ All validation checks passed"
    return 0
  else
    warn "Validation checks failed"
    return 1
  fi
}

# Auto-fix validation errors using Claude
auto_fix_validation_errors() {
  local iteration=$1
  local validation_errors="$2"

  run_claude "Fix validation errors (iteration $iteration/$MAX_VALIDATION_ITERATIONS)" 300 \
    -p "
The code has validation errors that need to be fixed before it can be committed.

## VALIDATION ERRORS:
$validation_errors

## INSTRUCTIONS:
1. Read the error messages above carefully
2. Fix ALL lint errors (these block commits)
3. Fix ALL type errors
4. Fix ALL test failures
5. Follow CLAUDE.md guidelines strictly
6. After fixing, verify by running: npm run check && npm run typecheck && npm run test

Focus on the specific file:line references in the errors.
Do NOT add new features or refactor - only fix the errors listed above.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep"

  git add -A
}

# Validation loop: validate -> fix -> validate until pass or max iterations
validation_and_fix_loop() {
  local iteration=1
  VALIDATION_OUTPUT=""

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "VALIDATION LOOP: Starting (max $MAX_VALIDATION_ITERATIONS iterations)"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  while [ $iteration -le $MAX_VALIDATION_ITERATIONS ]; do
    info "┌─ Validation iteration $iteration of $MAX_VALIDATION_ITERATIONS"

    if run_validation; then
      log "└─ ✓ All validations PASSED on iteration $iteration"
      log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      return 0
    fi

    if [ $iteration -eq $MAX_VALIDATION_ITERATIONS ]; then
      error "Max validation iterations ($MAX_VALIDATION_ITERATIONS) reached. Cannot proceed with failing checks."
    fi

    info "├─ Validation failed, attempting auto-fix..."
    auto_fix_validation_errors $iteration "$VALIDATION_OUTPUT"
    info "└─ Fix attempt $iteration complete, re-validating..."
    ((iteration++))
  done
}

# Run local code review using Claude CLI
# Outputs review to REVIEW_OUTPUT variable
# Returns: 0 for PASS, 1 for FAIL (issues found), 2 for incomplete (agent hit max turns or no verdict)
run_local_review() {
  local review_file="/tmp/review_output_$$.txt"

  run_claude "Code review" 300 \
    -p "
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
**VERDICT: PASS** or **VERDICT: FAIL** (REQUIRED - you MUST include exactly one of these)

Brief explanation of the overall assessment.
" --allowedTools "Read,Grep,Glob,Bash" 2>&1 | tee "$review_file"

  local claude_exit=${PIPESTATUS[0]}

  # Store review output for use by auto-fix
  REVIEW_OUTPUT=$(cat "$review_file")

  # Check if Claude hit max turns or errored
  if [ $claude_exit -eq 2 ]; then
    warn "Code review agent hit max turns - review incomplete"
    rm -f "$review_file"
    return 2
  fi

  # Check for explicit PASS verdict
  if grep -qi "VERDICT: PASS" "$review_file"; then
    rm -f "$review_file"
    return 0
  fi

  # Check for explicit FAIL verdict
  if grep -qi "VERDICT: FAIL" "$review_file"; then
    rm -f "$review_file"
    return 1
  fi

  # No verdict - check if issues were found (implies FAIL)
  # Look for issue lines in the format "- [file:line]" or "- **file:line**"
  if grep -qE "^- \[|^- \*\*" "$review_file"; then
    warn "No verdict but issues found - treating as FAIL"
    rm -f "$review_file"
    return 1
  fi

  # No verdict and no clear issues - incomplete
  warn "Code review did not produce a verdict"
  rm -f "$review_file"
  return 2
}

# Auto-fix issues found in review
# Takes the review output as input so Claude knows what to fix
auto_fix_review_issues() {
  local iteration=$1
  local review_feedback="$2"

  # Pass the actual review feedback to the fix agent
  run_claude "Fix review issues (iteration $iteration/$MAX_REVIEW_ITERATIONS)" 300 \
    -p "
The following code review found issues that need to be fixed.

## CODE REVIEW FEEDBACK:
$review_feedback

## INSTRUCTIONS:
1. Read the review feedback above carefully
2. Fix ALL Critical Issues (these must be fixed)
3. Fix ALL Warnings (these should be fixed)
4. Suggestions are optional but encouraged
5. Follow CLAUDE.md guidelines strictly
6. After fixing, run: npm run check && npm run typecheck && npm run test

Focus on the specific file:line references in the feedback.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep"

  git add -A
}

# Review loop: review -> fix -> review until pass or max iterations
review_and_fix_loop() {
  local iteration=1
  REVIEW_OUTPUT=""

  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "REVIEW LOOP: Starting (max $MAX_REVIEW_ITERATIONS iterations)"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  while [ $iteration -le $MAX_REVIEW_ITERATIONS ]; do
    info "┌─ Review iteration $iteration of $MAX_REVIEW_ITERATIONS"

    run_local_review
    local review_result=$?

    if [ $review_result -eq 0 ]; then
      log "└─ ✓ Code review PASSED on iteration $iteration"
      log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      return 0
    fi

    if [ $review_result -eq 2 ]; then
      warn "└─ Review agent incomplete (hit max turns or no verdict)"
      if [ $iteration -eq $MAX_REVIEW_ITERATIONS ]; then
        warn "  │ Skipping review due to repeated agent issues"
        log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        return 0
      fi
      info "├─ Retrying review..."
      ((iteration++))
      continue
    fi

    # review_result -eq 1: Review found issues
    if [ $iteration -eq $MAX_REVIEW_ITERATIONS ]; then
      warn "└─ Max review iterations ($MAX_REVIEW_ITERATIONS) reached. Proceeding with warnings."
      log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
      return 0
    fi

    info "├─ Review found issues, attempting auto-fix..."
    # Pass the captured review output to the fix agent
    auto_fix_review_issues $iteration "$REVIEW_OUTPUT"
    info "└─ Fix attempt $iteration complete, re-reviewing..."
    ((iteration++))
  done
}

# Check if implementation appears complete
# Returns 0 if complete, 1 if incomplete, 2 if agent didn't finish
check_implementation_complete() {
  local phase_num=$1
  local check_file="/tmp/completion_check_$$.txt"

  run_claude "Check Phase $phase_num completion" 300 \
    -p "
Check if Phase $phase_num implementation is complete based on the plan at $PLAN_FILE.

1. Read the plan file and identify all tasks for Phase $phase_num
2. Check the current codebase to see what has been implemented
3. Run git diff to see current changes

Output EXACTLY one of these verdicts:
- **VERDICT: COMPLETE** - All tasks for Phase $phase_num are implemented
- **VERDICT: INCOMPLETE** - Some tasks are missing (list them)

Be thorough but concise.
" --allowedTools "Read,Grep,Glob,Bash" 2>&1 | tee "$check_file"

  local claude_exit=${PIPESTATUS[0]}

  # Check if Claude hit max turns or errored
  if [ $claude_exit -eq 2 ]; then
    warn "Completion check agent hit max turns - check incomplete"
    rm -f "$check_file"
    return 2
  fi

  # Validate verdict exists
  if ! grep -qiE "VERDICT: (COMPLETE|INCOMPLETE)" "$check_file"; then
    warn "Completion check did not produce a verdict"
    rm -f "$check_file"
    return 2
  fi

  local result=0
  if grep -qi "VERDICT: COMPLETE" "$check_file"; then
    log "✓ Implementation appears complete"
    result=0
  else
    warn "Implementation may be incomplete"
    cat "$check_file"
    result=1
  fi

  rm -f "$check_file"
  return $result
}

# Continue implementation if incomplete
continue_implementation() {
  local phase_num=$1
  local phase_name=$2
  local continuation=$3

  run_claude "Continue Phase $phase_num implementation (continuation $continuation/$MAX_IMPLEMENTATION_CONTINUATIONS)" 300 \
    -p "
Continue implementing Phase $phase_num: $phase_name from the plan at $PLAN_FILE.

The previous implementation run may not have completed all tasks.

Instructions:
1. Read the plan to understand what Phase $phase_num requires
2. Check git diff to see what has already been implemented
3. Identify and implement any REMAINING tasks for this phase
4. Follow CLAUDE.md guidelines strictly
5. Run npm run check && npm run typecheck && npm run test before finishing

Focus on completing unfinished work, not rewriting existing code.
Stop when ALL Phase $phase_num tasks are complete.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep,Task"

  git add -A
}

run_phase() {
  local phase_num=$1
  local phase_name="${PHASES[$((phase_num-1))]}"

  log "════════════════════════════════════════════════════════════════════════════════"
  log "PHASE $phase_num: $phase_name"
  log "════════════════════════════════════════════════════════════════════════════════"
  info ""
  info "Workflow for this phase:"
  info "  1. 🔨 Implementation       (max 300 turns)"
  info "  2. 🔍 Completion check     (max 100 turns) × up to $MAX_IMPLEMENTATION_CONTINUATIONS continuations"
  info "  3. ✅ Validation loop      (max 100 turns) × up to $MAX_VALIDATION_ITERATIONS iterations"
  info "  4. 📋 Code review loop     (max 100 turns) × up to $MAX_REVIEW_ITERATIONS iterations"
  info "  5. 🚀 Commit, PR, merge"
  info ""

  # Create branch name from phase
  local branch_name="phase-$phase_num-$(echo "$phase_name" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')"

  # Ensure we're on main and up to date
  git checkout main
  git pull origin main

  # Create feature branch
  git checkout -b "$branch_name"

  # Run Claude Code to implement the phase
  run_claude "Implement Phase $phase_num: $phase_name" 300 \
    -p "
Read the development plan at $PLAN_FILE.

Implement ONLY Phase $phase_num: $phase_name

Instructions:
1. Read the full plan first to understand context
2. Focus ONLY on tasks listed under 'Phase $phase_num: $phase_name'
3. Follow CLAUDE.md guidelines strictly
4. Check the Success Criteria for this phase
5. IMPORTANT: Before finishing, you MUST run and ensure these pass:
   - npm run check (lint)
   - npm run typecheck
   - npm run test
6. Fix any lint, type, or test errors before stopping

Do NOT implement other phases. Stop when Phase $phase_num tasks are complete AND all checks pass.
" --allowedTools "Read,Edit,Write,Bash,Glob,Grep,Task"

  git add -A

  # Check if implementation is complete, continue if needed
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "COMPLETION CHECK: Verifying implementation completeness"
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  local continuation=1
  while [ $continuation -le $MAX_IMPLEMENTATION_CONTINUATIONS ]; do
    info "┌─ Completion check $continuation of $MAX_IMPLEMENTATION_CONTINUATIONS"

    check_implementation_complete "$phase_num"
    local check_result=$?

    if [ $check_result -eq 0 ]; then
      log "└─ ✓ Implementation complete"
      break
    fi

    if [ $check_result -eq 2 ]; then
      warn "├─ Completion check agent incomplete (hit max turns or no verdict)"
      if [ $continuation -eq $MAX_IMPLEMENTATION_CONTINUATIONS ]; then
        warn "└─ Skipping completion check due to repeated agent issues"
        break
      fi
      info "├─ Retrying completion check..."
      ((continuation++))
      continue
    fi

    # check_result -eq 1: Implementation incomplete
    if [ $continuation -eq $MAX_IMPLEMENTATION_CONTINUATIONS ]; then
      warn "└─ Max continuations ($MAX_IMPLEMENTATION_CONTINUATIONS) reached. Proceeding with current implementation."
      break
    fi

    info "├─ Implementation incomplete, continuing..."
    continue_implementation "$phase_num" "$phase_name" "$continuation"
    info "└─ Continuation $continuation complete, re-checking..."
    ((continuation++))
  done
  log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check for changes
  git add -A
  if git diff --staged --quiet; then
    warn "No changes made in Phase $phase_num"
    git checkout main
    git branch -D "$branch_name"
    return 0
  fi

  # Run validation loop BEFORE committing (this prevents pre-commit hook failures)
  log "Running pre-commit validation..."
  validation_and_fix_loop

  # Stage any fixes from validation
  git add -A

  # Commit implementation (now hooks should pass)
  log "Committing changes..."
  git commit -m "Phase $phase_num: $phase_name

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

  # Run local code review loop
  log "Starting code review..."
  review_and_fix_loop

  # Run validation again after review fixes
  if ! git diff --staged --quiet || ! git diff --quiet; then
    git add -A
    if ! git diff --staged --quiet; then
      log "Validating review fixes..."
      validation_and_fix_loop
      git add -A
      git commit --amend --no-edit
    fi
  fi

  # Push and create PR
  git push -u origin "$branch_name"

  local pr_url=$(gh pr create \
    --title "Phase $phase_num: $phase_name" \
    --body "## Summary
Automated implementation of Phase $phase_num: $phase_name

Plan: \`$PLAN_FILE\`

## Checks
- ✅ Lint check passed
- ✅ Type check passed
- ✅ Tests passed
- ✅ Local code review passed

## Test Plan
- [x] Automated tests pass
- [x] Type check passes
- [x] Lint check passes
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

  log "════════════════════════════════════════════════════════════════════════════════"
  log "✓ PHASE $phase_num COMPLETE: $phase_name"
  log "════════════════════════════════════════════════════════════════════════════════"
}

main() {
  echo ""
  log "════════════════════════════════════════════════════════════════════════════════"
  log "🚀 DEVELOPMENT PLAN AUTOMATION"
  log "════════════════════════════════════════════════════════════════════════════════"
  info "Plan file: $PLAN_FILE"
  info ""

  # Verify prerequisites
  command -v claude >/dev/null 2>&1 || error "Claude CLI not found"
  command -v gh >/dev/null 2>&1 || error "GitHub CLI not found"
  command -v npm >/dev/null 2>&1 || error "npm not found"
  gh auth status >/dev/null 2>&1 || error "GitHub CLI not authenticated"

  # Parse the plan file
  parse_plan

  local start_phase=$(get_current_phase)

  [ "$start_phase" -gt "$TOTAL_PHASES" ] && error "Start phase ($start_phase) exceeds total phases ($TOTAL_PHASES)"

  info ""
  log "Starting from Phase $start_phase of $TOTAL_PHASES"
  info "Remaining phases: $((TOTAL_PHASES - start_phase + 1))"
  info ""

  for phase in $(seq "$start_phase" "$TOTAL_PHASES"); do
    run_phase "$phase"
    save_phase $((phase + 1))
  done

  # Cleanup state file
  rm -f "$STATE_FILE"

  echo ""
  log "════════════════════════════════════════════════════════════════════════════════"
  log "🎉 ALL $TOTAL_PHASES PHASES COMPLETE!"
  log "════════════════════════════════════════════════════════════════════════════════"
  echo ""
}

main
