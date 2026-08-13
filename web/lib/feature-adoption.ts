export type FeatureFunnelCriterion = {
  event: string;
  pathPrefixes?: string[];
};

export type FeatureFunnelStepDefinition = {
  key: string;
  label: string;
  criteria?: FeatureFunnelCriterion[];
  databaseFallback?: "users" | "accounts" | "transactions" | "imports" | "recurring" | "splitBills" | "circles" | "budgets" | "goals" | "investments";
};

export type FeatureFunnelDefinition = {
  key: string;
  label: string;
  description: string;
  steps: FeatureFunnelStepDefinition[];
};

const viewed = (...pathPrefixes: string[]): FeatureFunnelCriterion => ({
  event: "$pageview",
  pathPrefixes,
});

const events = (...eventNames: string[]): FeatureFunnelCriterion[] =>
  eventNames.map((event) => ({ event }));

export const FEATURE_FUNNEL_DEFINITIONS: FeatureFunnelDefinition[] = [
  {
    key: "authentication",
    label: "Authentication",
    description: "From opening authentication to returning successfully.",
    steps: [
      { key: "viewed", label: "Viewed sign in or sign up", criteria: [viewed("/sign-in", "/sign-up")] },
      { key: "started", label: "Started sign up", criteria: events("signup_started") },
      { key: "completed", label: "Completed sign up", criteria: events("signup_completed"), databaseFallback: "users" },
      { key: "returned", label: "Signed in successfully", criteria: events("first_login") },
    ],
  },
  {
    key: "onboarding",
    label: "Onboarding",
    description: "From first view through missions and completion.",
    steps: [
      { key: "viewed", label: "Viewed onboarding", criteria: [viewed("/onboarding")] },
      { key: "started", label: "Started onboarding", criteria: events("onboarding_started") },
      { key: "mission", label: "Started a mission", criteria: events("onboarding_mission_started") },
      { key: "completed", label: "Completed onboarding", criteria: events("onboarding_completed") },
    ],
  },
  {
    key: "home",
    label: "Home",
    description: "Dashboard reach and engagement with its financial summaries.",
    steps: [
      { key: "viewed", label: "Viewed Home", criteria: [viewed("/home", "/dashboard")] },
      { key: "loaded", label: "Dashboard loaded", criteria: events("dashboard_viewed") },
      { key: "summary", label: "Opened weekly summary", criteria: events("weekly_summary_viewed") },
    ],
  },
  {
    key: "accounts",
    label: "Accounts",
    description: "From account discovery to creation and maintenance.",
    steps: [
      { key: "viewed", label: "Viewed Accounts", criteria: [viewed("/accounts")] },
      { key: "created", label: "Created an account", criteria: events("account_created"), databaseFallback: "accounts" },
      { key: "updated", label: "Updated an account", criteria: events("account_updated") },
      { key: "managed", label: "Deleted or reset an account", criteria: events("account_deleted", "account_reset") },
    ],
  },
  {
    key: "transactions",
    label: "Transactions",
    description: "From viewing the ledger to adding, cleaning, and reviewing records.",
    steps: [
      { key: "viewed", label: "Viewed Transactions", criteria: [viewed("/transactions")] },
      { key: "added", label: "Added or imported a transaction", criteria: events("manual_transaction_created", "transaction_imported"), databaseFallback: "transactions" },
      { key: "edited", label: "Updated or categorized a transaction", criteria: events("transaction_updated", "transaction_categorized", "transaction_recategorized") },
      { key: "reviewed", label: "Reviewed a transaction", criteria: events("review_item_accepted", "review_item_edited", "transaction_confirmation_completed") },
      { key: "advanced", label: "Split, merged, or undid a transaction", criteria: events("transaction_split", "transaction_merged", "transaction_undone") },
    ],
  },
  {
    key: "imports",
    label: "Imports",
    description: "The complete document-to-confirmed-data journey.",
    steps: [
      { key: "started", label: "Started an upload", criteria: events("file_upload_started", "first_import_started") },
      { key: "uploaded", label: "Uploaded a file", criteria: events("file_uploaded"), databaseFallback: "imports" },
      { key: "parsing", label: "Parsing started", criteria: events("import_parsing_started") },
      { key: "parsed", label: "Parsed successfully or with warnings", criteria: events("import_parsed_successfully", "import_parsed_with_warnings") },
      { key: "confirmed", label: "Confirmed the import", criteria: events("import_confirmed", "first_import_completed") },
      { key: "repeat", label: "Completed a second import", criteria: events("second_import_completed") },
    ],
  },
  {
    key: "review_queue",
    label: "Review Queue",
    description: "From opening the queue to resolving uncertain financial data.",
    steps: [
      { key: "viewed", label: "Viewed Review Queue", criteria: [viewed("/review")] },
      { key: "opened", label: "Opened a review item", criteria: events("review_item_opened") },
      { key: "resolved", label: "Accepted or edited an item", criteria: events("review_item_accepted", "review_item_edited") },
      { key: "completed", label: "Completed a review session", criteria: events("review_queue_completed") },
    ],
  },
  {
    key: "recurring",
    label: "Recurring",
    description: "From opening recurring money to reviewing and keeping a suggestion.",
    steps: [
      { key: "viewed", label: "Viewed Recurring", criteria: [viewed("/recurring")] },
      { key: "available", label: "Has recurring records", databaseFallback: "recurring" },
      { key: "reviewed", label: "Reviewed a suggestion", criteria: events("recurring_item_reviewed") },
      { key: "confirmed", label: "Kept or confirmed recurring item", criteria: events("recurring_item_confirmed") },
      { key: "completed", label: "Marked a recurring occurrence complete", criteria: events("recurring_occurrence_updated") },
    ],
  },
  {
    key: "adviser",
    label: "Adviser",
    description: "From opening Adviser to asking, exploring, and acting.",
    steps: [
      { key: "viewed", label: "Viewed Adviser", criteria: [viewed("/adviser")] },
      { key: "asked", label: "Asked Clover a question", criteria: events("adviser_question_asked") },
      { key: "opened", label: "Opened a recommendation", criteria: events("adviser_recommendation_opened", "insight_opened") },
      { key: "acted", label: "Completed an Adviser action", criteria: events("adviser_action_completed", "insight_action_taken") },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    description: "From report discovery to filtering, insight, and export.",
    steps: [
      { key: "viewed", label: "Viewed Reports", criteria: [viewed("/reports")] },
      { key: "loaded", label: "Loaded a report", criteria: events("report_viewed", "first_report_viewed") },
      { key: "filtered", label: "Filtered a report", criteria: events("report_filtered") },
      { key: "insight", label: "Opened a report insight", criteria: events("cashflow_viewed", "category_mix_viewed", "top_sources_viewed", "trend_line_viewed") },
      { key: "exported", label: "Exported a report", criteria: events("report_exported") },
    ],
  },
  {
    key: "split_bills",
    label: "Split Bills",
    description: "From opening bill splitting to creation, completion, and settlement.",
    steps: [
      { key: "viewed", label: "Viewed Split Bills", criteria: [viewed("/split-bill")] },
      { key: "created", label: "Created a split bill", criteria: events("split_bill_created"), databaseFallback: "splitBills" },
      { key: "completed", label: "Completed a split bill", criteria: events("split_bill_completed") },
      { key: "settled", label: "Settled a split bill", criteria: events("split_bill_settled") },
    ],
  },
  {
    key: "circles",
    label: "Circles",
    description: "From opening Circles to collaboration and shared activity.",
    steps: [
      { key: "viewed", label: "Viewed Circles", criteria: [viewed("/circles")] },
      { key: "created", label: "Created or joined a Circle", criteria: events("circle_created", "circle_invitation_accepted"), databaseFallback: "circles" },
      { key: "invited", label: "Invited another person", criteria: events("circle_invitation_created") },
      { key: "collaborated", label: "Recorded or shared Circle activity", criteria: events("circle_contribution_recorded", "circle_transaction_shared", "circle_investment_shared", "circle_commitment_created") },
    ],
  },
  {
    key: "budgeting",
    label: "Budgeting",
    description: "Budget page reach and current budget adoption.",
    steps: [
      { key: "viewed", label: "Viewed Budgeting", criteria: [viewed("/budgeting")] },
      { key: "created", label: "Has created a budget", databaseFallback: "budgets" },
    ],
  },
  {
    key: "goals",
    label: "Goals",
    description: "From opening Goals to setting, updating, and reaching a target.",
    steps: [
      { key: "viewed", label: "Viewed Goals", criteria: [viewed("/goals")] },
      { key: "saved", label: "Saved a goal target", criteria: events("goal_target_saved"), databaseFallback: "goals" },
      { key: "updated", label: "Updated goal progress", criteria: events("goal_updated", "goal_progress_updated") },
      { key: "reached", label: "Reached a goal", criteria: events("goal_target_reached") },
    ],
  },
  {
    key: "investments",
    label: "Investments",
    description: "Investment page reach and current portfolio adoption.",
    steps: [
      { key: "viewed", label: "Viewed Investments", criteria: [viewed("/investments")] },
      { key: "created", label: "Has an investment account", databaseFallback: "investments" },
    ],
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "Reach of notifications and onboarding missions.",
    steps: [
      { key: "viewed", label: "Viewed Notifications", criteria: [viewed("/notifications")] },
      { key: "missions", label: "Viewed onboarding missions", criteria: events("onboarding_missions_viewed") },
      { key: "started", label: "Started a mission", criteria: events("onboarding_mission_started") },
      { key: "completed", label: "Completed a mission", criteria: events("onboarding_mission_completed") },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    description: "From opening Settings to changing account configuration.",
    steps: [
      { key: "viewed", label: "Viewed Settings", criteria: [viewed("/settings", "/profile")] },
      { key: "updated", label: "Updated a setting", criteria: events("settings_updated", "workspace_updated") },
      { key: "categories", label: "Managed categories or rules", criteria: events("category_created", "category_updated", "category_rule_created", "merchant_rule_created") },
    ],
  },
  {
    key: "help_support",
    label: "Help and Support",
    description: "From help discovery to contacting Clover Support.",
    steps: [
      { key: "viewed", label: "Viewed Help or Contact", criteria: [viewed("/help", "/contact-us")] },
      { key: "contacted", label: "Contacted support", criteria: events("support_contacted") },
    ],
  },
  {
    key: "categories_rules",
    label: "Categories and Rules",
    description: "From opening settings to teaching Clover durable categorization rules.",
    steps: [
      { key: "viewed", label: "Viewed category settings", criteria: [viewed("/settings")] },
      { key: "category", label: "Created or updated a category", criteria: events("category_created", "category_updated") },
      { key: "rule", label: "Created a category or merchant rule", criteria: events("category_rule_created", "merchant_rule_created") },
    ],
  },
  {
    key: "profiles_workspaces",
    label: "Profiles and Workspaces",
    description: "From profile discovery to creating and maintaining another workspace.",
    steps: [
      { key: "viewed", label: "Viewed profile or workspace settings", criteria: [viewed("/profile", "/settings")] },
      { key: "created", label: "Created a workspace", criteria: events("workspace_created") },
      { key: "updated", label: "Updated a workspace", criteria: events("workspace_updated") },
      { key: "switched", label: "Switched workspace", criteria: events("workspace_switched") },
    ],
  },
  {
    key: "billing_plans",
    label: "Billing and Plans",
    description: "From plan discovery to checkout and subscription management.",
    steps: [
      { key: "viewed", label: "Viewed pricing or plan settings", criteria: [viewed("/pricing", "/settings")] },
      { key: "started", label: "Started checkout", criteria: events("billing_started", "upgrade_cta_clicked") },
      { key: "completed", label: "Completed an upgrade", criteria: events("billing_success") },
      { key: "managed", label: "Changed or cancelled a subscription", criteria: events("billing_cancelled") },
    ],
  },
];
