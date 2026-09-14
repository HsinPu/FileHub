# AGENTS.md

## 專案適用範圍

- 回答與產品介面文案使用繁體中文（台灣用語）。
- 下列規範適用於本專案前端的開發、修改、重構與審查；不要求後端採用前端元件或樣式規則。
- React、TypeScript 與 Ant Design 為前端技術方向；Stripe 與 Linear 為互動與視覺設計參考。
- 本文件記錄規範，不代表介面已完成調整，也不代表授權立即實作或部署先前規劃。
- 主題範例為預設方向；修改前須檢查既有主題並保留刻意的品牌設定，避免重複建立設定。

---


This document defines the frontend engineering, UI/UX, visual design, component usage, styling, and implementation standards for this project.

All AI coding agents, including Codex, as well as human developers, must follow these rules when creating, modifying, refactoring, or reviewing frontend code unless explicitly instructed otherwise.

---

# 1. Project Design Philosophy

This project uses:

* React
* TypeScript
* Ant Design

Ant Design is the primary UI component library.

The visual direction is inspired by:

* Stripe Dashboard
* Linear

Do not directly copy proprietary logos, branding, illustrations, trademarks, or branded copy.

Use Stripe and Linear only as references for interaction design, visual hierarchy, layout discipline, spacing, density, and information presentation.

The final product should feel:

* Quiet
* Precise
* Professional
* Modern
* Compact
* Information-dense
* Fast
* Clear
* Work-focused
* Visually restrained
* Consistent
* Suitable for daily enterprise usage

The interface should look like a mature production application, not a generic AI-generated demo.

---

# 2. Core Visual Formula

The desired visual direction is:

```text
Stripe data discipline
+
Linear visual restraint
+
Ant Design implementation
```

In practice, this means:

* Ant Design components
* Stripe-inspired tables and forms
* Stripe-inspired data presentation
* Linear-inspired navigation
* Linear-inspired sidebar
* Linear-inspired toolbar
* Linear-inspired typography hierarchy
* Neutral visual palette
* Thin borders
* Minimal shadows
* Restrained border radius
* Compact spacing
* Strong information hierarchy
* Low visual noise
* Medium-to-high information density

---

# 3. Product Type

This project should primarily resemble:

```text
Enterprise Application
Operational Tool
Admin Interface
Dashboard
Data-heavy Application
Internal System
Professional SaaS Product
```

It should NOT resemble:

```text
Marketing Landing Page
AI Startup Landing Page
Dribbble Concept
Futuristic Neon UI
Gaming UI
Glassmorphism Demo
Decorative SaaS Homepage
```

When uncertain, prefer productivity over decoration.

---

# 4. Ant Design Is the Primary UI System

Use Ant Design components whenever an appropriate component already exists.

Examples:

* Button → `Button`
* Input → `Input`
* Search → `Input.Search`
* Numeric Input → `InputNumber`
* Select → `Select`
* AutoComplete → `AutoComplete`
* Checkbox → `Checkbox`
* Radio → `Radio`
* Switch → `Switch`
* Slider → `Slider`
* Date → `DatePicker`
* Time → `TimePicker`
* Upload → `Upload`
* Form → `Form`
* Table → `Table`
* Pagination → `Pagination`
* Modal → `Modal`
* Drawer → `Drawer`
* Popconfirm → `Popconfirm`
* Popover → `Popover`
* Tooltip → `Tooltip`
* Dropdown → `Dropdown`
* Menu → `Menu`
* Tabs → `Tabs`
* Steps → `Steps`
* Breadcrumb → `Breadcrumb`
* Alert → `Alert`
* Tag → `Tag`
* Badge → `Badge`
* Avatar → `Avatar`
* Empty → `Empty`
* Result → `Result`
* Skeleton → `Skeleton`
* Spin → `Spin`
* Progress → `Progress`
* Notification → `notification`
* Message → `message`

Do not recreate components that Ant Design already provides.

Do not create custom versions of:

* Buttons
* Inputs
* Selects
* Modals
* Tables
* Forms
* Dropdowns
* Date pickers

