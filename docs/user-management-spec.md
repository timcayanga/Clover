# User Management Spec

## Purpose
Create a low-friction consumer onboarding and account system for Clover that gets users into the product quickly, starts everyone on a Free Plan by default, and leaves room for paid subscriptions and goal-based personalization in Phase 2.

## Product Principles

- Keep signup short and obvious.
- Prefer social login where it reduces friction.
- Default every new user into the Free Plan automatically.
- Collect only the minimum data needed to create a secure account.
- Defer richer personalization and monetization until after account creation.
- Design Phase 1 so Phase 2 can be added without reworking the core auth model.

## Audience

- Primary: individual consumers managing personal finances.
- Not in scope for Phase 1: business accounts, teams, shared workspaces, or multi-tenant organizational billing.

## Phase 1 Goals

1. Let a new user create an account in a few clicks.
2. Support social media login.
3. Put every new user on the Free Plan automatically.
4. Keep onboarding lightweight, with only the most necessary setup questions.
5. Preserve a clean path for later subscriptions and goal-based personalization.

## Phase 1 Scope

### Authentication

- Social login:
  - Google
  - Apple
- Email-based signup and sign-in remain available.
- Password reset and email verification should be supported.

### Signup Experience

- Primary entry points:
  - `Continue with Google`
  - `Continue with Apple`
  - `Continue with email`
- Signup should request only essential account information.
- Anything not required to create the account should move to post-signup onboarding.

### Default Plan Assignment

- Every new user is automatically assigned the Free Plan at account creation.
- Users should not need to choose a plan during signup.
- The Free Plan should feel like the natural starting state, not a downgraded state.

### Post-Signup Onboarding

- After account creation, show a short onboarding flow.
- Keep it to 1 to 3 quick prompts.
- Suggested onboarding data:
  - primary financial goal
  - what the user wants to do first
  - optional lightweight preference signals for future personalization

### Initial Personalization

- Phase 1 personalization should be minimal.
- The product may adapt copy, empty states, and dashboard emphasis based on a user’s selected goal.
- Full report/layout customization belongs in Phase 2.

## Free Plan Rules

The Free Plan should be available immediately to every new user and should include limited access to core value features.

### Suggested Free Plan Limits

- Limited uploads
- Limited AI insights
- Limited reports

These limits do not need to be finalized in the spec, but they should be defined early enough that the product can enforce them consistently.

### Free Plan UX Rules

- The app should explain limits clearly.
- Users should be able to reach core value before hitting limits.
- Upgrade messaging should appear only when it is relevant, not constantly.

## Phase 2 Goals

Phase 2 introduces monetization and deeper personalization without changing the base account model.

### Paid Subscriptions

- Add paid subscription tiers.
- Paid plans should provide greater flexibility and deeper insights than Free.
- Subscription entitlements should control access to:
  - uploads
  - AI insights
  - reports
  - any premium personalization features

### Financial Goals Screen

- Add a dedicated screen where users choose their financial goals.
- Goal selection should drive:
  - report emphasis
  - layout priorities
  - insight recommendations
  - onboarding defaults

### Goal Examples

- save more
- pay down debt
- track spending
- build an emergency fund
- invest better

## User Flow

### Phase 1 Flow

1. User lands on signup.
2. User chooses Google, Apple, or email signup.
3. Account is created.
4. User is automatically assigned the Free Plan.
5. User completes a short onboarding step.
6. App personalizes lightly based on the chosen goal or preference.
7. User enters the product dashboard.

### Phase 2 Flow

1. User signs in or signs up normally.
2. User is assigned the Free Plan by default.
3. User sees goal selection if it has not been completed.
4. Product adapts the experience based on goal.
5. If the user hits Free Plan limits, the app shows an upgrade path.

## Data Model Notes

The current schema already supports a user-centric model with a `User` record tied to one or more `Workspace` records.

### Current Requirements

- Keep one account identity per user.
- Store identity provider data for Clerk-based auth.
- Store whether the email has been verified.
- Keep plan data separate from authentication data.
- Keep goal data separate from plan data so each can evolve independently.

### Suggested Additions for Later

- `planType` or subscription entitlement fields
- usage counters for uploads, AI insights, and reports
- selected financial goal
- goal history or preference events if personalization becomes adaptive

## Non-Goals for Phase 1

- Business account management
- Team billing
- Multiple subscription tiers in the UI
- Complex goal-based dashboard personalization
- Advanced onboarding questionnaires

## UX Guidelines

- Signup should feel fast and familiar.
- The default path should be the easiest path.
- Plan limits should be understandable without reading fine print.
- Goal selection should feel helpful, not like a survey.

## Open Questions

- Which social providers are required in Phase 1 beyond Google and Apple?
- What exact limits should Free Plan users have for uploads, AI insights, and reports?
- Should goal selection happen immediately after signup or after the user reaches the dashboard?
- Should the app ask for any additional setup fields during onboarding, such as income range or budgeting style?

## Recommended Next Steps

1. Finalize the exact Free Plan limits.
2. Decide the minimum onboarding questions.
3. Confirm the social login providers for launch.
4. Add the plan and goal fields to the data model when implementation starts.
