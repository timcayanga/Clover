import { Prisma } from "@prisma/client";

export type SplitBillPersonRecord = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

const normalizeName = (value: string) => value.trim().toLowerCase();

export const upsertSplitBillPeopleFromNames = async (
  tx: Prisma.TransactionClient,
  userId: string,
  names: string[]
): Promise<SplitBillPersonRecord[]> => {
  const people: SplitBillPersonRecord[] = [];
  const seen = new Set<string>();

  if (!names.length) return people;
  // Serialize contact discovery across concurrent bill and group saves for this user.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"split-bill-people:" + userId}))`;

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name || /^(you|me)$/i.test(name)) {
      continue;
    }

    const key = normalizeName(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const existing = await tx.splitBillPerson.findFirst({
      where: {
        userId,
        name: {
          equals: name,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
      },
    });

    if (!existing) {
      people.push(
        await tx.splitBillPerson.create({
          data: {
            userId,
            name,
            avatarUrl: null,
          },
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        })
      );
      continue;
    }

    people.push(existing);
  }

  return people;
};

// Older Circles can predate the personal contact directory. Reconcile only
// active members visible to this user and preserve their existing contact edits.
export async function loadSplitBillPeople(userId: string, includeContactDetails = false) {
  const { prisma } = await import("./prisma");
  const select = { id: true, name: true, avatarUrl: true, email: includeContactDetails, phone: includeContactDetails } as const;
  const [contacts, members] = await Promise.all([
    prisma.splitBillPerson.findMany({ where: { userId }, select, orderBy: { name: "asc" } }),
    prisma.circleMembership.findMany({
      where: {
        status: "active",
        OR: [{ userId: null }, { userId: { not: userId } }],
        circle: { archivedAt: null, OR: [{ ownerUserId: userId }, { memberships: { some: { userId, status: "active" } } }] },
      },
      select: { displayName: true, avatarUrl: true },
    }),
  ]);
  const known = new Set(contacts.map(person => normalizeName(person.name)));
  const missing = members.filter(member => !known.has(normalizeName(member.displayName)));
  const discovered = missing.length ? await prisma.$transaction(tx =>
    upsertSplitBillPeopleFromNames(tx, userId, missing.map(member => member.displayName))) : [];
  const photos = new Map(members.filter(m => m.avatarUrl).map(m => [normalizeName(m.displayName), m.avatarUrl]));
  return [...contacts, ...discovered].map(p => ({ ...p, avatarUrl: p.avatarUrl || photos.get(normalizeName(p.name)) || null }));
}