unless there is a clear product requirement that Ant Design cannot satisfy.

---

# 5. Do Not Introduce Another UI Library

Do not add another major UI library unless explicitly requested.

Do not introduce:

* Material UI
* shadcn/ui
* Chakra UI
* Mantine
* Bootstrap UI
* PrimeReact
* Semantic UI

Avoid mixing multiple UI systems.

Reasons:

* inconsistent appearance
* duplicated components
* increased bundle size
* harder theming
* inconsistent UX
* unnecessary maintenance

---

# 6. Global Theme Specification

Use the following values as the default design direction unless the existing project already defines equivalent or intentional alternatives.

## Global Tokens

```text
Primary color: #2563eb
Base background: #ffffff
Layout background: #f8f9fb

Primary text: #1f2328
Secondary text: #667085

Primary border: #dfe3e8
Secondary border: #eceff3

Default border radius: 6px
Default font size: 14px
```

---

# 7. Required Ant Design Theme Direction

When the project does not already have an equivalent theme configuration, implement an Ant Design theme similar to:

```tsx
import type { ThemeConfig } from 'antd';

export const appTheme: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb',

    colorBgBase: '#ffffff',
    colorBgLayout: '#f8f9fb',

    colorText: '#1f2328',
    colorTextSecondary: '#667085',

    colorBorder: '#dfe3e8',
    colorBorderSecondary: '#eceff3',

    borderRadius: 6,
    fontSize: 14,
  },

  components: {
    Button: {
      borderRadius: 6,
      controlHeight: 32,
    },

    Input: {
      borderRadius: 6,
      controlHeight: 32,
    },

    Select: {
      borderRadius: 6,
      controlHeight: 32,
    },

    Table: {
      headerBg: '#f8f9fb',
      headerColor: '#475467',
      borderColor: '#eceff3',
    },

    Card: {
      borderRadiusLG: 8,
    },

    Modal: {
      borderRadiusLG: 8,
    },
  },
};
```

If the project already contains an established theme:

1. inspect it first
2. reuse it
3. preserve intentional brand decisions
4. do not create duplicate theme configurations

Do not blindly overwrite existing design tokens.

---

# 8. Theme Implementation Rules

Prefer the following order for styling:

1. Ant Design `ConfigProvider`
2. Global Design Tokens
3. Component Tokens
4. Ant Design component props
5. Existing shared style system
6. Component-level CSS only when necessary

Avoid large amounts of direct Ant Design CSS overrides.

Avoid deeply targeting `.ant-*` internal selectors unless no clean alternative exists.

Do not hardcode visual values repeatedly if an equivalent token can be reused.

---

# 9. Visual Palette

Prefer:

* white primary surfaces
* light neutral layout backgrounds
* neutral gray borders
* dark neutral text
* muted secondary text
* one controlled accent color

A useful visual balance is:

```text
80% neutral
15% structural hierarchy
5% accent color
```

Accent color should not dominate the entire interface.

---

# 10. Color Usage

Use color only when it communicates meaning.

Appropriate uses:

* primary action
* selected state
* success
* warning
* error
* information
* status
* meaningful highlight

Avoid adding color simply to make a page more visually interesting.

Status colors should generally be restrained.

Prefer:

```text
subtle background
soft border
restrained text color
```

over saturated blocks.

---

# 11. Avoid Generic AI UI

Unless explicitly requested, do not use:

* purple-blue gradients
* rainbow gradients
* neon effects
* glow
* glassmorphism
* large blur effects
* decorative gradient blobs
* floating light orbs
* oversized hero sections
* marketing banners
* decorative illustrations
* huge headings
* excessive whitespace
* card walls
* cards nested inside cards
* huge border radii
* excessive pill shapes
* heavy shadows
* decorative animation
* emoji as primary UI icons

Do not assume:

```text
more decoration = better design
```

Usually the opposite is true for enterprise software.

---

# 12. Visual Hierarchy Priority

Create hierarchy in this order:

1. Typography
2. Spacing
3. Alignment
4. Border
5. Background
6. Color
7. Shadow

Shadow should be one of the last tools used.

---

# 13. Border Radius

