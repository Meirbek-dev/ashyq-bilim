import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import FlipcardExtension from './FlipcardExtension';

export default Node.create({
  name: 'flipcard',
  group: 'block',
  // Dragging interactive NodeViews often causes selection/hover flicker.
  // Keep this false; if dragging is needed, add a dedicated drag handle instead.
  draggable: false,
  // Avoid node selection flicker on hover/mousemove
  selectable: false,
  content: 'text*',

  addAttributes() {
    return {
      question: {
        default: 'Click to reveal the answer',
      },
      answer: {
        default: 'This is the answer',
      },
      color: {
        default: 'blue',
      },
      alignment: {
        default: 'center',
      },
      size: {
        default: 'medium',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'flipcard-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['flipcard-block', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlipcardExtension);
  },
});
