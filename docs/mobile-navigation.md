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

## Collapsed desktop coach sidebar

When a coach collapses the desktop sidebar, a single **Athletes** button opens a
menu of linked athlete names. Each athlete has Calendar, Statistics, Progression,
Records, Metrics and Settings links. The current athlete/page is highlighted.
The menu supports keyboard navigation, Escape and scrolling through long lists;
it is disabled when there are no athletes. The expanded sidebar and mobile drawer
retain their existing athlete navigation.

Regression checks: `node scripts/tests/coach-sidebar.browser.mjs`, with an
isolated Vite server on 5188 and Chromium CDP on 9331. API data is mocked.

## Calendar actions

- Athlete-only accounts no longer show the ambiguous `activity` creation button.
  It opened a completed-activity form, not a planned workout. That form also
  omitted metrics required by the create-activity API. This change removes the
  entry point; it does not implement manual activity logging. Existing activity
  details, feedback and editing remain available.
- On mobile, a coach with a selected athlete sees a date field and a **Plan**
  menu: training, template, AI (when available), competition and note. Each action
  uses the selected date. Touch targets are at least 44px and wrap on narrow screens.
- The menu reuses the existing dialogs and role checks. The coach overview has no
  creation action until an athlete is selected. Dual-role accounts retain their
  existing ability to plan their own training. Desktop planning controls are unchanged.
- Capacitor's existing page actions use the same options and selected date;
  duplicate training entries have been removed.

## Days with many events

- The mobile event list inside each day scrolls independently when its content
  exceeds 20rem or half the viewport height. The date, event count and cycle labels
  remain outside that scroll region.
- A localized hint appears only when the list overflows. The region is labelled
  with its date and becomes keyboard-focusable when scrolling is needed. Scroll
  gestures stay inside that day; use its header to move through the calendar.
- Virtualized days and week summaries use measured heights rather than fixed
  estimates, including when cycle labels wrap or an activity contains a linked
  training card. The next day no longer covers the final cards.
- Short lists keep their natural height. Desktop day layouts are unchanged.

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

8. In an athlete-only calendar, confirm there is no `activity` button or planning
   menu. In a linked athlete's calendar as a coach, check the date field and **Plan**
   menu at 320, 390, 430 and 767px. Select another date and open training,
   competition, note, template and AI dialogs; close each without saving.
   Confirm the chosen date is passed to training and competition forms, touch
   targets remain reachable, and the menu does not lock the page after closing.
   At 768px and above, confirm the mobile planning toolbar disappears.

9. With synthetic data, display twelve activities in one day, including a linked
   training card and several cycle labels, then a day with one activity. At 320,
   390 and 767px and a short 390 × 480 viewport, swipe within the busy day until
   the last activity is fully visible. Confirm the outer calendar stays still,
   the last activity opens on tap, rows do not overlap, and the short list has no
   scroll hint. Resize to desktop and confirm the inner mobile regions disappear.

Implementation-time verification used Chromium touch emulation and a real QA login.
Role-specific UI responses were simulated; no account roles were changed.
This does not replace a final check on an actual phone browser.

Run `pnpm web tsc:check`, `pnpm web lint` and `git diff --check` after changes.

## Source references

- [Application sidebar](../apps/web/src/components/sidebar/app-sidebar.tsx)
- [Collapsed athlete selector](../apps/web/src/components/sidebar/collapsed-athlete-menu.tsx)