Keep radius restrained.

Recommended:

```text
Button: 6px
Input: 6px
Select: 6px
Dropdown: 6px–8px
Card: 6px–8px
Modal: approximately 8px
```

Avoid making these standard values:

```text
16px
20px
24px
32px
```

Do not make every component pill-shaped.

---

# 14. Borders

Use borders and separators to establish structure.

Prefer:

```text
1px subtle neutral border
```

Use borders for:

* tables
* toolbar separation
* panels
* input boundaries
* section hierarchy

Do not rely on heavy shadows for structure.

---

# 15. Shadows

Use shadows sparingly.

Appropriate:

* Modal
* Dropdown
* Popover
* Floating overlay
* Context menu

Normal page content should usually use:

* spacing
* border
* background contrast
* typography

instead of shadows.

Never combine unnecessary:

```text
Border
+ Heavy Shadow
+ Glow
+ Gradient
```

---

# 16. Information Density

Default to:

**Medium-to-High Information Density**

Avoid:

* huge row heights
* oversized controls
* oversized toolbar buttons
* excessive form spacing
* large empty areas
* headers consuming excessive viewport height

Desktop applications should expose meaningful information without feeling cramped.

---

# 17. Spacing System

Prefer a consistent spacing scale:

```text
4
8
12
16
20
24
32
40
48
```

Avoid arbitrary values such as:

```text
13
17
19
23
29
```

Reuse the existing spacing system when one exists.

---

# 18. Typography

Typography should feel:

* compact
* precise
* restrained
* readable
* work-focused

Recommended ranges:

```text
Body: 14px–16px
Secondary: 12px–14px
Page title: 20px–28px
```

Avoid unnecessarily large:

```text
48px
64px
72px
```

headings inside dashboards and enterprise tools.

---

# 19. Typography Hierarchy

Use clear levels:

```text
Page Title
Section Title
Subsection
Body
Secondary
Caption
```

Do not make every text level bold.

Use:

* size
* font weight
* color
* spacing

together to establish hierarchy.

---

# 20. Layout Principles

Typical management page:

```text
Global Navigation
↓
Page Header
↓
Toolbar / Actions
↓
Filters
↓
Main Content
↓
Pagination / Footer
```

Typical sidebar layout:

```text
┌────────────────────────────────────────────┐
│ Top Bar                                    │
├────────────┬───────────────────────────────┤
│ Sidebar    │ Page Header                   │
│            ├───────────────────────────────┤
│            │ Toolbar / Filters             │
│            ├───────────────────────────────┤
│            │                               │
│            │ Main Content                  │
│            │                               │
└────────────┴───────────────────────────────┘
```

Do not reinvent page layout for every screen.

---

# 21. Sidebar

Sidebar visual behavior should be inspired by Linear.

The sidebar should be:

* compact
* quiet
* structured
* fast to scan
* visually consistent

Rules:

* keep selected state subtle
* avoid colorful icons for every item
* avoid card backgrounds around every item
* keep icon sizes consistent
* keep label sizes consistent
* use muted group labels
* avoid heavy separators
* keep navigation hierarchy obvious

Preferred selected state:

```text
subtle neutral background
+ stronger text
```

Avoid:

```text
large saturated color block
+ white text
+ shadow
```

unless required by branding.

---

# 22. Top Bar

Keep the top bar simple.

Typical content:

* Breadcrumb
* Search
* Global actions
* User menu
* Notifications

Avoid decorative elements.

---

# 23. Page Header

A page header should generally contain:

* title
* optional description
* primary action
* secondary actions

Good:

```text
User Management
Manage accounts, roles, and permissions.

                                  [Add User]
```

Avoid:

```text
Welcome back 👋
Empower your workflow and unlock a smarter future
```

Enterprise UI copy should be functional, not promotional.

---

# 24. Buttons

A page usually has one obvious primary action.

Example:

```text
[Add User]
```

Other actions should use:

* default
* text
* link
* dropdown

Avoid making every action primary.

Bad:

```text
[Add]
[Export]
[Refresh]
[Settings]
[Download]
```

all rendered as strong blue primary buttons.

