export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { assertProductionSecrets } = await import("./lib/adminAuth");
  assertProductionSecrets();
}
