# SUBAGENT OPERATING POLICY

This policy is mandatory for every engineering iteration performed by a subagent.

## Required Iteration Loop (Never Skip)

1. **Complete iteration scope**
   - Implement the assigned change fully (code + docs + tests/checks required by task).
2. **Commit and push**
   - Commit only the intended files.
   - Push to the required remote branch.
3. **Wait for deploy**
   - Wait for production deployment to finish before verification.
4. **Browser-check production**
   - Verify the deployed behavior in production using Browser Relay (Chrome profile when available).
5. **Correct errors immediately**
   - If any production error/regression appears, start a corrective iteration immediately.
6. **Only then start next iteration**
   - Next feature iteration cannot begin until production verification is clean.

## Completion Proof Rule (Required Every Iteration)

Each iteration report must include explicit proof of completion:

- **Commit hash**
- **Branch name**
- **Checks run + result** (at minimum lint/build when required)
- **Production verification result** (URL + pass/fail + observed state)

If production verification cannot be executed (tooling outage, relay unavailable, auth blocker), report the blocker explicitly and provide exact commands/steps for the manager to run manually.

## Non-Compliance

Missing any required loop step or completion proof means the iteration is incomplete.