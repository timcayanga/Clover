# Clover Circles Product Spec

## Purpose

Circles are permissioned spaces where people coordinate selected financial responsibilities without combining accounts or exposing private financial records. They are Clover's collaboration layer for households, couples, families, barkadas, travel groups, shared goals, and selected investment visibility.

## Product Promise

Manage money together, without sharing everything.

## Core Principles

- A Circle is not a shared login, Profile, bank account, or legal ownership structure.
- Every personal account, transaction, and confirmed record remains owned by its source Profile.
- Sharing creates a permissioned reference or summary; it never moves or overwrites the source record.
- Members see only Circle-owned items and personal items explicitly shared with the Circle.
- Organizers manage Circle structure, but cannot edit another member's personal financial records.
- Financial history and activity are preserved when a Circle or membership is archived.
- Deterministic calculations come before AI. Forecasts expose confidence and their calculation basis.

## Navigation

- Desktop: `Manage > Circles` replaces the top-level Split Bills entry.
- Mobile: Circles appears under `More` until usage supports promotion into the bottom navigation.
- Split Bills remains available as the expense ledger inside a Circle and through legacy deep links.
- Circle administration belongs in the Circle's Members area. Global account preferences remain in Settings.

## Circle Types

- Household
- Couple
- Family
- Travel
- Friends or barkada
- Shared goal
- Custom

Types provide setup defaults only. They do not permanently restrict available features.

## Setup Flow

1. Choose a Circle type.
2. Name the Circle and select its currency.
3. Review the privacy boundary.
4. Optionally add people and create invitations.
5. Start with a shared expense, commitment, budget, or goal.

Setup must not request bank credentials, account access, salary, or full transaction visibility.

## Roles

### Organizer

- Manage Circle identity, invitations, roles, contribution agreements, and archive state.
- Create and edit shared resources.
- Cannot edit another member's source financial records.

### Member

- Create shared resources.
- Share their own transactions and investment summaries.
- Record their own contributions.
- Cannot change Circle membership or another member's agreement.

### Participant

- View the Circle and respond through supported expense or settlement flows.
- Cannot change Circle structure or add shared planning resources.

## Visibility

- `summary`: share only a selected value or progress amount. Hide account and merchant identity.
- `item`: share selected item details. Never expose adjacent transactions or account credentials.
- `circle_owned`: the item was created directly in the Circle and is visible to Circle members.
- Private records are not represented in Circle storage.

## Feature Areas

### Overview

- Shared expense total for the current month.
- Contributions for the current month.
- Goal and commitment status.
- Deterministic Circle insights with confidence and calculation reasons.

### Expenses

- Existing Split Bills groups are upgraded to Circles without changing bills or settlements.
- Circle members can create Circle-owned Split Bills.
- Members can share a selected personal transaction as amount-only or item-detail visibility.
- Sharing does not change the transaction's category, merchant, review state, or Profile.

### Budgets

- Circle budgets use Circle-owned expenses and explicitly shared transactions only.
- A category budget includes only shared transactions with the exact confirmed category.
- No private spending is inferred or included.

### Goals and Life Plans

- Goals support a target amount, starting amount, target date, and member contributions.
- Life-event templates include moving, wedding, childbirth, tuition, vehicle purchase, travel, supporting parents, and retirement transition.
- Pace forecasts require at least two recent contributions, show confidence, and disclose the observation window.

### Commitments

- Shared recurring or one-time responsibilities can be assigned to a member.
- Commitments do not modify a member's private recurring-payment records.

### Investments

- A member can share a selected value-only or item-detail investment summary.
- Value-only visibility hides the source account name and institution.
- Sharing never creates joint ownership and never includes credentials.

### Activity

- Create, update, share, invite, join, and archive actions are recorded.
- Activity summaries contain only Circle-visible information.

## Invitations and Acquisition

- Invitations explain who invited the recipient, the Circle's purpose, role, members, expiry, and privacy boundary.
- Email-bound invitations can only be accepted by the matching Clover account.
- Generic invitation links expire after 14 days.
- Unregistered people can remain named Split Bills participants until they claim a Clover membership.
- Joining links the authenticated member without rewriting historical bills or contributions.

## Lifecycle and Safety

- Circle deletion is implemented as archival.
- Removing a member changes access; it does not delete financial history.
- The owner cannot be removed or demoted without a future explicit ownership-transfer flow.
- Personal shared transactions and investment summaries can only be unshared by their owner.
- API authorization is checked in every route handler and never delegated solely to navigation or middleware.

## Analytics

Track:

- Circle created by type and initial member count.
- Invitation created and accepted.
- Time from Circle creation to first shared resource.
- Active Circles with activity in 7 and 30 days.
- Members per active Circle.
- Budget, goal, contribution, commitment, transaction-share, and investment-share creation.
- Split Bill group-to-Circle adoption.

Do not send account numbers, transaction descriptions, invitation emails, balances, or member names to analytics.

## Success Metrics

- Invitation acceptance rate.
- Percentage of Circles reaching a second active member.
- Percentage of Circles with a recurring action in the following month.
- 30-day retention for Circle creators and invitees.
- Average number of distinct shared feature areas used per active Circle.
- Reduction in unsettled shared expenses over time.

## UAT Personas

### Financial beginner

- Can create a Household Circle without understanding financial terminology.
- Understands that personal accounts remain private.
- Can add one bill, contribution, or goal without configuring advanced permissions.

### Experienced financial manager

- Can set contribution targets, cadence, budgets, dates, and visibility deliberately.
- Can inspect calculation reasons and audit history.
- Can distinguish Circle activity from private Profile reporting.

### Barkada

- Can create a temporary Travel or Friends Circle.
- Can keep unregistered participants in Split Bills.
- Can invite members and settle expenses without exposing personal accounts.

### Couple

- Can maintain private accounts while sharing bills, goals, contribution agreements, and selected summaries.
- Cannot inspect the partner's unshared salary, balances, or transactions.
- Can archive the Circle without deleting either person's financial history.

## Out of Scope

- Holding or transferring pooled funds.
- Joint bank or brokerage account opening.
- Legal ownership or beneficiary management.
- Automatic disclosure of income, balances, holdings, or transactions.
- Editing another member's source financial records.
