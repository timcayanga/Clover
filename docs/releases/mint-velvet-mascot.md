# Mint velvet mascot rollout

Approved source: Apps & Social Media, Mascot Exploration (Figma ihPDxUM9SiMdssYw6XsOho, page 280:519). Main Screens: FNnCmCj90szZAnZ6twMPCy.

The six original transparent PNGs are preserved in assets/mascots and mobile/assets/mascots. Navigation uses the compact face-and-petals image; page illustrations use welcome, statement, thinking, wave, and savings poses. No cheek blush is added. The shared navigation build generates a versioned 96px WebP.

Scope: navigation/header, Ask Clover, existing add and empty states, Goals/Budgets without preset cards, recovery/not-found, onboarding, landing Ask Clover and only the Ask chapter of Understand Your Money. Native opening screens use white backgrounds.

Validation: web and native TypeScript, onboarding regression, 390px and 1440px browser visual checks, Figma main-screen screenshots. The legacy feature-discovery regression has an unrelated ReportsPageStream source assertion failure on the staging baseline.

Native assets require new iOS/Android binaries; Vercel releases update the web app only.
