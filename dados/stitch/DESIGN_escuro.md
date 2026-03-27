# Design System Specification: Tactical Nocturne

## 1. Overview & Creative North Star
**Creative North Star: The Silent Commander**
This design system moves beyond "dark mode" into a specialized, high-fidelity environment. It is inspired by night-time cartography and tactical operations centers where information density is high but visual noise is non-existent.

To break the "standard template" look, we utilize **Tonal Asymmetry**. Instead of centering everything on a rigid grid, we use expansive negative space (using `spacing-24`) contrasted against dense, information-rich "Command Clusters." The aesthetic is intentional, quiet, and authoritative—layering deep forest tones with copper highlights to create a sense of mechanical precision and premium hardware.

## 2. Colors & Surface Architecture
We reject the "flat" web. Depth is achieved through light physics and material density, not lines.

### Palette Highlights
*   **Base:** `surface` (#121411) – A deep, organic slate-charcoal. Never use #000000.
*   **Tactical Primary:** `primary` (#a1d494) – A desaturated forest mint for high legibility.
*   **Command Accent:** `secondary` (#ffb77b) – The "Copper Accent." Used sparingly for critical alerts or pathfinding.
*   **Environmental Green:** `primary_container` (#2d5a27) – The heart of the tactical map aesthetic.

### The "No-Line" Rule
**Borders are strictly prohibited for sectioning.** To separate a sidebar from a main map view, transition from `surface` to `surface_container_low`. To highlight a card, place a `surface_container_highest` element over a `surface_container` background. Boundaries are felt through value shifts, not drawn with strokes.

### The Glass & Gradient Rule
Floating HUD (Heads-Up Display) elements must use **Atmospheric Glass**. Apply `surface_container` at 80% opacity with a `20px` backdrop-blur. 
*   **Signature Texture:** Main Action Buttons should utilize a subtle linear gradient: `primary_container` (Top Left) to `primary` (Bottom Right) at a 15% opacity overlay to simulate a glowing tactical screen.

## 3. Typography
We utilize **Lexend** for its hyper-legibility and geometric stability, essential for a "command center" feel.

*   **Display (lg/md):** Reserved for high-level telemetry or status headers. Use `tight` letter-spacing (-0.02em) to give it a "machined" look.
*   **Headline & Title:** Use `on_surface` for standard titles. Use `primary` for section headers to mimic a radar readout.
*   **Body (md/lg):** The workhorse. Always ensure `on_surface_variant` is used for secondary data to maintain the visual hierarchy of "Primary vs. Environmental" information.
*   **Label (sm/md):** Our "Micro-Data" tier. Often set in `secondary` (Copper) when representing coordinates, timestamps, or tactical metadata.

## 4. Elevation & Depth
In a tactical interface, depth represents "System Priority."

*   **The Layering Principle:** 
    *   Level 0 (Earth): `surface_dim` (#121411)
    *   Level 1 (Map/Ground): `surface_container_low` (#1a1c19)
    *   Level 2 (UI Panels): `surface_container` (#1e201d)
    *   Level 3 (Active Pop-overs): `surface_container_highest` (#333532)
*   **Ambient Shadows:** Use a "Forest Glow" shadow for floating panels. `Color: #000000`, `Alpha: 40%`, `Blur: 40px`, `Spread: -10px`. This mimics the way a screen glows in a dark room.
*   **The Ghost Border:** If high-contrast separation is required (e.g., in a complex map overlay), use `outline_variant` at **15% opacity**. It should be a suggestion of an edge, not a hard stop.

## 5. Components

### Buttons (Tactical Triggers)
*   **Primary:** Background `primary`, text `on_primary`. Corner radius `DEFAULT` (0.5rem). No border.
*   **Secondary:** Background `surface_container_high`, text `primary`. Use for standard navigation.
*   **Tertiary (Ghost):** Text `primary`, no background. For low-priority actions.

### Cards & Clusters
Forbid divider lines. Use `spacing-4` to separate content blocks. A "Tactical Card" is simply a `surface_container_low` shape sitting on a `surface` background, with a `secondary_fixed_dim` (Copper) 2px tall accent bar at the very top to denote "Active" status.

### HUD Inputs
*   **Text Fields:** `surface_container_lowest` background. 1px `outline_variant` (at 20% opacity). When focused, the border transitions to 100% `primary` opacity with a subtle outer glow.
*   **Chips:** Use `tertiary_container` for status indicators. They should look like integrated hardware labels.

### Specialized Components
*   **Telemetry Strip:** A horizontal bar at the top or bottom of the screen using `surface_container_highest` to house constant data streams (time, latency, coordinates).
*   **Data Scrim:** A semi-transparent `surface_dim` gradient overlay used when a modal is active, ensuring the "map" underneath is still felt but not distracting.

## 6. Do's and Don'ts

### Do
*   **Do** use `secondary` (Copper) for exactly ONE element per screen to draw the eye instantly.
*   **Do** embrace asymmetry. A heavy left-hand command rail with a wide-open right-hand map creates a professional, bespoke feel.
*   **Do** use `Round Twelve` shapes (`DEFAULT`: 0.5rem) consistently to soften the "tactical" edge and make it feel premium/modern.

### Don't
*   **Don't** use pure white (#FFFFFF). Use `on_surface` (#e3e3de) to prevent eye strain in dark environments.
*   **Don't** use 1px solid borders to create grids. Use `spacing-px` gaps between `surface_container` blocks to let the background "bleed" through as a line.
*   **Don't** use standard "blue" for links. Use `primary` or `secondary` tokens only.