import ScenariosExtension from './ScenariosExtension';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';

export default Node.create({
  name: 'scenarios',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      title: {
        // Keep the node defaults neutral so translations are provided
        // from the React NodeView (ScenariosExtension) which can use
        // the i18n/translations system.
        default: '',
      },
      scenarios: {
        // No hard-coded scenario content here. The editor NodeView
        // (ScenariosExtension) will populate scenarios and render localized
        // default text via the translations system.
        default: [],
      },
      currentScenarioId: {
        // Default to the first scenario id when scenarios are provided
        // from the node view. Use '1' as a neutral placeholder.
        default: '1',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'scenarios-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['scenarios-block', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ScenariosExtension);
  },
});
