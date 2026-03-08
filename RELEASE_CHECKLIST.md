# Release Checklist (develop → main)

Use this checklist before promoting to `main` (production test milestone).

## 1) Scope + Significance
- [ ] Change is a significant milestone (not routine incremental update).
- [ ] Release note drafted (what changed + user impact + rollback note).

## 2) Branch Hygiene
- [ ] Work merged into `develop`.
- [ ] `develop` is up to date and green.
- [ ] No unintended files included (generated/build/runtime artifacts excluded).

## 3) Verification Gates
- [ ] `npm run verify:release`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Any release-specific manual checks documented.

## 4) Approval Gate
- [ ] Owner approval received to promote to `main`.

## 5) Promotion
- [ ] Merge/cherry-pick approved commits from `develop` to `main`.
- [ ] Push `main`.
- [ ] Confirm deployment healthy.

## 6) Post-Deploy Validation
- [ ] Core pages load and function (today / onboarding / analytics).
- [ ] Critical API endpoints respond as expected.
- [ ] No blocking console/runtime errors.

## 7) Rollback Plan
- [ ] If regression found: revert release commit on `main`.
- [ ] Continue fix work on `develop`.
