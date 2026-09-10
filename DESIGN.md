# AI UGC Maker Design System

## Direction
A dark, cinematic creator workstation: media-first, precise, and quiet. The interface should feel like a serious local production tool rather than a marketing landing page.

## Tokens
- Canvas: `#09090B`
- Raised surface: `#111216`
- Nested surface: `#17181D`
- Border: `#27282F`
- Primary text: `#F7F7F8`
- Secondary text: `#A1A1AA`
- Accent: `#8B72FF`
- Success: `#43D39E`
- Error: `#FF8F9A`
- Radius: 9px controls, 12px media, 16px panels
- Spacing: 8px base scale

## Typography
Use DM Sans for interface text and Space Grotesk for headings/brand. Headings are compact and slightly tracked negative. Never use low-contrast gray for important values.

## Layout
- Desktop: 228px navigation rail, fluid studio canvas, 370px preview/history rail.
- Tablet: compact rail and one-column studio.
- Mobile: top brand bar, one-column flow, touch targets at least 44px.
- No horizontal overflow at 390px.

## Components
- Panels: raised surface, thin border, 16px radius.
- Primary action: violet filled button, reserved for generation or completed output.
- Controls: dark nested surface with visible focus ring.
- Status: text plus semantic dot/badge; color alone is never the only signal.
- Media: stable aspect-ratio thumbnails with real output/asset state where available.
- OAuth: explicit connected/disconnected/pending/error copy. Never display credentials.

## Motion and accessibility
Keep transitions short and purposeful. Honor `prefers-reduced-motion`. Preserve keyboard focus, labels, Escape handling for dialogs, readable contrast, and semantic links/buttons.

## Product boundary
The current product creates and monitors HyperFrames videos. Do not add dead controls for avatars, voice cloning, publishing, lip-sync, campaign analytics, or timeline editing until the backend supports them.
