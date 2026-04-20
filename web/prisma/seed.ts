import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { DEFAULT_CATEGORY_ROWS } from "@/lib/default-categories";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/finance_manager";

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

async function main() {
  const user = await prisma.user.upsert({
    where: { clerkUserId: "seed-demo-user" },
    update: {
      email: "demo@finance.local",
      verified: true,
      primaryGoal: "track_spending",
      onboardingCompletedAt: new Date(),
    },
    create: {
      clerkUserId: "seed-demo-user",
      email: "demo@finance.local",
      verified: true,
      planTier: "free",
      primaryGoal: "track_spending",
      onboardingCompletedAt: new Date(),
    },
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      id: "seed-demo-workspace",
    },
    update: {},
    create: {
      id: "seed-demo-workspace",
      userId: user.id,
      name: "Personal",
      type: "personal",
    },
  });

  const account = await prisma.account.upsert({
    where: { id: "seed-demo-account" },
    update: {},
    create: {
      id: "seed-demo-account",
      workspaceId: workspace.id,
      name: "Cash",
      institution: "Cash",
      type: "cash",
      currency: "PHP",
      source: "manual",
      balance: 0,
    },
  });

  for (const category of DEFAULT_CATEGORY_ROWS) {
    await prisma.category.upsert({
      where: {
        id: `${workspace.id}-${slugify(category.name)}`,
      },
      update: {},
      create: {
        id: `${workspace.id}-${slugify(category.name)}`,
        workspaceId: workspace.id,
        name: category.name,
        type: category.type,
      },
    });
  }

  console.log(`Seeded workspace ${workspace.name} and account ${account.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