---

# 25. Button Size

Prefer compact controls.

Use:

* `small`
* `middle`

for most enterprise interfaces.

Do not use large buttons by default.

---

# 26. Icon Buttons

Use icon buttons for familiar actions such as:

* refresh
* settings
* close
* more
* filter

Use Ant Design Icons or the existing project icon library.

Provide Tooltip when meaning may not be obvious.

Do not use emojis as operational icons.

---

# 27. Tables

Tables should visually follow Stripe-like discipline.

Desired qualities:

* compact
* readable
* structured
* data-first
* restrained

Prefer Ant Design `Table`.

---

# 28. Table Density

Rows should be compact enough for scanning.

Avoid:

* excessive row height
* cards inside rows
* large buttons in every row
* too many colored tags
* decorative icons without meaning

---

# 29. Table Header

Prefer:

* neutral background
* subtle divider
* restrained text
* medium or small typography

Avoid:

* saturated background
* gradient
* heavy shadow

---

# 30. Table Alignment

Recommended:

```text
Text → left
Numbers → right
Currency → right
Status → left or center depending on context
Actions → right
```

---

# 31. Table Actions

Avoid placing too many visible actions in each row.

Prefer:

```text
Edit
More (...)
```

Secondary actions go into a dropdown.

Example:

```text
...
├─ Duplicate
├─ Disable
├─ History
└─ Delete
```

---

# 32. Table Text Overflow

For long content:

* define reasonable widths
* use ellipsis
* use Tooltip when helpful
* avoid uncontrolled horizontal expansion

---

# 33. Date Formatting

Use a consistent date format across the same interface.

Example:

```text
2026-09-11 14:30
```

Avoid inconsistent combinations like:

```text
Sep 11
2026/09/11
11-09-2026
Yesterday
```

unless relative time is intentionally part of the UX.

---

# 34. Status Presentation

Status styling should follow Stripe-like restraint.

Use:

* `Tag`
* `Badge`
* text

Examples:

```text
Active
Pending
Failed
Draft
```

Prefer muted status styling.

Avoid bright, highly saturated blocks.

Status colors must be consistent across the product.

---

# 35. Filters

Filters should remain compact.

Preferred:

```text
[Search] [Status] [Type] [Date] [More Filters]
```

Avoid wrapping every filter inside a card.

For advanced filters, use:

* Drawer
* Popover
* Collapse

Do not let filters consume half the page by default.

---

# 36. Search

Search should remain functional and compact.

Prefer:

* `Input.Search`
* Input + search icon

Avoid giant search hero sections.

---

# 37. Forms

Forms should be inspired by Stripe.

Forms should feel:

* clear
* structured
* predictable
* readable
* easy to complete

Use Ant Design `Form`.

---

# 38. Form Width

Do not allow ordinary forms to stretch across extremely wide screens.

Typical width:

```text
480px–720px
```

Adjust based on content.

Complex settings pages may use wider layouts.

---

# 39. Form Labels

Always use clear labels.

Use when appropriate:

* help text
* description
* tooltip
* validation message

Do not rely on placeholder text as the only label.

---

# 40. Form Validation

Error messages should be specific.

Good:

```text
Email address is not valid.
```

Good:

```text
Password must contain at least 8 characters.
```

Avoid:

```text
Invalid value.
```

Avoid:

```text
Error.
```

---

# 41. Form Layout

Simple forms should normally use one column.

Complex forms may use two columns.

Avoid three or more columns unless clearly necessary.

Do not force multi-column layouts simply to fill screen width.

---

# 42. Settings Pages

Settings pages should visually reference Stripe.

Preferred structure:

```text
Settings Navigation
↓
Section Title
Description
Form / Configuration
Divider
Next Section
```

Do not wrap every settings section in a large decorative card.

---

# 43. Detail Pages

Detail pages should generally follow:

```text
Header
Status
Primary Metadata
Actions
↓
Tabs
↓
Details / Activity / History
```

Avoid turning detail pages into walls of KPI cards.

---

# 44. List Views

List views should primarily reference Linear.

Desired qualities:

