---
name: uet-academic-ui
description: Design system and anti-AI-slop UI/UX standard for UET PhDHub (Hệ thống Quản lý Nghiên cứu sinh — Trường ĐH Công nghệ, ĐHQGHN). Preserves authentic UET blue top-header identity from fit-uet with airy spacing, radical text minimalism, Popover filter bars, Radix primitives, TanStack Table v8, Sonner toasts, and cmdk quick search.
---

# UET PhDHub — Institutional Academic UI Standard

## 1. Core Aesthetic Philosophy (Anti-AI-Slop & Anti-Clutter)
- **Authentic UET Top Chrome (from `fit-uet`)**: Compact official UET blue gradient top bar (`linear-gradient(110deg, #064889 0%, #075fc7 62%, #1473e6 100%)`, `h-14`) with the crisp circular UET emblem (`logo_uet.webp`, `w-9 h-9 rounded-full bg-white`) paired with 2 lines of real crisp HTML text (`ĐẠI HỌC QUỐC GIA HÀ NỘI` / `TRƯỜNG ĐẠI HỌC CÔNG NGHỆ`) — never blurry rasterized wordmarks, English subtitle lines, or extra app subtitle text in the header — plus a single 40px crisp white horizontal underline nav bar (`max-w-7xl mx-auto`). **NO** 240px left sidebar, **NO** breadcrumb trails, **NO** split dark-navy SaaS marketing login screens.
- **Radical Text Restraint**:
  - One page title once; **zero** repeating descriptive subtitles under headings.
  - **Zero** explanatory helper paragraphs next to form groups.
  - **Zero** filler text inside stat cards or table cells (e.g. show `1 / 9 · 50g`, not `ĐL 0 · C 2 · P 0 · Đ 0` in every row; hide empty zero rows by default).
- **Popover Filters (`fit-uet CampaignListToolbar` pattern)**:
  - Table toolbars show **1 Search input + 1 `Bộ lọc` (`FilterPopover`) button** with active count badge and compact removable chips — never stretch 5–6 `<select>` dropdowns horizontally across the screen.
- **Color Restraint**:
  - Neutral light canvas `#f8fafc`, crisp white `#ffffff` surfaces, `1px solid #e2e8f0` hairlines.
  - UET Blue `#034ea1` strictly for header brand, primary CTA, active tab underline, links, and focus rings.
  - Semantic accents (`emerald`, `amber`, `rose`) reserved for status dots, urgent/overdue deadlines, and confidential PBĐL markers.

## 2. Production Interaction Stack
- **Tables**: `@tanstack/react-table` v8 (`DataTable`) with sorting, column visibility menu (`Cột`), quiet pagination, click-row slide-over Quick Drawer.
- **Overlays**: `@radix-ui/react-dialog` (`Modal`, `Drawer`, `ConfirmDialog`) and `@radix-ui/react-dropdown-menu`. Never use `window.confirm()` or `window.alert()`.
- **Global Search**: `cmdk` (`Ctrl+K`) jumping directly to PhD dossiers, scientists, or routes.
- **Feedback**: `sonner` bottom-right toasts (`duration={2200}`), `DD/MM/YYYY` tabular dates, 1-click copy for codes and payment details (CCCD / MST / STK).

## 3. Confidentiality UX Invariants
- Independent Review (**PBĐL**) tabs, columns, and export actions carry a `Lock` icon and subtle amber indicator, and are strictly stripped at the API layer for `phd_student` and `supervisor`.
- Scientist financial fields (CCCD, MST, Bank Account) are hidden by default in the table (`Cột` toggleable) and accessible with 1-click copy inside the Slide-over Drawer for Phòng CTSV.
