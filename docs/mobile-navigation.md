# Mobile browser navigation

The dashboard previously rendered its mobile header only inside Capacitor.
Browser viewports below 768px hid the desktop sidebar without exposing a menu
button. Mobile web now has a fixed header with menu, page/context labels and a
direct settings link.

## Behavior

- The menu opens the existing sidebar as a modal drawer. Links retain existing
  role filtering and the selected coached athlete's routes.
- Navigation and context changes close the drawer. The close button restores
  focus to the menu trigger; touch targets are at least 44px.
- Language, theme, settings and logout are directly accessible in the mobile
  drawer without nested hover menus. Language uses the existing account preference.
- Small-screen settings use a native section selector, populated only with the
  account's allowed sections.
- The header reserves its own space and remains visible while the calendar scrolls.
  The drawer accounts for safe-area insets and hides the floating chat button
  while open, so it cannot cover navigation.
- At 768px and above, the existing desktop sidebar, account menu and settings
  tabs remain in use. The separate Capacitor layout remains in place.
- This change does not redesign every chart or form, or change API permissions.

## Verification

Use a linked QA coach/athlete pair rather than a real account when changing
language or logging out.

1. At 320, 390, 430 and 767px, open and close the menu with touch.
   Check menu bounds, 44px links, close-button focus and unobstructed controls.
2. Visit calendar, statistics, progression, records, metrics and messages.
   Confirm the menu closes and remains available after scrolling.
3. Open settings directly from the header. Visit profile, connectors, zones,
   coaches and invitations with an athlete-only UI.
4. Change Spanish to English and back from the drawer.
5. With a coach UI, navigate to a linked athlete and verify the athlete context.
   Coach settings must offer athlete management, not personal athlete sections.
6. With both roles, switch spaces through the existing space selector.
7. Check the drawer on a short viewport and resize to 768 and 1440px.
   Desktop navigation and settings tabs must be visible; mobile controls hidden.

Development verification used Chromium touch emulation and a real QA login.
Role-specific UI responses were simulated; no account roles were changed.
This does not replace a final check on an actual phone browser.

Run `pnpm web tsc:check`, `pnpm web lint` and `git diff --check` after changes.
