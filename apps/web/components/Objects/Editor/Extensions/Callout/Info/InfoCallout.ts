import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';

import InfoCalloutComponent from './InfoCalloutComponent';

export default Node.create({
  name: 'calloutInfo',
  group: 'block',
  draggable: true,
  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'callout-info',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['callout-info', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(InfoCalloutComponent, {
      contentDOMElementTag: 'div',
    });
  },
});