* row-based
* compact
* muted metadata
* subtle hover
* fast scanning
* keyboard-friendly when appropriate

Suitable for:

* tasks
* issues
* jobs
* files
* requests
* projects

---

# 45. Toolbars

Toolbars should feel Linear-inspired.

They should be:

* compact
* quiet
* functional
* easy to scan

Example:

```text
Filter
Sort
Group
Display
                              New
```

The primary action should be obvious but not oversized.

---

# 46. Tabs

Prefer Ant Design `Tabs`.

Keep tabs visually simple.

Avoid:

* huge tabs
* colorful tabs
* card tabs everywhere
* pill tabs everywhere

---

# 47. Modals

Use Modal for:

* confirmation
* quick edit
* short form
* simple action

Do not use Modal for:

* large workflows
* large forms
* full detail pages
* long multi-section pages

Use instead:

* Drawer
* dedicated page

---

# 48. Drawers

Use Drawer for:

* contextual detail
* quick edit
* secondary workflow

Do not turn a Drawer into an entire application.

---

# 49. Cards

Use cards sparingly.

Good uses:

* KPI
* isolated summary
* independent widget
* truly distinct information module

Avoid:

```text
Page
└─ Card
   └─ Card
      └─ Card
```

Do not use cards just because whitespace feels uncomfortable.

---

# 50. KPI Presentation

Prefer Stripe-like KPI design.

Example:

```text
Monthly Revenue
$126,420
+8.2%
```

Avoid unnecessary:

* giant icon
* gradient
* glow
* oversized typography
* illustration

---

# 51. Charts

Charts should be:

* clear
* neutral
* minimal
* purpose-driven

Before adding a chart, ask:

```text
What user question does this chart answer?
```

If there is no clear answer, do not add it.

Avoid:

* 3D charts
* rainbow palettes
* unnecessary gauges
* decorative animation

---

# 52. Empty States

Keep empty states simple.

Good:

```text
No payment records yet.

Payments will appear here after the first transaction.
```

When useful:

```text
[Create Payment]
```

Avoid unnecessary illustration or marketing copy.

---

# 53. Loading States

Async interactions must provide appropriate loading feedback.

Use:

* Button loading
* Table loading
* Skeleton
* Spin when necessary

Avoid giant full-screen spinners unless unavoidable.

---

# 54. Error States

API errors must provide useful feedback.

Good:

```text
Failed to load transaction data.
```

When appropriate:

```text
[Reload]
```

Avoid:

```text
Something went wrong.
```

if a more useful message is available.

Do not expose raw stack traces to users.

---

# 55. Destructive Actions

Destructive actions should be explicit.

Examples:

* delete
* disable
* remove
* reset
* clear

Use:

* `Popconfirm`
* confirmation Modal

when appropriate.

Good:

```text
Delete user "Kevin"?

This action cannot be undone.
```

Avoid:

```text
Are you sure?
```

without context.

---

# 56. Responsive Design

Desktop is the primary target, but the UI must not break on:

* tablet
* mobile

Check:

* text overflow
* button overflow
* table overflow
* modal width
* drawer width
* forms
* header
* sidebar
* filters
* pagination

---

# 57. Mobile Behavior

Do not simply shrink the desktop UI.

When necessary:

```text
Sidebar → Drawer
Filters → Collapse / Drawer
Table → horizontal scroll / priority columns
Buttons → stack
```

Avoid:

* overlapping text
* inaccessible buttons
* unusable tables
* controls outside viewport

---

# 58. Accessibility

Always consider:

* keyboard navigation
* focus state
* labels
* ARIA where appropriate
* color contrast
* disabled state
* loading state
* error state

Do not use color alone to communicate state.

---

# 59. Interaction States

Interactive elements should support relevant states:

* Default
* Hover
* Focus
* Active
* Disabled
* Loading

Do not create custom interactive controls with only a default appearance.

---

# 60. Interaction Style

Interactions should feel:

```text
fast
subtle
functional
```

Avoid:

* long transitions
* bounce effects
* parallax
* decorative movement
* floating animation

---

# 61. Animation

Use animation only when it improves functional understanding.

