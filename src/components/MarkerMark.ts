import { Mark, mergeAttributes } from '@tiptap/core'

/** Highlights text tied to a marker: `setup` where it is planted, `payoff` where it fires. */
export const MarkerMark = Mark.create({
  name: 'marker',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-marker'),
        renderHTML: (attrs) => ({ 'data-marker': attrs.id }),
      },
      role: {
        default: 'setup',
        parseHTML: (el) => el.getAttribute('data-role'),
        renderHTML: (attrs) => ({ 'data-role': attrs.role }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-marker]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'mk' }), 0]
  },
})
