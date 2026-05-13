# Requirements Document

## Introduction

This feature rewrites the existing TipTap-based rich text editor in the Ashyk Bilim LMS to align with TipTap v3 best practices. The rewrite targets the authoring editor surface (`AuthoringEditor`) and its supporting infrastructure. It also introduces a dedicated **Embed Panel** — a modal dialog triggered by a toolbar button — that allows course authors to embed YouTube videos, Excalidraw diagrams, and tldraw whiteboards directly into lesson content. The result must be production-ready, performant, and accessible for a world-class LMS context.

The existing editor already uses TipTap v3 packages (`@tiptap/core ^3.23.4`, `@tiptap/react ^3.23.4`). The rewrite focuses on adopting the v3 Composable React API (`<Tiptap>` component, `useTiptap`, `useTiptapState`), replacing the legacy `useEditor` + `<EditorContent>` pattern in the authoring surface, and adding the new embed capabilities.

---

## Glossary

- **Editor**: The TipTap-based rich text editor used by course authors to create lesson content.
- **AuthoringEditor**: The full-featured editing surface rendered at `/[locale]/editor/…`, including toolbar, bubble menu, floating plus button, slash command menu, and AI toolkit.
- **Composable API**: TipTap v3's declarative `<Tiptap instance={editor}>` component tree with `useTiptap()` and `useTiptapState()` hooks.
- **Embed Panel**: A modal dialog that lets authors choose and configure an embedded external resource (YouTube, Excalidraw, or tldraw) to insert as a node into the editor.
- **EmbedBlock**: The TipTap node extension that stores and renders an embedded external resource inside the editor document.
- **EmbedType**: One of `youtube`, `excalidraw`, or `tldraw`.
- **NodeView**: A React component registered via `ReactNodeViewRenderer` that renders a TipTap node inside the editor canvas.
- **Toolbar**: The sticky horizontal bar above the editor content area containing formatting controls and insert buttons.
- **BubbleMenu**: The floating inline toolbar that appears when text is selected.
- **SlashCommandMenu**: The command palette triggered by typing `/` at the start of an empty block.
- **useEditorState**: TipTap v3 hook for subscribing to a slice of editor state without causing full re-renders.
- **useTiptapState**: TipTap v3 Composable API hook for subscribing to editor state within a `<Tiptap>` context.
- **ActivityRef**: The minimal typed reference `{ activity_uuid: string; name?: string }` passed to extensions that need activity context.

---

## Requirements

### Requirement 1: Adopt TipTap v3 Composable React API in AuthoringEditor

**User Story:** As a platform engineer, I want the AuthoringEditor to use TipTap v3's Composable API (`<Tiptap>` component, `useTiptap`, `useTiptapState`), so that the editor follows modern best practices, benefits from automatic context management, and is easier to maintain.

#### Acceptance Criteria

1. THE AuthoringEditor SHALL wrap the editor instance in a `<Tiptap instance={editor}>` component tree instead of passing the `editor` prop directly to child components.
2. WHEN the editor is initializing, THE AuthoringEditor SHALL render a `<Tiptap.Loading>` placeholder to prevent layout shift and SSR hydration mismatches.
3. THE AuthoringEditor SHALL use `<Tiptap.Content />` to render the editable content area instead of `<EditorContent editor={editor} />`.
4. THE Toolbar SHALL use `useTiptapState` to subscribe only to the specific editor state slices it needs (bold, italic, heading level, etc.), so that unrelated state changes do not trigger full toolbar re-renders.
5. THE BubbleMenu SHALL be rendered as `<Tiptap.BubbleMenu>` or use `useTiptap()` to access the editor instance without prop drilling.
6. THE useEditorInstance hook SHALL continue to call `useEditor` with `immediatelyRender: false` to prevent SSR rendering issues in the Next.js App Router environment.
7. WHEN the editor is destroyed or the component unmounts, THE Editor SHALL clean up all ProseMirror plugins and event listeners without memory leaks.

---

### Requirement 2: Isolate Editor Rendering for Performance

**User Story:** As a platform engineer, I want the editor component tree to be isolated from unrelated parent state changes, so that typing and formatting remain smooth even when surrounding UI (save state indicator, AI panel toggle) updates.

#### Acceptance Criteria

1. THE AuthoringEditor SHALL isolate the `useEditor` call and `<Tiptap>` tree in a dedicated inner component so that parent state changes (e.g., `saveState`, `isAIOpen`) do not cause the editor to re-render.
2. THE Toolbar SHALL use `useTiptapState` (or `useEditorState`) selectors that return only primitive or shallow-comparable values, so that the toolbar re-renders only when the selected state actually changes.
3. WHEN `onContentChange` is called from the editor's `onUpdate` callback, THE Editor SHALL schedule the update via `queueMicrotask` to avoid the React `flushSync` warning.
4. THE EditorToolbar SHALL NOT re-render when the AI panel open/close state changes.

