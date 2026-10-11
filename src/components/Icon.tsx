/** Thin line icons, drawn to match the sans-serif UI. */
const PATHS: Record<string, string> = {
  now: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  plan: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  markers: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3ZM19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8L19 17Z',
  inbox: 'M3 13l3-8h12l3 8v6H3v-6Zm0 0h5l1.5 2.5h5L16 13h5',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z',
  pen: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5',
  note: 'M5 4h14v12l-4 4H5V4Zm10 16v-4h4M8 9h8M8 13h5',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11M9 8h6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01',
  people: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-6 10a6 6 0 0 1 12 0M16 3.5a4 4 0 0 1 0 7.5M21 21a6 6 0 0 0-3.5-5.5',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  panel: 'M4 4h16v16H4V4Zm5 0v16',
  sidebar: 'M4 4h16v16H4V4Zm11 0v16',
  focus: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.5M12 12h.5M19 12h.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2',
  down: 'm6 9 6 6 6-6',
  right: 'm9 6 6 6-6 6',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  swap: 'M4 8h14l-3-3M20 16H6l3 3',
  quote: 'M7 10h3v6H5v-4c0-3 1-5 4-6M16 10h3v6h-5v-4c0-3 1-5 4-6',
  cut: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7.5 20 19M8.5 16.5 20 5',
  key: 'M12 3l9 9-9 9-9-9 9-9Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  type: 'M5 7V5h14v2M12 5v14M9 19h6',
  keyboard: 'M3 6h18v12H3V6Zm4 4h.5M11 10h.5M15 10h.5M8 14h8',
  spark: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3Z',
}

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="ico"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
