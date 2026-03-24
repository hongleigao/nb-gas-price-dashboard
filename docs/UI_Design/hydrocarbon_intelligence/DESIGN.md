# Design System Strategy: The Predictive Authority

## 1. Overview & Creative North Star
The North Star for this design system is **"The Digital Architect."** 

In the volatile world of fuel price prediction, users require more than just data; they require a sense of structural stability and absolute clarity. This system rejects the cluttered, "dashboard-in-a-box" aesthetic. Instead, it adopts a high-end editorial approach—utilizing intentional white space, sophisticated tonal layering, and an authoritative typographic scale. We move beyond simple "blue boxes" to create a premium environment that feels less like a utility and more like a high-level intelligence briefing.

### Breaking the Template
*   **Asymmetric Focus:** Primary data visualizations should occupy 60-70% of the horizontal plane, flanked by "insight cards" that use overlapping depth to break the rigid grid.
*   **Tonal Depth:** We abandon the "white card on gray background" cliché. We use five distinct tiers of surface light to create a hierarchy of information.
*   **Precision Details:** Every element is designed with an obsession for "The Pixel Gap"—using exact spacing tokens to separate logic from noise.

---

## 2. Colors: The Tonal Spectrum
Our palette is rooted in a regulatory Navy Blue, balanced by high-utility semantic colors that communicate market shifts instantly.

### The "No-Line" Rule
**Strict Mandate:** Designers are prohibited from using 1px solid borders for sectioning or card definition. Boundaries must be defined solely through background color shifts. For instance, a `surface-container-lowest` card (#ffffff) should sit atop a `surface-container-low` (#f3f4f5) background. Use the contrast of these planes to define the edge, not a line.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers, like stacked sheets of architectural vellum.
*   **Level 0 (Base):** `surface` (#f8f9fa) - The canvas.
*   **Level 1 (Sections):** `surface-container-low` (#f3f4f5) - Large content areas.
*   **Level 2 (Active Cards):** `surface-container-lowest` (#ffffff) - Interactive data points.
*   **Level 3 (Overlays):** `surface-bright` (#f8f9fa) - Popovers and floating elements.

### The "Glass & Gradient" Rule
To elevate the experience, use **Glassmorphism** for floating action buttons or temporary overlays. Use a semi-transparent `primary-container` (#1e3a8a at 80% opacity) with a `backdrop-filter: blur(12px)`. 
*   **Signature Textures:** For hero price trends, use a subtle linear gradient transitioning from `primary` (#00236f) to `primary-container` (#1e3a8a) at a 135-degree angle to provide a sense of professional depth.

---

## 3. Typography: Editorial Clarity
We pair **Manrope** for high-level displays and **Inter** for data density. This creates a "Report" feel that balances human readability with mathematical precision.

*   **Display & Headline (Manrope):** These are your "Editorial Voices." Use `display-lg` for current fuel prices to give them weight and authority. The wide tracking of Manrope provides a modern, high-end fintech feel.
*   **Body & Labels (Inter):** These are your "Workhorses." Inter’s tall x-height ensures that complex formulas and timestamped data remain legible at small sizes (`body-sm` or `label-sm`).
*   **The Hierarchy of Truth:** Large price fluctuations use `headline-lg` in `secondary` (Green) or `error` (Red). Supporting text always uses `on-surface-variant` (#444651) to ensure the data is the hero, not the label.

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not a stylistic flourish.

*   **The Layering Principle:** Use the Spacing Scale (specifically `spacing-4` and `spacing-6`) to create "breathing rooms" between stacked surfaces. A card should feel like it is floating naturally due to the tonal shift between `surface-container-low` and `surface-container-lowest`.
*   **Ambient Shadows:** If a "floating" state is required (e.g., a predictive tool), use a shadow color tinted with the `on-surface` hex: `rgba(25, 28, 29, 0.06)` with a `40px` blur and `0px` offset. This mimics natural light rather than a digital drop shadow.
*   **The "Ghost Border" Fallback:** If a UI element lacks contrast against a background, use the `outline-variant` (#c5c5d3) at **15% opacity**. This provides a "hint" of a container without breaking the "No-Line" rule.

---

## 5. Components

### Cards & Data Lists
*   **The Rule of Zero Dividers:** Never use horizontal lines to separate list items. Use vertical white space (`spacing-3`) or alternating tonal shifts (`surface-container-low` vs `surface-container-lowest`).
*   **Micro-Signals:** Use the `secondary` (#006c49) for "Price Drop" chips and `tertiary` (#3e2400) or `error` (#ba1a1a) for "Price Rise" alerts.

### Buttons
*   **Primary:** High-gloss `primary` (#00236f) with `on-primary` (#ffffff) text. Use `rounded-md` (0.375rem) for a professional, slightly sharp edge.
*   **Secondary:** `surface-container-highest` background with `primary` text. No border.
*   **Tertiary/Ghost:** No background. Bold `primary` text. Use for low-emphasis actions like "View Source."

### Input Fields
*   **Style:** Filled style using `surface-container-high`. 
*   **Focus State:** A 2px "Ghost Border" using `surface-tint` (#4059aa) at 40% opacity. Avoid heavy glow effects.

### Data Visualization Components
*   **Skeleton Loading:** Use a pulsing gradient from `surface-container-high` to `surface-container-highest`.
*   **Price Trend Charts:** Use a 3px stroke width for lines. Fill the area beneath the line with a subtle gradient of the stroke color (at 5% opacity) to ground the data.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use `display-sm` for large numerical values to emphasize "Data as Truth."
*   **Do** rely on the `surface-container` tiers to organize complex dashboard layouts.
*   **Do** use `rounded-xl` for large parent containers and `rounded-sm` for internal elements like buttons or chips to create a "nested" visual logic.
*   **Do** ensure all semantic colors (Success/Warning) meet a 4.5:1 contrast ratio against the background.

### Don’t
*   **Don’t** use pure black (#000000) for text. Use `on-surface` (#191c1d) to maintain a soft, high-end editorial feel.
*   **Don’t** use 1px solid lines to separate content. If the layout feels messy, increase the `spacing` tokens instead.
*   **Don’t** use standard "Material" blue. Only use the specified Navy `primary` (#00236f) to maintain the "Regulatory Authority" brand voice.
*   **Don’t** use heavy shadows. If you can clearly see where the shadow ends, it is too dark.