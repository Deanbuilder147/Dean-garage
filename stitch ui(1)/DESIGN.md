# Tactical Design System: The Kinetic Command Interface

## 1. Overview & Creative North Star
**Creative North Star: The Kinetic Command Interface**

This design system moves away from the "flat web" aesthetic and into the realm of high-fidelity tactical simulations. It is designed to feel like a high-performance mecha cockpit—an environment where information density is high, but cognitive load is managed through precise color coding and tonal layering. 

The system breaks standard "template" layouts by using **intentional asymmetry**, **ASCII-inspired framing**, and **monospaced data clusters**. We are not building a website; we are building a heads-up display (HUD). Every element must feel functional, mechanical, and mission-critical.

## 2. Colors
The palette is rooted in a deep-space teal, utilizing high-contrast amber and neon green to signify priority and system health.

*   **Primary (Amber - #FFB000):** Reserved for "Pilot Intervention" points. Use `primary` and `primary_container` for critical actions, warnings, and active navigation states.
*   **Secondary (Neon Green - #00FF41):** The "Heartbeat" of the system. Use `secondary_container` for terminal text, successful status pings, and real-time data streams.
*   **The "No-Line" Rule:** We do not use 1px solid borders to define sections. Layout boundaries are created through background shifts. For example, a `surface_container_low` sidebar sits against a `surface` background. If visual separation is required, use a 2px vertical "notch" of `surface_tint` at the top of a container rather than a full border.
*   **Surface Hierarchy & Nesting:** Depth is achieved by "carving" into the UI.
    *   `surface_container_lowest`: Background for data-heavy terminal logs.
    *   `surface`: The main chassis of the application.
    *   `surface_container_highest`: Floating tactical overlays or high-priority modals.
*   **The "Glass & Gradient" Rule:** To simulate a CRT or advanced OLED projection, apply a subtle linear gradient to large containers (e.g., `surface` to `surface_bright` at a 15-degree angle). For floating panels, use `surface_container_high` at 85% opacity with a `12px` backdrop blur to allow "ghost data" from the layer below to bleed through.

## 3. Typography
Typography is treated as a technical instrument. We use **Space Grotesk** for its mechanical precision and distinctive character terminals.

*   **Display/Headline Scale:** Use `display-lg` for mission titles. These should be set in all-caps with `0.1em` letter spacing to mimic industrial stenciling.
*   **Technical Data (Body/Label):** Use `body-sm` for the majority of the interface. High information density is encouraged. All numerical data should use tabular figures to ensure columns align perfectly in tactical readouts.
*   **ASCII Accents:** Supplement typography with non-alphanumeric characters. Use `[` `]` `>` and `::` to frame labels and titles (e.g., `[ STATUS: OPTIMAL ]`). This grounds the UI in a "terminal" heritage without sacrificing modern legibility.

## 4. Elevation & Depth
In a tactical mecha environment, depth is not about "soft shadows" from a sun—it’s about **electromagnetic glow** and **physical layering**.

*   **The Layering Principle:** Instead of shadows, use **Tonal Offset**. To make a module feel "pressed" into the dashboard, use `surface_container_lowest`. To make it feel "raised," use `surface_container_highest`.
*   **Ambient Glows:** When a floating state is required (like a critical alert), do not use a black shadow. Use a diffused glow of the `primary` (Amber) color at 10% opacity with a `40px` blur. It should look like the screen is radiating light, not casting a shadow.
*   **The "Ghost Border" Fallback:** If a container requires a frame for tactical clarity, use the `outline_variant` token at 20% opacity. This creates a "latched" appearance without closing off the layout.
*   **Grid Overlays:** Apply a repeating 24px x 24px grid of `outline` at 5% opacity across the entire `background` layer to provide a sense of scale and coordinate-based positioning.

## 5. Components

### Buttons (Tactical Actuators)
*   **Primary:** Solid `primary_container` (Amber). Text in `on_primary_container`. No rounded corners (`0px`).
*   **Secondary:** Ghost style. No fill, `outline` at 40%, with Amber text. On hover, the background fills with a 10% Amber tint.
*   **Visual Soul:** Add a 1px "scanning line" (a white line at 5% opacity) that slowly pans vertically across the button surface to create a sense of active hardware.

### Segmented Progress Bars (Systems Load)
*   Do not use smooth, continuous bars. Divide the progress bar into 10 distinct blocks.
*   Filled blocks: `secondary_container` (Neon Green).
*   Empty blocks: `surface_container_highest`.
*   This reinforces the "quantized" technical nature of the mecha's telemetry.

### Input Fields (Command Line)
*   Remove all background fills. Use a single bottom-stroke of `outline_variant`.
*   Prefix every input with a `>` character in `primary` (Amber).
*   The cursor should be a solid block `█` using the `secondary` token, set to a "blink" animation.

### Cards & Lists
*   **Forbid Dividers:** Use vertical spacing and background shifts (`surface_container_low` vs `surface_container_high`). 
*   **Tactical Metadata:** Every card should have a small "ID tag" in the top right corner (e.g., `MD-084`) using `label-sm` to make the content feel like part of a larger database.

### Additional Component: The "Data Feed"
*   A scrolling vertical log of system events using `label-sm` in `on_secondary_container`. Every entry should be timestamped (e.g., `12:04:99 // SYNC_OK`).

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Let one column be significantly narrower than the other to simulate a specialized tool-rail.
*   **Use Tabular Data:** Align numbers and technical specs in rigid columns.
*   **Apply "Visual Noise":** A very subtle film grain or scanline overlay (2% opacity) adds a premium, "hardware" feel.

### Don't:
*   **Don't Round Corners:** All `borderRadius` must be `0px`. Roundness suggests consumer-grade softness; 90-degree angles suggest military-grade rigidity.
*   **Don't Use Standard Icons:** Avoid "bubbly" or "rounded" icon sets. Use thin-stroke, geometric icons or ASCII characters.
*   **Don't Use Pure Whites:** Use `on_surface` (Teal-tinted white) for text to ensure the UI feels integrated with the deep teal background. Pure white will "break" the HUD immersion.