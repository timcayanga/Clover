import { access, link, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const repoRoot = resolve(webRoot, "..");

const sourceIcons = resolve(repoRoot, "assets/icons");
const sourceLogos = resolve(repoRoot, "assets/logos");
const sourceBanks = resolve(repoRoot, "assets/banks");
const sourceCurrency = resolve(repoRoot, "assets/currency");
const sourceInvestments = resolve(repoRoot, "assets/investments");
const sourcePdfJsStandardFonts = resolve(repoRoot, "node_modules", "pdfjs-dist", "standard_fonts");
const publicRoot = resolve(webRoot, "public");
const currencyDestination = resolve(publicRoot, "assets/currency");

const hardlinkFile = async (source: string, destination: string) => {
  await rm(destination, { force: true });
  await mkdir(dirname(destination), { recursive: true });
  try {
    await link(source, destination);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: string }).code) : "";
    if (code !== "EEXIST") {
      throw error;
    }
  }
};

const hardlinkDirectory = async (source: string, destination: string) => {
  await rm(destination, { recursive: true, force: true });
  const stack: Array<{ sourceDir: string; destinationDir: string }> = [{ sourceDir: source, destinationDir: destination }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = await readdir(current.sourceDir, { withFileTypes: true });
    await mkdir(current.destinationDir, { recursive: true });

    for (const entry of entries) {
      if (entry.name === ".DS_Store") {
        continue;
      }

      const sourcePath = resolve(current.sourceDir, entry.name);
      const destinationPath = resolve(current.destinationDir, entry.name);

      if (entry.isDirectory()) {
        stack.push({ sourceDir: sourcePath, destinationDir: destinationPath });
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      await hardlinkFile(sourcePath, destinationPath);
    }
  }
};

const illustrationFiles = [
  "clover-empty-dashboard-3d.png",
  "clover-goals-progress-3d.png",
  "clover-import-upload-3d.png",
  "clover-insights-analytics-3d.png",
  "clover-investments-portfolio-3d.png",
  "clover-reports-chart-3d.png",
  "clover-review-checklist-3d.png",
  "clover-security-trust-3d.png",
  "clover-success-confirmation-3d.png",
  "clover-transactions-search-3d.png",
];

const landingIconFiles = ["analyze.png", "plan.png", "upload3d.png"];

const helpIconFiles: Array<[string, string]> = [
  ["getting started.png", "getting-started.png"],
  ["importing and reviewing.png", "importing-and-reviewing.png"],
  ["transactions and categories.png", "transactions-and-categories.png"],
  ["accounts and workspaces.png", "accounts-and-workspaces.png"],
  ["reports insights goals.png", "reports-insights-goals.png"],
  ["billing and plan.png", "billing-and-plan.png"],
  ["privacy security data.png", "privacy-security-data.png"],
  ["troubleshooting.png", "troubleshooting.png"],
];

const onboardingIconFiles = [
  "beginner.png",
  "intermediate.png",
  "account.png",
  "debt.png",
  "advanced.png",
  "track spending.png",
  "invest.png",
  "emergency fund.png",
  "save.png",
];

const syncCurrencyFlags = async () => {
  const directSvgEntries = await readdir(sourceCurrency, { withFileTypes: true });
  const directSvgFiles = directSvgEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".svg")).map((entry) => entry.name);

  const sourceCurrencyFlags =
    directSvgFiles.length > 0 ? sourceCurrency : resolve(sourceCurrency, "flag-icons-main", "flags", "4x3");
  const sourceFlagEntries = directSvgFiles.length > 0 ? directSvgFiles : (await readdir(sourceCurrencyFlags)).filter((entry) => entry.endsWith(".svg"));

  await rm(currencyDestination, { recursive: true, force: true });
  await mkdir(currencyDestination, { recursive: true });

  for (const fileName of sourceFlagEntries) {
    await hardlinkFile(resolve(sourceCurrencyFlags, fileName), resolve(currencyDestination, fileName));
  }
};

const main = async () => {
  await rm(resolve(publicRoot, "assets"), { recursive: true, force: true });

  await Promise.all([
    hardlinkDirectory(sourceIcons, resolve(publicRoot, "assets/icons")),
    hardlinkDirectory(sourceBanks, resolve(publicRoot, "assets/banks")),
    hardlinkDirectory(sourceLogos, resolve(publicRoot, "assets/logos")),
    hardlinkDirectory(sourceInvestments, resolve(publicRoot, "assets/investments")),
    hardlinkDirectory(sourcePdfJsStandardFonts, resolve(publicRoot, "pdfjs", "standard_fonts")),
    rm(resolve(publicRoot, "illustrations"), { recursive: true, force: true }),
    rm(resolve(publicRoot, "landing-icons"), { recursive: true, force: true }),
    rm(resolve(publicRoot, "help-icons"), { recursive: true, force: true }),
    rm(resolve(publicRoot, "onboarding-icons"), { recursive: true, force: true }),
  ]);

  await mkdir(resolve(publicRoot, "illustrations"), { recursive: true });
  await mkdir(resolve(publicRoot, "landing-icons"), { recursive: true });
  await mkdir(resolve(publicRoot, "help-icons"), { recursive: true });
  await mkdir(resolve(publicRoot, "onboarding-icons"), { recursive: true });
  await syncCurrencyFlags();

  for (const fileName of illustrationFiles) {
    await hardlinkFile(resolve(sourceIcons, fileName), resolve(publicRoot, "illustrations", fileName));
  }

  for (const fileName of landingIconFiles) {
    await hardlinkFile(resolve(sourceIcons, fileName), resolve(publicRoot, "landing-icons", fileName));
  }

  for (const [sourceName, destinationName] of helpIconFiles) {
    await hardlinkFile(resolve(sourceIcons, sourceName), resolve(publicRoot, "help-icons", destinationName));
  }

  for (const fileName of onboardingIconFiles) {
    await hardlinkFile(resolve(sourceIcons, fileName), resolve(publicRoot, "onboarding-icons", fileName));
  }

  await mkdir(resolve(publicRoot, "category-icons"), { recursive: true });
  const categoryIconEntries = await readdir(resolve(publicRoot, "category-icons"), { withFileTypes: true });
  for (const entry of categoryIconEntries) {
    if (!entry.isFile()) {
      continue;
    }

    const sourcePath = resolve(sourceIcons, entry.name);
    try {
      await access(sourcePath);
      await hardlinkFile(sourcePath, resolve(publicRoot, "category-icons", entry.name));
    } catch {
      continue;
    }
  }
};

main().catch((error) => {
  console.error("Failed to sync public assets", error);
  process.exitCode = 1;
});
