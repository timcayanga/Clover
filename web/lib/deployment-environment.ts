export type DeploymentEnvironment = "production" | "staging" | "local";

export const getDeploymentEnvironment = (): DeploymentEnvironment => {
  if (process.env.VERCEL_ENV === "production") {
    return "production";
  }

  if (process.env.VERCEL_ENV === "preview") {
    return "staging";
  }

  return process.env.NODE_ENV === "production" ? "production" : "local";
};
