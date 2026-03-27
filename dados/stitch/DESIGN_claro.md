# Design System Strategy: The Cartographic Command Center

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Atlas"**. 

This system rejects the cold, sterile aesthetics of typical strategy games in favor of a "High-End Editorial" experience. We are blending the tactical precision of a modern logistics command center with the timeless, tactile elegance of a physical cartographic atlas. The interface should feel like a premium, bespoke tool used by a high-ranking strategist—authoritative, legible, and mature.

To break the "template" look, we utilize **intentional asymmetry**. Primary data visualizations should not be perfectly centered; instead, they should be offset to allow for overlapping "floating" panels. We treat the screen as a canvas of fine parchment where information is layered rather than boxed, using large typography scales to provide an editorial rhythm that guides the eye through dense commodity data.

---

## 2. Colors
Our palette is rooted in nature and industry, utilizing the warmth of sand and parchment to reduce eye strain during long gameplay sessions.

- **Primary (`#2D5A27`) & Secondary (`#B87333`):** These represent "Agricultural Green" and "Earthy Copper." Use these for high-intent actions and critical logistics statuses.
- **Tertiary (`#4682B4`):** Our "Hydrographic Blue," reserved for water-based logistics, energy, and secondary data streams.
- **The "No-Line" Rule:** We strictly prohibit the use of 1px solid borders for sectioning content. To define a sidebar or a header, use a background shift—for example, a `surface_container_low` (`#f8f3e5`) panel sitting on a `surface` (`#fef9eb`) background.
- **Surface Hierarchy:** Depth is created by nesting.
    - **Base:** `surface`
    - **Grouping:** `surface_container`
    - **Floating UI:** `surface_container_lowest` (White) to provide a "lifted" feel.
- **The "Glass & Gradient" Rule:** Floating tactical menus must use a semi-transparent `surface` color with a `backdrop-blur`. Main CTAs should feature a subtle linear gradient from `primary` to `primary_container` to add a "soul" and professional polish that distinguishes the game from a standard spreadsheet.

---

## 3. Typography
The typography system is a dialogue between the past and the future.

- **Display & Headlines (Lexend):** A sophisticated sans-serif. This provides the "Atlas" feel. Use `display-lg` and `headline-md` for region names, commodity categories (e.g., "AGRO," "MINERAL"), and major logistics milestones. It conveys authority and history.
- **Body & Labels (Work Sans):** A clean, highly legible sans-serif. This represents the "Command Center" aspect. It is used for high-density data tables, commodity counts, and operational tooltips. 
- **The Hierarchy:** By pairing a large, elegant Sans-Serif title with small, tight Sans-Serif labels, we create an editorial contrast that makes even the densest data feel organized and intentional.

---

## 4. Elevation & Depth
We eschew traditional "drop shadows" in favor of **Tonal Layering**.

- **The Layering Principle:** Depth is achieved by stacking tokens. A `surface_container_highest` (`#e7e2d4`) element feels "deeper" or "recessed," while a `surface_container_lowest` (`#ffffff`) element feels "raised."
- **Ambient Shadows:** When a panel must float (e.g., a map detail pop-out), use a shadow with a 20px-40px blur at 6% opacity. The shadow color must be a tinted version of `on_surface` (`#1d1c13`), never pure black.
- **Ghost Borders:** If a boundary is required for accessibility, use the `outline_variant` token at 15% opacity. It should be felt, not seen.
- **Tactile Density:** Reference the high-density spreadsheet: use the `0.5` (0.1rem) and `1` (0.2rem) spacing tokens to keep data tight, but wrap these dense blocks in large `20` (4.5rem) margins to give the UI "breathing room" typical of high-end magazines.

---

## 5. Components

### **Buttons**
- **Primary:** Gradient fill (`primary` to `primary_container`), `on_primary` text, `md` (0.75rem) roundedness.
- **Secondary:** `surface_container_high` fill with a `Ghost Border`.
- **States:** On hover, increase the `surface_tint` overlay.

### **Commodity Chips**
- Use `rounded-full` (9999px) for status indicators.
- **Logic:** Agriculture uses `primary_fixed`, Minerals use `secondary_fixed`, and Energy uses `tertiary_fixed`. This color-coding allows players to scan high-density maps instantly.

### **Data Tables (The Map Legend)**
- **Forbid Dividers:** Do not use lines between rows. Use alternating tonal shifts (zebra striping) between `surface` and `surface_container_low`.
- **Typography:** Headers must be `label-sm` in all-caps with 0.05em letter spacing.

### **Tactical Tooltips**
- **Style:** `surface_container_lowest` (White) background with a `lg` (1rem) corner radius.
- **Interaction:** 200ms fade-in. Must include a `tertiary` accent "lead-line" connecting the tooltip to the map coordinate.

### **Input Fields**
- **Style:** Minimalist. No bottom line or box. Use a `surface_variant` background with a `sm` (0.25rem) radius.
- **Focus:** Transition to a `Ghost Border` using the `primary` color.

---

## 6. Do's and Don'ts

### **Do:**
- **Do** use `Lexend` for all numbers that represent "Legacy" or "Wealth" (e.g., total profits).
- **Do** use `Work Sans` for all functional/logistical numbers (e.g., tons of Soy, Kilowatts).
- **Do** lean into asymmetrical layouts. A sidebar that doesn't reach the bottom of the screen feels more "bespoke."
- **Do** use the Spacing Scale religiously to maintain a mathematical rhythm in dense data views.

### **Don't:**
- **Don't** use Purple. The palette must remain grounded in the sand, earth, and crops.
- **Don't** use 100% black shadows. It breaks the "parchment" illusion.
- **Don't** use standard 1px borders. If you feel the need to draw a line, try using a 4px gap of white space instead.
- **Don't** use Dark Mode. This system is designed for the high-contrast, prestigious feel of a physical atlas.

---

## 7. Signature Element: The "Commodity Ribbon"
For the high-density data categories seen in the reference (Agro, Pecuária, Florestal, etc.), use a horizontal "Ribbon" component at the top of data clusters. This ribbon should be a subtle `surface_container_highest` bar with `Lexend` category labels, creating a structural "anchor" for the dense `Work Sans` numbers below.