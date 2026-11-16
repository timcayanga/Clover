export const splitBillProfileAvatarUrls = [
  "/assets/profiles/avatar_1.png",
  "/assets/profiles/avatar_2.png",
  "/assets/profiles/avatar_3.png",
  "/assets/profiles/avatar_4.png",
  "/assets/profiles/avatar_5.png",
  "/assets/profiles/avatar_6.png",
  "/assets/profiles/avatar_7.png",
  "/assets/profiles/avatar_8.png",
  "/assets/profiles/avatar_9.png",
  "/assets/profiles/avatar_10.png",
] as const;

const MALE_AVATAR_URLS = [
  splitBillProfileAvatarUrls[0],
  splitBillProfileAvatarUrls[1],
  splitBillProfileAvatarUrls[2],
  splitBillProfileAvatarUrls[3],
  splitBillProfileAvatarUrls[4],
];
const FEMALE_AVATAR_URLS = [
  splitBillProfileAvatarUrls[5],
  splitBillProfileAvatarUrls[6],
  splitBillProfileAvatarUrls[7],
  splitBillProfileAvatarUrls[8],
];

const MALE_NAME_HINTS = new Set([
  "adam",
  "alex",
  "andrew",
  "anthony",
  "ben",
  "bernard",
  "brian",
  "carlo",
  "charles",
  "chris",
  "daniel",
  "david",
  "edward",
  "eric",
  "ethan",
  "francis",
  "gabriel",
  "george",
  "henry",
  "ian",
  "james",
  "jason",
  "john",
  "jose",
  "juan",
  "kevin",
  "leo",
  "mark",
  "marc",
  "michael",
  "mike",
  "nathan",
  "neil",
  "oscar",
  "paul",
  "peter",
  "ray",
  "ricky",
  "ruben",
  "ryan",
  "sam",
  "steven",
  "thomas",
  "victor",
  "william",
]);

const FEMALE_NAME_HINTS = new Set([
  "amy",
  "anna",
  "aria",
  "bella",
  "carla",
  "claire",
  "diana",
  "elaine",
  "elena",
  "emma",
  "faith",
  "gina",
  "grace",
  "hannah",
  "isabel",
  "isabella",
  "jane",
  "jessica",
  "karen",
  "kate",
  "katherine",
  "lara",
  "lily",
  "maria",
  "mariah",
  "marie",
  "mika",
  "nicole",
  "paula",
  "rachel",
  "sarah",
  "sophia",
  "stephanie",
  "tina",
  "vera",
  "victoria",
  "yana",
  "yara",
]);

const normalizeName = (value: string) => value.trim().toLowerCase().split(/\s+/)[0] ?? "";

export const inferSplitBillAvatarGender = (name: string) => {
  const first = normalizeName(name);
  if (!first) {
    return "neutral";
  }

  if (MALE_NAME_HINTS.has(first)) {
    return "male";
  }

  if (FEMALE_NAME_HINTS.has(first)) {
    return "female";
  }

  return "neutral";
};

export const pickSplitBillAvatarUrl = (name: string) => {
  const first = normalizeName(name);
  const gender = inferSplitBillAvatarGender(name);
  const pool = gender === "male" ? MALE_AVATAR_URLS : gender === "female" ? FEMALE_AVATAR_URLS : splitBillProfileAvatarUrls;
  const index = Math.abs(
    first
      .split("")
      .reduce((hash, char) => {
        const next = (hash << 5) - hash + char.charCodeAt(0);
        return next & next;
      }, 0)
  ) % pool.length;
  return pool[index] ?? splitBillProfileAvatarUrls[0];
};

export const isSplitBillBuiltInAvatarUrl = (value: string | null | undefined) =>
  Boolean(value && splitBillProfileAvatarUrls.includes(value as (typeof splitBillProfileAvatarUrls)[number]));
