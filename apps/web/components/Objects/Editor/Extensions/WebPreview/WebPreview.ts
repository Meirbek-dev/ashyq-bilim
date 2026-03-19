import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';

import WebPreviewComponent from './WebPreviewComponent';

const WebPreview = Node.create({
  name: 'blockWebPreview',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      og_image: { default: null },
      favicon: { default: null },
      og_type: { default: null },
      og_url: { default: null },
      alignment: { default: 'left' },
      buttonLabel: { default: 'Посетить сайт' },
      showButton: { default: false },
      openInPopup: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'web-preview' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['web-preview', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WebPreviewComponent);
  },
});

export default WebPreview;
