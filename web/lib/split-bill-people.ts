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

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) {
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
