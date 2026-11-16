import { personalGoalInput } from "@/lib/personal-goal-input";
export const mobileGoalInput = personalGoalInput.strict().extend({ goalPlan: personalGoalInput.shape.goalPlan.strict() });