---

### Requirement 3: Embed Panel — Trigger and Dialog

**User Story:** As a course author, I want a dedicated "Embed" button in the editor toolbar that opens a modal panel, so that I can choose and configure an external embed (YouTube, Excalidraw, or tldraw) to insert into my lesson.

#### Acceptance Criteria

1. THE Toolbar SHALL include an "Embed" button in the `media` insert group that opens the Embed Panel dialog.
2. WHEN the Embed Panel button is clicked, THE EmbedPanel SHALL open as a modal dialog rendered above the editor content.
3. THE EmbedPanel SHALL display three embed type options: YouTube, Excalidraw, and tldraw.
4. WHEN an embed type is selected and confirmed, THE EmbedPanel SHALL close and THE Editor SHALL insert an EmbedBlock node at the current cursor position.
5. IF the author dismisses the Embed Panel without selecting an embed type, THEN THE Editor SHALL remain unchanged.
6. THE EmbedPanel SHALL be keyboard-navigable and meet WCAG 2.1 AA focus management requirements (focus trap inside dialog, Escape key closes dialog, focus returns to trigger button on close).

---

### Requirement 4: YouTube Embed Type

**User Story:** As a course author, I want to embed a YouTube video by pasting its URL into the Embed Panel, so that students can watch the video directly within the lesson without leaving the page.

#### Acceptance Criteria

1. WHEN the YouTube embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field for the YouTube video URL.
2. WHEN a valid YouTube URL is submitted, THE EmbedPanel SHALL render a live preview of the video using the `@next/third-parties/google` `YouTubeEmbed` component before insertion, and WHEN the author confirms, THE EmbedBlock SHALL store the video ID extracted from the URL and render the video in the NodeView.
3. IF an invalid, non-YouTube, or empty URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error and SHALL NOT insert the node.
4. THE YouTube NodeView SHALL render the video in a responsive 16:9 aspect-ratio container with rounded corners.
5. WHEN the editor is in read-only (interactive/viewing) mode, THE YouTube NodeView SHALL render the video player without edit controls.

---

### Requirement 5: Excalidraw Embed Type

**User Story:** As a course author, I want to embed an Excalidraw whiteboard into a lesson, so that students can view or interact with diagrams created in Excalidraw.

#### Acceptance Criteria

1. WHEN the Excalidraw embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field for the Excalidraw share link.
2. WHEN a valid Excalidraw share URL (matching `excalidraw.com` hostname) is submitted, THE EmbedBlock SHALL store the URL and render an `<iframe>` pointing to the Excalidraw embed endpoint inside the NodeView.
3. IF an invalid URL, a URL from a non-Excalidraw hostname, or an empty URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error and SHALL NOT insert the node.
4. THE Excalidraw NodeView SHALL render the iframe in a resizable container with a default height of 500px and width of 100%.
5. WHEN the editor is in authoring mode, THE Excalidraw NodeView SHALL display an overlay toolbar with edit (re-open panel) and delete controls.
6. THE Excalidraw component SHALL be loaded via Next.js dynamic import with `ssr: false` to prevent server-side rendering errors.

---

### Requirement 6: tldraw Embed Type

**User Story:** As a course author, I want to embed a tldraw whiteboard into a lesson, so that students can view or interact with diagrams created in tldraw.

#### Acceptance Criteria

1. WHEN the tldraw embed type is selected in the Embed Panel, THE EmbedPanel SHALL display a URL input field for the tldraw share link.
2. WHEN a valid tldraw share URL (matching `tldraw.com` hostname) is submitted, THE EmbedBlock SHALL store the URL and render an `<iframe>` pointing to the tldraw embed endpoint inside the NodeView.
3. IF an invalid URL, a URL from a non-tldraw hostname, or an empty URL is submitted, THEN THE EmbedPanel SHALL display an inline validation error and SHALL NOT insert the node.
4. THE tldraw NodeView SHALL render the iframe in a resizable container with a default height of 500px and width of 100%.
5. WHEN the editor is in authoring mode, THE tldraw NodeView SHALL display an overlay toolbar with edit (re-open panel) and delete controls.

---

### Requirement 7: EmbedBlock Node Extension

**User Story:** As a platform engineer, I want a single, well-typed TipTap node extension (`EmbedBlock`) that stores all embed types (YouTube, Excalidraw, tldraw), so that the document schema is consistent and serialization is reliable.

#### Acceptance Criteria