Good uses:

* Modal
* Drawer
* Collapse
* feedback
* state transition

Do not add animation purely to make the interface feel more impressive.

---

# 62. UI Copywriting

Copy should feel like Stripe and Linear:

* concise
* direct
* useful
* non-marketing
* human-readable

Good:

```text
Create API Key
```

Avoid:

```text
Unlock the power of your API
```

Good:

```text
No data
```

Avoid:

```text
Your journey starts here ✨
```

---

# 63. Navigation

Navigation should remain predictable.

Users should quickly understand:

* Where am I?
* Where can I go?
* What should I do next?

Do not change navigation patterns simply for visual novelty.

---

# 64. Keyboard Efficiency

When appropriate, support efficient keyboard interaction.

Examples:

* Enter to submit
* Esc to close
* arrow navigation
* shortcuts
* command actions

Do not add a complex shortcut system unless required.

---

# 65. CSS Rules

Avoid excessive inline styles.

Bad:

```tsx
<div
  style={{
    marginTop: 17,
    padding: 13,
    color: '#333',
  }}
>
```

Small one-off layout adjustments may be acceptable.

Reusable styles should use the existing project styling system.

---

# 66. Avoid !important

Do not use:

```css
!important
```

unless no cleaner option exists.

If many `!important` rules are needed, investigate:

* incorrect selector strategy
* theme configuration issue
* component misuse
* style architecture problem

Fix the underlying cause.

---

# 67. Avoid Direct Ant Design Internal Overrides

Avoid large amounts of:

```css
.ant-btn {}
.ant-table-thead > tr > th {}
.ant-modal-content {}
```

Prefer:

1. Design Token
2. Component Token
3. Component Props
4. Existing shared styles

This reduces upgrade risk.

---

# 68. Component Reuse

Before creating a new component, search for existing:

* page header
* table wrapper
* form wrapper
* toolbar
* status tag
* modal pattern
* drawer pattern
* empty state
* layout

Reuse existing patterns whenever reasonable.

---

# 69. Avoid Premature Abstraction

Do not abstract everything.

If a UI pattern is used once, keep it simple.

If the same pattern appears several times, consider extracting it.

Avoid components like:

```text
UniversalDynamicSuperFlexibleComponent
```

Keep abstractions understandable.

---

# 70. Component Responsibility

Avoid components that simultaneously handle:

* API calls
* forms
* large tables
* modals
* business rules
* navigation
* unrelated UI

Split components when responsibilities become difficult to reason about.

Do not split trivial markup into meaningless components.

---

# 71. TypeScript

Avoid unnecessary:

```ts
any
```

Prefer explicit:

* interface
* type
* union
* generics
* enum only when appropriate

Example:

```ts
interface User {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
}
```

Prefer this over:

```ts
const data: any = ...
```

---

# 72. Props

Component APIs should remain clear.

Avoid overly complicated configuration objects when a simpler API is possible.

If component usage becomes difficult to understand, reconsider the abstraction.

---

# 73. State Management

Do not move every state into global state.

Keep local UI state local.

Examples:

* modal open
* drawer open
* selected tab
* temporary form state

Use global state only when multiple parts of the application genuinely need shared state.

---

# 74. API Handling

Async UI must consider:

* loading
* success
* empty
* error

Do not assume API calls always succeed.

---

# 75. Do Not Modify Unrelated Code

When implementing a task, change only what is relevant.

Do not casually:

* rewrite the whole page
* change the CSS framework
* replace folder structure
* replace state management
* update unrelated dependencies
* redesign unrelated screens
* rewrite existing components

unless required by the task.

---

# 76. Preserve Existing Product Language

Before changing an existing screen, inspect:

* nearby pages
* similar pages
* existing components
* current layout
* existing table patterns
* existing forms
* current theme
* current CSS
* current design conventions

Prefer extending the current product language rather than inventing a new one.

---

# 77. Before Creating a New Page

Before coding, determine:

1. What type of page is this?
2. What is the primary user goal?
3. What information matters most?
4. What is the primary action?
5. What actions are secondary?
6. Does this section actually need a card?
7. Does this task actually need a modal?
8. Does Ant Design already provide the required component?
9. Does the project already contain a similar page?

