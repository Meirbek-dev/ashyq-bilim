import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';

import WarningCalloutComponent from './WarningCalloutComponent';

export default Node.create({
  name: 'calloutWarning',
  group: 'block',
  draggable: true,
  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'callout-warning',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['callout-warning', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(WarningCalloutComponent, {
      contentDOMElementTag: 'div',
    });
  },
});