1. THE EmbedBlock extension SHALL define a `type` attribute accepting values `youtube`, `excalidraw`, or `tldraw`, with a default of `null`.
2. THE EmbedBlock extension SHALL define a `url` attribute storing the embed URL, with a default of `null`.
3. THE EmbedBlock extension SHALL define `width` and `height` attributes for the rendered container dimensions, with defaults of `"100%"` and `500` respectively.
4. THE EmbedBlock extension SHALL expose an `insertEmbedBlock` command that inserts a new EmbedBlock node at the current cursor position.
5. THE EmbedBlock extension SHALL expose an `updateEmbedBlock` command that updates the attributes of the EmbedBlock node at a given position.
6. THE EmbedBlock extension SHALL implement `parseHTML` and `renderHTML` so that the node round-trips correctly through HTML serialization.
7. FOR ALL valid EmbedBlock nodes, serializing to HTML and then parsing back SHALL produce an equivalent node (round-trip property).

---

### Requirement 8: EmbedBlock NodeView — Resizing

**User Story:** As a course author, I want to resize an embedded block by dragging its handles, so that I can control how much vertical space the embed occupies in the lesson layout.

#### Acceptance Criteria

1. WHEN the editor is in authoring mode, THE EmbedBlock NodeView SHALL display resize handles on the bottom edge of the container.
2. WHEN a resize handle is dragged, THE EmbedBlock NodeView SHALL update the container height in real time during the drag.
3. WHEN the drag ends, THE EmbedBlock NodeView SHALL persist the new height by calling `updateAttributes({ height })`.
4. THE EmbedBlock NodeView SHALL enforce a minimum height of 200px and a maximum height of 1200px; WHEN a drag ends beyond these bounds, THE NodeView SHALL clamp the persisted height to the nearest limit.
5. WHEN the editor is in read-only mode, THE EmbedBlock NodeView SHALL NOT display resize handles.

---

### Requirement 9: Slash Command Integration

**User Story:** As a course author, I want to insert an embed block via the slash command menu by typing `/embed`, so that I can stay in keyboard-driven flow without reaching for the toolbar.

#### Acceptance Criteria

1. THE SlashCommandMenu SHALL include an "Embed" entry that, when selected, opens the Embed Panel dialog.
2. WHEN the "Embed" slash command is executed, THE SlashCommand extension SHALL delete the `/embed` text from the document before opening the Embed Panel.
3. THE Embed slash command entry SHALL display a descriptive label and icon consistent with the toolbar insert button.

---

### Requirement 10: Backward Compatibility — Existing EmbedObjects Nodes

**User Story:** As a platform engineer, I want existing lesson documents that contain `blockEmbed` nodes (from the old `EmbedObjects` extension) to continue rendering correctly, so that no content is lost during the migration.

#### Acceptance Criteria

1. THE editor-kernel SHALL continue to register the legacy `EmbedObjects` extension alongside the new `EmbedBlock` extension during a migration period.
2. WHEN a document containing a `blockEmbed` node is loaded, THE Editor SHALL render it using the existing `EmbedObjectsComponent` NodeView without errors.
3. THE new `EmbedBlock` extension SHALL use a distinct node name (`embedBlock`) that does not conflict with the legacy `blockEmbed` node name.

---

### Requirement 11: Internationalization

**User Story:** As a platform engineer, I want all user-facing strings in the Embed Panel and EmbedBlock NodeView to be defined in the i18n message files, so that the feature supports English, Russian, and Kazakh locales.

#### Acceptance Criteria

1. THE EmbedPanel SHALL use `useTranslations('DashPage.Editor.EmbedPanel')` for all user-facing strings.
2. THE EmbedBlock NodeView SHALL use `useTranslations('DashPage.Editor.EmbedPanel')` for overlay toolbar labels.
3. THE en-US, ru-RU, and kk-KZ message files SHALL each contain a `DashPage.Editor.EmbedPanel` section with keys for: dialog title, embed type labels (YouTube, Excalidraw, tldraw), URL input placeholder, validation error messages, insert button label, cancel button label, edit button label, and delete button label.
4. THE Toolbar insert button for the Embed Panel SHALL use the existing `DashPage.Editor.Toolbar` namespace key `externalObject` (already defined as "External Object (Embed)") or a new dedicated key.

---

### Requirement 12: Accessibility

**User Story:** As a student or course author using assistive technology, I want the editor toolbar and embed panel to be fully keyboard-navigable and screen-reader-friendly, so that the LMS is inclusive.

#### Acceptance Criteria

1. THE Toolbar SHALL have `role="toolbar"` and an `aria-label` attribute.
2. THE Embed Panel dialog SHALL have `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` pointing to the dialog title.
3. WHEN the Embed Panel opens, THE EmbedPanel SHALL move focus to the first interactive element inside the dialog.
4. WHEN the Embed Panel is open, THE EmbedPanel SHALL trap focus within the dialog so that Tab and Shift+Tab cycle only through dialog elements; IF focus somehow escapes to elements outside the dialog, THE EmbedPanel SHALL immediately return focus to the dialog.
5. WHEN the Escape key is pressed while the Embed Panel is open, THE EmbedPanel SHALL close and return focus to the toolbar button that triggered it.
6. THE EmbedBlock NodeView overlay toolbar buttons SHALL each have an `aria-label` describing their action.
