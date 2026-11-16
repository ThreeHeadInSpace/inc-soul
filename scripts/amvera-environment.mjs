// Shared allowlist for runtime and explicitly invoked migrations. No secrets.
const profiles = {
  staging: { name: "staging", app: "incsoul-stage", host: "cnpg-incsoul-db-stage-rw", database: "incsoulStage" },
  production: { name: "production", app: "incsoul-prod", host: "cnpg-incsoul-db-prod-rw", database: "incsoulProd" },
};

/** @param {NodeJS.ProcessEnv} [env] */
export function amveraEnvironment(env = {}) {
  // Backward compatibility for the already deployed staging. Never infer prod
  // from a URL, branch name, NODE_ENV or VERCEL_ENV.
  const name = env.AMVERA_ENV ?? "staging";
  if (name !== "staging" && name !== "production") throw new Error("Invalid Amvera environment");
  const profile = profiles[name];
  if ((name === "production" && env.AMVERA_APP_NAME !== profile.app) ||
      (env.AMVERA_APP_NAME !== undefined && env.AMVERA_APP_NAME !== profile.app)) {
    throw new Error("Amvera application/environment mismatch");
  }
  return profile;
}
