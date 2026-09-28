# Account and Settings icon library

These are the transparent counterparts of the original top-level Clover 3D icon library shown in the user's reference on 28 September 2026. Do not substitute the older `menu`, `menu-transparent`, or captured Settings-screen artwork.

- `profile`: rounded teal person (`account.png`)
- `plan`: teal/mint card with two horizontal lines; no wallet or coin
- `region`: globe without a stand
- `review`: clipboard with two checks; no calendar or magnifier
- `security`: mint-filled teal keyhole shield; no gold lock
- `profiles`: two overlapping profile cards
- `display`: thick teal monitor
- `data`: three teal database cylinders
- `categories`: four rounded teal/mint tiles
- `settings`, `notifications`, `help`: library gear, bell, question bubble
- `signOut`: existing red exit door and arrow

The built-in image editing tool removed white canvas backgrounds from the nine original opaque exports and cleaned stray white pixels around Settings and Notifications. Prompt: background extraction only; preserve silhouette, geometry, proportions, colors, highlights and internal pale details; no redesign or additional objects. Help and Log Out already had transparency and are copied unchanged.

Web and native assets are generated from this directory by `sync-public-assets.ts` and `sync-mobile-icons.ts`. Native consumers must use `mobile/assets/icons/navigation`, not old bundled copies. Versioned web URLs invalidate cached artwork.