Then implement the smallest coherent solution.

---

# 78. Stripe vs Linear Reference Rule

Use Stripe primarily for:

```text
Tables
Forms
Settings
Billing-like layouts
Data presentation
Status
Details
KPI
Structured enterprise workflows
```

Use Linear primarily for:

```text
Sidebar
Navigation
Toolbar
List views
Typography
Spacing
Interaction density
Keyboard efficiency
Low-noise layout
```

Use Ant Design for implementation.

---

# 79. Frontend Task Workflow

For every frontend task:

## Step 1 — Inspect

Inspect:

* existing page
* similar pages
* existing components
* existing theme
* shared patterns

## Step 2 — Understand

Identify:

* user goal
* primary action
* secondary actions
* main information
* navigation context

## Step 3 — Reuse

Prefer:

* existing components
* existing layout
* Ant Design components
* existing tokens

## Step 4 — Implement

Use the smallest clean implementation.

Do not redesign unrelated parts of the application.

## Step 5 — Run

Run the application.

Do not assume successful compilation means the UI is correct.

## Step 6 — Visually Inspect

Inspect the actual rendered result.

Review:

* alignment
* spacing
* typography
* borders
* density
* hierarchy
* overflow
* interaction states

## Step 7 — Responsive Review

Check:

* desktop
* tablet
* mobile

## Step 8 — Fix

Fix visual and interaction problems before considering the task complete.

---

# 80. Visual Review Checklist

## Stripe Check

Ask:

* Is the data easy to read?
* Is the table structured?
* Is the form clear?
* Are statuses restrained?
* Are settings understandable?
* Are important numbers easy to compare?

## Linear Check

Ask:

* Is the sidebar compact?
* Is the toolbar quiet?
* Is navigation predictable?
* Is typography restrained?
* Is spacing systematic?
* Is the interface fast to scan?

## Ant Design Check

Ask:

* Are Ant Design components reused?
* Were unnecessary custom controls avoided?
* Are Design Tokens used where appropriate?
* Were internal CSS overrides minimized?

---

# 81. AI-Generated UI Check

Before finishing, ask:

```text
Does this look like a professional production product,
or a generic AI-generated dashboard?
```

Warning signs:

* unnecessary gradients
* giant cards
* huge headings
* decorative icons
* glow
* oversized rounded corners
* excessive whitespace
* random colors
* every section in a card
* marketing language

If several warning signs are present, simplify the interface.

---

# 82. Final Visual Standard

The ideal product should feel like:

```text
Linear's speed
+
Stripe's discipline
+
Ant Design's reliability
```

Not:

```text
Dribbble concept
+
AI demo
+
random CSS
```

---

# 83. Definition of Done

A frontend task is complete only when all applicable conditions are satisfied:

* functionality works
* TypeScript passes
* build succeeds
* no obvious console errors
* Ant Design is used appropriately
* no unnecessary UI library was added
* no unnecessary dependency was introduced
* existing components were reused where appropriate
* design remains consistent with the product
* spacing is consistent
* typography is consistent
* information density is appropriate
* tables are readable
* forms are clear
* navigation is understandable
* primary actions are obvious
* loading states work
* empty states work
* error states work
* destructive actions are clear
* responsive layout does not break
* keyboard and focus behavior are reasonable
* there is no obvious generic AI-generated appearance
* the actual rendered interface was visually reviewed

Do not consider a task complete merely because the code compiles.

---

# 84. Final Decision Rule

When multiple design solutions are technically valid, choose the one that is:

**simpler, quieter, more compact, clearer, more consistent, and easier to work with.**

When uncertain:

```text
Prefer fewer visual elements.
Prefer existing components.
Prefer existing patterns.
Prefer Ant Design.
Prefer clarity over decoration.
Prefer function over novelty.
```

---

# 85. Final Quality Question

Before finishing any significant frontend task, ask:

> Does this interface feel like a mature working product inspired by Stripe and Linear, implemented consistently with Ant Design?

If the answer is no, continue improving it.
